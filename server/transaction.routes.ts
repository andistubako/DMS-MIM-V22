import { Router, Request, Response } from "express";
import { authMiddleware, requireRoles, AuthenticatedRequest } from "./auth.js";
import { idempotencyMiddleware } from "./idempotency.middleware.js";
import {
  deductInventoryAtomic,
  restoreInventoryAtomic,
  InsufficientStockError,
  StockDeductionItem,
} from "./atomicInventory.service.js";
import {
  fetchTransactionById,
  saveTransactionToFirestore,
  updateTransactionStatusInFirestore,
  queryTransactionsFromFirestore,
  fetchSkuByIdFromFirestore,
  fetchAllActiveSkusFromFirestore,
  queryWarehouseStocksFromFirestore,
  convertToBaseUnit,
  TransactionRecord,
  TransactionItem,
} from "./persistence.js";
import { db } from "./data.js";

const router = Router();

function generateDurableInvoiceNumber(idempotencyKey?: string): string {
  const dateStr = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const suffix = String(idempotencyKey || `${Date.now()}-${Math.floor(Math.random() * 1000000)}`)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-8)
    .toUpperCase();
  return `INV/${dateStr}/${suffix}`;
}

/**
 * Helper to process order items:
 * - Validates each item
 * - Resolves SKU details from Firestore SSOT
 * - Converts ordered quantity from custom UOM to Base Unit
 * - Prepares stock deduction payload and transaction line items
 */
async function processOrderItems(
  rawItems: any[]
): Promise<{
  processedItems: TransactionItem[];
  stockDeductionItems: StockDeductionItem[];
  subtotal: number;
  discountTotal: number;
}> {
  if (!Array.isArray(rawItems) || rawItems.length === 0) {
    throw new Error("Minimal satu item produk wajib disertakan.");
  }

  const processedItems: TransactionItem[] = [];
  const stockDeductionItems: StockDeductionItem[] = [];
  let subtotal = 0;
  let discountTotal = 0;

  for (const raw of rawItems) {
    const skuId = String(raw.sku_id || raw.skuId || raw._id || "").trim();
    const orderedQty = Number(raw.quantity ?? raw.qty ?? raw.volume ?? 0);
    const requestedUom = raw.uom || raw.unit;
    const discount = Number(raw.discount_amount ?? raw.discount ?? 0);

    if (!skuId) {
      throw new Error("ID SKU wajib diisi pada setiap item.");
    }
    if (!Number.isInteger(orderedQty) || orderedQty <= 0) {
      throw new Error(`Kuantitas untuk SKU '${skuId}' harus bilangan bulat positif.`);
    }
    if (discount < 0) {
      throw new Error(`Diskon untuk SKU '${skuId}' tidak boleh bernilai negatif.`);
    }

    // 1. Fetch SKU from Firestore SSOT (fallback to memory cache if network warm-up)
    let sku = await fetchSkuByIdFromFirestore(skuId);
    if (!sku) {
      sku = (db.skus || []).find((s) => s._id === skuId || s.code === skuId) as any;
    }
    if (!sku) {
      throw new Error(`SKU dengan ID '${skuId}' tidak ditemukan di database.`);
    }
    if (sku.status !== "ACTIVE") {
      throw new Error(`SKU '${sku.name}' (${sku.code}) berstatus non-aktif.`);
    }

    // 2. Resolve pricing
    let unitPrice = Number(raw.unit_price ?? raw.unitPrice ?? 0);
    if (unitPrice <= 0) {
      const priceDoc = (db.prices || []).find((p) => p.sku_id === sku!._id && p.status === "ACTIVE");
      unitPrice = Number(priceDoc?.price || sku.base_price || sku.price || 0);
    }
    if (unitPrice < 0) {
      throw new Error(`Harga untuk SKU '${sku.name}' tidak valid.`);
    }

    // 3. Convert ordered UOM to Base Unit
    const conversion = convertToBaseUnit(sku, orderedQty, requestedUom);

    const lineGross = orderedQty * unitPrice;
    const lineTotal = Math.max(0, lineGross - discount);
    subtotal += lineTotal;
    discountTotal += discount;

    const resolvedCode = (sku as any).code || (sku as any).sku_code || (sku as any).skuCode || sku._id || "-";
    const resolvedName = (sku as any).name || (sku as any).sku_name || (sku as any).skuName || "-";

    // Line item for transaction invoice
    processedItems.push({
      sku_id: sku._id,
      sku_code: resolvedCode,
      sku_name: resolvedName,
      product_id: sku.product_id,
      uom: conversion.resolvedUom,
      unit: conversion.resolvedUom,
      quantity: orderedQty,
      base_quantity: conversion.baseQty,
      conversion_factor: conversion.conversionFactor,
      unit_price: unitPrice,
      discount_amount: discount,
      line_total: lineTotal,
      subtotal: lineTotal,
    });

    // Deduction item for atomic stock management (always in base unit)
    stockDeductionItems.push({
      skuId: sku._id,
      skuCode: resolvedCode,
      skuName: resolvedName,
      requestedQty: conversion.baseQty,
      uom: conversion.resolvedUom,
      baseUom: conversion.baseUom,
      unitPrice,
      discountAmount: discount,
      lineTotal,
    });
  }

  return {
    processedItems,
    stockDeductionItems,
    subtotal,
    discountTotal,
  };
}

/**
 * GET /api/transactions/sku-list
 * Returns active SKUs with live warehouse & sales stock balances from Firestore
 */
router.get("/sku-list", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const salesmanId = req.user?.role === "SALES" ? req.user._id : (req.query.salesman_id as string) || req.user?._id || "";
    const warehouseId = (req.query.warehouse_id as string) || req.user?.office_id || "off-1";

    // 1. Fetch active SKUs from Firestore SSOT
    let activeSkus = await fetchAllActiveSkusFromFirestore();
    if (activeSkus.length === 0 && db.skus) {
      activeSkus = (db.skus || []).filter((s) => s.status === "ACTIVE") as any;
    }

    // 2. Fetch stock balances from Firestore
    const [warehouseStocks, salesStocks] = await Promise.all([
      queryWarehouseStocksFromFirestore(warehouseId),
      salesmanId ? queryWarehouseStocksFromFirestore(salesmanId) : Promise.resolve([]),
    ]);

    const whMap = new Map<string, number>();
    for (const s of warehouseStocks) {
      whMap.set(s.sku_id, Number(s.available_quantity ?? s.quantity ?? s.stock_on_hand ?? 0));
    }

    const salesMap = new Map<string, number>();
    for (const s of salesStocks) {
      salesMap.set(s.sku_id, Number(s.available_quantity ?? s.quantity ?? s.stock_on_hand ?? 0));
    }

    const items = activeSkus.map((sku) => {
      const prc = (db.prices || []).find((p) => p.sku_id === sku._id && p.status === "ACTIVE");
      const prd = (db.products || []).find((p) => p._id === sku.product_id);

      const whQty = whMap.get(sku._id) ?? 0;
      const salesQty = salesMap.get(sku._id) ?? 0;
      const effectiveStock = salesQty > 0 ? salesQty : whQty;

      return {
        _id: sku._id,
        sku_id: sku._id,
        name: sku.name,
        sku_code: sku.code,
        sku_name: sku.name,
        product_name: prd?.name || "-",
        unit: sku.uom || sku.unit || "Unit",
        uom: sku.uom || sku.unit || "Unit",
        price: prc?.price || sku.base_price || sku.price || 0,
        warehouse_stock: whQty,
        sales_stock: salesQty,
        available_stock: effectiveStock,
        stock_on_hand: effectiveStock,
      };
    });

    res.json({ items, total: items.length });
  } catch (err: any) {
    console.error("[Transaction] Error fetching SKU list:", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", detail: err?.message || "Gagal memuat daftar SKU." });
  }
});

/**
 * POST /api/transactions/post-atomic
 * Core atomic sale posting using Firestore SSOT & Idempotency
 */
router.post(
  "/post-atomic",
  authMiddleware,
  requireRoles("SALES", "SUPERVISOR", "ADMIN", "OWNER"),
  idempotencyMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = req.body || {};
      const salesmanId = req.user!.role === "SALES" ? req.user!._id : String(body.salesman_id || req.user!._id);
      if (!salesmanId) {
        return res.status(400).json({ error: "VALIDATION_ERROR", detail: "Salesman wajib ditentukan." });
      }

      const outletId = String(body.outlet_id || "").trim();
      if (!outletId) {
        return res.status(400).json({ error: "VALIDATION_ERROR", detail: "Outlet wajib dipilih." });
      }

      // Check outlet existence & status
      const outlet = (db.outlets || []).find((o) => o._id === outletId);

      // Process items and convert to base unit
      const { processedItems, stockDeductionItems, subtotal, discountTotal } = await processOrderItems(body.items);

      // Determine stock deduction location
      const warehouseId = body.warehouse_id || body.office_id || req.user?.office_id || "off-1";
      const locationType: "WAREHOUSE" | "SALES" = body.location_type === "SALES" ? "SALES" : "WAREHOUSE";
      const locationId = locationType === "SALES" ? salesmanId : warehouseId;

      const idempotencyKey = (req.headers["x-idempotency-key"] as string) || body.idempotency_key;
      const invoiceNumber = String(body.invoice_number || "").trim() || generateDurableInvoiceNumber(idempotencyKey);

      // Execute ACID stock deduction in Cloud Firestore
      await deductInventoryAtomic({
        locationType,
        locationId,
        items: stockDeductionItems,
        referenceId: invoiceNumber,
        referenceType: "SALES_ORDER",
        performedByUserId: salesmanId,
      });

      // Assemble transaction document
      const nowStr = new Date().toISOString();
      const transactionRecord: TransactionRecord = {
        _id: invoiceNumber,
        id: invoiceNumber,
        invoice_number: invoiceNumber,
        client_order_id: idempotencyKey,
        salesman_id: salesmanId,
        salesman_name: req.user?.name || "Salesman",
        outlet_id: outletId,
        outlet_name: outlet?.outlet_name || (outlet as any)?.name || body.outlet_name || "Outlet",
        warehouse_id: warehouseId,
        office_id: req.user?.office_id || warehouseId,
        order_status: "CONFIRMED",
        status: "CONFIRMED",
        payment_status: "UNPAID",
        payment_method: body.transaction_type || body.payment_method || "CASH",
        items: processedItems,
        subtotal,
        total_discount: discountTotal,
        discount_total: discountTotal,
        tax_amount: 0,
        total_amount: subtotal,
        notes: body.notes || "",
        visit_id: body.visit_id ? String(body.visit_id) : undefined,
        latitude: body.latitude != null ? Number(body.latitude) : undefined,
        longitude: body.longitude != null ? Number(body.longitude) : undefined,
        created_at: nowStr,
        updated_at: nowStr,
        created_by: req.user?._id,
      };

      // Persist transaction to Firestore SSOT
      await saveTransactionToFirestore(transactionRecord);

      // Update in-memory reflection if available
      if (Array.isArray(db.transactions)) {
        const existingIdx = db.transactions.findIndex((t) => t.invoice_number === invoiceNumber);
        if (existingIdx >= 0) db.transactions[existingIdx] = transactionRecord as any;
        else db.transactions.unshift(transactionRecord as any);
      }

      return res.status(201).json({
        message: "Transaksi berhasil diposting secara atomic ke Cloud Firestore.",
        replayed: false,
        transaction: transactionRecord,
      });
    } catch (err: any) {
      if (err instanceof InsufficientStockError || err?.name === "InsufficientStockError") {
        console.warn(`[Transaction] Insufficient stock error: ${err.message}`);
        return res.status(400).json({
          error: "INSUFFICIENT_STOCK",
          detail: err.message,
          sku_id: err.skuId,
          sku_code: err.skuCode,
          sku_name: err.skuName,
          current_stock: err.currentStock,
          requested_qty: err.requestedQty,
        });
      }

      // Check if validation error
      if (
        err?.message?.includes("wajib") ||
        err?.message?.includes("tidak ditemukan") ||
        err?.message?.includes("tidak valid") ||
        err?.message?.includes("positif")
      ) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          detail: err.message,
        });
      }

      console.error("[Transaction] Internal transaction processing failure:", err);
      return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        detail: err?.message || "Terjadi kesalahan internal server saat memproses transaksi.",
      });
    }
  }
);

/**
 * POST /api/transactions
 * Standard sale creation endpoint used by web and mobile field apps
 */
router.post(
  "/",
  authMiddleware,
  requireRoles("SALES", "SUPERVISOR", "ADMIN", "OWNER"),
  idempotencyMiddleware,
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const body = req.body || {};
      const salesmanId = req.user!.role === "SALES" ? req.user!._id : String(body.salesman_id || req.user!._id);
      if (!salesmanId) {
        return res.status(400).json({ error: "VALIDATION_ERROR", detail: "Salesman wajib ditentukan." });
      }

      const outletId = String(body.outlet_id || "").trim();
      if (!outletId) {
        return res.status(400).json({ error: "VALIDATION_ERROR", detail: "Outlet wajib dipilih." });
      }

      const outlet = (db.outlets || []).find((o) => o._id === outletId);
      const { processedItems, stockDeductionItems, subtotal, discountTotal } = await processOrderItems(body.items);

      const warehouseId = body.warehouse_id || body.office_id || req.user?.office_id || "off-1";
      const locationType: "WAREHOUSE" | "SALES" = body.location_type === "SALES" ? "SALES" : "WAREHOUSE";
      const locationId = locationType === "SALES" ? salesmanId : warehouseId;

      const idempotencyKey = (req.headers["x-idempotency-key"] as string) || body.idempotency_key;
      const invoiceNumber = String(body.invoice_number || "").trim() || generateDurableInvoiceNumber(idempotencyKey);

      await deductInventoryAtomic({
        locationType,
        locationId,
        items: stockDeductionItems,
        referenceId: invoiceNumber,
        referenceType: "SALES_ORDER",
        performedByUserId: salesmanId,
      });

      const nowStr = new Date().toISOString();
      const transactionRecord: TransactionRecord = {
        _id: invoiceNumber,
        id: invoiceNumber,
        invoice_number: invoiceNumber,
        client_order_id: idempotencyKey,
        salesman_id: salesmanId,
        salesman_name: req.user?.name || "Salesman",
        outlet_id: outletId,
        outlet_name: outlet?.outlet_name || (outlet as any)?.name || body.outlet_name || "Outlet",
        warehouse_id: warehouseId,
        office_id: req.user?.office_id || warehouseId,
        order_status: "CONFIRMED",
        status: "CONFIRMED",
        payment_status: "UNPAID",
        payment_method: body.transaction_type || body.payment_method || "CASH",
        items: processedItems,
        subtotal,
        total_discount: discountTotal,
        discount_total: discountTotal,
        tax_amount: 0,
        total_amount: subtotal,
        notes: body.notes || "",
        visit_id: body.visit_id ? String(body.visit_id) : undefined,
        latitude: body.latitude != null ? Number(body.latitude) : undefined,
        longitude: body.longitude != null ? Number(body.longitude) : undefined,
        created_at: nowStr,
        updated_at: nowStr,
        created_by: req.user?._id,
      };

      await saveTransactionToFirestore(transactionRecord);

      if (Array.isArray(db.transactions)) {
        const existingIdx = db.transactions.findIndex((t) => t.invoice_number === invoiceNumber);
        if (existingIdx >= 0) db.transactions[existingIdx] = transactionRecord as any;
        else db.transactions.unshift(transactionRecord as any);
      }

      return res.status(201).json(transactionRecord);
    } catch (err: any) {
      if (err instanceof InsufficientStockError || err?.name === "InsufficientStockError") {
        return res.status(400).json({
          error: "INSUFFICIENT_STOCK",
          detail: err.message,
          sku_id: err.skuId,
          sku_code: err.skuCode,
          sku_name: err.skuName,
          current_stock: err.currentStock,
          requested_qty: err.requestedQty,
        });
      }

      if (
        err?.message?.includes("wajib") ||
        err?.message?.includes("tidak ditemukan") ||
        err?.message?.includes("tidak valid") ||
        err?.message?.includes("positif")
      ) {
        return res.status(400).json({
          error: "VALIDATION_ERROR",
          detail: err.message,
        });
      }

      console.error("[Transaction] Error creating order:", err);
      return res.status(500).json({
        error: "INTERNAL_SERVER_ERROR",
        detail: err?.message || "Gagal menyimpan transaksi.",
      });
    }
  }
);

/**
 * GET /api/transactions
 * Query transactions directly from Firestore SSOT
 */
router.get("/", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const { salesman_id, outlet_id, status, payment_status, from_date, to_date, search, limit, offset } =
      req.query as Record<string, string>;

    const targetSalesmanId = req.user!.role === "SALES" ? req.user!._id : salesman_id;

    const result = await queryTransactionsFromFirestore({
      salesman_id: targetSalesmanId,
      outlet_id,
      status,
      payment_status,
      from_date,
      to_date,
      search,
      limit: limit ? parseInt(limit, 10) : 50,
      offset: offset ? parseInt(offset, 10) : 0,
    });

    res.json({
      items: result.items,
      total: result.total,
    });
  } catch (err: any) {
    console.error("[Transaction] Error querying transactions:", err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", detail: err?.message || "Gagal memuat transaksi." });
  }
});

/**
 * GET /api/transactions/:id
 * Retrieve full transaction detail from Firestore SSOT
 */
router.get("/:id", authMiddleware, async (req: AuthenticatedRequest, res: Response) => {
  try {
    const txn = await fetchTransactionById(req.params.id);
    if (!txn) {
      return res.status(404).json({ detail: "Transaksi tidak ditemukan." });
    }

    if (req.user!.role === "SALES" && txn.salesman_id !== req.user!._id) {
      return res.status(403).json({ detail: "Akses ditolak. Anda hanya dapat melihat transaksi milik Anda sendiri." });
    }

    res.json(txn);
  } catch (err: any) {
    console.error(`[Transaction] Error fetching transaction '${req.params.id}':`, err);
    res.status(500).json({ error: "INTERNAL_SERVER_ERROR", detail: err?.message || "Gagal memuat transaksi." });
  }
});

/**
 * POST /api/transactions/:id/cancel
 * Cancel a transaction and reverse deducted inventory back to warehouse/sales
 */
router.post(
  "/:id/cancel",
  authMiddleware,
  requireRoles("SALES", "SUPERVISOR", "ADMIN", "OWNER"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const txn = await fetchTransactionById(req.params.id);
      if (!txn) return res.status(404).json({ detail: "Transaksi tidak ditemukan." });

      if (req.user!.role === "SALES" && txn.salesman_id !== req.user!._id) {
        return res.status(403).json({ detail: "Akses ditolak. Anda hanya dapat membatalkan transaksi Anda sendiri." });
      }

      if (txn.status === "CANCELLED" || txn.order_status === "CANCELLED") {
        return res.status(400).json({ detail: "Transaksi sudah dibatalkan sebelumnya." });
      }

      const { reason } = req.body || {};
      if (!reason) return res.status(400).json({ detail: "Alasan pembatalan transaksi wajib diisi." });

      // Convert transaction items to stock deduction restore items
      const restoreItems: StockDeductionItem[] = (txn.items || []).map((it) => ({
        skuId: it.sku_id,
        skuCode: it.sku_code || "",
        skuName: it.sku_name || "",
        requestedQty: Number(it.base_quantity || it.quantity),
      }));

      const locationId = txn.warehouse_id || txn.salesman_id || "off-1";
      const locationType = txn.warehouse_id ? "WAREHOUSE" : "SALES";

      // Restore inventory atomically
      await restoreInventoryAtomic({
        locationType,
        locationId,
        items: restoreItems,
        referenceId: txn.invoice_number || txn._id,
        reason: String(reason),
        performedByUserId: req.user!._id,
      });

      // Update transaction status in Firestore
      await updateTransactionStatusInFirestore(txn._id, "CANCELLED", {
        cancellation_reason: reason,
        cancelled_at: new Date().toISOString(),
        cancelled_by: req.user!._id,
      });

      const updated = await fetchTransactionById(txn._id);
      res.json({ message: "Transaksi berhasil dibatalkan dan stok telah dikembalikan.", transaction: updated });
    } catch (err: any) {
      console.error("[Transaction] Cancel transaction failed:", err);
      res.status(500).json({ error: "INTERNAL_SERVER_ERROR", detail: err?.message || "Gagal membatalkan transaksi." });
    }
  }
);

/**
 * POST /api/transactions/:id/void
 * Void transaction alias (Supervisor / Admin / Owner)
 */
router.post(
  "/:id/void",
  authMiddleware,
  requireRoles("SUPERVISOR", "ADMIN", "OWNER"),
  async (req: AuthenticatedRequest, res: Response) => {
    try {
      const txn = await fetchTransactionById(req.params.id);
      if (!txn) return res.status(404).json({ detail: "Transaksi tidak ditemukan." });

      if (txn.status === "VOID" || txn.order_status === "VOID") {
        return res.status(400).json({ detail: "Transaksi sudah di-void sebelumnya." });
      }

      const reason = req.body?.reason || "Void by Supervisor/Admin";
      const restoreItems: StockDeductionItem[] = (txn.items || []).map((it) => ({
        skuId: it.sku_id,
        skuCode: it.sku_code || "",
        skuName: it.sku_name || "",
        requestedQty: Number(it.base_quantity || it.quantity),
      }));

      const locationId = txn.warehouse_id || txn.salesman_id || "off-1";
      const locationType = txn.warehouse_id ? "WAREHOUSE" : "SALES";

      await restoreInventoryAtomic({
        locationType,
        locationId,
        items: restoreItems,
        referenceId: txn.invoice_number || txn._id,
        reason: String(reason),
        performedByUserId: req.user!._id,
      });

      await updateTransactionStatusInFirestore(txn._id, "VOID", {
        void_reason: reason,
        voided_at: new Date().toISOString(),
        voided_by: req.user!._id,
      });

      const updated = await fetchTransactionById(txn._id);
      res.json({ message: "Transaksi berhasil di-void dan stok telah dikembalikan.", transaction: updated });
    } catch (err: any) {
      console.error("[Transaction] Void transaction failed:", err);
      res.status(500).json({ error: "INTERNAL_SERVER_ERROR", detail: err?.message || "Gagal melakukan void transaksi." });
    }
  }
);

export default router;

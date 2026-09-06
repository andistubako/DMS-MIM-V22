import { Router } from "express";
import { authMiddleware, requireRoles, AuthenticatedRequest } from "./auth.js";
import {
  postSaleAtomic,
  cancelTransaction,
  queryTransactions,
  getTransactionById,
  getProductEffectiveCallReport,
} from "./inventoryTransaction.service.js";
import { db } from "./data.js";

const router = Router();

function durableInvoiceNumber(idempotencyKey?: string) {
  const suffix = String(idempotencyKey || `${Date.now()}-${Math.floor(Math.random() * 1000000)}`)
    .replace(/[^a-zA-Z0-9]/g, "")
    .slice(-12)
    .toUpperCase();
  return `INV/${new Date().toISOString().slice(0, 10).replace(/-/g, "")}/${suffix}`;
}

/**
 * GET /api/transactions/sku-list
 * Returns active SKUs with available warehouse & sales stock balances
 */
router.get("/sku-list", authMiddleware, (req: AuthenticatedRequest, res) => {
  const salesmanId = req.user?.role === "SALES" ? req.user._id : (req.query.salesman_id as string) || req.user?._id || "";
  const warehouseId = (req.query.warehouse_id as string) || req.user?.office_id || "off-1";

  const skus = (db.skus || []).filter((s) => s.status === "ACTIVE").map((s) => {
    const prc = (db.prices || []).find((p) => p.sku_id === s._id && p.status === "ACTIVE");
    const prd = (db.products || []).find((p) => p._id === s.product_id);

    const salesInv = (db.inventory || []).find(
      (i) => i.location_type === "SALES" && i.location_id === salesmanId && i.sku_id === s._id
    );
    const whInv = (db.inventory || []).find(
      (i) => (i.location_type === "WAREHOUSE" || !i.location_type) &&
             (i.location_id === warehouseId || i.office_id === warehouseId) &&
             i.sku_id === s._id
    );

    const salesStock = salesInv ? (salesInv.available_stock ?? salesInv.stock_on_hand ?? 0) : 0;
    const warehouseStock = whInv ? (whInv.available_stock ?? whInv.stock_on_hand ?? 0) : 0;

    return {
      _id: s._id,
      sku_id: s._id,
      name: s.name,
      sku_code: s.code,
      sku_name: s.name,
      product_name: prd?.name || "-",
      unit: s.unit || "Unit",
      price: prc?.price || (s as any).base_price || (s as any).price || 0,
      sales_stock: salesStock,
      warehouse_stock: warehouseStock,
      stock_on_hand: salesStock > 0 ? salesStock : warehouseStock,
      available_stock: salesStock > 0 ? salesStock : warehouseStock,
    };
  });

  res.json({ items: skus, total: skus.length });
});

/**
 * POST /api/transactions/post-atomic
 * Atomic sale posting via Firestore SSOT
 */
router.post("/post-atomic", authMiddleware, requireRoles("SALES", "SUPERVISOR", "ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body || {};
    const salesmanId = req.user!.role === "SALES" ? req.user!._id : String(body.salesman_id || req.user!._id);
    if (!salesmanId) return res.status(400).json({ detail: "Salesman wajib ditentukan." });

    const idempotencyKey = String(body.idempotency_key || "").trim() || undefined;
    const invoiceNumber = String(body.invoice_number || "").trim() || durableInvoiceNumber(idempotencyKey);

    const result = await postSaleAtomic({
      invoice_number: invoiceNumber,
      salesman_id: salesmanId,
      outlet_id: String(body.outlet_id || ""),
      visit_id: body.visit_id ? String(body.visit_id) : undefined,
      office_id: body.office_id ? String(body.office_id) : undefined,
      transaction_type: body.transaction_type || body.payment_method || "CASH",
      items: Array.isArray(body.items) ? body.items : [],
      notes: body.notes,
      idempotency_key: idempotencyKey,
      latitude: body.latitude != null ? Number(body.latitude) : undefined,
      longitude: body.longitude != null ? Number(body.longitude) : undefined,
    });

    return res.status(result.replayed ? 200 : 201).json({
      message: result.replayed ? "Transaksi sudah pernah diposting." : "Transaksi berhasil diposting secara atomic ke Cloud Firestore.",
      replayed: result.replayed,
      transaction: result.transaction,
    });
  } catch (err: any) {
    console.error("Atomic transaction failed:", err);
    return res.status(400).json({ detail: err?.message || "Transaksi gagal diposting." });
  }
});

/**
 * POST /api/transactions
 * Standard sale creation endpoint used across web & mobile apps
 */
router.post("/", authMiddleware, requireRoles("SALES", "SUPERVISOR", "ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  try {
    const body = req.body || {};
    const salesmanId = req.user!.role === "SALES" ? req.user!._id : String(body.salesman_id || req.user!._id);
    if (!salesmanId) return res.status(400).json({ detail: "Salesman wajib ditentukan." });

    const idempotencyKey = (req.headers["x-idempotency-key"] as string) || body.idempotency_key;
    const invoiceNumber = String(body.invoice_number || "").trim() || durableInvoiceNumber(idempotencyKey);

    const result = await postSaleAtomic({
      invoice_number: invoiceNumber,
      salesman_id: salesmanId,
      outlet_id: String(body.outlet_id || ""),
      visit_id: body.visit_id ? String(body.visit_id) : undefined,
      office_id: body.office_id ? String(body.office_id) : undefined,
      transaction_type: body.transaction_type || body.payment_method || "CASH",
      items: Array.isArray(body.items) ? body.items : [],
      notes: body.notes,
      idempotency_key: idempotencyKey,
      latitude: body.latitude != null ? Number(body.latitude) : undefined,
      longitude: body.longitude != null ? Number(body.longitude) : undefined,
    });

    return res.status(result.replayed ? 200 : 201).json(result.transaction);
  } catch (err: any) {
    console.error("Transaction creation failed:", err);
    return res.status(400).json({ detail: err?.message || "Transaksi gagal disimpan." });
  }
});

/**
 * GET /api/transactions
 * List transactions with filtering & pagination
 */
router.get("/", authMiddleware, (req: AuthenticatedRequest, res) => {
  const { salesman_id, outlet_id, status, payment_status, from_date, to_date, search, limit, offset } = req.query as Record<string, string>;

  // Sales can only query their own transactions unless supervisor/admin/owner
  const targetSalesmanId = req.user!.role === "SALES" ? req.user!._id : salesman_id;

  const result = queryTransactions({
    salesman_id: targetSalesmanId,
    outlet_id,
    status,
    payment_status,
    from_date,
    to_date,
    search,
    limit: limit ? parseInt(limit) : undefined,
    offset: offset ? parseInt(offset) : undefined,
  });

  res.json({
    items: result.items,
    total: result.total,
  });
});

/**
 * GET /api/transactions/ec-product
 * Product Effective Call Report: distinct outlets per product per day
 */
router.get("/ec-product", authMiddleware, requireRoles("SALES", "SUPERVISOR", "ADMIN", "OWNER"), (req: AuthenticatedRequest, res) => {
  const date = String(req.query.date || new Date().toISOString().slice(0, 10));
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return res.status(400).json({ detail: "Format date harus YYYY-MM-DD." });
  }

  const salesmanId = req.user!.role === "SALES" ? req.user!._id : (req.query.salesman_id as string);
  const report = getProductEffectiveCallReport(date, salesmanId);

  res.json({
    date,
    salesman_id: salesmanId || null,
    definition: "EC Product = jumlah outlet unik yang membeli SKU tersebut pada hari yang sama.",
    items: report.items,
    total: report.total,
  });
});

/**
 * GET /api/transactions/:id
 * Retrieve full transaction detail
 */
router.get("/:id", authMiddleware, (req: AuthenticatedRequest, res) => {
  const txn = getTransactionById(req.params.id);
  if (!txn) {
    return res.status(404).json({ detail: "Transaksi tidak ditemukan." });
  }

  if (req.user!.role === "SALES" && txn.salesman_id !== req.user!._id) {
    return res.status(403).json({ detail: "Akses ditolak. Anda hanya dapat melihat transaksi milik Anda sendiri." });
  }

  res.json(txn);
});

/**
 * POST /api/transactions/:id/cancel
 * Cancel a transaction and reverse inventory back to salesman
 */
router.post("/:id/cancel", authMiddleware, requireRoles("SALES", "SUPERVISOR", "ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  try {
    const txn = getTransactionById(req.params.id);
    if (!txn) return res.status(404).json({ detail: "Transaksi tidak ditemukan." });

    if (req.user!.role === "SALES" && txn.salesman_id !== req.user!._id) {
      return res.status(403).json({ detail: "Akses ditolak. Anda hanya dapat membatalkan transaksi milik Anda sendiri." });
    }

    const { reason } = req.body || {};
    if (!reason) return res.status(400).json({ detail: "Alasan pembatalan transaksi wajib diisi." });

    const result = await cancelTransaction(txn._id, req.user!._id, reason);
    res.json({ message: "Transaksi berhasil dibatalkan dan stok telah dikembalikan.", transaction: result.transaction });
  } catch (err: any) {
    console.error("Cancel transaction failed:", err);
    res.status(400).json({ detail: err?.message || "Gagal membatalkan transaksi." });
  }
});

/**
 * POST /api/transactions/:id/void
 * Void transaction alias
 */
router.post("/:id/void", authMiddleware, requireRoles("SUPERVISOR", "ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  try {
    const txn = getTransactionById(req.params.id);
    if (!txn) return res.status(404).json({ detail: "Transaksi tidak ditemukan." });

    const reason = req.body?.reason || "Void by Supervisor/Admin";
    const result = await cancelTransaction(txn._id, req.user!._id, reason);
    res.json({ message: "Transaksi berhasil di-void.", transaction: result.transaction });
  } catch (err: any) {
    res.status(400).json({ detail: err?.message || "Gagal melakukan void transaksi." });
  }
});

export default router;

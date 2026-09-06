import { Router } from "express";
import { authMiddleware, requireRoles, AuthenticatedRequest } from "./auth.js";
import {
  getInventoryList,
  getStockMovements,
  processStockOpname,
  recordStockAdjustment,
  createStockHandover,
  confirmStockHandover,
  createStockReturn,
  confirmStockReturn,
  createStockReceiving,
  postStockReceiving,
  querySalesStockLedgers,
  recordAuditLog,
} from "./inventoryTransaction.service.js";
import { db } from "./data.js";
import { resolveSkuInfo } from "./skuResolver.js";
import { syncSingleDoc, deleteSingleDoc } from "./persistence.js";

const router = Router();

function formatSkuSummary(items: any[]): string {
  if (!items || !items.length) return "-";
  return items
    .map((it) => {
      const info = resolveSkuInfo(it.sku_id || it.skuId);
      return `${it.quantity || 0}x ${info.resolved_name}`;
    })
    .join(", ");
}

// ================= INVENTORY BALANCES & MOVEMENTS =================

/**
 * GET /api/inventory
 */
router.get("/inventory", authMiddleware, (req: AuthenticatedRequest, res) => {
  const { location_type, location_id, sku_id } = req.query as Record<string, string>;
  const result = getInventoryList({
    location_type,
    location_id,
    sku_id,
  });
  res.json(result);
});

/**
 * GET /api/inventory/movements
 */
router.get("/inventory/movements", authMiddleware, (req: AuthenticatedRequest, res) => {
  const { from_date, to_date, sku_id, movement_type, salesman_id } = req.query as Record<string, string>;
  const result = getStockMovements({
    from_date,
    to_date,
    sku_id,
    movement_type,
    salesman_id,
  });
  res.json(result);
});

/**
 * POST /api/inventory/opname
 */
router.post("/inventory/opname", authMiddleware, requireRoles("ADMIN", "OWNER", "WAREHOUSE"), async (req: AuthenticatedRequest, res) => {
  const { warehouse_id, items, notes } = req.body || {};
  if (!warehouse_id || !items || !items.length) {
    return res.status(400).json({ detail: "Warehouse dan item wajib diisi." });
  }

  try {
    const result = await processStockOpname(warehouse_id, items, req.user!._id, notes);
    res.json({ message: "Stock Opname berhasil disimpan ke Cloud Firestore.", total_adjusted: result.totalAdjusted });
  } catch (err: any) {
    console.error("Opname error:", err);
    res.status(400).json({ detail: err.message || "Gagal memproses Stock Opname." });
  }
});

/**
 * POST /api/inventory/adjustments
 */
router.post("/inventory/adjustments", authMiddleware, requireRoles("ADMIN", "OWNER", "WAREHOUSE"), async (req: AuthenticatedRequest, res) => {
  const { warehouse_id, items, adjustment_type, notes } = req.body || {};
  if (!warehouse_id || !items || !items.length || !adjustment_type) {
    return res.status(400).json({ detail: "Semua field wajib diisi." });
  }
  if (!["IN", "OUT"].includes(adjustment_type)) {
    return res.status(400).json({ detail: "Jenis adjustment harus IN atau OUT." });
  }

  try {
    const result = await recordStockAdjustment(warehouse_id, items, adjustment_type, req.user!._id, notes);
    res.json({ message: "Stock Adjustment berhasil disimpan ke Cloud Firestore.", total_adjusted: result.totalAdjusted });
  } catch (err: any) {
    console.error("Adjustment error:", err);
    res.status(400).json({ detail: err.message || "Gagal memproses Stock Adjustment." });
  }
});

// ================= STOCK HANDOVERS (WAREHOUSE -> SALES) =================

/**
 * GET /api/stock/handovers
 */
router.get("/stock/handovers", authMiddleware, (req: AuthenticatedRequest, res) => {
  const { business_date, warehouse_id, salesman_id, status } = req.query as Record<string, string>;
  const targetSalesId = req.user!.role === "SALES" ? req.user!._id : salesman_id;

  let list = db.stock_handovers || [];

  if (business_date) {
    list = list.filter((h) => h.business_date === business_date);
  }
  if (warehouse_id) {
    list = list.filter((h) => h.warehouse_id === warehouse_id);
  }
  if (targetSalesId) {
    list = list.filter((h) => h.salesman_id === targetSalesId);
  }
  if (status) {
    list = list.filter((h) => h.status === status);
  }

  list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const enriched = list.map((h) => {
    const sales = db.users.find((u) => u._id === h.salesman_id);
    const wh = db.offices.find((o) => o._id === h.warehouse_id);
    const prepUser = h.prepared_by ? db.users.find((u) => u._id === h.prepared_by) : null;
    const confUser = h.confirmed_by ? db.users.find((u) => u._id === h.confirmed_by) : null;

    const enrichedItems = (h.items || []).map((it: any) => {
      const skuInfo = resolveSkuInfo(it.sku_id);
      const prc = (db.prices || []).find((p) => p.sku_id === it.sku_id && p.status === "ACTIVE");
      const whInv = (db.inventory || []).find((i) => i.location_id === h.warehouse_id && i.sku_id === it.sku_id);
      const salesInv = (db.inventory || []).find((i) => i.location_id === h.salesman_id && i.sku_id === it.sku_id);

      return {
        ...it,
        sku_code: skuInfo.sku_code || "-",
        sku_name: skuInfo.resolved_name,
        unit: skuInfo.uom || "Unit",
        price: prc?.price || 0,
        warehouse_available_stock: whInv ? whInv.available_stock : 0,
        sales_current_stock: salesInv ? salesInv.available_stock : 0,
      };
    });

    const totalQty = enrichedItems.reduce((s, it) => s + (it.quantity || 0), 0);
    const totalVal = enrichedItems.reduce((s, it) => s + ((it.quantity || 0) * (it.price || 0)), 0);

    return {
      ...h,
      salesman_name: sales?.name || "-",
      salesman_code: (sales as any)?.code || "-",
      warehouse_name: wh?.office_name || "Gudang Pusat",
      prepared_by_name: prepUser?.name || "-",
      confirmed_by_name: confUser?.name || "-",
      total_items_count: enrichedItems.length,
      total_quantity: totalQty,
      total_estimated_value: totalVal,
      sku_summary: formatSkuSummary(h.items),
      items: enrichedItems,
    };
  });

  res.json({ items: enriched, total: enriched.length });
});

/**
 * GET /api/stock/handovers/:id
 */
router.get("/stock/handovers/:id", authMiddleware, (req: AuthenticatedRequest, res) => {
  const h = (db.stock_handovers || []).find((item) => item._id === req.params.id);
  if (!h) return res.status(404).json({ detail: "Data serah terima stok tidak ditemukan." });

  if (req.user!.role === "SALES" && h.salesman_id !== req.user!._id) {
    return res.status(403).json({ detail: "Anda tidak berhak melihat data serah terima sales lain." });
  }

  const sales = db.users.find((u) => u._id === h.salesman_id);
  const wh = db.offices.find((o) => o._id === h.warehouse_id);

  const enrichedItems = (h.items || []).map((it: any) => {
    const skuInfo = resolveSkuInfo(it.sku_id);
    return {
      ...it,
      sku_code: skuInfo.sku_code || "-",
      sku_name: skuInfo.resolved_name,
      unit: skuInfo.uom || "Unit",
    };
  });

  res.json({
    ...h,
    salesman_name: sales?.name || "-",
    warehouse_name: wh?.office_name || "Gudang Pusat",
    items: enrichedItems,
  });
});

/**
 * POST /api/stock/handovers
 */
router.post("/stock/handovers", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER", "SUPERVISOR"), async (req: AuthenticatedRequest, res) => {
  const { business_date, warehouse_id, salesman_id, items, notes, is_additional, handover_type, handover_time, auto_confirm } = req.body || {};

  if (!salesman_id || !items || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ detail: "Salesman dan daftar item produk wajib diisi." });
  }

  try {
    const newHandover = await createStockHandover({
      business_date,
      warehouse_id,
      salesman_id,
      items,
      notes,
      is_additional,
      handover_type,
      handover_time,
      auto_confirm,
    }, req.user!._id);

    res.status(201).json(newHandover);
  } catch (err: any) {
    console.error("Create handover error:", err);
    res.status(400).json({ detail: err.message || "Gagal membuat serah terima stok." });
  }
});

/**
 * POST /api/stock/handovers/:id/confirm
 */
router.post("/stock/handovers/:id/confirm", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER", "SUPERVISOR"), async (req: AuthenticatedRequest, res) => {
  try {
    const confirmed = await confirmStockHandover(req.params.id, req.user!._id);
    res.json({ message: "Stok telah berhasil diserahkan ke Sales.", handover: confirmed });
  } catch (err: any) {
    console.error("Confirm handover error:", err);
    res.status(400).json({ detail: err.message || "Gagal konfirmasi serah terima stok." });
  }
});

// ================= STOCK RETURNS (SALES -> WAREHOUSE) =================

/**
 * GET /api/stock/returns
 */
router.get("/stock/returns", authMiddleware, (req: AuthenticatedRequest, res) => {
  const { business_date, salesman_id } = req.query as Record<string, string>;
  const targetSalesId = req.user!.role === "SALES" ? req.user!._id : salesman_id;

  let list = db.stock_returns || [];

  if (business_date) {
    list = list.filter((r) => r.business_date === business_date);
  }
  if (targetSalesId) {
    list = list.filter((r) => r.salesman_id === targetSalesId);
  }

  list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const enriched = list.map((r) => {
    const sales = db.users.find((u) => u._id === r.salesman_id);
    const wh = db.offices.find((o) => o._id === r.warehouse_id);

    const enrichedItems = (r.items || []).map((it: any) => {
      const skuInfo = resolveSkuInfo(it.sku_id);
      return {
        ...it,
        sku_code: skuInfo.sku_code || "-",
        sku_name: skuInfo.resolved_name,
        unit: skuInfo.uom || "Unit",
      };
    });

    return {
      ...r,
      salesman_name: sales?.name || "-",
      warehouse_name: wh?.office_name || "Gudang Pusat",
      sku_summary: formatSkuSummary(r.items),
      items: enrichedItems,
    };
  });

  res.json({ items: enriched, total: enriched.length });
});

/**
 * GET /api/stock/returns/:id
 */
router.get("/stock/returns/:id", authMiddleware, (req: AuthenticatedRequest, res) => {
  const r = (db.stock_returns || []).find((item) => item._id === req.params.id);
  if (!r) return res.status(404).json({ detail: "Data retur stok tidak ditemukan." });

  const sales = db.users.find((u) => u._id === r.salesman_id);
  const wh = db.offices.find((o) => o._id === r.warehouse_id);

  const enrichedItems = (r.items || []).map((it: any) => {
    const skuInfo = resolveSkuInfo(it.sku_id);
    return {
      ...it,
      sku_code: skuInfo.sku_code || "-",
      sku_name: skuInfo.resolved_name,
      unit: skuInfo.uom || "Unit",
    };
  });

  res.json({
    ...r,
    salesman_name: sales?.name || "-",
    warehouse_name: wh?.office_name || "Gudang Pusat",
    items: enrichedItems,
  });
});

/**
 * POST /api/stock/returns
 */
router.post("/stock/returns", authMiddleware, async (req: AuthenticatedRequest, res) => {
  const { business_date, warehouse_id, salesman_id, items, notes, auto_confirm } = req.body || {};
  const targetSalesId = req.user!.role === "SALES" ? req.user!._id : (salesman_id || req.user!._id);

  if (!items || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ detail: "Daftar item retur wajib diisi." });
  }

  try {
    const newReturn = await createStockReturn({
      business_date,
      warehouse_id,
      salesman_id: targetSalesId,
      items,
      notes,
      auto_confirm,
    }, req.user!._id);

    res.status(201).json({
      message: auto_confirm ? "Retur stok berhasil dikonfirmasi dan masuk gudang." : "Permohonan retur stok berhasil diajukan.",
      stock_return: newReturn,
    });
  } catch (err: any) {
    console.error("Create return error:", err);
    res.status(400).json({ detail: err.message || "Gagal memproses retur stok." });
  }
});

/**
 * POST /api/stock/returns/:id/confirm
 */
router.post("/stock/returns/:id/confirm", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER", "SUPERVISOR"), async (req: AuthenticatedRequest, res) => {
  try {
    const confirmed = await confirmStockReturn(req.params.id, req.user!._id);
    res.json({ message: `Retur stok ${confirmed.return_code} berhasil diterima di gudang.`, stock_return: confirmed });
  } catch (err: any) {
    console.error("Confirm return error:", err);
    res.status(400).json({ detail: err.message || "Gagal konfirmasi retur stok." });
  }
});

// ================= STOCK RECEIVINGS (SUPPLIER -> WAREHOUSE) =================

/**
 * GET /api/stock/receivings
 */
router.get("/stock/receivings", authMiddleware, (req: AuthenticatedRequest, res) => {
  const { warehouse_id, status, receiving_date, from_date, to_date, search } = req.query as Record<string, string>;

  let list = db.stock_receivings || [];

  if (warehouse_id) list = list.filter((r) => r.warehouse_id === warehouse_id);
  if (status) list = list.filter((r) => r.status === status);
  if (receiving_date) list = list.filter((r) => r.receiving_date === receiving_date);
  if (from_date) list = list.filter((r) => r.receiving_date >= from_date);
  if (to_date) list = list.filter((r) => r.receiving_date <= to_date);
  if (search) {
    const q = search.toLowerCase();
    list = list.filter((r) =>
      r.receiving_code?.toLowerCase().includes(q) ||
      r.po_number?.toLowerCase().includes(q) ||
      r.supplier_name?.toLowerCase().includes(q)
    );
  }

  list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const enriched = list.map((r) => {
    const wh = db.offices.find((o) => o._id === r.warehouse_id);
    const creator = db.users.find((u) => u._id === r.created_by);
    const poster = r.posted_by ? db.users.find((u) => u._id === r.posted_by) : null;

    const itemsEnriched = (r.items || []).map((it: any) => {
      const skuInfo = resolveSkuInfo(it.sku_id);
      return {
        ...it,
        sku_code: skuInfo.sku_code || "-",
        sku_name: skuInfo.resolved_name,
        unit: skuInfo.uom || "Unit",
      };
    });

    const totalQty = itemsEnriched.reduce((s, it) => s + (Number(it.quantity) || 0), 0);
    const totalVal = itemsEnriched.reduce((s, it) => s + ((Number(it.quantity) || 0) * (Number(it.unit_price) || 0)), 0);

    return {
      ...r,
      warehouse_name: wh?.office_name || "Gudang Pusat",
      creator_name: creator?.name || "-",
      posted_by_name: poster?.name || "-",
      total_quantity: totalQty,
      total_value: r.total_value || totalVal,
      sku_summary: formatSkuSummary(r.items),
      items: itemsEnriched,
    };
  });

  res.json({ items: enriched, total: enriched.length });
});

/**
 * GET /api/stock/receivings/:id
 */
router.get("/stock/receivings/:id", authMiddleware, (req: AuthenticatedRequest, res) => {
  const r = (db.stock_receivings || []).find((item) => item._id === req.params.id);
  if (!r) return res.status(404).json({ detail: "Data penerimaan barang tidak ditemukan." });

  const wh = db.offices.find((o) => o._id === r.warehouse_id);
  const creator = db.users.find((u) => u._id === r.created_by);
  const poster = r.posted_by ? db.users.find((u) => u._id === r.posted_by) : null;

  const itemsEnriched = (r.items || []).map((it: any) => {
    const skuInfo = resolveSkuInfo(it.sku_id);
    return {
      ...it,
      sku_code: skuInfo.sku_code || "-",
      sku_name: skuInfo.resolved_name,
      unit: skuInfo.uom || "Unit",
    };
  });

  res.json({
    ...r,
    warehouse_name: wh?.office_name || "Gudang Pusat",
    creator_name: creator?.name || "-",
    posted_by_name: poster?.name || "-",
    sku_summary: formatSkuSummary(r.items),
    items: itemsEnriched,
  });
});

/**
 * POST /api/stock/receivings
 */
router.post("/stock/receivings", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const { po_number, supplier_name, warehouse_id, receiving_date, items, notes, auto_post } = req.body || {};

  if (!supplier_name || !items || !Array.isArray(items) || !items.length) {
    return res.status(400).json({ detail: "Supplier dan daftar item produk wajib diisi." });
  }

  try {
    const newReceiving = await createStockReceiving({
      po_number,
      supplier_name,
      warehouse_id,
      business_date: receiving_date,
      items,
      notes,
      auto_post,
    }, req.user!._id);

    res.status(201).json(newReceiving);
  } catch (err: any) {
    console.error("Create receiving error:", err);
    res.status(400).json({ detail: err.message || "Gagal membuat penerimaan barang." });
  }
});

/**
 * POST /api/stock/receivings/:id/post
 */
router.post("/stock/receivings/:id/post", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  try {
    const posted = await postStockReceiving(req.params.id, req.user!._id);
    res.json({
      message: `Penerimaan barang ${posted.receive_code || posted.po_number} berhasil diposting ke stok gudang.`,
      receiving: posted,
    });
  } catch (err: any) {
    console.error("Post receiving error:", err);
    res.status(400).json({ detail: err.message || "Gagal posting penerimaan barang." });
  }
});

/**
 * POST /api/stock/receivings/:id/cancel
 */
router.post("/stock/receivings/:id/cancel", authMiddleware, requireRoles("WAREHOUSE", "ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const r = (db.stock_receivings || []).find((item) => item._id === req.params.id);
  if (!r) return res.status(404).json({ detail: "Data penerimaan tidak ditemukan." });
  if (r.status === "POSTED") {
    return res.status(400).json({ detail: "Penerimaan barang yang sudah POSTED tidak dapat dibatalkan secara langsung. Gunakan menu Penyesuaian Stok." });
  }

  r.status = "CANCELLED";
  r.updated_at = new Date().toISOString();
  await syncSingleDoc("stock_receivings", r._id, r);

  await recordAuditLog(req.user!._id, "CANCEL_STOCK_RECEIVING", "stock_receivings", r._id, {
    receiving_code: r.receiving_code,
  });

  res.json({ message: "Draft penerimaan barang berhasil dibatalkan.", receiving: r });
});

/**
 * DELETE /api/stock/receivings/:id
 */
router.delete("/stock/receivings/:id", authMiddleware, requireRoles("ADMIN", "OWNER"), async (req: AuthenticatedRequest, res) => {
  const idx = (db.stock_receivings || []).findIndex((item) => item._id === req.params.id);
  if (idx === -1) return res.status(404).json({ detail: "Data penerimaan tidak ditemukan." });

  const r = db.stock_receivings[idx];
  if (r.status === "POSTED") {
    return res.status(400).json({ detail: "Penerimaan barang yang sudah POSTED tidak boleh dihapus dari sistem." });
  }

  db.stock_receivings.splice(idx, 1);
  await deleteSingleDoc("stock_receivings", r._id);

  await recordAuditLog(req.user!._id, "DELETE_STOCK_RECEIVING", "stock_receivings", r._id, {
    receiving_code: r.receiving_code,
  });

  res.json({ message: "Penerimaan barang berhasil dihapus." });
});

// ================= SALES STOCK LEDGERS (DAILY 4-PILLAR RECONCILIATION) =================

/**
 * GET /api/stock/ledgers
 */
router.get("/stock/ledgers", authMiddleware, (req: AuthenticatedRequest, res) => {
  const { salesman_id, business_date, sku_id } = req.query as Record<string, string>;
  const targetSalesId = req.user!.role === "SALES" ? req.user!._id : salesman_id;

  const result = querySalesStockLedgers({
    salesman_id: targetSalesId,
    business_date,
    sku_id,
  });

  res.json(result);
});

export default router;

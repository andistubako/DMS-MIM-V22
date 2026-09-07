import { db, Transaction, StockMovement, InventoryItem, DailyStockHandover, DailyStockReturn, DailyStockReturnItem } from "./data.js";
import { firestoreDb } from "./firebase.js";
import { collection, doc, getDocs, setDoc, deleteDoc } from "firebase/firestore";
import { syncSingleDoc, deleteSingleDoc } from "./persistence.js";
import { resolveSkuInfo } from "./skuResolver.js";
const isCloudSqlConnected = false;
const syncDocToPostgres = (_col: string, _doc: any) => Promise.resolve();
import { sqlDb } from "../src/db/index.js";
import { transactions as pgTransactions, stockHandovers as pgStockHandovers, stockReturns as pgStockReturns, stockReceivings as pgStockReceivings, inventory as pgInventory, stockMovements as pgStockMovements, salesStockLedgers as pgSalesStockLedgers, outlets as pgOutlets, visits as pgVisits } from "../src/db/schema.js";
import { eq, sql } from "drizzle-orm";

export type SaleItemInput = {
  sku_id: string;
  quantity?: number;
  qty?: number;
  volume?: number;
  unit_price?: number;
  unitPrice?: number;
  discount_amount?: number;
  discount?: number;
  [key: string]: any;
};

const SALEABLE_OUTLET_STATUSES = new Set(["PROSPECT", "NOO", "REPEAT", "ACTIVE", "DORMANT", "PENDING"]);

function genId(prefix: string) {
  return `${prefix}-${Date.now()}-${Math.floor(Math.random() * 1000000)}`;
}

function getTodayWIB(): string {
  const d = new Date();
  const utc = d.getTime() + d.getTimezoneOffset() * 60000;
  const wib = new Date(utc + 7 * 3600000);
  return wib.toISOString().slice(0, 10);
}

/**
 * Record audit log directly in Google Cloud Firestore as SSOT
 */
export async function recordAuditLog(
  userId: string,
  action: string,
  entity: string,
  entityId: string,
  details?: Record<string, any>
): Promise<void> {
  const logId = genId("log");
  const now = new Date().toISOString();
  const log = {
    _id: logId,
    id: logId,
    user_id: userId,
    action,
    entity,
    entity_id: entityId,
    details: details || {},
    created_at: now,
  };
  if (!Array.isArray(db.audit_logs)) db.audit_logs = [];
  db.audit_logs.push(log as any);
  await syncSingleDoc("audit_logs", logId, log);
}

/**
 * Updates or creates inventory balance in Firestore SSOT and in-memory cache
 */
export async function createOrUpdateInventory(
  locationType: "WAREHOUSE" | "SALES",
  locationId: string,
  skuId: string,
  qtyDelta: number
): Promise<any> {
  const locType = locationType || "WAREHOUSE";
  const locId = locationId || "off-1";
  const docId = `inv-${locType}-${locId}-${skuId}`;
  const nowStr = new Date().toISOString();

  let existing = db.inventory.find(
    (i) => (i.location_type === locType || (!i.location_type && locType === "WAREHOUSE")) &&
           (i.location_id === locId || i.office_id === locId) &&
           i.sku_id === skuId
  );

  let updatedRecord: any;

  if (existing) {
    existing.stock_on_hand += qtyDelta;
    existing.available_stock += qtyDelta;
    existing.quantity = existing.stock_on_hand;
    existing.updated_at = nowStr;
    updatedRecord = { ...existing };
  } else {
    updatedRecord = {
      _id: docId,
      id: docId,
      location_type: locType,
      location_id: locId,
      office_id: locType === "WAREHOUSE" ? locId : undefined,
      warehouse_id: locType === "WAREHOUSE" ? locId : undefined,
      salesman_id: locType === "SALES" ? locId : undefined,
      sku_id: skuId,
      stock_on_hand: qtyDelta,
      allocated_stock: 0,
      available_stock: qtyDelta,
      quantity: qtyDelta,
      reorder_level: locType === "WAREHOUSE" ? 500 : 20,
      status: "ACTIVE",
      updated_at: nowStr,
    };
    db.inventory.push(updatedRecord);
  }

  // Persist to Google Cloud Firestore as SSOT
  await syncSingleDoc("inventory", updatedRecord._id || docId, updatedRecord);

  // Secondary sync to PostgreSQL if connected
  if (isCloudSqlConnected) {
    try {
      const existingPg = await sqlDb.select().from(pgInventory).where(
        sql`${pgInventory.locationType} = ${locType} AND ${pgInventory.locationId} = ${locId} AND ${pgInventory.skuId} = ${skuId}`
      ).limit(1);

      if (existingPg[0]) {
        await sqlDb.update(pgInventory).set({
          stockOnHand: existingPg[0].stockOnHand + qtyDelta,
          availableStock: existingPg[0].availableStock + qtyDelta,
          updatedAt: new Date(),
        }).where(eq(pgInventory.id, existingPg[0].id));
      } else {
        await sqlDb.insert(pgInventory).values({
          id: docId,
          locationType: locType,
          locationId: locId,
          skuId,
          stockOnHand: qtyDelta,
          availableStock: qtyDelta,
          allocatedStock: 0,
          status: "ACTIVE",
        });
      }
    } catch (pgErr) {
      console.warn("[InventoryTransaction] Postgres secondary sync warning:", pgErr);
    }
  }

  return updatedRecord;
}

/**
 * Record an immutable stock movement in Google Cloud Firestore as SSOT
 */
export async function recordStockMovement(mvt: {
  movementType: string;
  sourceLocationType: string;
  sourceLocationId: string;
  destLocationType: string;
  destLocationId: string;
  skuId: string;
  quantity: number;
  referenceId?: string;
  performedBy?: string;
  notes?: string;
  businessDate?: string;
  salesmanId?: string;
  outletId?: string;
}): Promise<any> {
  const mvtId = genId("mvt");
  const today = mvt.businessDate || getTodayWIB();
  const nowStr = new Date().toISOString();
  const operator = mvt.performedBy || mvt.salesmanId || "system";

  const fullMvt: any = {
    _id: mvtId,
    id: mvtId,
    movement_code: `MVT-${today.replace(/-/g, "")}-${String(db.stock_movements.length + 1).padStart(4, "0")}`,
    movement_type: mvt.movementType,
    source_location_type: mvt.sourceLocationType,
    source_location_id: mvt.sourceLocationId,
    destination_location_type: mvt.destLocationType,
    destination_location_id: mvt.destLocationId,
    sku_id: mvt.skuId,
    quantity: mvt.quantity,
    reference_id: mvt.referenceId || "",
    business_date: today,
    status: "COMPLETED",
    notes: mvt.notes || "",
    salesman_id: mvt.salesmanId || (mvt.sourceLocationType === "SALES" ? mvt.sourceLocationId : (mvt.destLocationType === "SALES" ? mvt.destLocationId : undefined)),
    outlet_id: mvt.outletId || (mvt.destLocationType === "OUTLET" ? mvt.destLocationId : undefined),
    created_by: operator,
    performed_by: operator,
    created_at: nowStr,
  };

  if (!Array.isArray(db.stock_movements)) db.stock_movements = [];
  db.stock_movements.push(fullMvt);

  // Persist to Google Cloud Firestore as SSOT
  await syncSingleDoc("stock_movements", mvtId, fullMvt);

  // Secondary sync to PostgreSQL if connected
  if (isCloudSqlConnected) {
    try {
      await sqlDb.insert(pgStockMovements).values({
        id: mvtId,
        movementType: mvt.movementType,
        sourceLocationType: mvt.sourceLocationType,
        sourceLocationId: mvt.sourceLocationId,
        destLocationType: mvt.destLocationType,
        destLocationId: mvt.destLocationId,
        skuId: mvt.skuId,
        quantity: mvt.quantity,
        referenceId: mvt.referenceId || null,
        performedBy: mvt.performedBy,
        notes: mvt.notes || null,
      });
    } catch (pgErr) {
      console.warn("[InventoryTransaction] Postgres secondary mvt sync warning:", pgErr);
    }
  }

  return fullMvt;
}

/**
 * Upsert daily Sales Stock Ledger in Firestore SSOT
 */
export async function upsertSalesStockLedger(
  salesmanId: string,
  businessDate: string,
  skuId: string,
  updates: {
    initialStock?: number;
    loadedStock?: number;
    soldStock?: number;
    returnedStock?: number;
    finalStock?: number;
    notes?: string;
  }
): Promise<any> {
  const ledgerId = `ssl-${salesmanId}-${businessDate}-${skuId}`;
  const nowStr = new Date().toISOString();

  if (!Array.isArray(db.sales_stock_ledgers)) db.sales_stock_ledgers = [];
  let ledger = db.sales_stock_ledgers.find(
    (l) => l.salesman_id === salesmanId && l.business_date === businessDate && l.sku_id === skuId
  ) as any;

  if (ledger) {
    if (updates.initialStock !== undefined) ledger.initial_stock = updates.initialStock;
    if (updates.loadedStock) ledger.loaded_stock = (ledger.loaded_stock || 0) + updates.loadedStock;
    if (updates.soldStock) ledger.sold_stock = (ledger.sold_stock || 0) + updates.soldStock;
    if (updates.returnedStock) ledger.returned_stock = (ledger.returned_stock || 0) + updates.returnedStock;
    if (updates.finalStock !== undefined) ledger.final_stock = (ledger.final_stock || 0) + updates.finalStock;
    ledger.updated_at = nowStr;
  } else {
    ledger = {
      _id: ledgerId,
      id: ledgerId,
      salesman_id: salesmanId,
      business_date: businessDate,
      sku_id: skuId,
      initial_stock: updates.initialStock || 0,
      opening_balance: updates.initialStock || 0,
      transfers_in: updates.loadedStock || 0,
      loaded_stock: updates.loadedStock || 0,
      sales_out: updates.soldStock || 0,
      sold_stock: updates.soldStock || 0,
      returns_out: updates.returnedStock || 0,
      returned_stock: updates.returnedStock || 0,
      closing_balance: updates.finalStock || 0,
      final_stock: updates.finalStock || 0,
      expected_balance: (updates.initialStock || 0) + (updates.loadedStock || 0) - (updates.soldStock || 0) - (updates.returnedStock || 0),
      discrepancy: 0,
      status: "BALANCED",
      notes: updates.notes || "",
      created_at: nowStr,
      updated_at: nowStr,
    };
    db.sales_stock_ledgers.push(ledger);
  }

  const opening = Number(ledger.initial_stock || ledger.opening_balance || 0);
  const loaded = Number(ledger.loaded_stock || ledger.transfers_in || 0);
  const sold = Number(ledger.sold_stock || ledger.sales_out || 0);
  const returned = Number(ledger.returned_stock || ledger.returns_out || 0);
  const expected = opening + loaded - sold - returned;
  const closing = Number(ledger.final_stock ?? ledger.closing_balance ?? expected);
  const discrepancy = closing - expected;

  ledger.expected_balance = expected;
  ledger.closing_balance = closing;
  ledger.discrepancy = discrepancy;
  ledger.status = discrepancy === 0 ? "BALANCED" : discrepancy > 0 ? "SURPLUS" : "DEFICIT";

  // Persist to Google Cloud Firestore as SSOT
  await syncSingleDoc("sales_stock_ledgers", ledgerId, ledger);

  // Secondary sync to PostgreSQL if connected
  if (isCloudSqlConnected) {
    try {
      const existingPg = await sqlDb.select().from(pgSalesStockLedgers).where(
        sql`${pgSalesStockLedgers.salesmanId} = ${salesmanId} AND ${pgSalesStockLedgers.date} = ${businessDate} AND ${pgSalesStockLedgers.skuId} = ${skuId}`
      ).limit(1);

      if (existingPg[0]) {
        await sqlDb.update(pgSalesStockLedgers).set({
          loadedStock: Number(existingPg[0].loadedStock || 0) + (updates.loadedStock || 0),
          soldStock: Number(existingPg[0].soldStock || 0) + (updates.soldStock || 0),
          returnedStock: Number(existingPg[0].returnedStock || 0) + (updates.returnedStock || 0),
          finalStock: Number(existingPg[0].finalStock || 0) + (updates.finalStock || 0),
        }).where(eq(pgSalesStockLedgers.id, existingPg[0].id));
      } else {
        await sqlDb.insert(pgSalesStockLedgers).values({
          id: ledgerId,
          salesmanId,
          date: businessDate,
          skuId,
          initialStock: updates.initialStock || 0,
          loadedStock: updates.loadedStock || 0,
          soldStock: updates.soldStock || 0,
          returnedStock: updates.returnedStock || 0,
          finalStock: updates.finalStock || 0,
        });
      }
    } catch (pgErr) {
      console.warn("[InventoryTransaction] Postgres secondary ledger sync warning:", pgErr);
    }
  }

  return ledger;
}

/**
 * Atomic sale posting that persists to Firestore SSOT, updates inventory balances,
 * logs stock movement, updates daily sales stock ledger, updates outlet purchase lifecycle,
 * and marks visits as effective calls.
 */
export async function postSaleAtomic(input: {
  invoice_number?: string;
  salesman_id: string;
  outlet_id: string;
  visit_id?: string;
  office_id?: string;
  transaction_type?: string;
  items: SaleItemInput[];
  notes?: string;
  idempotency_key?: string;
  latitude?: number;
  longitude?: number;
}): Promise<{ transaction: any; replayed: boolean }> {
  const salesmanId = input.salesman_id;
  const outletId = input.outlet_id;
  const today = getTodayWIB();
  const now = new Date();
  const nowStr = now.toISOString();

  if (!salesmanId || !outletId) throw new Error("Salesman dan outlet wajib diisi.");
  if (!Array.isArray(input.items) || input.items.length === 0) {
    throw new Error("Minimal satu item transaksi wajib diisi.");
  }

  // Idempotency check in memory & Firestore
  if (input.invoice_number) {
    const existing = db.transactions.find((t) => t.invoice_number === input.invoice_number || t._id === input.invoice_number);
    if (existing) {
      return { transaction: existing, replayed: true };
    }
  }
  if (input.idempotency_key) {
    const existing = db.transactions.find((t) => (t as any).metadata?.idempotency_key === input.idempotency_key);
    if (existing) {
      return { transaction: existing, replayed: true };
    }
  }

  // Validate outlet
  const outlet = db.outlets.find((o) => o._id === outletId);
  if (!outlet) throw new Error("Outlet tidak ditemukan.");
  if (!SALEABLE_OUTLET_STATUSES.has(String(outlet.status || "").toUpperCase())) {
    throw new Error("Outlet tidak dapat menerima transaksi pada status saat ini.");
  }

  // Validate items
  const cleanItems = input.items.map((item) => {
    const skuId = item.sku_id || item.skuId;
    const quantity = Number(item.quantity ?? item.qty ?? item.volume ?? 0);
    const unitPrice = Number(item.unit_price ?? item.unitPrice ?? 0);
    const discount = Number(item.discount_amount ?? item.discount ?? 0);

    if (!skuId || !Number.isInteger(quantity) || quantity <= 0) {
      throw new Error("Quantity setiap SKU harus bilangan bulat lebih dari 0.");
    }
    if (!Number.isFinite(unitPrice) || unitPrice < 0 || !Number.isFinite(discount) || discount < 0) {
      throw new Error("Harga / discount tidak valid.");
    }
    return { sku_id: skuId, quantity, unit_price: unitPrice, discount };
  });

  // Calculate pricing & validate stock availability
  let subtotal = 0;
  let discountTotal = 0;
  const processedItems: any[] = [];

  for (const item of cleanItems) {
    const sku = db.skus.find((s) => s._id === item.sku_id);
    if (!sku) throw new Error(`SKU ${item.sku_id} tidak ditemukan.`);
    if (sku.status !== "ACTIVE") throw new Error(`SKU ${sku.name} (${sku.code}) tidak aktif.`);

    let price = item.unit_price;
    if (price <= 0) {
      const prc = db.prices.find((p) => p.sku_id === sku._id && p.status === "ACTIVE");
      price = Number(prc?.price || (sku as any).base_price || (sku as any).price || 0);
    }

    const lineGross = item.quantity * price;
    const lineSubtotal = Math.max(0, lineGross - item.discount);
    subtotal += lineSubtotal;
    discountTotal += item.discount;

    processedItems.push({
      sku_id: item.sku_id,
      skuId: item.sku_id,
      sku_code: sku.code,
      sku_name: sku.name,
      product_id: sku.product_id || "prd-1",
      quantity: item.quantity,
      volume: item.quantity,
      unit_price: price,
      discount: item.discount,
      subtotal: lineSubtotal,
    });
  }

  // Deduct stock and update movements & sales stock ledgers
  const transactionId = genId("txn");
  const invoiceNumber = input.invoice_number?.trim() || `INV/${today.replace(/-/g, "")}/${String(db.transactions.length + 1).padStart(3, "0")}`;

  for (const item of processedItems) {
    // Deduct stock from salesman location
    await createOrUpdateInventory("SALES", salesmanId, item.sku_id, -item.quantity);

    // Record movement SALES_OUT
    await recordStockMovement({
      movementType: "SALES_OUT",
      sourceLocationType: "SALES",
      sourceLocationId: salesmanId,
      destLocationType: "OUTLET",
      destLocationId: outletId,
      skuId: item.sku_id,
      quantity: item.quantity,
      referenceId: transactionId,
      performedBy: salesmanId,
      notes: `Penjualan ${outlet.outlet_name} (${invoiceNumber})`,
      businessDate: today,
    });

    // Update Sales Stock Ledger
    await upsertSalesStockLedger(salesmanId, today, item.sku_id, {
      soldStock: item.quantity,
      finalStock: -item.quantity,
    });
  }

  const taxRate = Number(db.settings?.tax_rate_percentage) || 0;
  const taxAmount = Math.round((subtotal * taxRate) / 100);
  const totalAmount = subtotal + taxAmount;
  const totalVolume = processedItems.reduce((acc, it) => acc + it.quantity, 0);

  const newTransaction: any = {
    _id: transactionId,
    id: transactionId,
    invoice_number: invoiceNumber,
    transaction_code: invoiceNumber,
    salesman_id: salesmanId,
    outlet_id: outletId,
    visit_id: input.visit_id || null,
    office_id: input.office_id || "off-1",
    transaction_date: nowStr,
    transaction_type: input.transaction_type || "CASH",
    payment_method: input.transaction_type || "CASH",
    status: "PAID",
    payment_status: "PAID",
    delivery_status: "DELIVERED",
    items: processedItems,
    total_volume: totalVolume,
    subtotal,
    discount_amount: discountTotal,
    discount_total: discountTotal,
    tax: taxAmount,
    tax_amount: taxAmount,
    total: totalAmount,
    total_amount: totalAmount,
    paid_amount: totalAmount,
    notes: input.notes || null,
    latitude: input.latitude || null,
    longitude: input.longitude || null,
    created_at: nowStr,
    metadata: {
      idempotency_key: input.idempotency_key || null,
      posted_atomically: true,
      source: "FIRESTORE_SSOT",
    },
  };

  // 1. Persist Transaction to Firestore SSOT
  if (!Array.isArray(db.transactions)) db.transactions = [];
  db.transactions.push(newTransaction);
  await syncSingleDoc("transactions", transactionId, newTransaction);

  // 2. Canonical Outlet Lifecycle Evolution
  const previousPurchases = db.transactions.filter(
    (t) => t.outlet_id === outletId && t.status !== "CANCELLED"
  ).length;
  const nextStatus = previousPurchases === 1 ? "NOO" : previousPurchases === 2 ? "REPEAT" : "ACTIVE";
  outlet.lifecycle_status = nextStatus as any;
  if (outlet.status !== "PENDING") {
    outlet.status = "ACTIVE";
  }
  outlet.completed_transaction_count = (outlet.completed_transaction_count || 0) + 1;
  outlet.last_completed_transaction_at = nowStr;
  outlet.total_revenue = (outlet.total_revenue || 0) + totalAmount;
  outlet.total_volume = (outlet.total_volume || 0) + totalVolume;
  await syncSingleDoc("outlets", outlet._id, outlet);

  // 3. Mark Visit as Effective Call
  if (input.visit_id) {
    const visit = db.visits.find((v) => v._id === input.visit_id);
    if (visit) {
      (visit as any).is_effective_call = true;
      visit.call_result = "EFFECTIVE";
      await syncSingleDoc("visits", visit._id, visit);
    }
  }

  // 4. Record Audit Log
  await recordAuditLog(salesmanId, "SALE_POSTED", "TRANSACTION", transactionId, {
    invoice_number: invoiceNumber,
    outlet_id: outletId,
    total_amount: totalAmount,
    total_volume: totalVolume,
  });

  // Secondary sync to Postgres if connected
  if (isCloudSqlConnected) {
    try {
      await sqlDb.insert(pgTransactions).values({
        id: transactionId,
        invoiceNumber,
        salesmanId,
        outletId,
        visitId: input.visit_id || null,
        officeId: input.office_id || "off-1",
        transactionType: input.transaction_type || "CASH",
        subtotal,
        discountAmount: discountTotal,
        taxAmount,
        totalAmount,
        paidAmount: totalAmount,
        paymentStatus: "PAID",
        deliveryStatus: "DELIVERED",
        items: processedItems,
        notes: input.notes || null,
        createdAt: now,
      });
      await sqlDb.update(pgOutlets).set({ status: nextStatus as any }).where(eq(pgOutlets.id, outletId));
      if (input.visit_id) {
        await sqlDb.update(pgVisits).set({ isEffectiveCall: true }).where(eq(pgVisits.id, input.visit_id));
      }
    } catch (pgErr) {
      console.warn("[InventoryTransaction] Postgres secondary transaction sync notice:", pgErr);
    }
  }

  return { transaction: newTransaction, replayed: false };
}

/**
 * Cancel or Void a transaction with atomic inventory restitution in Firestore SSOT
 */
export async function cancelTransaction(
  transactionId: string,
  userId: string,
  reason: string
): Promise<{ success: boolean; transaction: any }> {
  const txn = db.transactions.find((t) => t._id === transactionId || t.invoice_number === transactionId);
  if (!txn) throw new Error("Transaksi tidak ditemukan.");
  if (txn.status === "CANCELLED") throw new Error("Transaksi sudah dibatalkan sebelumnya.");

  const today = getTodayWIB();
  const nowStr = new Date().toISOString();

  // Revert stock for each item back to salesman
  for (const item of txn.items || []) {
    const qty = Number(item.quantity ?? item.volume ?? 0);
    const skuId = item.sku_id || item.skuId;
    if (qty <= 0 || !skuId) continue;

    // Restore stock to salesman
    await createOrUpdateInventory("SALES", txn.salesman_id, skuId, qty);

    // Record REVERSAL movement
    await recordStockMovement({
      movementType: "REVERSAL",
      sourceLocationType: "OUTLET",
      sourceLocationId: txn.outlet_id,
      destLocationType: "SALES",
      destLocationId: txn.salesman_id,
      skuId,
      quantity: qty,
      referenceId: txn._id,
      performedBy: userId,
      notes: `Reversal pembatalan ${txn.invoice_number || txn._id}: ${reason}`,
      businessDate: today,
    });

    // Adjust Sales Stock Ledger
    await upsertSalesStockLedger(txn.salesman_id, today, skuId, {
      soldStock: -qty,
      finalStock: qty,
    });
  }

  txn.status = "CANCELLED";
  (txn as any).payment_status = "CANCELLED";
  (txn as any).cancellation_reason = reason;
  (txn as any).cancelled_by = userId;
  (txn as any).cancelled_at = nowStr;

  // Persist cancellation to Firestore SSOT
  await syncSingleDoc("transactions", txn._id, txn);

  // Record audit log
  await recordAuditLog(userId, "TRANSACTION_CANCELLED", "TRANSACTION", txn._id, {
    invoice_number: txn.invoice_number,
    reason,
  });

  // Secondary sync to PostgreSQL if connected
  if (isCloudSqlConnected) {
    try {
      await sqlDb.update(pgTransactions).set({
        paymentStatus: "CANCELLED",
      }).where(eq(pgTransactions.id, txn._id));
    } catch (pgErr) {
      console.warn("[InventoryTransaction] Postgres cancel sync notice:", pgErr);
    }
  }

  return { success: true, transaction: txn };
}

/**
 * Query transactions with comprehensive filtering
 */
export function queryTransactions(params: {
  salesman_id?: string;
  outlet_id?: string;
  status?: string;
  payment_status?: string;
  from_date?: string;
  to_date?: string;
  search?: string;
  limit?: number;
  offset?: number;
}): { items: any[]; total: number } {
  let list = db.transactions || [];

  if (params.salesman_id) {
    list = list.filter((t) => t.salesman_id === params.salesman_id);
  }
  if (params.outlet_id) {
    list = list.filter((t) => t.outlet_id === params.outlet_id);
  }
  if (params.status) {
    list = list.filter((t) => t.status === params.status);
  }
  if (params.payment_status) {
    list = list.filter((t) => (t as any).payment_status === params.payment_status);
  }
  if (params.from_date) {
    list = list.filter((t) => (t.transaction_date || t.created_at || "") >= params.from_date!);
  }
  if (params.to_date) {
    list = list.filter((t) => (t.transaction_date || t.created_at || "") <= `${params.to_date}T23:59:59.999Z`);
  }
  if (params.search) {
    const q = params.search.toLowerCase();
    list = list.filter((t) =>
      t.invoice_number?.toLowerCase().includes(q) ||
      (t as any).transaction_code?.toLowerCase().includes(q)
    );
  }

  // Sort descending by date
  list = [...list].sort((a, b) =>
    new Date(b.transaction_date || b.created_at).getTime() - new Date(a.transaction_date || a.created_at).getTime()
  );

  const total = list.length;
  const offset = params.offset ? Math.max(0, params.offset) : 0;
  const limit = params.limit ? Math.max(1, params.limit) : 500;
  const paginated = list.slice(offset, offset + limit);

  // Enrich with outlet and salesman details
  const enriched = paginated.map((t) => {
    const outlet = db.outlets.find((o) => o._id === t.outlet_id);
    const sales = db.users.find((u) => u._id === t.salesman_id);
    return {
      ...t,
      outlet_name: outlet?.outlet_name || "Outlet",
      outlet_code: outlet?.outlet_code || "-",
      salesman_name: sales?.name || "-",
    };
  });

  return { items: enriched, total };
}

/**
 * Get single transaction by ID or Invoice Number
 */
export function getTransactionById(id: string): any | null {
  const txn = db.transactions.find((t) => t._id === id || t.invoice_number === id);
  if (!txn) return null;

  const outlet = db.outlets.find((o) => o._id === txn.outlet_id);
  const sales = db.users.find((u) => u._id === txn.salesman_id);

  const enrichedItems = (txn.items || []).map((it: any) => {
    const sku = db.skus.find((s) => s._id === (it.sku_id || it.skuId));
    const prod = db.products.find((p) => p._id === sku?.product_id);
    return {
      ...it,
      sku_name: sku?.name || it.sku_name || "SKU",
      sku_code: sku?.code || it.sku_code || "-",
      product_name: prod?.name || it.product_name || "Produk",
      unit: sku?.unit || "Unit",
    };
  });

  return {
    ...txn,
    outlet_name: outlet?.outlet_name || "Outlet",
    outlet_code: outlet?.outlet_code || "-",
    outlet_address: outlet?.address || "-",
    salesman_name: sales?.name || "-",
    items: enrichedItems,
  };
}

/**
 * Product Effective Call report: Count distinct outlets purchasing each SKU on a date
 */
export function getProductEffectiveCallReport(date: string, salesmanId?: string): { items: any[]; total: number } {
  const targetDate = date || getTodayWIB();
  let txns = db.transactions.filter((t) => {
    const d = (t.transaction_date || t.created_at || "").slice(0, 10);
    return d === targetDate && t.status !== "CANCELLED";
  });

  if (salesmanId) {
    txns = txns.filter((t) => t.salesman_id === salesmanId);
  }

  // Map distinct outlet per SKU
  const skuMap: Record<string, { outletSet: Set<string>; volume: number; transactionCount: number; productId: string }> = {};

  for (const txn of txns) {
    for (const item of txn.items || []) {
      const skuId = item.sku_id || item.skuId;
      if (!skuId) continue;
      if (!skuMap[skuId]) {
        const sku = db.skus.find((s) => s._id === skuId);
        skuMap[skuId] = {
          outletSet: new Set(),
          volume: 0,
          transactionCount: 0,
          productId: sku?.product_id || "prd-1",
        };
      }
      skuMap[skuId].outletSet.add(txn.outlet_id);
      skuMap[skuId].volume += Number(item.quantity ?? item.volume ?? 0);
      skuMap[skuId].transactionCount += 1;
    }
  }

  const items = Object.entries(skuMap).map(([skuId, data]) => {
    const sku = db.skus.find((s) => s._id === skuId);
    const prod = db.products.find((p) => p._id === data.productId);
    return {
      sku_id: skuId,
      sku_name: sku?.name || "SKU",
      sku_code: sku?.code || "-",
      product_id: data.productId,
      product_name: prod?.name || "-",
      effective_call: data.outletSet.size,
      volume: data.volume,
      transaction_count: data.transactionCount,
    };
  }).sort((a, b) => b.effective_call - a.effective_call || b.volume - a.volume);

  return { items, total: items.length };
}

/**
 * Get enriched inventory balances
 */
export function getInventoryList(filter: {
  location_type?: string;
  location_id?: string;
  sku_id?: string;
}): { items: any[]; total: number } {
  let list = db.inventory || [];

  if (filter.location_type) {
    list = list.filter((i) => (i.location_type || "WAREHOUSE") === filter.location_type);
  }
  if (filter.location_id) {
    list = list.filter((i) => (i.location_id === filter.location_id || i.office_id === filter.location_id));
  }
  if (filter.sku_id) {
    list = list.filter((i) => i.sku_id === filter.sku_id);
  }

  const enriched = list.map((inv) => {
    const skuInfo = resolveSkuInfo(inv.sku_id);
    const office = db.offices.find((o) => o._id === inv.location_id || o._id === inv.office_id);
    const sales = inv.location_type === "SALES" ? db.users.find((u) => u._id === inv.location_id) : null;
    const prc = db.prices.find((p) => p.sku_id === inv.sku_id && p.status === "ACTIVE");

    return {
      _id: inv._id || inv.id,
      location_type: inv.location_type || "WAREHOUSE",
      location_id: inv.location_id || inv.office_id || "off-1",
      sku_id: inv.sku_id,
      stock_on_hand: inv.stock_on_hand ?? inv.quantity ?? 0,
      available_stock: inv.available_stock ?? inv.stock_on_hand ?? 0,
      allocated_stock: inv.allocated_stock ?? 0,
      status: inv.status || "ACTIVE",
      updated_at: inv.updated_at,
      sku_code: skuInfo.sku_code || "-",
      sku_name: skuInfo.resolved_name,
      unit: skuInfo.uom || "Unit",
      price: prc?.price || 0,
      office_name: office?.office_name || "Gudang Pusat",
      location_name: inv.location_type === "SALES" ? `Sales: ${sales?.name || inv.location_id}` : (office?.office_name || "Gudang Pusat"),
      salesman_name: sales?.name || "-",
    };
  });

  return { items: enriched, total: enriched.length };
}

/**
 * Get stock movements audit trail
 */
export function getStockMovements(filter: {
  from_date?: string;
  to_date?: string;
  sku_id?: string;
  movement_type?: string;
  salesman_id?: string;
}): { items: any[]; total: number } {
  let list = db.stock_movements || [];

  if (filter.from_date) {
    list = list.filter((m) => (m.created_at || "").slice(0, 10) >= filter.from_date!);
  }
  if (filter.to_date) {
    list = list.filter((m) => (m.created_at || "").slice(0, 10) <= filter.to_date!);
  }
  if (filter.sku_id) {
    list = list.filter((m) => m.sku_id === filter.sku_id);
  }
  if (filter.movement_type) {
    list = list.filter((m) => m.movement_type === filter.movement_type);
  }
  if (filter.salesman_id) {
    list = list.filter((m) => m.created_by === filter.salesman_id || m.salesman_id === filter.salesman_id);
  }

  list = [...list].sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

  const enriched = list.map((m) => {
    const skuInfo = resolveSkuInfo(m.sku_id);
    const user = db.users.find((u) => u._id === m.created_by);
    return {
      ...m,
      sku_name: skuInfo.resolved_name,
      sku_code: skuInfo.sku_code,
      performed_by_name: user?.name || m.created_by || "-",
    };
  });

  return { items: enriched, total: enriched.length };
}

/**
 * Process Stock Handover (Transfer WAREHOUSE -> SALES)
 */
export async function createStockHandover(data: {
  business_date?: string;
  warehouse_id?: string;
  salesman_id: string;
  items: Array<{ sku_id: string; quantity: number; notes?: string }>;
  notes?: string;
  is_additional?: boolean;
  handover_type?: string;
  handover_time?: string;
  auto_confirm?: boolean;
}, userId: string): Promise<any> {
  const targetDate = data.business_date || getTodayWIB();
  const targetWhId = data.warehouse_id || "off-1";
  const isAdditional = !!data.is_additional || data.handover_type === "ADDITIONAL_HANDOVER";
  const nowStr = new Date().toISOString();
  const handoverId = genId("hnd");
  const count = (db.stock_handovers || []).length + 1;
  const handoverCode = `${isAdditional ? "HND-ADD" : "HND"}-${targetDate.replace(/-/g, "")}-${String(count).padStart(3, "0")}`;

  const processedItems = data.items.map((it) => ({
    sku_id: it.sku_id,
    quantity: Number(it.quantity),
    notes: it.notes || "",
  }));

  const newHandover: any = {
    _id: handoverId,
    id: handoverId,
    handover_code: handoverCode,
    business_date: targetDate,
    warehouse_id: targetWhId,
    salesman_id: data.salesman_id,
    status: data.auto_confirm ? "CONFIRMED" : "DRAFT",
    is_additional: isAdditional,
    items: processedItems,
    notes: data.notes || "",
    prepared_by: userId,
    prepared_at: nowStr,
    confirmed_by: data.auto_confirm ? userId : undefined,
    confirmed_at: data.auto_confirm ? nowStr : undefined,
    created_by: userId,
    created_at: nowStr,
    updated_at: nowStr,
  };

  if (!Array.isArray(db.stock_handovers)) db.stock_handovers = [];
  db.stock_handovers.push(newHandover);
  await syncSingleDoc("stock_handovers", handoverId, newHandover);

  if (data.auto_confirm) {
    await confirmStockHandover(handoverId, userId);
  }

  return newHandover;
}

/**
 * Confirm Stock Handover: Moves physical stock from WAREHOUSE to SALES
 */
export async function confirmStockHandover(handoverId: string, userId: string): Promise<any> {
  const h = (db.stock_handovers || []).find((item) => item._id === handoverId);
  if (!h) throw new Error("Data serah terima stok tidak ditemukan.");
  if (h.status === "CONFIRMED") return h;

  const targetWhId = h.warehouse_id || "off-1";
  const today = h.business_date || getTodayWIB();
  const nowStr = new Date().toISOString();

  for (const item of h.items || []) {
    const qty = Number(item.quantity);
    if (qty <= 0) continue;

    // Deduct Warehouse stock
    await createOrUpdateInventory("WAREHOUSE", targetWhId, item.sku_id, -qty);

    // Increase Salesman stock
    await createOrUpdateInventory("SALES", h.salesman_id, item.sku_id, qty);

    // Record TRANSFER_OUT movement
    await recordStockMovement({
      movementType: "TRANSFER_OUT",
      sourceLocationType: "WAREHOUSE",
      sourceLocationId: targetWhId,
      destLocationType: "SALES",
      destLocationId: h.salesman_id,
      skuId: item.sku_id,
      quantity: qty,
      referenceId: h._id,
      performedBy: userId,
      notes: `Handover ke Sales ${h.salesman_id} (${h.handover_code})`,
      businessDate: today,
    });

    // Update Sales Stock Ledger
    await upsertSalesStockLedger(h.salesman_id, today, item.sku_id, {
      loadedStock: qty,
      finalStock: qty,
    });
  }

  h.status = "CONFIRMED";
  h.confirmed_by = userId;
  h.confirmed_at = nowStr;
  h.updated_at = nowStr;

  await syncSingleDoc("stock_handovers", h._id, h);
  await recordAuditLog(userId, "STOCK_HANDOVER_CONFIRMED", "STOCK_HANDOVER", h._id, {
    handover_code: h.handover_code,
    salesman_id: h.salesman_id,
  });

  return h;
}

/**
 * Create Stock Return (Unload Van: SALES -> WAREHOUSE)
 */
export async function createStockReturn(data: {
  business_date?: string;
  warehouse_id?: string;
  salesman_id: string;
  items: Array<{ sku_id: string; quantity: number; notes?: string }>;
  notes?: string;
  auto_confirm?: boolean;
}, userId: string): Promise<any> {
  const targetDate = data.business_date || getTodayWIB();
  const targetWhId = data.warehouse_id || "off-1";
  const nowStr = new Date().toISOString();
  const returnId = genId("ret");
  const count = (db.stock_returns || []).length + 1;
  const returnCode = `RET-${targetDate.replace(/-/g, "")}-${String(count).padStart(3, "0")}`;

  const processedItems = data.items.map((it) => ({
    sku_id: it.sku_id,
    quantity: Number(it.quantity),
    notes: it.notes || "",
  }));

  const newReturn: any = {
    _id: returnId,
    id: returnId,
    return_code: returnCode,
    business_date: targetDate,
    warehouse_id: targetWhId,
    salesman_id: data.salesman_id,
    status: data.auto_confirm ? "CONFIRMED" : "DRAFT",
    items: processedItems,
    notes: data.notes || "",
    created_by: userId,
    created_at: nowStr,
    updated_at: nowStr,
  };

  if (!Array.isArray(db.stock_returns)) db.stock_returns = [];
  db.stock_returns.push(newReturn);
  await syncSingleDoc("stock_returns", returnId, newReturn);

  if (data.auto_confirm) {
    await confirmStockReturn(returnId, userId);
  }

  return newReturn;
}

/**
 * Confirm Stock Return: Moves physical stock from SALES to WAREHOUSE
 */
export async function confirmStockReturn(returnId: string, userId: string): Promise<any> {
  const r = (db.stock_returns || []).find((item) => item._id === returnId);
  if (!r) throw new Error("Data retur stok tidak ditemukan.");
  if (r.status === "CONFIRMED") return r;

  const targetWhId = r.warehouse_id || "off-1";
  const today = r.business_date || getTodayWIB();
  const nowStr = new Date().toISOString();

  for (const item of r.items || []) {
    const qty = Number(item.quantity);
    if (qty <= 0) continue;

    // Deduct Salesman stock
    await createOrUpdateInventory("SALES", r.salesman_id, item.sku_id, -qty);

    // Increase Warehouse stock
    await createOrUpdateInventory("WAREHOUSE", targetWhId, item.sku_id, qty);

    // Record RETURN_IN movement
    await recordStockMovement({
      movementType: "RETURN_IN",
      sourceLocationType: "SALES",
      sourceLocationId: r.salesman_id,
      destLocationType: "WAREHOUSE",
      destLocationId: targetWhId,
      skuId: item.sku_id,
      quantity: qty,
      referenceId: r._id,
      performedBy: userId,
      notes: `Retur dari Sales ${r.salesman_id} (${r.return_code})`,
      businessDate: today,
    });

    // Update Sales Stock Ledger
    await upsertSalesStockLedger(r.salesman_id, today, item.sku_id, {
      returnedStock: qty,
      finalStock: -qty,
    });
  }

  r.status = "CONFIRMED";
  r.confirmed_by = userId;
  r.confirmed_at = nowStr;
  r.updated_at = nowStr;

  await syncSingleDoc("stock_returns", r._id, r);
  await recordAuditLog(userId, "STOCK_RETURN_CONFIRMED", "STOCK_RETURN", r._id, {
    return_code: r.return_code,
    salesman_id: r.salesman_id,
  });

  return r;
}

/**
 * Create Inbound Stock Receiving from Supplier
 */
export async function createStockReceiving(data: {
  business_date?: string;
  warehouse_id?: string;
  supplier_name?: string;
  po_number?: string;
  items: Array<{ sku_id: string; quantity: number; unit_price?: number; notes?: string }>;
  notes?: string;
  auto_post?: boolean;
}, userId: string): Promise<any> {
  const targetDate = data.business_date || getTodayWIB();
  const targetWhId = data.warehouse_id || "off-1";
  const nowStr = new Date().toISOString();
  const receivingId = genId("rec");
  const count = (db.stock_receivings || []).length + 1;
  const receiveCode = data.po_number || `RCV-${targetDate.replace(/-/g, "")}-${String(count).padStart(3, "0")}`;

  const processedItems = data.items.map((it) => ({
    sku_id: it.sku_id,
    quantity: Number(it.quantity),
    unit_price: Number(it.unit_price || 0),
    notes: it.notes || "",
  }));

  const newReceiving: any = {
    _id: receivingId,
    id: receivingId,
    receive_code: receiveCode,
    po_number: receiveCode,
    business_date: targetDate,
    warehouse_id: targetWhId,
    supplier_name: data.supplier_name || "Supplier Utama",
    status: data.auto_post ? "POSTED" : "DRAFT",
    items: processedItems,
    notes: data.notes || "",
    created_by: userId,
    created_at: nowStr,
    updated_at: nowStr,
  };

  if (!Array.isArray(db.stock_receivings)) db.stock_receivings = [];
  db.stock_receivings.push(newReceiving);
  await syncSingleDoc("stock_receivings", receivingId, newReceiving);

  if (data.auto_post) {
    await postStockReceiving(receivingId, userId);
  }

  return newReceiving;
}

/**
 * Post Inbound Stock Receiving: Increases WAREHOUSE stock
 */
export async function postStockReceiving(receivingId: string, userId: string): Promise<any> {
  const r = (db.stock_receivings || []).find((item) => item._id === receivingId);
  if (!r) throw new Error("Data penerimaan barang tidak ditemukan.");
  if (r.status === "POSTED") return r;

  const targetWhId = r.warehouse_id || "off-1";
  const today = r.receiving_date || getTodayWIB();
  const nowStr = new Date().toISOString();

  for (const item of r.items || []) {
    const qty = Number(item.quantity);
    if (qty <= 0) continue;

    // Increase Warehouse stock
    await createOrUpdateInventory("WAREHOUSE", targetWhId, item.sku_id, qty);

    // Record PURCHASE_IN movement
    await recordStockMovement({
      movementType: "PURCHASE_IN",
      sourceLocationType: "SUPPLIER",
      sourceLocationId: r.supplier_name || "SUPPLIER",
      destLocationType: "WAREHOUSE",
      destLocationId: targetWhId,
      skuId: item.sku_id,
      quantity: qty,
      referenceId: r._id,
      performedBy: userId,
      notes: `Penerimaan Supplier ${r.supplier_name || ""} (${r.receiving_code})`,
      businessDate: today,
    });
  }

  r.status = "POSTED";
  r.posted_by = userId;
  r.posted_at = nowStr;
  r.updated_at = nowStr;

  await syncSingleDoc("stock_receivings", r._id, r);
  await recordAuditLog(userId, "STOCK_RECEIVING_POSTED", "STOCK_RECEIVING", r._id, {
    receiving_code: r.receiving_code,
    supplier_name: r.supplier_name,
  });

  return r;
}

/**
 * Process Stock Opname (Physical inventory adjustment against system stock)
 */
export async function processStockOpname(
  warehouseId: string,
  items: Array<{ sku_id: string; system_stock: number; physical_count: number }>,
  userId: string,
  notes?: string
): Promise<{ totalAdjusted: number }> {
  const targetWhId = warehouseId || "off-1";
  const today = getTodayWIB();
  let count = 0;

  for (const it of items) {
    const diff = Number(it.physical_count) - Number(it.system_stock);
    if (diff === 0) continue;

    // Adjust Warehouse inventory
    await createOrUpdateInventory("WAREHOUSE", targetWhId, it.sku_id, diff);

    // Record ADJUSTMENT movement
    await recordStockMovement({
      movementType: diff > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
      sourceLocationType: diff > 0 ? "NONE" : "WAREHOUSE",
      sourceLocationId: diff > 0 ? "" : targetWhId,
      destLocationType: diff > 0 ? "WAREHOUSE" : "NONE",
      destLocationId: diff > 0 ? targetWhId : "",
      skuId: it.sku_id,
      quantity: Math.abs(diff),
      referenceId: `opname-${Date.now()}`,
      performedBy: userId,
      notes: notes || "Stock Opname Fisik",
      businessDate: today,
    });

    count++;
  }

  await recordAuditLog(userId, "STOCK_OPNAME_PROCESSED", "INVENTORY", targetWhId, {
    total_adjusted_skus: count,
    notes,
  });

  return { totalAdjusted: count };
}

/**
 * Process Stock Adjustment (Manual IN / OUT adjustment)
 */
export async function recordStockAdjustment(
  warehouseId: string,
  items: Array<{ sku_id: string; quantity: number }>,
  adjustmentType: "IN" | "OUT",
  userId: string,
  notes?: string
): Promise<{ totalAdjusted: number }> {
  const targetWhId = warehouseId || "off-1";
  const today = getTodayWIB();
  let count = 0;

  for (const it of items) {
    const qty = Number(it.quantity);
    if (qty <= 0) continue;
    const diff = adjustmentType === "IN" ? qty : -qty;

    // Adjust Warehouse inventory
    await createOrUpdateInventory("WAREHOUSE", targetWhId, it.sku_id, diff);

    // Record movement
    await recordStockMovement({
      movementType: adjustmentType === "IN" ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
      sourceLocationType: adjustmentType === "IN" ? "NONE" : "WAREHOUSE",
      sourceLocationId: adjustmentType === "IN" ? "" : targetWhId,
      destLocationType: adjustmentType === "IN" ? "WAREHOUSE" : "NONE",
      destLocationId: adjustmentType === "IN" ? targetWhId : "",
      skuId: it.sku_id,
      quantity: qty,
      referenceId: `adj-${Date.now()}`,
      performedBy: userId,
      notes: notes || `Stock Adjustment ${adjustmentType}`,
      businessDate: today,
    });

    count++;
  }

  await recordAuditLog(userId, "STOCK_ADJUSTMENT_RECORDED", "INVENTORY", targetWhId, {
    adjustment_type: adjustmentType,
    total_items: count,
    notes,
  });

  return { totalAdjusted: count };
}

/**
 * Query Sales Stock Ledgers for daily 4-pillar reconciliation
 */
export function querySalesStockLedgers(params: {
  salesman_id?: string;
  business_date?: string;
  sku_id?: string;
}): { items: any[]; total: number } {
  let list = db.sales_stock_ledgers || [];

  if (params.salesman_id) {
    list = list.filter((l) => l.salesman_id === params.salesman_id);
  }
  if (params.business_date) {
    list = list.filter((l) => l.business_date === params.business_date);
  }
  if (params.sku_id) {
    list = list.filter((l) => l.sku_id === params.sku_id);
  }

  const enriched = list.map((l) => {
    const sku = db.skus.find((s) => s._id === l.sku_id);
    const sales = db.users.find((u) => u._id === l.salesman_id);
    return {
      ...l,
      sku_name: sku?.name || "SKU",
      sku_code: sku?.code || "-",
      salesman_name: sales?.name || "-",
    };
  });

  return { items: enriched, total: enriched.length };
}

import { db } from "./data.js";
import { firestoreDb } from "./firebase.js";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  getDocs,
  query,
  where,
  orderBy,
  limit,
  writeBatch,
  DocumentData,
  QueryConstraint,
} from "firebase/firestore";

let lastSyncTimestamp: string | null = null;
let lastSyncStatus: "SUCCESS" | "SYNCING" | "ERROR" | "IDLE" = "SUCCESS";
let lastSyncError: string | null = null;

// ============================================================================
// 1. TYPED FIRESTORE REPOSITORIES & MAPPERS (SSOT - NO IN-MEMORY ARRAYS)
// ============================================================================

export interface TransactionItem {
  sku_id: string;
  sku_code?: string;
  sku_name?: string;
  product_id?: string;
  uom?: string;
  unit?: string;
  quantity: number;
  base_quantity?: number;
  conversion_factor?: number;
  unit_price: number;
  discount_amount?: number;
  line_total: number;
  subtotal?: number;
}

export interface TransactionRecord {
  _id: string;
  id: string;
  invoice_number: string;
  client_order_id?: string;
  salesman_id: string;
  salesman_name?: string;
  outlet_id: string;
  outlet_name?: string;
  warehouse_id?: string;
  office_id?: string;
  order_status: "DRAFT" | "PENDING" | "CONFIRMED" | "DELIVERED" | "CANCELLED" | "VOID";
  status: "DRAFT" | "PENDING" | "CONFIRMED" | "DELIVERED" | "CANCELLED" | "VOID" | "COMPLETED";
  payment_status: "UNPAID" | "PARTIAL" | "PAID";
  payment_method: "CASH" | "TOP_7_DAYS" | "TOP_14_DAYS" | "TOP_30_DAYS" | "TRANSFER" | "TEMPO";
  items: TransactionItem[];
  subtotal: number;
  total_discount?: number;
  discount_total?: number;
  tax_amount?: number;
  total_amount: number;
  notes?: string;
  visit_id?: string;
  latitude?: number;
  longitude?: number;
  created_at: string;
  updated_at: string;
  created_by?: string;
  reconciled?: boolean;
}

export interface TransactionFilter {
  salesman_id?: string;
  outlet_id?: string;
  status?: string;
  payment_status?: string;
  from_date?: string;
  to_date?: string;
  search?: string;
  limit?: number;
  offset?: number;
}

export interface WarehouseStockRecord {
  _id: string;
  id: string;
  warehouse_id?: string;
  location_type: "WAREHOUSE" | "SALES";
  location_id: string;
  sku_id: string;
  sku_code: string;
  sku_name: string;
  base_uom: string;
  quantity: number;
  allocated_quantity?: number;
  available_quantity?: number;
  stock_on_hand?: number;
  uom_conversions?: Array<{ uom: string; conversion_factor: number }>;
  min_stock_alert?: number;
  last_movement_ref?: string;
  updated_at: string;
}

export interface StockMovementRecord {
  _id: string;
  id: string;
  movement_id: string;
  location_type: "WAREHOUSE" | "SALES";
  location_id: string;
  warehouse_id?: string;
  salesman_id?: string;
  sku_id: string;
  sku_code: string;
  sku_name: string;
  type: string;
  movement_type: string;
  direction: "IN" | "OUT";
  quantity: number;
  qty_change: number;
  previous_qty: number;
  new_qty: number;
  reference_id: string;
  reason?: string;
  created_by: string;
  created_at: string;
}

export interface StockMovementFilter {
  location_id?: string;
  sku_id?: string;
  reference_id?: string;
  direction?: "IN" | "OUT";
  limit?: number;
}

export interface SkuRecord {
  _id: string;
  id: string;
  code: string;
  name: string;
  product_id?: string;
  uom?: string;
  unit?: string;
  pack_size?: number;
  base_uom?: string;
  uom_conversions?: Array<{ uom: string; conversion_factor: number }>;
  base_price?: number;
  price?: number;
  status: "ACTIVE" | "INACTIVE";
}

/**
 * Fetch a single Transaction directly from Firestore SSOT
 */
export async function fetchTransactionById(id: string): Promise<TransactionRecord | null> {
  if (!id) return null;
  try {
    const docRef = doc(firestoreDb, "transactions", id);
    const snap = await getDoc(docRef);
    if (snap.exists()) {
      const data = snap.data();
      return { _id: snap.id, id: snap.id, ...data } as TransactionRecord;
    }

    // Query by invoice_number if id is not document id
    const q = query(collection(firestoreDb, "transactions"), where("invoice_number", "==", id), limit(1));
    const querySnap = await getDocs(q);
    if (!querySnap.empty) {
      const d = querySnap.docs[0];
      return { _id: d.id, id: d.id, ...d.data() } as TransactionRecord;
    }
  } catch (err) {
    console.error(`[Persistence] Error fetching transaction '${id}' from Firestore:`, err);
  }
  return null;
}

/**
 * Save / Update a Transaction directly to Firestore SSOT
 */
export async function saveTransactionToFirestore(txn: TransactionRecord): Promise<void> {
  const docId = String(txn._id || txn.id || txn.invoice_number);
  const docRef = doc(firestoreDb, "transactions", docId);
  const cleanData = JSON.parse(JSON.stringify(txn, (_k, v) => (v === undefined ? null : v)));
  await setDoc(docRef, cleanData, { merge: true });
}

/**
 * Update transaction status in Firestore
 */
export async function updateTransactionStatusInFirestore(
  id: string,
  status: "DRAFT" | "PENDING" | "CONFIRMED" | "DELIVERED" | "CANCELLED" | "VOID" | "COMPLETED",
  additionalData: Record<string, any> = {}
): Promise<void> {
  const docRef = doc(firestoreDb, "transactions", id);
  const cleanData = JSON.parse(
    JSON.stringify(
      {
        status,
        order_status: status,
        updated_at: new Date().toISOString(),
        ...additionalData,
      },
      (_k, v) => (v === undefined ? null : v)
    )
  );
  await setDoc(docRef, cleanData, { merge: true });
}

/**
 * Query transactions directly from Firestore SSOT
 */
export async function queryTransactionsFromFirestore(
  filter: TransactionFilter = {}
): Promise<{ items: TransactionRecord[]; total: number }> {
  try {
    const colRef = collection(firestoreDb, "transactions");
    const constraints: QueryConstraint[] = [];

    if (filter.salesman_id) {
      constraints.push(where("salesman_id", "==", filter.salesman_id));
    }
    if (filter.outlet_id) {
      constraints.push(where("outlet_id", "==", filter.outlet_id));
    }
    if (filter.status) {
      constraints.push(where("status", "==", filter.status));
    }
    if (filter.payment_status) {
      constraints.push(where("payment_status", "==", filter.payment_status));
    }

    // Query Firestore
    const q = query(colRef, ...constraints);
    const snap = await getDocs(q);

    let items: TransactionRecord[] = [];
    snap.forEach((d) => {
      items.push({ _id: d.id, id: d.id, ...d.data() } as TransactionRecord);
    });

    // In-memory post-filtering for text search & dates
    if (filter.search) {
      const qLower = filter.search.toLowerCase();
      items = items.filter(
        (t) =>
          t.invoice_number?.toLowerCase().includes(qLower) ||
          t.outlet_name?.toLowerCase().includes(qLower) ||
          t.salesman_name?.toLowerCase().includes(qLower)
      );
    }
    if (filter.from_date) {
      items = items.filter((t) => (t.created_at || "").slice(0, 10) >= filter.from_date!);
    }
    if (filter.to_date) {
      items = items.filter((t) => (t.created_at || "").slice(0, 10) <= filter.to_date!);
    }

    // Sort descending by created_at
    items.sort((a, b) => new Date(b.created_at || 0).getTime() - new Date(a.created_at || 0).getTime());

    const total = items.length;
    const offset = filter.offset || 0;
    const maxLimit = filter.limit ? filter.limit : items.length;
    const paginated = items.slice(offset, offset + maxLimit);

    return { items: paginated, total };
  } catch (err) {
    console.error("[Persistence] Error querying transactions from Firestore:", err);
    return { items: [], total: 0 };
  }
}

/**
 * Fetch a single WarehouseStock record from Firestore SSOT
 */
export async function fetchWarehouseStock(
  locationId: string,
  skuId: string,
  locationType: "WAREHOUSE" | "SALES" = "WAREHOUSE"
): Promise<WarehouseStockRecord | null> {
  try {
    const stockId = `${locationId}_${skuId}`;
    const snap = await getDoc(doc(firestoreDb, "warehouse_stocks", stockId));
    if (snap.exists()) {
      return { _id: snap.id, id: snap.id, ...snap.data() } as WarehouseStockRecord;
    }

    // Fallback lookup in inventory collection
    const invId = `inv-${locationType}-${locationId}-${skuId}`;
    const invSnap = await getDoc(doc(firestoreDb, "inventory", invId));
    if (invSnap.exists()) {
      const data = invSnap.data();
      return {
        _id: stockId,
        id: stockId,
        warehouse_id: locationType === "WAREHOUSE" ? locationId : undefined,
        location_type: locationType,
        location_id: locationId,
        sku_id: skuId,
        sku_code: data.sku_code || "",
        sku_name: data.sku_name || "",
        base_uom: data.base_uom || data.unit || "PCS",
        quantity: Number(data.quantity ?? data.stock_on_hand ?? 0),
        available_quantity: Number(data.available_stock ?? data.stock_on_hand ?? 0),
        stock_on_hand: Number(data.stock_on_hand ?? 0),
        updated_at: data.updated_at || new Date().toISOString(),
      };
    }
  } catch (err) {
    console.error(`[Persistence] Error fetching warehouse stock for ${locationId}_${skuId}:`, err);
  }
  return null;
}

/**
 * Query warehouse stocks for a given location or all locations
 */
export async function queryWarehouseStocksFromFirestore(
  locationId?: string
): Promise<WarehouseStockRecord[]> {
  try {
    const colRef = collection(firestoreDb, "warehouse_stocks");
    const q = locationId ? query(colRef, where("location_id", "==", locationId)) : query(colRef);
    const snap = await getDocs(q);

    const results: WarehouseStockRecord[] = [];
    snap.forEach((d) => {
      results.push({ _id: d.id, id: d.id, ...d.data() } as WarehouseStockRecord);
    });

    if (results.length > 0) return results;

    // Fallback to inventory collection if warehouse_stocks is empty
    const invRef = collection(firestoreDb, "inventory");
    const invQ = locationId
      ? query(invRef, where("location_id", "==", locationId))
      : query(invRef);
    const invSnap = await getDocs(invQ);

    invSnap.forEach((d) => {
      const data = d.data();
      results.push({
        _id: d.id,
        id: d.id,
        location_type: data.location_type || "WAREHOUSE",
        location_id: data.location_id || data.office_id || "off-1",
        sku_id: data.sku_id,
        sku_code: data.sku_code || "",
        sku_name: data.sku_name || "",
        base_uom: data.unit || "PCS",
        quantity: Number(data.quantity ?? data.stock_on_hand ?? 0),
        available_quantity: Number(data.available_stock ?? data.stock_on_hand ?? 0),
        stock_on_hand: Number(data.stock_on_hand ?? 0),
        updated_at: data.updated_at || new Date().toISOString(),
      });
    });

    return results;
  } catch (err) {
    console.error("[Persistence] Error querying warehouse stocks from Firestore:", err);
    return [];
  }
}

/**
 * Fetch a single SKU from Firestore SSOT
 */
export async function fetchSkuByIdFromFirestore(skuId: string): Promise<SkuRecord | null> {
  if (!skuId) return null;
  try {
    const snap = await getDoc(doc(firestoreDb, "skus", skuId));
    if (snap.exists()) {
      return { _id: snap.id, id: snap.id, ...snap.data() } as SkuRecord;
    }
  } catch (err) {
    console.error(`[Persistence] Error fetching SKU '${skuId}' from Firestore:`, err);
  }
  return null;
}

/**
 * Fetch all active SKUs directly from Firestore SSOT
 */
export async function fetchAllActiveSkusFromFirestore(): Promise<SkuRecord[]> {
  try {
    const q = query(collection(firestoreDb, "skus"), where("status", "==", "ACTIVE"));
    const snap = await getDocs(q);
    const items: SkuRecord[] = [];
    snap.forEach((d) => {
      items.push({ _id: d.id, id: d.id, ...d.data() } as SkuRecord);
    });
    return items;
  } catch (err) {
    console.error("[Persistence] Error fetching active SKUs from Firestore:", err);
    return [];
  }
}

/**
 * Converts SKU quantity from any specified UOM to the Base Unit.
 * Handles pack sizes, carton/dus/slop multipliers, and custom uom_conversions.
 */
export function convertToBaseUnit(
  sku: SkuRecord | any,
  requestedQty: number,
  requestedUom?: string
): {
  baseQty: number;
  conversionFactor: number;
  baseUom: string;
  resolvedUom: string;
} {
  const qty = Math.max(0, Math.floor(requestedQty || 0));
  const baseUom = (sku?.base_uom || "PCS").toUpperCase();
  const reqUom = (requestedUom || sku?.uom || sku?.unit || baseUom).toUpperCase();

  // If already in base UOM, conversion factor is 1
  if (reqUom === baseUom || reqUom === "PCS" || reqUom === "UNIT" || reqUom === "BIJI" || reqUom === "BKS") {
    return {
      baseQty: qty,
      conversionFactor: 1,
      baseUom,
      resolvedUom: reqUom,
    };
  }

  // 1. Check custom uom_conversions array on SKU
  if (Array.isArray(sku?.uom_conversions) && sku.uom_conversions.length > 0) {
    const found = sku.uom_conversions.find(
      (c: any) => String(c.uom).toUpperCase() === reqUom
    );
    if (found && Number(found.conversion_factor) > 0) {
      const factor = Number(found.conversion_factor);
      return {
        baseQty: qty * factor,
        conversionFactor: factor,
        baseUom,
        resolvedUom: reqUom,
      };
    }
  }

  // 2. Check pack_size if ordered in outer packaging UOM
  const outerUoms = ["DUS", "CTN", "KARTON", "BOX", "SLOP", "BAL", "PACK", "PAK", "GLN"];
  if (outerUoms.includes(reqUom) && sku?.pack_size && Number(sku.pack_size) > 1) {
    const factor = Number(sku.pack_size);
    return {
      baseQty: qty * factor,
      conversionFactor: factor,
      baseUom,
      resolvedUom: reqUom,
    };
  }

  // Default fallback: 1:1
  return {
    baseQty: qty,
    conversionFactor: 1,
    baseUom,
    resolvedUom: reqUom,
  };
}

// ============================================================================
// 2. SYNC & PURGE INFRASTRUCTURE (BACKWARD COMPATIBILITY)
// ============================================================================

export const ALL_SYNC_COLLECTIONS: Array<{ key: string; colName: string }> = [
  { key: "users", colName: "users" }, { key: "offices", colName: "offices" },
  { key: "provinces", colName: "provinces" }, { key: "regencies", colName: "regencies" },
  { key: "districts", colName: "districts" }, { key: "villages", colName: "villages" },
  { key: "areas", colName: "areas" }, { key: "channels", colName: "channels" },
  { key: "routes", colName: "routes" }, { key: "products", colName: "products" },
  { key: "skus", colName: "skus" }, { key: "prices", colName: "prices" },
  { key: "promos", colName: "promos" }, { key: "salesmen", colName: "salesmen" },
  { key: "open_call_reasons", colName: "open_call_reasons" }, { key: "outlets", colName: "outlets" },
  { key: "sales_outlets", colName: "sales_outlets" }, { key: "call_plans", colName: "call_plans" },
  { key: "call_plan_items", colName: "call_plan_items" }, { key: "attendance", colName: "attendance" },
  { key: "visits", colName: "visits" }, { key: "transactions", colName: "transactions" },
  { key: "inventory", colName: "inventory" }, { key: "warehouse_stocks", colName: "warehouse_stocks" },
  { key: "stock_movements", colName: "stock_movements" }, { key: "stock_handovers", colName: "stock_handovers" },
  { key: "stock_returns", colName: "stock_returns" }, { key: "stock_receivings", colName: "stock_receivings" },
  { key: "sales_stock_ledgers", colName: "sales_stock_ledgers" }, { key: "targets", colName: "targets" },
  { key: "cash_deposits", colName: "cash_deposits" }, { key: "receivables", colName: "receivables" },
  { key: "daily_reconciliations", colName: "daily_reconciliations" }, { key: "audit_logs", colName: "audit_logs" },
  { key: "gps_events", colName: "gps_events" },
];

export function getSyncStats() {
  const collectionCounts: Record<string, number> = {};
  for (const { key, colName } of ALL_SYNC_COLLECTIONS) {
    const arr = (db as any)[key];
    collectionCounts[colName] = Array.isArray(arr) ? arr.length : 0;
  }
  return {
    databaseEngine: "Google Cloud Firestore (Single Source of Truth)",
    isCloudConnected: true,
    isFirestoreReady: true,
    isQuotaPaused: false,
    lastSyncTimestamp,
    lastSyncStatus,
    lastSyncError,
    pendingDirtyDocs: 0,
    totalCollections: ALL_SYNC_COLLECTIONS.length,
    totalRecords: Object.values(collectionCounts).reduce((a, b) => a + b, 0),
    collectionCounts,
  };
}

export const getFirestoreSyncStats = getSyncStats;

export function normalizeDocumentFields(docData: any): any {
  if (!docData || typeof docData !== "object") return docData;
  const normalized = { ...docData };

  // Ensure id & _id
  const idVal = normalized._id || normalized.id;
  if (idVal) {
    normalized._id = idVal;
    normalized.id = idVal;
  }

  // Bidirectional aliases for seamless snake_case & camelCase interoperability
  const aliasPairs: Array<[string, string]> = [
    ["outlet_name", "outletName"],
    ["outlet_code", "outletCode"],
    ["owner_name", "ownerName"],
    ["office_id", "officeId"],
    ["office_name", "officeName"],
    ["office_code", "officeCode"],
    ["area_id", "areaId"],
    ["area_name", "areaName"],
    ["channel_id", "channelId"],
    ["channel_name", "channelName"],
    ["route_id", "routeId"],
    ["route_name", "routeName"],
    ["salesman_id", "salesmanId"],
    ["sales_id", "salesId"],
    ["product_id", "productId"],
    ["product_code", "productCode"],
    ["product_name", "productName"],
    ["sku_id", "skuId"],
    ["sku_code", "skuCode"],
    ["sku_name", "skuName"],
    ["base_price", "basePrice"],
    ["created_at", "createdAt"],
    ["updated_at", "updatedAt"],
    ["photo_url", "photoUrl"],
    ["photo_url", "imageUrl"],
    ["lifecycle_status", "lifecycleStatus"],
    ["check_in_time", "checkInTime"],
    ["check_out_time", "checkOutTime"],
    ["check_in_lat", "checkInLat"],
    ["check_in_lng", "checkInLng"],
    ["check_out_lat", "checkOutLat"],
    ["check_out_lng", "checkOutLng"],
    ["warehouse_id", "warehouseId"],
  ];

  for (const [snake, camel] of aliasPairs) {
    if (normalized[snake] !== undefined && normalized[camel] === undefined) {
      normalized[camel] = normalized[snake];
    } else if (normalized[camel] !== undefined && normalized[snake] === undefined) {
      normalized[snake] = normalized[camel];
    }
  }

  return normalized;
}

/**
 * Load documents from Cloud Firestore into in-memory operational state (initial boot mirror)
 */
export async function loadAllFromFirestore(inMemoryDb: any): Promise<boolean> {
  console.log("[Persistence] Hydrating operational collections from Cloud Firestore SSOT...");
  try {
    for (const { key, colName } of ALL_SYNC_COLLECTIONS) {
      try {
        const snap = await getDocs(collection(firestoreDb, colName));
        const items: any[] = [];
        snap.forEach((d) => {
          items.push(normalizeDocumentFields({ _id: d.id, id: d.id, ...d.data() }));
        });
        // Unconditionally mirror Firestore SSOT directly into operational memory
        (inMemoryDb as any)[key] = items;
      } catch (colErr) {
        console.warn(`[Persistence] Notice on loading collection '${colName}':`, colErr);
      }
    }

    // Load company profile & system settings with multi-key fallback
    try {
      let cpLoaded = false;
      for (const col of ["companies", "company_profile"]) {
        for (const docKey of ["main", "default", "profile"]) {
          const cpSnap = await getDoc(doc(firestoreDb, col, docKey));
          if (cpSnap.exists()) {
            inMemoryDb.company_profile = { ...inMemoryDb.company_profile, ...cpSnap.data() };
            cpLoaded = true;
            break;
          }
        }
        if (cpLoaded) break;
      }
    } catch (_) {}

    try {
      let stLoaded = false;
      for (const col of ["system_settings", "settings"]) {
        for (const docKey of ["global", "default"]) {
          const stSnap = await getDoc(doc(firestoreDb, col, docKey));
          if (stSnap.exists()) {
            inMemoryDb.settings = { ...inMemoryDb.settings, ...stSnap.data() };
            stLoaded = true;
            break;
          }
        }
        if (stLoaded) break;
      }
    } catch (_) {}

    console.log("[Persistence] Collections hydrated from Cloud Firestore successfully.");
    return true;
  } catch (err: any) {
    console.error("[Persistence] Failed to hydrate from Cloud Firestore:", err);
    return false;
  }
}

/**
 * Persist document to Cloud Firestore as Single Source of Truth
 */
export async function syncSingleDoc(colName: string, docId: string, data: any): Promise<boolean> {
  if (!docId) return false;
  lastSyncStatus = "SYNCING";
  lastSyncError = null;

  try {
    const normalized = normalizeDocumentFields(data);
    const cleanData = JSON.parse(
      JSON.stringify(normalized, (_k, v) => (v === undefined ? null : v))
    );

    const docRef = doc(firestoreDb, colName, String(docId));
    await setDoc(docRef, cleanData, { merge: true });

    lastSyncTimestamp = new Date().toISOString();
    lastSyncStatus = "SUCCESS";
    return true;
  } catch (err: any) {
    lastSyncStatus = "ERROR";
    lastSyncError = err?.message || String(err);
    console.error(`[Persistence] Error writing doc '${docId}' to Firestore '${colName}':`, err);
    return false;
  }
}

/**
 * Delete document from Cloud Firestore
 */
export async function deleteSingleDoc(colName: string, docId: string): Promise<boolean> {
  if (!docId) return false;
  lastSyncStatus = "SYNCING";
  try {
    const docRef = doc(firestoreDb, colName, String(docId));
    await deleteDoc(docRef);

    lastSyncTimestamp = new Date().toISOString();
    lastSyncStatus = "SUCCESS";
    return true;
  } catch (err: any) {
    lastSyncStatus = "ERROR";
    lastSyncError = err?.message || String(err);
    console.error(`[Persistence] Error deleting doc '${docId}' from '${colName}':`, err);
    return false;
  }
}

/**
 * Full sync to Firestore with chunked batches of 400 (max 500)
 */
export async function syncToFirestore(
  _forceAll = false,
  _skipCache = false
): Promise<{ success: boolean; syncedCount: number; message: string }> {
  console.log("[Persistence] Executing idempotent chunked sync to Cloud Firestore...");
  lastSyncStatus = "SYNCING";
  lastSyncError = null;
  let totalSynced = 0;

  try {
    for (const { key, colName } of ALL_SYNC_COLLECTIONS) {
      const items = (db as any)[key];
      if (Array.isArray(items) && items.length > 0) {
        const batchSize = 400;
        for (let i = 0; i < items.length; i += batchSize) {
          const chunk = items.slice(i, i + batchSize);
          const batch = writeBatch(firestoreDb);
          for (const item of chunk) {
            const docId = String(item._id || item.id || item.code || `doc-${Date.now()}`);
            const cleanData = JSON.parse(
              JSON.stringify(item, (_k, v) => (v === undefined ? null : v))
            );
            batch.set(doc(firestoreDb, colName, docId), cleanData, { merge: true });
            totalSynced++;
          }
          await batch.commit();
        }
      }
    }

    lastSyncTimestamp = new Date().toISOString();
    lastSyncStatus = "SUCCESS";
    return {
      success: true,
      syncedCount: totalSynced,
      message: `Berhasil sinkronisasi ${totalSynced} dokumen ke Google Cloud Firestore.`,
    };
  } catch (err: any) {
    lastSyncStatus = "ERROR";
    lastSyncError = err?.message || String(err);
    return {
      success: false,
      syncedCount: totalSynced,
      message: "Gagal sinkronisasi ke Cloud Firestore: " + (err?.message || String(err)),
    };
  }
}

export const OPERATIONAL_COLLECTIONS: Array<{ key: string; colName: string }> = [
  { key: "outlets", colName: "outlets" },
  { key: "sales_outlets", colName: "sales_outlets" },
  { key: "call_plans", colName: "call_plans" },
  { key: "call_plan_items", colName: "call_plan_items" },
  { key: "attendance", colName: "attendance" },
  { key: "visits", colName: "visits" },
  { key: "transactions", colName: "transactions" },
  { key: "inventory", colName: "inventory" },
  { key: "warehouse_stocks", colName: "warehouse_stocks" },
  { key: "stock_movements", colName: "stock_movements" },
  { key: "stock_handovers", colName: "stock_handovers" },
  { key: "stock_returns", colName: "stock_returns" },
  { key: "stock_receivings", colName: "stock_receivings" },
  { key: "stock_adjustments", colName: "stock_adjustments" },
  { key: "sales_stock_ledgers", colName: "sales_stock_ledgers" },
  { key: "targets", colName: "targets" },
  { key: "cash_deposits", colName: "cash_deposits" },
  { key: "receivables", colName: "receivables" },
  { key: "daily_reconciliations", colName: "daily_reconciliations" },
  { key: "audit_logs", colName: "audit_logs" },
  { key: "gps_events", colName: "gps_events" },
  { key: "idempotency_keys", colName: "idempotency_keys" },
  { key: "notifications", colName: "notifications" },
];

export async function purgeAllFirestoreData(): Promise<{ success: boolean; message: string; deletedCount: number }> {
  console.log("[Persistence] Purging operational collections from Cloud Firestore...");
  let deletedCount = 0;
  try {
    for (const { key, colName } of OPERATIONAL_COLLECTIONS) {
      try {
        const snap = await getDocs(collection(firestoreDb, colName));
        if (!snap.empty) {
          const docs = snap.docs;
          const batchSize = 400; // Cloud Firestore limit is max 500 per batch
          for (let i = 0; i < docs.length; i += batchSize) {
            const chunk = docs.slice(i, i + batchSize);
            const batch = writeBatch(firestoreDb);
            for (const d of chunk) {
              batch.delete(doc(firestoreDb, colName, d.id));
              deletedCount++;
            }
            await batch.commit();
          }
        }
        if (Array.isArray((db as any)[key])) {
          (db as any)[key] = [];
        }
      } catch (colErr) {
        console.warn(`[Persistence] Notice purging collection '${colName}':`, colErr);
      }
    }
    lastSyncTimestamp = new Date().toISOString();
    lastSyncStatus = "SUCCESS";
    return {
      success: true,
      message: `Berhasil menghapus ${deletedCount} dokumen operasional dari Cloud Firestore.`,
      deletedCount,
    };
  } catch (err: any) {
    return {
      success: false,
      message: "Gagal menghapus data Firestore: " + (err?.message || String(err)),
      deletedCount,
    };
  }
}

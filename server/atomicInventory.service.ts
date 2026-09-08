import { doc, getDoc, runTransaction } from "firebase/firestore";
import { firestoreDb } from "./firebase.js";

export class InsufficientStockError extends Error {
  constructor(
    public skuId: string,
    public skuCode: string,
    public skuName: string,
    public currentStock: number,
    public requestedQty: number
  ) {
    const code = skuCode || skuId || "-";
    const name = skuName || "-";
    super(
      `Stok tidak mencukupi untuk SKU [${code}] ${name}. Tersedia: ${currentStock}, Diminta: ${requestedQty}`
    );
    this.name = "InsufficientStockError";
  }
}

function cleanUndefined<T extends Record<string, any>>(obj: T): T {
  const result: any = {};
  for (const [key, val] of Object.entries(obj)) {
    if (val !== undefined) {
      result[key] = val;
    }
  }
  return result;
}

export interface StockDeductionItem {
  skuId: string;
  skuCode: string;
  skuName: string;
  requestedQty: number; // Base unit quantity (integer)
  uom?: string;
  baseUom?: string;
  unitPrice?: number;
  discountAmount?: number;
  lineTotal?: number;
}

export interface StockDeductionResult {
  success: boolean;
  referenceId: string;
  locationType: "WAREHOUSE" | "SALES";
  locationId: string;
  timestamp: string;
  movementsCreated: number;
}

/**
 * Deduct inventory atomically using Firestore runTransaction.
 * Guarantees strict ACID isolation, prevents race condition and negative stock.
 * Phase 1: All document reads MUST execute before any document writes.
 * Phase 2: Atomically update warehouse_stocks & inventory, and log stock_movements.
 */
export async function deductInventoryAtomic(params: {
  locationType: "WAREHOUSE" | "SALES";
  locationId: string;
  items: StockDeductionItem[];
  referenceId: string;
  referenceType: "SALES_ORDER" | "TRANSFER_OUT" | "ADJUSTMENT_OUT";
  performedByUserId: string;
}): Promise<StockDeductionResult> {
  const { locationType, locationId, items, referenceId, referenceType, performedByUserId } = params;
  const now = new Date().toISOString();

  if (!items || items.length === 0) {
    return {
      success: true,
      referenceId,
      locationType,
      locationId,
      timestamp: now,
      movementsCreated: 0,
    };
  }

  await runTransaction(firestoreDb, async (transaction) => {
    // -------------------------------------------------------------
    // PHASE 1: READ ALL STOCK DOCUMENTS (FIRESTORE TRANSACTION RULE)
    // -------------------------------------------------------------
    const pendingUpdates: Array<{
      stockRef: any;
      invRef: any;
      currentStock: number;
      newStock: number;
      item: StockDeductionItem;
      stockDocExists: boolean;
      invDocExists: boolean;
    }> = [];

    for (const item of items) {
      if (item.requestedQty <= 0) continue;

      // Check deterministic keys in warehouse_stocks and inventory
      const stockDocId = `${locationId}_${item.skuId}`;
      const invDocId = `inv-${locationType}-${locationId}-${item.skuId}`;

      const stockRef = doc(firestoreDb, "warehouse_stocks", stockDocId);
      const invRef = doc(firestoreDb, "inventory", invDocId);

      const [stockSnap, invSnap] = await Promise.all([
        transaction.get(stockRef),
        transaction.get(invRef),
      ]);

      let currentStock = 0;
      let stockDocExists = false;
      let invDocExists = false;

      if (stockSnap.exists()) {
        stockDocExists = true;
        const data = stockSnap.data();
        currentStock = Number(data.quantity ?? data.available_quantity ?? data.stock_on_hand ?? 0);
      } else if (invSnap.exists()) {
        invDocExists = true;
        const data = invSnap.data();
        currentStock = Number(data.available_stock ?? data.stock_on_hand ?? data.quantity ?? 0);
      }

      if (invSnap.exists()) {
        invDocExists = true;
      }

      // Strict validation: Stock must be >= requestedQty
      if (currentStock < item.requestedQty) {
        throw new InsufficientStockError(
          item.skuId,
          item.skuCode,
          item.skuName,
          currentStock,
          item.requestedQty
        );
      }

      pendingUpdates.push({
        stockRef,
        invRef,
        currentStock,
        newStock: currentStock - item.requestedQty,
        item,
        stockDocExists,
        invDocExists,
      });
    }

    // -------------------------------------------------------------
    // PHASE 2: ATOMIC WRITES & STOCK MOVEMENT AUDIT TRAIL
    // -------------------------------------------------------------
    for (const record of pendingUpdates) {
      const { stockRef, invRef, currentStock, newStock, item, stockDocExists, invDocExists } = record;

      // 1. Update warehouse_stocks
      const stockPayload = cleanUndefined({
        _id: `${locationId}_${item.skuId}`,
        id: `${locationId}_${item.skuId}`,
        warehouse_id: locationType === "WAREHOUSE" ? locationId : undefined,
        location_type: locationType,
        location_id: locationId,
        sku_id: item.skuId,
        sku_code: item.skuCode || item.skuId || "-",
        sku_name: item.skuName || "-",
        base_uom: item.baseUom || item.uom || "PCS",
        quantity: newStock,
        available_quantity: newStock,
        stock_on_hand: newStock,
        last_movement_ref: referenceId,
        updated_at: now,
      });

      if (stockDocExists) {
        transaction.update(stockRef, cleanUndefined({
          quantity: newStock,
          available_quantity: newStock,
          stock_on_hand: newStock,
          last_movement_ref: referenceId,
          updated_at: now,
        }));
      } else {
        transaction.set(stockRef, stockPayload, { merge: true });
      }

      // 2. Synchronize inventory balance
      const invPayload = cleanUndefined({
        _id: `inv-${locationType}-${locationId}-${item.skuId}`,
        id: `inv-${locationType}-${locationId}-${item.skuId}`,
        location_type: locationType,
        location_id: locationId,
        office_id: locationType === "WAREHOUSE" ? locationId : undefined,
        warehouse_id: locationType === "WAREHOUSE" ? locationId : undefined,
        salesman_id: locationType === "SALES" ? locationId : undefined,
        sku_id: item.skuId,
        sku_code: item.skuCode || item.skuId || "-",
        sku_name: item.skuName || "-",
        stock_on_hand: newStock,
        available_stock: newStock,
        quantity: newStock,
        status: "ACTIVE",
        updated_at: now,
      });

      if (invDocExists) {
        transaction.update(invRef, cleanUndefined({
          stock_on_hand: newStock,
          available_stock: newStock,
          quantity: newStock,
          updated_at: now,
        }));
      } else {
        transaction.set(invRef, invPayload, { merge: true });
      }

      // 3. Write Stock Movement log (Audit Trail / Stock Card)
      const movementId = `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const movementRef = doc(firestoreDb, "stock_movements", movementId);

      transaction.set(movementRef, cleanUndefined({
        _id: movementId,
        id: movementId,
        movement_id: movementId,
        location_type: locationType,
        location_id: locationId,
        warehouse_id: locationType === "WAREHOUSE" ? locationId : undefined,
        salesman_id: locationType === "SALES" ? locationId : undefined,
        sku_id: item.skuId,
        sku_code: item.skuCode || item.skuId || "-",
        sku_name: item.skuName || "-",
        type: referenceType,
        movement_type: referenceType,
        direction: "OUT",
        quantity: item.requestedQty,
        qty_change: -item.requestedQty,
        previous_qty: currentStock,
        new_qty: newStock,
        reference_id: referenceId,
        created_by: performedByUserId,
        created_at: now,
      }));
    }
  });

  return {
    success: true,
    referenceId,
    locationType,
    locationId,
    timestamp: now,
    movementsCreated: items.length,
  };
}

/**
 * Reverse inventory deduction atomically (e.g. for cancelled or voided transactions).
 */
export async function restoreInventoryAtomic(params: {
  locationType: "WAREHOUSE" | "SALES";
  locationId: string;
  items: StockDeductionItem[];
  referenceId: string;
  reason: string;
  performedByUserId: string;
}): Promise<StockDeductionResult> {
  const { locationType, locationId, items, referenceId, reason, performedByUserId } = params;
  const now = new Date().toISOString();

  if (!items || items.length === 0) {
    return {
      success: true,
      referenceId,
      locationType,
      locationId,
      timestamp: now,
      movementsCreated: 0,
    };
  }

  await runTransaction(firestoreDb, async (transaction) => {
    // PHASE 1: READ
    const pendingRestores: Array<{
      stockRef: any;
      invRef: any;
      currentStock: number;
      newStock: number;
      item: StockDeductionItem;
      stockDocExists: boolean;
      invDocExists: boolean;
    }> = [];

    for (const item of items) {
      if (item.requestedQty <= 0) continue;

      const stockDocId = `${locationId}_${item.skuId}`;
      const invDocId = `inv-${locationType}-${locationId}-${item.skuId}`;

      const stockRef = doc(firestoreDb, "warehouse_stocks", stockDocId);
      const invRef = doc(firestoreDb, "inventory", invDocId);

      const [stockSnap, invSnap] = await Promise.all([
        transaction.get(stockRef),
        transaction.get(invRef),
      ]);

      let currentStock = 0;
      let stockDocExists = false;
      let invDocExists = false;

      if (stockSnap.exists()) {
        stockDocExists = true;
        const data = stockSnap.data();
        currentStock = Number(data.quantity ?? data.available_quantity ?? data.stock_on_hand ?? 0);
      } else if (invSnap.exists()) {
        invDocExists = true;
        const data = invSnap.data();
        currentStock = Number(data.available_stock ?? data.stock_on_hand ?? data.quantity ?? 0);
      }

      if (invSnap.exists()) invDocExists = true;

      pendingRestores.push({
        stockRef,
        invRef,
        currentStock,
        newStock: currentStock + item.requestedQty,
        item,
        stockDocExists,
        invDocExists,
      });
    }

    // PHASE 2: WRITE
    for (const record of pendingRestores) {
      const { stockRef, invRef, currentStock, newStock, item, stockDocExists, invDocExists } = record;

      if (stockDocExists) {
        transaction.update(stockRef, cleanUndefined({
          quantity: newStock,
          available_quantity: newStock,
          stock_on_hand: newStock,
          last_movement_ref: referenceId,
          updated_at: now,
        }));
      } else {
        transaction.set(
          stockRef,
          cleanUndefined({
            _id: `${locationId}_${item.skuId}`,
            id: `${locationId}_${item.skuId}`,
            warehouse_id: locationType === "WAREHOUSE" ? locationId : undefined,
            location_type: locationType,
            location_id: locationId,
            sku_id: item.skuId,
            sku_code: item.skuCode || item.skuId || "-",
            sku_name: item.skuName || "-",
            base_uom: item.baseUom || item.uom || "PCS",
            quantity: newStock,
            available_quantity: newStock,
            stock_on_hand: newStock,
            last_movement_ref: referenceId,
            updated_at: now,
          }),
          { merge: true }
        );
      }

      if (invDocExists) {
        transaction.update(invRef, cleanUndefined({
          stock_on_hand: newStock,
          available_stock: newStock,
          quantity: newStock,
          updated_at: now,
        }));
      } else {
        transaction.set(
          invRef,
          cleanUndefined({
            _id: `inv-${locationType}-${locationId}-${item.skuId}`,
            id: `inv-${locationType}-${locationId}-${item.skuId}`,
            location_type: locationType,
            location_id: locationId,
            office_id: locationType === "WAREHOUSE" ? locationId : undefined,
            warehouse_id: locationType === "WAREHOUSE" ? locationId : undefined,
            salesman_id: locationType === "SALES" ? locationId : undefined,
            sku_id: item.skuId,
            sku_code: item.skuCode || item.skuId || "-",
            sku_name: item.skuName || "-",
            stock_on_hand: newStock,
            available_stock: newStock,
            quantity: newStock,
            status: "ACTIVE",
            updated_at: now,
          }),
          { merge: true }
        );
      }

      // Log movement reverse IN
      const movementId = `mov-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
      const movementRef = doc(firestoreDb, "stock_movements", movementId);

      transaction.set(movementRef, cleanUndefined({
        _id: movementId,
        id: movementId,
        movement_id: movementId,
        location_type: locationType,
        location_id: locationId,
        warehouse_id: locationType === "WAREHOUSE" ? locationId : undefined,
        salesman_id: locationType === "SALES" ? locationId : undefined,
        sku_id: item.skuId,
        sku_code: item.skuCode || item.skuId || "-",
        sku_name: item.skuName || "-",
        type: "SALES_CANCEL",
        movement_type: "SALES_CANCEL",
        direction: "IN",
        quantity: item.requestedQty,
        qty_change: item.requestedQty,
        previous_qty: currentStock,
        new_qty: newStock,
        reference_id: referenceId,
        reason,
        created_by: performedByUserId,
        created_at: now,
      }));
    }
  });

  return {
    success: true,
    referenceId,
    locationType,
    locationId,
    timestamp: now,
    movementsCreated: items.length,
  };
}

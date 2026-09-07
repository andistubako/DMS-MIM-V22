import {
  runTransaction,
  doc,
  collection,
  getDoc,
  getDocs,
  query,
  where,
} from "firebase/firestore";
import { firestoreDb } from "../firebase.js";

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

export interface HandoverItem {
  sku_id: string;
  quantity: number;
}

export interface ProcessHandoverInput {
  officeId: string;
  salesmanId: string;
  items: HandoverItem[];
  userId: string;
}

export interface ReturnItem {
  sku_id: string;
  quantity: number;
}

export interface ProcessReturnInput {
  officeId: string;
  salesmanId: string;
  items: ReturnItem[];
  userId: string;
}

/**
 * Handover: WAREHOUSE -> SALES
 * Atomically deducts WAREHOUSE inventory, credits SALES inventory,
 * writes TRANSFER_OUT and TRANSFER_IN movements, and updates sales stock ledger.
 */
export async function processStockHandover(input: ProcessHandoverInput) {
  const { officeId, salesmanId, items, userId } = input;
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const nowIso = now.toISOString();
  const handoverNumber = `HO-${dateStr.replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    await runTransaction(firestoreDb, async (transaction) => {
      // 1. Read Warehouse Inventory for each item
      const warehouseRefs: Array<{ ref: any; currentStock: number; qty: number; skuId: string }> = [];

      for (const item of items) {
        const whDocId = `WH_${officeId}_${item.sku_id}`;
        const whRef = doc(firestoreDb, "inventory", whDocId);
        const whSnap = await transaction.get(whRef);

        let currentStock = 0;
        if (whSnap.exists()) {
          currentStock = Number(whSnap.data().stock_on_hand || 0);
        }

        if (currentStock < item.quantity) {
          throw new Error(`Stok gudang tidak mencukupi untuk SKU ${item.sku_id}. Tersedia: ${currentStock}, Diminta: ${item.quantity}`);
        }

        warehouseRefs.push({
          ref: whRef,
          currentStock,
          qty: item.quantity,
          skuId: item.sku_id,
        });
      }

      // 2. Read Sales Inventory for each item
      const salesRefs: Array<{ ref: any; currentStock: number; qty: number; skuId: string }> = [];
      for (const item of items) {
        const salesDocId = `SALES_${salesmanId}_${item.sku_id}`;
        const salesRef = doc(firestoreDb, "inventory", salesDocId);
        const salesSnap = await transaction.get(salesRef);

        let currentStock = 0;
        if (salesSnap.exists()) {
          currentStock = Number(salesSnap.data().stock_on_hand || 0);
        }

        salesRefs.push({
          ref: salesRef,
          currentStock,
          qty: item.quantity,
          skuId: item.sku_id,
        });
      }

      // 3. Apply atomic writes
      // Deduct warehouse
      for (const wh of warehouseRefs) {
        const newStock = wh.currentStock - wh.qty;
        transaction.set(wh.ref, {
          location_type: "WAREHOUSE",
          location_id: officeId,
          sku_id: wh.skuId,
          stock_on_hand: newStock,
          available_stock: newStock,
          updated_at: nowIso,
        }, { merge: true });
      }

      // Credit sales
      for (const sl of salesRefs) {
        const newStock = sl.currentStock + sl.qty;
        transaction.set(sl.ref, {
          location_type: "SALES",
          location_id: salesmanId,
          sku_id: sl.skuId,
          stock_on_hand: newStock,
          available_stock: newStock,
          updated_at: nowIso,
        }, { merge: true });

        // Record stock_movements
        const movId = generateId("MOV");
        const movRef = doc(firestoreDb, "stock_movements", movId);
        transaction.set(movRef, {
          id: movId,
          movement_number: `MOV-${handoverNumber}-${sl.skuId}`,
          movement_type: "TRANSFER_IN",
          source_location_type: "WAREHOUSE",
          source_location_id: officeId,
          dest_location_type: "SALES",
          dest_location_id: salesmanId,
          sku_id: sl.skuId,
          quantity: sl.qty,
          reference_id: handoverNumber,
          created_by: userId,
          created_at: nowIso,
        });

        // Update sales stock ledger
        const ledgerId = `LEDGER_${salesmanId}_${dateStr}_${sl.skuId}`;
        const ledgerRef = doc(firestoreDb, "sales_stock_ledgers", ledgerId);
        transaction.set(ledgerRef, {
          salesman_id: salesmanId,
          date: dateStr,
          sku_id: sl.skuId,
          handover_in: sl.qty,
          updated_at: nowIso,
        }, { merge: true });
      }

      // Record Handover Header
      const hoId = generateId("HO");
      const hoRef = doc(firestoreDb, "stock_handovers", hoId);
      transaction.set(hoRef, {
        id: hoId,
        handover_number: handoverNumber,
        date: dateStr,
        office_id: officeId,
        salesman_id: salesmanId,
        items,
        status: "CONFIRMED",
        created_by: userId,
        created_at: nowIso,
      });

      // Audit Log
      const auditId = generateId("AUDIT");
      const auditRef = doc(firestoreDb, "audit_logs", auditId);
      transaction.set(auditRef, {
        id: auditId,
        user_id: userId,
        action: "STOCK_HANDOVER",
        entity: "stock_handovers",
        entity_id: hoId,
        details: `Handover ${handoverNumber} of ${items.length} SKUs to salesman ${salesmanId}`,
        timestamp: nowIso,
      });
    });

    return {
      success: true,
      handoverNumber,
      message: "Serah terima stok berhasil dibukukan secara atomik.",
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || "Gagal memproses serah terima stok.",
    };
  }
}

/**
 * Return: SALES -> WAREHOUSE
 * Atomically deducts SALES inventory, credits WAREHOUSE inventory,
 * writes RETURN_IN movement, and updates sales stock ledger.
 */
export async function processStockReturn(input: ProcessReturnInput) {
  const { officeId, salesmanId, items, userId } = input;
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const nowIso = now.toISOString();
  const returnNumber = `RET-${dateStr.replace(/-/g, "")}-${Math.floor(1000 + Math.random() * 9000)}`;

  try {
    await runTransaction(firestoreDb, async (transaction) => {
      // 1. Read Sales Inventory for each item
      const salesRefs: Array<{ ref: any; currentStock: number; qty: number; skuId: string }> = [];

      for (const item of items) {
        const salesDocId = `SALES_${salesmanId}_${item.sku_id}`;
        const salesRef = doc(firestoreDb, "inventory", salesDocId);
        const salesSnap = await transaction.get(salesRef);

        let currentStock = 0;
        if (salesSnap.exists()) {
          currentStock = Number(salesSnap.data().stock_on_hand || 0);
        }

        if (currentStock < item.quantity) {
          throw new Error(`Sisa stok sales tidak mencukupi untuk SKU ${item.sku_id}. Tersedia: ${currentStock}, Dikembalikan: ${item.quantity}`);
        }

        salesRefs.push({
          ref: salesRef,
          currentStock,
          qty: item.quantity,
          skuId: item.sku_id,
        });
      }

      // 2. Read Warehouse Inventory for each item
      const warehouseRefs: Array<{ ref: any; currentStock: number; qty: number; skuId: string }> = [];
      for (const item of items) {
        const whDocId = `WH_${officeId}_${item.sku_id}`;
        const whRef = doc(firestoreDb, "inventory", whDocId);
        const whSnap = await transaction.get(whRef);

        let currentStock = 0;
        if (whSnap.exists()) {
          currentStock = Number(whSnap.data().stock_on_hand || 0);
        }

        warehouseRefs.push({
          ref: whRef,
          currentStock,
          qty: item.quantity,
          skuId: item.sku_id,
        });
      }

      // 3. Apply atomic writes
      // Deduct sales
      for (const sl of salesRefs) {
        const newStock = sl.currentStock - sl.qty;
        transaction.set(sl.ref, {
          location_type: "SALES",
          location_id: salesmanId,
          sku_id: sl.skuId,
          stock_on_hand: newStock,
          available_stock: newStock,
          updated_at: nowIso,
        }, { merge: true });

        // Update sales stock ledger
        const ledgerId = `LEDGER_${salesmanId}_${dateStr}_${sl.skuId}`;
        const ledgerRef = doc(firestoreDb, "sales_stock_ledgers", ledgerId);
        transaction.set(ledgerRef, {
          salesman_id: salesmanId,
          date: dateStr,
          sku_id: sl.skuId,
          return_out: sl.qty,
          actual_closing: newStock,
          updated_at: nowIso,
        }, { merge: true });
      }

      // Credit warehouse
      for (const wh of warehouseRefs) {
        const newStock = wh.currentStock + wh.qty;
        transaction.set(wh.ref, {
          location_type: "WAREHOUSE",
          location_id: officeId,
          sku_id: wh.skuId,
          stock_on_hand: newStock,
          available_stock: newStock,
          updated_at: nowIso,
        }, { merge: true });

        // Record stock_movement (RETURN_IN)
        const movId = generateId("MOV");
        const movRef = doc(firestoreDb, "stock_movements", movId);
        transaction.set(movRef, {
          id: movId,
          movement_number: `MOV-${returnNumber}-${wh.skuId}`,
          movement_type: "RETURN_IN",
          source_location_type: "SALES",
          source_location_id: salesmanId,
          dest_location_type: "WAREHOUSE",
          dest_location_id: officeId,
          sku_id: wh.skuId,
          quantity: wh.qty,
          reference_id: returnNumber,
          created_by: userId,
          created_at: nowIso,
        });
      }

      // Record Return Document
      const retId = generateId("RET");
      const retRef = doc(firestoreDb, "stock_returns", retId);
      transaction.set(retRef, {
        id: retId,
        return_number: returnNumber,
        date: dateStr,
        office_id: officeId,
        salesman_id: salesmanId,
        items,
        status: "CONFIRMED",
        confirmed_by: userId,
        created_at: nowIso,
      });

      // Audit Log
      const auditId = generateId("AUDIT");
      const auditRef = doc(firestoreDb, "audit_logs", auditId);
      transaction.set(auditRef, {
        id: auditId,
        user_id: userId,
        action: "STOCK_RETURN",
        entity: "stock_returns",
        entity_id: retId,
        details: `Return ${returnNumber} of ${items.length} SKUs from salesman ${salesmanId}`,
        timestamp: nowIso,
      });
    });

    return {
      success: true,
      returnNumber,
      message: "Pengembalian stok sore berhasil dibukukan secara atomik.",
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || "Gagal memproses pengembalian stok.",
    };
  }
}

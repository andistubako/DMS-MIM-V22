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
import { calculateOutletLifecycle } from "./outlets.domain.js";

export interface CreateTransactionItemInput {
  sku_id: string;
  quantity: number;
  discount?: number;
}

export interface CreateTransactionInput {
  salesmanId: string;
  outletId: string;
  visitId?: string;
  items: CreateTransactionItemInput[];
  paymentMethod: "CASH" | "CREDIT" | "TRANSFER";
  dueDate?: string; // required if CREDIT
  notes?: string;
  idempotencyKey: string;
}

export interface TransactionResult {
  success: boolean;
  invoiceNumber?: string;
  transactionId?: string;
  grandTotal?: number;
  message: string;
  isCached?: boolean;
}

function generateInvoiceNumber(): string {
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10).replace(/-/g, "");
  const rand = Math.floor(1000 + Math.random() * 9000);
  return `INV-${dateStr}-${rand}`;
}

function generateId(prefix: string): string {
  return `${prefix}_${Date.now()}_${Math.random().toString(36).substring(2, 7)}`;
}

export async function processSaleTransaction(input: CreateTransactionInput): Promise<TransactionResult> {
  const { salesmanId, outletId, visitId, items, paymentMethod, dueDate, notes, idempotencyKey } = input;

  if (!idempotencyKey) {
    return { success: false, message: "Header Idempotency-Key wajib disertakan." };
  }

  // 1. Check Idempotency Key in Firestore FIRST
  const idempRef = doc(firestoreDb, "idempotency_keys", idempotencyKey);
  const existingIdemp = await getDoc(idempRef);
  if (existingIdemp.exists()) {
    const data = existingIdemp.data();
    return {
      success: true,
      invoiceNumber: data.invoice_number,
      transactionId: data.transaction_id,
      grandTotal: data.grand_total,
      message: "Transaksi sukses (Respons idempotensi terverifikasi).",
      isCached: true,
    };
  }

  // 2. Validate Outlet & Pricing Pre-checks
  const outletDoc = await getDoc(doc(firestoreDb, "outlets", outletId));
  if (!outletDoc.exists()) {
    return { success: false, message: "Outlet tidak ditemukan." };
  }
  const outletData = outletDoc.data();
  const channelId = outletData.channel_id || "GT";

  // Pre-load prices for items to resolve authoritative price
  const resolvedPrices: Record<string, number> = {};
  for (const item of items) {
    // Look up canonical price in `prices` collection
    const priceQuery = query(
      collection(firestoreDb, "prices"),
      where("sku_id", "==", item.sku_id),
      where("channel_id", "==", channelId)
    );
    const priceSnap = await getDocs(priceQuery);
    if (!priceSnap.empty) {
      resolvedPrices[item.sku_id] = Number(priceSnap.docs[0].data().unit_price || 0);
    } else {
      // Fallback to SKU master price
      const skuSnap = await getDoc(doc(firestoreDb, "skus", item.sku_id));
      if (skuSnap.exists()) {
        resolvedPrices[item.sku_id] = Number(skuSnap.data().price || skuSnap.data().unit_price || 0);
      } else {
        resolvedPrices[item.sku_id] = 0;
      }
    }
  }

  const invoiceNumber = generateInvoiceNumber();
  const txnId = generateId("TXN");
  const now = new Date();
  const dateStr = now.toISOString().slice(0, 10);
  const nowIso = now.toISOString();

  // 3. Execute Atomic Multi-Document Firestore Transaction
  try {
    const result = await runTransaction(firestoreDb, async (transaction) => {
      // Check idempotency INSIDE transaction to prevent race conditions
      const idempInTx = await transaction.get(idempRef);
      if (idempInTx.exists()) {
        const idempData = idempInTx.data();
        return {
          success: true,
          invoiceNumber: idempData.invoice_number,
          transactionId: idempData.transaction_id,
          grandTotal: idempData.grand_total,
          isCached: true,
        };
      }

      // Read salesman stock for each SKU
      const inventoryRefs: Array<{ ref: any; currentStock: number; qtyToDeduct: number; skuId: string; invDocId: string }> = [];

      for (const item of items) {
        const invDocId = `SALES_${salesmanId}_${item.sku_id}`;
        const invRef = doc(firestoreDb, "inventory", invDocId);
        const invSnap = await transaction.get(invRef);

        let currentStock = 0;
        if (invSnap.exists()) {
          currentStock = Number(invSnap.data().stock_on_hand || invSnap.data().quantity || 0);
        }

        if (currentStock < item.quantity) {
          throw new Error(`Stok salesman tidak mencukupi untuk SKU ${item.sku_id}. Tersedia: ${currentStock}, Diminta: ${item.quantity}`);
        }

        inventoryRefs.push({
          ref: invRef,
          currentStock,
          qtyToDeduct: item.quantity,
          skuId: item.sku_id,
          invDocId,
        });
      }

      // Calculate Deterministic Totals
      let subtotal = 0;
      let totalDiscount = 0;
      let totalVolume = 0;
      const transactionItems: any[] = [];

      for (const item of items) {
        const unitPrice = resolvedPrices[item.sku_id] || 0;
        const lineDiscount = Number(item.discount || 0);
        const lineTotal = (item.quantity * unitPrice) - lineDiscount;

        subtotal += item.quantity * unitPrice;
        totalDiscount += lineDiscount;
        totalVolume += item.quantity;

        const itemId = generateId("TXNI");
        const itemRef = doc(firestoreDb, "transaction_items", itemId);
        const itemData = {
          id: itemId,
          transaction_id: txnId,
          sku_id: item.sku_id,
          quantity: item.quantity,
          unit_price: unitPrice,
          discount: lineDiscount,
          subtotal: lineTotal,
          created_at: nowIso,
        };

        transaction.set(itemRef, itemData);
        transactionItems.push(itemData);
      }

      const taxTotal = 0; // PPN included or 0 by default
      const grandTotal = subtotal - totalDiscount + taxTotal;

      // Deduct salesman inventory
      for (const inv of inventoryRefs) {
        const newStock = inv.currentStock - inv.qtyToDeduct;
        transaction.set(inv.ref, {
          location_type: "SALES",
          location_id: salesmanId,
          sku_id: inv.skuId,
          stock_on_hand: newStock,
          available_stock: newStock,
          updated_at: nowIso,
        }, { merge: true });

        // Create immutable stock_movement (SALES_OUT)
        const movId = generateId("MOV");
        const movRef = doc(firestoreDb, "stock_movements", movId);
        transaction.set(movRef, {
          id: movId,
          movement_number: `MOV-${invoiceNumber}-${inv.skuId}`,
          movement_type: "SALES_OUT",
          source_location_type: "SALES",
          source_location_id: salesmanId,
          dest_location_type: "OUTLET",
          dest_location_id: outletId,
          sku_id: inv.skuId,
          quantity: inv.qtyToDeduct,
          reference_id: txnId,
          invoice_number: invoiceNumber,
          created_by: salesmanId,
          created_at: nowIso,
        });

        // Update sales stock ledger document
        const ledgerId = `LEDGER_${salesmanId}_${dateStr}_${inv.skuId}`;
        const ledgerRef = doc(firestoreDb, "sales_stock_ledgers", ledgerId);
        transaction.set(ledgerRef, {
          salesman_id: salesmanId,
          date: dateStr,
          sku_id: inv.skuId,
          sales_out: (inv.qtyToDeduct),
          updated_at: nowIso,
        }, { merge: true });
      }

      // Create main transaction record
      const txnRef = doc(firestoreDb, "transactions", txnId);
      transaction.set(txnRef, {
        id: txnId,
        invoice_number: invoiceNumber,
        salesman_id: salesmanId,
        outlet_id: outletId,
        visit_id: visitId || null,
        transaction_date: dateStr,
        subtotal,
        discount_total: totalDiscount,
        tax_total: taxTotal,
        grand_total: grandTotal,
        total_volume: totalVolume,
        payment_method: paymentMethod,
        payment_status: paymentMethod === "CASH" ? "PAID" : "UNPAID",
        status: "COMPLETED",
        notes: notes || "",
        idempotency_key: idempotencyKey,
        created_at: nowIso,
        updated_at: nowIso,
      });

      // If CREDIT, create receivable document
      if (paymentMethod === "CREDIT") {
        const recvId = generateId("RCV");
        const recvRef = doc(firestoreDb, "receivables", recvId);
        transaction.set(recvRef, {
          id: recvId,
          invoice_number: invoiceNumber,
          transaction_id: txnId,
          outlet_id: outletId,
          salesman_id: salesmanId,
          total_amount: grandTotal,
          paid_amount: 0,
          remaining_amount: grandTotal,
          due_date: dueDate || new Date(now.getTime() + 14 * 86400000).toISOString().slice(0, 10),
          status: "UNPAID",
          created_at: nowIso,
        });
      }

      // Mark Visit as EFFECTIVE
      if (visitId) {
        const visitRef = doc(firestoreDb, "visits", visitId);
        transaction.update(visitRef, {
          call_result: "EFFECTIVE",
          transaction_id: txnId,
          updated_at: nowIso,
        });
      }

      // Create Audit Log
      const auditId = generateId("AUDIT");
      const auditRef = doc(firestoreDb, "audit_logs", auditId);
      transaction.set(auditRef, {
        id: auditId,
        user_id: salesmanId,
        action: "CREATE_TRANSACTION",
        entity: "transactions",
        entity_id: txnId,
        details: `Invoice ${invoiceNumber} created for outlet ${outletId} total Rp ${grandTotal}`,
        timestamp: nowIso,
      });

      // Lock Idempotency Key
      transaction.set(idempRef, {
        idempotency_key: idempotencyKey,
        transaction_id: txnId,
        invoice_number: invoiceNumber,
        grand_total: grandTotal,
        created_at: nowIso,
      });

      return {
        success: true,
        invoiceNumber,
        transactionId: txnId,
        grandTotal,
        isCached: false,
      };
    });

    // 4. Update Outlet Lifecycle Asynchronously after successful transaction
    try {
      await calculateOutletLifecycle(outletId);
    } catch (e) {
      console.warn("[TransactionsDomain] Lifecycle update non-blocking error:", e);
    }

    return {
      success: true,
      invoiceNumber: result.invoiceNumber,
      transactionId: result.transactionId,
      grandTotal: result.grandTotal,
      message: "Transaksi penjualan berhasil dibukukan secara atomik.",
      isCached: result.isCached,
    };
  } catch (err: any) {
    return {
      success: false,
      message: err?.message || "Gagal memproses transaksi penjualan.",
    };
  }
}

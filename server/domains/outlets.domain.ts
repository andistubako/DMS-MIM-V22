import { collection, query, where, getDocs, doc, updateDoc, getDoc } from "firebase/firestore";
import { firestoreDb } from "../firebase.js";
import { db } from "../data.js";

export type OutletLifecycleStatus = "PROSPECT" | "NOO" | "REPEAT" | "ACTIVE" | "DORMANT";

export interface OutletLifecycleSummary {
  outlet_id: string;
  lifecycle: OutletLifecycleStatus;
  completed_transaction_count: number;
  first_completed_transaction_date: string | null;
  last_completed_transaction_date: string | null;
  days_since_last_transaction: number | null;
  total_volume: number;
  total_revenue: number;
}

const DORMANT_THRESHOLD_DAYS = 56; // Canonical: 56 days

/**
 * Calculates canonical outlet lifecycle strictly from completed transactions in Firestore.
 * Rules:
 *  - 0 completed transactions -> PROSPECT
 *  - 1 completed transaction -> NOO
 *  - 2 completed transactions -> REPEAT
 *  - 3+ completed transactions -> ACTIVE
 *  - No completed transaction in >= 56 days -> DORMANT
 *  - If DORMANT and has new completed transaction -> ACTIVE
 * Visits without transactions do NOT change lifecycle.
 * Draft/cancelled transactions are ignored.
 */
export async function calculateOutletLifecycle(outletId: string): Promise<OutletLifecycleSummary> {
  let txns: any[] = [];
  try {
    const txnsRef = collection(firestoreDb, "transactions");
    const q = query(
      txnsRef,
      where("outlet_id", "==", outletId)
    );
    const snap = await getDocs(q);
    snap.forEach((docSnap) => {
      txns.push(docSnap.data());
    });
  } catch (err) {
    // Fallback to in-memory synced transactions
    txns = (db.transactions || []).filter((t: any) => t.outlet_id === outletId);
  }

  let completedCount = 0;
  let firstDate: string | null = null;
  let lastDate: string | null = null;
  let totalVolume = 0;
  let totalRevenue = 0;

  txns.forEach((t) => {
    // Only count COMPLETED or PAID transactions. Ignore DRAFT and CANCELLED.
    const status = String(t.status || "").toUpperCase();
    if (status === "CANCELLED" || status === "DRAFT") return;

    completedCount++;
    const tDate = t.transaction_date || t.date || t.created_at;
    if (tDate) {
      const dateStr = typeof tDate === "string" ? tDate.slice(0, 10) : new Date(tDate).toISOString().slice(0, 10);
      if (!firstDate || dateStr < firstDate) firstDate = dateStr;
      if (!lastDate || dateStr > lastDate) lastDate = dateStr;
    }

    const grandTotal = Number(t.grand_total ?? t.total_amount ?? t.total ?? 0);
    totalRevenue += isNaN(grandTotal) ? 0 : grandTotal;

    const vol = Number(t.total_volume ?? t.volume ?? 0);
    totalVolume += isNaN(vol) ? 0 : vol;
  });

  const now = new Date();
  let daysSinceLast: number | null = null;
  if (lastDate) {
    const lastTime = new Date(lastDate).getTime();
    daysSinceLast = Math.floor((now.getTime() - lastTime) / (1000 * 60 * 60 * 24));
  }

  let lifecycle: OutletLifecycleStatus = "PROSPECT";
  if (completedCount === 0) {
    lifecycle = "PROSPECT";
  } else if (completedCount === 1) {
    lifecycle = (daysSinceLast !== null && daysSinceLast >= DORMANT_THRESHOLD_DAYS) ? "DORMANT" : "NOO";
  } else if (completedCount === 2) {
    lifecycle = (daysSinceLast !== null && daysSinceLast >= DORMANT_THRESHOLD_DAYS) ? "DORMANT" : "REPEAT";
  } else {
    // 3+ transactions
    if (daysSinceLast !== null && daysSinceLast >= DORMANT_THRESHOLD_DAYS) {
      lifecycle = "DORMANT";
    } else {
      lifecycle = "ACTIVE";
    }
  }

  return {
    outlet_id: outletId,
    lifecycle,
    completed_transaction_count: completedCount,
    first_completed_transaction_date: firstDate,
    last_completed_transaction_date: lastDate,
    days_since_last_transaction: daysSinceLast,
    total_volume: totalVolume,
    total_revenue: totalRevenue,
  };
}

/**
 * Updates the canonical lifecycle of an outlet in Firestore.
 */
export async function syncOutletLifecycleToFirestore(outletId: string): Promise<OutletLifecycleSummary> {
  const summary = await calculateOutletLifecycle(outletId);
  try {
    const outletRef = doc(firestoreDb, "outlets", outletId);
    await updateDoc(outletRef, {
      lifecycle: summary.lifecycle,
      completed_transaction_count: summary.completed_transaction_count,
      last_order_date: summary.last_completed_transaction_date,
      total_revenue: summary.total_revenue,
      updated_at: new Date().toISOString(),
    });
  } catch (err: any) {
    console.error(`[OutletLifecycle] Failed to update outlet ${outletId}:`, err?.message || err);
  }
  return summary;
}

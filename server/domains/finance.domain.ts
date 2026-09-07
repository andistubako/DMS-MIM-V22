import { collection, query, where, getDocs, doc, setDoc, getDoc } from "firebase/firestore";
import { firestoreDb } from "../firebase.js";
import { db } from "../data.js";
import { syncSingleDoc } from "../persistence.js";

export type ReconciliationStatus = "BALANCED" | "SURPLUS" | "DEFICIT";

export interface TriangularReconciliationResult {
  salesman_id: string;
  date: string;
  stock: {
    total_opening: number;
    total_handover: number;
    total_sales: number;
    expected_return: number;
    actual_return: number;
    variance: number;
    status: ReconciliationStatus;
  };
  sales: {
    cash_sales: number;
    credit_sales: number;
    transfer_sales: number;
    total_omzet: number;
  };
  cash: {
    cash_sales: number;
    receivable_collected: number;
    expected_deposit: number;
    actual_deposit: number;
    variance: number;
    status: ReconciliationStatus;
  };
  overall_status: "BALANCED" | "DISCREPANCY";
  calculated_at: string;
}

/**
 * Calculates deterministic triangular reconciliation for a salesman on a given date.
 * Strictly uses mathematical formulas:
 * 1. Stock: Expected = Opening + Handover - Sales; Variance = Actual - Expected
 * 2. Sales: Omzet = Cash Sales + Credit Sales + Transfer Sales
 * 3. Cash: Expected Deposit = Cash Sales + Receivable Collected; Variance = Actual - Expected
 */
export async function calculateTriangularReconciliation(
  salesmanId: string,
  dateStr: string
): Promise<TriangularReconciliationResult> {
  // 1. Calculate Sales Totals from `transactions`
  let txList: any[] = [];
  try {
    const txnsRef = collection(firestoreDb, "transactions");
    const qTx = query(
      txnsRef,
      where("salesman_id", "==", salesmanId),
      where("transaction_date", "==", dateStr)
    );
    const txSnap = await getDocs(qTx);
    txSnap.forEach((d) => txList.push(d.data()));
  } catch {
    txList = (db.transactions || []).filter(
      (t: any) =>
        t.salesman_id === salesmanId &&
        ((t.transaction_date || t.date || "").slice(0, 10) === dateStr)
    );
  }

  let cashSales = 0;
  let creditSales = 0;
  let transferSales = 0;
  let totalSalesUnits = 0;

  txList.forEach((data) => {
    if (data.status === "CANCELLED") return;
    const method = String(data.payment_method || "CASH").toUpperCase();
    const amount = Number(data.grand_total || data.total_amount || 0);
    const volume = Number(data.total_volume || 0);

    totalSalesUnits += volume;
    if (method === "CASH") cashSales += amount;
    else if (method === "CREDIT") creditSales += amount;
    else if (method === "TRANSFER") transferSales += amount;
  });

  const totalOmzet = cashSales + creditSales + transferSales;

  // 2. Calculate Stock Totals from `stock_handovers` and `stock_returns`
  let totalHandoverUnits = 0;
  let hoList: any[] = [];
  try {
    const hoRef = collection(firestoreDb, "stock_handovers");
    const qHo = query(hoRef, where("salesman_id", "==", salesmanId), where("date", "==", dateStr));
    const hoSnap = await getDocs(qHo);
    hoSnap.forEach((d) => hoList.push(d.data()));
  } catch {
    hoList = (db.stock_handovers || []).filter(
      (h: any) => h.salesman_id === salesmanId && ((h.date || "").slice(0, 10) === dateStr)
    );
  }

  hoList.forEach((data) => {
    if (data.status === "CONFIRMED" || data.status === "APPROVED") {
      const items = data.items || [];
      for (const it of items) {
        totalHandoverUnits += Number(it.quantity || 0);
      }
    }
  });

  let totalReturnUnits = 0;
  let retList: any[] = [];
  try {
    const retRef = collection(firestoreDb, "stock_returns");
    const qRet = query(retRef, where("salesman_id", "==", salesmanId), where("date", "==", dateStr));
    const retSnap = await getDocs(qRet);
    retSnap.forEach((d) => retList.push(d.data()));
  } catch {
    retList = (db.stock_returns || []).filter(
      (r: any) => r.salesman_id === salesmanId && ((r.date || "").slice(0, 10) === dateStr)
    );
  }

  retList.forEach((data) => {
    if (data.status === "CONFIRMED" || data.status === "APPROVED") {
      const items = data.items || [];
      for (const it of items) {
        totalReturnUnits += Number(it.quantity || 0);
      }
    }
  });

  const totalOpeningUnits = 0; // Standard canvasser starts day with empty van before handover
  const expectedReturnUnits = totalOpeningUnits + totalHandoverUnits - totalSalesUnits;
  const stockVariance = totalReturnUnits - expectedReturnUnits;

  let stockStatus: ReconciliationStatus = "BALANCED";
  if (stockVariance > 0) stockStatus = "SURPLUS";
  else if (stockVariance < 0) stockStatus = "DEFICIT";

  // 3. Calculate Cash Collections & Deposits
  let receivableCollected = 0;
  try {
    const payRef = collection(firestoreDb, "installment_payments");
    const qPay = query(payRef, where("salesman_id", "==", salesmanId), where("payment_date", "==", dateStr));
    const paySnap = await getDocs(qPay);
    paySnap.forEach((d) => {
      receivableCollected += Number(d.data().amount || 0);
    });
  } catch {
    // Check in db.receivables or customer payments
    const payments = (db.receivables || []).filter(
      (r: any) => r.salesman_id === salesmanId && ((r.paid_at || "").slice(0, 10) === dateStr)
    );
    payments.forEach((p: any) => {
      receivableCollected += Number(p.amount_paid || p.paid_amount || 0);
    });
  }

  let actualDeposit = 0;
  let depList: any[] = [];
  try {
    const depRef = collection(firestoreDb, "cash_deposits");
    const qDep = query(depRef, where("salesman_id", "==", salesmanId), where("date", "==", dateStr));
    const depSnap = await getDocs(qDep);
    depSnap.forEach((d) => depList.push(d.data()));
  } catch {
    depList = (db.cash_deposits || []).filter(
      (c: any) => c.salesman_id === salesmanId && ((c.date || "").slice(0, 10) === dateStr)
    );
  }

  depList.forEach((d) => {
    actualDeposit += Number(d.actual_deposited || d.amount || 0);
  });

  const expectedDeposit = cashSales + receivableCollected;
  const cashVariance = actualDeposit - expectedDeposit;

  let cashStatus: ReconciliationStatus = "BALANCED";
  if (cashVariance > 0) cashStatus = "SURPLUS";
  else if (cashVariance < 0) cashStatus = "DEFICIT";

  const overallStatus = (stockStatus === "BALANCED" && cashStatus === "BALANCED") ? "BALANCED" : "DISCREPANCY";

  const result: TriangularReconciliationResult = {
    salesman_id: salesmanId,
    date: dateStr,
    stock: {
      total_opening: totalOpeningUnits,
      total_handover: totalHandoverUnits,
      total_sales: totalSalesUnits,
      expected_return: expectedReturnUnits,
      actual_return: totalReturnUnits,
      variance: stockVariance,
      status: stockStatus,
    },
    sales: {
      cash_sales: cashSales,
      credit_sales: creditSales,
      transfer_sales: transferSales,
      total_omzet: totalOmzet,
    },
    cash: {
      cash_sales: cashSales,
      receivable_collected: receivableCollected,
      expected_deposit: expectedDeposit,
      actual_deposit: actualDeposit,
      variance: cashVariance,
      status: cashStatus,
    },
    overall_status: overallStatus,
    calculated_at: new Date().toISOString(),
  };

  // Persist record to `daily_reconciliations`
  try {
    const docId = `REC_${salesmanId}_${dateStr}`;
    await syncSingleDoc("daily_reconciliations", docId, result);
  } catch (err) {
    console.warn("[FinanceDomain] Error saving daily reconciliation:", err);
  }

  return result;
}

import { db } from "./data.js";

/** Canonical DMS call metrics derived directly from Firestore data. */
export async function getCallMetrics(date: string, salesmanId?: string, areaId?: string) {
  const rows = await getCallMetricsRange(date, date, salesmanId, areaId);
  return rows[0] ?? { date, outlet_call: 0, effective_call: 0, ec_product_rows: 0 };
}

/** Compute call metrics for an inclusive date range returning one row per day. */
export async function getCallMetricsRange(from: string, to: string, salesmanId?: string, areaId?: string) {
  const [fy, fm, fd] = from.split("-").map(Number);
  const [ty, tm, td] = to.split("-").map(Number);
  const cur = new Date(fy, fm - 1, fd, 12, 0, 0);
  const end = new Date(ty, tm - 1, td, 12, 0, 0);
  const days: string[] = [];
  while (cur <= end) {
    const y = cur.getFullYear();
    const m = String(cur.getMonth() + 1).padStart(2, "0");
    const dayStr = String(cur.getDate()).padStart(2, "0");
    days.push(`${y}-${m}-${dayStr}`);
    cur.setDate(cur.getDate() + 1);
  }

  const outletAreaMap = new Map<string, string>();
  (db.outlets || []).forEach((o: any) => {
    outletAreaMap.set(o._id || o.id, o.area_id);
  });

  return days.map(date => {
    const dayVisits = (db.visits || []).filter(v => {
      const vDate = (v.date || v.check_in_time || "").slice(0, 10);
      if (vDate !== date) return false;
      if (v.status === 'CANCELLED') return false;
      if (salesmanId && v.salesman_id !== salesmanId) return false;
      if (areaId && outletAreaMap.get(v.outlet_id) !== areaId) return false;
      return true;
    });

    const dayTxns = (db.transactions || []).filter((t: any) => {
      const tDate = (t.created_at || t.transaction_date || t.date || "").slice(0, 10);
      if (tDate !== date) return false;
      if (t.status === 'CANCELLED' || t.payment_status === 'CANCELLED' || t.delivery_status === 'CANCELLED') return false;
      if (salesmanId && t.salesman_id !== salesmanId) return false;
      if (areaId && outletAreaMap.get(t.outlet_id) !== areaId) return false;
      return true;
    });

    const uniqueOutlets = new Set<string>();
    dayVisits.forEach(v => uniqueOutlets.add(`${v.salesman_id}-${v.outlet_id}`));

    const effectiveOutlets = new Set<string>();
    dayTxns.forEach(t => {
      if (uniqueOutlets.has(`${t.salesman_id}-${t.outlet_id}`)) {
        effectiveOutlets.add(`${t.salesman_id}-${t.outlet_id}`);
      }
    });

    return {
      date,
      outlet_call: uniqueOutlets.size,
      effective_call: effectiveOutlets.size,
      ec_product_rows: 0,
    };
  });
}

export async function getProductEcMetrics(date: string, salesmanId?: string) {
  const targetDate = date.slice(0, 10);
  const visits = (db.visits || []).filter((v: any) => {
    const vDate = (v.check_in_time || v.date || "").slice(0, 10);
    if (vDate !== targetDate) return false;
    if (v.status === "CANCELLED") return false;
    if (salesmanId && v.salesman_id !== salesmanId) return false;
    return true;
  });

  const visitedKeys = new Set(visits.map((v: any) => `${v.salesman_id}-${v.outlet_id}`));

  const txns = (db.transactions || []).filter((t: any) => {
    const tDate = (t.created_at || t.transaction_date || t.date || "").slice(0, 10);
    if (tDate !== targetDate) return false;
    if (t.status === "CANCELLED" || t.payment_status === "CANCELLED") return false;
    if (salesmanId && t.salesman_id !== salesmanId) return false;
    return visitedKeys.has(`${t.salesman_id}-${t.outlet_id}`);
  });

  const skuAgg = new Map<string, { salesman_id: string; sku_id: string; effective_call: number; volume: number; transaction_item_count: number }>();
  for (const t of txns) {
    for (const item of (t.items || [])) {
      const skuId = item.sku_id;
      if (!skuId) continue;
      const key = `${t.salesman_id}-${skuId}`;
      const existing = skuAgg.get(key) || {
        salesman_id: t.salesman_id,
        sku_id: skuId,
        effective_call: 0,
        volume: 0,
        transaction_item_count: 0,
      };
      existing.effective_call += 1;
      existing.volume += Number(item.quantity ?? item.volume ?? 0);
      existing.transaction_item_count += 1;
      skuAgg.set(key, existing);
    }
  }

  return Array.from(skuAgg.values());
}

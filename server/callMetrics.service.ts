import { sqlDb } from "../src/db/index.js";
import { sql } from "drizzle-orm";
import { db } from "./data.js";
const isCloudSqlConnected = false;

/** Canonical DMS call metrics, derived from PostgreSQL facts. */
export async function getCallMetrics(date: string, salesmanId?: string, areaId?: string) {
  const rows = await getCallMetricsRange(date, date, salesmanId, areaId);
  return rows[0] ?? { date, outlet_call: 0, effective_call: 0, ec_product_rows: 0 };
}

/** One database query for an inclusive date range, returning one row per day. */
export async function getCallMetricsRange(from: string, to: string, salesmanId?: string, areaId?: string) {
  if (!isCloudSqlConnected) {
    // In-memory fallback
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

  const salesmanVisitFilter = salesmanId ? sql`AND v.salesman_id = ${salesmanId}` : sql``;
  const salesmanTxnFilter = salesmanId ? sql`AND t.salesman_id = ${salesmanId}` : sql``;
  const areaVisitJoin = areaId ? sql`INNER JOIN outlets ov ON ov.id = v.outlet_id AND ov.area_id = ${areaId}` : sql``;
  const areaTxnJoin = areaId ? sql`INNER JOIN outlets ot ON ot.id = t.outlet_id AND ot.area_id = ${areaId}` : sql``;

  const result = await sqlDb.execute(sql`
    WITH RECURSIVE days AS (
      SELECT ${from}::date AS date
      UNION ALL
      SELECT (date + INTERVAL '1 day')::date FROM days WHERE date < ${to}::date
    ),
    visits_day AS (
      SELECT DATE(v.check_in_time) AS date, v.salesman_id, v.outlet_id
      FROM visits v
      ${areaVisitJoin}
      WHERE v.status <> 'CANCELLED'
        AND DATE(v.check_in_time) BETWEEN ${from}::date AND ${to}::date
        ${salesmanVisitFilter}
      GROUP BY DATE(v.check_in_time), v.salesman_id, v.outlet_id
    ),
    purchases_day AS (
      SELECT DATE(t.created_at) AS date, t.salesman_id, t.outlet_id
      FROM transactions t
      ${areaTxnJoin}
      WHERE DATE(t.created_at) BETWEEN ${from}::date AND ${to}::date
        AND COALESCE(t.payment_status, 'UNPAID') <> 'CANCELLED'
        ${salesmanTxnFilter}
      GROUP BY DATE(t.created_at), t.salesman_id, t.outlet_id
    ),
    product_purchases AS (
      SELECT DISTINCT DATE(t.created_at) AS date, t.salesman_id, t.outlet_id, item->>'sku_id' AS sku_id
      FROM transactions t
      ${areaTxnJoin}
      INNER JOIN visits_day v
        ON v.date = DATE(t.created_at)
       AND v.salesman_id = t.salesman_id
       AND v.outlet_id = t.outlet_id
      CROSS JOIN LATERAL jsonb_array_elements(COALESCE(t.items, '[]'::jsonb)) item
      WHERE DATE(t.created_at) BETWEEN ${from}::date AND ${to}::date
        AND COALESCE(t.payment_status, 'UNPAID') <> 'CANCELLED'
        AND NULLIF(item->>'sku_id', '') IS NOT NULL
        ${salesmanTxnFilter}
    ),
    daily AS (
      SELECT
        d.date,
        COUNT(DISTINCT (v.salesman_id, v.outlet_id)) FILTER (
          WHERE v.outlet_id IS NOT NULL
        )::int AS outlet_call,
        COUNT(DISTINCT (v.salesman_id, v.outlet_id)) FILTER (
          WHERE p.outlet_id IS NOT NULL
        )::int AS effective_call,
        (SELECT COUNT(*) FROM product_purchases pp WHERE pp.date = d.date)::int AS ec_product_rows
      FROM days d
      LEFT JOIN visits_day v ON v.date = d.date
      LEFT JOIN purchases_day p
        ON p.date = v.date
       AND p.salesman_id = v.salesman_id
       AND p.outlet_id = v.outlet_id
      GROUP BY d.date
    )
    SELECT date, outlet_call, effective_call, ec_product_rows
    FROM daily
    ORDER BY date
  `);

  return result.rows.map((row: any) => ({
    date: String(row.date).slice(0, 10),
    outlet_call: Number(row.outlet_call || 0),
    effective_call: Number(row.effective_call || 0),
    ec_product_rows: Number(row.ec_product_rows || 0),
  }));
}

export async function getProductEcMetrics(date: string, salesmanId?: string) {
  if (!isCloudSqlConnected) {
    return []; // Return empty for now as in-memory SKU breakdown is complex
  }

  const result = await sqlDb.execute(sql`
    WITH visits_day AS (
      SELECT DATE(v.check_in_time) AS date, v.salesman_id, v.outlet_id
      FROM visits v
      WHERE v.status <> 'CANCELLED'
        AND DATE(v.check_in_time) = ${date}::date
        ${salesmanId ? sql`AND v.salesman_id = ${salesmanId}` : sql``}
      GROUP BY DATE(v.check_in_time), v.salesman_id, v.outlet_id
    )
    SELECT
      t.salesman_id,
      item->>'sku_id' AS sku_id,
      COUNT(DISTINCT t.outlet_id)::int AS effective_call,
      SUM(COALESCE((item->>'quantity')::numeric, 0))::numeric AS volume,
      COUNT(*)::int AS transaction_item_count
    FROM transactions t
    INNER JOIN visits_day v
      ON v.date = DATE(t.created_at)
     AND v.salesman_id = t.salesman_id
     AND v.outlet_id = t.outlet_id
    CROSS JOIN LATERAL jsonb_array_elements(COALESCE(t.items, '[]'::jsonb)) item
    WHERE DATE(t.created_at) = ${date}::date
      AND COALESCE(t.payment_status, 'UNPAID') <> 'CANCELLED'
      AND NULLIF(item->>'sku_id', '') IS NOT NULL
      ${salesmanId ? sql`AND t.salesman_id = ${salesmanId}` : sql``}
    GROUP BY t.salesman_id, item->>'sku_id'
    ORDER BY item->>'sku_id'
  `);

  return result.rows;
}

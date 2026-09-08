import { db } from "./data.js";

function getOwnerDashboardDataInMemory(req: any) {
  const from = req.query.from || new Date(Date.now() - 6 * 86400000).toISOString().slice(0, 10);
  const to = req.query.to || new Date().toISOString().slice(0, 10);
  const areaId = req.query.areaId;
  const salesmanId = req.query.salesmanId;
  const skuId = req.query.skuId;

  const safeFrom = from.replace(/[^0-9-]/g, '');
  const safeTo = to.replace(/[^0-9-]/g, '');
  const currentMonth = safeTo.substring(0, 7);

  const outletsMap = new Map((db.outlets || []).map((o: any) => [o._id || o.id, o]));
  const usersMap = new Map((db.users || []).map((u: any) => [u._id || u.id, u]));
  const areasMap = new Map((db.areas || []).map((a: any) => [a._id || a.id, a]));
  const skusMap = new Map((db.skus || []).map((s: any) => [s._id || s.id, s]));

  // Filter transactions
  const validTxns = (db.transactions || []).filter((t: any) => {
    const createdDate = (t.created_at || t.date || "").slice(0, 10);
    if (createdDate < safeFrom || createdDate > safeTo) return false;
    if (t.status === "CANCELLED" || t.payment_status === "CANCELLED" || t.delivery_status === "CANCELLED") return false;
    if (salesmanId && t.salesman_id !== salesmanId) return false;
    const outlet = outletsMap.get(t.outlet_id);
    if (areaId && outlet?.area_id !== areaId) return false;
    return true;
  });

  // Filter visits
  const validVisits = (db.visits || []).filter((v: any) => {
    const visitDate = (v.check_in_time || v.date || "").slice(0, 10);
    if (visitDate < safeFrom || visitDate > safeTo) return false;
    if (v.status === "CANCELLED") return false;
    if (salesmanId && v.salesman_id !== salesmanId) return false;
    const outlet = outletsMap.get(v.outlet_id);
    if (areaId && outlet?.area_id !== areaId) return false;
    return true;
  });

  // Visit set for effective call matching: "salesmanId|visitDate|outletId"
  const visitKeySet = new Set<string>();
  const distinctVisitOutlets = new Set<string>();
  validVisits.forEach((v: any) => {
    const visitDate = (v.check_in_time || v.date || "").slice(0, 10);
    visitKeySet.add(`${v.salesman_id}|${visitDate}|${v.outlet_id}`);
    distinctVisitOutlets.add(v.outlet_id);
  });

  let total_volume = 0;
  let total_revenue = 0;
  const distinctTxnOutlets = new Set<string>();
  const effectiveOutletsSet = new Set<string>();
  const txnIdSet = new Set<string>();

  const dailyStats: Record<string, { sales_value: number; volume: number; outlet_calls: Set<string>; effective_calls: Set<string> }> = {};

  // Initialize date range for trend with safe timezone-independent parsing
  const [fy, fm, fd] = safeFrom.split("-").map(Number);
  const [ty, tm, td] = safeTo.split("-").map(Number);
  const curDate = new Date(fy, fm - 1, fd, 12, 0, 0);
  const endDate = new Date(ty, tm - 1, td, 12, 0, 0);
  while (curDate <= endDate) {
    const y = curDate.getFullYear();
    const m = String(curDate.getMonth() + 1).padStart(2, "0");
    const dayStr = String(curDate.getDate()).padStart(2, "0");
    const dateStr = `${y}-${m}-${dayStr}`;
    dailyStats[dateStr] = { sales_value: 0, volume: 0, outlet_calls: new Set(), effective_calls: new Set() };
    curDate.setDate(curDate.getDate() + 1);
  }

  validVisits.forEach((v: any) => {
    const dateStr = (v.check_in_time || v.date || "").slice(0, 10);
    if (dailyStats[dateStr]) {
      dailyStats[dateStr].outlet_calls.add(v.outlet_id);
    }
  });

  // Aggregate items and sales
  validTxns.forEach((t: any) => {
    const txnDate = (t.created_at || t.date || "").slice(0, 10);
    const hasVisit = visitKeySet.has(`${t.salesman_id}|${txnDate}|${t.outlet_id}`);
    const items = Array.isArray(t.items) ? t.items : [];

    let txnHasMatchingSku = false;
    items.forEach((item: any) => {
      const itemSkuId = item.sku_id || item._id;
      if (skuId && itemSkuId !== skuId) return;

      txnHasMatchingSku = true;
      const qty = Number(item.quantity || item.qty || 0);
      const price = Number(item.price || item.unit_price || 0);
      total_volume += qty;
      total_revenue += qty * price;

      if (dailyStats[txnDate]) {
        dailyStats[txnDate].volume += qty;
        dailyStats[txnDate].sales_value += qty * price;
      }
    });

    if (txnHasMatchingSku) {
      txnIdSet.add(t._id || t.id);
      distinctTxnOutlets.add(t.outlet_id);
      if (hasVisit) {
        effectiveOutletsSet.add(t.outlet_id);
        if (dailyStats[txnDate]) {
          dailyStats[txnDate].effective_calls.add(t.outlet_id);
        }
      }
    }
  });

  const outlet_calls = distinctVisitOutlets.size;
  const effective_calls = effectiveOutletsSet.size;
  const transaction_count = txnIdSet.size;
  const ec_rate = outlet_calls > 0 ? Math.round((effective_calls / outlet_calls) * 100) : 0;

  // Lifecycle status counts
  const noo_count = (db.outlets || []).filter((o: any) => {
    if (areaId && o.area_id !== areaId) return false;
    return o.lifecycle_status === "NOO" || o.lifecycle_status === "NEW";
  }).length;

  const repeat_count = (db.outlets || []).filter((o: any) => {
    if (areaId && o.area_id !== areaId) return false;
    return o.lifecycle_status === "REPEAT";
  }).length;

  const active_count = (db.outlets || []).filter((o: any) => {
    if (areaId && o.area_id !== areaId) return false;
    return o.lifecycle_status === "ACTIVE";
  }).length;

  const dormant_count = (db.outlets || []).filter((o: any) => {
    if (areaId && o.area_id !== areaId) return false;
    return o.lifecycle_status === "DORMANT" || o.lifecycle_status === "INACTIVE";
  }).length;

  const totalFilteredOutlets = (db.outlets || []).filter((o: any) => !areaId || o.area_id === areaId).length;
  const coverage = totalFilteredOutlets > 0 ? Math.round((distinctTxnOutlets.size / totalFilteredOutlets) * 100) : 0;

  // Planned calls across call plans in range
  const relevantCallPlans = (db.call_plans || []).filter((cp: any) => {
    const cpDate = (cp.date || "").slice(0, 10);
    if (cpDate < safeFrom || cpDate > safeTo) return false;
    if (salesmanId && cp.salesman_id !== salesmanId) return false;
    return true;
  });
  const planned_calls = relevantCallPlans.reduce((sum: number, cp: any) => {
    const items = (db.call_plan_items || []).filter((i: any) => i.call_plan_id === cp._id);
    return sum + (items.length || Number(cp.total_outlets || 0));
  }, 0);
  const missed_calls = Math.max(0, planned_calls - outlet_calls);

  // New Outlets
  const new_outlets = (db.outlets || []).filter((o: any) => {
    const createdDate = (o.created_at || "").slice(0, 10);
    if (createdDate < safeFrom || createdDate > safeTo) return false;
    if (areaId && o.area_id !== areaId) return false;
    return true;
  }).length;

  // Targets
  const activeTargets = (db.targets || []).filter((tg: any) => {
    const tgPeriod = tg.period || tg.period_month;
    if (tgPeriod !== currentMonth) return false;
    if (salesmanId && tg.salesman_id !== salesmanId) return false;
    return true;
  });
  const target_volume = activeTargets.reduce((sum: number, tg: any) => sum + Number(tg.target_volume || 0), 0);
  const achievement_percentage = target_volume > 0 ? Math.round((total_volume / target_volume) * 100) : 0;

  // Stock
  let warehouseStock = 0;
  let salesmanStock = 0;
  (db.inventory || []).forEach((inv: any) => {
    const qty = Number(inv.stock_on_hand || inv.quantity || 0);
    if (inv.location_type === "WAREHOUSE" || inv.location_type === "OFFICE") {
      warehouseStock += qty;
    } else if (inv.location_type === "SALESMAN" || inv.location_type === "SALES") {
      salesmanStock += qty;
    }
  });
  const stock_on_hand = warehouseStock + salesmanStock;

  // Active salesmen
  const active_salesmen = (db.users || []).filter((u: any) => u.role === "SALES" && u.status === "ACTIVE").length;

  // Trend list
  const trend = Object.keys(dailyStats).sort().map((dateStr) => {
    const dStat = dailyStats[dateStr];
    const oc = dStat.outlet_calls.size;
    const ec = dStat.effective_calls.size;
    return {
      date: dateStr,
      sales_value: dStat.sales_value,
      volume: dStat.volume,
      outlet_calls: oc,
      effective_calls: ec,
      ec_rate: oc > 0 ? Math.round((ec / oc) * 100) : 0,
      planned: 0,
    };
  });

  // Area performance
  const area_performance = (db.areas || []).map((area: any) => {
    const aId = area._id || area.id;
    let aVol = 0;
    let aVal = 0;
    const aVisits = new Set<string>();
    const aEc = new Set<string>();

    validTxns.forEach((t: any) => {
      const o = outletsMap.get(t.outlet_id);
      if (o?.area_id === aId) {
        let hasMatched = false;
        (t.items || []).forEach((item: any) => {
          if (!skuId || item.sku_id === skuId) {
            hasMatched = true;
            const q = Number(item.quantity || 0);
            const p = Number(item.price || item.unit_price || 0);
            aVol += q;
            aVal += q * p;
          }
        });
        const txnDate = (t.created_at || t.date || "").slice(0, 10);
        if (hasMatched && visitKeySet.has(`${t.salesman_id}|${txnDate}|${t.outlet_id}`)) {
          aEc.add(t.outlet_id);
        }
      }
    });

    validVisits.forEach((v: any) => {
      const o = outletsMap.get(v.outlet_id);
      if (o?.area_id === aId) {
        aVisits.add(v.outlet_id);
      }
    });

    const aTgt = (db.targets || []).filter((tg: any) => {
      const u = usersMap.get(tg.salesman_id);
      const tgPeriod = tg.period || tg.period_month;
      return tgPeriod === currentMonth && u?.area_id === aId;
    }).reduce((s: number, tg: any) => s + Number(tg.target_volume || 0), 0);

    const aOc = aVisits.size;
    const aEffective = aEc.size;

    return {
      area_id: aId,
      area: area.area_name || area.name,
      area_name: area.area_name || area.name,
      volume: aVol,
      sales_value: aVal,
      total_sales: aVal,
      outlet_calls: aOc,
      effective_calls: aEffective,
      target_volume: aTgt || null,
      achievement_percentage: aTgt > 0 ? Math.round((aVol / aTgt) * 100) : 0,
      achievement_formatted: aTgt > 0 ? `${Math.round((aVol / aTgt) * 100)}%` : "-",
      ec_rate: aOc > 0 ? Math.round((aEffective / aOc) * 100) : 0,
    };
  });

  // Salesman performance
  const salesman_performance = (db.users || []).filter((u: any) => u.role === "SALES").map((user: any) => {
    const sId = user._id || user.id;
    let sVol = 0;
    let sVal = 0;
    let sTxns = 0;
    const sVisits = new Set<string>();
    const sEc = new Set<string>();

    validTxns.forEach((t: any) => {
      if (t.salesman_id === sId) {
        let hasItem = false;
        (t.items || []).forEach((item: any) => {
          if (!skuId || item.sku_id === skuId) {
            hasItem = true;
            const q = Number(item.quantity || 0);
            const p = Number(item.price || item.unit_price || 0);
            sVol += q;
            sVal += q * p;
          }
        });
        if (hasItem) {
          sTxns++;
          const txnDate = (t.created_at || t.date || "").slice(0, 10);
          if (visitKeySet.has(`${sId}|${txnDate}|${t.outlet_id}`)) {
            sEc.add(t.outlet_id);
          }
        }
      }
    });

    validVisits.forEach((v: any) => {
      if (v.salesman_id === sId) {
        sVisits.add(v.outlet_id);
      }
    });

    const sTgt = (db.targets || []).filter((tg: any) => {
      const tgPeriod = tg.period || tg.period_month;
      return tgPeriod === currentMonth && tg.salesman_id === sId;
    }).reduce((s: number, tg: any) => s + Number(tg.target_volume || 0), 0);

    const uArea = areasMap.get(user.area_id);
    const sOc = sVisits.size;
    const sEffective = sEc.size;

    return {
      salesman_id: sId,
      name: user.name,
      code: user.name,
      area: uArea?.area_name || user.area_id || "-",
      volume: sVol,
      sales_value: sVal,
      value: sVal,
      txns: sTxns,
      outlet_calls: sOc,
      effective_calls: sEffective,
      target_volume: sTgt || null,
      achievement_percentage: sTgt > 0 ? Math.round((sVol / sTgt) * 100) : 0,
      achievement_formatted: sTgt > 0 ? `${Math.round((sVol / sTgt) * 100)}%` : "-",
      ec_rate: sOc > 0 ? Math.round((sEffective / sOc) * 100) : 0,
      planned: 0,
    };
  });

  // Product coverage
  const product_coverage = (db.skus || []).map((sku: any) => {
    const skId = sku._id || sku.id;
    let pVol = 0;
    let pVal = 0;

    validTxns.forEach((t: any) => {
      (t.items || []).forEach((item: any) => {
        if (item.sku_id === skId) {
          const q = Number(item.quantity || 0);
          const p = Number(item.price || item.unit_price || 0);
          pVol += q;
          pVal += q * p;
        }
      });
    });

      const sTgt = (db.targets || [])
        .filter((tg: any) => {
          const tgPeriod = tg.period || tg.period_month;
          return tgPeriod === currentMonth && (tg.sku_id === skId || tg.product_id === sku.product_id);
        })
        .reduce((s: number, tg: any) => s + Number(tg.target_volume || 0), 0);
      return {
        sku_id: skId,
        sku: sku.sku_name || sku.name,
        code: sku.sku_code || sku.code,
        qty: pVol,
        value: pVal,
        sales_value: pVal,
        effective_calls: 0,
        target_volume: sTgt > 0 ? sTgt : null,
        achievement_percentage: sTgt > 0 ? Math.round((pVol / sTgt) * 100) : 0,
        achievement_formatted: sTgt > 0 ? `${Math.round((pVol / sTgt) * 100)}%` : "-",
        outlet_calls: outlet_calls,
        coverage: 0,
      };
  });

  // Top Outlets
  const outletSalesMap: Record<string, { volume: number; value: number }> = {};
  validTxns.forEach((t: any) => {
    if (!outletSalesMap[t.outlet_id]) outletSalesMap[t.outlet_id] = { volume: 0, value: 0 };
    (t.items || []).forEach((item: any) => {
      if (!skuId || item.sku_id === skuId) {
        const q = Number(item.quantity || 0);
        const p = Number(item.price || item.unit_price || 0);
        outletSalesMap[t.outlet_id].volume += q;
        outletSalesMap[t.outlet_id].value += q * p;
      }
    });
  });

  const top_outlets = Object.keys(outletSalesMap)
    .map((oId) => {
      const o = outletsMap.get(oId);
      return {
        name: o?.outlet_name || o?.name || oId,
        volume: outletSalesMap[oId].volume,
        value: outletSalesMap[oId].value,
      };
    })
    .sort((a, b) => b.value - a.value)
    .slice(0, 20);

  return {
    totals: {
      sales_value: total_revenue,
      total_sales: total_revenue,
      total_volume: total_volume,
      volume: total_volume,
      target_volume: target_volume,
      actual_volume: total_volume,
      achievement_percentage: achievement_percentage,
      achievement_formatted: `${achievement_percentage}%`,
      achievement_status: "Target Berdasarkan Volume",
      transactions: transaction_count,
      transaction_count: transaction_count,
      planned: planned_calls,
      outlet_calls: outlet_calls,
      actual: outlet_calls,
      effective_calls: effective_calls,
      effective: effective_calls,
      ec_rate: ec_rate,
      effective_ratio: ec_rate,
      missed: missed_calls,
      coverage: coverage,
      new_outlets: new_outlets,
      noo_count: noo_count,
      repeat_count: repeat_count,
      active_count: active_count,
      dormant_count: dormant_count,
      active_sales: active_salesmen,
      active_salesmen: active_salesmen,
      warehouse_stock: warehouseStock,
      salesman_stock: salesmanStock,
      stock_on_hand: stock_on_hand,
    },
    trend,
    area_performance,
    product_coverage,
    salesman_performance,
    top_outlets,
    top_products: [...product_coverage].sort((a: any, b: any) => (b.value || 0) - (a.value || 0)),
  };
}

export async function getOwnerDashboardData(req: any) {
  return getOwnerDashboardDataInMemory(req);
}

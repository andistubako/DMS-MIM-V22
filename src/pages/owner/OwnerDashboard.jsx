import { useEffect, useState, useCallback, useMemo } from "react";
import { Link } from "react-router-dom";
import { toast } from "sonner";
import { 
  Loader2, RefreshCw, Filter, Banknote, ArrowRight, Sparkles, 
  TrendingUp, BarChart3, Table as TableIcon, Layers, Calendar, 
  CheckCircle2, AlertCircle, Info
} from "lucide-react";
import { 
  AreaChart, Area, BarChart, Bar, XAxis, YAxis, CartesianGrid, 
  Tooltip, ResponsiveContainer, Legend, ComposedChart, Line 
} from "recharts";
import api, { errMsg } from "../../lib/api";
import StatCard from "../../components/StatCard";
import AiInsightModal from "../../components/AiInsightModal";
import { rupiah, todayLocal, fmtDate, formatNumber } from "../../lib/format";
import { Input } from "../../components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Button } from "../../components/ui/button";

const formatYAxisRevenue = (v) => {
  if (!v || v === 0) return "Rp 0";
  if (v >= 1_000_000_000) return `Rp ${(v / 1_000_000_000).toFixed(1).replace(/\.0$/, "")}M`;
  if (v >= 1_000_000) return `Rp ${(v / 1_000_000).toFixed(1).replace(/\.0$/, "")}jt`;
  if (v >= 1_000) return `Rp ${Math.round(v / 1_000)}rb`;
  return `Rp ${v}`;
};

const formatYAxisVolume = (v) => {
  if (!v || v === 0) return "0";
  if (v >= 1_000) return `${(v / 1_000).toFixed(1).replace(/\.0$/, "")}rb`;
  return String(v);
};

const formatDateAxis = (d) => {
  if (!d) return "";
  const parts = String(d).split("-");
  if (parts.length === 3) {
    return `${parts[2]}/${parts[1]}`;
  }
  return String(d);
};

export default function OwnerDashboard() {
  const [data, setData] = useState(null);
  const [callMetrics, setCallMetrics] = useState(null);
  const [callMetricsError, setCallMetricsError] = useState(false);
  const [loading, setLoading] = useState(true);
  const [aiModalOpen, setAiModalOpen] = useState(false);
  const [areas, setAreas] = useState([]);
  const [salesmen, setSalesmen] = useState([]);
  const [selectedArea, setSelectedArea] = useState("ALL");
  const [selectedSalesman, setSelectedSalesman] = useState("ALL");

  // Chart view modes
  const [salesChartMode, setSalesChartMode] = useState("revenue"); // "revenue" | "volume"
  const [areaViewMode, setAreaViewMode] = useState("table"); // "table" | "chart"
  const [productViewMode, setProductViewMode] = useState("table"); // "table" | "chart"
  const [salesmanViewMode, setSalesmanViewMode] = useState("table"); // "table" | "chart"

  const [range, setRange] = useState(() => {
    const f = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const to = new Date();
    const from = new Date(Date.now() - 13 * 86400000);
    return { from: f(from), to: f(to) };
  });

  const setPreset = (preset) => {
    const f = (d) => new Intl.DateTimeFormat("en-CA", { timeZone: "Asia/Jakarta", year: "numeric", month: "2-digit", day: "2-digit" }).format(d);
    const now = new Date();
    if (preset === "today") { const t = todayLocal(); setRange({ from: t, to: t }); }
    else if (preset === "7d") setRange({ from: f(new Date(Date.now() - 6 * 86400000)), to: f(now) });
    else if (preset === "30d") setRange({ from: f(new Date(Date.now() - 29 * 86400000)), to: f(now) });
    else if (preset === "thisMonth") { const cur = todayLocal(); setRange({ from: `${cur.slice(0, 7)}-01`, to: cur }); }
  };

  useEffect(() => {
    async function loadMasterFilters() {
      try {
        const [areasRes, usersRes] = await Promise.allSettled([
          api.get("/areas"),
          api.get("/users"),
        ]);
        if (areasRes.status === "fulfilled") {
          const aData = areasRes.value.data;
          setAreas(Array.isArray(aData) ? aData : (aData?.items || []));
        }
        if (usersRes.status === "fulfilled") {
          const uData = usersRes.value.data;
          const uList = Array.isArray(uData) ? uData : (uData?.items || []);
          setSalesmen(uList.filter((u) => u.role === "SALES"));
        }
      } catch (err) {
        console.warn("Failed to load filter options", err);
      }
    }
    loadMasterFilters();
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setCallMetricsError(false);
    try {
      const params = {
        ...range,
        ...(selectedArea !== "ALL" ? { areaId: selectedArea, area_id: selectedArea } : {}),
        ...(selectedSalesman !== "ALL" ? { salesmanId: selectedSalesman, salesman_id: selectedSalesman } : {}),
      };

      const [dashResult, metricsResult] = await Promise.allSettled([
        api.get("/dashboard/owner", { params }),
        api.get("/metrics/calls", { params }),
      ]);

      if (dashResult.status === "fulfilled") {
        setData(dashResult.value.data);
      } else {
        toast.error(errMsg(dashResult.reason));
      }

      if (metricsResult.status === "fulfilled") {
        const metrics = metricsResult.value.data || {};
        const daily = Array.isArray(metrics.daily) ? metrics.daily : [];
        const dailyMap = Object.fromEntries(daily.map((x) => [x.date, x]));
        setCallMetrics({
          outlet_call: Number(metrics.outlet_call || 0),
          effective_call: Number(metrics.effective_call || 0),
          ec_rate: Number(metrics.ec_rate || 0),
          daily: dailyMap,
        });
      } else {
        setCallMetrics(null);
        setCallMetricsError(true);
      }
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [range, selectedArea, selectedSalesman]);

  useEffect(() => { load(); }, [load]);

  const t = data?.totals || {};
  const canonicalOutletCall = callMetrics?.outlet_call ?? t.outlet_calls ?? t.actual ?? (callMetricsError ? 0 : null);
  const canonicalEffectiveCall = callMetrics?.effective_call ?? t.effective_calls ?? t.effective ?? (callMetricsError ? 0 : null);
  const canonicalEcRate = callMetrics?.ec_rate ?? t.ec_rate ?? (canonicalOutletCall > 0 ? Math.round(((canonicalEffectiveCall || 0) / canonicalOutletCall) * 100) : (callMetricsError ? 0 : null));

  const canonicalTrend = useMemo(() => {
    return (data?.trend || []).map((row) => {
      const oc = callMetrics?.daily?.[row.date]?.outlet_call ?? row.outlet_calls ?? 0;
      const ec = callMetrics?.daily?.[row.date]?.effective_call ?? row.effective_calls ?? 0;
      const rate = oc > 0 ? Math.round((ec / oc) * 100) : 0;
      return {
        ...row,
        sales_value: Number(row.sales_value || 0),
        volume: Number(row.volume || 0),
        outlet_calls: oc,
        effective_calls: ec,
        ec_rate: rate,
      };
    });
  }, [data?.trend, callMetrics]);

  const totalPeriodRevenue = useMemo(() => {
    return canonicalTrend.reduce((sum, r) => sum + (r.sales_value || 0), 0);
  }, [canonicalTrend]);

  const totalPeriodVolume = useMemo(() => {
    return canonicalTrend.reduce((sum, r) => sum + (r.volume || 0), 0);
  }, [canonicalTrend]);

  const totalPeriodOC = useMemo(() => {
    return canonicalTrend.reduce((sum, r) => sum + (r.outlet_calls || 0), 0);
  }, [canonicalTrend]);

  const totalPeriodEC = useMemo(() => {
    return canonicalTrend.reduce((sum, r) => sum + (r.effective_calls || 0), 0);
  }, [canonicalTrend]);

  const avgPeriodEcRate = totalPeriodOC > 0 ? Math.round((totalPeriodEC / totalPeriodOC) * 100) : 0;

  if (loading && !data) {
    return (
      <div className="flex flex-col items-center justify-center py-24 gap-3" data-testid="owner-loading">
        <Loader2 className="animate-spin text-navy" size={32} />
        <span className="text-sm font-medium text-slate-500">Memuat data dashboard...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6" data-testid="owner-dashboard">
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-heading text-xl font-extrabold text-navy tracking-tight">DMS Mahameru Dashboard</h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Google Cloud Firestore (SSOT) Active
            </span>
            <Link
              to="/finance"
              className="inline-flex items-center gap-1 text-[11px] font-bold text-navy hover:text-navy-light bg-gold/20 hover:bg-gold/30 px-2.5 py-0.5 rounded-full border border-gold/40 transition-colors"
            >
              <Banknote size={12} />
              <span>Keuangan & Tutup Buku</span>
              <ArrowRight size={10} />
            </Link>
          </div>
          <p className="text-xs text-slate-500">Distribution Management System — Data live real-time dari Google Cloud Firestore Single Source of Truth</p>
        </div>
        
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <Select value={selectedArea} onValueChange={setSelectedArea}>
              <SelectTrigger className="w-36 text-xs h-9">
                <SelectValue placeholder="Semua Area" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Area</SelectItem>
                {areas.map((a) => (
                  <SelectItem key={a._id || a.id} value={a._id || a.id}>
                    {a.area_name || a.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <Select value={selectedSalesman} onValueChange={setSelectedSalesman}>
              <SelectTrigger className="w-36 text-xs h-9">
                <SelectValue placeholder="Semua Sales" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Sales</SelectItem>
                {salesmen.map((s) => (
                  <SelectItem key={s._id || s.id} value={s._id || s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
            <button type="button" onClick={() => setPreset("today")} className="px-2.5 py-1 text-xs font-semibold rounded-md hover:bg-white hover:shadow-xs transition-all">Hari Ini</button>
            <button type="button" onClick={() => setPreset("7d")} className="px-2.5 py-1 text-xs font-semibold rounded-md hover:bg-white hover:shadow-xs transition-all">7 Hari</button>
            <button type="button" onClick={() => setPreset("30d")} className="px-2.5 py-1 text-xs font-semibold rounded-md hover:bg-white hover:shadow-xs transition-all">30 Hari</button>
            <button type="button" onClick={() => setPreset("thisMonth")} className="px-2.5 py-1 text-xs font-semibold rounded-md hover:bg-white hover:shadow-xs transition-all">Bulan Ini</button>
          </div>

          <div className="flex items-center gap-1.5">
            <Input type="date" value={range.from} onChange={(e) => setRange((r) => ({ ...r, from: e.target.value }))} className="w-36 text-xs h-9" />
            <span className="text-xs text-slate-400 font-semibold">s/d</span>
            <Input type="date" value={range.to} onChange={(e) => setRange((r) => ({ ...r, to: e.target.value }))} className="w-36 text-xs h-9" />
          </div>

          <Button variant="outline" size="icon" onClick={() => load()} className="h-9 w-9" title="Segarkan Data">
            <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
          </Button>

          <Button
            onClick={() => setAiModalOpen(true)}
            className="h-9 px-3 text-xs font-semibold bg-gradient-to-r from-amber-500 to-indigo-600 hover:from-amber-600 hover:to-indigo-700 text-white shadow-xs flex items-center gap-1.5"
          >
            <Sparkles size={14} />
            <span>Analisis AI</span>
          </Button>
        </div>
      </div>

      {callMetricsError && selectedArea === "ALL" && (
        <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-xs font-semibold text-amber-800" role="alert">
          Data Outlet Call / Effective Call tidak tersedia dari server canonical. KPI Call menggunakan data tersinkronisasi.
        </div>
      )}

      {/* KPI Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-6 gap-3" data-testid="owner-kpis">
        <StatCard label="Nilai Penjualan (Revenue)" value={rupiah(t.sales_value ?? t.total_sales ?? 0)} testid="kpi-total-sales" />
        <StatCard label="Target Volume (Qty)" value={`${(t.target_volume ?? 0).toLocaleString("id-ID")} Qty`} sub="Target kuantitas produk" testid="kpi-target-volume" />
        <StatCard label="Actual Volume (Qty)" value={`${(t.total_volume ?? t.volume ?? 0).toLocaleString("id-ID")} Qty`} sub={`Ach: ${t.achievement_formatted || `${t.achievement_percentage ?? 0}%`}`} testid="kpi-total-volume" />
        <StatCard label="Volume Achievement" value={t.achievement_formatted || `${t.achievement_percentage ?? 0}%`} sub={t.achievement_status || "Target Berdasarkan Volume"} testid="kpi-volume-achievement" />
        <StatCard label="Transaksi" value={t.transactions ?? t.transaction_count ?? 0} testid="kpi-total-txn" />
        <StatCard label="Planned Call" value={t.planned ?? 0} testid="kpi-planned" />
        <StatCard label="Outlet Call" value={canonicalOutletCall ?? "—"} testid="kpi-outlet-call" />
        <StatCard label="Effective Call" value={canonicalEffectiveCall ?? "—"} testid="kpi-effective" />
        <StatCard label="EC Rate" value={canonicalEcRate == null ? "—" : `${canonicalEcRate}%`} testid="kpi-ec-rate" />
        <StatCard label="Missed Call" value={t.missed ?? 0} testid="kpi-missed" />
        <StatCard label="Coverage Outlet" value={`${t.coverage ?? 0}%`} testid="kpi-coverage" />
        <StatCard label="NOO (Outlet Baru)" value={t.noo_count ?? 0} testid="kpi-noo" />
        <StatCard label="Repeat Order" value={t.repeat_count ?? 0} testid="kpi-repeat" />
        <StatCard label="Active Outlet" value={t.active_count ?? 0} testid="kpi-active" />
        <StatCard label="Dormant Outlet" value={t.dormant_count ?? 0} testid="kpi-dormant" />
        <StatCard label="Total Stock" value={(t.stock_on_hand ?? 0).toLocaleString("id-ID")} testid="kpi-total-stock" />
        <StatCard label="Stock Warehouse" value={(t.warehouse_stock ?? 0).toLocaleString("id-ID")} testid="kpi-warehouse-stock" />
        <StatCard label="Stock Salesman" value={(t.salesman_stock ?? 0).toLocaleString("id-ID")} testid="kpi-salesman-stock" />
      </div>

      {/* Trends Charts */}
      <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
        {/* Chart 1: Tren Penjualan (Revenue / Volume Toggle) */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <TrendingUp size={16} className="text-gold" />
                <h3 className="font-heading font-bold text-navy text-sm">
                  {salesChartMode === "revenue" ? "Tren Penjualan (Revenue)" : "Tren Volume Penjualan"}
                </h3>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                {salesChartMode === "revenue" 
                  ? `Total periode: ${rupiah(totalPeriodRevenue)}` 
                  : `Total periode: ${totalPeriodVolume.toLocaleString("id-ID")} Qty`}
              </p>
            </div>

            <div className="flex items-center gap-1 bg-slate-100 p-1 rounded-lg">
              <button
                type="button"
                onClick={() => setSalesChartMode("revenue")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  salesChartMode === "revenue"
                    ? "bg-white text-navy shadow-xs font-bold"
                    : "text-slate-600 hover:text-navy"
                }`}
              >
                Revenue (Rp)
              </button>
              <button
                type="button"
                onClick={() => setSalesChartMode("volume")}
                className={`px-2.5 py-1 text-xs font-semibold rounded-md transition-all ${
                  salesChartMode === "volume"
                    ? "bg-white text-navy shadow-xs font-bold"
                    : "text-slate-600 hover:text-navy"
                }`}
              >
                Volume (Qty)
              </button>
            </div>
          </div>

          <div className="h-64 relative">
            {canonicalTrend.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs gap-1">
                <Info size={18} />
                <span>Belum ada data tren penjualan pada periode yang dipilih.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={canonicalTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <defs>
                    <linearGradient id="colorSalesRevenue" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#C5A059" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#C5A059" stopOpacity={0.0} />
                    </linearGradient>
                    <linearGradient id="colorSalesVolume" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="5%" stopColor="#2563EB" stopOpacity={0.45} />
                      <stop offset="95%" stopColor="#2563EB" stopOpacity={0.0} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10, fill: '#64748B' }} 
                    tickFormatter={formatDateAxis} 
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 10, fill: '#64748B' }} 
                    tickFormatter={salesChartMode === "revenue" ? formatYAxisRevenue : formatYAxisVolume} 
                    axisLine={false}
                    tickLine={false}
                    width={58}
                  />
                  <Tooltip 
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        return (
                          <div className="bg-white/95 backdrop-blur-xs p-3 rounded-xl border border-slate-200 shadow-md text-xs space-y-1.5 min-w-[180px]">
                            <p className="font-bold text-navy border-b border-slate-100 pb-1">{fmtDate(label)}</p>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-slate-500 font-medium">Nilai Penjualan:</span>
                              <span className="font-bold text-navy">{rupiah(d.sales_value ?? 0)}</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="text-slate-500 font-medium">Volume:</span>
                              <span className="font-bold text-blue-600">{(d.volume ?? 0).toLocaleString("id-ID")} Qty</span>
                            </div>
                            {d.effective_calls > 0 && (
                              <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-100">
                                <span className="text-slate-500 font-medium">EC Transaksi:</span>
                                <span className="font-bold text-emerald-600">{d.effective_calls} toko</span>
                              </div>
                            )}
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Area 
                    type="monotone" 
                    dataKey={salesChartMode === "revenue" ? "sales_value" : "volume"} 
                    name={salesChartMode === "revenue" ? "Nilai Penjualan" : "Volume Qty"} 
                    stroke={salesChartMode === "revenue" ? "#0A2540" : "#2563EB"} 
                    fill={salesChartMode === "revenue" ? "url(#colorSalesRevenue)" : "url(#colorSalesVolume)"} 
                    strokeWidth={2.5} 
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Chart 2: Tren Kunjungan & Efektivitas Call */}
        <div className="bg-white border border-slate-200 rounded-xl p-5 space-y-3 shadow-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-100 pb-3">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 size={16} className="text-blue-600" />
                <h3 className="font-heading font-bold text-navy text-sm">Tren Kunjungan &amp; Efektivitas</h3>
              </div>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Total OC: <span className="font-bold text-navy">{totalPeriodOC}</span> | Total EC: <span className="font-bold text-emerald-600">{totalPeriodEC}</span> | EC Rate: <span className="font-bold text-blue-600">{avgPeriodEcRate}%</span>
              </p>
            </div>

            <div className="flex items-center gap-3 text-xs font-semibold text-slate-600">
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-blue-500 inline-block"></span>
                Outlet Call
              </span>
              <span className="flex items-center gap-1.5">
                <span className="w-3 h-3 rounded-xs bg-emerald-500 inline-block"></span>
                Effective Call
              </span>
            </div>
          </div>

          <div className="h-64 relative">
            {canonicalTrend.length === 0 ? (
              <div className="h-full flex flex-col items-center justify-center text-slate-400 text-xs gap-1">
                <Info size={18} />
                <span>Belum ada data aktivitas kunjungan pada periode yang dipilih.</span>
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={canonicalTrend} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" vertical={false} />
                  <XAxis 
                    dataKey="date" 
                    tick={{ fontSize: 10, fill: '#64748B' }} 
                    tickFormatter={formatDateAxis} 
                    axisLine={{ stroke: '#E2E8F0' }}
                    tickLine={false}
                  />
                  <YAxis 
                    tick={{ fontSize: 10, fill: '#64748B' }} 
                    allowDecimals={false} 
                    axisLine={false}
                    tickLine={false}
                    width={32}
                  />
                  <Tooltip 
                    content={({ active, payload, label }) => {
                      if (active && payload && payload.length) {
                        const d = payload[0].payload;
                        const oc = d.outlet_calls ?? 0;
                        const ec = d.effective_calls ?? 0;
                        const rate = d.ec_rate ?? (oc > 0 ? Math.round((ec / oc) * 100) : 0);
                        return (
                          <div className="bg-white/95 backdrop-blur-xs p-3 rounded-xl border border-slate-200 shadow-md text-xs space-y-1.5 min-w-[190px]">
                            <p className="font-bold text-navy border-b border-slate-100 pb-1">{fmtDate(label)}</p>
                            <div className="flex items-center justify-between gap-3">
                              <span className="flex items-center gap-1.5 text-slate-600">
                                <span className="w-2 h-2 rounded-full bg-blue-500 inline-block"></span>
                                Outlet Call:
                              </span>
                              <span className="font-bold text-navy">{oc} Kunjungan</span>
                            </div>
                            <div className="flex items-center justify-between gap-3">
                              <span className="flex items-center gap-1.5 text-slate-600">
                                <span className="w-2 h-2 rounded-full bg-emerald-500 inline-block"></span>
                                Effective Call:
                              </span>
                              <span className="font-bold text-emerald-700">{ec} Transaksi</span>
                            </div>
                            <div className="flex items-center justify-between gap-3 pt-1 border-t border-slate-100">
                              <span className="text-slate-500 font-medium">EC Rate:</span>
                              <span className={`font-bold px-1.5 py-0.5 rounded text-[11px] ${
                                rate >= 70 ? "bg-emerald-50 text-emerald-700" :
                                rate >= 40 ? "bg-blue-50 text-blue-700" : "bg-slate-100 text-slate-600"
                              }`}>
                                {rate}% {rate >= 70 ? "(Tinggi)" : rate >= 40 ? "(Normal)" : "(Rendah)"}
                              </span>
                            </div>
                          </div>
                        );
                      }
                      return null;
                    }}
                  />
                  <Bar dataKey="outlet_calls" name="Outlet Call" fill="#3B82F6" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="effective_calls" name="Effective Call" fill="#10B981" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* Performance Tables & Visualizations */}
      <div className="grid grid-cols-1 xl:grid-cols-3 gap-6">
        {/* Area Performance */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading font-bold text-navy text-sm">Performa Area &amp; Volume Target</h3>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setAreaViewMode("table")}
                className={`p-1 rounded-md text-xs font-semibold ${areaViewMode === "table" ? "bg-white text-navy shadow-xs" : "text-slate-500"}`}
                title="Tampilan Tabel"
              >
                <TableIcon size={14} />
              </button>
              <button
                type="button"
                onClick={() => setAreaViewMode("chart")}
                className={`p-1 rounded-md text-xs font-semibold ${areaViewMode === "chart" ? "bg-white text-navy shadow-xs" : "text-slate-500"}`}
                title="Tampilan Grafik"
              >
                <BarChart3 size={14} />
              </button>
            </div>
          </div>

          {areaViewMode === "chart" ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={(data?.area_performance || []).map(a => ({
                    name: a.area || a.area_name || "-",
                    Actual: Number(a.volume || 0),
                    Target: Number(a.target_volume || 0),
                    Revenue: Number(a.sales_value || 0),
                  }))}
                  layout="vertical"
                  margin={{ top: 5, right: 20, left: 10, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" horizontal={false} stroke="#F1F5F9" />
                  <XAxis type="number" tick={{ fontSize: 10, fill: '#64748B' }} />
                  <YAxis type="category" dataKey="name" tick={{ fontSize: 10, fill: '#1E293B' }} width={80} />
                  <Tooltip 
                    formatter={(val, name) => [`${val.toLocaleString("id-ID")} Qty`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Actual" fill="#0A2540" radius={[0, 4, 4, 0]} />
                  <Bar dataKey="Target" fill="#94A3B8" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Area</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Actual</TableHead>
                    <TableHead>Ach %</TableHead>
                    <TableHead>Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.area_performance || []).map((a, i) => (
                    <TableRow key={i}>
                      <TableCell className="font-bold text-navy whitespace-nowrap">{a.area || "-"}</TableCell>
                      <TableCell>{a.target_volume != null ? `${a.target_volume.toLocaleString("id-ID")} Qty` : "-"}</TableCell>
                      <TableCell>{(a.volume ?? 0).toLocaleString("id-ID")} Qty</TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          (a.achievement_percentage || 0) >= 100 ? "bg-emerald-50 text-emerald-700" :
                          (a.achievement_percentage || 0) >= 75 ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"
                        }`}>
                          {a.achievement_formatted || (a.target_volume != null ? `${a.achievement_percentage}%` : "-")}
                        </span>
                      </TableCell>
                      <TableCell>{rupiah(a.sales_value ?? 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Product Volume vs Target */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading font-bold text-navy text-sm">Target vs Actual Volume Produk</h3>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setProductViewMode("table")}
                className={`p-1 rounded-md text-xs font-semibold ${productViewMode === "table" ? "bg-white text-navy shadow-xs" : "text-slate-500"}`}
                title="Tampilan Tabel"
              >
                <TableIcon size={14} />
              </button>
              <button
                type="button"
                onClick={() => setProductViewMode("chart")}
                className={`p-1 rounded-md text-xs font-semibold ${productViewMode === "chart" ? "bg-white text-navy shadow-xs" : "text-slate-500"}`}
                title="Tampilan Grafik"
              >
                <BarChart3 size={14} />
              </button>
            </div>
          </div>

          {productViewMode === "chart" ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={(data?.product_coverage || []).slice(0, 6).map(s => ({
                    name: s.sku || s.code || "-",
                    Actual: Number(s.qty || 0),
                    Target: Number(s.target_volume || 0),
                  }))}
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748B' }} interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748B' }} width={35} />
                  <Tooltip 
                    formatter={(val, name) => [`${val.toLocaleString("id-ID")} Qty`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Actual" fill="#C5A059" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Target" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>SKU</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Actual</TableHead>
                    <TableHead>Ach %</TableHead>
                    <TableHead>Nilai</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.product_coverage || []).map((s, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="font-bold text-navy whitespace-nowrap">{s.sku || "-"}</div>
                        <div className="text-[10px] text-slate-400 font-mono">{s.code || "-"}</div>
                      </TableCell>
                      <TableCell>{s.target_volume != null ? `${s.target_volume.toLocaleString("id-ID")} Qty` : "-"}</TableCell>
                      <TableCell>{(s.qty ?? 0).toLocaleString("id-ID")} Qty</TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          (s.achievement_percentage || 0) >= 100 ? "bg-emerald-50 text-emerald-700" :
                          (s.achievement_percentage || 0) >= 75 ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"
                        }`}>
                          {s.achievement_formatted || (s.target_volume != null ? `${s.achievement_percentage}%` : "-")}
                        </span>
                      </TableCell>
                      <TableCell>{rupiah(s.value ?? 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>

        {/* Salesman Performance */}
        <div className="bg-white border border-slate-200 rounded-xl p-5">
          <div className="flex items-center justify-between mb-3">
            <h3 className="font-heading font-bold text-navy text-sm">Performa Salesman &amp; Volume Target</h3>
            <div className="flex items-center gap-1 bg-slate-100 p-0.5 rounded-lg">
              <button
                type="button"
                onClick={() => setSalesmanViewMode("table")}
                className={`p-1 rounded-md text-xs font-semibold ${salesmanViewMode === "table" ? "bg-white text-navy shadow-xs" : "text-slate-500"}`}
                title="Tampilan Tabel"
              >
                <TableIcon size={14} />
              </button>
              <button
                type="button"
                onClick={() => setSalesmanViewMode("chart")}
                className={`p-1 rounded-md text-xs font-semibold ${salesmanViewMode === "chart" ? "bg-white text-navy shadow-xs" : "text-slate-500"}`}
                title="Tampilan Grafik"
              >
                <BarChart3 size={14} />
              </button>
            </div>
          </div>

          {salesmanViewMode === "chart" ? (
            <div className="h-64">
              <ResponsiveContainer width="100%" height="100%">
                <BarChart 
                  data={(data?.salesman_performance || []).slice(0, 8).map(s => ({
                    name: s.name || "-",
                    Actual: Number(s.volume || 0),
                    Target: Number(s.target_volume || 0),
                  }))}
                  margin={{ top: 5, right: 10, left: 0, bottom: 5 }}
                >
                  <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#F1F5F9" />
                  <XAxis dataKey="name" tick={{ fontSize: 9, fill: '#64748B' }} interval={0} />
                  <YAxis tick={{ fontSize: 10, fill: '#64748B' }} width={35} />
                  <Tooltip 
                    formatter={(val, name) => [`${val.toLocaleString("id-ID")} Qty`, name]}
                  />
                  <Legend wrapperStyle={{ fontSize: 11 }} />
                  <Bar dataKey="Actual" fill="#0A2540" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="Target" fill="#94A3B8" radius={[4, 4, 0, 0]} />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Sales</TableHead>
                    <TableHead>Target</TableHead>
                    <TableHead>Actual</TableHead>
                    <TableHead>Ach %</TableHead>
                    <TableHead>Revenue</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(data?.salesman_performance || []).map((s, i) => (
                    <TableRow key={i}>
                      <TableCell>
                        <div className="font-bold text-navy whitespace-nowrap">{s.name || "-"}</div>
                        <div className="text-[10px] text-slate-400">{s.area || "-"}</div>
                      </TableCell>
                      <TableCell>{s.target_volume != null ? `${s.target_volume.toLocaleString("id-ID")} Qty` : "-"}</TableCell>
                      <TableCell>{(s.volume ?? 0).toLocaleString("id-ID")} Qty</TableCell>
                      <TableCell>
                        <span className={`px-2 py-0.5 rounded-full text-[10px] font-bold ${
                          (s.achievement_percentage || 0) >= 100 ? "bg-emerald-50 text-emerald-700" :
                          (s.achievement_percentage || 0) >= 75 ? "bg-amber-50 text-amber-700" : "bg-slate-50 text-slate-600"
                        }`}>
                          {s.achievement_formatted || (s.target_volume != null ? `${s.achievement_percentage}%` : "-")}
                        </span>
                      </TableCell>
                      <TableCell>{rupiah(s.value ?? 0)}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </div>
      </div>

      {/* Top 20 Outlets */}
      <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs">
        <h3 className="font-heading font-bold text-navy text-sm mb-3">Top 20 Outlets by Revenue</h3>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Rank</TableHead>
                <TableHead>Outlet Name</TableHead>
                <TableHead>Volume Penjualan</TableHead>
                <TableHead>Total Revenue</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {(data?.top_outlets || []).length === 0 ? (
                <TableRow>
                  <TableCell colSpan={4} className="text-center py-6 text-slate-400">
                    Belum ada data transaksi outlet pada periode yang dipilih.
                  </TableCell>
                </TableRow>
              ) : (
                (data?.top_outlets || []).map((o, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-bold text-slate-500 w-16">#{i + 1}</TableCell>
                    <TableCell className="font-medium text-navy">{o.name || "-"}</TableCell>
                    <TableCell>{(o.volume ?? 0).toLocaleString("id-ID")} Qty</TableCell>
                    <TableCell className="font-semibold text-slate-800">{rupiah(o.value ?? 0)}</TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      <AiInsightModal
        open={aiModalOpen}
        onOpenChange={setAiModalOpen}
        topic="sales_summary"
        title="Wawasan Eksekutif Penjualan & Distribusi"
        contextData={{
          totals: data?.totals,
          trendSummary: canonicalTrend.slice(-7),
          topProducts: data?.top_products?.slice(0, 5) || data?.product_coverage?.slice(0, 5),
          topOutlets: data?.top_outlets?.slice(0, 5),
          selectedArea,
          selectedSalesman,
          range,
        }}
      />
    </div>
  );
}

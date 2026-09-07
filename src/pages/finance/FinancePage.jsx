import { useEffect, useState, useCallback, useMemo } from "react";
import { toast } from "sonner";
import {
  Loader2,
  RefreshCw,
  Target,
  CreditCard,
  Banknote,
  Scale,
  CloudCheck,
  CheckCircle2,
  AlertCircle,
  Clock,
  Plus,
  ArrowUpRight,
  Receipt,
  FileSpreadsheet,
  Calendar,
  Building2,
  User,
  Package,
  TrendingUp,
  ShieldCheck,
  XCircle,
  Coins,
  DollarSign
} from "lucide-react";
import api, { errMsg } from "../../lib/api";
import { useAuth } from "../../context/AuthContext";
import StatCard from "../../components/StatCard";
import { rupiah, todayLocal, fmtDate, formatNumber } from "../../lib/format";
import { Input } from "../../components/ui/input";
import { Button } from "../../components/ui/button";
import { Label } from "../../components/ui/label";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "../../components/ui/table";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "../../components/ui/select";
import { Tabs, TabsList, TabsTrigger, TabsContent } from "../../components/ui/tabs";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "../../components/ui/dialog";

export default function FinancePage() {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("targets");
  const [loading, setLoading] = useState(true);

  // Period / Date Filters
  const currentMonth = todayLocal().slice(0, 7); // YYYY-MM
  const [period, setPeriod] = useState(currentMonth);
  const [selectedDate, setSelectedDate] = useState(todayLocal());
  const [selectedSalesman, setSelectedSalesman] = useState("ALL");

  // Master Data
  const [salesmen, setSalesmen] = useState([]);
  const [areas, setAreas] = useState([]);
  const [skus, setSkus] = useState([]);

  // Data States
  const [targetsData, setTargetsData] = useState({ items: [], total: 0 });
  const [performanceData, setPerformanceData] = useState(null);
  const [receivablesData, setReceivablesData] = useState({ items: [], total: 0, summary: {} });
  const [depositsData, setDepositsData] = useState({ items: [], total: 0 });
  const [reconciliationsData, setReconciliationsData] = useState(null);
  const [syncStats, setSyncStats] = useState(null);

  // Modal States
  const [isAddTargetOpen, setIsAddTargetOpen] = useState(false);
  const [targetForm, setTargetForm] = useState({
    period: currentMonth,
    salesman_id: "",
    area_id: "",
    sku_id: "",
    target_volume: 100,
    unit: "SLOP",
    notes: "",
  });
  const [submittingTarget, setSubmittingTarget] = useState(false);

  // Payment Modal
  const [isPaymentOpen, setIsPaymentOpen] = useState(false);
  const [selectedReceivable, setSelectedReceivable] = useState(null);
  const [paymentForm, setPaymentForm] = useState({
    amount: "",
    payment_method: "CASH",
    reference_no: "",
    notes: "",
  });
  const [submittingPayment, setSubmittingPayment] = useState(false);

  // Deposit Modal
  const [isAddDepositOpen, setIsAddDepositOpen] = useState(false);
  const [depositForm, setDepositForm] = useState({
    salesman_id: "",
    business_date: todayLocal(),
    actual_deposit_amount: "",
    notes: "",
  });
  const [submittingDeposit, setSubmittingDeposit] = useState(false);

  // Verify Deposit Dialog
  const [verifyDepositTarget, setVerifyDepositTarget] = useState(null);
  const [verifyNotes, setVerifyNotes] = useState("");
  const [submittingVerify, setSubmittingVerify] = useState(false);

  // Approve Daily Reconciliation Dialog
  const [reconcileTarget, setReconcileTarget] = useState(null);
  const [reconcileNotes, setReconcileNotes] = useState("");
  const [submittingApproval, setSubmittingApproval] = useState(false);

  // Load Master Filters
  useEffect(() => {
    async function loadMasters() {
      try {
        const [salesRes, areaRes, skuRes] = await Promise.allSettled([
          api.get("/masters/salesmen", { params: { limit: 100 } }),
          api.get("/masters/areas", { params: { limit: 100 } }),
          api.get("/masters/skus", { params: { limit: 100 } }),
        ]);
        if (salesRes.status === "fulfilled") {
          const sList = salesRes.value.data?.items || salesRes.value.data || [];
          setSalesmen(sList);
        }
        if (areaRes.status === "fulfilled") {
          const aList = areaRes.value.data?.items || areaRes.value.data || [];
          setAreas(aList);
        }
        if (skuRes.status === "fulfilled") {
          const kList = skuRes.value.data?.items || skuRes.value.data || [];
          setSkus(kList);
        }
      } catch (err) {
        console.warn("Failed to load finance masters:", err);
      }
    }
    loadMasters();
  }, []);

  // Main Load Data Function
  const loadData = useCallback(async () => {
    setLoading(true);
    try {
      const params = {
        period,
        date: selectedDate,
        business_date: selectedDate,
        ...(selectedSalesman !== "ALL" ? { salesman_id: selectedSalesman } : {}),
      };

      const [tgtRes, perfRes, recRes, depRes, reconRes, syncRes] = await Promise.allSettled([
        api.get("/targets", { params: { period, ...(selectedSalesman !== "ALL" ? { salesman_id: selectedSalesman } : {}) } }),
        api.get("/targets/performance-summary", { params: { period, ...(selectedSalesman !== "ALL" ? { salesman_id: selectedSalesman } : {}) } }),
        api.get("/receivables", { params: { ...(selectedSalesman !== "ALL" ? { salesman_id: selectedSalesman } : {}) } }),
        api.get("/deposits", { params: { business_date: selectedDate, ...(selectedSalesman !== "ALL" ? { salesman_id: selectedSalesman } : {}) } }),
        api.get("/reconciliations/daily", { params: { business_date: selectedDate, ...(selectedSalesman !== "ALL" ? { salesman_id: selectedSalesman } : {}) } }),
        api.get("/sync/stats"),
      ]);

      if (tgtRes.status === "fulfilled") setTargetsData(tgtRes.value.data || { items: [], total: 0 });
      if (perfRes.status === "fulfilled") setPerformanceData(perfRes.value.data || null);
      if (recRes.status === "fulfilled") setReceivablesData(recRes.value.data || { items: [], total: 0, summary: {} });
      if (depRes.status === "fulfilled") setDepositsData(depRes.value.data || { items: [], total: 0 });
      if (reconRes.status === "fulfilled") setReconciliationsData(reconRes.value.data || null);
      if (syncRes.status === "fulfilled") setSyncStats(syncRes.value.data || null);
    } catch (e) {
      toast.error(errMsg(e));
    } finally {
      setLoading(false);
    }
  }, [period, selectedDate, selectedSalesman]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  // Handlers for Target Creation
  const handleSaveTarget = async (e) => {
    e.preventDefault();
    if (!targetForm.salesman_id || !targetForm.sku_id || !targetForm.target_volume) {
      toast.error("Mohon lengkapi Salesman, SKU, dan Target Volume");
      return;
    }
    setSubmittingTarget(true);
    try {
      await api.post("/targets", {
        ...targetForm,
        target_volume: Number(targetForm.target_volume),
      });
      toast.success("Target penjualan berhasil disimpan ke Cloud Firestore SSOT");
      setIsAddTargetOpen(false);
      setTargetForm({
        period,
        salesman_id: "",
        area_id: "",
        sku_id: "",
        target_volume: 100,
        unit: "SLOP",
        notes: "",
      });
      loadData();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSubmittingTarget(false);
    }
  };

  // Handlers for Recording Receivable Payment
  const handleRecordPayment = async (e) => {
    e.preventDefault();
    if (!selectedReceivable) return;
    const amountNum = Number(paymentForm.amount);
    if (!amountNum || amountNum <= 0) {
      toast.error("Masukkan jumlah pembayaran yang valid");
      return;
    }
    setSubmittingPayment(true);
    try {
      await api.post(`/receivables/${selectedReceivable._id || selectedReceivable.id}/payments`, {
        amount: amountNum,
        payment_method: paymentForm.payment_method,
        reference_no: paymentForm.reference_no,
        notes: paymentForm.notes,
      });
      toast.success("Pembayaran piutang berhasil dicatat dan disinkronkan");
      setIsPaymentOpen(false);
      setSelectedReceivable(null);
      setPaymentForm({ amount: "", payment_method: "CASH", reference_no: "", notes: "" });
      loadData();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSubmittingPayment(false);
    }
  };

  // Handlers for Creating Cash Deposit
  const handleSaveDeposit = async (e) => {
    e.preventDefault();
    if (!depositForm.salesman_id || !depositForm.actual_deposit_amount) {
      toast.error("Pilih salesman dan isi nominal setoran");
      return;
    }
    setSubmittingDeposit(true);
    try {
      await api.post("/deposits", {
        salesman_id: depositForm.salesman_id,
        business_date: depositForm.business_date,
        actual_deposit_amount: Number(depositForm.actual_deposit_amount),
        notes: depositForm.notes,
      });
      toast.success("Setoran kas berhasil dicatat dan menunggu verifikasi");
      setIsAddDepositOpen(false);
      setDepositForm({
        salesman_id: "",
        business_date: todayLocal(),
        actual_deposit_amount: "",
        notes: "",
      });
      loadData();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSubmittingDeposit(false);
    }
  };

  // Handlers for Verifying Cash Deposit
  const handleVerifyDeposit = async (status) => {
    if (!verifyDepositTarget) return;
    setSubmittingVerify(true);
    try {
      await api.post(`/deposits/${verifyDepositTarget._id || verifyDepositTarget.id}/verify`, {
        status,
        notes: verifyNotes,
      });
      toast.success(`Setoran kas berhasil di-${status === "VERIFIED" ? "verifikasi" : "tolak"}`);
      setVerifyDepositTarget(null);
      setVerifyNotes("");
      loadData();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSubmittingVerify(false);
    }
  };

  // Handlers for Approving Daily Reconciliation
  const handleApproveReconciliation = async () => {
    if (!reconcileTarget) return;
    setSubmittingApproval(true);
    try {
      await api.post("/reconciliations/daily/approve", {
        salesman_id: reconcileTarget.salesman_id,
        business_date: reconcileTarget.business_date || selectedDate,
        notes: reconcileNotes,
      });
      toast.success("Tutup buku harian salesman berhasil disetujui (Approved)");
      setReconcileTarget(null);
      setReconcileNotes("");
      loadData();
    } catch (err) {
      toast.error(errMsg(err));
    } finally {
      setSubmittingApproval(false);
    }
  };

  // Derived summaries
  const perfTotals = performanceData?.totals || {};
  const recSummary = receivablesData?.summary || {};
  const depItems = depositsData?.items || [];
  const totalActualDeposit = depItems.reduce((acc, curr) => acc + (Number(curr.actual_deposit_amount) || 0), 0);
  const pendingDepositsCount = depItems.filter((d) => d.status === "PENDING").length;

  return (
    <div className="space-y-6" data-testid="finance-page">
      {/* Top Header & Context Card */}
      <div className="flex flex-wrap items-center justify-between gap-4 bg-white p-4 rounded-xl border border-slate-200 shadow-xs">
        <div>
          <div className="flex items-center gap-2 flex-wrap">
            <h2 className="font-heading text-xl font-extrabold text-navy tracking-tight">
              Manajemen Keuangan & Tutup Buku
            </h2>
            <span className="inline-flex items-center gap-1.5 px-2.5 py-0.5 rounded-full text-[11px] font-semibold bg-emerald-50 text-emerald-700 border border-emerald-200">
              <span className="h-1.5 w-1.5 rounded-full bg-emerald-500 animate-pulse"></span>
              Google Cloud Firestore SSOT Active
            </span>
          </div>
          <p className="text-xs text-slate-500">
            Pusat Pengawasan Target Penjualan, Piutang Usaha (A/R), Setoran Kas Salesman, dan Rekonsiliasi Tutup Buku Segitiga Harian.
          </p>
        </div>

        {/* Global Action & Filter Tools */}
        <div className="flex flex-wrap items-center gap-2.5">
          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-slate-500 font-semibold">Periode:</Label>
            <Input
              type="month"
              value={period}
              onChange={(e) => setPeriod(e.target.value)}
              className="w-32 text-xs h-9"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Label className="text-xs text-slate-500 font-semibold">Tanggal:</Label>
            <Input
              type="date"
              value={selectedDate}
              onChange={(e) => setSelectedDate(e.target.value)}
              className="w-36 text-xs h-9"
            />
          </div>

          <div className="flex items-center gap-1.5">
            <Select value={selectedSalesman} onValueChange={setSelectedSalesman}>
              <SelectTrigger className="w-40 text-xs h-9">
                <SelectValue placeholder="Semua Salesman" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">Semua Salesman</SelectItem>
                {salesmen.map((s) => (
                  <SelectItem key={s._id || s.id} value={s._id || s.id}>
                    {s.name}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <Button
            variant="outline"
            size="icon"
            onClick={() => loadData()}
            className="h-9 w-9"
            title="Segarkan Data"
          >
            <RefreshCw size={14} className={loading ? "animate-spin text-navy" : "text-navy"} />
          </Button>
        </div>
      </div>

      {/* Top High-Level Financial KPI Bar */}
      <div className="grid grid-cols-2 md:grid-cols-4 xl:grid-cols-5 gap-3" data-testid="finance-kpis">
        <StatCard
          label="Target Volume (Qty)"
          value={`${formatNumber(perfTotals.target_volume || 0)}`}
          sub={`Realisasi: ${formatNumber(perfTotals.actual_volume || 0)}`}
          icon={Target}
        />
        <StatCard
          label="Pencapaian Target"
          value={perfTotals.achievement_formatted || "0%"}
          sub={perfTotals.status_label || "Berdasarkan Volume"}
          accent={true}
          icon={TrendingUp}
        />
        <StatCard
          label="Total Piutang Toko"
          value={rupiah(recSummary.total_outstanding || 0)}
          sub={`Sudah Dibayar: ${rupiah(recSummary.total_paid || 0)}`}
          icon={CreditCard}
        />
        <StatCard
          label="Setoran Kas Harian"
          value={rupiah(totalActualDeposit)}
          sub={`${depItems.length} transaksi (${pendingDepositsCount} pending)`}
          icon={Banknote}
        />
        <StatCard
          label="Tutup Buku Harian"
          value={
            reconciliationsData?.variance_count === 0
              ? "SEIMBANG"
              : reconciliationsData?.variance_count > 0
              ? "SELISIH (VARIANCE)"
              : "SIAP REKONSILIASI"
          }
          sub={`${reconciliationsData?.balanced_count || 0} Balanced dari ${reconciliationsData?.total_salesmen || 0} Sales`}
          icon={Scale}
        />
      </div>

      {/* Main Tabs Architecture */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="bg-slate-100 p-1 rounded-xl flex flex-wrap gap-1 w-full justify-start h-auto">
          <TabsTrigger value="targets" className="gap-2 px-4 py-2">
            <Target size={15} />
            <span>Target Penjualan & KPI</span>
          </TabsTrigger>
          <TabsTrigger value="receivables" className="gap-2 px-4 py-2">
            <CreditCard size={15} />
            <span>Piutang Usaha (A/R)</span>
          </TabsTrigger>
          <TabsTrigger value="deposits" className="gap-2 px-4 py-2">
            <Banknote size={15} />
            <span>Setoran Kas Harian</span>
          </TabsTrigger>
          <TabsTrigger value="reconciliation" className="gap-2 px-4 py-2">
            <Scale size={15} />
            <span>Tutup Buku Segitiga</span>
          </TabsTrigger>
          <TabsTrigger value="sync" className="gap-2 px-4 py-2">
            <ShieldCheck size={15} />
            <span>SSOT Cloud Database</span>
          </TabsTrigger>
        </TabsList>

        {/* TAB 1: TARGET PENJUALAN & KPI */}
        <TabsContent value="targets" className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-heading font-bold text-navy text-base">
                  Target Penjualan & Performa Volume Produk ({period})
                </h3>
                <p className="text-xs text-slate-500">
                  Target kuantitas per salesman, SKU, dan area untuk mengukur pencapaian omset dan bonus.
                </p>
              </div>

              {(user?.role === "OWNER" || user?.role === "ADMIN" || user?.role === "SUPERVISOR") && (
                <Button
                  onClick={() => setIsAddTargetOpen(true)}
                  className="bg-navy hover:bg-navy-light text-white text-xs gap-1.5 h-9"
                >
                  <Plus size={14} />
                  <span>Tambah Target Baru</span>
                </Button>
              )}
            </div>

            {/* Performance by SKU Highlights */}
            {performanceData?.by_sku && performanceData.by_sku.length > 0 && (
              <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3 pt-2">
                {performanceData.by_sku.map((skuRow) => {
                  const pct = skuRow.achievement_percentage || 0;
                  return (
                    <div
                      key={skuRow.sku_id}
                      className="p-3.5 rounded-xl border border-slate-200 bg-slate-50/70 hover:bg-white transition-all space-y-2"
                    >
                      <div className="flex items-center justify-between text-xs">
                        <span className="font-bold text-slate-800 line-clamp-1">{skuRow.sku_name}</span>
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded-md bg-white border border-slate-200 text-navy">
                          {skuRow.unit}
                        </span>
                      </div>
                      <div className="flex items-baseline justify-between text-xs text-slate-600">
                        <span>Target: <b>{formatNumber(skuRow.target_volume)}</b></span>
                        <span>Realisasi: <b>{formatNumber(skuRow.actual_volume)}</b></span>
                      </div>
                      <div className="w-full bg-slate-200 rounded-full h-2 overflow-hidden">
                        <div
                          className={`h-full rounded-full transition-all duration-500 ${
                            pct >= 100
                              ? "bg-emerald-500"
                              : pct >= 50
                              ? "bg-gold"
                              : "bg-amber-500"
                          }`}
                          style={{ width: `${Math.min(pct, 100)}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-[11px] text-slate-500 font-medium">
                        <span>Pencapaian</span>
                        <span className="font-bold text-navy">{skuRow.achievement_formatted || `${pct}%`}</span>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            {/* Targets Table */}
            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs font-bold text-slate-700">KODE TARGET</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">PERIODE</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">SALESMAN</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">PRODUK / SKU</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">TARGET VOLUME</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">REALISASI</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-center">ACHIEVEMENT</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-center">STATUS</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {targetsData.items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={8} className="text-center py-8 text-xs text-slate-500">
                        Belum ada target penjualan untuk periode {period}. Klik "Tambah Target Baru" untuk mulai menetapkan KPI.
                      </TableCell>
                    </TableRow>
                  ) : (
                    targetsData.items.map((t) => {
                      const achPct = t.achievement_percentage || 0;
                      return (
                        <TableRow key={t._id || t.id} className="hover:bg-slate-50/80 text-xs">
                          <TableCell className="font-mono font-bold text-navy">{t.target_code}</TableCell>
                          <TableCell>{t.period}</TableCell>
                          <TableCell className="font-semibold">{t.salesman_name || t.salesman_id}</TableCell>
                          <TableCell>
                            <span className="font-medium text-slate-800">{t.sku_name || t.sku_id}</span>
                            {t.unit && <span className="ml-1 text-[10px] text-slate-400">({t.unit})</span>}
                          </TableCell>
                          <TableCell className="text-right font-bold text-slate-900">
                            {formatNumber(t.target_volume)} {t.unit || ""}
                          </TableCell>
                          <TableCell className="text-right font-bold text-emerald-700">
                            {formatNumber(t.actual_volume || 0)} {t.unit || ""}
                          </TableCell>
                          <TableCell className="text-center">
                            <span
                              className={`inline-block px-2 py-0.5 rounded-full text-[11px] font-bold ${
                                achPct >= 100
                                  ? "bg-emerald-100 text-emerald-800"
                                  : achPct >= 50
                                  ? "bg-amber-100 text-amber-800"
                                  : "bg-slate-100 text-slate-700"
                              }`}
                            >
                              {t.achievement_formatted || `${achPct}%`}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-md border border-emerald-200">
                              <CheckCircle2 size={12} />
                              {t.status || "ACTIVE"}
                            </span>
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* TAB 2: PIUTANG USAHA (A/R) */}
        <TabsContent value="receivables" className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-heading font-bold text-navy text-base">
                  Buku Piutang Usaha Outlet (Accounts Receivable)
                </h3>
                <p className="text-xs text-slate-500">
                  Daftar faktur tempo, status pelunasan toko, dan pencatatan cicilan uang titipan piutang salesman.
                </p>
              </div>

              <div className="flex items-center gap-3">
                <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
                  Total Piutang Berjalan: <b className="text-rose-600">{rupiah(recSummary.total_outstanding || 0)}</b>
                </span>
              </div>
            </div>

            {/* Receivables Table */}
            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs font-bold text-slate-700">NO FAKTUR / INVOICE</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">OUTLET / TOKO</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">SALESMAN</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">JATUH TEMPO</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">TOTAL NILAI</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">TERBAYAR</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">SISA PIUTANG</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-center">STATUS</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-center">AKSI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {receivablesData.items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-xs text-slate-500">
                        Tidak ada data piutang toko aktif.
                      </TableCell>
                    </TableRow>
                  ) : (
                    receivablesData.items.map((r) => {
                      const isPaid = r.status === "PAID" || (r.remaining_amount || 0) <= 0;
                      return (
                        <TableRow key={r._id || r.id} className="hover:bg-slate-50/80 text-xs">
                          <TableCell className="font-mono font-bold text-navy">{r.invoice_number}</TableCell>
                          <TableCell>
                            <span className="font-bold text-slate-800">{r.outlet_name || r.outlet_id}</span>
                            {r.outlet_code && <span className="block text-[10px] text-slate-400">{r.outlet_code}</span>}
                          </TableCell>
                          <TableCell className="font-medium text-slate-700">{r.salesman_name || r.salesman_id}</TableCell>
                          <TableCell className="font-mono text-slate-600">{r.due_date || "-"}</TableCell>
                          <TableCell className="text-right font-semibold text-slate-800">{rupiah(r.total_amount)}</TableCell>
                          <TableCell className="text-right font-semibold text-emerald-700">{rupiah(r.paid_amount || 0)}</TableCell>
                          <TableCell className="text-right font-bold text-rose-600">{rupiah(r.remaining_amount)}</TableCell>
                          <TableCell className="text-center">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                isPaid
                                  ? "bg-emerald-100 text-emerald-800"
                                  : r.status === "PARTIAL"
                                  ? "bg-blue-100 text-blue-800"
                                  : r.status === "OVERDUE"
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {r.status || (isPaid ? "PAID" : "UNPAID")}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            {!isPaid ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => {
                                  setSelectedReceivable(r);
                                  setIsPaymentOpen(true);
                                }}
                                className="h-7 text-[11px] font-bold text-navy border-slate-300 hover:bg-slate-100 gap-1"
                              >
                                <DollarSign size={12} />
                                <span>Bayar Cicilan</span>
                              </Button>
                            ) : (
                              <span className="text-[11px] font-semibold text-emerald-600 flex items-center justify-center gap-1">
                                <CheckCircle2 size={13} />
                                Lunas
                              </span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* TAB 3: SETORAN KAS SALESMAN */}
        <TabsContent value="deposits" className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-heading font-bold text-navy text-base">
                  Buku Setoran Kas Salesman (Cash Settlement)
                </h3>
                <p className="text-xs text-slate-500">
                  Verifikasi uang tunai hasil penjualan kanvas dan penagihan piutang harian salesman.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <Button
                  onClick={() => setIsAddDepositOpen(true)}
                  className="bg-navy hover:bg-navy-light text-white text-xs gap-1.5 h-9"
                >
                  <Plus size={14} />
                  <span>Input Setoran Kas</span>
                </Button>
              </div>
            </div>

            {/* Deposits Table */}
            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs font-bold text-slate-700">KODE SETORAN</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">SALESMAN</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">TANGGAL</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">ESTIMASI KAS</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">SETORAN FISIK</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-right">SELISIH (VARIANCE)</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">VERIFIKATOR</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-center">STATUS</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-center">AKSI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {depositsData.items.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={9} className="text-center py-8 text-xs text-slate-500">
                        Belum ada data setoran kas untuk tanggal {selectedDate}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    depositsData.items.map((d) => {
                      const isVerified = d.status === "VERIFIED";
                      const isRejected = d.status === "REJECTED";
                      return (
                        <TableRow key={d._id || d.id} className="hover:bg-slate-50/80 text-xs">
                          <TableCell className="font-mono font-bold text-navy">{d.deposit_code}</TableCell>
                          <TableCell className="font-bold text-slate-800">{d.salesman_name || d.salesman_id}</TableCell>
                          <TableCell className="font-mono text-slate-600">{d.business_date}</TableCell>
                          <TableCell className="text-right font-medium text-slate-600">{rupiah(d.expected_cash_amount || 0)}</TableCell>
                          <TableCell className="text-right font-bold text-emerald-700">{rupiah(d.actual_deposit_amount)}</TableCell>
                          <TableCell className={`text-right font-bold ${d.variance_amount !== 0 ? "text-rose-600" : "text-slate-600"}`}>
                            {rupiah(d.variance_amount || 0)}
                          </TableCell>
                          <TableCell className="text-slate-600">
                            {d.verified_by_name || d.verified_by || "-"}
                            {d.notes && <span className="block text-[10px] text-slate-400 italic">{d.notes}</span>}
                          </TableCell>
                          <TableCell className="text-center">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                isVerified
                                  ? "bg-emerald-100 text-emerald-800"
                                  : isRejected
                                  ? "bg-rose-100 text-rose-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {d.status}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            {!isVerified && !isRejected ? (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setVerifyDepositTarget(d)}
                                className="h-7 text-[11px] font-bold text-navy border-navy/30 hover:bg-navy/5"
                              >
                                Verifikasi
                              </Button>
                            ) : (
                              <span className="text-[11px] font-semibold text-slate-400">Tuntas</span>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* TAB 4: TUTUP BUKU SEGITIGA HARIAN */}
        <TabsContent value="reconciliation" className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-heading font-bold text-navy text-base">
                  Rekonsiliasi Tutup Buku Segitiga Harian ({selectedDate})
                </h3>
                <p className="text-xs text-slate-500">
                  Triangular balancing: validasi stok fisik gudang/kanvas, total transaksi penjualan nota, dan uang kas setoran.
                </p>
              </div>

              <div className="flex items-center gap-2">
                <span className="text-xs font-semibold text-slate-600 bg-slate-100 px-3 py-1.5 rounded-lg">
                  Total Salesman: <b>{reconciliationsData?.total_salesmen || 0}</b> | Balanced:{" "}
                  <b className="text-emerald-600">{reconciliationsData?.balanced_count || 0}</b>
                </span>
              </div>
            </div>

            {/* Architecture Explanatory Banner */}
            <div className="p-4 rounded-xl border border-blue-200 bg-blue-50/60 flex flex-col md:flex-row items-start md:items-center justify-between gap-4">
              <div className="flex items-center gap-3">
                <div className="w-10 h-10 rounded-xl bg-blue-600 text-white flex items-center justify-center shrink-0 shadow-xs">
                  <Scale size={20} />
                </div>
                <div>
                  <h4 className="text-xs font-bold text-blue-900">Konsep Rekonsiliasi Segitiga (Triangular Balancing)</h4>
                  <p className="text-[11px] text-blue-700 leading-relaxed">
                    Setiap hari operasional ditutup dengan memastikan 3 pilar seimbang: 
                    <b> (1) Fisik Stok Mobil</b> = Stok Handover - Penjualan - Retur Gudang; 
                    <b> (2) Total Penjualan Nota</b> = Penjualan Tunai + Penjualan Tempo; 
                    <b> (3) Kas Kasir</b> = Kas Penjualan + Pelunasan Piutang.
                  </p>
                </div>
              </div>
            </div>

            {/* Reconciliation List */}
            <div className="border border-slate-200 rounded-xl overflow-x-auto">
              <Table>
                <TableHeader className="bg-slate-50">
                  <TableRow>
                    <TableHead className="text-xs font-bold text-slate-700">SALESMAN</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700">TANGGAL BISNIS</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-center">VALIDASI STOK</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-center">VALIDASI KAS</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-center">STATUS KESELURUHAN</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-center">APPROVAL OWNER/SPV</TableHead>
                    <TableHead className="text-xs font-bold text-slate-700 text-center">AKSI</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {!reconciliationsData?.reconciliations || reconciliationsData.reconciliations.length === 0 ? (
                    <TableRow>
                      <TableCell colSpan={7} className="text-center py-8 text-xs text-slate-500">
                        Tidak ada data rekonsiliasi harian untuk tanggal {selectedDate}.
                      </TableCell>
                    </TableRow>
                  ) : (
                    reconciliationsData.reconciliations.map((rec) => {
                      const isBalanced = rec.overall_status === "BALANCED";
                      return (
                        <TableRow key={rec.salesman_id} className="hover:bg-slate-50/80 text-xs">
                          <TableCell>
                            <span className="font-bold text-slate-800">{rec.salesman_name}</span>
                            <span className="block text-[10px] text-slate-400">{rec.salesman_code}</span>
                          </TableCell>
                          <TableCell className="font-mono text-slate-600">{rec.business_date}</TableCell>
                          <TableCell className="text-center">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                rec.stock_summary?.stock_status === "BALANCED"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {rec.stock_summary?.stock_status || "BALANCED"}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[10px] font-bold ${
                                rec.cash_summary?.cash_status === "BALANCED"
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-rose-100 text-rose-800"
                              }`}
                            >
                              {rec.cash_summary?.cash_status || "BALANCED"}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            <span
                              className={`inline-block px-2.5 py-0.5 rounded-full text-[11px] font-bold ${
                                isBalanced
                                  ? "bg-emerald-100 text-emerald-800"
                                  : "bg-amber-100 text-amber-800"
                              }`}
                            >
                              {rec.overall_status}
                            </span>
                          </TableCell>
                          <TableCell className="text-center">
                            {rec.status === "APPROVED" ? (
                              <span className="inline-flex items-center gap-1 text-[10px] font-bold text-emerald-700 bg-emerald-50 px-2 py-0.5 rounded-full border border-emerald-200">
                                <CheckCircle2 size={10} />
                                DISETUJUI
                              </span>
                            ) : (
                              <span className="inline-block px-2 py-0.5 rounded-full text-[10px] font-bold bg-amber-50 text-amber-800 border border-amber-200">
                                MENUNGGU
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-center">
                            {rec.status === "APPROVED" ? (
                              <span className="inline-flex items-center gap-1 text-[11px] font-semibold text-emerald-700 bg-emerald-50/80 px-2.5 py-1 rounded-md border border-emerald-200">
                                <CheckCircle2 size={12} />
                                Terverifikasi
                              </span>
                            ) : (
                              <Button
                                size="sm"
                                variant="outline"
                                onClick={() => setReconcileTarget(rec)}
                                className="h-7 text-[11px] font-bold text-navy border-navy/30 hover:bg-navy/5"
                              >
                                Approve Tutup Buku
                              </Button>
                            )}
                          </TableCell>
                        </TableRow>
                      );
                    })
                  )}
                </TableBody>
              </Table>
            </div>
          </div>
        </TabsContent>

        {/* TAB 5: SSOT CLOUD FIRESTORE STATUS */}
        <TabsContent value="sync" className="space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 shadow-xs space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="font-heading font-bold text-navy text-base">
                  Status Sinkronisasi Google Cloud Firestore SSOT
                </h3>
                <p className="text-xs text-slate-500">
                  Transparansi status penyimpanan dokumen cloud terpusat, integritas data, dan jejak audit trail.
                </p>
              </div>

              <Button
                variant="outline"
                size="sm"
                onClick={() => loadData()}
                className="text-xs font-semibold gap-1.5 h-8 border-slate-300"
              >
                <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
                <span>Pindai Ulang Cloud</span>
              </Button>
            </div>

            {/* Sync Engine Cards */}
            <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
              <div className="p-4 rounded-xl border border-emerald-200 bg-emerald-50/50 space-y-1">
                <span className="text-[11px] font-bold text-emerald-700 uppercase tracking-wider">Database Engine</span>
                <div className="text-sm font-extrabold text-navy">
                  {syncStats?.databaseEngine || "Google Cloud Firestore"}
                </div>
                <div className="flex items-center gap-1.5 text-xs text-emerald-700 font-semibold pt-1">
                  <span className="h-2 w-2 rounded-full bg-emerald-500 animate-pulse"></span>
                  Terhubung & Sinkron Real-Time
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Total Dokumen Aktif</span>
                <div className="text-2xl font-extrabold text-navy">
                  {syncStats?.totalRecords || 0} Dokumen
                </div>
                <div className="text-xs text-slate-500">
                  Tersebar di {syncStats?.totalCollections || 0} Koleksi Firestore
                </div>
              </div>

              <div className="p-4 rounded-xl border border-slate-200 bg-slate-50 space-y-1">
                <span className="text-[11px] font-bold text-slate-500 uppercase tracking-wider">Waktu Sinkronisasi</span>
                <div className="text-sm font-bold text-navy font-mono">
                  {syncStats?.lastSyncTimestamp ? new Date(syncStats.lastSyncTimestamp).toLocaleTimeString("id-ID") : "Live"}
                </div>
                <div className="text-xs text-slate-500">
                  Status: <b className="text-emerald-700">{syncStats?.lastSyncStatus || "SUCCESS"}</b>
                </div>
              </div>
            </div>

            {/* Collection Distribution Grid */}
            <div className="space-y-2 pt-2">
              <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Distribusi Dokumen Koleksi Keuangan & Transaksi
              </h4>
              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-2.5">
                {syncStats?.collectionCounts &&
                  Object.entries(syncStats.collectionCounts).map(([col, count]) => (
                    <div
                      key={col}
                      className="p-2.5 rounded-lg border border-slate-200 bg-white shadow-2xs text-xs flex flex-col justify-between"
                    >
                      <span className="font-mono text-[11px] text-slate-500 truncate" title={col}>
                        {col}
                      </span>
                      <span className="text-base font-extrabold text-navy mt-1">{count}</span>
                    </div>
                  ))}
              </div>
            </div>
          </div>
        </TabsContent>
      </Tabs>

      {/* MODAL 1: ADD TARGET */}
      <Dialog open={isAddTargetOpen} onOpenChange={setIsAddTargetOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-navy font-heading font-bold text-base">
              Tetapkan Target Penjualan Baru
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveTarget} className="space-y-3.5 text-xs">
            <div>
              <Label className="text-xs font-semibold">Periode (YYYY-MM)</Label>
              <Input
                type="month"
                value={targetForm.period}
                onChange={(e) => setTargetForm({ ...targetForm, period: e.target.value })}
                className="mt-1 text-xs"
                required
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">Salesman</Label>
              <Select
                value={targetForm.salesman_id}
                onValueChange={(val) => setTargetForm({ ...targetForm, salesman_id: val })}
              >
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue placeholder="Pilih Salesman" />
                </SelectTrigger>
                <SelectContent>
                  {salesmen.map((s) => (
                    <SelectItem key={s._id || s.id} value={s._id || s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold">Produk / SKU</Label>
              <Select
                value={targetForm.sku_id}
                onValueChange={(val) => {
                  const selectedSku = skus.find((k) => (k._id || k.id) === val);
                  setTargetForm({
                    ...targetForm,
                    sku_id: val,
                    unit: selectedSku?.unit || "SLOP",
                  });
                }}
              >
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue placeholder="Pilih SKU Produk" />
                </SelectTrigger>
                <SelectContent>
                  {skus.map((k) => (
                    <SelectItem key={k._id || k.id} value={k._id || k.id}>
                      {k.sku_name || k.name} ({k.unit || "SLOP"})
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label className="text-xs font-semibold">Target Volume</Label>
                <Input
                  type="number"
                  min="1"
                  value={targetForm.target_volume}
                  onChange={(e) => setTargetForm({ ...targetForm, target_volume: e.target.value })}
                  className="mt-1 text-xs font-bold"
                  required
                />
              </div>
              <div>
                <Label className="text-xs font-semibold">Satuan (Unit)</Label>
                <Input
                  type="text"
                  value={targetForm.unit}
                  onChange={(e) => setTargetForm({ ...targetForm, unit: e.target.value })}
                  className="mt-1 text-xs"
                />
              </div>
            </div>

            <div>
              <Label className="text-xs font-semibold">Catatan / Area Target</Label>
              <Input
                type="text"
                placeholder="cth: Target Penjualan Cianjur Kota"
                value={targetForm.notes}
                onChange={(e) => setTargetForm({ ...targetForm, notes: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddTargetOpen(false)}
                className="text-xs h-9"
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={submittingTarget}
                className="bg-navy hover:bg-navy-light text-white text-xs h-9"
              >
                {submittingTarget ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                Simpan Target
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 2: RECORD PAYMENT */}
      <Dialog open={isPaymentOpen} onOpenChange={setIsPaymentOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-navy font-heading font-bold text-base">
              Catat Pembayaran Piutang Outlet
            </DialogTitle>
          </DialogHeader>
          {selectedReceivable && (
            <form onSubmit={handleRecordPayment} className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1">
                <div className="flex justify-between">
                  <span className="text-slate-500">No Faktur:</span>
                  <span className="font-mono font-bold text-navy">{selectedReceivable.invoice_number}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Toko / Outlet:</span>
                  <span className="font-bold text-slate-800">{selectedReceivable.outlet_name || selectedReceivable.outlet_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Sisa Tagihan:</span>
                  <span className="font-bold text-rose-600">{rupiah(selectedReceivable.remaining_amount)}</span>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Nominal Pembayaran (Rp)</Label>
                <Input
                  type="number"
                  min="1"
                  max={selectedReceivable.remaining_amount}
                  placeholder="cth: 50000"
                  value={paymentForm.amount}
                  onChange={(e) => setPaymentForm({ ...paymentForm, amount: e.target.value })}
                  className="mt-1 text-xs font-bold text-navy"
                  required
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Metode Pembayaran</Label>
                <Select
                  value={paymentForm.payment_method}
                  onValueChange={(val) => setPaymentForm({ ...paymentForm, payment_method: val })}
                >
                  <SelectTrigger className="mt-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="CASH">Tunai (Cash)</SelectItem>
                    <SelectItem value="TRANSFER">Transfer Bank</SelectItem>
                    <SelectItem value="GIRO">Bilyet Giro / Cek</SelectItem>
                  </SelectContent>
                </Select>
              </div>

              <div>
                <Label className="text-xs font-semibold">Nomor Bukti / Kuitansi (Opsional)</Label>
                <Input
                  type="text"
                  placeholder="cth: KW-009"
                  value={paymentForm.reference_no}
                  onChange={(e) => setPaymentForm({ ...paymentForm, reference_no: e.target.value })}
                  className="mt-1 text-xs"
                />
              </div>

              <div>
                <Label className="text-xs font-semibold">Catatan</Label>
                <Input
                  type="text"
                  placeholder="cth: Titipan cicilan sore"
                  value={paymentForm.notes}
                  onChange={(e) => setPaymentForm({ ...paymentForm, notes: e.target.value })}
                  className="mt-1 text-xs"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setIsPaymentOpen(false)}
                  className="text-xs h-9"
                >
                  Batal
                </Button>
                <Button
                  type="submit"
                  disabled={submittingPayment}
                  className="bg-navy hover:bg-navy-light text-white text-xs h-9"
                >
                  {submittingPayment ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                  Simpan Pembayaran
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL 3: ADD CASH DEPOSIT */}
      <Dialog open={isAddDepositOpen} onOpenChange={setIsAddDepositOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-navy font-heading font-bold text-base">
              Input Setoran Kas Salesman
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSaveDeposit} className="space-y-3 text-xs">
            <div>
              <Label className="text-xs font-semibold">Salesman</Label>
              <Select
                value={depositForm.salesman_id}
                onValueChange={(val) => setDepositForm({ ...depositForm, salesman_id: val })}
              >
                <SelectTrigger className="mt-1 text-xs">
                  <SelectValue placeholder="Pilih Salesman" />
                </SelectTrigger>
                <SelectContent>
                  {salesmen.map((s) => (
                    <SelectItem key={s._id || s.id} value={s._id || s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <div>
              <Label className="text-xs font-semibold">Tanggal Bisnis</Label>
              <Input
                type="date"
                value={depositForm.business_date}
                onChange={(e) => setDepositForm({ ...depositForm, business_date: e.target.value })}
                className="mt-1 text-xs"
                required
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">Nominal Fisik Uang Disetor (Rp)</Label>
              <Input
                type="number"
                min="0"
                placeholder="cth: 250000"
                value={depositForm.actual_deposit_amount}
                onChange={(e) => setDepositForm({ ...depositForm, actual_deposit_amount: e.target.value })}
                className="mt-1 text-xs font-bold text-navy"
                required
              />
            </div>

            <div>
              <Label className="text-xs font-semibold">Catatan Setoran</Label>
              <Input
                type="text"
                placeholder="cth: Setoran tunai hasil rute Cianjur"
                value={depositForm.notes}
                onChange={(e) => setDepositForm({ ...depositForm, notes: e.target.value })}
                className="mt-1 text-xs"
              />
            </div>

            <DialogFooter className="pt-2">
              <Button
                type="button"
                variant="outline"
                onClick={() => setIsAddDepositOpen(false)}
                className="text-xs h-9"
              >
                Batal
              </Button>
              <Button
                type="submit"
                disabled={submittingDeposit}
                className="bg-navy hover:bg-navy-light text-white text-xs h-9"
              >
                {submittingDeposit ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                Simpan Setoran
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      {/* MODAL 4: VERIFY DEPOSIT */}
      <Dialog open={!!verifyDepositTarget} onOpenChange={(open) => !open && setVerifyDepositTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-navy font-heading font-bold text-base">
              Verifikasi Setoran Kas Kasir
            </DialogTitle>
          </DialogHeader>
          {verifyDepositTarget && (
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Kode Setoran:</span>
                  <span className="font-mono font-bold text-navy">{verifyDepositTarget.deposit_code}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Salesman:</span>
                  <span className="font-bold text-slate-800">{verifyDepositTarget.salesman_name || verifyDepositTarget.salesman_id}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Nominal Setoran Fisik:</span>
                  <span className="font-bold text-emerald-700">{rupiah(verifyDepositTarget.actual_deposit_amount)}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Estimasi Kas Penjualan:</span>
                  <span className="font-medium text-slate-600">{rupiah(verifyDepositTarget.expected_cash_amount || 0)}</span>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Catatan Verifikasi Kasir / Owner</Label>
                <Input
                  type="text"
                  placeholder="cth: Uang tunai fisik telah dihitung pas dan disetorkan ke brankas"
                  value={verifyNotes}
                  onChange={(e) => setVerifyNotes(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>

              <DialogFooter className="pt-2 flex flex-row justify-end gap-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleVerifyDeposit("REJECTED")}
                  disabled={submittingVerify}
                  className="text-xs text-rose-600 border-rose-300 hover:bg-rose-50 h-9"
                >
                  Tolak Setoran
                </Button>
                <Button
                  type="button"
                  onClick={() => handleVerifyDeposit("VERIFIED")}
                  disabled={submittingVerify}
                  className="bg-emerald-600 hover:bg-emerald-700 text-white text-xs h-9"
                >
                  {submittingVerify ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                  Verifikasi Pas (Sesuai)
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* MODAL 5: APPROVE RECONCILIATION */}
      <Dialog open={!!reconcileTarget} onOpenChange={(open) => !open && setReconcileTarget(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle className="text-navy font-heading font-bold text-base">
              Persetujuan Tutup Buku Segitiga Harian
            </DialogTitle>
          </DialogHeader>
          {reconcileTarget && (
            <div className="space-y-3 text-xs">
              <div className="p-3 bg-slate-50 rounded-lg border border-slate-200 space-y-1.5">
                <div className="flex justify-between">
                  <span className="text-slate-500">Salesman:</span>
                  <span className="font-bold text-slate-800">{reconcileTarget.salesman_name}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Tanggal:</span>
                  <span className="font-mono text-slate-700">{reconcileTarget.business_date || selectedDate}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Status Stok:</span>
                  <span className="font-bold text-slate-800">{reconcileTarget.stock_summary?.stock_status || "BALANCED"}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-slate-500">Status Kas:</span>
                  <span className="font-bold text-slate-800">{reconcileTarget.cash_summary?.cash_status || "BALANCED"}</span>
                </div>
              </div>

              <div>
                <Label className="text-xs font-semibold">Catatan Approval</Label>
                <Input
                  type="text"
                  placeholder="cth: Tutup buku harian telah diverifikasi dan disetujui"
                  value={reconcileNotes}
                  onChange={(e) => setReconcileNotes(e.target.value)}
                  className="mt-1 text-xs"
                />
              </div>

              <DialogFooter className="pt-2">
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => setReconcileTarget(null)}
                  className="text-xs h-9"
                >
                  Batal
                </Button>
                <Button
                  type="button"
                  onClick={handleApproveReconciliation}
                  disabled={submittingApproval}
                  className="bg-navy hover:bg-navy-light text-white text-xs h-9"
                >
                  {submittingApproval ? <Loader2 size={14} className="animate-spin mr-1" /> : null}
                  Setujui Tutup Buku (Approve)
                </Button>
              </DialogFooter>
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}

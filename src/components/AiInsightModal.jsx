import { useState } from "react";
import { Sparkles, Loader2, RefreshCw, X, AlertCircle } from "lucide-react";
import api from "../lib/api";
import { Button } from "./ui/button";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "./ui/dialog";

export default function AiInsightModal({
  open,
  onOpenChange,
  topic = "sales_summary",
  title = "Analisis AI Gemini Distribusi",
  contextData = {},
}) {
  const [loading, setLoading] = useState(false);
  const [insight, setInsight] = useState("");
  const [generatedAt, setGeneratedAt] = useState(null);
  const [error, setError] = useState(null);

  const fetchInsight = async () => {
    setLoading(true);
    setError(null);
    try {
      const res = await api.post("/ai/insight", {
        topic,
        contextData,
      });
      if (res.data?.success) {
        setInsight(res.data.insight);
        setGeneratedAt(res.data.generatedAt);
      } else {
        setInsight(res.data?.insight || "Tidak dapat memuat insight.");
      }
    } catch (err) {
      setError(err?.response?.data?.message || err.message || "Gagal menghubungi layanan AI.");
    } finally {
      setLoading(false);
    }
  };

  const handleOpen = (isOpen) => {
    onOpenChange(isOpen);
    if (isOpen && !insight && !loading) {
      fetchInsight();
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleOpen}>
      <DialogContent className="max-w-2xl bg-white border border-slate-200 shadow-2xl rounded-2xl p-6 font-body">
        <DialogHeader className="space-y-1">
          <div className="flex items-center gap-2">
            <div className="w-8 h-8 rounded-lg bg-gradient-to-tr from-amber-500 to-indigo-600 flex items-center justify-center text-white shadow-xs">
              <Sparkles size={18} />
            </div>
            <DialogTitle className="font-heading text-lg font-bold text-navy">
              {title}
            </DialogTitle>
          </div>
          <DialogDescription className="text-xs text-slate-500">
            Analisis eksekutif ditenagai Google Gemini 3.8 Flash berdasarkan data operasional nyata Cloud Firestore.
          </DialogDescription>
        </DialogHeader>

        <div className="mt-4 min-h-[160px] max-h-[60vh] overflow-y-auto">
          {loading ? (
            <div className="flex flex-col items-center justify-center py-12 gap-3 text-slate-500">
              <Loader2 className="animate-spin text-indigo-600" size={32} />
              <p className="text-xs font-semibold">Gemini sedang menganalisis data distribusi...</p>
            </div>
          ) : error ? (
            <div className="p-4 rounded-xl bg-rose-50 border border-rose-200 text-rose-800 text-xs flex items-start gap-2.5">
              <AlertCircle size={16} className="shrink-0 mt-0.5" />
              <div>
                <p className="font-bold">Terjadi Kesalahan</p>
                <p>{error}</p>
              </div>
            </div>
          ) : insight ? (
            <div className="prose prose-sm max-w-none text-slate-700 space-y-2 whitespace-pre-line text-xs sm:text-sm leading-relaxed p-4 rounded-xl bg-slate-50 border border-slate-100">
              {insight}
            </div>
          ) : (
            <div className="text-center py-8 text-slate-400 text-xs">
              Klik tombol di bawah untuk memulai analisis.
            </div>
          )}
        </div>

        <div className="mt-4 pt-3 border-t border-slate-100 flex items-center justify-between">
          <div className="text-[10px] text-slate-400">
            {generatedAt && `Dibuat pada: ${new Date(generatedAt).toLocaleTimeString("id-ID")}`}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchInsight}
              disabled={loading}
              className="text-xs flex items-center gap-1.5"
            >
              <RefreshCw size={13} className={loading ? "animate-spin" : ""} />
              Perbarui Analisis
            </Button>
            <Button
              size="sm"
              onClick={() => onOpenChange(false)}
              className="bg-navy hover:bg-navy-dark text-white text-xs px-4"
            >
              Tutup
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

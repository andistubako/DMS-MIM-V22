import { GoogleGenAI } from "@google/genai";

let aiClient: GoogleGenAI | null = null;

function getAiClient(): GoogleGenAI | null {
  const key = process.env.GEMINI_API_KEY;
  if (!key) return null;
  if (!aiClient) {
    aiClient = new GoogleGenAI({
      apiKey: key,
      httpOptions: {
        headers: {
          "User-Agent": "aistudio-build",
        },
      },
    });
  }
  return aiClient;
}

export interface DistributionInsightRequest {
  topic: "sales_summary" | "stock_prediction" | "call_plan_analysis" | "outlet_anomaly";
  contextData: Record<string, any>;
  customPrompt?: string;
}

/**
 * Service for Gemini AI insights in DMS Mahameru V22.
 * Strictly adheres to rule 38:
 * - Gemini provides analytical summary, insights, and natural language explanations.
 * - Gemini is NEVER the source of truth for stock, invoices, transactions, roles, or prices.
 */
export async function generateDistributionInsight(req: DistributionInsightRequest): Promise<{
  success: boolean;
  insight: string;
  generatedAt: string;
  model: string;
}> {
  const client = getAiClient();
  if (!client) {
    return {
      success: false,
      insight: "Google Gemini API belum dikonfigurasi. Silakan tambahkan GEMINI_API_KEY di Settings / Environment variables.",
      generatedAt: new Date().toISOString(),
      model: "gemini-3.8-flash",
    };
  }

  const systemInstruction = `Anda adalah Senior Distribution & FMCG Business Analyst untuk PT Mahameru Insan Mandiri.
Tugas Anda adalah menganalisis data distribusi, kinerja salesman canvasser/taking order, perputaran stok rokok dan minuman, dan efektivitas call plan outlet.
Berikan analisa yang tajam, ringkas, profesional, berbasis data nyata, dan berorientasi tindakan nyata bagi manajemen (Owner, Supervisor, Warehouse Manager).
Gunakan Bahasa Indonesia profesional.`;

  const prompt = `Analisis Topik: ${req.topic}
Data Konteks Operasional:
${JSON.stringify(req.contextData, null, 2)}

${req.customPrompt ? `Permintaan Khusus: ${req.customPrompt}` : "Berikan ringkasan eksekutif 3-4 poin dan rekomendasi operasional."}`;

  try {
    const response = await client.models.generateContent({
      model: "gemini-3.8-flash",
      contents: prompt,
      config: {
        systemInstruction,
        temperature: 0.3,
      },
    });

    return {
      success: true,
      insight: response.text || "Tidak ada teks respon yang dihasilkan.",
      generatedAt: new Date().toISOString(),
      model: "gemini-3.8-flash",
    };
  } catch (error: any) {
    console.error("[Gemini] Error generating insight:", error);
    return {
      success: false,
      insight: `Gagal menghasilkan wawasan AI: ${error?.message || String(error)}`,
      generatedAt: new Date().toISOString(),
      model: "gemini-3.8-flash",
    };
  }
}

import api from "./api";

const QUEUE_KEY = "mhm_offline_queue";
const VISIT_KEY = "mhm_active_visit";

// Clear any obsolete legacy offline queue on startup
if (typeof window !== "undefined") {
  try {
    localStorage.removeItem(QUEUE_KEY);
  } catch {
    // ignore
  }
}

export function pendingCount() {
  return 0;
}

export function getLocalVisit() {
  if (typeof window === "undefined") return null;
  try {
    const raw = localStorage.getItem(VISIT_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

export function setLocalVisit(visit) {
  if (typeof window === "undefined") return;
  if (!visit) {
    localStorage.removeItem(VISIT_KEY);
  } else {
    localStorage.setItem(VISIT_KEY, JSON.stringify(visit));
  }
}

/**
 * Pure Online Post:
 * Distribution Management System (DMS) V22 mandates pure Cloud Firestore
 * as the Single Source of Truth (SSOT). No offline queues, no pending orders,
 * no offline attendance, and no offline stock deductions are permitted.
 * If the connection is severed, fail safely and prompt the user to re-submit online.
 */
export async function postQueued(url, data = {}) {
  if (typeof navigator !== "undefined" && !navigator.onLine) {
    throw new Error(
      "Koneksi internet terputus. Seluruh transaksi operasional wajib terhubung langsung ke Cloud Firestore (Single Source of Truth). Mohon periksa sinyal internet Anda dan coba lagi."
    );
  }

  try {
    const res = await api.post(url, data);

    // Keep active visit state in memory/sync for UI flow
    if (url.includes("/visits/check-in")) {
      setLocalVisit(res.data?.data || res.data || {
        _id: res.data?.id || res.data?._id,
        outlet_id: data.outlet_id,
        check_in_time: new Date().toISOString(),
        status: "VISITING",
        ...data,
      });
    } else if (url.includes("/check-out") || url.includes("/visits/checkout")) {
      setLocalVisit(null);
    }

    return res.data;
  } catch (err) {
    const msg =
      err?.response?.data?.error ||
      err?.response?.data?.message ||
      err?.message ||
      "Gagal menghubungi server Google Cloud Firestore.";
    throw new Error(msg);
  }
}

export async function flushQueue() {
  return { success: true, count: 0, flushed: 0, remaining: 0 };
}

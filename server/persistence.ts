import { db } from "./data.js";
import { firestoreDb } from "./firebase.js";
import {
  collection,
  doc,
  setDoc,
  getDoc,
  deleteDoc,
  getDocs,
  writeBatch,
} from "firebase/firestore";

let isRestoring = false;
let lastSyncTimestamp: string | null = null;
let lastSyncStatus: "SUCCESS" | "SYNCING" | "ERROR" | "IDLE" = "SUCCESS";
let lastSyncError: string | null = null;

export const ALL_SYNC_COLLECTIONS: Array<{ key: keyof typeof db; colName: string }> = [
  { key: "users", colName: "users" }, { key: "offices", colName: "offices" },
  { key: "provinces", colName: "provinces" }, { key: "regencies", colName: "regencies" },
  { key: "districts", colName: "districts" }, { key: "villages", colName: "villages" },
  { key: "areas", colName: "areas" }, { key: "channels", colName: "channels" },
  { key: "routes", colName: "routes" }, { key: "products", colName: "products" },
  { key: "skus", colName: "skus" }, { key: "prices", colName: "prices" },
  { key: "promos", colName: "promos" }, { key: "salesmen", colName: "salesmen" },
  { key: "open_call_reasons", colName: "open_call_reasons" }, { key: "outlets", colName: "outlets" },
  { key: "sales_outlets", colName: "sales_outlets" }, { key: "call_plans", colName: "call_plans" },
  { key: "call_plan_items", colName: "call_plan_items" }, { key: "attendance", colName: "attendance" },
  { key: "visits", colName: "visits" }, { key: "transactions", colName: "transactions" },
  { key: "inventory", colName: "inventory" }, { key: "stock_movements", colName: "stock_movements" },
  { key: "stock_handovers", colName: "stock_handovers" }, { key: "stock_returns", colName: "stock_returns" },
  { key: "stock_receivings", colName: "stock_receivings" }, { key: "sales_stock_ledgers", colName: "sales_stock_ledgers" },
  { key: "targets", colName: "targets" }, { key: "cash_deposits", colName: "cash_deposits" },
  { key: "receivables", colName: "receivables" }, { key: "daily_reconciliations", colName: "daily_reconciliations" },
  { key: "audit_logs", colName: "audit_logs" }, { key: "gps_events", colName: "gps_events" },
];

export function getSyncStats() {
  const collectionCounts: Record<string, number> = {};
  for (const { key, colName } of ALL_SYNC_COLLECTIONS) {
    const arr = (db as any)[key];
    collectionCounts[colName] = Array.isArray(arr) ? arr.length : 0;
  }
  return {
    databaseEngine: "Google Cloud Firestore (Single Source of Truth)",
    isCloudConnected: true,
    isFirestoreReady: true,
    isQuotaPaused: false,
    lastSyncTimestamp,
    lastSyncStatus,
    lastSyncError,
    pendingDirtyDocs: 0,
    totalCollections: ALL_SYNC_COLLECTIONS.length,
    totalRecords: Object.values(collectionCounts).reduce((a, b) => a + b, 0),
    collectionCounts,
  };
}

export const getFirestoreSyncStats = getSyncStats;

/**
 * Load all documents from Cloud Firestore into in-memory operational state
 */
export async function loadAllFromFirestore(inMemoryDb: any): Promise<boolean> {
  console.log("[Persistence] Loading all collections from Cloud Firestore...");
  try {
    for (const { key, colName } of ALL_SYNC_COLLECTIONS) {
      try {
        const snap = await getDocs(collection(firestoreDb, colName));
        const items: any[] = [];
        snap.forEach((d) => {
          items.push({ _id: d.id, id: d.id, ...d.data() });
        });
        if (items.length > 0) {
          (inMemoryDb as any)[key] = items;
        }
      } catch (colErr) {
        console.warn(`[Persistence] Notice on loading collection '${colName}':`, colErr);
      }
    }

    // Load company profile from Cloud Firestore
    try {
      let cpSnap = await getDoc(doc(firestoreDb, "company_profile", "main"));
      if (!cpSnap.exists()) {
        cpSnap = await getDoc(doc(firestoreDb, "companies", "main"));
      }
      if (!cpSnap.exists()) {
        cpSnap = await getDoc(doc(firestoreDb, "company_profile", "cp-1"));
      }
      if (cpSnap.exists()) {
        const cpData = cpSnap.data();
        inMemoryDb.company_profile = { ...inMemoryDb.company_profile, ...cpData };
        console.log("[Persistence] Loaded company_profile from Cloud Firestore.");
      }
    } catch (cpErr) {
      console.warn("[Persistence] Notice on loading company_profile:", cpErr);
    }

    // Load global system settings from Cloud Firestore
    try {
      let stSnap = await getDoc(doc(firestoreDb, "settings", "global"));
      if (!stSnap.exists()) {
        stSnap = await getDoc(doc(firestoreDb, "system_settings", "global"));
      }
      if (stSnap.exists()) {
        const stData = stSnap.data();
        inMemoryDb.settings = { ...inMemoryDb.settings, ...stData };
        console.log("[Persistence] Loaded settings from Cloud Firestore.");
      }
    } catch (stErr) {
      console.warn("[Persistence] Notice on loading settings:", stErr);
    }

    console.log("[Persistence] All collections loaded from Cloud Firestore successfully.");
    return true;
  } catch (err: any) {
    console.error("[Persistence] Failed to load from Cloud Firestore:", err);
    return false;
  }
}

/**
 * Persist document to Cloud Firestore as Single Source of Truth
 */
export async function syncSingleDoc(colName: string, docId: string, data: any): Promise<boolean> {
  if (isRestoring || !docId) return false;
  lastSyncStatus = "SYNCING";
  lastSyncError = null;

  try {
    // Sanitize data to eliminate unsupported 'undefined' values in Firestore
    const cleanData = JSON.parse(
      JSON.stringify(data, (_k, v) => (v === undefined ? null : v))
    );

    const docRef = doc(firestoreDb, colName, String(docId));
    await setDoc(docRef, cleanData, { merge: true });

    // Ensure mirror sync for company_profile / companies and settings / system_settings
    if (colName === "company_profile" || colName === "companies") {
      const mirrorCol = colName === "company_profile" ? "companies" : "company_profile";
      await setDoc(doc(firestoreDb, mirrorCol, String(docId)), cleanData, { merge: true }).catch(() => {});
    } else if (colName === "settings" || colName === "system_settings") {
      const mirrorCol = colName === "settings" ? "system_settings" : "settings";
      await setDoc(doc(firestoreDb, mirrorCol, String(docId)), cleanData, { merge: true }).catch(() => {});
    }

    lastSyncTimestamp = new Date().toISOString();
    lastSyncStatus = "SUCCESS";
    return true;
  } catch (err: any) {
    lastSyncStatus = "ERROR";
    lastSyncError = err?.message || String(err);
    console.error(`[Persistence] Error syncing doc '${docId}' in '${colName}' to Firestore:`, err);
    return false;
  }
}

/**
 * Delete document from Cloud Firestore
 */
export async function deleteSingleDoc(colName: string, docId: string): Promise<boolean> {
  if (isRestoring || !docId) return false;
  lastSyncStatus = "SYNCING";
  try {
    const docRef = doc(firestoreDb, colName, String(docId));
    await deleteDoc(docRef);

    // Delete mirrors
    if (colName === "company_profile" || colName === "companies") {
      const mirrorCol = colName === "company_profile" ? "companies" : "company_profile";
      await deleteDoc(doc(firestoreDb, mirrorCol, String(docId))).catch(() => {});
    } else if (colName === "settings" || colName === "system_settings") {
      const mirrorCol = colName === "settings" ? "system_settings" : "settings";
      await deleteDoc(doc(firestoreDb, mirrorCol, String(docId))).catch(() => {});
    }

    lastSyncTimestamp = new Date().toISOString();
    lastSyncStatus = "SUCCESS";
    return true;
  } catch (err: any) {
    lastSyncStatus = "ERROR";
    lastSyncError = err?.message || String(err);
    console.error(`[Persistence] Error deleting doc '${docId}' in '${colName}' from Firestore:`, err);
    return false;
  }
}

export async function syncToFirestore(_forceAll = false, _skipCache = false): Promise<{ success: boolean; syncedCount: number; message: string }> {
  console.log("[Persistence] Starting full sync of clean master data and collections to Cloud Firestore...");
  lastSyncStatus = "SYNCING";
  lastSyncError = null;
  let totalSynced = 0;

  try {
    // 1. Sync all array collections defined in ALL_SYNC_COLLECTIONS
    for (const { key, colName } of ALL_SYNC_COLLECTIONS) {
      const items = (db as any)[key];
      if (Array.isArray(items) && items.length > 0) {
        // Chunk into batches of 400 (Firestore max batch is 500)
        const batchSize = 400;
        for (let i = 0; i < items.length; i += batchSize) {
          const chunk = items.slice(i, i + batchSize);
          const batch = writeBatch(firestoreDb);
          for (const item of chunk) {
            const docId = String(item._id || item.id || item.code || `doc-${Date.now()}`);
            const cleanData = JSON.parse(
              JSON.stringify(item, (_k, v) => (v === undefined ? null : v))
            );
            batch.set(doc(firestoreDb, colName, docId), cleanData, { merge: true });
            totalSynced++;
          }
          await batch.commit();
        }
        console.log(`[Persistence] Synced ${items.length} records to collection '${colName}'.`);
      }
    }

    // 2. Sync company_profile and settings to both primary and mirror collections
    if (db.company_profile) {
      const cpClean = JSON.parse(JSON.stringify(db.company_profile, (_k, v) => (v === undefined ? null : v)));
      await setDoc(doc(firestoreDb, "company_profile", "main"), cpClean, { merge: true });
      await setDoc(doc(firestoreDb, "companies", "main"), cpClean, { merge: true });
      totalSynced += 2;
    }
    if (db.settings) {
      const settingsClean = JSON.parse(JSON.stringify(db.settings, (_k, v) => (v === undefined ? null : v)));
      await setDoc(doc(firestoreDb, "settings", "global"), settingsClean, { merge: true });
      await setDoc(doc(firestoreDb, "system_settings", "global"), settingsClean, { merge: true });
      totalSynced += 2;
    }

    lastSyncTimestamp = new Date().toISOString();
    lastSyncStatus = "SUCCESS";
    console.log(`[Persistence] Full sync to Cloud Firestore completed successfully. Total docs synced: ${totalSynced}`);
    return {
      success: true,
      syncedCount: totalSynced,
      message: `Berhasil melakukan sinkronisasi ${totalSynced} dokumen ke Google Cloud Firestore.`,
    };
  } catch (err: any) {
    lastSyncStatus = "ERROR";
    lastSyncError = err?.message || String(err);
    console.error("[Persistence] Error syncing to Cloud Firestore:", err);
    return {
      success: false,
      syncedCount: totalSynced,
      message: "Gagal sinkronisasi ke Cloud Firestore: " + (err?.message || String(err)),
    };
  }
}

export const OPERATIONAL_COLLECTIONS: Array<{ key: keyof typeof db; colName: string }> = [
  { key: "outlets", colName: "outlets" },
  { key: "sales_outlets", colName: "sales_outlets" },
  { key: "call_plans", colName: "call_plans" },
  { key: "call_plan_items", colName: "call_plan_items" },
  { key: "attendance", colName: "attendance" },
  { key: "visits", colName: "visits" },
  { key: "transactions", colName: "transactions" },
  { key: "inventory", colName: "inventory" },
  { key: "stock_movements", colName: "stock_movements" },
  { key: "stock_handovers", colName: "stock_handovers" },
  { key: "stock_returns", colName: "stock_returns" },
  { key: "stock_receivings", colName: "stock_receivings" },
  { key: "sales_stock_ledgers", colName: "sales_stock_ledgers" },
  { key: "targets", colName: "targets" },
  { key: "cash_deposits", colName: "cash_deposits" },
  { key: "receivables", colName: "receivables" },
  { key: "daily_reconciliations", colName: "daily_reconciliations" },
  { key: "audit_logs", colName: "audit_logs" },
  { key: "gps_events", colName: "gps_events" },
];

export async function purgeAllFirestoreData(): Promise<{ success: boolean; message: string; deletedCount: number }> {
  console.log("[Persistence] Initiating purge of all operational/dummy collections from Cloud Firestore...");
  let deletedCount = 0;
  try {
    for (const { key, colName } of OPERATIONAL_COLLECTIONS) {
      try {
        const snap = await getDocs(collection(firestoreDb, colName));
        if (!snap.empty) {
          const batch = writeBatch(firestoreDb);
          let count = 0;
          for (const d of snap.docs) {
            batch.delete(doc(firestoreDb, colName, d.id));
            count++;
          }
          await batch.commit();
          deletedCount += count;
          console.log(`[Persistence] Purged ${count} documents from '${colName}'.`);
        }
        // Clear in-memory collection
        if (Array.isArray((db as any)[key])) {
          (db as any)[key] = [];
        }
      } catch (colErr) {
        console.warn(`[Persistence] Notice purging collection '${colName}':`, colErr);
      }
    }
    lastSyncTimestamp = new Date().toISOString();
    lastSyncStatus = "SUCCESS";
    console.log(`[Persistence] Total ${deletedCount} operational documents purged from Cloud Firestore.`);
    return {
      success: true,
      message: `Berhasil menghapus ${deletedCount} dokumen operasional dari Cloud Firestore. Database bersih dan siap dipakai.`,
      deletedCount,
    };
  } catch (err: any) {
    console.error("[Persistence] Failed to purge Cloud Firestore data:", err);
    return {
      success: false,
      message: "Gagal menghapus data Firestore: " + (err?.message || String(err)),
      deletedCount,
    };
  }
}


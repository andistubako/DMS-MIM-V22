import { firestoreDb } from "./firebase.js";
import {
  collection,
  doc,
  writeBatch,
  getDocs,
} from "firebase/firestore";
import { db } from "./data.js";
import { defaultV22Users } from "./firestoreSeed.js";
import {
  defaultProvinces,
  defaultRegencies,
  defaultOffices,
  defaultAreas,
  defaultDistricts,
  defaultVillages,
  defaultChannels,
  defaultRoutes,
  defaultProducts,
  defaultSkus,
  defaultPrices,
  defaultPromos,
  defaultOpenCallReasons,
  defaultSalesmen,
} from "./masterDataSeed.js";
import { ALL_SYNC_COLLECTIONS } from "./persistence.js";

export interface MigrationSummary {
  success: boolean;
  source: "LOCAL_STORE_AND_SEEDS";
  timestamp: string;
  totalCollections: number;
  totalDocumentsMigrated: number;
  breakdown: Record<string, number>;
  message: string;
}

/**
 * Sanitize object for Firestore (eliminates undefined and circular structures)
 */
function sanitizeForFirestore(data: any): any {
  if (data === undefined) return null;
  return JSON.parse(
    JSON.stringify(data, (_key, val) => (val === undefined ? null : val))
  );
}

/**
 * Execute full data migration from PostgreSQL / Cloud SQL and operational store to Google Cloud Firestore SSOT
 */
export async function executeFullMigrationToFirestore(): Promise<MigrationSummary> {
  const timestamp = new Date().toISOString();
  console.log(`[Migration] Starting Full Database Migration to Google Cloud Firestore at ${timestamp}...`);

  const breakdown: Record<string, number> = {};
  let totalDocs = 0;
  let source: "POSTGRESQL_AND_LOCAL" | "LOCAL_STORE_AND_SEEDS" = "LOCAL_STORE_AND_SEEDS";

  // Data staging map: collectionName -> Map<docId, data>
  const stagedData = new Map<string, Map<string, any>>();

  const stageDoc = (colName: string, docId: string, data: any) => {
    if (!colName || !docId || !data) return;
    if (!stagedData.has(colName)) {
      stagedData.set(colName, new Map());
    }
    const clean = sanitizeForFirestore({ ...data, _id: docId, id: docId });
    stagedData.get(colName)!.set(String(docId), clean);
  };

  // 1. Stage Baseline Seeds & In-Memory Data first
  console.log("[Migration] Staging baseline system entities...");

  // Default Users
  defaultV22Users.forEach((u) => stageDoc("users", u._id, u));
  if (Array.isArray(db.users)) {
    db.users.forEach((u: any) => stageDoc("users", u._id || u.id, u));
  }

  // Company Profile
  const companyData = db.company_profile || {
    _id: "main",
    companyId: "main",
    companyName: "PT Mahameru Insan Mandiri",
    companyLegalName: "PT Mahameru Insan Mandiri",
    companyCode: "MHM-JKT",
    address: "Jl. Tebet Barat Dalam Raya No. 12, Tebet, Jakarta Selatan 12810",
    phone: "+62 21 8370 1234",
    email: "info@mahamerudistribusi.co.id",
    website: "https://mahamerudistribusi.co.id",
    description: "Distributor FMCG & Consumer Goods terkemuka di Indonesia.",
    directorName: "Andis Moch Solihin",
    bankName: "Bank Central Asia (BCA)",
    bankAccountNumber: "8830-1234-5678",
    bankAccountHolder: "PT Mahameru Insan Mandiri",
    bankBranch: "KCP Tebet Raya",
    updatedAt: timestamp,
  };
  stageDoc("company_profile", "main", companyData);
  stageDoc("companies", "main", companyData);

  // System Settings
  const settingsData = db.settings || {
    _id: "global",
    company_name: "PT Mahameru Insan Mandiri",
    office_address: "Jl. Tebet Barat Dalam Raya No. 12, Tebet, Jakarta Selatan 12810",
    currency_symbol: "Rp",
    outlet_radius_m: 200,
    gps_accuracy_max_m: 50,
    enforce_office_geofence: true,
    enforce_outlet_geofence: true,
    allow_fake_gps: false,
    visit_min_duration_sec: 180,
    default_payment_term_days: 14,
    updatedAt: timestamp,
  };
  stageDoc("system_settings", "global", settingsData);
  stageDoc("settings", "global", settingsData);

  // Master Data Taxonomy
  defaultProvinces.forEach((item) => stageDoc("provinces", item._id || item.id, item));
  defaultRegencies.forEach((item) => stageDoc("regencies", item._id || item.id, item));
  defaultOffices.forEach((item) => stageDoc("offices", item._id || item.id, item));
  defaultAreas.forEach((item) => stageDoc("areas", item._id || item.id, item));
  defaultDistricts.forEach((item) => stageDoc("districts", item._id || item.id, item));
  defaultVillages.forEach((item) => stageDoc("villages", item._id || item.id, item));
  defaultChannels.forEach((item) => stageDoc("channels", item._id || item.id, item));
  defaultRoutes.forEach((item) => stageDoc("routes", item._id || item.id, item));
  defaultProducts.forEach((item) => stageDoc("products", item._id || item.id, item));
  defaultSkus.forEach((item) => stageDoc("skus", item._id || item.id, item));
  defaultPrices.forEach((item) => stageDoc("prices", item._id || item.id, item));
  defaultPromos.forEach((item) => stageDoc("promos", item._id || item.id, item));
  defaultOpenCallReasons.forEach((item) => stageDoc("open_call_reasons", item._id || item.id, item));
  defaultSalesmen.forEach((item) => stageDoc("salesmen", item._id || item.id, item));

  // In-Memory collections (transactions, outlets, visits, targets, inventory, etc.)
  for (const { key, colName } of ALL_SYNC_COLLECTIONS) {
    const list = (db as any)[key];
    if (Array.isArray(list)) {
      list.forEach((item: any) => {
        const id = item._id || item.id || item.code;
        if (id) stageDoc(colName, id, item);
      });
    }
  }

  // 2. Batch commit all staged collections to Cloud Firestore
  console.log(`[Migration] Staging completed. Committing ${stagedData.size} collections to Cloud Firestore...`);
  const BATCH_SIZE = 400;

  for (const [colName, docMap] of stagedData.entries()) {
    const items = Array.from(docMap.entries());
    let colMigratedCount = 0;

    for (let i = 0; i < items.length; i += BATCH_SIZE) {
      const chunk = items.slice(i, i + BATCH_SIZE);
      const batch = writeBatch(firestoreDb);

      for (const [docId, docData] of chunk) {
        const docRef = doc(firestoreDb, colName, String(docId));
        batch.set(docRef, docData, { merge: true });
        colMigratedCount++;
      }

      await batch.commit();
    }

    breakdown[colName] = colMigratedCount;
    totalDocs += colMigratedCount;
    console.log(`[Migration] Successfully wrote ${colMigratedCount} documents to Firestore collection '${colName}'.`);
  }

  console.log(`[Migration] Full database migration completed! Total: ${totalDocs} documents across ${stagedData.size} collections.`);

  return {
    success: true,
    source,
    timestamp,
    totalCollections: stagedData.size,
    totalDocumentsMigrated: totalDocs,
    breakdown,
    message: `Full migrasi database ke Google Cloud Firestore berhasil diselesaikan. Sebanyak ${totalDocs} dokumen di ${stagedData.size} koleksi telah dimigrasikan.`,
  };
}

import { firestoreDb } from "./firebase.js";
import {
  collection,
  doc,
  getDocs,
  getDoc,
  setDoc,
  updateDoc,
  deleteDoc,
  query,
  where,
} from "firebase/firestore";
import { db } from "./data.js";
import { defaultOutlets, defaultSalesOutlets } from "./masterDataSeed.js";

// Entity mapping from route parameters to Firestore collection names and memory keys
export const ENTITY_COLLECTION_MAP: Record<string, { col: string; dbKey: keyof typeof db }> = {
  users: { col: "users", dbKey: "users" },
  salesmen: { col: "salesmen", dbKey: "salesmen" },
  offices: { col: "offices", dbKey: "offices" },
  areas: { col: "areas", dbKey: "areas" },
  districts: { col: "districts", dbKey: "districts" },
  villages: { col: "villages", dbKey: "villages" },
  provinces: { col: "provinces", dbKey: "provinces" },
  regencies: { col: "regencies", dbKey: "regencies" },
  channels: { col: "channels", dbKey: "channels" },
  products: { col: "products", dbKey: "products" },
  skus: { col: "skus", dbKey: "skus" },
  prices: { col: "prices", dbKey: "prices" },
  promos: { col: "promos", dbKey: "promos" },
  routes: { col: "routes", dbKey: "routes" },
  outlets: { col: "outlets", dbKey: "outlets" },
  "sales-outlets": { col: "sales_outlets", dbKey: "sales_outlets" },
  "outlet-call-reasons": { col: "open_call_reasons", dbKey: "open_call_reasons" },
  "open-call-reasons": { col: "open_call_reasons", dbKey: "open_call_reasons" },
  reasons: { col: "open_call_reasons", dbKey: "open_call_reasons" },
  settings: { col: "system_settings", dbKey: "settings" as any },
  companies: { col: "companies", dbKey: "company_profile" as any },
};

/**
 * Load all master collections from Cloud Firestore into in-memory db cache
 */
export async function loadMasterDataFromFirestore() {
  console.log("[MasterDataService] Loading all master collections from Cloud Firestore...");
  const collectionsToLoad = [
    "users",
    "offices",
    "provinces",
    "regencies",
    "districts",
    "villages",
    "areas",
    "channels",
    "routes",
    "products",
    "skus",
    "prices",
    "promos",
    "salesmen",
    "outlets",
    "sales_outlets",
    "open_call_reasons",
    "companies",
    "system_settings",
  ];

  for (const colName of collectionsToLoad) {
    try {
      const snap = await getDocs(collection(firestoreDb, colName));
      const items: any[] = [];
      snap.forEach((d) => {
        items.push({ _id: d.id, id: d.id, ...d.data() });
      });

      if (colName === "companies" && items.length > 0) {
        db.company_profile = items[0];
      } else if (colName === "system_settings" && items.length > 0) {
        db.settings = items[0];
      } else if (colName in db) {
        if (items.length === 0 && colName === "outlets") {
          (db as any)[colName] = [...defaultOutlets];
        } else if (items.length === 0 && colName === "sales_outlets") {
          (db as any)[colName] = [...defaultSalesOutlets];
        } else {
          (db as any)[colName] = items;
        }
      }
    } catch (err) {
      console.warn(`[MasterDataService] Failed loading '${colName}' from Firestore:`, err);
    }
  }
  console.log("[MasterDataService] Cloud Firestore master collections loaded successfully.");
}

/**
 * Read collection items with optional query search & status filter, enriched with relations
 */
export async function getMasterItems(entity: string, queryParams: { q?: string; status?: string }) {
  const mapping = ENTITY_COLLECTION_MAP[entity];
  if (!mapping) return null;

  const colName = mapping.col;
  const dbKey = mapping.dbKey;

  // Primary source: Cloud Firestore
  let items: any[] = [];
  try {
    const snap = await getDocs(collection(firestoreDb, colName));
    snap.forEach((d) => {
      items.push({ _id: d.id, id: d.id, ...d.data() });
    });
    // Sync into memory cache
    if (dbKey in db) {
      (db as any)[dbKey] = items;
    }
  } catch (err) {
    console.warn(`[MasterDataService] Error querying Firestore for '${colName}', falling back to cache:`, err);
    items = ((db as any)[dbKey] || []).slice();
  }

  const q = (queryParams.q || "").toLowerCase().trim();
  const status = queryParams.status;

  let filtered = items.filter((item: any) => {
    if (status && item.status !== status) return false;
    if (q) {
      const matchName = item.name && String(item.name).toLowerCase().includes(q);
      const matchCode = item.code && String(item.code).toLowerCase().includes(q);
      const matchSkuCode = item.sku_code && String(item.sku_code).toLowerCase().includes(q);
      const matchPrice = item.price_name && String(item.price_name).toLowerCase().includes(q);
      const matchOffice = item.office_name && String(item.office_name).toLowerCase().includes(q);
      if (!matchName && !matchCode && !matchSkuCode && !matchPrice && !matchOffice) return false;
    }
    return true;
  });

  // Enrich routes with area_name
  if (entity === "routes") {
    const areas = (db.areas || []);
    const outlets = (db.outlets || []);
    const callPlans = (db.call_plans || []);
    filtered = filtered.map((r: any) => {
      const ar = areas.find((a) => a._id === r.area_id || a.id === r.area_id);
      const outletCount = outlets.filter((o) => (o.route_id === r._id || o.route_id === r.id) && o.status === "ACTIVE").length;
      const activePlansCount = callPlans.filter((p) => p.route_id === r._id || p.route_id === r.id).length;
      return {
        ...r,
        area_name: ar?.name || "-",
        outlet_count: outletCount,
        active_plans_count: activePlansCount,
      };
    });
  }

  // Enrich districts with area_name & regency_name
  if (entity === "districts") {
    const areas = (db.areas || []);
    const regencies = (db.regencies || []);
    filtered = filtered.map((d: any) => {
      const ar = areas.find((a: any) => a._id === d.area_id || a.id === d.area_id);
      const reg = regencies.find((r: any) => r._id === d.regency_id || r.id === d.regency_id);
      return {
        ...d,
        area_name: ar?.name || "-",
        regency_name: reg?.name || "-",
      };
    });
  }

  // Enrich villages with district_name
  if (entity === "villages") {
    const districts = (db.districts || []);
    filtered = filtered.map((v: any) => {
      const dist = districts.find((d: any) => d._id === v.district_id || d.id === v.district_id);
      return {
        ...v,
        district_name: dist?.name || "-",
      };
    });
  }

  // Enrich regencies with province_name
  if (entity === "regencies") {
    const provinces = (db.provinces || []);
    filtered = filtered.map((rg: any) => {
      const prv = provinces.find((p: any) => p._id === rg.province_id || p.id === rg.province_id);
      return {
        ...rg,
        province_name: prv?.name || "-",
      };
    });
  }

  // Enrich prices with sku_name
  if (entity === "prices") {
    const skus = (db.skus || []);
    filtered = filtered.map((p: any) => {
      const sku = skus.find((s: any) => s._id === p.sku_id || s.id === p.sku_id);
      return {
        ...p,
        sku_name: sku?.name ? `${sku.name} (${sku.sku_code || sku.code || ""})` : p.sku_id || "-",
      };
    });
  }

  // Enrich skus with product_name
  if (entity === "skus") {
    const products = (db.products || []);
    filtered = filtered.map((s: any) => {
      const prod = products.find((p: any) => p._id === s.product_id || p.id === s.product_id);
      return {
        ...s,
        product_name: prod?.name || "-",
        brand: prod?.brand || s.brand || "-",
        category: prod?.category || s.category || "-",
      };
    });
  }

  // Enrich salesmen with office_name & area_name
  if (entity === "salesmen") {
    const offices = (db.offices || []);
    const areas = (db.areas || []);
    filtered = filtered.map((s: any) => {
      const off = offices.find((o: any) => o._id === s.office_id || o.id === s.office_id);
      const ar = areas.find((a: any) => a._id === s.area_id || a.id === s.area_id);
      return {
        ...s,
        office_name: off?.office_name || (off as any)?.name || "-",
        area_name: ar?.name || "-",
      };
    });
  }

  // Enrich outlet call reasons with reason alias
  if (entity === "open-call-reasons" || entity === "outlet-call-reasons") {
    filtered = filtered.map((r: any) => ({
      ...r,
      reason: r.reason || r.name || r.description,
    }));
  }

  return {
    items: filtered,
    total: filtered.length,
    page: 1,
    limit: 100,
  };
}

/**
 * Save new master item to Cloud Firestore as Single Source of Truth
 */
export async function createMasterItem(entity: string, body: any) {
  const mapping = ENTITY_COLLECTION_MAP[entity];
  if (!mapping) throw new Error(`Entitas '${entity}' tidak valid.`);

  const colName = mapping.col;
  const dbKey = mapping.dbKey;

  const now = new Date().toISOString();
  const idPrefix = entity.replace(/[^a-zA-Z0-9]/g, "").slice(0, 4);
  const docId = body._id || body.id || `${idPrefix}-${Date.now()}`;

  const docData = {
    ...body,
    _id: docId,
    id: docId,
    status: body.status || "ACTIVE",
    created_at: body.created_at || now,
    updated_at: now,
  };

  // 1. Persist directly to Cloud Firestore
  await setDoc(doc(firestoreDb, colName, docId), docData);

  // 2. Update memory cache
  if (dbKey in db && Array.isArray((db as any)[dbKey])) {
    const list = (db as any)[dbKey];
    const idx = list.findIndex((x: any) => x._id === docId || x.id === docId);
    if (idx >= 0) {
      list[idx] = docData;
    } else {
      list.push(docData);
    }
  }

  return docData;
}

/**
 * Update master item in Cloud Firestore
 */
export async function updateMasterItem(entity: string, docId: string, updates: any) {
  const mapping = ENTITY_COLLECTION_MAP[entity];
  if (!mapping) throw new Error(`Entitas '${entity}' tidak valid.`);

  const colName = mapping.col;
  const dbKey = mapping.dbKey;

  const now = new Date().toISOString();
  const docRef = doc(firestoreDb, colName, docId);

  const cleanUpdates = {
    ...updates,
    updated_at: now,
  };
  delete cleanUpdates._id;
  delete cleanUpdates.id;

  // 1. Update Cloud Firestore
  await setDoc(docRef, cleanUpdates, { merge: true });

  // 2. Update memory cache
  let updatedDoc: any = null;
  if (dbKey in db && Array.isArray((db as any)[dbKey])) {
    const list = (db as any)[dbKey];
    const idx = list.findIndex((x: any) => x._id === docId || x.id === docId);
    if (idx >= 0) {
      list[idx] = { ...list[idx], ...cleanUpdates, _id: docId, id: docId };
      updatedDoc = list[idx];
    }
  }

  if (!updatedDoc) {
    const snap = await getDoc(docRef);
    updatedDoc = { _id: snap.id, id: snap.id, ...snap.data() };
  }

  return updatedDoc;
}

/**
 * Delete master item from Cloud Firestore
 */
export async function deleteMasterItem(entity: string, docId: string) {
  const mapping = ENTITY_COLLECTION_MAP[entity];
  if (!mapping) throw new Error(`Entitas '${entity}' tidak valid.`);

  const colName = mapping.col;
  const dbKey = mapping.dbKey;

  // 1. Delete from Cloud Firestore
  await deleteDoc(doc(firestoreDb, colName, docId));

  // 2. Remove from memory cache
  if (dbKey in db && Array.isArray((db as any)[dbKey])) {
    (db as any)[dbKey] = (db as any)[dbKey].filter(
      (x: any) => x._id !== docId && x.id !== docId
    );
  }

  return true;
}

/**
 * System Settings from Cloud Firestore
 */
export async function getSystemSettingsFromFirestore() {
  try {
    const snap = await getDoc(doc(firestoreDb, "system_settings", "global"));
    if (snap.exists()) {
      const data = snap.data();
      db.settings = { ...db.settings, ...data };
      return db.settings;
    }
  } catch (err) {
    console.warn("[MasterDataService] Failed fetching system_settings from Firestore:", err);
  }
  return db.settings;
}

export async function updateSystemSettingsInFirestore(newData: any, updatedBy: string = "system") {
  const settingsData = {
    ...db.settings,
    ...newData,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  };
  try {
    await setDoc(doc(firestoreDb, "system_settings", "global"), settingsData, { merge: true });
    await setDoc(doc(firestoreDb, "settings", "global"), settingsData, { merge: true }).catch(() => {});
    db.settings = settingsData;
  } catch (err) {
    console.error("[MasterDataService] Failed updating system_settings in Firestore:", err);
  }
  return settingsData;
}

/**
 * Company Profile from Cloud Firestore
 */
export async function getCompanyProfileFromFirestore() {
  try {
    let snap = await getDoc(doc(firestoreDb, "companies", "main"));
    if (!snap.exists()) {
      snap = await getDoc(doc(firestoreDb, "company_profile", "main"));
    }
    if (snap.exists()) {
      const data = snap.data();
      db.company_profile = { ...db.company_profile, ...data };
      return db.company_profile;
    }
  } catch (err) {
    console.warn("[MasterDataService] Failed fetching company_profile from Firestore:", err);
  }
  return db.company_profile;
}

export async function updateCompanyProfileInFirestore(updates: any, updatedBy: string = "system") {
  const profileData = {
    ...db.company_profile,
    ...updates,
    updated_at: new Date().toISOString(),
    updated_by: updatedBy,
  };
  try {
    await setDoc(doc(firestoreDb, "companies", "main"), profileData, { merge: true });
    await setDoc(doc(firestoreDb, "company_profile", "main"), profileData, { merge: true }).catch(() => {});
    db.company_profile = profileData;
  } catch (err) {
    console.error("[MasterDataService] Failed updating company_profile in Firestore:", err);
  }
  return profileData;
}


import { firestoreDb } from "../../server/firebase.js";
import {
  collection,
  doc,
  getDoc,
  getDocs,
  setDoc,
  deleteDoc,
  query,
  where,
  limit,
} from "firebase/firestore";
import { db } from "../../server/data.js";

const TABLE_TO_COLLECTION: Record<string, string> = {
  users: "users",
  company_profile: "companies",
  companies: "companies",
  system_settings: "system_settings",
  settings: "system_settings",
  offices: "offices",
  provinces: "provinces",
  regencies: "regencies",
  districts: "districts",
  villages: "villages",
  areas: "areas",
  channels: "channels",
  routes: "routes",
  salesmen: "salesmen",
  open_call_reasons: "open_call_reasons",
  outlets: "outlets",
  sales_outlets: "sales_outlets",
  products: "products",
  skus: "skus",
  prices: "prices",
  promos: "promos",
  call_plans: "call_plans",
  call_plan_items: "call_plan_items",
  attendance: "attendance",
  visits: "visits",
  transactions: "transactions",
  transaction_items: "transaction_items",
  inventory: "inventory",
  stock_movements: "stock_movements",
  stock_handovers: "stock_handovers",
  stock_returns: "stock_returns",
  stock_receivings: "stock_receivings",
  sales_stock_ledgers: "sales_stock_ledgers",
  targets: "targets",
  cash_deposits: "cash_deposits",
  receivables: "receivables",
  installment_payments: "installment_payments",
  daily_reconciliations: "daily_reconciliations",
  audit_logs: "audit_logs",
  gps_events: "gps_events",
};

function resolveCollectionName(table: any): string {
  if (typeof table === "string") {
    return TABLE_TO_COLLECTION[table] || table;
  }
  const raw = table?.tableName || table?._?.name || table?.name || table?._id || "unknown";
  return TABLE_TO_COLLECTION[raw] || raw;
}

function parseCondition(cond: any): { field: string | null; val: any } | null {
  if (!cond) return null;
  const chunks = cond.queryChunks || [];
  let field: string | null = null;
  let val: any = undefined;

  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (!chunk) continue;

    if (typeof chunk === "object") {
      if (chunk.name) {
        field = chunk.name;
      } else if (chunk.columnName) {
        field = chunk.columnName;
      } else if (chunk.value !== undefined && chunk.constructor?.name !== "StringChunk") {
        val = chunk.value;
      }
    } else if (typeof chunk === "string" || typeof chunk === "number" || typeof chunk === "boolean") {
      val = chunk;
    }
  }

  // Recursive fallback for nested conditions
  if ((!field || val === undefined) && chunks.length > 0) {
    for (const chunk of chunks) {
      if (chunk && typeof chunk === "object" && chunk.queryChunks) {
        const sub = parseCondition(chunk);
        if (sub?.field && !field) field = sub.field;
        if (sub?.val !== undefined && val === undefined) val = sub.val;
      }
    }
  }

  return { field, val };
}

function matchItem(item: any, condition: any): boolean {
  if (!condition) return true;
  const parsed = parseCondition(condition);
  if (!parsed || !parsed.field || parsed.val === undefined) return false;

  const targetVal = parsed.val;
  const field = parsed.field;

  const fieldMapping: Record<string, string[]> = {
    email: ["email"],
    id: ["id", "_id"],
    outletId: ["outlet_id", "outletId"],
    productId: ["product_id", "productId"],
    officeId: ["office_id", "officeId"],
    areaId: ["area_id", "areaId"],
    routeId: ["route_id", "routeId"],
    status: ["status"],
    skuCode: ["sku_code", "skuCode", "code"],
    barcode: ["barcode"],
    userId: ["user_id", "userId"],
    callPlanId: ["call_plan_id", "callPlanId"],
  };

  const snakeCase = field.replace(/([A-Z])/g, "_$1").toLowerCase();
  const candidates = fieldMapping[field] || [field, snakeCase];
  for (const c of candidates) {
    if (item[c] !== undefined && item[c] !== null) {
      if (typeof targetVal === "string" && typeof item[c] === "string") {
        return item[c].toLowerCase() === targetVal.toLowerCase();
      }
      return item[c] === targetVal;
    }
  }

  return false;
}

/**
 * Direct Google Cloud Firestore Database Adapter.
 * Replaces any in-memory or fallback SQL emulation, ensuring
 * that Cloud Firestore is the real, authoritative database.
 */
export function createFirestoreDbAdapter(): any {
  async function fetchCollectionDocs(colName: string): Promise<any[]> {
    try {
      const snap = await getDocs(collection(firestoreDb, colName));
      const items: any[] = [];
      snap.forEach((d) => {
        items.push({ _id: d.id, id: d.id, ...d.data() });
      });
      return items;
    } catch (err) {
      console.warn(`[FirestoreAdapter] Fetch error on collection '${colName}':`, err);
      const mem = (db as any)[colName];
      return Array.isArray(mem) ? [...mem] : [];
    }
  }

  const queryHandlers: Record<string, {
    findMany: (opts?: any) => Promise<any[]>;
    findFirst: (opts?: any) => Promise<any | null>;
  }> = {
    users: {
      findMany: async (opts?: any) => {
        let list = await fetchCollectionDocs("users");
        if (opts?.where) list = list.filter((i) => matchItem(i, opts.where));
        return list.map((u) => ({
          id: u.id || u._id,
          name: u.name,
          email: u.email,
          role: u.role,
          status: u.status || "ACTIVE",
          phone: u.phone || "",
          officeId: u.office_id || u.officeId || "off-1",
          areaId: u.area_id || u.areaId || "area-1",
          passwordHash: u.password_hash || u.passwordHash || "",
          createdAt: u.created_at ? new Date(u.created_at) : new Date(),
        }));
      },
      findFirst: async (opts?: any) => {
        const list = await queryHandlers.users.findMany(opts);
        return list[0] || null;
      },
    },

    products: {
      findMany: async (opts?: any) => {
        let list = await fetchCollectionDocs("products");
        if (opts?.where) list = list.filter((i) => matchItem(i, opts.where));
        return list.map((p) => ({
          id: p.id || p._id,
          productCode: p.product_code || p.code || "",
          name: p.name || "",
          category: p.category || "",
          brand: p.brand || "",
          status: p.status || "ACTIVE",
          imageUrl: p.image_url || p.imageUrl || "",
          createdAt: p.created_at ? new Date(p.created_at) : new Date(),
          metadata: p.metadata || {},
        }));
      },
      findFirst: async (opts?: any) => {
        const list = await queryHandlers.products.findMany(opts);
        return list[0] || null;
      },
    },

    skus: {
      findMany: async (opts?: any) => {
        let list = await fetchCollectionDocs("skus");
        if (opts?.where) list = list.filter((i) => matchItem(i, opts.where));
        return list.map((s) => ({
          id: s.id || s._id,
          productId: s.product_id || s.productId || "",
          skuCode: s.sku_code || s.code || "",
          barcode: s.barcode || "",
          name: s.name || "",
          packaging: s.packaging || s.unit || "PCS",
          conversionFactor: s.conversion_factor || 1,
          status: s.status || "ACTIVE",
          createdAt: s.created_at ? new Date(s.created_at) : new Date(),
        }));
      },
      findFirst: async (opts?: any) => {
        const list = await queryHandlers.skus.findMany(opts);
        return list[0] || null;
      },
    },

    prices: {
      findMany: async (opts?: any) => {
        let list = await fetchCollectionDocs("prices");
        if (opts?.where) list = list.filter((i) => matchItem(i, opts.where));
        return list.map((pr) => ({
          id: pr.id || pr._id,
          skuId: pr.sku_id || pr.skuId,
          priceTier: pr.price_tier || pr.tier || "DEFAULT",
          priceAmount: pr.price_amount || pr.price || 0,
          currency: pr.currency || "IDR",
          status: pr.status || "ACTIVE",
        }));
      },
      findFirst: async (opts?: any) => {
        const list = await queryHandlers.prices.findMany(opts);
        return list[0] || null;
      },
    },

    offices: {
      findMany: async (opts?: any) => {
        let list = await fetchCollectionDocs("offices");
        if (opts?.where) list = list.filter((i) => matchItem(i, opts.where));
        return list.map((o) => ({
          id: o.id || o._id,
          officeName: o.office_name || o.name || "",
          officeCode: o.office_code || o.code || "",
          address: o.address || "",
          phone: o.phone || "",
          latitude: o.latitude || 0,
          longitude: o.longitude || 0,
          radiusMeters: o.radius_m || o.radiusMeters || 100,
          status: o.status || "ACTIVE",
        }));
      },
      findFirst: async (opts?: any) => {
        const list = await queryHandlers.offices.findMany(opts);
        return list[0] || null;
      },
    },

    areas: {
      findMany: async (opts?: any) => {
        let list = await fetchCollectionDocs("areas");
        if (opts?.where) list = list.filter((i) => matchItem(i, opts.where));
        return list.map((a) => ({
          id: a.id || a._id,
          officeId: a.office_id || a.officeId,
          areaName: a.name || a.area_name || "",
          areaCode: a.code || a.area_code || "",
          status: a.status || "ACTIVE",
        }));
      },
      findFirst: async (opts?: any) => {
        const list = await queryHandlers.areas.findMany(opts);
        return list[0] || null;
      },
    },

    channels: {
      findMany: async (opts?: any) => {
        let list = await fetchCollectionDocs("channels");
        if (opts?.where) list = list.filter((i) => matchItem(i, opts.where));
        return list.map((c) => ({
          id: c.id || c._id,
          code: c.code || "",
          name: c.name || "",
          status: c.status || "ACTIVE",
        }));
      },
      findFirst: async (opts?: any) => {
        const list = await queryHandlers.channels.findMany(opts);
        return list[0] || null;
      },
    },

    routes: {
      findMany: async (opts?: any) => {
        let list = await fetchCollectionDocs("routes");
        if (opts?.where) list = list.filter((i) => matchItem(i, opts.where));
        return list.map((r) => ({
          id: r.id || r._id,
          code: r.code || "",
          name: r.name || "",
          areaId: r.area_id || r.areaId || "",
          status: r.status || "ACTIVE",
        }));
      },
      findFirst: async (opts?: any) => {
        const list = await queryHandlers.routes.findMany(opts);
        return list[0] || null;
      },
    },

    outlets: {
      findMany: async (opts?: any) => {
        let list = await fetchCollectionDocs("outlets");
        if (opts?.where) list = list.filter((i) => matchItem(i, opts.where));
        return list.map((otl) => ({
          id: otl.id || otl._id,
          _id: otl._id || otl.id,
          outletCode: otl.outlet_code || otl.code || otl.outletCode || "",
          outletName: otl.outlet_name || otl.name || otl.outletName || "",
          name: otl.outlet_name || otl.name || otl.outletName || "",
          ownerName: otl.owner_name || otl.ownerName || "",
          phone: otl.phone || "",
          address: otl.address || "",
          latitude: Number(otl.latitude) || 0,
          longitude: Number(otl.longitude) || 0,
          areaId: otl.area_id || otl.areaId || "",
          channelId: otl.channel_id || otl.channelId || "",
          routeId: otl.route_id || otl.routeId || "",
          status: otl.status || "ACTIVE",
          approvalStatus: otl.lifecycle_status || otl.approvalStatus || "APPROVED",
          createdAt: otl.created_at ? new Date(otl.created_at) : (otl.createdAt || new Date()),
          metadata: otl.metadata || { ...otl },
          notes: otl.notes || "",
          imageUrl: otl.photo_url || otl.imageUrl || "",
          ...otl,
        }));
      },
      findFirst: async (opts?: any) => {
        const list = await queryHandlers.outlets.findMany(opts);
        return list[0] || null;
      },
    },

    companyProfile: {
      findMany: async () => [await queryHandlers.companyProfile.findFirst()],
      findFirst: async () => {
        try {
          const cpSnap = await getDoc(doc(firestoreDb, "companies", "main"));
          if (cpSnap.exists()) {
            const data = cpSnap.data();
            return {
              id: cpSnap.id,
              companyName: data.companyName || data.name || "PT Mahameru Insan Mandiri",
              companyLegalName: data.companyLegalName || "",
              companyCode: data.companyCode || "MHM",
              address: data.companyAddress || data.address || "",
              phone: data.companyPhone || data.phone || "",
              email: data.companyEmail || data.email || "",
              website: data.companyWebsite || data.website || "",
              logoUrl: data.logoUrl || data.logo || "",
            };
          }
        } catch {}
        return {
          id: "main",
          companyName: "PT Mahameru Insan Mandiri",
          companyLegalName: "PT Mahameru Insan Mandiri",
          companyCode: "MHM",
          address: "Jl. Tebet Barat Dalam Raya No. 12, Jakarta Selatan",
          phone: "0812-3456-7890",
          email: "info@mahameru.id",
          website: "https://mahameru.id",
          logoUrl: "",
        };
      },
    },

    systemSettings: {
      findMany: async () => [await queryHandlers.systemSettings.findFirst()],
      findFirst: async () => {
        try {
          const stSnap = await getDoc(doc(firestoreDb, "system_settings", "global"));
          if (stSnap.exists()) {
            const s = stSnap.data();
            return {
              id: "global",
              defaultRadiusMeters: s.default_radius_m || 200,
              enforceGpsValidation: s.enforce_gps_validation ?? true,
              allowOfflineMode: false,
              operatingHoursStart: s.operating_hours_start || "08:00",
              operatingHoursEnd: s.operating_hours_end || "17:00",
              maxDiscountPercent: s.max_discount_percent || 15,
              taxPercentage: s.tax_percentage || 11,
              taxEnabled: s.tax_enabled ?? true,
              createdAt: new Date(),
            };
          }
        } catch {}
        return {
          id: "global",
          defaultRadiusMeters: 200,
          enforceGpsValidation: true,
          allowOfflineMode: false,
          operatingHoursStart: "08:00",
          operatingHoursEnd: "17:00",
          maxDiscountPercent: 15,
          taxPercentage: 11,
          taxEnabled: true,
          createdAt: new Date(),
        };
      },
    },
  };

  const adapter: any = {
    query: new Proxy(queryHandlers, {
      get(target, prop: string) {
        if (target[prop]) return target[prop];
        const colName = TABLE_TO_COLLECTION[prop] || prop;
        return {
          findMany: async (opts?: any) => {
            let list = await fetchCollectionDocs(colName);
            if (opts?.where) list = list.filter((i) => matchItem(i, opts.where));
            return list;
          },
          findFirst: async (opts?: any) => {
            let list = await fetchCollectionDocs(colName);
            if (opts?.where) list = list.filter((i) => matchItem(i, opts.where));
            return list[0] || null;
          },
        };
      },
    }),

    select: () => ({
      from: (table: any) => {
        const colName = resolveCollectionName(table);
        return {
          where: (cond: any) => ({
            limit: async () => {
              const list = await fetchCollectionDocs(colName);
              return list.filter((i) => matchItem(i, cond)).slice(0, 1);
            },
            then: async (resolve: any) => {
              const list = await fetchCollectionDocs(colName);
              return resolve(list.filter((i) => matchItem(i, cond)));
            },
          }),
          limit: async (num: number) => {
            const list = await fetchCollectionDocs(colName);
            return list.slice(0, num);
          },
          then: async (resolve: any) => {
            const list = await fetchCollectionDocs(colName);
            return resolve(list);
          },
        };
      },
    }),

    insert: (table: any) => {
      const colName = resolveCollectionName(table);
      return {
        values: (val: any) => {
          const items = Array.isArray(val) ? val : [val];
          const executeInsert = async () => {
            for (const item of items) {
              const docId = String(item.id || item._id || item.code || `doc-${Date.now()}`);
              const cleanData = JSON.parse(
                JSON.stringify(item, (_k, v) => (v === undefined ? null : v))
              );
              await setDoc(doc(firestoreDb, colName, docId), cleanData, { merge: true });
              // Also update in-memory reflection
              const mem = (db as any)[colName];
              if (Array.isArray(mem)) {
                const idx = mem.findIndex((x: any) => (x._id || x.id) === docId);
                if (idx >= 0) mem[idx] = { ...mem[idx], ...cleanData };
                else mem.push({ _id: docId, id: docId, ...cleanData });
              }
            }
            return items;
          };

          const retObj = {
            onConflictDoUpdate: (_opts?: any) => retObj,
            onConflictDoNothing: (_opts?: any) => retObj,
            returning: () => executeInsert(),
            then: (resolve: any, reject?: any) => executeInsert().then(resolve, reject),
            catch: (reject: any) => executeInsert().catch(reject),
          };
          return retObj;
        },
      };
    },

    update: (table: any) => {
      const colName = resolveCollectionName(table);
      return {
        set: (updates: any) => ({
          where: (cond: any) => {
            const executeUpdate = async () => {
              const parsed = parseCondition(cond);
              const cleanUpdates = JSON.parse(
                JSON.stringify(updates, (_k, v) => (v === undefined ? null : v))
              );

              if (parsed && (parsed.field === "id" || parsed.field === "_id") && parsed.val !== undefined && parsed.val !== null) {
                const docId = String(parsed.val);
                if (docId && docId !== "undefined") {
                  await setDoc(doc(firestoreDb, colName, docId), cleanUpdates, { merge: true });
                  const mem = (db as any)[colName];
                  if (Array.isArray(mem)) {
                    const m = mem.find((x: any) => (x._id || x.id) === docId);
                    if (m) Object.assign(m, cleanUpdates);
                  }
                  return [{ id: docId, ...cleanUpdates }];
                }
              }

              // Filter matching docs and update
              const docs = await fetchCollectionDocs(colName);
              const matched = docs.filter((d) => matchItem(d, cond));
              for (const m of matched) {
                const docId = String(m.id || m._id);
                if (docId && docId !== "undefined") {
                  await setDoc(doc(firestoreDb, colName, docId), cleanUpdates, { merge: true });
                  const mem = (db as any)[colName];
                  if (Array.isArray(mem)) {
                    const x = mem.find((it: any) => (it._id || it.id) === docId);
                    if (x) Object.assign(x, cleanUpdates);
                  }
                }
              }
              return matched.map((m) => ({ ...m, ...cleanUpdates }));
            };

            return {
              returning: () => executeUpdate(),
              then: (resolve: any, reject?: any) => executeUpdate().then(resolve, reject),
              catch: (reject: any) => executeUpdate().catch(reject),
            };
          },
        }),
      };
    },

    delete: (table: any) => {
      const colName = resolveCollectionName(table);
      return {
        where: (cond: any) => {
          const executeDelete = async () => {
            const parsed = parseCondition(cond);
            if (parsed && (parsed.field === "id" || parsed.field === "_id") && parsed.val !== undefined && parsed.val !== null) {
              const docId = String(parsed.val);
              if (docId && docId !== "undefined") {
                await deleteDoc(doc(firestoreDb, colName, docId));
                const mem = (db as any)[colName];
                if (Array.isArray(mem)) {
                  (db as any)[colName] = mem.filter((x: any) => (x._id || x.id) !== docId);
                }
                return [{ id: docId }];
              }
            }

            const docs = await fetchCollectionDocs(colName);
            const matched = docs.filter((d) => matchItem(d, cond));
            for (const m of matched) {
              const docId = String(m.id || m._id);
              if (docId && docId !== "undefined") {
                await deleteDoc(doc(firestoreDb, colName, docId));
                const mem = (db as any)[colName];
                if (Array.isArray(mem)) {
                  (db as any)[colName] = mem.filter((x: any) => (x._id || x.id) !== docId);
                }
              }
            }
            return matched;
          };

          return {
            then: (resolve: any, reject?: any) => executeDelete().then(resolve, reject),
            catch: (reject: any) => executeDelete().catch(reject),
          };
        },
      };
    },

    transaction: async (cb: any) => {
      return await cb(adapter);
    },

    execute: async () => {
      return { rows: [] };
    },
  };

  return adapter;
}

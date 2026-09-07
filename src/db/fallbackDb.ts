import { db } from "../../server/data.js";

function parseCondition(cond: any): { field: string | null; val: any } | null {
  if (!cond) return null;
  const chunks = cond.queryChunks || [];
  let field: string | null = null;
  let val: any = undefined;
  for (let i = 0; i < chunks.length; i++) {
    const chunk = chunks[i];
    if (chunk && chunk.name) {
      field = chunk.name;
    }
    if (chunk && chunk.value !== undefined && typeof chunk.value !== "object") {
      val = chunk.value;
    }
  }
  return { field, val };
}

function matchItem(item: any, condition: any): boolean {
  if (!condition) return true;
  const parsed = parseCondition(condition);
  if (!parsed || !parsed.field || parsed.val === undefined) return true;

  const targetVal = parsed.val;
  const field = parsed.field;

  // Check direct or camelCase or snake_case key
  if (item[field] !== undefined) {
    if (typeof targetVal === "string" && typeof item[field] === "string") {
      return item[field].toLowerCase() === targetVal.toLowerCase();
    }
    return item[field] === targetVal;
  }

  // Common field mappings
  const fieldMapping: Record<string, string[]> = {
    email: ["email"],
    id: ["id", "_id"],
    productId: ["product_id", "productId"],
    officeId: ["office_id", "officeId"],
    areaId: ["area_id", "areaId"],
    status: ["status"],
    skuCode: ["sku_code", "skuCode"],
    barcode: ["barcode"],
    userId: ["user_id", "userId"],
  };

  const candidates = fieldMapping[field] || [field];
  for (const c of candidates) {
    if (item[c] !== undefined) {
      if (typeof targetVal === "string" && typeof item[c] === "string") {
        return item[c].toLowerCase() === targetVal.toLowerCase();
      }
      return item[c] === targetVal;
    }
  }

  return false;
}

/**
 * Fallback in-memory query adapter for Drizzle sqlDb when secondary database is inactive.
 * Connects directly to memory cache synced with Google Cloud Firestore as SSOT.
 */
export function createFallbackSqlDb(): any {
  const queryHandlers: Record<string, {
    findMany: (opts?: any) => Promise<any[]>;
    findFirst: (opts?: any) => Promise<any | null>;
  }> = {
    products: {
      findMany: async (opts?: any) => {
        let list = (db.products || []).map((p: any) => ({
          id: p._id || p.id,
          productCode: p.product_code || p.code || "",
          name: p.name || "",
          category: p.category || "",
          brand: p.brand || "",
          status: p.status || "ACTIVE",
          imageUrl: p.imageUrl || p.image_url || "",
          createdAt: p.created_at ? new Date(p.created_at) : new Date(),
          metadata: p.metadata || {},
        }));
        if (opts?.where) {
          list = list.filter((item) => matchItem(item, opts.where));
        }
        return list;
      },
      findFirst: async (opts?: any) => {
        const list = await queryHandlers.products.findMany(opts);
        return list[0] || null;
      },
    },
    skus: {
      findMany: async (opts?: any) => {
        let list = (db.skus || []).map((s: any) => ({
          id: s._id || s.id,
          productId: s.product_id || s.productId || "",
          skuCode: s.sku_code || s.skuCode || "",
          barcode: s.barcode || "",
          skuName: s.name || s.skuName || "",
          uom: s.uom || s.unit || "PCS",
          packSize: s.pack_size ?? s.packSize ?? 1,
          basePrice: s.base_price ?? s.basePrice ?? 0,
          status: s.status || "ACTIVE",
          imageUrl: s.imageUrl || s.image_url || "",
          createdAt: s.created_at ? new Date(s.created_at) : new Date(),
          metadata: s.metadata || {},
        }));
        if (opts?.where) {
          list = list.filter((item) => matchItem(item, opts.where));
        }
        return list;
      },
      findFirst: async (opts?: any) => {
        const list = await queryHandlers.skus.findMany(opts);
        return list[0] || null;
      },
    },
    channels: {
      findMany: async (opts?: any) => {
        let list = (db.channels || []).map((c: any) => ({
          id: c._id || c.id,
          channelName: c.channel_name || c.name || "",
          channelCode: c.channel_code || c.code || "",
          status: c.status || "ACTIVE",
          metadata: c.metadata || {},
        }));
        if (opts?.where) {
          list = list.filter((item) => matchItem(item, opts.where));
        }
        return list;
      },
      findFirst: async (opts?: any) => {
        const list = await queryHandlers.channels.findMany(opts);
        return list[0] || null;
      },
    },
    areas: {
      findMany: async (opts?: any) => {
        let list = (db.areas || []).map((a: any) => {
          const office = (db.offices || []).find((o: any) => (o._id || o.id) === a.office_id);
          const regency = (db.regencies || []).find((r: any) => (r._id || r.id) === a.regency_id);
          return {
            id: a._id || a.id,
            areaName: a.area_name || a.name || "",
            areaCode: a.area_code || a.code || "",
            officeId: a.office_id || "",
            regencyId: a.regency_id || "",
            status: a.status || "ACTIVE",
            createdAt: a.created_at ? new Date(a.created_at) : new Date(),
            metadata: a.metadata || {},
            office: office ? { officeName: (office as any).office_name || (office as any).name || "" } : null,
            regency: regency ? { name: regency.name || "" } : null,
          };
        });
        if (opts?.where) {
          list = list.filter((item) => matchItem(item, opts.where));
        }
        return list;
      },
      findFirst: async (opts?: any) => {
        const list = await queryHandlers.areas.findMany(opts);
        return list[0] || null;
      },
    },
    offices: {
      findMany: async (opts?: any) => {
        let list = (db.offices || []).map((o: any) => ({
          id: o._id || o.id,
          officeName: o.office_name || o.name || "",
          officeCode: o.office_code || o.code || "",
          address: o.address || "",
          phone: o.phone || "",
          latitude: o.latitude || 0,
          longitude: o.longitude || 0,
          radiusMeters: o.radius_m || 200,
          status: o.status || "ACTIVE",
          createdAt: o.created_at ? new Date(o.created_at) : new Date(),
        }));
        if (opts?.where) {
          list = list.filter((item) => matchItem(item, opts.where));
        }
        return list;
      },
      findFirst: async (opts?: any) => {
        const list = await queryHandlers.offices.findMany(opts);
        return list[0] || null;
      },
    },
    users: {
      findMany: async (opts?: any) => {
        let list = (db.users || []).map((u: any) => ({
          id: u._id || u.id,
          name: u.name || "",
          email: u.email || "",
          role: u.role || "SALES",
          status: u.status || "ACTIVE",
          phone: u.phone || "",
          officeId: u.office_id || "",
          areaId: u.area_id || "",
          passwordHash: u.password_hash || u.passwordHash || "",
          createdAt: u.created_at ? new Date(u.created_at) : new Date(),
          metadata: u.metadata || {},
        }));
        if (opts?.where) {
          list = list.filter((item) => matchItem(item, opts.where));
        }
        return list;
      },
      findFirst: async (opts?: any) => {
        const list = await queryHandlers.users.findMany(opts);
        return list[0] || null;
      },
    },
    salesmen: {
      findMany: async (opts?: any) => {
        let list = (db.salesmen || []).map((s: any) => ({
          id: s._id || s.id,
          userId: s.user_id || s.userId || s._id || s.id,
          code: s.code || "",
          name: s.name || "",
          email: s.email || "",
          phone: s.phone || "",
          officeId: s.office_id || s.officeId || "",
          areaId: s.area_id || s.areaId || "",
          status: s.status || "ACTIVE",
          targetDailyCalls: s.target_daily_calls || 15,
          targetMonthlySales: s.target_monthly_sales || 50000000,
          createdAt: s.created_at ? new Date(s.created_at) : new Date(),
        }));
        if (opts?.where) {
          list = list.filter((item) => matchItem(item, opts.where));
        }
        return list;
      },
      findFirst: async (opts?: any) => {
        const list = await queryHandlers.salesmen.findMany(opts);
        return list[0] || null;
      },
    },
    outlets: {
      findMany: async (opts?: any) => {
        let list = (db.outlets || []).map((o: any) => ({
          id: o._id || o.id,
          outletName: o.outlet_name || "",
          outletCode: o.outlet_code || "",
          ownerName: o.owner_name || "",
          phone: o.phone || "",
          address: o.address || "",
          latitude: o.latitude || 0,
          longitude: o.longitude || 0,
          areaId: o.area_id || "",
          channelId: o.channel_id || "",
          routeId: o.route_id || "",
          status: o.status || "ACTIVE",
          imageUrl: o.image_url || "",
          notes: o.notes || "",
          createdAt: o.created_at ? new Date(o.created_at) : new Date(),
          metadata: {
            lifecycle_status: o.lifecycle_status || o.status || "PROSPECT",
            completed_transaction_count: o.completed_transaction_count || 0,
            first_completed_transaction_at: o.first_completed_transaction_at || null,
            last_completed_transaction_at: o.last_completed_transaction_at || null,
            total_volume: o.total_volume || 0,
            total_revenue: o.total_revenue || 0,
            ...(o.metadata || {}),
          },
        }));
        if (opts?.where) {
          list = list.filter((item) => matchItem(item, opts.where));
        }
        return list;
      },
      findFirst: async (opts?: any) => {
        const list = await queryHandlers.outlets.findMany(opts);
        return list[0] || null;
      },
    },
    companyProfile: {
      findMany: async () => [await queryHandlers.companyProfile.findFirst()],
      findFirst: async () => {
        const cp = db.company_profile || ({} as any);
        return {
          id: "main",
          companyName: cp.company_name || cp.name || "PT Mahameru Insan Mandiri",
          companyLegalName: cp.legal_name || "PT Mahameru Insan Mandiri",
          companyCode: cp.code || "MIM",
          address: cp.address || "Jl. Raya Tlogomas No. 246, Malang, Jawa Timur",
          phone: cp.phone || "0341-555888",
          email: cp.email || "info@mahameru.id",
          website: cp.website || "https://mahameru.id",
          description: cp.description || "Distributor Utama FMCG Jawa Timur & Nasional",
          logoUrl: cp.logo_url || "",
          createdAt: new Date(),
        };
      },
    },
    systemSettings: {
      findMany: async () => [await queryHandlers.systemSettings.findFirst()],
      findFirst: async () => {
        const s = ((db as any).system_settings && (db as any).system_settings[0]) || ({} as any);
        return {
          id: "global",
          defaultRadiusMeters: s.default_radius_m || 200,
          enforceGpsValidation: s.enforce_gps_validation ?? true,
          allowOfflineMode: false,
          operatingHoursStart: s.operating_hours_start || "08:00",
          operatingHoursEnd: s.operating_hours_end || "17:00",
          maxDiscountPercent: s.max_discount_percent || 15,
          requireSupervisorDiscountApproval: s.require_supervisor_discount_approval ?? true,
          taxPercentage: s.tax_percentage || 11,
          taxEnabled: s.tax_enabled ?? true,
          autoSyncIntervalMinutes: s.auto_sync_interval_minutes || 15,
          createdAt: new Date(),
        };
      },
    },
  };

  const dummyChain: any = {
    where: () => dummyChain,
    limit: () => Promise.resolve([]),
    returning: () => Promise.resolve([]),
    then: (resolve: any) => resolve([]),
    catch: () => Promise.resolve([]),
  };

  const fallback: any = {
    query: new Proxy(queryHandlers, {
      get(target, prop: string) {
        if (target[prop]) return target[prop];
        return {
          findMany: async () => [],
          findFirst: async () => null,
        };
      },
    }),
    select: () => ({
      from: () => ({
        where: () => ({
          limit: () => Promise.resolve([]),
          then: (resolve: any) => resolve([]),
        }),
        limit: () => Promise.resolve([]),
        then: (resolve: any) => resolve([]),
      }),
    }),
    insert: (_table: any) => ({
      values: (val: any) => {
        const retObj = {
          onConflictDoUpdate: (_opts?: any) => retObj,
          onConflictDoNothing: (_opts?: any) => retObj,
          returning: () => Promise.resolve(Array.isArray(val) ? val : [val]),
          then: (resolve: any, reject?: any) => Promise.resolve(Array.isArray(val) ? val : [val]).then(resolve, reject),
          catch: (reject: any) => Promise.resolve([]).catch(reject),
        };
        return retObj;
      },
    }),
    update: (_table: any) => ({
      set: (_val: any) => ({
        where: () => ({
          returning: () => Promise.resolve([]),
          then: (resolve: any) => resolve([]),
          catch: () => Promise.resolve([]),
        }),
        returning: () => Promise.resolve([]),
        then: (resolve: any) => resolve([]),
        catch: () => Promise.resolve([]),
      }),
    }),
    delete: (_table: any) => ({
      where: () => ({
        then: (resolve: any) => resolve([]),
        catch: () => Promise.resolve([]),
      }),
    }),
    transaction: async (cb: any) => {
      return await cb(fallback);
    },
    execute: async () => {
      return { rows: [] };
    },
  };

  return fallback;
}

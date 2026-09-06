import { db } from "../../server/data.js";

/**
 * Fallback in-memory query adapter for Drizzle sqlDb when secondary database is inactive.
 * Connects directly to memory cache synced with Google Cloud Firestore as SSOT.
 */
export function createFallbackSqlDb(): any {
  const queryHandlers: Record<string, {
    findMany: (opts?: any) => Promise<any[]>;
    findFirst: (opts?: any) => Promise<any | null>;
  }> = {
    channels: {
      findMany: async () => {
        return (db.channels || []).map((c: any) => ({
          id: c._id || c.id,
          channelName: c.channel_name || c.name || "",
          channelCode: c.channel_code || c.code || "",
          status: c.status || "ACTIVE",
          metadata: c.metadata || {},
        }));
      },
      findFirst: async () => {
        const list = await queryHandlers.channels.findMany();
        return list[0] || null;
      },
    },
    areas: {
      findMany: async () => {
        return (db.areas || []).map((a: any) => {
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
      },
      findFirst: async () => {
        const list = await queryHandlers.areas.findMany();
        return list[0] || null;
      },
    },
    offices: {
      findMany: async () => {
        return (db.offices || []).map((o: any) => ({
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
      },
      findFirst: async () => {
        const list = await queryHandlers.offices.findMany();
        return list[0] || null;
      },
    },
    users: {
      findMany: async () => {
        return (db.users || []).map((u: any) => ({
          id: u._id || u.id,
          name: u.name || "",
          email: u.email || "",
          role: u.role || "SALES",
          status: u.status || "ACTIVE",
          phone: u.phone || "",
          officeId: u.office_id || "",
          areaId: u.area_id || "",
          createdAt: u.created_at ? new Date(u.created_at) : new Date(),
          metadata: u.metadata || {},
        }));
      },
      findFirst: async () => {
        const list = await queryHandlers.users.findMany();
        return list[0] || null;
      },
    },
    outlets: {
      findMany: async () => {
        return (db.outlets || []).map((o: any) => ({
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
      },
      findFirst: async () => {
        const list = await queryHandlers.outlets.findMany();
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

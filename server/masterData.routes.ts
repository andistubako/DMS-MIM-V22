import { Router, Response } from "express";
import {
  authMiddleware,
  requireRoles,
  AuthenticatedRequest,
} from "./auth.js";
import {
  getMasterItems,
  createMasterItem,
  updateMasterItem,
  deleteMasterItem,
  getSystemSettingsFromFirestore,
  updateSystemSettingsInFirestore,
  getCompanyProfileFromFirestore,
  updateCompanyProfileInFirestore,
} from "./masterData.service.js";
import { db } from "./data.js";
import { recordAuditLog } from "./routes.js";

const router = Router();

// ================= HIERARKI WILAYAH BPS =================
router.get("/provinces", authMiddleware, async (req, res) => {
  try {
    const result = await getMasterItems("provinces", req.query);
    res.json(result || { items: [], total: 0 });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

router.get("/regencies", authMiddleware, async (req, res) => {
  try {
    const result = await getMasterItems("regencies", req.query);
    res.json(result || { items: [], total: 0 });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

router.get("/districts", authMiddleware, async (req, res) => {
  try {
    const result = await getMasterItems("districts", req.query);
    res.json(result || { items: [], total: 0 });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

router.get("/villages", authMiddleware, async (req, res) => {
  try {
    const result = await getMasterItems("villages", req.query);
    res.json(result || { items: [], total: 0 });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

// ================= OFFICES / KANTOR CABANG & DEPO =================
router.get("/offices", authMiddleware, async (req, res) => {
  try {
    const result = await getMasterItems("offices", req.query);
    res.json(result || { items: [], total: 0 });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

router.post("/offices", authMiddleware, requireRoles("ADMIN", "OWNER"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const item = await createMasterItem("offices", req.body);
    recordAuditLog(req.user!._id || req.user!.id!, "CREATE_OFFICE", "offices", item._id, { name: item.office_name });
    res.status(201).json(item);
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

router.put("/offices/:id", authMiddleware, requireRoles("ADMIN", "OWNER"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const item = await updateMasterItem("offices", req.params.id, req.body);
    recordAuditLog(req.user!._id || req.user!.id!, "UPDATE_OFFICE", "offices", req.params.id, req.body);
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

router.post("/offices/:id/toggle", authMiddleware, requireRoles("ADMIN", "OWNER"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const existing = db.offices.find((o: any) => o._id === req.params.id || o.id === req.params.id);
    const newStatus = existing?.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const item = await updateMasterItem("offices", req.params.id, { status: newStatus });
    recordAuditLog(req.user!._id || req.user!.id!, "TOGGLE_OFFICE", "offices", req.params.id, { status: newStatus });
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

router.delete("/offices/:id", authMiddleware, requireRoles("ADMIN", "OWNER"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    await deleteMasterItem("offices", req.params.id);
    recordAuditLog(req.user!._id || req.user!.id!, "DELETE_OFFICE", "offices", req.params.id, {});
    res.json({ message: "Kantor berhasil dihapus.", _id: req.params.id });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

// ================= AREAS =================
router.get("/areas", authMiddleware, async (req, res) => {
  try {
    const result = await getMasterItems("areas", req.query);
    res.json(result || { items: [], total: 0 });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

// ================= CHANNELS =================
router.get("/channels", authMiddleware, async (req, res) => {
  try {
    const result = await getMasterItems("channels", req.query);
    res.json(result || { items: [], total: 0 });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

// ================= ROUTES =================
router.get("/routes", authMiddleware, async (req, res) => {
  try {
    const result = await getMasterItems("routes", req.query);
    res.json(result || { items: [], total: 0 });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

// ================= PRODUCTS & SKUS =================
router.get("/products", authMiddleware, async (req, res) => {
  try {
    const result = await getMasterItems("products", req.query);
    res.json(result || { items: [], total: 0 });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

router.get("/skus", authMiddleware, async (req, res) => {
  try {
    const result = await getMasterItems("skus", req.query);
    res.json(result || { items: [], total: 0 });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

router.get("/prices", authMiddleware, async (req, res) => {
  try {
    const result = await getMasterItems("prices", req.query);
    res.json(result || { items: [], total: 0 });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

router.get("/promos", authMiddleware, async (req, res) => {
  try {
    const result = await getMasterItems("promos", req.query);
    res.json(result || { items: [], total: 0 });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

router.get("/open_call_reasons", authMiddleware, async (req, res) => {
  try {
    const result = await getMasterItems("open-call-reasons", req.query);
    res.json(result || { items: [], total: 0 });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

// ================= GENERIC /masters/:entity CRUD =================
router.get("/masters/:entity", authMiddleware, async (req, res) => {
  try {
    const result = await getMasterItems(req.params.entity, req.query);
    if (!result) {
      return res.status(404).json({ detail: `Entitas '${req.params.entity}' tidak ditemukan.` });
    }
    res.json(result);
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

router.post("/masters/:entity", authMiddleware, requireRoles("ADMIN", "OWNER"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const item = await createMasterItem(req.params.entity, req.body);
    recordAuditLog(req.user!._id || req.user!.id!, "CREATE_MASTER_ITEM", req.params.entity, item._id, {
      name: item.name || item.sku_code || item.office_name || item.code,
    });
    res.status(201).json(item);
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

router.put("/masters/:entity/:id", authMiddleware, requireRoles("ADMIN", "OWNER"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const item = await updateMasterItem(req.params.entity, req.params.id, req.body);
    recordAuditLog(req.user!._id || req.user!.id!, "UPDATE_MASTER_ITEM", req.params.entity, req.params.id, req.body);
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

router.post("/masters/:entity/:id/toggle", authMiddleware, requireRoles("ADMIN", "OWNER"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    // Find current status from getMasterItems
    const result = await getMasterItems(req.params.entity, {});
    const existing = result?.items.find((x: any) => x._id === req.params.id || x.id === req.params.id);
    const newStatus = existing?.status === "ACTIVE" ? "INACTIVE" : "ACTIVE";
    const item = await updateMasterItem(req.params.entity, req.params.id, { status: newStatus });
    recordAuditLog(req.user!._id || req.user!.id!, "TOGGLE_MASTER_STATUS", req.params.entity, req.params.id, { status: newStatus });
    res.json(item);
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

router.delete("/masters/:entity/:id", authMiddleware, requireRoles("ADMIN", "OWNER"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    await deleteMasterItem(req.params.entity, req.params.id);
    recordAuditLog(req.user!._id || req.user!.id!, "DELETE_MASTER_ITEM", req.params.entity, req.params.id, {});
    res.json({ message: "Data berhasil dihapus.", _id: req.params.id });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

// ================= SYSTEM SETTINGS & COMPANY PROFILE =================
router.get("/settings", authMiddleware, async (req, res) => {
  try {
    const settings = await getSystemSettingsFromFirestore();
    res.json({ settings, ...settings });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

router.get("/settings/public", async (req, res) => {
  try {
    const prof = await getCompanyProfileFromFirestore();
    const settings = await getSystemSettingsFromFirestore();
    res.json({
      company_name: prof.companyName || prof.name || settings.company_name || "PT Mahameru Insan Mandiri",
      company_legal_name: prof.companyLegalName || prof.legal_name || "PT Mahameru Insan Mandiri",
      company_code: prof.companyCode || prof.code || "MHM",
      company_address: prof.address || prof.companyAddress || settings.office_address,
      company_phone: prof.phone || prof.companyPhone || settings.company_phone,
      company_email: prof.email || prof.companyEmail || settings.company_email,
      company_website: prof.website || prof.companyWebsite || "https://mahameru.id",
      company_description: prof.description || prof.companyDescription || "Distributor FMCG & Consumer Goods",
      logo_url: prof.logoUrl || prof.logo_url || "/logo.png",
      currency_symbol: settings.currency_symbol || "Rp",
    });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

router.put("/settings", authMiddleware, requireRoles("ADMIN", "OWNER"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = await updateSystemSettingsInFirestore(req.body, req.user!._id || req.user!.id!);
    recordAuditLog(req.user!._id || req.user!.id!, "UPDATE_SETTINGS", "system_settings", "global", req.body);
    res.json({ message: "Pengaturan berhasil diperbarui.", settings: updated });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

router.post("/settings/reset-defaults", authMiddleware, requireRoles("ADMIN", "OWNER"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const defaultSettings = {
      theme: "light",
      currency_symbol: "Rp",
      language: "id",
      app_name: "Mahameru DMS",
      sidebar_collapsed: false,
      enable_gps_tracking: true,
      require_photo_checkin: true,
      max_visit_distance_m: 500,
      auto_approve_orders: false,
      default_tax_rate: 11,
      allow_backdated_transactions: false,
      notify_on_new_order: true,
      inventory_warning_level: 20,
    };
    const updated = await updateSystemSettingsInFirestore(defaultSettings, req.user!._id || req.user!.id!);
    recordAuditLog(req.user!._id || req.user!.id!, "RESET_SETTINGS", "system_settings", "global", {});
    res.json({ message: "Pengaturan berhasil di-reset.", settings: updated });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

router.get("/company-profile", async (req, res) => {
  try {
    const profile = await getCompanyProfileFromFirestore();
    res.json(profile);
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

router.get("/settings/company", async (req, res) => {
  try {
    const profile = await getCompanyProfileFromFirestore();
    res.json(profile);
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

router.put("/company-profile", authMiddleware, requireRoles("OWNER", "ADMIN"), async (req: AuthenticatedRequest, res: Response) => {
  try {
    const updated = await updateCompanyProfileInFirestore(req.body, req.user!._id || req.user!.id!);
    recordAuditLog(req.user!._id || req.user!.id!, "UPDATE_COMPANY_PROFILE", "companies", "main", req.body);
    res.json({ message: "Profil perusahaan berhasil diperbarui.", profile: updated });
  } catch (err: any) {
    res.status(500).json({ detail: err.message });
  }
});

export default router;

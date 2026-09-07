import { Router } from "express";
import { authMiddleware, AuthenticatedRequest } from "./auth.js";
import { processVisitCheckIn, processVisitCheckOut } from "./domains/visits.domain.js";
import { db } from "./data.js";
import { syncSingleDoc } from "./persistence.js";

const router = Router();

/**
 * Canonical visit creation / check-in. All business-critical validation is performed against Firestore SSOT.
 * Enforces 150m geofence and anti-mock GPS.
 */
router.post("/", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const salesmanId = req.user?.role === "SALES" ? req.user._id : String(req.body?.salesman_id || req.user!._id);
    const outletId = String(req.body?.outlet_id || "").trim();
    const callPlanId = req.body?.call_plan_id ? String(req.body.call_plan_id).trim() : undefined;
    const latitude = Number(req.body?.check_in_lat ?? req.body?.latitude ?? 0);
    const longitude = Number(req.body?.check_in_lng ?? req.body?.longitude ?? 0);
    const accuracy = Number(req.body?.check_in_accuracy ?? req.body?.accuracy ?? 0);
    const isMock = Boolean(req.body?.mock_location || req.body?.is_mock);

    if (!outletId) {
      return res.status(400).json({ success: false, message: "outlet_id wajib diisi." });
    }

    const result = await processVisitCheckIn({
      salesmanId,
      outletId,
      callPlanId,
      latitude,
      longitude,
      accuracy,
      isMockLocation: isMock,
      photoUrl: req.body?.check_in_photo || req.body?.photo_url || "",
      notes: req.body?.notes || "",
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Mirror to in-memory db for instant query performance
    const newVisit = {
      _id: result.visitId,
      id: result.visitId,
      salesman_id: salesmanId,
      outlet_id: outletId,
      call_plan_id: callPlanId || null,
      check_in_time: new Date().toISOString(),
      latitude,
      longitude,
      check_in_lat: latitude,
      check_in_lng: longitude,
      distance_meters: result.distanceMeters,
      status: "IN_PROGRESS",
      call_result: "OPEN",
      duration_seconds: 0,
    };
    if (!Array.isArray(db.visits)) db.visits = [];
    db.visits.push(newVisit as any);

    return res.status(201).json({
      success: true,
      message: result.message,
      data: newVisit,
      visitId: result.visitId,
    });
  } catch (error: any) {
    console.error("[Canonical Visit Check-In Error]", error);
    return res.status(500).json({ success: false, message: error?.message || "Gagal mencatat visit." });
  }
});

/**
 * Canonical visit check-out. Enforces server-side minimum duration (180s) and determines EC vs Open.
 */
router.post("/check-out", authMiddleware, async (req: AuthenticatedRequest, res) => {
  try {
    const salesmanId = req.user?.role === "SALES" ? req.user._id : String(req.body?.salesman_id || req.user!._id);
    const visitId = String(req.body?.visit_id || req.body?.id || "").trim();
    const latitude = Number(req.body?.check_out_lat ?? req.body?.latitude ?? 0);
    const longitude = Number(req.body?.check_out_lng ?? req.body?.longitude ?? 0);
    const notes = String(req.body?.notes || "");

    if (!visitId) {
      return res.status(400).json({ success: false, message: "visit_id wajib diisi." });
    }

    const result = await processVisitCheckOut({
      visitId,
      salesmanId,
      latitude,
      longitude,
      notes,
    });

    if (!result.success) {
      return res.status(400).json(result);
    }

    // Update in-memory db
    const existing = (db.visits || []).find((v: any) => (v._id || v.id) === visitId);
    if (existing) {
      existing.status = "COMPLETED";
      existing.call_result = result.callResult;
      existing.duration_seconds = result.durationSeconds;
      existing.check_out_time = new Date().toISOString();
      await syncSingleDoc("visits", visitId, existing);
    }

    return res.json({
      success: true,
      message: result.message,
      data: {
        visit_id: visitId,
        duration_seconds: result.durationSeconds,
        call_result: result.callResult,
        status: "COMPLETED",
      },
    });
  } catch (error: any) {
    console.error("[Canonical Visit Check-Out Error]", error);
    return res.status(500).json({ success: false, message: error?.message || "Gagal checkout visit." });
  }
});

export default router;

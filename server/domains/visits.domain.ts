import { collection, query, where, getDocs, addDoc, doc, updateDoc, getDoc } from "firebase/firestore";
import { firestoreDb } from "../firebase.js";
import { haversineMeters } from "../geo.js";

export interface VisitCheckInInput {
  salesmanId: string;
  outletId: string;
  callPlanId?: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  isMockLocation?: boolean;
  photoUrl?: string;
  notes?: string;
}

export interface VisitCheckOutInput {
  visitId: string;
  salesmanId: string;
  latitude: number;
  longitude: number;
  notes?: string;
}

const OUTLET_GEOFENCE_RADIUS_METERS = 150; // Canonical
const MIN_VISIT_DURATION_SECONDS = 180; // Canonical: 180 seconds (3 minutes)

export async function processVisitCheckIn(input: VisitCheckInInput) {
  const { salesmanId, outletId, callPlanId, latitude, longitude, accuracy = 0, isMockLocation = false, photoUrl = "", notes = "" } = input;

  // 1. Anti-Mock GPS
  if (isMockLocation) {
    return {
      success: false,
      message: "Check-in kunjungan ditolak: Terdeteksi Fake / Mock GPS.",
    };
  }

  // 2. Fetch Outlet Location
  const outletSnap = await getDoc(doc(firestoreDb, "outlets", outletId));
  if (!outletSnap.exists()) {
    return {
      success: false,
      message: "Outlet tidak ditemukan dalam master data.",
    };
  }
  const outletData = outletSnap.data();
  const outletLat = Number(outletData.latitude || 0);
  const outletLng = Number(outletData.longitude || 0);

  // 3. Verify Geofence (150m)
  const distance = haversineMeters(latitude, longitude, outletLat, outletLng);
  if (outletLat !== 0 && outletLng !== 0 && distance > OUTLET_GEOFENCE_RADIUS_METERS) {
    return {
      success: false,
      distanceMeters: distance,
      message: `Check-in ditolak: Anda berada ${distance}m dari outlet (Batas toleransi maksimal ${OUTLET_GEOFENCE_RADIUS_METERS}m).`,
    };
  }

  // 4. Create Visit Document (IN_PROGRESS)
  const now = new Date();
  const visitsRef = collection(firestoreDb, "visits");
  const visitDoc = await addDoc(visitsRef, {
    salesman_id: salesmanId,
    outlet_id: outletId,
    call_plan_id: callPlanId || null,
    check_in_time: now.toISOString(),
    check_in_latitude: latitude,
    check_in_longitude: longitude,
    check_in_accuracy: accuracy,
    distance_meters: distance,
    photo_url: photoUrl,
    notes,
    status: "IN_PROGRESS",
    call_result: "OPEN", // Default until transaction occurs
    duration_seconds: 0,
    created_at: now.toISOString(),
  });

  return {
    success: true,
    visitId: visitDoc.id,
    distanceMeters: distance,
    message: `Check-in kunjungan berhasil (${distance}m dari outlet).`,
  };
}

export async function processVisitCheckOut(input: VisitCheckOutInput) {
  const { visitId, salesmanId, notes = "" } = input;

  const visitRef = doc(firestoreDb, "visits", visitId);
  const visitSnap = await getDoc(visitRef);
  if (!visitSnap.exists()) {
    return {
      success: false,
      message: "Data kunjungan tidak ditemukan.",
    };
  }

  const visit = visitSnap.data();
  if (visit.salesman_id !== salesmanId) {
    return {
      success: false,
      message: "Akses ditolak: Kunjungan ini milik salesman lain.",
    };
  }

  if (visit.status === "COMPLETED") {
    return {
      success: true,
      durationSeconds: visit.duration_seconds,
      callResult: visit.call_result,
      message: "Kunjungan sudah selesai sebelumnya.",
    };
  }

  const now = new Date();
  const checkInTime = new Date(visit.check_in_time).getTime();
  const durationSeconds = Math.max(0, Math.floor((now.getTime() - checkInTime) / 1000));

  // Server-Enforced Minimum Duration
  if (durationSeconds < MIN_VISIT_DURATION_SECONDS) {
    const remaining = MIN_VISIT_DURATION_SECONDS - durationSeconds;
    return {
      success: false,
      durationSeconds,
      remainingSeconds: remaining,
      message: `Check-out belum diizinkan: Durasi kunjungan minimal 180 detik (3 menit). Waktu berjalan: ${durationSeconds} detik (kurang ${remaining} detik).`,
    };
  }

  // Check if any completed transaction was linked to this visit
  const txnsRef = collection(firestoreDb, "transactions");
  const q = query(txnsRef, where("visit_id", "==", visitId));
  const txSnap = await getDocs(q);
  const hasValidTransaction = !txSnap.empty;

  const callResult = hasValidTransaction ? "EFFECTIVE" : "OPEN";

  await updateDoc(visitRef, {
    check_out_time: now.toISOString(),
    duration_seconds: durationSeconds,
    status: "COMPLETED",
    call_result: callResult,
    closing_notes: notes,
    updated_at: now.toISOString(),
  });

  return {
    success: true,
    visitId,
    durationSeconds,
    callResult,
    message: `Kunjungan berhasil diselesaikan (${durationSeconds} detik, Hasil: ${callResult}).`,
  };
}

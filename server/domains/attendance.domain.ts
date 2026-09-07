import { collection, query, where, getDocs, addDoc, doc, updateDoc, getDoc } from "firebase/firestore";
import { firestoreDb } from "../firebase.js";
import { haversineMeters } from "../geo.js";

export interface AttendanceCheckInInput {
  userId: string;
  officeId: string;
  latitude: number;
  longitude: number;
  accuracy?: number;
  isMockLocation?: boolean;
  photoUrl?: string;
  notes?: string;
}

export interface AttendanceCheckInResult {
  success: boolean;
  attendanceId?: string;
  distanceMeters: number;
  withinGeofence: boolean;
  message: string;
}

const OFFICE_GEOFENCE_RADIUS_METERS = 200; // Canonical
const GPS_ACCURACY_LIMIT_METERS = 50; // Canonical
const TIMEZONE = "Asia/Jakarta";

export async function processAttendanceCheckIn(input: AttendanceCheckInInput): Promise<AttendanceCheckInResult> {
  const { userId, officeId, latitude, longitude, accuracy = 0, isMockLocation = false, photoUrl = "", notes = "" } = input;

  // 1. Mock GPS Check
  if (isMockLocation) {
    return {
      success: false,
      distanceMeters: 0,
      withinGeofence: false,
      message: "Presensi ditolak: Terdeteksi penggunaan Fake / Mock GPS.",
    };
  }

  // 2. GPS Accuracy Limit Check
  if (accuracy > GPS_ACCURACY_LIMIT_METERS) {
    return {
      success: false,
      distanceMeters: 0,
      withinGeofence: false,
      message: `Presensi ditolak: Akurasi GPS (${Math.round(accuracy)}m) melebihi batas toleransi maksimal ${GPS_ACCURACY_LIMIT_METERS}m. Mohon cari tempat terbuka.`,
    };
  }

  // 3. Resolve Office Coordinates
  let officeLat = -6.2088; // Default fallback HQ Jakarta
  let officeLng = 106.8456;
  let allowedRadius = OFFICE_GEOFENCE_RADIUS_METERS;

  try {
    const officeDoc = await getDoc(doc(firestoreDb, "offices", officeId));
    if (officeDoc.exists()) {
      const data = officeDoc.data();
      officeLat = Number(data.latitude || officeLat);
      officeLng = Number(data.longitude || officeLng);
      allowedRadius = Number(data.geofence_radius || data.radius || OFFICE_GEOFENCE_RADIUS_METERS);
    }
  } catch (err) {
    console.warn("[Attendance] Failed to fetch office doc, using default HQ coords:", err);
  }

  // 4. Calculate Haversine Distance Server-Side
  const distanceMeters = haversineMeters(latitude, longitude, officeLat, officeLng);
  const withinGeofence = distanceMeters <= allowedRadius;

  if (!withinGeofence) {
    return {
      success: false,
      distanceMeters,
      withinGeofence: false,
      message: `Presensi ditolak: Anda berada di luar radius kantor (${distanceMeters}m dari kantor, batas toleransi ${allowedRadius}m).`,
    };
  }

  // 5. Prevent Duplicate Check-In on the same day
  const todayStr = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE }).format(new Date());
  const attRef = collection(firestoreDb, "attendance");
  const duplicateQuery = query(
    attRef,
    where("user_id", "==", userId),
    where("date", "==", todayStr)
  );
  const existingDocs = await getDocs(duplicateQuery);
  if (!existingDocs.empty) {
    return {
      success: false,
      distanceMeters,
      withinGeofence: true,
      message: `Anda sudah melakukan check-in presensi hari ini (${todayStr}).`,
    };
  }

  // 6. Record Attendance Document in Firestore
  const now = new Date();
  const record = {
    user_id: userId,
    office_id: officeId,
    date: todayStr,
    check_in_time: now.toISOString(),
    check_in_latitude: latitude,
    check_in_longitude: longitude,
    check_in_accuracy: accuracy,
    check_in_distance_meters: distanceMeters,
    check_in_photo_url: photoUrl,
    status: "PRESENT",
    notes,
    created_at: now.toISOString(),
  };

  const docRef = await addDoc(attRef, record);

  return {
    success: true,
    attendanceId: docRef.id,
    distanceMeters,
    withinGeofence: true,
    message: `Presensi berhasil tercatat. Jarak ke kantor: ${distanceMeters}m.`,
  };
}

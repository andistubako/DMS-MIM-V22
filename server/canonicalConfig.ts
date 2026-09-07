import { doc, getDoc, setDoc } from "firebase/firestore";
import { firestoreDb } from "./firebase.js";

export interface CanonicalSystemConfig {
  office_radius_meters: number;
  outlet_radius_meters: number;
  min_visit_duration_seconds: number;
  gps_accuracy_limit_meters: number;
  mock_gps_policy: "REJECT" | "WARN";
  dormant_threshold_days: number;
  noo_approval_mode: "MANUAL" | "AUTO";
  tax_percentage: number;
  timezone: string;
}

export const CANONICAL_CONFIG: CanonicalSystemConfig = {
  office_radius_meters: 200,
  outlet_radius_meters: 150,
  min_visit_duration_seconds: 180,
  gps_accuracy_limit_meters: 50,
  mock_gps_policy: "REJECT",
  dormant_threshold_days: 56,
  noo_approval_mode: "MANUAL",
  tax_percentage: 0.11,
  timezone: "Asia/Jakarta",
};

/**
 * Ensures system_settings/config document contains authoritative canonical values.
 */
export async function bootstrapCanonicalConfig() {
  try {
    const configRef = doc(firestoreDb, "system_settings", "config");
    const snap = await getDoc(configRef);
    if (!snap.exists()) {
      await setDoc(configRef, {
        ...CANONICAL_CONFIG,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      console.log("[Config] Bootstrapped canonical system_settings/config");
    } else {
      // Ensure canonical fields are up-to-date
      await setDoc(configRef, CANONICAL_CONFIG, { merge: true });
    }
  } catch (err) {
    console.warn("[Config] Non-blocking warning during config bootstrap:", err);
  }
}

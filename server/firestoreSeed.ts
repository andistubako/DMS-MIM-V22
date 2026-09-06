import { firestoreDb } from "./firebase.js";
import {
  collection,
  doc,
  getDocs,
  setDoc,
  writeBatch,
  query,
  limit,
} from "firebase/firestore";
import bcrypt from "bcryptjs";

const now = new Date().toISOString();
const hash = (pw: string) => bcrypt.hashSync(pw, 10);

export const defaultV22Users = [
  {
    _id: "usr-owner",
    id: "usr-owner",
    name: "Andi Moch Solihin",
    email: "andismochsolihin@gmail.com",
    password_hash: hash("owner123"),
    role: "OWNER",
    phone: "081122334455",
    status: "ACTIVE",
    created_at: now,
  },
  {
    _id: "usr-owner-dina",
    id: "usr-owner-dina",
    name: "Dina Sapitri",
    email: "dinasapitri9001@gmail.com",
    password_hash: hash("owner123"),
    role: "OWNER",
    phone: "081122334455",
    status: "ACTIVE",
    created_at: now,
  },
  {
    _id: "usr-admin",
    id: "usr-admin",
    name: "Super Administrator",
    email: "admin@mahameru.id",
    password_hash: hash("admin123"),
    role: "ADMIN",
    phone: "081234567890",
    status: "ACTIVE",
    created_at: now,
  },
  {
    _id: "usr-spv",
    id: "usr-spv",
    name: "Budi Santoso (Supervisor)",
    email: "spv@mahameru.id",
    password_hash: hash("spv123"),
    role: "SUPERVISOR",
    phone: "081298765432",
    status: "ACTIVE",
    created_at: now,
  },
  {
    _id: "usr-sales1",
    id: "usr-sales1",
    name: "Rian Hidayat (Salesman)",
    email: "sales1@mahameru.id",
    password_hash: hash("sales123"),
    role: "SALES",
    phone: "081311223344",
    status: "ACTIVE",
    created_at: now,
  },
  {
    _id: "usr-warehouse",
    id: "usr-warehouse",
    name: "Dedi Supriyadi (Gudang)",
    email: "gudang@mahameru.id",
    password_hash: hash("gudang123"),
    role: "WAREHOUSE",
    phone: "081399887766",
    status: "ACTIVE",
    created_at: now,
  },
];

export async function seedFirestoreInitialData() {
  console.log("Checking Firestore initial seed...");
  try {
    const usersSnap = await getDocs(
      query(collection(firestoreDb, "users"), limit(1))
    );

    if (usersSnap.empty) {
      console.log("Seeding default users to Cloud Firestore...");
      const batch = writeBatch(firestoreDb);
      for (const u of defaultV22Users) {
        batch.set(doc(firestoreDb, "users", u._id), u);
      }

      // Seed default company profile
      batch.set(doc(firestoreDb, "companies", "default"), {
        _id: "default",
        companyId: "default",
        companyName: "PT Mahameru Insan Mandiri",
        companyLegalName: "PT Mahameru Insan Mandiri",
        companyCode: "MHM",
        address: "Jl. Tebet Barat Dalam Raya No. 12, Jakarta Selatan 12810",
        companyAddress: "Jl. Tebet Barat Dalam Raya No. 12, Jakarta Selatan 12810",
        phone: "0812-3456-7890",
        companyPhone: "0812-3456-7890",
        email: "info@mahameru.id",
        companyEmail: "info@mahameru.id",
        website: "https://mahameru.id",
        companyWebsite: "https://mahameru.id",
        description: "Distributor FMCG & Consumer Goods",
        companyDescription: "Distributor FMCG & Consumer Goods",
        createdAt: now,
        updatedAt: now,
        updatedBy: "usr-owner",
      });

      // Seed system settings
      batch.set(doc(firestoreDb, "system_settings", "default"), {
        _id: "default",
        company_name: "PT Mahameru Insan Mandiri",
        office_address: "Jl. Tebet Barat Dalam Raya No. 12, Jakarta Selatan 12810",
        office_name: "Kantor Pusat Mahameru",
        company_phone: "0812-3456-7890",
        company_email: "info@mahameru.id",
        currency_symbol: "Rp",
        office_latitude: -6.2383,
        office_longitude: 106.8525,
        office_radius_m: 100,
        max_geofence_m: 150,
        outlet_radius_m: 150,
        enforce_office_geofence: true,
        enforce_outlet_geofence: true,
        allow_fake_gps: false,
        allow_early_checkout: false,
        check_in_start: "07:30",
        check_out_start: "16:30",
        late_tolerance_min: 15,
        visit_min_duration_sec: 60,
        auto_approve_outlets: true,
        default_credit_limit: 10000000,
        default_payment_term_days: 14,
        updatedAt: now,
      });

      // Seed default office
      batch.set(doc(firestoreDb, "offices", "off-1"), {
        _id: "off-1",
        office_code: "JKT-01",
        office_name: "Kantor Pusat & Gudang Jakarta",
        address: "Jl. Tebet Barat Dalam Raya No. 12, Tebet, Jakarta Selatan 12810",
        latitude: -6.2383,
        longitude: 106.8525,
        radius_m: 100,
        status: "ACTIVE",
        created_at: now,
      });

      // Seed standard open call reasons
      const reasons = [
        { _id: "ocr-1", code: "OCR-01", description: "Toko Tutup", status: "ACTIVE", created_at: now },
        { _id: "ocr-2", code: "OCR-02", description: "Pemilik/Pengambil Keputusan Tidak di Tempat", status: "ACTIVE", created_at: now },
        { _id: "ocr-3", code: "OCR-03", description: "Stok Masih Cukup / Belum Butuh", status: "ACTIVE", created_at: now },
        { _id: "ocr-4", code: "OCR-04", description: "Uang Kas Belum Ada / Toko Sepi", status: "ACTIVE", created_at: now },
        { _id: "ocr-5", code: "OCR-05", description: "Ada Tagihan Jatuh Tempo Belum Lunas", status: "ACTIVE", created_at: now },
      ];
      for (const r of reasons) {
        batch.set(doc(firestoreDb, "open_call_reasons", r._id), r);
      }

      await batch.commit();
      console.log("Default users, company, settings, and offices seeded to Firestore successfully.");
    } else {
      console.log("Firestore already seeded with users.");
    }
  } catch (err) {
    console.error("Error during Firestore seeding:", err);
  }
}

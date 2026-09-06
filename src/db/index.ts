import type { Pool } from 'pg';
import { createFallbackSqlDb } from './fallbackDb.js';

console.log("[DB] Cloud SQL & PostgreSQL Database telah dihapus. Sistem beroperasi 100% menggunakan Google Cloud Firestore (Single Source of Truth).");

// Dummy safe pool for any legacy typing references
export const pool = {
  connect: async () => {
    throw new Error("Cloud SQL & PostgreSQL telah dihapus. Sistem menggunakan Google Cloud Firestore.");
  },
  query: async () => {
    throw new Error("Cloud SQL & PostgreSQL telah dihapus. Sistem menggunakan Google Cloud Firestore.");
  },
  on: () => {},
  end: async () => {},
} as unknown as Pool;

export const sqlDb = createFallbackSqlDb();
export type DbClient = typeof sqlDb;


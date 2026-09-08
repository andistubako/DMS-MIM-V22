import { firestoreDb, auth } from '../../server/firebase.js';
import { createFirestoreDbAdapter } from './firestoreDbAdapter.js';

console.log("[DB] Sistem beroperasi 100% menggunakan Google Cloud Firestore sebagai Single Source of Truth (SSOT).");

/** Official Firestore instance & Auth exported for application-wide SSOT access */
export { firestoreDb, auth };
export const db = firestoreDb;
export const firestore = firestoreDb;

/**
 * Firestore Database Adapter
 * Provides compatible fluent interface over Google Cloud Firestore
 * without any relational SQL pools, Drizzle ORM, or background PostgreSQL drivers.
 */
export const sqlDb = createFirestoreDbAdapter();
export type DbClient = typeof sqlDb;

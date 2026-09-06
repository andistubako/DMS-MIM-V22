import { firestoreDb } from "./firebase.js";
import {
  collection,
  doc,
  getDocs,
  writeBatch,
  query,
  limit,
} from "firebase/firestore";
import { db } from "./data.js";

const now = new Date().toISOString();
const currentPeriod = now.slice(0, 7); // YYYY-MM
const today = now.slice(0, 10);

export const defaultTargets: any[] = [];
export const defaultReceivables: any[] = [];
export const defaultCashDeposits: any[] = [];
export const defaultDailyReconciliations: any[] = [];

export async function seedFinancialsToFirestore() {
  console.log("[Financials] Operating in clean production mode. No dummy targets or receivables seeded.");
}

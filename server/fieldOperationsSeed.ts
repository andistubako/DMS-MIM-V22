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
const today = now.slice(0, 10);

export const defaultCallPlans: any[] = [];
export const defaultCallPlanItems: any[] = [];

export async function seedFieldOperationsToFirestore() {
  console.log("[FieldOps] Operating in clean production mode. No dummy call plans seeded.");
}

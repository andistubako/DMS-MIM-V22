import { doc, getDoc, setDoc } from "firebase/firestore";
import { firestoreDb } from "./firebase.js";

export async function checkFirestoreIdempotency(key: string | undefined): Promise<{ isDuplicate: boolean; cachedResponse?: any }> {
  if (!key) return { isDuplicate: false };
  try {
    const snap = await getDoc(doc(firestoreDb, "idempotency_keys", key));
    if (snap.exists()) {
      const data = snap.data();
      return {
        isDuplicate: true,
        cachedResponse: data.response_payload || data.response || data,
      };
    }
  } catch (err) {
    console.warn("[Idempotency] Warning reading idempotency key from Firestore:", err);
  }
  return { isDuplicate: false };
}

export async function recordFirestoreIdempotency(key: string | undefined, response: any, resourceId?: string) {
  if (!key) return;
  try {
    await setDoc(doc(firestoreDb, "idempotency_keys", key), {
      idempotency_key: key,
      resource_id: resourceId || null,
      response_payload: response,
      created_at: new Date().toISOString(),
      expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
    });
  } catch (err) {
    console.warn("[Idempotency] Warning persisting idempotency key to Firestore:", err);
  }
}

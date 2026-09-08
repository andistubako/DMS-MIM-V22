import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, getFirestore, setLogLevel } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import firebaseConfig from "../firebase-applet-config.json";

// Configure Firestore log level to 'error' to suppress internal SDK existence-filter bloom filter warnings
setLogLevel("error");

// Filter out internal harmless Firestore SDK BloomFilter fallback notices
const originalWarn = console.warn;
console.warn = function (...args: any[]) {
  const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
  if (msg.includes("BloomFilter error") || msg.includes("BloomFilterError")) {
    return;
  }
  originalWarn.apply(console, args);
};

const originalError = console.error;
console.error = function (...args: any[]) {
  const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
  if (msg.includes("BloomFilter error") || msg.includes("BloomFilterError")) {
    return;
  }
  originalError.apply(console, args);
};

const isNode =
  typeof process !== "undefined" &&
  process.versions != null &&
  process.versions.node != null;

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);

// In Node.js / container environment, gRPC fetch streams can hang or be blocked;
// experimentalForceLongPolling ensures instant, stable HTTP-based Firestore operations.
export const firestoreDb = isNode
  ? initializeFirestore(
      app,
      {
        experimentalForceLongPolling: true,
      },
      firebaseConfig.firestoreDatabaseId || "(default)"
    )
  : getFirestore(
      app,
      firebaseConfig.firestoreDatabaseId || "(default)"
    );

export default app;

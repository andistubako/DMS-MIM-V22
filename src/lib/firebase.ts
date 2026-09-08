import { initializeApp, getApps, getApp } from "firebase/app";
import { getFirestore, setLogLevel } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import firebaseConfig from "../../firebase-applet-config.json";

// Configure Firestore log level to 'error' to suppress internal SDK existence-filter bloom filter warnings
try {
  setLogLevel("error");
} catch (_) {}

// Suppress harmless internal BloomFilter fallback warnings from console
if (typeof window !== "undefined") {
  const origWarn = console.warn;
  console.warn = function (...args: any[]) {
    const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
    if (msg.includes("BloomFilter error") || msg.includes("BloomFilterError")) {
      return;
    }
    origWarn.apply(console, args);
  };

  const origError = console.error;
  console.error = function (...args: any[]) {
    const msg = args.map((a) => (typeof a === "object" ? JSON.stringify(a) : String(a))).join(" ");
    if (msg.includes("BloomFilter error") || msg.includes("BloomFilterError")) {
      return;
    }
    origError.apply(console, args);
  };
}

const app = !getApps().length ? initializeApp(firebaseConfig) : getApp();

export const auth = getAuth(app);
export const db = getFirestore(
  app,
  firebaseConfig.firestoreDatabaseId || "(default)"
);
export default app;

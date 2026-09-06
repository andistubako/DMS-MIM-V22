import { initializeApp, getApps, getApp } from "firebase/app";
import { initializeFirestore, getFirestore } from "firebase/firestore";
import { getAuth } from "firebase/auth";
import firebaseConfig from "../firebase-applet-config.json";

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

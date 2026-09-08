import { Request, Response, NextFunction } from "express";
import { doc, runTransaction, setDoc, deleteDoc } from "firebase/firestore";
import { firestoreDb } from "./firebase.js";

const LOCK_EXPIRATION_MS = 45 * 1000; // 45 seconds lock window for in-flight requests

export async function idempotencyMiddleware(
  req: Request,
  res: Response,
  next: NextFunction
) {
  // Only apply to state-mutating requests (POST, PUT, PATCH)
  if (req.method !== "POST" && req.method !== "PUT" && req.method !== "PATCH") {
    return next();
  }

  const rawKey =
    req.headers["x-idempotency-key"] ||
    req.body?.idempotency_key ||
    req.body?.client_order_id;

  const idempotencyKey = rawKey ? String(rawKey).trim() : null;

  if (!idempotencyKey) {
    return next();
  }

  const keyDocRef = doc(firestoreDb, "idempotency_keys", idempotencyKey);

  try {
    const claimResult = await runTransaction(firestoreDb, async (tx) => {
      const snap = await tx.get(keyDocRef);
      const now = Date.now();

      if (snap.exists()) {
        const data = snap.data();

        // 1. Transaction already completed: Return cached response directly
        if (data.status === "COMPLETED") {
          return {
            action: "REPLAY" as const,
            statusCode: Number(data.status_code || 200),
            payload: data.response_payload || data,
          };
        }

        // 2. Transaction is currently in progress and lock has not expired
        const lockedAt = Number(data.locked_at || 0);
        if (data.status === "IN_PROGRESS" && now - lockedAt < LOCK_EXPIRATION_MS) {
          return {
            action: "LOCKED" as const,
          };
        }
      }

      // 3. Acquire lock for new request or expired lock
      tx.set(
        keyDocRef,
        {
          key: idempotencyKey,
          status: "IN_PROGRESS",
          locked_at: now,
          path: req.originalUrl,
          user_id: (req as any).user?._id || "anonymous",
          created_at: new Date(now).toISOString(),
        },
        { merge: true }
      );

      return { action: "ACQUIRED" as const };
    });

    if (claimResult.action === "REPLAY") {
      res.setHeader("X-Idempotent-Replayed", "true");
      return res.status(claimResult.statusCode).json(claimResult.payload);
    }

    if (claimResult.action === "LOCKED") {
      return res.status(409).json({
        error: "TRANSACTION_IN_PROGRESS",
        detail: "Transaksi ini sedang diproses. Mohon jangan mengirim ulang pesanan.",
      });
    }

    // Intercept res.json to capture response payload
    const originalJson = res.json.bind(res);
    res.json = function (body: any) {
      const statusCode = res.statusCode;

      if (statusCode >= 200 && statusCode < 300) {
        // Success: Persist completed response payload to Firestore
        const completedPayload = {
          key: idempotencyKey,
          status: "COMPLETED",
          status_code: statusCode,
          response_payload: body,
          completed_at: new Date().toISOString(),
          expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
        };

        const cleanPayload = JSON.parse(
          JSON.stringify(completedPayload, (_k, v) => (v === undefined ? null : v))
        );

        setDoc(keyDocRef, cleanPayload, { merge: true }).catch((err) => {
          console.error(`[Idempotency] Failed to record completed key '${idempotencyKey}':`, err);
        });
      } else {
        // Client or Server Error (4xx/5xx): Release key lock so client can retry with valid data
        deleteDoc(keyDocRef).catch((err) => {
          console.warn(`[Idempotency] Failed to release lock key '${idempotencyKey}':`, err);
        });
      }

      return originalJson(body);
    };

    next();
  } catch (error: any) {
    console.error("[Idempotency] Middleware error:", error);
    // On unexpected database error reading idempotency key, proceed without blocking
    next();
  }
}

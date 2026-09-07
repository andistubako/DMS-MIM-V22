import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import { User } from "./data.js";
import { firestoreDb } from "./firebase.js";
import {
  doc,
  getDoc,
  collection,
  query,
  where,
  getDocs,
  limit,
} from "firebase/firestore";

export interface AuthenticatedRequest extends Request {
  user?: User;
}

export interface SessionRecord {
  userId: string;
  email: string;
  role: string;
  createdAt: number;
  expiresAt: number;
}

// Server-side session registry. Access and refresh tokens are opaque random
// credentials and never contain user IDs or other user-controlled identity data.
export const activeSessions = new Map<string, SessionRecord>();
export const activeRefreshSessions = new Map<string, SessionRecord>();

const SESSION_TTL_MS = 24 * 60 * 60 * 1000; // 24 hours
const REFRESH_TTL_MS = 7 * 24 * 60 * 60 * 1000; // 7 days

function createOpaqueToken(prefix: string): string {
  return `${prefix}${crypto.randomBytes(32).toString("base64url")}`;
}

export function generateTokens(user: User) {
  const token = createOpaqueToken("mhm_sess_");
  const refreshToken = createOpaqueToken("mhm_ref_");

  const now = Date.now();
  const session: SessionRecord = {
    userId: user._id || user.id || "",
    email: user.email,
    role: user.role,
    createdAt: now,
    expiresAt: now + SESSION_TTL_MS,
  };

  activeSessions.set(token, session);
  activeRefreshSessions.set(refreshToken, {
    ...session,
    expiresAt: now + REFRESH_TTL_MS,
  });

  return { token, refreshToken };
}

export async function getUserByIdFromFirestore(userId: string): Promise<User | null> {
  try {
    const docRef = doc(firestoreDb, "users", userId);
    const snap = await getDoc(docRef);
    if (!snap.exists()) return null;
    const data = snap.data() as any;
    if (data.status !== "ACTIVE") return null;
    return {
      _id: snap.id,
      id: snap.id,
      name: data.name,
      email: data.email,
      password_hash: data.password_hash || "",
      role: data.role,
      phone: data.phone || "",
      status: data.status,
      office_id: data.office_id,
      area_id: data.area_id,
      created_at: data.created_at || new Date().toISOString(),
    };
  } catch (err) {
    console.error("getUserByIdFromFirestore error:", err);
    return null;
  }
}

export async function getUserByEmailFromFirestore(email: string): Promise<User | null> {
  try {
    const q = query(
      collection(firestoreDb, "users"),
      where("email", "==", email.toLowerCase().trim()),
      limit(1)
    );
    const snap = await getDocs(q);
    if (snap.empty) return null;
    const firstDoc = snap.docs[0];
    const data = firstDoc.data() as any;
    return {
      _id: firstDoc.id,
      id: firstDoc.id,
      name: data.name,
      email: data.email,
      password_hash: data.password_hash || "",
      role: data.role,
      phone: data.phone || "",
      status: data.status,
      office_id: data.office_id,
      area_id: data.area_id,
      created_at: data.created_at || new Date().toISOString(),
    };
  } catch (err) {
    console.error("getUserByEmailFromFirestore error:", err);
    return null;
  }
}

export async function rotateRefreshToken(refreshToken: string | undefined) {
  if (!refreshToken) return null;

  const existing = activeRefreshSessions.get(refreshToken);
  if (!existing || Date.now() >= existing.expiresAt) {
    if (existing) activeRefreshSessions.delete(refreshToken);
    return null;
  }

  // Fetch from Cloud Firestore (Single Source of Truth)
  const user = await getUserByIdFromFirestore(existing.userId);
  if (!user) {
    activeRefreshSessions.delete(refreshToken);
    return null;
  }

  // One-time refresh token rotation prevents replay of an already-used token.
  activeRefreshSessions.delete(refreshToken);
  return generateTokens(user);
}

export function setAuthCookies(res: Response, token: string, refreshToken: string) {
  res.cookie("access_token", token, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: SESSION_TTL_MS,
    path: "/",
  });
  res.cookie("refresh_token", refreshToken, {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    maxAge: REFRESH_TTL_MS,
    path: "/",
  });
}

export function clearAuthCookies(res: Response) {
  res.clearCookie("access_token", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  });
  res.clearCookie("refresh_token", {
    httpOnly: true,
    secure: true,
    sameSite: "none",
    path: "/",
  });
}

export async function authMiddleware(
  req: AuthenticatedRequest,
  res: Response,
  next: NextFunction
) {
  const authHeader = req.headers.authorization;
  let token = req.cookies?.access_token;
  if (!token && authHeader?.startsWith("Bearer ")) {
    token = authHeader.slice(7).trim();
  }

  if (!token) {
    return res.status(401).json({ detail: "Sesi tidak ditemukan. Silakan login kembali." });
  }

  const session = activeSessions.get(token);

  if (!session) {
    // Check if token is a Firebase ID Token (JWT)
    if (token.split('.').length === 3) {
      try {
        const payloadBase64 = token.split('.')[1];
        const payloadJson = Buffer.from(payloadBase64, 'base64').toString('utf8');
        const payload = JSON.parse(payloadJson);
        const uid = payload.user_id || payload.sub;
        const exp = Number(payload.exp || 0) * 1000;

        if (uid && exp > Date.now()) {
          const fbUser = await getUserByIdFromFirestore(uid);
          if (fbUser) {
            req.user = fbUser;
            return next();
          }
        }
      } catch (err) {
        // Fall through to 401
      }
    }
    return res.status(401).json({ detail: "Sesi tidak valid atau telah kedaluwarsa." });
  }

  if (Date.now() >= session.expiresAt) {
    activeSessions.delete(token);
    return res.status(401).json({ detail: "Sesi telah kedaluwarsa. Silakan login kembali." });
  }

  // Fetch user from Cloud Firestore (Single Source of Truth)
  const user = await getUserByIdFromFirestore(session.userId);

  if (!user) {
    activeSessions.delete(token);
    return res.status(401).json({ detail: "Pengguna tidak aktif atau tidak ditemukan." });
  }

  session.email = user.email;
  session.role = user.role;

  req.user = user;
  return next();
}

export function revokeSession(token: string | undefined): void {
  if (token) activeSessions.delete(token);
}

export function revokeRefreshSession(token: string | undefined): void {
  if (token) activeRefreshSessions.delete(token);
}

export function revokeAllUserSessions(userId: string): number {
  let revoked = 0;
  for (const [token, session] of activeSessions.entries()) {
    if (session.userId === userId) {
      activeSessions.delete(token);
      revoked++;
    }
  }
  for (const [token, session] of activeRefreshSessions.entries()) {
    if (session.userId === userId) activeRefreshSessions.delete(token);
  }
  return revoked;
}

export function requireRoles(...roles: string[]) {
  return (req: AuthenticatedRequest, res: Response, next: NextFunction) => {
    if (!req.user) {
      return res.status(401).json({ detail: "Tidak terautentikasi." });
    }
    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ detail: "Akses ditolak. Hak akses tidak mencukupi." });
    }
    next();
  };
}

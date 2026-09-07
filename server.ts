// Enforce GMT+7 (Asia/Jakarta / WIB) timezone globally
process.env.TZ = "Asia/Jakarta";

import express from "express";
import "express-async-errors";
import cookieParser from "cookie-parser";
import cors from "cors";
import path from "path";
import { createServer as createViteServer } from "vite";
import { apiRouter } from "./server/routes.js";
import authRouter from "./server/auth.routes.js";
import transactionRouter from "./server/transaction.routes.js";
import callMetricsRouter from "./server/callMetrics.routes.js";
import { db as inMemoryDb, saveDatabaseToDisk } from "./server/data.js";
import { seedFirestoreInitialData } from "./server/firestoreSeed.js";
import { seedMasterDataToFirestore } from "./server/masterDataSeed.js";
import { loadMasterDataFromFirestore } from "./server/masterData.service.js";
import { seedInventoryToFirestore } from "./server/inventorySeed.js";
import { seedFieldOperationsToFirestore } from "./server/fieldOperationsSeed.js";
import { seedFinancialsToFirestore } from "./server/financialSeed.js";
import { loadAllFromFirestore } from "./server/persistence.js";
import { bootstrapCanonicalConfig } from "./server/canonicalConfig.js";
import masterDataRouter from "./server/masterData.routes.js";
import inventoryRouter from "./server/inventory.routes.js";

async function startServer() {
  const production = process.env.NODE_ENV === "production";

  // Google Cloud Firestore: Primary Database & Single Source of Truth
  console.log("[Database] Operating with Google Cloud Firestore as the Single Source of Truth (SSOT).");
  try {
    await bootstrapCanonicalConfig();
    await seedFirestoreInitialData();
    await seedMasterDataToFirestore();
    await loadMasterDataFromFirestore();
    await seedInventoryToFirestore();
    await seedFieldOperationsToFirestore();
    await seedFinancialsToFirestore();
    await loadAllFromFirestore(inMemoryDb);
    console.log("[Database] Google Cloud Firestore data loaded & synchronized successfully.");
  } catch (err) {
    console.warn("[Firestore Seed Notice]:", err);
  }

  const app = express();
  const PORT = 3000;
  const configuredOrigins = (process.env.CORS_ORIGINS || "").split(",").map((origin) => origin.trim()).filter(Boolean);

  app.use(cors({ origin: true, credentials: true }));
  app.use(express.json({ limit: "10mb" }));
  app.use(express.urlencoded({ extended: true, limit: "10mb" }));
  app.use(cookieParser());

  app.use("/api/auth", authRouter);
  app.use("/api/transactions", transactionRouter);
  app.use("/api/metrics", callMetricsRouter);

  app.use("/api", masterDataRouter);
  app.use("/api", inventoryRouter);
  app.use("/api", apiRouter);

  // App-level Error Handler
  app.use((err: any, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
    console.error("[Server Error Handler]", err);
    if (res.headersSent) return;
    res.status(err.status || err.statusCode || 500).json({
      success: false,
      detail: err.message || "Internal Server Error",
    });
  });

  if (production) {
    const distPath = path.resolve(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => res.sendFile(path.join(distPath, "index.html")));
  } else {
    const vite = await createViteServer({ server: { middlewareMode: true }, appType: "spa" });
    app.use(vite.middlewares);
  }

  process.on("unhandledRejection", (reason, promise) => {
    console.error("[Unhandled Rejection at Promise]:", promise, "reason:", reason);
  });

  process.on("uncaughtException", (error) => {
    console.error("[Uncaught Exception]:", error);
  });

  app.listen(PORT, "0.0.0.0", () => console.log(`[DMS] Server running on port ${PORT}`));
}

startServer().catch((err) => {
  console.error("[DMS] Fatal startup error:", err);
  process.exit(1);
});
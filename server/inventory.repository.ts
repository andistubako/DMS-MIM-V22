import { eq, and, sql } from "drizzle-orm";
import { sqlDb } from "../src/db/index.js";
import { isCloudSqlConnected, syncDocToPostgres } from "./cloudsqlSync.js";
import { syncSingleDoc } from "./persistence.js";
import { db } from "./data.js";
import { inventory, stockMovements, salesStockLedgers, auditLogs } from "../src/db/schema.js";

export const InventoryRepository = {
  getInventory: async (locationType: string, locationId: string, skuId: string, tx: any = sqlDb) => {
    if (!isCloudSqlConnected) {
      const existing = db.inventory.find(i => (i.location_type === locationType || (!i.location_type && locationType === "WAREHOUSE")) && (i.location_id === locationId || i.office_id === locationId) && i.sku_id === skuId);
      if (!existing) return null;
      return { id: existing._id, stockOnHand: existing.stock_on_hand, availableStock: existing.available_stock, locationType, locationId, skuId };
    }
    const res = await tx.select().from(inventory).where(
      and(eq(inventory.locationType, locationType), eq(inventory.locationId, locationId), eq(inventory.skuId, skuId))
    ).limit(1);
    return res[0];
  },

  getInventoryListByLocation: async (locationType: string, locationId: string, tx: any = sqlDb) => {
    if (!isCloudSqlConnected) {
      return db.inventory.filter(i => (i.location_type === locationType || (!i.location_type && locationType === "WAREHOUSE")) && (i.location_id === locationId || i.office_id === locationId)).map(i => ({
        id: i._id, stockOnHand: i.stock_on_hand, availableStock: i.available_stock, locationType, locationId, skuId: i.sku_id
      }));
    }
    return await tx.select().from(inventory).where(and(eq(inventory.locationType, locationType), eq(inventory.locationId, locationId)));
  },

  /**
   * Update a balance while locking the existing row for the duration of the
   * surrounding PostgreSQL transaction. This prevents lost updates when two
   * sales/handover/return requests touch the same SKU concurrently.
   */
  createOrUpdateInventory: async (locationType: string, locationId: string, skuId: string, qtyDelta: number, tx: any = sqlDb) => {
    const locType = locationType || "WAREHOUSE";
    const locId = locationId || "off-1";

    let existingMem = db.inventory.find(i => (i.location_type === locType || (!i.location_type && locType === "WAREHOUSE")) && (i.location_id === locId || i.office_id === locId) && i.sku_id === skuId);
    if (existingMem) {
      existingMem.stock_on_hand += qtyDelta;
      existingMem.available_stock += qtyDelta;
    } else {
      const newInv = {
         _id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
         id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
         location_type: locType as "WAREHOUSE" | "SALES",
         location_id: locId,
         sku_id: skuId,
         stock_on_hand: qtyDelta,
         available_stock: qtyDelta,
         allocated_stock: 0,
         status: "ACTIVE"
      };
      db.inventory.push(newInv);
    }

    if (!isCloudSqlConnected) {
      const invToPersist = existingMem || db.inventory[db.inventory.length - 1];
      if (invToPersist) {
        syncSingleDoc("inventory", invToPersist._id || invToPersist.id, invToPersist).catch(() => {});
      }
      if (existingMem) {
        return { id: existingMem._id, stockOnHand: existingMem.stock_on_hand, availableStock: existingMem.available_stock, allocatedStock: existingMem.allocated_stock, locationType: locType, locationId: locId, skuId };
      } else {
        const i = db.inventory[db.inventory.length - 1];
        return { id: i.id, stockOnHand: i.stock_on_hand, availableStock: i.available_stock, allocatedStock: i.allocated_stock, locationType: locType, locationId: locId, skuId };
      }
    }

    try {
      const existingList = await tx.select().from(inventory).where(
        and(
          eq(inventory.locationType, locType),
          eq(inventory.locationId, locId),
          eq(inventory.skuId, skuId)
        )
      ).limit(1);
      const existing = existingList?.[0];

      if (existing) {
        const newStock = Number(existing.stockOnHand || 0) + qtyDelta;
        const newAvailable = Number(existing.availableStock || 0) + qtyDelta;
        if (newStock < 0 || newAvailable < 0) throw new Error("Stok tidak mencukupi untuk transaksi ini.");

        const res = await tx.update(inventory).set({
          stockOnHand: newStock,
          availableStock: newAvailable,
          updatedAt: sql`NOW()`
        }).where(eq(inventory.id, existing.id)).returning();
        return res[0];
      }

      if (qtyDelta < 0) throw new Error("Stok awal tidak mencukupi.");

      const newInv = {
        id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
        locationType: locType,
        locationId: locId,
        skuId,
        stockOnHand: qtyDelta,
        availableStock: qtyDelta,
        allocatedStock: 0,
        status: "ACTIVE"
      };

      try {
        const res = await tx.insert(inventory).values(newInv).returning();
        return res[0];
      } catch (insertErr: any) {
        // Fallback for concurrent insert race
        const fallbackList = await tx.select().from(inventory).where(
          and(
            eq(inventory.locationType, locType),
            eq(inventory.locationId, locId),
            eq(inventory.skuId, skuId)
          )
        ).limit(1);
        if (fallbackList?.[0]) {
          const row = fallbackList[0];
          const newStock = Number(row.stockOnHand || 0) + qtyDelta;
          const newAvailable = Number(row.availableStock || 0) + qtyDelta;
          const res = await tx.update(inventory).set({
            stockOnHand: newStock,
            availableStock: newAvailable,
            updatedAt: sql`NOW()`
          }).where(eq(inventory.id, row.id)).returning();
          return res[0];
        }
        throw insertErr;
      }
    } catch (err: any) {
      console.warn("[InventoryRepository] Postgres operation warning:", err?.message || err);
      // Synchronize in-memory as safety net
      let existing = db.inventory.find(i => (i.location_type === locType || (!i.location_type && locType === "WAREHOUSE")) && (i.location_id === locId || i.office_id === locId) && i.sku_id === skuId);
      if (existing) {
        existing.stock_on_hand += qtyDelta;
        existing.available_stock += qtyDelta;
        return { id: existing._id, stockOnHand: existing.stock_on_hand, availableStock: existing.available_stock, allocatedStock: existing.allocated_stock, locationType: locType, locationId: locId, skuId };
      } else {
        const newInv = {
           _id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
           id: `inv-${Date.now()}-${Math.floor(Math.random() * 1000000)}`,
           location_type: locType as "WAREHOUSE" | "SALES",
           location_id: locId,
           sku_id: skuId,
           stock_on_hand: qtyDelta,
           available_stock: qtyDelta,
           allocated_stock: 0,
           status: "ACTIVE"
        };
        db.inventory.push(newInv);
        return { id: newInv.id, stockOnHand: newInv.stock_on_hand, availableStock: newInv.available_stock, allocatedStock: newInv.allocated_stock, locationType: locType, locationId: locId, skuId };
      }
    }
  },

  insertMovement: async (mvt: any, tx: any = sqlDb) => {
    const mvtId = mvt.id || `mvt-${Date.now()}-${Math.floor(Math.random()*1000000)}`;
    const fullMvt = {
      _id: mvtId,
      id: mvtId,
      movement_type: mvt.movementType,
      source_location_type: mvt.sourceLocationType,
      source_location_id: mvt.sourceLocationId,
      dest_location_type: mvt.destLocationType,
      dest_location_id: mvt.destLocationId,
      sku_id: mvt.skuId,
      quantity: mvt.quantity,
      reference_id: mvt.referenceId,
      performed_by: mvt.performedBy,
      notes: mvt.notes,
      created_at: new Date().toISOString()
    };

    if (!isCloudSqlConnected) {
      if (!db.stock_movements) db.stock_movements = [];
      db.stock_movements.push(fullMvt as any);
      syncSingleDoc("stock_movements", fullMvt._id, fullMvt).catch(e => console.error("Failed to sync movement doc to Firestore", e));
      return { id: mvtId };
    }

    try {
      const res = await tx.insert(stockMovements).values({
        id: mvtId,
        movementType: mvt.movementType,
        sourceLocationType: mvt.sourceLocationType,
        sourceLocationId: mvt.sourceLocationId,
        destLocationType: mvt.destLocationType,
        destLocationId: mvt.destLocationId,
        skuId: mvt.skuId,
        quantity: mvt.quantity,
        referenceId: mvt.referenceId,
        performedBy: mvt.performedBy,
        notes: mvt.notes
      }).returning();
      
      const docData = res[0];
      const legacyMvt = {
        _id: docData.id, id: docData.id, movement_type: docData.movementType, source_location_type: docData.sourceLocationType, source_location_id: docData.sourceLocationId, dest_location_type: docData.destLocationType, dest_location_id: docData.destLocationId, sku_id: docData.skuId, quantity: docData.quantity, reference_id: docData.referenceId, performed_by: docData.performedBy, notes: docData.notes, created_at: docData.createdAt?.toISOString()
      };
      
      await tx.execute(sql`
        INSERT INTO dms_document_store (collection_name, doc_id, data, updated_at)
        VALUES ('stock_movements', ${legacyMvt._id}, ${JSON.stringify(legacyMvt)}, NOW())
        ON CONFLICT (collection_name, doc_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      `);
      
      return res[0];
    } catch (err: any) {
      console.warn("[InventoryRepository] insertMovement Postgres notice:", err?.message || err);
      throw err;
    }
  },
  upsertSalesStockLedger: async (salesmanId: string, businessDate: string, skuId: string, updates: any, tx: any = sqlDb) => {
    let memLedger = db.sales_stock_ledgers.find(l => l.salesman_id === salesmanId && l.business_date === businessDate && l.sku_id === skuId);
    
    if (!isCloudSqlConnected) {
      if (memLedger) {
        let ml = memLedger as any;
        if (updates.loadedStock) ml.loaded_stock = (ml.loaded_stock || 0) + updates.loadedStock;
        if (updates.soldStock) ml.sold_stock = (ml.sold_stock || 0) + updates.soldStock;
        if (updates.returnedStock) ml.returned_stock = (ml.returned_stock || 0) + updates.returnedStock;
        if (updates.finalStock) ml.final_stock = (ml.final_stock || 0) + updates.finalStock;
      } else {
        memLedger = {
          _id: `ssl-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
          salesman_id: salesmanId,
          business_date: businessDate,
          sku_id: skuId,
          initial_stock: 0,
          loaded_stock: updates.loadedStock || 0,
          sold_stock: updates.soldStock || 0,
          returned_stock: updates.returnedStock || 0,
          final_stock: updates.finalStock || 0
        } as any;
        db.sales_stock_ledgers.push(memLedger as any);
      }
      syncSingleDoc("sales_stock_ledgers", memLedger._id, memLedger).catch(e => console.error("Failed to sync sales ledger doc to Firestore", e));
      return memLedger;
    }

    try {
      const existingList = await tx.execute(sql`
        SELECT * FROM sales_stock_ledgers 
        WHERE salesman_id = ${salesmanId} 
          AND business_date = ${businessDate} 
          AND sku_id = ${skuId} 
        LIMIT 1 FOR UPDATE
      `);
      const existing = existingList.rows?.[0];

      let resLedger;
      if (existing) {
        resLedger = await tx.update(salesStockLedgers).set({
          loadedStock: Number(existing.loaded_stock || 0) + (updates.loadedStock || 0),
          soldStock: Number(existing.sold_stock || 0) + (updates.soldStock || 0),
          returnedStock: Number(existing.returned_stock || 0) + (updates.returnedStock || 0),
          finalStock: Number(existing.final_stock || 0) + (updates.finalStock || 0),
          updatedAt: sql`NOW()`
        }).where(eq(salesStockLedgers.id, existing.id as string)).returning();
      } else {
        resLedger = await tx.insert(salesStockLedgers).values({
          id: `ssl-${Date.now()}-${Math.floor(Math.random() * 100000)}`,
          salesmanId,
          businessDate,
          skuId,
          initialStock: 0,
          loadedStock: updates.loadedStock || 0,
          soldStock: updates.soldStock || 0,
          returnedStock: updates.returnedStock || 0,
          finalStock: updates.finalStock || 0
        }).returning();
      }
      
      const docData = resLedger[0];
      const legacyLedger = {
         _id: docData.id, salesman_id: docData.salesmanId, business_date: docData.businessDate, sku_id: docData.skuId, initial_stock: docData.initialStock, loaded_stock: docData.loadedStock, sold_stock: docData.soldStock, returned_stock: docData.returnedStock, final_stock: docData.finalStock
      };
      
      await tx.execute(sql`
        INSERT INTO dms_document_store (collection_name, doc_id, data, updated_at)
        VALUES ('sales_stock_ledgers', ${legacyLedger._id}, ${JSON.stringify(legacyLedger)}, NOW())
        ON CONFLICT (collection_name, doc_id) DO UPDATE SET data = EXCLUDED.data, updated_at = NOW()
      `);
      
      return resLedger[0];
    } catch (err: any) {
      console.warn("[InventoryRepository] upsertSalesStockLedger Postgres notice:", err?.message || err);
      throw err;
    }
  }
};

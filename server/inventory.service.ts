import {
  createOrUpdateInventory,
  recordStockMovement,
  upsertSalesStockLedger,
} from "./inventoryTransaction.service.js";
import { InventoryRules } from "./inventory.rules.js";

export const InventoryService = {
  deductSalesStock: async (salesmanId: string, skuId: string, qty: number, referenceId: string, outletId: string, notes: string) => {
    InventoryRules.validateQuantity(qty);
    const today = new Date().toISOString().slice(0, 10);

    const inv = await createOrUpdateInventory("SALES", salesmanId, skuId, -qty);
    await recordStockMovement({
      movementType: "SALES_OUT",
      sourceLocationType: "SALES",
      sourceLocationId: salesmanId,
      destLocationType: "OUTLET",
      destLocationId: outletId,
      skuId: skuId,
      quantity: qty,
      salesmanId: salesmanId,
      outletId: outletId,
      referenceId: referenceId,
      businessDate: today,
      notes,
    });
    await upsertSalesStockLedger(salesmanId, today, skuId, {
      soldStock: qty,
      finalStock: -qty,
    });

    return inv;
  },

  deductWarehouseStockForSales: async (warehouseId: string, skuId: string, qty: number, referenceId: string, outletId: string, performedBy: string, notes: string) => {
    InventoryRules.validateQuantity(qty);
    const targetWhId = warehouseId || "off-1";

    const inv = await createOrUpdateInventory("WAREHOUSE", targetWhId, skuId, -qty);
    await recordStockMovement({
      movementType: "SALES_OUT",
      sourceLocationType: "WAREHOUSE",
      sourceLocationId: targetWhId,
      destLocationType: "OUTLET",
      destLocationId: outletId,
      skuId: skuId,
      quantity: qty,
      outletId: outletId,
      referenceId: referenceId,
      performedBy,
      businessDate: new Date().toISOString().slice(0, 10),
      notes,
    });

    return inv;
  },

  processHandover: async (handover: any, items: any[], performedBy: string) => {
    const targetWhId = handover.warehouse_id || handover.office_id || "off-1";
    const today = handover.handover_date || handover.business_date || new Date().toISOString().slice(0, 10);

    for (const item of items) {
      const qty = parseInt(item.quantity) || 0;
      if (qty <= 0) continue;
      InventoryRules.validateQuantity(qty);

      await createOrUpdateInventory("WAREHOUSE", targetWhId, item.sku_id, -qty);
      await createOrUpdateInventory("SALES", handover.salesman_id, item.sku_id, qty);

      await upsertSalesStockLedger(handover.salesman_id, today, item.sku_id, {
        loadedStock: qty,
        finalStock: qty,
      });

      await recordStockMovement({
        movementType: "TRANSFER_OUT",
        sourceLocationType: "WAREHOUSE",
        sourceLocationId: targetWhId,
        destLocationType: "SALES",
        destLocationId: handover.salesman_id,
        skuId: item.sku_id,
        quantity: qty,
        salesmanId: handover.salesman_id,
        referenceId: handover._id,
        performedBy,
        businessDate: today,
        notes: `Handover ke Sales ${handover.salesman_id}`,
      });

      await recordStockMovement({
        movementType: "TRANSFER_IN",
        sourceLocationType: "WAREHOUSE",
        sourceLocationId: targetWhId,
        destLocationType: "SALES",
        destLocationId: handover.salesman_id,
        skuId: item.sku_id,
        quantity: qty,
        salesmanId: handover.salesman_id,
        referenceId: handover._id,
        performedBy,
        businessDate: today,
        notes: `Penerimaan Handover dari Gudang ${targetWhId}`,
      });
    }
  },

  processReturn: async (stockReturn: any, items: any[], performedBy: string) => {
    const targetWhId = stockReturn.warehouse_id || stockReturn.office_id || "off-1";
    const today = stockReturn.return_date || stockReturn.business_date || new Date().toISOString().slice(0, 10);

    for (const item of items) {
      const qty = parseInt(item.quantity) || 0;
      if (qty <= 0) continue;
      InventoryRules.validateQuantity(qty);

      await createOrUpdateInventory("SALES", stockReturn.salesman_id, item.sku_id, -qty);
      await createOrUpdateInventory("WAREHOUSE", targetWhId, item.sku_id, qty);

      await upsertSalesStockLedger(stockReturn.salesman_id, today, item.sku_id, {
        returnedStock: qty,
        finalStock: -qty,
      });

      await recordStockMovement({
        movementType: "RETURN_IN",
        sourceLocationType: "SALES",
        sourceLocationId: stockReturn.salesman_id,
        destLocationType: "WAREHOUSE",
        destLocationId: targetWhId,
        skuId: item.sku_id,
        quantity: qty,
        salesmanId: stockReturn.salesman_id,
        referenceId: stockReturn._id,
        performedBy,
        businessDate: today,
        notes: `Return dari Sales ${stockReturn.salesman_id}`,
      });
    }
  },

  processReceiving: async (receiving: any, items: any[], performedBy: string) => {
    const targetWhId = receiving.warehouse_id || receiving.office_id || "off-1";
    const today = receiving.receiving_date || receiving.business_date || new Date().toISOString().slice(0, 10);

    for (const item of items) {
      const qty = parseInt(item.quantity) || 0;
      if (qty <= 0) continue;
      InventoryRules.validateQuantity(qty);

      await createOrUpdateInventory("WAREHOUSE", targetWhId, item.sku_id, qty);

      await recordStockMovement({
        movementType: "PURCHASE_IN",
        sourceLocationType: "SUPPLIER",
        sourceLocationId: receiving.supplier_name || "SUPPLIER",
        destLocationType: "WAREHOUSE",
        destLocationId: targetWhId,
        skuId: item.sku_id,
        quantity: qty,
        referenceId: receiving._id,
        performedBy,
        businessDate: today,
        notes: `Penerimaan Barang Supplier ${receiving.supplier_name || ""}`,
      });
    }
  },

  reverseSalesStock: async (salesmanId: string, skuId: string, qty: number, referenceId: string, outletId: string, notes: string) => {
    InventoryRules.validateQuantity(qty);
    const today = new Date().toISOString().slice(0, 10);

    const inv = await createOrUpdateInventory("SALES", salesmanId, skuId, qty);
    await recordStockMovement({
      movementType: "REVERSAL",
      sourceLocationType: "OUTLET",
      sourceLocationId: outletId,
      destLocationType: "SALES",
      destLocationId: salesmanId,
      skuId: skuId,
      quantity: qty,
      salesmanId: salesmanId,
      outletId: outletId,
      referenceId: referenceId,
      businessDate: today,
      notes,
    });

    await upsertSalesStockLedger(salesmanId, today, skuId, {
      returnedStock: 0,
      finalStock: qty,
    });

    return inv;
  },

  processOpname: async (warehouseId: string, skuId: string, diff: number, performedBy: string, notes: string) => {
    if (diff === 0) return;
    const targetWhId = warehouseId || "off-1";
    const today = new Date().toISOString().slice(0, 10);

    await createOrUpdateInventory("WAREHOUSE", targetWhId, skuId, diff);
    await recordStockMovement({
      movementType: diff > 0 ? "ADJUSTMENT_IN" : "ADJUSTMENT_OUT",
      sourceLocationType: diff > 0 ? "NONE" : "WAREHOUSE",
      sourceLocationId: diff > 0 ? "" : targetWhId,
      destLocationType: diff > 0 ? "WAREHOUSE" : "NONE",
      destLocationId: diff > 0 ? targetWhId : "",
      skuId: skuId,
      quantity: Math.abs(diff),
      referenceId: `opn-${Date.now()}`,
      performedBy,
      businessDate: today,
      notes,
    });
  },
};

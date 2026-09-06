import { pgTable, text, timestamp, boolean, doublePrecision, integer, jsonb, index, uniqueIndex } from "drizzle-orm/pg-core";

// 1. Users table
export const users = pgTable("users", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  role: text("role").notNull(),
  status: text("status").default("ACTIVE"),
  phone: text("phone"),
  passwordHash: text("password_hash"),
  avatarUrl: text("avatar_url"),
  officeId: text("office_id"), // FK will be defined later to avoid circular dep if needed, but we can do inline
  areaId: text("area_id"),
  lastLogin: timestamp("last_login"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  metadata: jsonb("metadata"),
}, (table) => [
  index("users_role_idx").on(table.role),
  index("users_office_idx").on(table.officeId)
]);

// 2. Company Profile
export const companyProfile = pgTable("company_profile", {
  id: text("id").primaryKey(),
  companyName: text("company_name").notNull(),
  companyLegalName: text("company_legal_name"),
  companyCode: text("company_code"),
  address: text("address"),
  phone: text("phone"),
  email: text("email"),
  website: text("website"),
  description: text("description"),
  logoUrl: text("logo_url"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: text("updated_by"),
  metadata: jsonb("metadata"),
});

// 3. System Settings
export const systemSettings = pgTable("system_settings", {
  id: text("id").primaryKey(),
  settingsData: jsonb("settings_data").notNull(),
  updatedAt: timestamp("updated_at").defaultNow(),
  updatedBy: text("updated_by"),
});

// 4. Offices / Branches
export const offices = pgTable("offices", {
  id: text("id").primaryKey(),
  officeName: text("office_name").notNull(),
  officeCode: text("office_code"),
  address: text("address"),
  phone: text("phone"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  radiusMeters: integer("radius_meters").default(100),
  status: text("status").default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  metadata: jsonb("metadata"),
});

// 5. Taxonomy: Provinces, Regencies, Districts, Villages, Areas
export const provinces = pgTable("provinces", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  code: text("code"),
  status: text("status").default("ACTIVE"),
  metadata: jsonb("metadata")
});

export const regencies = pgTable("regencies", {
  id: text("id").primaryKey(),
  provinceId: text("province_id").references(() => provinces.id, { onDelete: 'restrict' }),
  name: text("name").notNull(),
  code: text("code"),
  status: text("status").default("ACTIVE"),
  metadata: jsonb("metadata")
});

export const districts = pgTable("districts", {
  id: text("id").primaryKey(),
  regencyId: text("regency_id").references(() => regencies.id, { onDelete: 'restrict' }),
  name: text("name").notNull(),
  code: text("code"),
  status: text("status").default("ACTIVE"),
  metadata: jsonb("metadata")
});

export const villages = pgTable("villages", {
  id: text("id").primaryKey(),
  districtId: text("district_id").references(() => districts.id, { onDelete: 'restrict' }),
  name: text("name").notNull(),
  code: text("code"),
  status: text("status").default("ACTIVE"),
  metadata: jsonb("metadata")
});

export const areas = pgTable("areas", {
  id: text("id").primaryKey(),
  areaName: text("area_name").notNull(),
  areaCode: text("area_code"),
  officeId: text("office_id").references(() => offices.id, { onDelete: 'restrict' }),
  regencyId: text("regency_id").references(() => regencies.id, { onDelete: 'restrict' }),
  status: text("status").default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow(),
  metadata: jsonb("metadata")
});

// 6. Channels & Routes
export const channels = pgTable("channels", {
  id: text("id").primaryKey(),
  channelName: text("channel_name").notNull(),
  channelCode: text("channel_code"),
  status: text("status").default("ACTIVE"),
  metadata: jsonb("metadata")
});

export const routes = pgTable("routes", {
  id: text("id").primaryKey(),
  routeName: text("route_name").notNull(),
  routeCode: text("route_code"),
  areaId: text("area_id").references(() => areas.id, { onDelete: 'restrict' }),
  status: text("status").default("ACTIVE"),
  metadata: jsonb("metadata")
});

// 7. Products & SKUs
export const products = pgTable("products", {
  id: text("id").primaryKey(),
  productName: text("product_name").notNull(),
  productCode: text("product_code"),
  category: text("category"),
  brand: text("brand"),
  status: text("status").default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow(),
  metadata: jsonb("metadata")
});

export const skus = pgTable("skus", {
  id: text("id").primaryKey(),
  productId: text("product_id").references(() => products.id, { onDelete: 'restrict' }),
  skuCode: text("sku_code").notNull().unique(),
  skuName: text("sku_name").notNull(),
  barcode: text("barcode"),
  uom: text("uom").default("PCS"),
  packSize: integer("pack_size").default(1),
  basePrice: doublePrecision("base_price").default(0),
  status: text("status").default("ACTIVE"),
  imageUrl: text("image_url"),
  createdAt: timestamp("created_at").defaultNow(),
  metadata: jsonb("metadata")
}, (table) => [
  index("skus_product_idx").on(table.productId)
]);

// 8. Prices & Promos
export const prices = pgTable("prices", {
  id: text("id").primaryKey(),
  skuId: text("sku_id").notNull().references(() => skus.id, { onDelete: 'restrict' }),
  priceType: text("price_type").default("DEFAULT"),
  priceValue: doublePrecision("price_value").notNull(),
  minQty: integer("min_qty").default(1),
  channelId: text("channel_id").references(() => channels.id, { onDelete: 'restrict' }),
  areaId: text("area_id").references(() => areas.id, { onDelete: 'restrict' }),
  status: text("status").default("ACTIVE"),
  metadata: jsonb("metadata")
});

export const promos = pgTable("promos", {
  id: text("id").primaryKey(),
  promoName: text("promo_name").notNull(),
  promoCode: text("promo_code"),
  promoType: text("promo_type"),
  discountPercent: doublePrecision("discount_percent"),
  discountAmount: doublePrecision("discount_amount"),
  startDate: timestamp("start_date"),
  endDate: timestamp("end_date"),
  status: text("status").default("ACTIVE"),
  metadata: jsonb("metadata")
});

// 9. Salesmen & Open Call Reasons
export const salesmen = pgTable("salesmen", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: 'restrict' }),
  officeId: text("office_id").references(() => offices.id, { onDelete: 'restrict' }),
  areaId: text("area_id").references(() => areas.id, { onDelete: 'restrict' }),
  status: text("status").default("ACTIVE"),
  metadata: jsonb("metadata")
}, (table) => [
  index("salesmen_user_idx").on(table.userId)
]);

export const openCallReasons = pgTable("open_call_reasons", {
  id: text("id").primaryKey(),
  reasonCode: text("reason_code").notNull(),
  description: text("description").notNull(),
  category: text("category").default("GENERAL"),
  status: text("status").default("ACTIVE"),
  metadata: jsonb("metadata")
});

// 10. Outlets
export const outlets = pgTable("outlets", {
  id: text("id").primaryKey(),
  outletName: text("outlet_name").notNull(),
  outletCode: text("outlet_code").notNull().unique(),
  channelId: text("channel_id").references(() => channels.id, { onDelete: 'restrict' }),
  areaId: text("area_id").references(() => areas.id, { onDelete: 'restrict' }),
  routeId: text("route_id").references(() => routes.id, { onDelete: 'restrict' }),
  address: text("address"),
  phone: text("phone"),
  ownerName: text("owner_name"),
  latitude: doublePrecision("latitude"),
  longitude: doublePrecision("longitude"),
  status: text("status").default("ACTIVE"),
  imageUrl: text("image_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  metadata: jsonb("metadata")
}, (table) => [
  index("outlets_area_idx").on(table.areaId),
  index("outlets_channel_idx").on(table.channelId)
]);

export const salesOutlets = pgTable("sales_outlets", {
  id: text("id").primaryKey(),
  salesmanId: text("salesman_id").notNull().references(() => salesmen.id, { onDelete: 'restrict' }),
  outletId: text("outlet_id").notNull().references(() => outlets.id, { onDelete: 'restrict' }),
  visitDay: text("visit_day"),
  visitFrequency: text("visit_frequency").default("WEEKLY"),
  status: text("status").default("ACTIVE"),
  metadata: jsonb("metadata")
}, (table) => [
  index("sales_outlets_salesman_idx").on(table.salesmanId),
  index("sales_outlets_outlet_idx").on(table.outletId)
]);

// 11. Call Plans & Items
export const callPlans = pgTable("call_plans", {
  id: text("id").primaryKey(),
  salesmanId: text("salesman_id").notNull().references(() => salesmen.id, { onDelete: 'restrict' }),
  planDate: text("plan_date").notNull(),
  status: text("status").default("ACTIVE"),
  totalOutlets: integer("total_outlets").default(0),
  visitedOutlets: integer("visited_outlets").default(0),
  effectiveCalls: integer("effective_calls").default(0),
  createdAt: timestamp("created_at").defaultNow(),
  metadata: jsonb("metadata")
}, (table) => [
  index("call_plans_salesman_idx").on(table.salesmanId),
  index("call_plans_date_idx").on(table.planDate)
]);

export const callPlanItems = pgTable("call_plan_items", {
  id: text("id").primaryKey(),
  callPlanId: text("call_plan_id").notNull().references(() => callPlans.id, { onDelete: 'cascade' }),
  outletId: text("outlet_id").notNull().references(() => outlets.id, { onDelete: 'restrict' }),
  sequence: integer("sequence").default(1),
  status: text("status").default("PLANNED"),
  metadata: jsonb("metadata")
}, (table) => [
  index("call_plan_items_plan_idx").on(table.callPlanId),
  index("call_plan_items_outlet_idx").on(table.outletId)
]);

// 12. Attendance & GPS Tracking
export const attendance = pgTable("attendance", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: 'restrict' }),
  date: text("date").notNull(),
  checkInTime: timestamp("check_in_time"),
  checkInLat: doublePrecision("check_in_lat"),
  checkInLng: doublePrecision("check_in_lng"),
  checkInPhoto: text("check_in_photo"),
  checkInDistance: doublePrecision("check_in_distance"),
  checkOutTime: timestamp("check_out_time"),
  checkOutLat: doublePrecision("check_out_lat"),
  checkOutLng: doublePrecision("check_out_lng"),
  checkOutPhoto: text("check_out_photo"),
  status: text("status").default("PRESENT"),
  notes: text("notes"),
  metadata: jsonb("metadata")
}, (table) => [
  index("attendance_user_idx").on(table.userId),
  index("attendance_date_idx").on(table.date)
]);

export const gpsEvents = pgTable("gps_events", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: 'restrict' }),
  latitude: doublePrecision("latitude").notNull(),
  longitude: doublePrecision("longitude").notNull(),
  accuracy: doublePrecision("accuracy"),
  batteryLevel: integer("battery_level"),
  eventType: text("event_type").default("HEARTBEAT"),
  timestamp: timestamp("timestamp").defaultNow(),
  metadata: jsonb("metadata")
}, (table) => [
  index("gps_user_idx").on(table.userId),
  index("gps_time_idx").on(table.timestamp)
]);

// 13. Visits & Orders / Transactions
export const visits = pgTable("visits", {
  id: text("id").primaryKey(),
  salesmanId: text("salesman_id").notNull().references(() => salesmen.id, { onDelete: 'restrict' }),
  outletId: text("outlet_id").notNull().references(() => outlets.id, { onDelete: 'restrict' }),
  callPlanId: text("call_plan_id").references(() => callPlans.id, { onDelete: 'restrict' }),
  checkInTime: timestamp("check_in_time").defaultNow(),
  checkInLat: doublePrecision("check_in_lat"),
  checkInLng: doublePrecision("check_in_lng"),
  checkInDistance: doublePrecision("check_in_distance"),
  checkInPhoto: text("check_in_photo"),
  checkOutTime: timestamp("check_out_time"),
  visitDurationSeconds: integer("visit_duration_seconds"),
  isEffectiveCall: boolean("is_effective_call").default(false),
  nonProductiveReasonId: text("non_productive_reason_id").references(() => openCallReasons.id, { onDelete: 'restrict' }),
  notes: text("notes"),
  status: text("status").default("COMPLETED"),
  metadata: jsonb("metadata")
}, (table) => [
  index("visits_salesman_idx").on(table.salesmanId),
  index("visits_outlet_idx").on(table.outletId),
  index("visits_time_idx").on(table.checkInTime)
]);

export const transactions = pgTable("transactions", {
  id: text("id").primaryKey(),
  invoiceNumber: text("invoice_number").notNull().unique(),
  salesmanId: text("salesman_id").notNull().references(() => salesmen.id, { onDelete: 'restrict' }),
  outletId: text("outlet_id").notNull().references(() => outlets.id, { onDelete: 'restrict' }),
  visitId: text("visit_id").references(() => visits.id, { onDelete: 'restrict' }),
  officeId: text("office_id").references(() => offices.id, { onDelete: 'restrict' }),
  transactionType: text("transaction_type").default("CASH"),
  subtotal: doublePrecision("subtotal").default(0),
  discountAmount: doublePrecision("discount_amount").default(0),
  taxAmount: doublePrecision("tax_amount").default(0),
  totalAmount: doublePrecision("total_amount").default(0),
  paidAmount: doublePrecision("paid_amount").default(0),
  paymentStatus: text("payment_status").default("UNPAID"),
  deliveryStatus: text("delivery_status").default("DELIVERED"),
  items: jsonb("items").notNull(), // To be normalized in a separate table later or kept as JSONB for now depending on constraints
  invoicePdfUrl: text("invoice_pdf_url"),
  notes: text("notes"),
  createdAt: timestamp("created_at").defaultNow(),
  metadata: jsonb("metadata")
}, (table) => [
  index("txn_salesman_idx").on(table.salesmanId),
  index("txn_outlet_idx").on(table.outletId),
  index("txn_created_idx").on(table.createdAt)
]);

// 14. Inventory & Stock Movements
export const inventory = pgTable("inventory", {
  id: text("id").primaryKey(),
  locationType: text("location_type").notNull(), // WAREHOUSE or SALESMAN
  locationId: text("location_id").notNull(),
  skuId: text("sku_id").notNull().references(() => skus.id, { onDelete: 'restrict' }),
  stockOnHand: integer("stock_on_hand").default(0),
  allocatedStock: integer("allocated_stock").default(0),
  availableStock: integer("available_stock").default(0),
  reorderLevel: integer("reorder_level").default(10),
  status: text("status").default("ACTIVE"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  metadata: jsonb("metadata")
}, (table) => [
  index("inventory_loc_idx").on(table.locationId),
  index("inventory_sku_idx").on(table.skuId),
  uniqueIndex("inventory_loc_sku_uniq").on(table.locationId, table.skuId)
]);

export const stockMovements = pgTable("stock_movements", {
  id: text("id").primaryKey(),
  movementType: text("movement_type").notNull(), // IN, OUT, TRANSFER
  sourceLocationType: text("source_location_type"),
  sourceLocationId: text("source_location_id"),
  destLocationType: text("dest_location_type"),
  destLocationId: text("dest_location_id"),
  skuId: text("sku_id").notNull().references(() => skus.id, { onDelete: 'restrict' }),
  quantity: integer("quantity").notNull(),
  referenceId: text("reference_id"), // e.g. handover_id, return_id, transaction_id
  performedBy: text("performed_by").notNull().references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp("created_at").defaultNow(),
  notes: text("notes"),
  metadata: jsonb("metadata")
}, (table) => [
  index("stock_mov_sku_idx").on(table.skuId),
  index("stock_mov_time_idx").on(table.createdAt)
]);

export const stockHandovers = pgTable("stock_handovers", {
  id: text("id").primaryKey(),
  handoverNumber: text("handover_number").notNull().unique(),
  salesmanId: text("salesman_id").notNull().references(() => salesmen.id, { onDelete: 'restrict' }),
  officeId: text("office_id").references(() => offices.id, { onDelete: 'restrict' }),
  handoverDate: text("handover_date").notNull(),
  status: text("status").default("PENDING"),
  items: jsonb("items").notNull(),
  notes: text("notes"),
  approvedBy: text("approved_by").references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp("created_at").defaultNow(),
  metadata: jsonb("metadata")
}, (table) => [
  index("handover_salesman_idx").on(table.salesmanId),
  index("handover_date_idx").on(table.handoverDate)
]);

export const stockReturns = pgTable("stock_returns", {
  id: text("id").primaryKey(),
  returnNumber: text("return_number").notNull().unique(),
  salesmanId: text("salesman_id").notNull().references(() => salesmen.id, { onDelete: 'restrict' }),
  officeId: text("office_id").references(() => offices.id, { onDelete: 'restrict' }),
  returnDate: text("return_date").notNull(),
  status: text("status").default("PENDING"),
  items: jsonb("items").notNull(),
  notes: text("notes"),
  approvedBy: text("approved_by").references(() => users.id, { onDelete: 'restrict' }),
  createdAt: timestamp("created_at").defaultNow(),
  metadata: jsonb("metadata")
}, (table) => [
  index("return_salesman_idx").on(table.salesmanId),
  index("return_date_idx").on(table.returnDate)
]);

export const stockReceivings = pgTable("stock_receivings", {
  id: text("id").primaryKey(),
  receivingNumber: text("receiving_number").notNull().unique(),
  poNumber: text("po_number"),
  officeId: text("office_id").notNull().references(() => offices.id, { onDelete: 'restrict' }),
  supplierName: text("supplier_name"),
  receivedDate: text("received_date").notNull(),
  status: text("status").default("DRAFT"), // DRAFT, POSTED
  totalQuantity: integer("total_quantity").default(0),
  totalValue: doublePrecision("total_value").default(0),
  items: jsonb("items").notNull(),
  notes: text("notes"),
  receivedBy: text("received_by").notNull().references(() => users.id, { onDelete: 'restrict' }),
  postedBy: text("posted_by").references(() => users.id, { onDelete: 'restrict' }),
  postedAt: timestamp("posted_at"),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow(),
  metadata: jsonb("metadata")
}, (table) => [
  index("receiving_office_idx").on(table.officeId),
  index("receiving_date_idx").on(table.receivedDate)
]);

export const salesStockLedgers = pgTable("sales_stock_ledgers", {
  id: text("id").primaryKey(),
  salesmanId: text("salesman_id").notNull().references(() => salesmen.id, { onDelete: 'restrict' }),
  date: text("date").notNull(),
  skuId: text("sku_id").notNull().references(() => skus.id, { onDelete: 'restrict' }),
  initialStock: integer("initial_stock").default(0),
  loadedStock: integer("loaded_stock").default(0),
  soldStock: integer("sold_stock").default(0),
  returnedStock: integer("returned_stock").default(0),
  finalStock: integer("final_stock").default(0),
  metadata: jsonb("metadata")
}, (table) => [
  index("ssl_salesman_idx").on(table.salesmanId),
  index("ssl_date_idx").on(table.date),
  uniqueIndex("ssl_salesman_date_sku_uniq").on(table.salesmanId, table.date, table.skuId)
]);

// 15. Targets & Audit Logs
export const targets = pgTable("targets", {
  id: text("id").primaryKey(),
  salesmanId: text("salesman_id").notNull().references(() => salesmen.id, { onDelete: 'restrict' }),
  periodMonth: text("period_month").notNull(),
  targetRevenue: doublePrecision("target_revenue").default(0),
  targetVolume: integer("target_volume").default(0),
  targetCalls: integer("target_calls").default(0),
  targetEffectiveCalls: integer("target_effective_calls").default(0),
  targetNewOutlets: integer("target_new_outlets").default(0),
  achievedRevenue: doublePrecision("achieved_revenue").default(0),
  metadata: jsonb("metadata")
}, (table) => [
  uniqueIndex("target_salesman_period_uniq").on(table.salesmanId, table.periodMonth)
]);

export const auditLogs = pgTable("audit_logs", {
  id: text("id").primaryKey(),
  userId: text("user_id").notNull().references(() => users.id, { onDelete: 'restrict' }),
  action: text("action").notNull(),
  module: text("module").notNull(),
  targetId: text("target_id"),
  details: jsonb("details"),
  ipAddress: text("ip_address"),
  timestamp: timestamp("timestamp").defaultNow()
}, (table) => [
  index("audit_user_idx").on(table.userId),
  index("audit_time_idx").on(table.timestamp)
]);

// Legacy document store for migration purposes
export const dmsDocumentStore = pgTable("dms_document_store", {
  id: text("id").primaryKey(),
  collectionName: text("collection_name").notNull(),
  data: jsonb("data").notNull(),
  createdAt: timestamp("created_at").defaultNow(),
  updatedAt: timestamp("updated_at").defaultNow()
});

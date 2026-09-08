/**
 * DMS-MIM-V22 Cloud Firestore SSOT Schema Definitions
 * Pure TypeScript interfaces, types, collection tokens, and query operators.
 * Completely free of Drizzle ORM and SQL dependencies.
 */

// ============================================================================
// 1. CORE DOMAIN TYPES & ENUMS
// ============================================================================

export type UserRole = "ADMIN" | "MANAGER" | "SALESMAN" | "SALES" | "LOGISTICS" | "WAREHOUSE" | "FINANCE" | "DRIVER";
export type UserStatus = "ACTIVE" | "INACTIVE" | "SUSPENDED";

export type OutletStatus = "ACTIVE" | "PENDING" | "INACTIVE" | "ARCHIVED";
export type OutletType = "RETAIL" | "WHOLESALE" | "MODERN_TRADE" | "GENERAL_TRADE" | "AGENT" | "STORE";

export type PaymentMethod = "CASH" | "TRANSFER" | "TOP" | "TEMPO" | "CREDIT";
export type PaymentStatus = "PAID" | "UNPAID" | "PARTIAL" | "CANCELLED";
export type DeliveryStatus = "DELIVERED" | "PENDING" | "SHIPPED" | "CANCELLED";

export type StockMovementType =
  | "INITIAL_SETUP"
  | "RECEIVING"
  | "HANDOVER_OUT"
  | "HANDOVER_IN"
  | "SALES_OUT"
  | "RETURN_OUT"
  | "RETURN_IN"
  | "ADJUSTMENT"
  | "TRANSFER_IN"
  | "TRANSFER_OUT"
  | "CANCELLATION";

export type CallResult = "ORDER" | "NO_ORDER" | "OUTLET_CLOSED" | "OWNER_NOT_MET" | "RESCHEDULED" | "OTHER";

// ============================================================================
// 2. FIRESTORE DOCUMENT INTERFACES
// ============================================================================

export interface User {
  _id?: string;
  id: string;
  name: string;
  email: string;
  role: UserRole;
  status: UserStatus;
  phone?: string | null;
  passwordHash?: string | null;
  avatarUrl?: string | null;
  officeId?: string | null;
  areaId?: string | null;
  lastLogin?: string | Date | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  metadata?: Record<string, any>;
}

export interface CompanyProfile {
  _id?: string;
  id: string;
  companyName: string;
  companyLegalName?: string | null;
  companyCode?: string | null;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  website?: string | null;
  description?: string | null;
  logoUrl?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  updatedBy?: string | null;
  metadata?: Record<string, any>;
}

export interface SystemSettings {
  _id?: string;
  id: string;
  settingsData: Record<string, any>;
  updatedAt?: string | Date;
  updatedBy?: string | null;
}

export interface Office {
  _id?: string;
  id: string;
  code: string;
  name: string;
  type: string;
  address?: string | null;
  phone?: string | null;
  email?: string | null;
  status: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  metadata?: Record<string, any>;
}

export interface Area {
  _id?: string;
  id: string;
  name: string;
  officeId: string;
  status?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  metadata?: Record<string, any>;
}

export interface Channel {
  _id?: string;
  id: string;
  name: string;
  status?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface Route {
  _id?: string;
  id: string;
  code: string;
  name: string;
  areaId: string;
  dayOfWeek: number;
  status?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface Salesman {
  _id?: string;
  id: string;
  userId: string;
  code: string;
  name: string;
  phone?: string | null;
  officeId: string;
  status?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface Product {
  _id?: string;
  id: string;
  code: string;
  name: string;
  category?: string | null;
  status: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  metadata?: Record<string, any>;
}

export interface UomConversion {
  uom: string;
  conversionFactor: number;
  isBase?: boolean;
}

export interface Sku {
  _id?: string;
  id: string;
  productId: string;
  code: string;
  name: string;
  baseUom: string;
  uomConversions?: UomConversion[];
  price?: number;
  status: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  metadata?: Record<string, any>;
}

export interface WarehouseStock {
  warehouseId: string;
  skuId: string;
  stockOnHand: number;
  availableStock: number;
  allocatedStock: number;
  lastUpdated: string;
}

export interface InventoryItem {
  _id?: string;
  id: string;
  locationType: "WAREHOUSE" | "SALES" | "OFFICE" | "TRANSIT";
  locationId: string;
  skuId: string;
  stockOnHand: number;
  availableStock: number;
  allocatedStock: number;
  reservedStock?: number;
  status: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  metadata?: Record<string, any>;
}

export interface StockMovement {
  _id?: string;
  id: string;
  movementType: StockMovementType;
  sourceLocationType: string;
  sourceLocationId: string;
  destLocationType: string;
  destLocationId: string;
  skuId: string;
  quantity: number;
  referenceId?: string | null;
  performedBy: string;
  notes?: string | null;
  createdAt?: string | Date;
  metadata?: Record<string, any>;
}

export interface Outlet {
  _id?: string;
  id: string;
  outletCode: string;
  outletName: string;
  ownerName?: string | null;
  phone?: string | null;
  address?: string | null;
  latitude?: number | null;
  longitude?: number | null;
  channelId?: string | null;
  areaId?: string | null;
  status: OutletStatus;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  metadata?: Record<string, any>;
}

export interface SalesOutlet {
  _id?: string;
  id: string;
  salesmanId: string;
  outletId: string;
  assignedAt?: string | Date;
}

export interface CallPlan {
  _id?: string;
  id: string;
  salesmanId: string;
  date: string;
  status: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  metadata?: Record<string, any>;
}

export interface CallPlanItem {
  _id?: string;
  id: string;
  callPlanId: string;
  outletId: string;
  sequenceOrder: number;
  isVisited?: boolean;
}

export interface Attendance {
  _id?: string;
  id: string;
  salesmanId: string;
  date: string;
  checkInTime?: string | Date | null;
  checkInLatitude?: number | null;
  checkInLongitude?: number | null;
  checkOutTime?: string | Date | null;
  checkOutLatitude?: number | null;
  checkOutLongitude?: number | null;
  status?: string;
  createdAt?: string | Date;
}

export interface GpsEvent {
  _id?: string;
  id: string;
  salesmanId: string;
  latitude: number;
  longitude: number;
  timestamp: string | Date;
  eventType?: string;
  metadata?: Record<string, any>;
}

export interface Visit {
  _id?: string;
  id: string;
  salesmanId: string;
  outletId: string;
  date?: string;
  checkInTime?: string | Date;
  checkOutTime?: string | Date | null;
  latitude?: number | null;
  longitude?: number | null;
  callResult?: CallResult;
  isEffectiveCall?: boolean;
  notes?: string | null;
  status?: string;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  metadata?: Record<string, any>;
}

export interface TransactionItem {
  sku_id: string;
  sku_name?: string;
  sku_code?: string;
  uom?: string;
  quantity: number;
  unit_price: number;
  subtotal: number;
  discount_amount?: number;
  final_amount?: number;
  metadata?: Record<string, any>;
}

export interface Transaction {
  _id?: string;
  id: string;
  invoiceNumber: string;
  salesmanId: string;
  outletId: string;
  visitId?: string | null;
  officeId?: string;
  transactionType?: string;
  subtotal: number;
  discountAmount?: number;
  taxAmount?: number;
  totalAmount: number;
  paidAmount?: number;
  paymentMethod?: PaymentMethod;
  paymentStatus: PaymentStatus;
  deliveryStatus: DeliveryStatus;
  items: TransactionItem[];
  notes?: string | null;
  createdAt?: string | Date;
  updatedAt?: string | Date;
  metadata?: Record<string, any>;
}

export interface StockHandover {
  _id?: string;
  id: string;
  salesmanId: string;
  warehouseId: string;
  date: string;
  status: string;
  items: any[];
  createdAt?: string | Date;
}

export interface StockReturn {
  _id?: string;
  id: string;
  salesmanId: string;
  warehouseId: string;
  date: string;
  status: string;
  items: any[];
  createdAt?: string | Date;
}

export interface StockReceiving {
  _id?: string;
  id: string;
  warehouseId: string;
  supplierName?: string;
  referenceNumber?: string;
  date: string;
  status: string;
  items: any[];
  createdAt?: string | Date;
}

export interface SalesStockLedger {
  _id?: string;
  id: string;
  salesmanId: string;
  date: string;
  skuId: string;
  initialStock: number;
  loadedStock: number;
  soldStock: number;
  returnedStock: number;
  finalStock: number;
  updatedAt?: string | Date;
}

export interface Target {
  _id?: string;
  id: string;
  salesmanId: string;
  month: string;
  targetAmount: number;
  actualAmount: number;
  createdAt?: string | Date;
  updatedAt?: string | Date;
}

export interface AuditLog {
  _id?: string;
  id: string;
  userId?: string;
  action: string;
  entityName: string;
  entityId?: string;
  payload?: Record<string, any>;
  ipAddress?: string;
  createdAt?: string | Date;
}

// ============================================================================
// 3. COLLECTION DESCRIPTORS & TOKENS (LIGHTWEIGHT PROXY)
// ============================================================================

export function createCollectionToken(name: string): any {
  const base: any = {
    tableName: name,
    name,
    _id: name,
    toString() { return name; }
  };
  return new Proxy(base, {
    get(target, prop) {
      if (prop in target) return target[prop];
      if (typeof prop === "string") {
        return {
          name: prop,
          columnName: prop,
          table: name,
          queryChunks: [{ name: prop, columnName: prop }],
          toString() { return `${name}.${prop}`; },
        };
      }
      return undefined;
    }
  });
}

export const users = createCollectionToken("users");
export const companyProfile = createCollectionToken("company_profile");
export const systemSettings = createCollectionToken("system_settings");
export const offices = createCollectionToken("offices");
export const provinces = createCollectionToken("provinces");
export const regencies = createCollectionToken("regencies");
export const districts = createCollectionToken("districts");
export const villages = createCollectionToken("villages");
export const areas = createCollectionToken("areas");
export const channels = createCollectionToken("channels");
export const routes = createCollectionToken("routes");
export const products = createCollectionToken("products");
export const skus = createCollectionToken("skus");
export const prices = createCollectionToken("prices");
export const promos = createCollectionToken("promos");
export const salesmen = createCollectionToken("salesmen");
export const openCallReasons = createCollectionToken("open_call_reasons");
export const outlets = createCollectionToken("outlets");
export const salesOutlets = createCollectionToken("sales_outlets");
export const callPlans = createCollectionToken("call_plans");
export const callPlanItems = createCollectionToken("call_plan_items");
export const attendance = createCollectionToken("attendance");
export const gpsEvents = createCollectionToken("gps_events");
export const visits = createCollectionToken("visits");
export const transactions = createCollectionToken("transactions");
export const inventory = createCollectionToken("inventory");
export const stockMovements = createCollectionToken("stock_movements");
export const stockHandovers = createCollectionToken("stock_handovers");
export const stockReturns = createCollectionToken("stock_returns");
export const stockReceivings = createCollectionToken("stock_receivings");
export const salesStockLedgers = createCollectionToken("sales_stock_ledgers");
export const targets = createCollectionToken("targets");
export const auditLogs = createCollectionToken("audit_logs");
export const dmsDocumentStore = createCollectionToken("dms_document_store");

// ============================================================================
// 4. QUERY FILTER OPERATORS (STANDALONE ZERO-DEPENDENCY)
// ============================================================================

export function sql(strings: TemplateStringsArray, ...values: any[]): any {
  const text = strings.reduce((prev, curr, i) => prev + curr + (values[i] !== undefined ? String(values[i]) : ""), "");
  return {
    text,
    queryChunks: [{ text, value: text }],
    toString: () => text
  };
}
sql.raw = (str: string): any => ({ text: str, queryChunks: [{ text: str, value: str }], toString: () => str });

export function eq(column: any, value: any): any {
  const colName = typeof column === "string" ? column : (column?.name || column?.columnName || String(column));
  return {
    op: "eq",
    column,
    value,
    val: value,
    queryChunks: [
      { name: colName, columnName: colName },
      { value }
    ]
  };
}

export function and(...conditions: any[]): any {
  return {
    op: "and",
    conditions: conditions.flat().filter(Boolean),
    queryChunks: conditions.flat().filter(Boolean)
  };
}

export function or(...conditions: any[]): any {
  return {
    op: "or",
    conditions: conditions.flat().filter(Boolean),
    queryChunks: conditions.flat().filter(Boolean)
  };
}

export function ilike(column: any, value: any): any {
  const colName = typeof column === "string" ? column : (column?.name || column?.columnName || String(column));
  return {
    op: "ilike",
    column,
    value,
    val: value,
    queryChunks: [
      { name: colName, columnName: colName },
      { value }
    ]
  };
}

export function gte(column: any, value: any): any {
  const colName = typeof column === "string" ? column : (column?.name || column?.columnName || String(column));
  return {
    op: "gte",
    column,
    value,
    val: value,
    queryChunks: [
      { name: colName, columnName: colName },
      { value }
    ]
  };
}

export function lte(column: any, value: any): any {
  const colName = typeof column === "string" ? column : (column?.name || column?.columnName || String(column));
  return {
    op: "lte",
    column,
    value,
    val: value,
    queryChunks: [
      { name: colName, columnName: colName },
      { value }
    ]
  };
}

export function inArray(column: any, values: any[]): any {
  const colName = typeof column === "string" ? column : (column?.name || column?.columnName || String(column));
  return {
    op: "inArray",
    column,
    values,
    val: values,
    queryChunks: [
      { name: colName, columnName: colName },
      { value: values }
    ]
  };
}

export function desc(column: any): any {
  const colName = typeof column === "string" ? column : (column?.name || column?.columnName || String(column));
  return {
    op: "desc",
    column,
    direction: "desc",
    queryChunks: [{ name: colName, direction: "desc" }]
  };
}

export function asc(column: any): any {
  const colName = typeof column === "string" ? column : (column?.name || column?.columnName || String(column));
  return {
    op: "asc",
    column,
    direction: "asc",
    queryChunks: [{ name: colName, direction: "asc" }]
  };
}

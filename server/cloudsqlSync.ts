/**
 * Cloud SQL & PostgreSQL Decommissioned Stub.
 * Google Cloud Firestore is the Single Source of Truth (SSOT).
 */

export const isCloudSqlConnected = false;

export async function initializeCloudSqlTables(): Promise<boolean> {
  return false;
}

export async function loadAllFromPostgres(_inMemoryDb?: any): Promise<boolean> {
  return false;
}

export async function syncDocToPostgres(_collectionName: string, _docId: string, _data: any): Promise<boolean> {
  return false;
}

export async function deleteDocFromPostgres(_collectionName: string, _docId: string): Promise<boolean> {
  return false;
}

export async function migrateAllToCloudSql(): Promise<{ success: boolean; message: string; totalRecords: number }> {
  return {
    success: true,
    message: "Cloud SQL & PostgreSQL telah dihapus. Sistem beroperasi 100% menggunakan Google Cloud Firestore (Single Source of Truth).",
    totalRecords: 0,
  };
}

export async function getCloudSqlStats() {
  return {
    isConnected: false,
    status: "DECOMMISSIONED",
    message: "Cloud SQL & PostgreSQL telah dihapus dari sistem. Google Cloud Firestore aktif sebagai Single Source of Truth (SSOT).",
    tableCount: 0,
    persistedRecords: 0,
    databaseEngine: "Google Cloud Firestore (Enterprise SSOT)",
    tables: [],
    poolStatus: {
      totalCount: 0,
      idleCount: 0,
      waitingCount: 0,
    },
  };
}

export async function testCloudSqlConnection() {
  return {
    isConnected: false,
    success: false,
    message: "Cloud SQL & PostgreSQL telah dihapus dan dinonaktifkan dari sistem. Seluruh data dipusatkan di Google Cloud Firestore.",
  };
}

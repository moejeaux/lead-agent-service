import { config } from "../config";

/**
 * Database client
 * Uses in-memory store if DATABASE_URL not configured
 * Can be extended to use Postgres with pg or Prisma
 */

// In-memory store for development/testing
const inMemoryStore: Map<string, unknown> = new Map();

export const db = {
  /**
   * Check if database is available
   */
  isConnected(): boolean {
    return !!config.databaseUrl || true; // Always true for in-memory
  },

  /**
   * Insert a record
   */
  async insert<T extends { decisionId: string }>(table: string, record: T): Promise<T> {
    if (config.databaseUrl) {
      // TODO: Implement actual Postgres insert
      console.log(`[db] Would insert into ${table}:`, record.decisionId);
    }
    
    // In-memory fallback
    const key = `${table}:${record.decisionId}`;
    inMemoryStore.set(key, record);
    return record;
  },

  /**
   * Query recent records
   */
  async queryRecent<T>(table: string, limit: number): Promise<T[]> {
    if (config.databaseUrl) {
      // TODO: Implement actual Postgres query
      console.log(`[db] Would query ${table} limit ${limit}`);
    }
    
    // In-memory fallback
    const results: T[] = [];
    for (const [key, value] of inMemoryStore.entries()) {
      if (key.startsWith(`${table}:`)) {
        results.push(value as T);
      }
    }
    return results.slice(-limit);
  },

  /**
   * Get a record by ID
   */
  async getById<T>(table: string, id: string): Promise<T | null> {
    const key = `${table}:${id}`;
    return (inMemoryStore.get(key) as T) || null;
  }
};


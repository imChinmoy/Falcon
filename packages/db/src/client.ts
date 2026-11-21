import { drizzle, PostgresJsDatabase } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { createPostgresClient, closePostgresClient, PostgresClientOptions } from './connection.js';
import * as defaultSchema from './schema/index.js';

export type FalconDatabase<TSchema extends Record<string, unknown> = typeof defaultSchema> =
  PostgresJsDatabase<TSchema>;

export interface CreateDbOptions<
  TSchema extends Record<string, unknown> = typeof defaultSchema,
> extends PostgresClientOptions {
  readonly sql?: postgres.Sql | undefined;
  readonly schema?: TSchema | undefined;
}

let cachedSql: postgres.Sql | null = null;
let cachedDb: FalconDatabase<Record<string, unknown>> | null = null;

/**
 * Creates a new Drizzle ORM database instance wrapping postgres.js.
 */
export function createDb<TSchema extends Record<string, unknown> = typeof defaultSchema>(
  options?: CreateDbOptions<TSchema>,
): { db: FalconDatabase<TSchema>; sql: postgres.Sql } {
  const sql = options?.sql ?? createPostgresClient(options);
  const schemaObj = (options?.schema ?? defaultSchema) as TSchema;
  const db = drizzle(sql, { schema: schemaObj });

  return { db, sql };
}

/**
 * Retrieves or lazily initializes the singleton Drizzle ORM database instance.
 */
export function getDb<TSchema extends Record<string, unknown> = typeof defaultSchema>(
  options?: CreateDbOptions<TSchema>,
): FalconDatabase<TSchema> {
  if (!cachedDb) {
    const { db, sql } = createDb(options);
    cachedDb = db as unknown as FalconDatabase<Record<string, unknown>>;
    cachedSql = sql;
  }
  return cachedDb as unknown as FalconDatabase<TSchema>;
}

/**
 * Closes the cached singleton database connection and resets the singleton state.
 */
export async function closeDb(options?: { readonly timeout?: number | undefined }): Promise<void> {
  if (cachedSql) {
    await closePostgresClient(cachedSql, options);
    cachedSql = null;
  }
  cachedDb = null;
}

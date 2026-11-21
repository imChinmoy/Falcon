import { sql as drizzleSql } from 'drizzle-orm';
import postgres from 'postgres';
import { Result, ok, err } from '@falcon/domain';
import { FalconDatabase, getDb } from './client.js';

export interface DbHealthStatus {
  readonly connected: boolean;
  readonly latencyMs: number;
  readonly version?: string | undefined;
}

export interface DbHealthError {
  readonly error: string;
  readonly latencyMs?: number | undefined;
}

export interface CheckConnectionOptions {
  readonly timeoutMs?: number | undefined;
}

/**
 * Checks connection health to PostgreSQL / Supabase with a configurable timeout.
 * Accepts either a raw `postgres.Sql` client or a Drizzle `FalconDatabase` instance.
 * Defaults to calling `getDb()` if no instance is provided.
 */
export async function checkDatabaseConnection(
  sqlOrDb?: postgres.Sql | FalconDatabase | undefined,
  options?: CheckConnectionOptions,
): Promise<Result<DbHealthStatus, DbHealthError>> {
  const timeoutMs = options?.timeoutMs ?? 5000;
  const target = sqlOrDb ?? getDb();
  const start = performance.now();

  try {
    const queryPromise = (async (): Promise<{ version?: string | undefined }> => {
      // Check if target is a Drizzle database instance (has .execute)
      if (
        typeof target === 'object' &&
        target !== null &&
        'execute' in target &&
        typeof (target as FalconDatabase).execute === 'function'
      ) {
        const rows = (await (target as FalconDatabase).execute(
          drizzleSql`SELECT 1 as connected, version() as version`,
        )) as unknown as Array<{ version?: string }>;
        const firstRow = rows[0];
        return { version: firstRow?.version };
      }

      // If target is a postgres.js client (callable function)
      if (typeof target === 'function') {
        const sqlClient = target as postgres.Sql;
        const rows = await sqlClient`SELECT 1 as connected, version() as version`;
        const firstRow = rows[0] as { version?: string } | undefined;
        return { version: firstRow?.version };
      }

      throw new Error('Unsupported database client instance passed to checkDatabaseConnection');
    })();

    let timer: NodeJS.Timeout | undefined;
    const timeoutPromise = new Promise<never>((_, reject) => {
      timer = setTimeout(() => {
        reject(new Error(`Database healthcheck timed out after ${timeoutMs}ms`));
      }, timeoutMs);
    });

    const result = await Promise.race([queryPromise, timeoutPromise]);
    if (timer) clearTimeout(timer);

    const latencyMs = Math.round(performance.now() - start);

    return ok({
      connected: true,
      latencyMs,
      ...(result.version !== undefined ? { version: result.version } : {}),
    });
  } catch (error) {
    const latencyMs = Math.round(performance.now() - start);
    return err({
      error: error instanceof Error ? error.message : String(error),
      latencyMs,
    });
  }
}

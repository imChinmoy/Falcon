import postgres from 'postgres';
import {
  getDbConfig,
  DbConfig,
  validateDbConfig,
  normalizePostgresUrl,
  isPoolerUrl,
  maskSensitiveCredentials,
} from './config.js';

export interface PostgresClientOptions {
  readonly config?: DbConfig | undefined;
  readonly url?: string | undefined;
  readonly maxConnections?: number | undefined;
  readonly idleTimeout?: number | undefined;
  readonly connectTimeout?: number | undefined;
  readonly ssl?: boolean | 'require' | 'allow' | 'prefer' | 'verify-full' | undefined;
  readonly prepare?: boolean | undefined;
}

/**
 * Creates and configures a postgres.js client instance optimized for Supabase.
 * - For transaction-mode poolers (port 6543), `prepare: false` is enabled automatically.
 * - SSL is configured as 'require' for remote connections.
 * - Safely handles password encoding with '@' characters.
 */
export function createPostgresClient(options?: PostgresClientOptions): postgres.Sql {
  const config = options?.config ?? getDbConfig();
  const rawUrl = options?.url ?? config.databaseUrl;

  if (!rawUrl) {
    const validation = validateDbConfig(config);
    if (!validation.ok) {
      throw new Error(
        `Database connection failed: ${maskSensitiveCredentials(validation.error.message)}`,
      );
    }
    throw new Error('Database connection failed: DATABASE_URL is not set');
  }

  const url = normalizePostgresUrl(rawUrl);

  // Detect whether to disable prepared statements (required for Supabase PgBouncer / transaction pooler on port 6543)
  const isPooler = isPoolerUrl(url);
  const prepare = options?.prepare !== undefined ? options.prepare : !isPooler;

  // Configure SSL
  let ssl: boolean | 'require' | 'allow' | 'prefer' | 'verify-full' = false;
  if (options?.ssl !== undefined) {
    ssl = options.ssl;
  } else if (config.ssl) {
    ssl = 'require';
  }

  const max = options?.maxConnections ?? config.maxConnections;
  const idle_timeout = options?.idleTimeout ?? config.idleTimeout;
  const connect_timeout = options?.connectTimeout ?? 10;

  return postgres(url, {
    max,
    idle_timeout,
    connect_timeout,
    prepare,
    ssl,
  });
}

/**
 * Gracefully closes a postgres.js client instance.
 */
export async function closePostgresClient(
  sql: postgres.Sql,
  options?: { readonly timeout?: number | undefined },
): Promise<void> {
  const timeout = options?.timeout ?? 5;
  await sql.end({ timeout });
}

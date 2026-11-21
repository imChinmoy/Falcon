import path from 'node:path';
import { fileURLToPath } from 'node:url';
import dotenv from 'dotenv';
import { Result, ok, err } from '@falcon/domain';

// Load .env from current working directory
dotenv.config();

// If DATABASE_URL is not set, also try loading packages/db/.env relative to module location
if (!process.env['DATABASE_URL']) {
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const packageEnvPath = path.resolve(currentDir, '../.env');
    dotenv.config({ path: packageEnvPath });
  } catch {
    // Ignore error if import.meta.url or path resolution fails
  }
}

export interface DbConfig {
  readonly databaseUrl: string | undefined;
  readonly directUrl: string | undefined;
  readonly supabaseUrl: string | undefined;
  readonly supabaseAnonKey: string | undefined;
  readonly supabaseServiceRoleKey: string | undefined;
  readonly maxConnections: number;
  readonly idleTimeout: number;
  readonly ssl: boolean;
  readonly isPooler: boolean;
}

export interface DbConfigError {
  readonly code: 'MISSING_DATABASE_URL' | 'INVALID_DATABASE_URL' | 'INVALID_CONFIG';
  readonly message: string;
  readonly details?: Record<string, unknown> | undefined;
}

/**
 * Sanitizes a PostgreSQL connection URL by masking password credentials.
 * e.g. "postgresql://user:secret@host:5432/db" -> "postgresql://user:********@host:5432/db"
 */
export function sanitizeDatabaseUrl(rawUrl: string | undefined): string {
  if (!rawUrl) return '';
  try {
    const normalized = normalizePostgresUrl(rawUrl);
    const parsed = new URL(normalized);
    if (parsed.password) {
      parsed.password = '********';
    }
    return parsed.toString();
  } catch {
    return rawUrl.replace(/(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/g, '$1********$3');
  }
}

/**
 * Masks database passwords, API tokens, and secret credentials inside any arbitrary message or log output.
 */
export function maskSensitiveCredentials(text: string): string {
  if (!text) return '';
  return text
    .replace(/(postgres(?:ql)?:\/\/[^:]+:)([^@]+)(@)/g, '$1********$3')
    .replace(
      /((?:anon|service_role|apikey|password|secret|bearer)=['"]?)([^'"\s&]+)(['"]?)/gi,
      '$1********$3',
    );
}

/**
 * Normalizes PostgreSQL connection URLs by safely percent-encoding '@' characters
 * inside the password portion to prevent parser ambiguities.
 */
export function normalizePostgresUrl(rawUrl: string): string {
  const match = rawUrl.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.*)@([^@/]+(?::\d+)?(?:\/.*)?)$/);
  if (match) {
    const protocol = match[1] ?? '';
    const user = match[2] ?? '';
    const pass = match[3] ?? '';
    const rest = match[4] ?? '';
    return `${protocol}${user}:${pass.replace(/@/g, '%40')}@${rest}`;
  }
  return rawUrl;
}

/**
 * Checks if a hostname or URL represents a local environment
 */
export function isLocalHost(hostOrUrl: string): boolean {
  try {
    const normalized = normalizePostgresUrl(hostOrUrl);
    const parsed = new URL(normalized);
    return (
      parsed.hostname === 'localhost' ||
      parsed.hostname === '127.0.0.1' ||
      parsed.hostname === '::1'
    );
  } catch {
    const lower = hostOrUrl.toLowerCase();
    return (
      lower === 'localhost' ||
      lower === '127.0.0.1' ||
      lower === '::1' ||
      lower.includes('@localhost') ||
      lower.includes('@127.0.0.1') ||
      lower.includes('//localhost') ||
      lower.includes('//127.0.0.1')
    );
  }
}

/**
 * Detects whether a PostgreSQL connection URL points to a transaction pooler
 * (such as Supabase Transaction pooler on port 6543)
 */
export function isPoolerUrl(url: string): boolean {
  const normalized = normalizePostgresUrl(url);
  try {
    const parsed = new URL(normalized);
    return parsed.port === '6543' || parsed.hostname.includes('.pooler.');
  } catch {
    return url.includes(':6543') || url.includes('.pooler.');
  }
}

/**
 * Parses and returns the typed database configuration from environment variables or custom overrides.
 */
export function getDbConfig(customEnv?: Record<string, string | undefined>): DbConfig {
  const env = customEnv ?? process.env;

  const rawDbUrl = env.DATABASE_URL?.trim() || undefined;
  const databaseUrl = rawDbUrl ? normalizePostgresUrl(rawDbUrl) : undefined;
  const rawDirectUrl = env.DIRECT_URL?.trim() || undefined;
  const directUrl = rawDirectUrl ? normalizePostgresUrl(rawDirectUrl) : undefined;
  const supabaseUrl = env.SUPABASE_URL?.trim() || undefined;
  const supabaseAnonKey = env.SUPABASE_ANON_KEY?.trim() || undefined;
  const supabaseServiceRoleKey = env.SUPABASE_SERVICE_ROLE_KEY?.trim() || undefined;

  const maxConnections = env.DB_MAX_CONNECTIONS
    ? Number.parseInt(env.DB_MAX_CONNECTIONS, 10) || 10
    : 10;

  const idleTimeout = env.DB_IDLE_TIMEOUT ? Number.parseInt(env.DB_IDLE_TIMEOUT, 10) || 20 : 20;

  let ssl = true;
  let isPooler = false;

  if (databaseUrl) {
    isPooler = isPoolerUrl(databaseUrl);
    if (isLocalHost(databaseUrl)) {
      ssl = false;
    } else {
      try {
        const parsed = new URL(databaseUrl);
        const sslmode = parsed.searchParams.get('sslmode');
        if (sslmode === 'disable' || sslmode === 'false') {
          ssl = false;
        } else {
          ssl = true;
        }
      } catch {
        ssl = !databaseUrl.includes('sslmode=disable');
      }
    }
  }

  return {
    databaseUrl,
    directUrl,
    supabaseUrl,
    supabaseAnonKey,
    supabaseServiceRoleKey,
    maxConnections,
    idleTimeout,
    ssl,
    isPooler,
  };
}

/**
 * Validates the database configuration, returning a typed Result.
 */
export function validateDbConfig(config: DbConfig): Result<DbConfig, DbConfigError> {
  if (!config.databaseUrl) {
    return err({
      code: 'MISSING_DATABASE_URL',
      message: 'DATABASE_URL is required but not configured in environment or options',
    });
  }

  const normalized = normalizePostgresUrl(config.databaseUrl);

  // Validate URL protocol and structure
  try {
    const url = new URL(normalized);
    if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
      return err({
        code: 'INVALID_DATABASE_URL',
        message: `DATABASE_URL must have postgres: or postgresql: protocol, received: ${url.protocol}`,
        details: { protocol: url.protocol },
      });
    }
  } catch (error) {
    const rawMsg = error instanceof Error ? error.message : String(error);
    return err({
      code: 'INVALID_DATABASE_URL',
      message: `Invalid DATABASE_URL format: ${maskSensitiveCredentials(rawMsg)}`,
    });
  }

  return ok(config);
}

import { createClient, SupabaseClient } from '@supabase/supabase-js';
import { getDbConfig, DbConfig } from './config.js';

export interface SupabaseClientOptions {
  readonly config?: DbConfig | undefined;
  readonly url?: string | undefined;
  readonly key?: string | undefined;
  readonly useServiceRole?: boolean | undefined;
  readonly auth?:
    | {
        readonly persistSession?: boolean | undefined;
        readonly autoRefreshToken?: boolean | undefined;
      }
    | undefined;
}

let cachedSupabase: SupabaseClient | null = null;

/**
 * Creates an instance of the Supabase JS client.
 */
export function createSupabaseClient(options?: SupabaseClientOptions): SupabaseClient {
  const config = options?.config ?? getDbConfig();
  const url = options?.url ?? config.supabaseUrl;

  const key =
    options?.key ??
    (options?.useServiceRole ? config.supabaseServiceRoleKey : undefined) ??
    config.supabaseAnonKey ??
    config.supabaseServiceRoleKey;

  if (!url || !key) {
    throw new Error(
      `Cannot initialize Supabase client: missing ${!url ? 'SUPABASE_URL' : ''}${!url && !key ? ' and ' : ''}${!key ? 'SUPABASE_KEY' : ''}`,
    );
  }

  return createClient(url, key, {
    auth: {
      persistSession: options?.auth?.persistSession ?? false,
      autoRefreshToken: options?.auth?.autoRefreshToken ?? false,
    },
  });
}

/**
 * Returns the cached singleton Supabase client or initializes a new one.
 */
export function getSupabaseClient(options?: SupabaseClientOptions): SupabaseClient {
  if (!cachedSupabase) {
    cachedSupabase = createSupabaseClient(options);
  }
  return cachedSupabase;
}

/**
 * Resets the cached singleton Supabase client.
 */
export function resetSupabaseClient(): void {
  cachedSupabase = null;
}

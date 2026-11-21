import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import postgres from 'postgres';
import {
  getDbConfig,
  validateDbConfig,
  normalizePostgresUrl,
  isPoolerUrl,
  isLocalHost,
  sanitizeDatabaseUrl,
  maskSensitiveCredentials,
} from '../config.js';
import { createPostgresClient, closePostgresClient } from '../connection.js';
import { getDb, createDb, closeDb, FalconDatabase } from '../client.js';
import { createSupabaseClient, getSupabaseClient, resetSupabaseClient } from '../supabase.js';
import { checkDatabaseConnection } from '../health.js';

describe('Database Configuration & URL normalization', () => {
  it('should normalize passwords with @ character in postgres connection strings', () => {
    const raw =
      'postgresql://postgres.bdehscovmcmjncloifbk:iam@Kaiser07@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres';
    const normalized = normalizePostgresUrl(raw);
    expect(normalized).toBe(
      'postgresql://postgres.bdehscovmcmjncloifbk:iam%40Kaiser07@aws-1-ap-northeast-1.pooler.supabase.com:6543/postgres',
    );
  });

  it('should not alter already encoded or clean passwords', () => {
    const clean = 'postgresql://myuser:mypassword@localhost:5432/mydb';
    expect(normalizePostgresUrl(clean)).toBe(clean);

    const alreadyEncoded =
      'postgresql://postgres.ref:iam%40Kaiser07@aws-0.pooler.supabase.com:6543/postgres';
    expect(normalizePostgresUrl(alreadyEncoded)).toBe(alreadyEncoded);
  });

  it('should detect pooler URLs correctly based on port or hostname', () => {
    expect(
      isPoolerUrl('postgresql://user:pass@aws-0-ap-southeast-1.pooler.supabase.com:6543/postgres'),
    ).toBe(true);
    expect(isPoolerUrl('postgresql://user:pass@localhost:6543/postgres')).toBe(true);
    expect(isPoolerUrl('postgresql://user:pass@localhost:5432/postgres')).toBe(false);
    expect(
      isPoolerUrl('postgresql://user:pass@db.bdehscovmcmjncloifbk.supabase.co:5432/postgres'),
    ).toBe(false);
  });

  it('should detect localhost correctly', () => {
    expect(isLocalHost('localhost')).toBe(true);
    expect(isLocalHost('127.0.0.1')).toBe(true);
    expect(isLocalHost('postgresql://user:pass@localhost:5432/db')).toBe(true);
    expect(isLocalHost('postgresql://user:pass@127.0.0.1:5432/db')).toBe(true);
    expect(isLocalHost('postgresql://user:pass@aws-1.pooler.supabase.com:6543/postgres')).toBe(
      false,
    );
  });

  it('should parse environment variables into typed DbConfig', () => {
    const customEnv: Record<string, string | undefined> = {
      DATABASE_URL:
        'postgresql://postgres.test:iam@Kaiser07@aws-1.pooler.supabase.com:6543/postgres',
      DIRECT_URL: 'postgresql://postgres.test:secret@aws-1.pooler.supabase.com:5432/postgres',
      SUPABASE_URL: 'https://test-project.supabase.co',
      SUPABASE_ANON_KEY: 'test-anon-key',
      SUPABASE_SERVICE_ROLE_KEY: 'test-service-key',
      DB_MAX_CONNECTIONS: '25',
      DB_IDLE_TIMEOUT: '45',
    };

    const config = getDbConfig(customEnv);
    expect(config.databaseUrl).toBe(
      'postgresql://postgres.test:iam%40Kaiser07@aws-1.pooler.supabase.com:6543/postgres',
    );
    expect(config.directUrl).toBe(
      'postgresql://postgres.test:secret@aws-1.pooler.supabase.com:5432/postgres',
    );
    expect(config.supabaseUrl).toBe('https://test-project.supabase.co');
    expect(config.supabaseAnonKey).toBe('test-anon-key');
    expect(config.supabaseServiceRoleKey).toBe('test-service-key');
    expect(config.maxConnections).toBe(25);
    expect(config.idleTimeout).toBe(45);
    expect(config.isPooler).toBe(true);
    expect(config.ssl).toBe(true);
  });

  it('should disable SSL for localhost or explicit sslmode=disable', () => {
    const localConfig = getDbConfig({
      DATABASE_URL: 'postgresql://postgres:postgres@localhost:5432/falcon',
    });
    expect(localConfig.ssl).toBe(false);

    const sslmodeDisableConfig = getDbConfig({
      DATABASE_URL: 'postgresql://user:pass@remote.server.com:5432/falcon?sslmode=disable',
    });
    expect(sslmodeDisableConfig.ssl).toBe(false);
  });

  it('should validate valid database configuration successfully', () => {
    const config = getDbConfig({
      DATABASE_URL: 'postgresql://user:pass@aws-0.pooler.supabase.com:6543/postgres',
    });
    const result = validateDbConfig(config);
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.maxConnections).toBe(10);
      expect(result.value.idleTimeout).toBe(20);
      expect(result.value.isPooler).toBe(true);
    }
  });

  it('should fail validation when DATABASE_URL is missing or invalid', () => {
    const missing = getDbConfig({ DATABASE_URL: '' });
    const missingResult = validateDbConfig(missing);
    expect(missingResult.ok).toBe(false);
    if (!missingResult.ok) {
      expect(missingResult.error.code).toBe('MISSING_DATABASE_URL');
    }

    const invalidProto = getDbConfig({ DATABASE_URL: 'https://example.com/db' });
    const protoResult = validateDbConfig(invalidProto);
    expect(protoResult.ok).toBe(false);
    if (!protoResult.ok) {
      expect(protoResult.error.code).toBe('INVALID_DATABASE_URL');
    }
  });

  it('should mask database passwords with sanitizeDatabaseUrl and maskSensitiveCredentials', () => {
    const rawUrl =
      'postgresql://postgres.test:iam@Kaiser07@aws-1.pooler.supabase.com:6543/postgres';
    const sanitized = sanitizeDatabaseUrl(rawUrl);
    expect(sanitized).not.toContain('iam@Kaiser07');
    expect(sanitized).not.toContain('iam%40Kaiser07');
    expect(sanitized).toContain('********');

    const simpleUrl = 'postgres://admin:secretPass123@localhost:5432/mydb';
    const sanitizedSimple = sanitizeDatabaseUrl(simpleUrl);
    expect(sanitizedSimple).toBe('postgres://admin:********@localhost:5432/mydb');

    const errorMsg = `Connection failed to postgres://user:superSecret@db.host.com:5432/db with apikey=xyz123`;
    const maskedMsg = maskSensitiveCredentials(errorMsg);
    expect(maskedMsg).not.toContain('superSecret');
    expect(maskedMsg).toContain('user:********@db.host.com');
  });
});

describe('PostgreSQL Connection & Client Lifecycle', () => {
  it('should configure client options with prepare: false for poolers', () => {
    const poolerUrl =
      'postgresql://user:pass@aws-0-ap-northeast-1.pooler.supabase.com:6543/postgres';
    const client = createPostgresClient({
      url: poolerUrl,
      maxConnections: 5,
      idleTimeout: 15,
    });

    expect(client.options.prepare).toBe(false);
    expect(client.options.max).toBe(5);
    expect(client.options.idle_timeout).toBe(15);
    expect(client.options.ssl).toBe('require');

    // Close client
    client.end({ timeout: 0 });
  });

  it('should configure client options with prepare: true for direct connection port 5432', () => {
    const directUrl = 'postgresql://user:pass@localhost:5432/postgres';
    const client = createPostgresClient({
      url: directUrl,
    });

    expect(client.options.prepare).toBe(true);
    client.end({ timeout: 0 });
  });

  it('should throw when creating client with no database URL configured', () => {
    expect(() =>
      createPostgresClient({
        config: getDbConfig({ DATABASE_URL: '' }),
      }),
    ).toThrow('Database connection failed');
  });

  it('should close client properly via closePostgresClient', async () => {
    const client = createPostgresClient({
      url: 'postgresql://user:pass@localhost:5432/postgres',
    });
    await expect(closePostgresClient(client, { timeout: 0.1 })).resolves.not.toThrow();
  });
});

describe('Drizzle ORM & Singleton Management', () => {
  beforeEach(async () => {
    await closeDb({ timeout: 0 });
  });

  afterEach(async () => {
    await closeDb({ timeout: 0 });
  });

  it('should create and cache singleton Drizzle database instance', async () => {
    const testUrl = 'postgresql://user:pass@localhost:5432/postgres';
    const db1 = getDb({ url: testUrl });
    const db2 = getDb({ url: testUrl });

    expect(db1).toBe(db2);

    await closeDb({ timeout: 0 });
  });

  it('should support creating independent database instances via createDb', async () => {
    const testUrl = 'postgresql://user:pass@localhost:5432/postgres';
    const inst1 = createDb({ url: testUrl });
    const inst2 = createDb({ url: testUrl });

    expect(inst1.db).not.toBe(inst2.db);

    await inst1.sql.end({ timeout: 0 });
    await inst2.sql.end({ timeout: 0 });
  });
});

describe('Supabase JS Client Initialization', () => {
  beforeEach(() => {
    resetSupabaseClient();
  });

  afterEach(() => {
    resetSupabaseClient();
  });

  it('should throw when Supabase credentials are missing', () => {
    expect(() =>
      createSupabaseClient({
        config: getDbConfig({ SUPABASE_URL: '', SUPABASE_ANON_KEY: '' }),
      }),
    ).toThrow('Cannot initialize Supabase client');
  });

  it('should create Supabase client with anon key by default', () => {
    const client = createSupabaseClient({
      url: 'https://test-ref.supabase.co',
      key: 'test-anon-key',
    });
    expect(client).toBeDefined();
    expect(client.auth).toBeDefined();
    expect(client.storage).toBeDefined();
  });

  it('should use service role key when useServiceRole is true', () => {
    const client = createSupabaseClient({
      config: getDbConfig({
        SUPABASE_URL: 'https://test-ref.supabase.co',
        SUPABASE_ANON_KEY: 'anon-key',
        SUPABASE_SERVICE_ROLE_KEY: 'service-key',
      }),
      useServiceRole: true,
    });
    expect(client).toBeDefined();
  });

  it('should provide cached singleton via getSupabaseClient', () => {
    const c1 = getSupabaseClient({
      url: 'https://test-ref.supabase.co',
      key: 'test-anon-key',
    });
    const c2 = getSupabaseClient();
    expect(c1).toBe(c2);

    resetSupabaseClient();
  });
});

describe('Database Connection Healthcheck', () => {
  it('should return ok with latency and version when mock postgres client succeeds', async () => {
    // Mock postgres sql tagged template function
    const mockSql = vi
      .fn()
      .mockResolvedValue([
        { connected: 1, version: 'PostgreSQL 17.12 on aarch64-unknown-linux-gnu' },
      ]) as unknown as postgres.Sql;

    const result = await checkDatabaseConnection(mockSql, { timeoutMs: 1000 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.connected).toBe(true);
      expect(result.value.version).toContain('PostgreSQL 17.12');
      expect(typeof result.value.latencyMs).toBe('number');
    }
  });

  it('should return ok with latency when mock Drizzle db execute succeeds', async () => {
    const mockDb = {
      execute: vi.fn().mockResolvedValue([{ connected: 1, version: 'PostgreSQL 16.2' }]),
    } as unknown as FalconDatabase;

    const result = await checkDatabaseConnection(mockDb, { timeoutMs: 1000 });
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.connected).toBe(true);
      expect(result.value.version).toBe('PostgreSQL 16.2');
    }
  });

  it('should return err when database query fails with an error', async () => {
    const mockSql = vi
      .fn()
      .mockRejectedValue(new Error('connection refused')) as unknown as postgres.Sql;

    const result = await checkDatabaseConnection(mockSql, { timeoutMs: 1000 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.error).toContain('connection refused');
      expect(typeof result.error.latencyMs).toBe('number');
    }
  });

  it('should return err when database query exceeds timeoutMs', async () => {
    const hangingSql = vi.fn().mockImplementation(
      () =>
        new Promise((resolve) => {
          setTimeout(resolve, 500);
        }),
    ) as unknown as postgres.Sql;

    const result = await checkDatabaseConnection(hangingSql, { timeoutMs: 30 });
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.error.error).toContain('timed out');
    }
  });
});

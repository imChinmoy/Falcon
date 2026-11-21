import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as dotenv from 'dotenv';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { migrate } from 'drizzle-orm/postgres-js/migrator';

import { maskSensitiveCredentials } from './config.js';

dotenv.config();

// Also try loading packages/db/.env relative to module location
if (!process.env['DATABASE_URL']) {
  try {
    const currentDir = path.dirname(fileURLToPath(import.meta.url));
    const packageEnvPath = path.resolve(currentDir, '../.env');
    dotenv.config({ path: packageEnvPath });
  } catch {
    // Ignore error
  }
}

export function normalizeConnectionString(rawUrl?: string): string {
  const url = rawUrl ?? process.env['DATABASE_URL'] ?? '';
  if (!url) return '';
  const match = url.match(/^(postgres(?:ql)?:\/\/)([^:]+):(.*)@([^@/]+(?::\d+)?(?:\/.*)?)$/);
  if (match) {
    const protocol = match[1] ?? '';
    const user = match[2] ?? '';
    const pass = match[3] ?? '';
    const rest = match[4] ?? '';
    return `${protocol}${user}:${pass.replace(/@/g, '%40')}@${rest}`;
  }
  return url;
}

export async function runMigrations(
  connectionStringOrSql?: string | postgres.Sql,
  migrationsFolder?: string,
): Promise<void> {
  const currentDir = path.dirname(fileURLToPath(import.meta.url));
  const targetFolder = migrationsFolder ?? path.resolve(currentDir, '../drizzle');

  if (typeof connectionStringOrSql === 'function') {
    const db = drizzle(connectionStringOrSql);
    await migrate(db, { migrationsFolder: targetFolder });
  } else {
    const url = normalizeConnectionString(connectionStringOrSql);
    if (!url) {
      throw new Error('DATABASE_URL is not set and no connection string was provided.');
    }
    const client = postgres(url, { max: 1, ssl: 'require', prepare: false });
    try {
      const db = drizzle(client);
      await migrate(db, { migrationsFolder: targetFolder });
    } finally {
      await client.end();
    }
  }
}

const isMainModule =
  Boolean(process.argv[1]) &&
  (fileURLToPath(import.meta.url) === path.resolve(process.argv[1]!) ||
    process.argv[1]!.endsWith('migrate.js') ||
    process.argv[1]!.endsWith('migrate.ts'));

if (isMainModule) {
  runMigrations()
    .then(() => {
      console.log('✅ Migrations completed successfully.');
      process.exit(0);
    })
    .catch((err: unknown) => {
      console.error(
        '❌ Migration failed:',
        err instanceof Error ? maskSensitiveCredentials(err.message) : String(err),
      );
      process.exit(1);
    });
}

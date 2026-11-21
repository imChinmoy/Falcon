import { defineConfig } from 'drizzle-kit';
import * as dotenv from 'dotenv';
import { createRequire } from 'node:module';
import fs from 'node:fs';
import path from 'node:path';

dotenv.config();

// Patch Module._resolveFilename so drizzle-kit can resolve ESM .js specifiers to .ts source files
const require = createRequire(import.meta.url);
const Module = require('module');

let underlyingResolve = Module._resolveFilename;

function wrapResolver(fn: typeof Module._resolveFilename) {
  return function (
    this: unknown,
    request: string,
    parent: { filename?: string } | undefined,
    isMain: boolean,
    options: unknown,
  ) {
    if (request.endsWith('.js') && (request.startsWith('./') || request.startsWith('../'))) {
      const parentDir = parent?.filename ? path.dirname(parent.filename) : process.cwd();
      const tsFile = path.resolve(parentDir, request.slice(0, -3) + '.ts');
      if (fs.existsSync(tsFile)) {
        return fn.call(this, tsFile, parent, isMain, options);
      }
    }
    return fn.call(this, request, parent, isMain, options);
  };
}

let activeResolver = wrapResolver(underlyingResolve);

Object.defineProperty(Module, '_resolveFilename', {
  get() {
    return activeResolver;
  },
  set(newFn: typeof Module._resolveFilename) {
    underlyingResolve = newFn;
    activeResolver = wrapResolver(newFn);
  },
  configurable: true,
  enumerable: true,
});

function getDatabaseUrl(): string {
  const url = process.env['DATABASE_URL'] || '';
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

export default defineConfig({
  dialect: 'postgresql',
  schema: './src/schema/index.ts',
  out: './drizzle',
  dbCredentials: {
    url: getDatabaseUrl(),
  },
});

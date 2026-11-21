#!/usr/bin/env node
import { parseArgs } from 'node:util';
import path from 'node:path';
import { startGuiServer } from './server.js';

async function main(): Promise<void> {
  const parsed = parseArgs({
    args: process.argv.slice(2),
    options: {
      port: { type: 'string', short: 'p' },
      host: { type: 'string', short: 'h' },
      repo: { type: 'string', short: 'r' },
      help: { type: 'boolean' },
    },
    strict: false,
  });

  if (parsed.values.help) {
    console.log(`
FALCON GUI — Apple Dark Mode Web Interface

Usage:
  falcon-gui [options]

Options:
  --port, -p <number>    Port to listen on (default: 4200)
  --host, -h <string>    Host interface to bind (default: localhost)
  --repo, -r <path>      Initial repository path to ingest (default: .)
  --help                 Show this help message
`);
    process.exit(0);
  }

  const port = parsed.values.port ? parseInt(parsed.values.port as string, 10) : 4200;
  const host = (parsed.values.host as string) || 'localhost';
  const repoPath = (parsed.values.repo as string) || process.cwd();

  try {
    const { url } = await startGuiServer({
      port,
      host,
      initialRepoPath: path.resolve(repoPath),
    });

    console.log('\n🦅 FALCON Web GUI — Dark Apple Theme');
    console.log('────────────────────────────────────────');
    console.log(`  Local URL:   \x1b[36m${url}\x1b[0m`);
    console.log(`  Repository:  \x1b[32m${path.resolve(repoPath)}\x1b[0m`);
    console.log('────────────────────────────────────────');
    console.log('  Press Ctrl+C to stop the GUI server.\n');
  } catch (err) {
    console.error('Failed to launch FALCON GUI:', err instanceof Error ? err.message : String(err));
    process.exit(1);
  }
}

main();

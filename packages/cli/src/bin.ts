#!/usr/bin/env node
import { runCli } from './cli.js';

async function main(): Promise<void> {
  const result = await runCli(process.argv.slice(2));

  if (result.stdout) {
    process.stdout.write(result.stdout.endsWith('\n') ? result.stdout : `${result.stdout}\n`);
  }

  if (result.stderr) {
    process.stderr.write(result.stderr.endsWith('\n') ? result.stderr : `${result.stderr}\n`);
  }

  process.exit(result.exitCode);
}

main().catch((err) => {
  process.stderr.write(
    `Fatal error: ${err instanceof Error ? (err.stack ?? err.message) : String(err)}\n`,
  );
  process.exit(1);
});

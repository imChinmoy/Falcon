import { createHash } from 'node:crypto';

/**
 * Computes a deterministic SHA-256 hash of file content.
 */
export function computeContentHash(content: string | Buffer): string {
  return createHash('sha256').update(content).digest('hex');
}

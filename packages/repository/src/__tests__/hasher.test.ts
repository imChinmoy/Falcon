import { describe, it, expect } from 'vitest';
import { computeContentHash } from '../hasher.js';

describe('hasher', () => {
  it('computes deterministic SHA-256 for strings', () => {
    const hash1 = computeContentHash('export const x = 1;');
    const hash2 = computeContentHash('export const x = 1;');
    expect(hash1).toBe(hash2);
    expect(hash1).toMatch(/^[a-f0-9]{64}$/);
  });

  it('computes hash for buffers', () => {
    const buffer = Buffer.from('console.log("hello");', 'utf8');
    const hash = computeContentHash(buffer);
    expect(hash).toBe(computeContentHash('console.log("hello");'));
  });

  it('produces different hashes for different contents', () => {
    const hashA = computeContentHash('function a() {}');
    const hashB = computeContentHash('function b() {}');
    expect(hashA).not.toBe(hashB);
  });
});

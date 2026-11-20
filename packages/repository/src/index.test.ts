import { describe, it, expect } from 'vitest';
import {
  validateRepositoryRoot,
  computeContentHash,
  detectLanguage,
  isSupportedSourceFile,
  scanRepository,
} from './index.js';

describe('@falcon/repository module exports', () => {
  it('exports all expected primary APIs', () => {
    expect(typeof validateRepositoryRoot).toBe('function');
    expect(typeof computeContentHash).toBe('function');
    expect(typeof detectLanguage).toBe('function');
    expect(typeof isSupportedSourceFile).toBe('function');
    expect(typeof scanRepository).toBe('function');
  });
});

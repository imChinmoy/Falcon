import { describe, it, expect } from 'vitest';
import { PKG_NAME } from './index.js';

describe('@falcon/risk', () => {
  it('exports package name', () => {
    expect(PKG_NAME).toBe('@falcon/risk');
  });
});

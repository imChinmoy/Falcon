import { describe, it, expect } from 'vitest';
import { PKG_NAME } from './index.js';

describe('@falcon/parser', () => {
  it('exports package name', () => {
    expect(PKG_NAME).toBe('@falcon/parser');
  });
});

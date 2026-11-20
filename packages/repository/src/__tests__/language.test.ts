import { describe, it, expect } from 'vitest';
import { detectLanguage, isSupportedSourceFile } from '../language.js';

describe('language', () => {
  describe('detectLanguage', () => {
    it('detects typescript extensions', () => {
      expect(detectLanguage('index.ts')).toBe('typescript');
      expect(detectLanguage('utils.mts')).toBe('typescript');
      expect(detectLanguage('config.cts')).toBe('typescript');
    });

    it('detects tsx extension', () => {
      expect(detectLanguage('App.tsx')).toBe('tsx');
      expect(detectLanguage('src/components/Button.tsx')).toBe('tsx');
    });

    it('detects javascript extensions', () => {
      expect(detectLanguage('index.js')).toBe('javascript');
      expect(detectLanguage('server.mjs')).toBe('javascript');
      expect(detectLanguage('bundle.cjs')).toBe('javascript');
    });

    it('detects jsx extension', () => {
      expect(detectLanguage('App.jsx')).toBe('jsx');
    });

    it('returns undefined for unsupported files', () => {
      expect(detectLanguage('package.json')).toBeUndefined();
      expect(detectLanguage('README.md')).toBeUndefined();
      expect(detectLanguage('main.py')).toBeUndefined();
      expect(detectLanguage('styles.css')).toBeUndefined();
    });
  });

  describe('isSupportedSourceFile', () => {
    it('returns true for supported source files', () => {
      expect(isSupportedSourceFile('src/index.ts')).toBe(true);
      expect(isSupportedSourceFile('src/Button.tsx')).toBe(true);
      expect(isSupportedSourceFile('src/legacy.js')).toBe(true);
      expect(isSupportedSourceFile('src/Component.jsx')).toBe(true);
    });

    it('returns false for unsupported files', () => {
      expect(isSupportedSourceFile('src/data.json')).toBe(false);
      expect(isSupportedSourceFile('src/image.png')).toBe(false);
      expect(isSupportedSourceFile('src/doc.md')).toBe(false);
    });
  });
});

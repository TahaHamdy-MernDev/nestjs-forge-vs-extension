import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { TranslationStore } from '../src/i18n/store.js';

describe('TranslationStore', () => {
  let tmpDir: string;
  let i18nDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-store-test-'));
    i18nDir = path.join(tmpDir, 'src', 'i18n');
    fs.mkdirSync(path.join(i18nDir, 'en'), { recursive: true });
    fs.mkdirSync(path.join(i18nDir, 'ar'), { recursive: true });
  });

  afterEach(() => {
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('scans namespaces and loads entries', () => {
    fs.writeFileSync(
      path.join(i18nDir, 'en', 'auth.json'),
      JSON.stringify({ title: 'Authentication', login: 'Log in' }, null, 2),
    );
    fs.writeFileSync(
      path.join(i18nDir, 'ar', 'auth.json'),
      JSON.stringify({ title: 'تسجيل الدخول', login: 'دخول' }, null, 2),
    );

    const store = new TranslationStore(tmpDir);
    store.reload();

    expect(Array.from(store.getNamespaces())).toEqual(['auth']);
    expect(store.getLanguages()).toEqual(['ar', 'en']);

    const titleEntry = store.getKey('auth.title');
    expect(titleEntry).toBeDefined();
    expect(titleEntry?.values['en']).toBe('Authentication');
    expect(titleEntry?.values['ar']).toBe('تسجيل الدخول');

    const parity = store.checkParity();
    expect(parity.missingInAr).toHaveLength(0);
    expect(parity.missingInEn).toHaveLength(0);
  });

  it('detects missing keys between languages', () => {
    fs.writeFileSync(
      path.join(i18nDir, 'en', 'auth.json'),
      JSON.stringify({ title: 'Authentication', forgotPassword: 'Forgot password?' }, null, 2),
    );
    fs.writeFileSync(
      path.join(i18nDir, 'ar', 'auth.json'),
      JSON.stringify({ title: 'تسجيل الدخول' }, null, 2),
    );

    const store = new TranslationStore(tmpDir);
    store.reload();

    const parity = store.checkParity();
    expect(parity.missingInAr.some((m) => m.key === 'auth.forgotPassword')).toBe(true);
  });

  it('handles Intl.PluralRules objects without false positive parity warnings', () => {
    // English only has 'one' and 'other'
    fs.writeFileSync(
      path.join(i18nDir, 'en', 'items.json'),
      JSON.stringify({
        count: {
          one: '{count} item',
          other: '{count} items',
        },
      }, null, 2),
    );

    // Arabic has all 6 plural forms
    fs.writeFileSync(
      path.join(i18nDir, 'ar', 'items.json'),
      JSON.stringify({
        count: {
          zero: 'لا توجد عناصر',
          one: 'عنصر واحد',
          two: 'عنصران',
          few: '{count} عناصر',
          many: '{count} عنصراً',
          other: '{count} عنصر',
        },
      }, null, 2),
    );

    const store = new TranslationStore(tmpDir);
    store.reload();

    const parity = store.checkParity();
    // English missing 'zero', 'two', 'few', 'many' should NOT be flagged as missingInEn
    // because items.count is a valid plural object existing in both languages.
    expect(parity.missingInEn).toHaveLength(0);
  });
});

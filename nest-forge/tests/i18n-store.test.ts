import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import * as pathValidator from '../src/core/path-validator.js';
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
    vi.restoreAllMocks();
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

  it('rejects unsafe lang or namespace in setKeyValue with a clear error message and prevents traversal outside i18nDir', async () => {
    const errorSpy = vi.spyOn(vscode.window, 'showErrorMessage');
    const safeNameSpy = vi.spyOn(pathValidator, 'validateSafeFileName');
    const wsPathSpy = vi.spyOn(pathValidator, 'validateWorkspacePath');

    const store = new TranslationStore(tmpDir);
    store.reload();

    const badLangOk = await store.setKeyValue('auth.login', '../outside', 'Hacked');
    expect(badLangOk).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid language'));
    expect(fs.existsSync(path.join(tmpDir, 'src', 'outside', 'auth.json'))).toBe(false);

    errorSpy.mockClear();
    const badNsOk = await store.setKeyValue('../../pwned.login', 'en', 'Hacked');
    expect(badNsOk).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid namespace'));
    expect(fs.existsSync(path.join(tmpDir, 'pwned.json'))).toBe(false);

    // Valid call should use both validateSafeFileName and validateWorkspacePath(i18nDir, ...)
    const validOk = await store.setKeyValue('auth.login', 'en', 'Log in');
    expect(validOk).toBe(true);
    expect(safeNameSpy).toHaveBeenCalledWith('en');
    expect(safeNameSpy).toHaveBeenCalledWith('auth');
    expect(wsPathSpy).toHaveBeenCalledWith(
      i18nDir,
      path.join(i18nDir, 'en', 'auth.json'),
    );
  });

  it('rejects unsafe namespace or key in deleteKey and addMissingKey with clear error messages', async () => {
    const errorSpy = vi.spyOn(vscode.window, 'showErrorMessage');
    const store = new TranslationStore(tmpDir);
    store.reload();

    const delOk = await store.deleteKey('../escape.secret');
    expect(delOk).toBe(false);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid namespace'));

    errorSpy.mockClear();
    const addRes = await store.addMissingKey('foo/bar.baz', 'en', 'val');
    expect(addRes).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid namespace'));

    errorSpy.mockClear();
    const addBadLang = await store.addMissingKey('auth.welcome', '../ar', 'val');
    expect(addBadLang).toBeNull();
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('Invalid language'));
  });

  it('PERF-04: fixAllMissing with many missing keys performs one write per file and one reload', async () => {
    fs.writeFileSync(
      path.join(i18nDir, 'en', 'auth.json'),
      JSON.stringify({ login: 'Login', logout: 'Logout', signup: 'Sign up' }, null, 2),
    );
    fs.writeFileSync(
      path.join(i18nDir, 'en', 'users.json'),
      JSON.stringify({ profile: 'Profile', settings: 'Settings' }, null, 2),
    );

    const store = new TranslationStore(tmpDir);
    store.reload();

    const writeSpy = vi.spyOn(store as any, 'writeJsonFile');
    const reloadSpy = vi.spyOn(store, 'reload');

    const result = await store.fixAllMissing();

    expect(result.fixed).toBe(5);
    // 2 target files: ar/auth.json and ar/users.json -> exactly 2 writes!
    expect(writeSpy).toHaveBeenCalledTimes(2);
    // exactly one reload at the end
    expect(reloadSpy).toHaveBeenCalledTimes(1);

    // Verify written content is complete
    const authAr = JSON.parse(fs.readFileSync(path.join(i18nDir, 'ar', 'auth.json'), 'utf8'));
    expect(authAr).toEqual({ login: '', logout: '', signup: '' });

    const usersAr = JSON.parse(fs.readFileSync(path.join(i18nDir, 'ar', 'users.json'), 'utf8'));
    expect(usersAr).toEqual({ profile: '', settings: '' });
  });

  it('PERF-04: setKeyValuesBatch collects validation errors and shows ONE summary error message', async () => {
    const errorSpy = vi.spyOn(vscode.window, 'showErrorMessage');
    const store = new TranslationStore(tmpDir);
    store.reload();

    const result = await store.setKeyValuesBatch([
      { fullKey: 'invalid-no-namespace', lang: 'en', value: '1' },
      { fullKey: '../bad.escape', lang: 'en', value: '2' },
      { fullKey: 'auth.badlang', lang: '../escape', value: '3' },
    ]);

    expect(result.fixed).toBe(0);
    expect(result.errors.length).toBe(3);
    // Exactly ONE summary message shown rather than 3 individual messages
    expect(errorSpy).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(expect.stringContaining('3 validation errors'));
  });
});


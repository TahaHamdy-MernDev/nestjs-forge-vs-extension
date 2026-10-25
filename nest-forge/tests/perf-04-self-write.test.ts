import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { TranslationStore } from '../src/i18n/store.js';

describe('PERF-04b: TranslationStore self-write suppression', () => {
  let tmpDir: string;
  let i18nDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-self-write-'));
    i18nDir = path.join(tmpDir, 'src', 'i18n');
    fs.mkdirSync(path.join(i18nDir, 'en'), { recursive: true });
    fs.mkdirSync(path.join(i18nDir, 'ar'), { recursive: true });

    fs.writeFileSync(
      path.join(i18nDir, 'en', 'auth.json'),
      JSON.stringify({ login: 'Log in', logout: 'Log out' }, null, 2),
    );
    fs.writeFileSync(
      path.join(i18nDir, 'ar', 'auth.json'),
      JSON.stringify({ login: 'تسجيل الدخول' }, null, 2),
    );
  });

  afterEach(() => {
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('records self-writes and marks paths as self-written within the suppression window', async () => {
    const store = new TranslationStore(tmpDir);
    store.reload();

    const authEn = path.join(i18nDir, 'en', 'auth.json');
    expect(store.isSelfWrite(authEn)).toBe(false);

    await store.setKeyValue('auth.remember', 'en', 'Remember me');

    // Should be recognized as self-write immediately
    expect(store.isSelfWrite(authEn)).toBe(true);

    // Another file should NOT be suppressed
    const otherFile = path.join(i18nDir, 'en', 'other.json');
    expect(store.isSelfWrite(otherFile)).toBe(false);
  });

  it('suppresses reload and onDidUpdate when simulated watcher fires for self-written files', async () => {
    const store = new TranslationStore(tmpDir);
    store.reload();

    let updateCount = 0;
    store.onDidUpdate(() => {
      updateCount++;
    });

    // 1. Test setKeyValue
    updateCount = 0;
    await store.setKeyValue('auth.signup', 'en', 'Sign up');
    // setKeyValue reloads store once internally
    expect(updateCount).toBe(1);

    const writtenFile = path.join(i18nDir, 'en', 'auth.json');
    // Simulate watcher handling
    const shouldIgnore = store.isSelfWrite(writtenFile);
    expect(shouldIgnore).toBe(true);
    if (!shouldIgnore) {
      store.reload();
    }
    // Still 1, NOT 2!
    expect(updateCount).toBe(1);

    // 2. Test fixAllMissing / setKeyValuesBatch
    updateCount = 0;
    const fixResult = await store.fixAllMissing();
    expect(fixResult.fixed).toBeGreaterThan(0);
    expect(updateCount).toBe(1);

    const arAuthFile = path.join(i18nDir, 'ar', 'auth.json');
    expect(store.isSelfWrite(arAuthFile)).toBe(true);
    if (!store.isSelfWrite(arAuthFile)) {
      store.reload();
    }
    expect(updateCount).toBe(1);

    // 3. Test addMissingKey
    updateCount = 0;
    await store.addMissingKey('auth.profile', 'en', 'Profile');
    expect(updateCount).toBe(1);
    expect(store.isSelfWrite(writtenFile)).toBe(true);
    if (!store.isSelfWrite(writtenFile)) {
      store.reload();
    }
    expect(updateCount).toBe(1);
  });

  it('allows reload when an external change occurs to a different file or after the window', async () => {
    const store = new TranslationStore(tmpDir);
    store.reload();

    const authEn = path.join(i18nDir, 'en', 'auth.json');
    await store.setKeyValue('auth.test', 'en', 'Test');
    expect(store.isSelfWrite(authEn)).toBe(true);

    // External change to another file
    const externalFile = path.join(i18nDir, 'en', 'users.json');
    expect(store.isSelfWrite(externalFile)).toBe(false);

    // After window expires (mocking Date.now)
    const now = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(now + 1000);
    expect(store.isSelfWrite(authEn)).toBe(false);
  });
});

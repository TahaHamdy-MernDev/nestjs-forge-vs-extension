import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { MatrixWebviewPanel } from '../src/i18n/matrix-webview.js';
import { TranslationStore } from '../src/i18n/store.js';

describe('PERF-05: Matrix and parity optimizations', () => {
  let tmpDir: string;
  let i18nDir: string;
  let store: TranslationStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-perf05-'));
    i18nDir = path.join(tmpDir, 'src', 'i18n');
    fs.mkdirSync(path.join(i18nDir, 'en'), { recursive: true });
    fs.mkdirSync(path.join(i18nDir, 'ar'), { recursive: true });

    fs.writeFileSync(
      path.join(i18nDir, 'en', 'auth.json'),
      JSON.stringify({ login: 'Login', logout: 'Logout' }, null, 2),
    );
    fs.writeFileSync(
      path.join(i18nDir, 'ar', 'auth.json'),
      JSON.stringify({ login: 'تسجيل الدخول', logout: 'خروج' }, null, 2),
    );

    store = new TranslationStore(tmpDir);
    store.reload();
  });

  afterEach(() => {
    MatrixWebviewPanel.currentPanel?.dispose();
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('caches checkParity() inside TranslationStore and invalidates on reload()', () => {
    const res1 = store.checkParity();
    const res2 = store.checkParity();
    // Must return the exact cached object reference
    expect(res1).toBe(res2);

    store.reload();
    const res3 = store.checkParity();
    expect(res3).not.toBe(res1);
    expect(res3).toEqual(res1);
  });

  it('debounces #searchInput by ~150ms in matrix webview HTML', () => {
    let capturedHtml = '';
    vi.spyOn(vscode.window, 'createWebviewPanel').mockImplementation(() => {
      const webview: any = {
        html: '',
        postMessage: vi.fn(),
        onDidReceiveMessage: () => ({ dispose: () => {} }),
      };
      Object.defineProperty(webview, 'html', {
        get: () => capturedHtml,
        set: (val: string) => {
          capturedHtml = val;
        },
      });
      return {
        webview,
        onDidDispose: () => ({ dispose: () => {} }),
        reveal: () => {},
        dispose: () => {},
      } as any;
    });

    MatrixWebviewPanel.createOrShow(vscode.Uri.file(tmpDir), store);

    // Verify debounce logic around searchInput
    expect(capturedHtml).toMatch(/searchInput\.addEventListener\('input'[\s\S]*?setTimeout[\s\S]*?150/);
  });
});

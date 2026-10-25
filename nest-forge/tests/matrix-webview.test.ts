import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import * as MatrixModule from '../src/i18n/matrix-webview.js';
import { MatrixWebviewPanel } from '../src/i18n/matrix-webview.js';
import { TranslationStore } from '../src/i18n/store.js';

describe('SEC-01: Matrix Webview hardening', () => {
  let tmpDir: string;
  let store: TranslationStore;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-sec01-'));
    store = new TranslationStore(tmpDir);
  });

  afterEach(() => {
    MatrixWebviewPanel.currentPanel?.dispose();
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('escapeHtml escapes &, <, >, ", and \'', () => {
    const escapeHtml = (MatrixModule as any).escapeHtml;
    expect(typeof escapeHtml).toBe('function');
    expect(escapeHtml(`& < > " '`)).toBe('&amp; &lt; &gt; &quot; &#39;');
  });

  it('sets minimal localResourceRoots, nonce CSP meta tag, escapes key/namespace, and uses event delegation instead of inline onclick', () => {
    let capturedOptions: any;
    let capturedHtml = '';

    vi.spyOn(vscode.window, 'createWebviewPanel').mockImplementation(
      (_viewType, _title, _column, options) => {
        capturedOptions = options;
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
      },
    );

    MatrixWebviewPanel.createOrShow(vscode.Uri.file(tmpDir), store);

    // 1. Minimal localResourceRoots
    expect(capturedOptions?.localResourceRoots).toEqual([]);

    // 2. Nonce-based Content-Security-Policy meta tag
    const cspMatch = capturedHtml.match(
      /<meta\s+http-equiv="Content-Security-Policy"\s+content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-([A-Za-z0-9+/=_-]+)';"\s*\/?>/,
    );
    expect(cspMatch).not.toBeNull();
    const nonce = cspMatch![1];
    expect(nonce.length).toBeGreaterThanOrEqual(16);
    expect(capturedHtml).toContain(`<script nonce="${nonce}">`);

    // 3. Inline escapeHtml escapes both ' and "
    expect(capturedHtml).toContain(".replace(/\"/g, '&quot;')");
    expect(capturedHtml).toContain(".replace(/'/g, '&#39;')");

    // 4. Escapes entry.key and entry.namespace everywhere they are interpolated into HTML
    expect(capturedHtml).toContain('escapeHtml(entry.key)');
    expect(capturedHtml).toContain('escapeHtml(entry.namespace)');
    expect(capturedHtml).not.toContain('<tr data-key="${entry.key}">');
    expect(capturedHtml).not.toContain('<span class="ns-tag">${entry.namespace}</span>');
    expect(capturedHtml).not.toContain('<span class="key-text">${entry.key}</span>');

    // 5. No inline onclick attributes; uses data-* attributes with event delegation
    expect(capturedHtml).not.toContain('onclick=');
    expect(capturedHtml).toContain('data-action="jump"');
    expect(capturedHtml).toContain('data-action="delete"');
  });

  it('CORR-12: disposes store.onDidUpdate listener when panel is disposed', () => {
    const postMessageSpy = vi.fn();

    vi.spyOn(vscode.window, 'createWebviewPanel').mockImplementation(() => ({
      webview: {
        html: '',
        postMessage: postMessageSpy,
        onDidReceiveMessage: () => ({ dispose: () => {} }),
      },
      onDidDispose: () => ({ dispose: () => {} }),
      reveal: () => {},
      dispose: () => {},
    }) as any);

    const panel = MatrixWebviewPanel.createOrShow(vscode.Uri.file(tmpDir), store);
    postMessageSpy.mockClear();

    // While active, store.reload() triggers updateData -> webview.postMessage
    store.reload();
    expect(postMessageSpy).toHaveBeenCalledTimes(1);

    // After dispose(), store.reload() must NOT trigger updateData on the disposed panel
    panel.dispose();
    postMessageSpy.mockClear();
    store.reload();
    expect(postMessageSpy).toHaveBeenCalledTimes(0);
  });
});


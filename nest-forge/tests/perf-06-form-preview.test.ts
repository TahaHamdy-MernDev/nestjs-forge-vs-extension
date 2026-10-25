import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { FeatureFormPanel } from '../src/webview/FeatureFormPanel.js';

describe('PERF-06: Form preview optimization', () => {
  let tmpDir: string;
  let extensionRoot: string;
  let featureDir: string;

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-perf06-'));
    extensionRoot = path.resolve(__dirname, '..');
    featureDir = path.join(tmpDir, 'src', 'features', 'users');
    fs.mkdirSync(featureDir, { recursive: true });
  });

  afterEach(() => {
    FeatureFormPanel.currentPanel?.dispose();
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('form.js debounces requestPreview() by ~100ms', () => {
    const formJs = fs.readFileSync(
      path.join(extensionRoot, 'src', 'webview', 'ui', 'form.js'),
      'utf-8',
    );

    // Verify requestPreview implementation has debouncing
    expect(formJs).toMatch(/let\s+\w*previewDebounce\w*\s*=\s*null;/i);
    expect(formJs).toMatch(/function\s+requestPreview\s*\(\)\s*\{[\s\S]*?setTimeout[\s\S]*?100/);
  });

  it('FeatureFormPanel strips context from plans and only sends relativePath, exists, templateName', async () => {
    const postMessageSpy = vi.fn();
    let messageHandler: ((msg: any) => Promise<void>) | undefined;

    vi.spyOn(vscode.window, 'createWebviewPanel').mockImplementation(() => ({
      webview: {
        html: '',
        cspSource: 'vscode-webview://test',
        asWebviewUri: (u: any) => u,
        postMessage: postMessageSpy,
        onDidReceiveMessage: (cb: any) => {
          messageHandler = cb;
          return { dispose: () => {} };
        },
      },
      onDidDispose: () => ({ dispose: () => {} }),
      reveal: () => {},
      dispose: () => {},
    }) as any);

    FeatureFormPanel.createOrShow(vscode.Uri.file(extensionRoot), vscode.Uri.file(featureDir));
    expect(messageHandler).toBeDefined();

    await messageHandler!({
      command: 'updatePreview',
      state: {
        featureName: 'users',
        structureMode: 'flat',
        targetPath: 'src/features/users',
        parentModulePath: '',
        serviceFileName: 'users.service.ts',
        controllerFileName: 'users.controller.ts',
        moduleFileName: 'users.module.ts',
        includeRepository: false,
        repositoryFileName: '',
        includeInterface: false,
        interfaceFileName: '',
        includeSpecs: false,
        dtoFiles: [],
        includeEvents: false,
        eventFiles: [],
        includeListeners: false,
        listenerFiles: [],
      },
    });

    expect(postMessageSpy).toHaveBeenCalledTimes(1);
    const sentMessage = postMessageSpy.mock.calls[0][0];
    expect(sentMessage.command).toBe('previewUpdated');
    expect(sentMessage.plans.length).toBeGreaterThan(0);

    for (const plan of sentMessage.plans) {
      expect(plan).toHaveProperty('relativePath');
      expect(plan).toHaveProperty('exists');
      expect(plan).toHaveProperty('templateName');
      expect(plan).not.toHaveProperty('context');
      expect(plan.context).toBeUndefined();
    }
  });
});

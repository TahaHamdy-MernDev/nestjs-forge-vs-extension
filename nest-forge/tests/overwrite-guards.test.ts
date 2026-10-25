import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { activate } from '../src/extension.js';
import { FeatureFormPanel } from '../src/webview/FeatureFormPanel.js';

describe('CORR-01: Overwrite guards and cancellation', () => {
  let tmpDir: string;
  let featureDir: string;
  const registeredCommands = new Map<string, (...args: any[]) => any>();
  const extensionRoot = path.resolve(__dirname, '..');

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-corr01-'));
    featureDir = path.join(tmpDir, 'src', 'features', 'orders');
    fs.mkdirSync(featureDir, { recursive: true });

    registeredCommands.clear();
    (vscode.workspace as any).workspaceFolders = [{ uri: vscode.Uri.file(tmpDir) }];

    vi.spyOn(vscode.commands, 'registerCommand').mockImplementation((cmd, cb) => {
      registeredCommands.set(cmd, cb);
      return { dispose: () => {} };
    });

    activate({
      extensionUri: vscode.Uri.file(extensionRoot),
      subscriptions: [],
    } as any);
  });

  afterEach(() => {
    FeatureFormPanel.currentPanel?.dispose();
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('addDtoCommand prompts before overwriting existing DTO and aborts on cancel', async () => {
    const dtoDir = path.join(featureDir, 'dto');
    fs.mkdirSync(dtoDir, { recursive: true });
    const dtoFile = path.join(dtoDir, 'create-orders.dto.ts');
    fs.writeFileSync(dtoFile, '// original-dto', 'utf-8');

    vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue('create-orders');
    const warnSpy = vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue(undefined);

    const addDto = registeredCommands.get('nestForge.addDto')!;
    await addDto(vscode.Uri.file(featureDir));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('create-orders.dto.ts'),
      { modal: true },
      'Overwrite',
    );
    expect(fs.readFileSync(dtoFile, 'utf-8')).toBe('// original-dto');

    // Confirm overwrite
    warnSpy.mockResolvedValue('Overwrite' as any);
    await addDto(vscode.Uri.file(featureDir));
    expect(fs.readFileSync(dtoFile, 'utf-8')).toContain('export class CreateOrdersDto');
  });

  it('addEventCommand prompts before overwriting existing Event and aborts on cancel', async () => {
    const eventDir = path.join(featureDir, 'events');
    fs.mkdirSync(eventDir, { recursive: true });
    const eventFile = path.join(eventDir, 'orders-created.event.ts');
    fs.writeFileSync(eventFile, '// original-event', 'utf-8');

    vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue('orders-created');
    const warnSpy = vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue(undefined);

    const addEvent = registeredCommands.get('nestForge.addEvent')!;
    await addEvent(vscode.Uri.file(featureDir));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('orders-created.event.ts'),
      { modal: true },
      'Overwrite',
    );
    expect(fs.readFileSync(eventFile, 'utf-8')).toBe('// original-event');

    // Confirm overwrite
    warnSpy.mockResolvedValue('Overwrite' as any);
    await addEvent(vscode.Uri.file(featureDir));
    expect(fs.readFileSync(eventFile, 'utf-8')).toContain('export class OrdersCreatedEvent');
  });

  it('addListenerCommand prompts before overwriting existing Listener and aborts on cancel', async () => {
    const listenerDir = path.join(featureDir, 'listeners');
    fs.mkdirSync(listenerDir, { recursive: true });
    const listenerFile = path.join(listenerDir, 'orders-created.listener.ts');
    fs.writeFileSync(listenerFile, '// original-listener', 'utf-8');

    vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue('orders-created');
    const warnSpy = vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue(undefined);

    const addListener = registeredCommands.get('nestForge.addListener')!;
    await addListener(vscode.Uri.file(featureDir));

    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('orders-created.listener.ts'),
      { modal: true },
      'Overwrite',
    );
    expect(fs.readFileSync(listenerFile, 'utf-8')).toBe('// original-listener');

    // Confirm overwrite
    warnSpy.mockResolvedValue('Overwrite' as any);
    await addListener(vscode.Uri.file(featureDir));
    expect(fs.readFileSync(listenerFile, 'utf-8')).toContain('export class OrdersCreatedListener');
  });

  it('FeatureFormPanel posts forgeCancelled when user cancels conflict overwrite prompt', async () => {
    const existingModule = path.join(featureDir, 'orders.module.ts');
    fs.writeFileSync(existingModule, '// existing-module', 'utf-8');

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

    vi.spyOn(vscode.window, 'showWarningMessage').mockResolvedValue('Cancel' as any);

    FeatureFormPanel.createOrShow(vscode.Uri.file(extensionRoot), vscode.Uri.file(featureDir));
    expect(messageHandler).toBeDefined();

    await messageHandler!({
      command: 'forgeFeature',
      overwriteConflicts: false,
      state: {
        featureName: 'orders',
        structureMode: 'flat',
        targetPath: 'src/features/orders',
        parentModulePath: '',
        serviceFileName: 'orders.service.ts',
        controllerFileName: 'orders.controller.ts',
        moduleFileName: 'orders.module.ts',
        includeRepository: false,
        repositoryFileName: 'orders.repository.ts',
        includeInterface: false,
        interfaceFileName: 'orders.interface.ts',
        includeSpecs: false,
        dtoFiles: [],
        includeEvents: false,
        eventFiles: [],
        includeListeners: false,
        listenerFiles: [],
      },
    });

    expect(postMessageSpy).toHaveBeenCalledWith({ command: 'forgeCancelled' });
    expect(fs.readFileSync(existingModule, 'utf-8')).toBe('// existing-module');
  });

  it('form.js sends overwriteConflicts: false and re-enables forgeBtn on forgeCancelled', () => {
    const formJs = fs.readFileSync(
      path.join(extensionRoot, 'src', 'webview', 'ui', 'form.js'),
      'utf-8',
    );
    expect(formJs).toContain('overwriteConflicts: false');
    expect(formJs).not.toContain('overwriteConflicts: true');
    expect(formJs).toContain("case 'forgeCancelled':");
  });
});

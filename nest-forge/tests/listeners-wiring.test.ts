import * as fs from 'node:fs';
import * as os from 'node:os';
import * as path from 'node:path';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import * as vscode from 'vscode';
import { buildPlan } from '../src/core/planner.js';
import { TemplateRenderer } from '../src/core/renderer.js';
import type { FeatureFormState, ProjectConventions } from '../src/core/types.js';
import { activate } from '../src/extension.js';
import { FeaturesTreeProvider } from '../src/views/FeaturesTreeProvider.js';

describe('CORR-02: Listeners wiring into providers', () => {
  let tmpDir: string;
  let featureDir: string;
  const registeredCommands = new Map<string, (...args: any[]) => any>();
  const extensionRoot = path.resolve(__dirname, '..');
  const templatesDir = path.resolve(__dirname, '../src/templates');
  const renderer = new TemplateRenderer(templatesDir);

  const conventions: ProjectConventions = {
    featuresDir: 'src/features',
    importExtension: '.js',
    pathAlias: '@/features',
    orm: 'drizzle',
    controllerVersion: '1',
    paramStyle: 'snake_case',
    parentModule: 'src/features/features.module.ts',
    validator: 'class-validator',
    formatter: 'none',
  };

  beforeEach(() => {
    tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-corr02-'));
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
    vi.restoreAllMocks();
    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('buildPlan adds generated listeners to moduleProviders in flat mode', () => {
    const state: FeatureFormState = {
      featureName: 'orders',
      structureMode: 'flat',
      targetPath: 'src/features/orders',
      parentModulePath: 'src/features/features.module.ts',
      serviceFileName: 'orders.service.ts',
      controllerFileName: 'orders.controller.ts',
      moduleFileName: 'orders.module.ts',
      includeRepository: false,
      repositoryFileName: 'orders.repository.ts',
      includeInterface: false,
      interfaceFileName: 'orders.interface.ts',
      includeSpecs: false,
      dtoFiles: [],
      includeEvents: true,
      eventFiles: [{ name: 'orders-created' }],
      includeListeners: true,
      listenerFiles: [{ name: 'orders-created' }],
    };

    const plans = buildPlan(state, conventions, tmpDir);
    const modulePlan = plans.find((p) => p.templateName === 'module');
    expect(modulePlan).toBeDefined();

    const moduleProviders = modulePlan?.context?.moduleProviders as Array<{ className: string; importPath: string }>;
    expect(moduleProviders).toBeDefined();
    const listenerEntry = moduleProviders.find((p) => p.className === 'OrdersCreatedListener');
    expect(listenerEntry).toBeDefined();

    const rendered = renderer.render('module', modulePlan!.context);
    expect(rendered).toContain('OrdersCreatedListener');
    expect(rendered).toMatch(/providers:\s*\[[^\]]*OrdersCreatedListener/s);
  });

  it('buildPlan adds generated listeners to moduleProviders in grouped mode', () => {
    const state: FeatureFormState = {
      featureName: 'orders',
      structureMode: 'grouped',
      targetPath: 'src/features/orders',
      parentModulePath: 'src/features/features.module.ts',
      serviceFileName: '',
      controllerFileName: '',
      moduleFileName: 'orders.module.ts',
      includeRepository: false,
      repositoryFileName: 'orders.repository.ts',
      includeInterface: false,
      interfaceFileName: 'orders.interface.ts',
      includeSpecs: false,
      dtoFiles: [],
      includeEvents: false,
      eventFiles: [],
      includeListeners: true,
      listenerFiles: [{ name: 'order-notification' }],
    };

    const plans = buildPlan(state, conventions, tmpDir);
    const modulePlan = plans.find((p) => p.templateName === 'module');
    expect(modulePlan).toBeDefined();

    const moduleProviders = modulePlan?.context?.moduleProviders as Array<{ className: string; importPath: string }>;
    expect(moduleProviders).toBeDefined();
    const listenerEntry = moduleProviders.find((p) => p.className === 'OrderNotificationListener');
    expect(listenerEntry).toBeDefined();

    const rendered = renderer.render('module', modulePlan!.context);
    expect(rendered).toContain('OrderNotificationListener');
    expect(rendered).toMatch(/providers:\s*\[[^\]]*OrderNotificationListener/s);
  });

  it('addListenerCommand auto-wires listener into module and tree provider does not flag it as unwired', async () => {
    const moduleFile = path.join(featureDir, 'orders.module.ts');
    fs.writeFileSync(
      moduleFile,
      `import { Module } from '@nestjs/common';\nimport { OrdersService } from './orders.service.js';\n\n@Module({\n  providers: [OrdersService],\n})\nexport class OrdersModule {}\n`,
      'utf-8',
    );

    vi.spyOn(vscode.window, 'showInputBox').mockResolvedValue('order-shipped');

    const addListener = registeredCommands.get('nestForge.addListener')!;
    await addListener(vscode.Uri.file(featureDir));

    const updatedModule = fs.readFileSync(moduleFile, 'utf-8');
    expect(updatedModule).toContain('OrderShippedListener');
    expect(updatedModule).toContain('./listeners/order-shipped.listener.js');

    // Check tree provider does NOT flag as unwired
    const treeProvider = new FeaturesTreeProvider(tmpDir);
    const listenersFolder = path.join(featureDir, 'listeners');
    const items = await treeProvider.getChildren({
      label: 'listeners/',
      collapsibleState: vscode.TreeItemCollapsibleState.Collapsed,
      resourceUri: vscode.Uri.file(listenersFolder),
      isFolder: true,
    } as any);

    const listenerItem = items.find((i) => i.label === 'order-shipped.listener.ts');
    expect(listenerItem).toBeDefined();
    expect(listenerItem?.description).not.toBe('unwired');
    expect(listenerItem?.contextValue).not.toContain('_orphan');
  });
});

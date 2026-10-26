import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { describe, expect, it } from 'vitest';
import { buildPlan } from '../src/core/planner.js';
import type { ProjectConventions } from '../src/core/types.js';

describe('Phase 2: Component toggle cards, presets, and layout segmented control', () => {
  const formJsCode = fs.readFileSync(
    path.resolve(__dirname, '../src/webview/ui/form.js'),
    'utf-8',
  );
  const listNamingCode = fs.readFileSync(
    path.resolve(__dirname, '../src/webview/ui/list-naming.js'),
    'utf-8',
  );

  const conventions: ProjectConventions = {
    featuresDir: 'src/features',
    importExtension: '.js',
    pathAlias: '@/features',
    orm: 'drizzle',
    controllerVersion: '1',
    paramStyle: 'camelCase',
    parentModule: 'src/features/features.module.ts',
    validator: 'class-validator',
    formatter: 'biome',
    testRunner: 'vitest',
    i18nDir: 'src/i18n',
    i18nDefaultLocale: 'en',
  };

  function createFormContext() {
    const listeners: Record<string, Function[]> = {};
    const elements: Record<string, any> = {};

    function makeElement(id = '', className = '') {
      let _html = '';
      const el: any = {
        id,
        className,
        value: '',
        checked: false,
        disabled: false,
        textContent: '',
        style: {},
        attributes: {} as Record<string, string>,
        children: [] as any[],
        classList: {
          contains: (cls: string) => el.className.split(' ').includes(cls),
          add: (cls: string) => {
            const set = new Set(el.className.split(' ').filter(Boolean));
            set.add(cls);
            el.className = Array.from(set).join(' ');
          },
          remove: (cls: string) => {
            const set = new Set(el.className.split(' ').filter(Boolean));
            set.delete(cls);
            el.className = Array.from(set).join(' ');
          },
          toggle: (cls: string) => {
            if (el.classList.contains(cls)) el.classList.remove(cls);
            else el.classList.add(cls);
          },
        },
        get innerHTML() {
          return _html;
        },
        set innerHTML(val: string) {
          _html = val;
          el.children = [];
          if (!val) return;
          const regex = /<input[^>]+class="([^"]+)"[^>]+data-index="([^"]+)"[^>]+value="([^"]+)"/g;
          let match: RegExpExecArray | null;
          while ((match = regex.exec(val)) !== null) {
            const inp = makeElement('', match[1]);
            inp.setAttribute('data-index', match[2]);
            inp.value = match[3];
            el.children.push(inp);
          }
        },
        setAttribute(k: string, v: string) {
          el.attributes[k] = String(v);
        },
        getAttribute(k: string) {
          return el.attributes[k];
        },
        removeAttribute(k: string) {
          delete el.attributes[k];
        },
        addEventListener(event: string, cb: Function) {
          listeners[`${id}:${event}`] = listeners[`${id}:${event}`] || [];
          listeners[`${id}:${event}`].push(cb);
        },
        dispatchEvent(event: any) {
          const cbs = listeners[`${id}:${event.type}`] || [];
          cbs.forEach((cb) => cb(event));
        },
        click() {
          const cbs = listeners[`${id}:click`] || [];
          cbs.forEach((cb) => cb({ target: el }));
        },
        appendChild(child: any) {
          el.children.push(child);
        },
        closest(selector: string) {
          return null;
        },
        querySelector(selector: string) {
          return el.querySelectorAll(selector)[0] || null;
        },
        querySelectorAll(selector: string) {
          const results: any[] = [];
          function scan(node: any) {
            if (node.className && node.className.includes(selector.replace('.', ''))) {
              results.push(node);
            }
            if (node.children) {
              node.children.forEach(scan);
            }
          }
          scan(el);
          return results;
        },
      };
      return el;
    }

    const ids = [
      'featureNameInput',
      'presetPill',
      'nameChips',
      'pascalChip',
      'kebabChip',
      'routeChip',
      'pluralWarning',
      'routePathInput',
      'targetPathInput',
      'parentModuleText',
      'parentModuleInput',
      // Segmented control
      'segFlat',
      'segGrouped',
      'modeFlat',
      'modeGrouped',
      'modeFlatCard',
      'modeGroupedCard',
      // Presets
      'presetCrud',
      'presetDomain',
      'presetMinimal',
      // Components
      'flatComponentsCard',
      'groupedComponentsCard',
      'serviceFileName',
      'controllerFileName',
      'moduleFileName',
      'groupedModuleFileName',
      'addGroupedCtrlBtn',
      'groupedCtrlContainer',
      'addGroupedSrvBtn',
      'groupedSrvContainer',
      'includeStores',
      'addStoreBtn',
      'storesContainer',
      'includeProviders',
      'addProviderBtn',
      'providersContainer',
      'includeRepository',
      'repositoryFileName',
      'includePolicy',
      'policyFileName',
      'includeInterface',
      'interfaceFileName',
      'includeSpecs',
      'includeI18n',
      'toggleSpecs',
      'toggleI18n',
      'dtoContainer',
      'addDtoBtn',
      'includeEvents',
      'addEventBtn',
      'eventsContainer',
      'includeListeners',
      'addListenerBtn',
      'listenersContainer',
      'includeProcessors',
      'addProcessorBtn',
      'processorsContainer',
      'includeTasks',
      'addTaskBtn',
      'tasksContainer',
      'previewTree',
      'fileCountBadge',
      'conflictAlert',
      'forgeBtn',
      'cancelBtn',
      // Count spans
      'count-controller',
      'count-service',
      'count-store',
      'count-provider',
      'count-dto',
      'count-event',
      'count-listener',
      'count-processor',
      'count-task',
    ];

    ids.forEach((id) => {
      elements[id] = makeElement(id);
    });

    // Default card toggles and steppers
    const componentTypes = [
      'controller',
      'service',
      'repository',
      'store',
      'provider',
      'policy',
      'interface',
      'dto',
      'event',
      'listener',
      'processor',
      'task',
      'spec',
    ];

    componentTypes.forEach((key) => {
      elements[`card-${key}`] = makeElement(`card-${key}`, 'component-card');
      elements[`toggle-${key}`] = makeElement(`toggle-${key}`, 'toggle-btn');
      elements[`stepper-minus-${key}`] = makeElement(`stepper-minus-${key}`, 'stepper-btn');
      elements[`stepper-plus-${key}`] = makeElement(`stepper-plus-${key}`, 'stepper-btn');
    });

    const docListeners: Record<string, Function[]> = {};

    const sandbox: any = {
      acquireVsCodeApi: () => ({
        postMessage: () => {},
        getState: () => ({}),
        setState: () => {},
      }),
      document: {
        getElementById: (id: string) => elements[id] || null,
        querySelectorAll: (sel: string) => {
          const all: any[] = [];
          Object.values(elements).forEach((el) => all.push(...el.querySelectorAll(sel)));
          return all;
        },
        createElement: (tag: string) => makeElement('', ''),
        addEventListener: (event: string, cb: Function) => {
          docListeners[event] = docListeners[event] || [];
          docListeners[event].push(cb);
        },
      },
      window: {
        addEventListener: () => {},
      },
      setTimeout: (fn: Function) => fn(),
      clearTimeout: () => {},
    };

    vm.createContext(sandbox);
    sandbox.globalThis = sandbox.window;
    vm.runInContext(listNamingCode, sandbox);
    sandbox.window.NestForgeListNaming = sandbox.NestForgeListNaming || sandbox.window.NestForgeListNaming;
    vm.runInContext(formJsCode, sandbox);
    Object.assign(sandbox, sandbox.window);

    return { sandbox, elements, docListeners };
  }

  it('exposes plain data table of presets', () => {
    const { sandbox } = createFormContext();
    expect(sandbox.PRESETS).toBeDefined();
    expect(sandbox.PRESETS.crud).toBeDefined();
    expect(sandbox.PRESETS.domain).toBeDefined();
    expect(sandbox.PRESETS.minimal).toBeDefined();

    // Standard CRUD definition check
    expect(sandbox.PRESETS.crud.label).toBe('Standard CRUD');
    expect(sandbox.PRESETS.crud.components.controller.enabled).toBe(true);
    expect(sandbox.PRESETS.crud.components.service.enabled).toBe(true);
    expect(sandbox.PRESETS.crud.components.repository.enabled).toBe(true);
    expect(sandbox.PRESETS.crud.components.dto.enabled).toBe(true);
    expect(sandbox.PRESETS.crud.components.dto.count).toBe(2);

    // Full domain definition check
    expect(sandbox.PRESETS.domain.label).toBe('Full domain');
    expect(sandbox.PRESETS.domain.structureMode).toBe('grouped');
    expect(sandbox.PRESETS.domain.components.store.enabled).toBe(true);
    expect(sandbox.PRESETS.domain.components.provider.enabled).toBe(true);
    expect(sandbox.PRESETS.domain.components.event.enabled).toBe(true);
    expect(sandbox.PRESETS.domain.components.listener.enabled).toBe(true);
    expect(sandbox.PRESETS.domain.components.processor.enabled).toBe(true);
    expect(sandbox.PRESETS.domain.components.task.enabled).toBe(true);

    // Minimal definition check
    expect(sandbox.PRESETS.minimal.label).toBe('Minimal');
    expect(sandbox.PRESETS.minimal.components.controller.enabled).toBe(true);
    expect(sandbox.PRESETS.minimal.components.service.enabled).toBe(true);
    expect(sandbox.PRESETS.minimal.components.repository.enabled).toBe(false);
    expect(sandbox.PRESETS.minimal.components.dto.enabled).toBe(false);
  });

  it('applying presets sets toggles and counts without changing feature name', () => {
    const { sandbox, elements } = createFormContext();

    elements.featureNameInput.value = 'billing';
    sandbox.onFeatureNameChange();

    // 1. Apply Minimal
    sandbox.applyPreset('minimal');
    expect(elements.featureNameInput.value).toBe('billing');
    let state = sandbox.getFormState();
    expect(state.featureName).toBe('billing');
    expect(state.structureMode).toBe('flat');
    expect(state.includeRepository).toBe(false);
    expect(state.dtoFiles).toHaveLength(0);
    expect(state.includeEvents).toBe(false);
    expect(state.includeTasks).toBe(false);

    // 2. Apply Full domain
    sandbox.applyPreset('domain');
    expect(elements.featureNameInput.value).toBe('billing');
    state = sandbox.getFormState();
    expect(state.structureMode).toBe('grouped');
    expect(state.includeRepository).toBe(true);
    expect(state.includeStores).toBe(true);
    expect(state.includeProviders).toBe(true);
    expect(state.includeEvents).toBe(true);
    expect(state.includeListeners).toBe(true);
    expect(state.includeProcessors).toBe(true);
    expect(state.includeTasks).toBe(true);
    expect(state.dtoFiles).toHaveLength(2);

    // 3. Apply Standard CRUD
    sandbox.applyPreset('crud');
    expect(elements.featureNameInput.value).toBe('billing');
    state = sandbox.getFormState();
    expect(state.structureMode).toBe('flat');
    expect(state.includeRepository).toBe(true);
    expect(state.dtoFiles).toHaveLength(2);
    expect(state.includeEvents).toBe(false);
    expect(state.includeProcessors).toBe(false);
  });

  it('count stepper maps properly to state (1..5 bounds and list sizing)', () => {
    const { sandbox, elements } = createFormContext();

    elements.featureNameInput.value = 'invoice';
    sandbox.onFeatureNameChange();

    // DTO starts at 2 (create-invoice, update-invoice)
    let state = sandbox.getFormState();
    expect(state.dtoFiles).toEqual([
      { name: 'create-invoice' },
      { name: 'update-invoice' },
    ]);

    // Step up to 3
    sandbox.setComponentCount('dto', 3);
    state = sandbox.getFormState();
    expect(state.dtoFiles).toHaveLength(3);
    expect(state.dtoFiles[2].name).toBe('filter-invoice');

    // Step up to 5
    sandbox.setComponentCount('dto', 5);
    state = sandbox.getFormState();
    expect(state.dtoFiles).toHaveLength(5);

    // Stepper upper bound clamp: attempting 6 stays at 5
    sandbox.setComponentCount('dto', 6);
    state = sandbox.getFormState();
    expect(state.dtoFiles).toHaveLength(5);

    // Step down to 1
    sandbox.setComponentCount('dto', 1);
    state = sandbox.getFormState();
    expect(state.dtoFiles).toHaveLength(1);
    expect(state.dtoFiles[0].name).toBe('create-invoice');

    // Stepper lower bound clamp: attempting 0 stays at 1
    sandbox.setComponentCount('dto', 0);
    state = sandbox.getFormState();
    expect(state.dtoFiles).toHaveLength(1);
  });

  it('segmented architecture layout switch switches flat and grouped mode', () => {
    const { sandbox, elements } = createFormContext();

    elements.featureNameInput.value = 'order';
    sandbox.onFeatureNameChange();

    expect(sandbox.getFormState().structureMode).toBe('flat');

    sandbox.selectArchitectureMode('grouped');
    expect(sandbox.getFormState().structureMode).toBe('grouped');

    sandbox.selectArchitectureMode('flat');
    expect(sandbox.getFormState().structureMode).toBe('flat');
  });

  it('flat vs grouped planner output is unchanged for the same logical selection', () => {
    const { sandbox, elements } = createFormContext();

    elements.featureNameInput.value = 'customer';
    sandbox.onFeatureNameChange();
    sandbox.applyPreset('crud');

    // Flat mode plan
    const flatState = sandbox.getFormState();
    expect(flatState.structureMode).toBe('flat');
    const flatPlans = buildPlan(flatState, conventions, '/workspace');

    // Grouped mode plan
    sandbox.selectArchitectureMode('grouped');
    const groupedState = sandbox.getFormState();
    expect(groupedState.structureMode).toBe('grouped');
    const groupedPlans = buildPlan(groupedState, conventions, '/workspace');

    // Flat should generate controller, service, repository, module at root + DTOs + i18n
    const flatRelPaths = flatPlans.map((p) => p.relativePath);
    expect(flatRelPaths).toContain('src/features/customer/customer.controller.ts');
    expect(flatRelPaths).toContain('src/features/customer/customer.service.ts');
    expect(flatRelPaths).toContain('src/features/customer/customer.repository.ts');
    expect(flatRelPaths).toContain('src/features/customer/customer.module.ts');
    expect(flatRelPaths).toContain('src/features/customer/dto/create-customer.dto.ts');
    expect(flatRelPaths).toContain('src/features/customer/dto/update-customer.dto.ts');
    expect(flatRelPaths).toContain('src/i18n/en/customer.json');
    expect(flatRelPaths).toContain('src/i18n/ar/customer.json');

    // Grouped should generate controller in controllers/, service in services/, repository at root, module at root + DTOs + i18n
    const groupedRelPaths = groupedPlans.map((p) => p.relativePath);
    expect(groupedRelPaths).toContain('src/features/customer/controllers/customer.controller.ts');
    expect(groupedRelPaths).toContain('src/features/customer/services/customer.service.ts');
    expect(groupedRelPaths).toContain('src/features/customer/customer.repository.ts');
    expect(groupedRelPaths).toContain('src/features/customer/customer.module.ts');
    expect(groupedRelPaths).toContain('src/features/customer/dto/create-customer.dto.ts');
    expect(groupedRelPaths).toContain('src/features/customer/dto/update-customer.dto.ts');
    expect(groupedRelPaths).toContain('src/i18n/en/customer.json');
    expect(groupedRelPaths).toContain('src/i18n/ar/customer.json');

    // Both generate exactly 8 files for the standard CRUD selection
    expect(flatPlans).toHaveLength(8);
    expect(groupedPlans).toHaveLength(8);
  });
});

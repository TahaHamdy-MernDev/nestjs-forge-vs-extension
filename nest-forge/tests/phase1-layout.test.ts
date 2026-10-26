import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { describe, expect, it } from 'vitest';

describe('Phase 1: Single-page layout and identity header', () => {
  const formJsCode = fs.readFileSync(
    path.resolve(__dirname, '../src/webview/ui/form.js'),
    'utf-8',
  );
  const listNamingCode = fs.readFileSync(
    path.resolve(__dirname, '../src/webview/ui/list-naming.js'),
    'utf-8',
  );

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
          el.attributes[k] = v;
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
        appendChild(child: any) {
          el.children.push(child);
        },
        closest(selector: string) {
          return null;
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
      'modeFlat',
      'modeGrouped',
      'modeFlatCard',
      'modeGroupedCard',
      'flatComponentsCard',
      'serviceFileName',
      'controllerFileName',
      'moduleFileName',
      'groupedComponentsCard',
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
    ];

    ids.forEach((id) => {
      elements[id] = makeElement(id);
    });

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
        addEventListener: () => {},
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

    return { sandbox, elements };
  }

  it('renders derived chips live: PascalCase, kebab-case, and route prefix', () => {
    const { sandbox, elements } = createFormContext();

    elements.featureNameInput.value = 'user-profile';
    sandbox.onFeatureNameChange();

    expect(elements.pascalChip.textContent).toBe('UserProfile');
    expect(elements.kebabChip.textContent).toBe('user-profile');
    expect(elements.routeChip.textContent).toBe('/user-profiles');
    expect(elements.nameChips.style.display).toBe('flex');
    expect(elements.pluralWarning.style.display).toBe('none');
  });

  it('displays suspicious plural warning when input ends with s', () => {
    const { sandbox, elements } = createFormContext();

    elements.featureNameInput.value = 'users';
    sandbox.onFeatureNameChange();

    expect(elements.pluralWarning.style.display).not.toBe('none');
    expect(elements.pluralWarning.textContent).toContain('already ends in "s"');
  });

  it('displays suspicious plural warning when word is uncountable like auth', () => {
    const { sandbox, elements } = createFormContext();

    elements.featureNameInput.value = 'auth';
    sandbox.onFeatureNameChange();

    expect(elements.pluralWarning.style.display).not.toBe('none');
    expect(elements.pluralWarning.textContent).toContain('uncountable');
  });

  it('getFormState preserves all expected fields and contracts', () => {
    const { sandbox, elements } = createFormContext();

    elements.featureNameInput.value = 'order';
    elements.routePathInput.value = 'custom-orders';
    // User edits routePath
    elements.routePathInput.dispatchEvent({ type: 'input' });
    elements.targetPathInput.value = 'src/features/order';
    elements.parentModuleInput.value = 'src/app.module.ts';
    sandbox.onFeatureNameChange();

    const state = sandbox.getFormState();
    expect(state.featureName).toBe('order');
    expect(state.routePath).toBe('custom-orders');
    expect(state.targetPath).toBe('src/features/order');
    expect(state.parentModulePath).toBe('src/app.module.ts');
    expect(state.structureMode).toBe('flat');
    expect(state.dtoFiles).toEqual([
      { name: 'create-order' },
      { name: 'update-order' },
    ]);
  });

  it('parentModuleText mirrors conventions.parentModule and updates when overridden', () => {
    const { sandbox, elements } = createFormContext();

    // Trigger setDefaults
    elements.parentModuleInput.value = 'src/features/features.module.ts';
    elements.featureNameInput.value = 'payment';
    sandbox.onFeatureNameChange();

    expect(elements.parentModuleText.textContent).toBe('src/features/features.module.ts');

    // Override parent module input
    elements.parentModuleInput.value = 'src/custom.module.ts';
    elements.parentModuleInput.dispatchEvent({ type: 'input' });

    expect(elements.parentModuleText.textContent).toBe('src/custom.module.ts');
  });
});

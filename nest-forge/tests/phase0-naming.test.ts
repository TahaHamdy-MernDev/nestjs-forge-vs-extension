import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { describe, expect, it } from 'vitest';

describe('Phase 0: DTO, Event, and Listener naming (form.js)', () => {
  const formJsCode = fs.readFileSync(
    path.resolve(__dirname, '../src/webview/ui/form.js'),
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
      'modeFlat',
      'modeGrouped',
      'modeFlatCard',
      'modeGroupedCard',
      'routePathInput',
      'targetPathInput',
      'parentModuleInput',
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
      'presetPill',
    ];

    ids.forEach((id) => {
      elements[id] = makeElement(id);
    });

    const listNamingCode = fs.readFileSync(
      path.resolve(__dirname, '../src/webview/ui/list-naming.js'),
      'utf-8',
    );

    const sandbox: any = {
      acquireVsCodeApi: () => ({
        postMessage: () => {},
        getState: () => ({}),
        setState: () => {},
      }),
      document: {
        getElementById: (id: string) => elements[id] || null,
        querySelectorAll: (sel: string) => {
          if (sel === '.dto-item-input') return elements.dtoContainer.querySelectorAll('.dto-item-input');
          if (sel === '.event-item-input') return elements.eventsContainer.querySelectorAll('.event-item-input');
          if (sel === '.listener-item-input') return elements.listenersContainer.querySelectorAll('.listener-item-input');
          return [];
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
    // In browser, window === globalThis
    sandbox.globalThis = sandbox.window;
    vm.runInContext(listNamingCode, sandbox);
    sandbox.window.NestForgeListNaming = sandbox.NestForgeListNaming || sandbox.window.NestForgeListNaming;
    vm.runInContext(formJsCode, sandbox);

    return { sandbox, elements };
  }

  it('default DTO, event, and listener names follow feature name character-by-character without stacking', () => {
    const { sandbox, elements } = createFormContext();

    const chars = ['t', 'a', 'h', 'a'];
    let current = '';

    for (const ch of chars) {
      current += ch;
      elements.featureNameInput.value = current;
      sandbox.onFeatureNameChange();
    }

    const state = sandbox.getFormState();

    // DTOs: create-taha and update-taha (NOT create-t-ta-tah-taha or create-taha-taha...)
    expect(state.dtoFiles).toEqual([
      { name: 'create-taha' },
      { name: 'update-taha' },
    ]);

    // Events: taha-created
    expect(state.eventFiles).toEqual([
      { name: 'taha-created' },
    ]);

    // Listeners: taha-created
    expect(state.listenerFiles).toEqual([
      { name: 'taha-created' },
    ]);
  });

  it('manually edited DTO names are preserved when feature name changes', () => {
    const { sandbox, elements } = createFormContext();

    elements.featureNameInput.value = 'user';
    sandbox.onFeatureNameChange();

    let state = sandbox.getFormState();
    expect(state.dtoFiles).toEqual([
      { name: 'create-user' },
      { name: 'update-user' },
    ]);

    // User manually edits the first DTO input to "custom-input"
    const inputs = elements.dtoContainer.querySelectorAll('.dto-item-input');
    inputs[0].value = 'custom-input.dto.ts';
    // Simulate user typing into input
    sandbox.syncCurrentDynamicInputs();

    // Now feature name changes to "order"
    elements.featureNameInput.value = 'order';
    sandbox.onFeatureNameChange();

    state = sandbox.getFormState();
    // The manually edited DTO should stay 'custom-input', the unedited DTO should track 'order' -> 'update-order'
    expect(state.dtoFiles).toEqual([
      { name: 'custom-input' },
      { name: 'update-order' },
    ]);
  });

  it('manually edited event and listener names are preserved when feature name changes', () => {
    const { sandbox, elements } = createFormContext();

    elements.featureNameInput.value = 'user';
    sandbox.onFeatureNameChange();

    let state = sandbox.getFormState();
    expect(state.eventFiles).toEqual([{ name: 'user-created' }]);
    expect(state.listenerFiles).toEqual([{ name: 'user-created' }]);

    // User edits event and listener inputs
    const evInputs = elements.eventsContainer.querySelectorAll('.event-item-input');
    evInputs[0].value = 'custom-event.event.ts';
    const lisInputs = elements.listenersContainer.querySelectorAll('.listener-item-input');
    lisInputs[0].value = 'custom-listener.listener.ts';

    sandbox.syncCurrentDynamicInputs();

    // Now feature name changes to "order"
    elements.featureNameInput.value = 'order';
    sandbox.onFeatureNameChange();

    state = sandbox.getFormState();
    expect(state.eventFiles).toEqual([{ name: 'custom-event' }]);
    expect(state.listenerFiles).toEqual([{ name: 'custom-listener' }]);
  });
});

const vscode = acquireVsCodeApi();

// Elements
const featureNameInput = document.getElementById('featureNameInput');
const modeFlat = document.getElementById('modeFlat');
const modeGrouped = document.getElementById('modeGrouped');
const routePathInput = document.getElementById('routePathInput');
const targetPathInput = document.getElementById('targetPathInput');
const parentModuleInput = document.getElementById('parentModuleInput');

const flatComponentsCard = document.getElementById('flatComponentsCard');
const serviceFileName = document.getElementById('serviceFileName');
const controllerFileName = document.getElementById('controllerFileName');
const moduleFileName = document.getElementById('moduleFileName');

const groupedComponentsCard = document.getElementById('groupedComponentsCard');
const groupedModuleFileName = document.getElementById('groupedModuleFileName');
const addGroupedCtrlBtn = document.getElementById('addGroupedCtrlBtn');
const groupedCtrlContainer = document.getElementById('groupedCtrlContainer');
const addGroupedSrvBtn = document.getElementById('addGroupedSrvBtn');
const groupedSrvContainer = document.getElementById('groupedSrvContainer');

const includeStores = document.getElementById('includeStores');
const addStoreBtn = document.getElementById('addStoreBtn');
const storesContainer = document.getElementById('storesContainer');

const includeProviders = document.getElementById('includeProviders');
const addProviderBtn = document.getElementById('addProviderBtn');
const providersContainer = document.getElementById('providersContainer');

const includeRepository = document.getElementById('includeRepository');
const repositoryFileName = document.getElementById('repositoryFileName');
const includePolicy = document.getElementById('includePolicy');
const policyFileName = document.getElementById('policyFileName');
const includeInterface = document.getElementById('includeInterface');
const interfaceFileName = document.getElementById('interfaceFileName');
const includeSpecs = document.getElementById('includeSpecs');
const includeI18n = document.getElementById('includeI18n');

const dtoContainer = document.getElementById('dtoContainer');
const addDtoBtn = document.getElementById('addDtoBtn');

const includeEvents = document.getElementById('includeEvents');
const addEventBtn = document.getElementById('addEventBtn');
const eventsContainer = document.getElementById('eventsContainer');

const includeListeners = document.getElementById('includeListeners');
const addListenerBtn = document.getElementById('addListenerBtn');
const listenersContainer = document.getElementById('listenersContainer');

const includeProcessors = document.getElementById('includeProcessors');
const addProcessorBtn = document.getElementById('addProcessorBtn');
const processorsContainer = document.getElementById('processorsContainer');

const includeTasks = document.getElementById('includeTasks');
const addTaskBtn = document.getElementById('addTaskBtn');
const tasksContainer = document.getElementById('tasksContainer');

const previewTree = document.getElementById('previewTree');
const fileCountBadge = document.getElementById('fileCountBadge');
const conflictAlert = document.getElementById('conflictAlert');
const forgeBtn = document.getElementById('forgeBtn');
const cancelBtn = document.getElementById('cancelBtn');
const presetPill = document.getElementById('presetPill');

// Hugeicons SVGs (stroke-based, zero emojis)
const HUGEICONS = {
  folder: '<svg class="hi-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M3 7v13a1 1 0 001 1h16a1 1 0 001-1V9a1 1 0 00-1-1h-7.172a2 2 0 01-1.414-.586l-1.828-1.828A2 2 0 009.172 5H4a1 1 0 00-1 1z" /></svg>',
  file: '<svg class="hi-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v16a1 1 0 001 1h14a1 1 0 001-1V8.5L14.5 3H5a1 1 0 00-1 1z" /><path d="M14 3v5.5H20" /></svg>',
  fileEdit: '<svg class="hi-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M4 4v16a1 1 0 001 1h8" /><path d="M14 3H5a1 1 0 00-1 1v3" /><path d="M14 3v5.5H20" /><path d="M16 11l5 5-7.5 7.5H9v-4.5L16 11z" /></svg>',
  alert: '<svg class="hi-icon" viewBox="0 0 24 24" width="15" height="15" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M12 9v4" /><path d="M12 17h.01" /><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" /></svg>',
  cancel: '<svg viewBox="0 0 24 24" width="14" height="14" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round"><path d="M18 6L6 18M6 6l12 12" /></svg>',
};

// Internal State
let structureMode = 'flat'; // 'flat' | 'grouped'

let conventions = {
  featuresDir: 'src/features',
  parentModule: 'src/features/features.module.ts',
  orm: 'drizzle',
  validator: 'class-validator',
  importExtension: '.js',
};

let userManuallyEdited = {
  routePath: false,
  targetPath: false,
  serviceFile: false,
  controllerFile: false,
  moduleFile: false,
  groupedModuleFile: false,
  repositoryFile: false,
  policyFile: false,
  interfaceFile: false,
};

let dtoList = ['create', 'update'];
let eventList = ['created'];
let listenerList = ['created'];
let groupedCtrlList = [];
let groupedSrvList = [];
let storeList = [];
let providerList = [];
let processorList = [];
let taskList = [];

function escapeHtml(str) {
  if (!str) return '';
  return String(str).replace(/[&<>"']/g, (m) => ({
    '&': '&amp;',
    '<': '&lt;',
    '>': '&gt;',
    '"': '&quot;',
    "'": '&#39;',
  })[m]);
}

// Casing Helpers
function splitWords(input) {
  if (!input) return [];
  return input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[\s_\-\.]+/g, ' ')
    .trim()
    .split(' ')
    .map((w) => w.toLowerCase())
    .filter(Boolean);
}

function toKebab(words) {
  return words.join('-');
}

function validateIdentifier(name) {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Identifier must be a non-empty string' };
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Identifier cannot be empty' };
  }
  if (!/^[a-zA-Z]/.test(trimmed)) {
    return {
      valid: false,
      error: `Invalid identifier '${name}': must start with a letter`,
    };
  }
  if (!/^[a-zA-Z][a-zA-Z0-9._-]*$/.test(trimmed)) {
    return {
      valid: false,
      error: `Invalid identifier '${name}': can only contain letters, digits, '.', '_', and '-'`,
    };
  }
  return { valid: true };
}

function pluralize(word) {
  if (!word) return '';
  const lower = word.toLowerCase();

  const uncountables = new Set([
    'news',
    'information',
    'feedback',
    'data',
    'auth',
  ]);
  if (uncountables.has(lower)) {
    return word;
  }

  const irregulars = {
    person: 'people',
    child: 'children',
    man: 'men',
    woman: 'women',
    datum: 'data',
    criterion: 'criteria',
  };
  if (irregulars[lower]) return irregulars[lower];

  const irregularPlurals = new Set(Object.values(irregulars));
  if (irregularPlurals.has(lower)) return word;

  if (/[bcdfghjklmnpqrstvwxyz]y$/i.test(word)) return word.slice(0, -1) + 'ies';
  if (/ies$/i.test(word)) return word;
  if (/(sses|xes|zes|ches|shes|statuses|buses)$/i.test(word)) return word;
  if (/(us|ss|x|z|ch|sh)$/i.test(word)) return word + 'es';
  if (/s$/i.test(word)) return word;

  return word + 's';
}

function deriveNames(raw) {
  if (!raw) return { kebab: '', pluralKebab: '' };
  const validation = validateIdentifier(raw);
  if (!validation.valid) return { kebab: '', pluralKebab: '' };

  const words = splitWords(raw);
  if (words.length === 0) return { kebab: '', pluralKebab: '' };

  const lastWord = words[words.length - 1];
  const pluralLast = pluralize(lastWord);
  const pluralWords = [...words.slice(0, -1), pluralLast];

  return {
    kebab: toKebab(words),
    pluralKebab: toKebab(pluralWords),
  };
}

function syncCurrentDynamicInputs() {
  const dtoInputs = document.querySelectorAll('.dto-item-input');
  dtoInputs.forEach((inp) => {
    const idx = parseInt(inp.getAttribute('data-index'), 10);
    const val = inp.value.trim().replace(/\.dto\.ts$/, '');
    if (val && !isNaN(idx) && idx < dtoList.length) {
      dtoList[idx] = val;
    }
  });

  const eventInputs = document.querySelectorAll('.event-item-input');
  eventInputs.forEach((inp) => {
    const idx = parseInt(inp.getAttribute('data-index'), 10);
    const val = inp.value.trim().replace(/\.event\.ts$/, '');
    if (val && !isNaN(idx) && idx < eventList.length) {
      eventList[idx] = val;
    }
  });

  const listenerInputs = document.querySelectorAll('.listener-item-input');
  listenerInputs.forEach((inp) => {
    const idx = parseInt(inp.getAttribute('data-index'), 10);
    const val = inp.value.trim().replace(/\.listener\.ts$/, '');
    if (val && !isNaN(idx) && idx < listenerList.length) {
      listenerList[idx] = val;
    }
  });

  const ctrlInputs = document.querySelectorAll('.ctrl-item-input');
  ctrlInputs.forEach((inp) => {
    const idx = parseInt(inp.getAttribute('data-index'), 10);
    const val = inp.value.trim().replace(/\.controller\.ts$/, '');
    if (val && !isNaN(idx) && idx < groupedCtrlList.length) {
      groupedCtrlList[idx] = val;
    }
  });

  const srvInputs = document.querySelectorAll('.srv-item-input');
  srvInputs.forEach((inp) => {
    const idx = parseInt(inp.getAttribute('data-index'), 10);
    const val = inp.value.trim().replace(/\.service\.ts$/, '');
    if (val && !isNaN(idx) && idx < groupedSrvList.length) {
      groupedSrvList[idx] = val;
    }
  });

  const storeInputs = document.querySelectorAll('.store-item-input');
  storeInputs.forEach((inp) => {
    const idx = parseInt(inp.getAttribute('data-index'), 10);
    const val = inp.value.trim().replace(/\.store\.ts$/, '');
    if (val && !isNaN(idx) && idx < storeList.length) {
      storeList[idx] = val;
    }
  });

  const providerInputs = document.querySelectorAll('.provider-item-input');
  providerInputs.forEach((inp) => {
    const idx = parseInt(inp.getAttribute('data-index'), 10);
    const val = inp.value.trim().replace(/\.provider\.ts$/, '').replace(/\.handler\.ts$/, '');
    if (val && !isNaN(idx) && idx < providerList.length) {
      providerList[idx] = val;
    }
  });

  const processorInputs = document.querySelectorAll('.processor-item-input');
  processorInputs.forEach((inp) => {
    const idx = parseInt(inp.getAttribute('data-index'), 10);
    const val = inp.value.trim().replace(/\.processor\.ts$/, '');
    if (val && !isNaN(idx) && idx < processorList.length) {
      processorList[idx] = val;
    }
  });

  const taskInputs = document.querySelectorAll('.task-item-input');
  taskInputs.forEach((inp) => {
    const idx = parseInt(inp.getAttribute('data-index'), 10);
    const val = inp.value.trim().replace(/\.task\.ts$/, '');
    if (val && !isNaN(idx) && idx < taskList.length) {
      taskList[idx] = val;
    }
  });
}

// Update derived form values
function onFeatureNameChange() {
  const raw = featureNameInput.value.trim();
  if (raw) {
    const identCheck = validateIdentifier(raw);
    if (!identCheck.valid) {
      forgeBtn.disabled = true;
      previewTree.innerHTML = `<div class="tree-empty" style="color: var(--vscode-errorForeground);">${escapeHtml(identCheck.error)}</div>`;
      fileCountBadge.textContent = '0 files';
      conflictAlert.style.display = 'none';
      return;
    }
  }

  const names = deriveNames(raw);

  if (!names.kebab) {
    forgeBtn.disabled = true;
    previewTree.innerHTML = '<div class="tree-empty">Enter a feature name to preview generated structure</div>';
    fileCountBadge.textContent = '0 files';
    conflictAlert.style.display = 'none';
    return;
  }

  forgeBtn.disabled = false;

  if (!userManuallyEdited.routePath) {
    routePathInput.value = names.pluralKebab;
  }

  if (!userManuallyEdited.targetPath) {
    targetPathInput.value = `${conventions.featuresDir}/${names.kebab}`;
  }

  if (!userManuallyEdited.serviceFile) {
    serviceFileName.value = `${names.kebab}.service.ts`;
  }

  if (!userManuallyEdited.controllerFile) {
    controllerFileName.value = `${names.kebab}.controller.ts`;
  }

  if (!userManuallyEdited.moduleFile) {
    moduleFileName.value = `${names.kebab}.module.ts`;
  }

  if (!userManuallyEdited.groupedModuleFile && groupedModuleFileName) {
    groupedModuleFileName.value = `${names.kebab}.module.ts`;
  }

  if (!userManuallyEdited.repositoryFile) {
    repositoryFileName.value = `${names.kebab}.repository.ts`;
  }

  if (!userManuallyEdited.policyFile && policyFileName) {
    policyFileName.value = `${names.kebab}.policy.ts`;
  }

  if (!userManuallyEdited.interfaceFile) {
    interfaceFileName.value = `${names.kebab}.interface.ts`;
  }

  if (groupedCtrlList.length === 0) {
    groupedCtrlList = [names.kebab || 'item'];
  }

  if (groupedSrvList.length === 0) {
    groupedSrvList = [names.kebab || 'item'];
  }

  if (storeList.length === 0) {
    storeList = [`drizzle-${names.kebab || 'item'}`];
  }

  if (providerList.length === 0) {
    providerList = ['session-auth'];
  }

  if (processorList.length === 0) {
    processorList = [names.kebab || 'item'];
  }

  if (taskList.length === 0) {
    taskList = [names.kebab || 'item'];
  }

  renderDynamicLists(true);
  requestPreview();
}

function renderDynamicLists(skipSync = false) {
  if (!skipSync) {
    syncCurrentDynamicInputs();
  }

  const raw = featureNameInput.value.trim();
  const names = deriveNames(raw);
  const prefix = names.kebab || 'item';

  // DTOs
  dtoContainer.innerHTML = '';
  dtoList.forEach((dto, index) => {
    const row = document.createElement('div');
    row.className = 'dynamic-item';
    const computed = dto.startsWith(prefix) ? dto : (prefix ? `${dto}-${prefix}` : dto);
    row.innerHTML = `
      <input type="text" class="code-input dto-item-input" data-index="${index}" value="${escapeHtml(computed)}.dto.ts">
      <button type="button" class="btn-remove" data-type="dto" data-index="${index}">${HUGEICONS.cancel}</button>
    `;
    dtoContainer.appendChild(row);
  });

  // Events
  eventsContainer.innerHTML = '';
  eventList.forEach((evt, index) => {
    const row = document.createElement('div');
    row.className = 'dynamic-item';
    const computed = evt.startsWith(prefix) ? evt : (prefix ? `${prefix}-${evt}` : evt);
    row.innerHTML = `
      <input type="text" class="code-input event-item-input" data-index="${index}" value="${escapeHtml(computed)}.event.ts">
      <button type="button" class="btn-remove" data-type="event" data-index="${index}">${HUGEICONS.cancel}</button>
    `;
    eventsContainer.appendChild(row);
  });

  // Listeners
  listenersContainer.innerHTML = '';
  listenerList.forEach((lis, index) => {
    const row = document.createElement('div');
    row.className = 'dynamic-item';
    const computed = lis.startsWith(prefix) ? lis : (prefix ? `${prefix}-${lis}` : lis);
    row.innerHTML = `
      <input type="text" class="code-input listener-item-input" data-index="${index}" value="${escapeHtml(computed)}.listener.ts">
      <button type="button" class="btn-remove" data-type="listener" data-index="${index}">${HUGEICONS.cancel}</button>
    `;
    listenersContainer.appendChild(row);
  });

  // Grouped Controllers
  if (groupedCtrlContainer) {
    groupedCtrlContainer.innerHTML = '';
    groupedCtrlList.forEach((ctrl, index) => {
      const row = document.createElement('div');
      row.className = 'dynamic-item';
      const clean = ctrl.replace(/\.controller\.ts$/, '').replace(/\.controller$/, '');
      row.innerHTML = `
        <input type="text" class="code-input ctrl-item-input" data-index="${index}" value="${escapeHtml(clean)}.controller.ts">
        <button type="button" class="btn-remove" data-type="ctrl" data-index="${index}">${HUGEICONS.cancel}</button>
      `;
      groupedCtrlContainer.appendChild(row);
    });
  }

  // Grouped Services
  if (groupedSrvContainer) {
    groupedSrvContainer.innerHTML = '';
    groupedSrvList.forEach((srv, index) => {
      const row = document.createElement('div');
      row.className = 'dynamic-item';
      const clean = srv.replace(/\.service\.ts$/, '').replace(/\.service$/, '');
      row.innerHTML = `
        <input type="text" class="code-input srv-item-input" data-index="${index}" value="${escapeHtml(clean)}.service.ts">
        <button type="button" class="btn-remove" data-type="srv" data-index="${index}">${HUGEICONS.cancel}</button>
      `;
      groupedSrvContainer.appendChild(row);
    });
  }

  // Grouped Stores
  if (storesContainer) {
    storesContainer.innerHTML = '';
    storeList.forEach((store, index) => {
      const row = document.createElement('div');
      row.className = 'dynamic-item';
      const clean = store.replace(/\.store\.ts$/, '').replace(/\.store$/, '');
      row.innerHTML = `
        <input type="text" class="code-input store-item-input" data-index="${index}" value="${escapeHtml(clean)}.store.ts">
        <button type="button" class="btn-remove" data-type="store" data-index="${index}">${HUGEICONS.cancel}</button>
      `;
      storesContainer.appendChild(row);
    });
  }

  // Grouped Providers
  if (providersContainer) {
    providersContainer.innerHTML = '';
    providerList.forEach((provider, index) => {
      const row = document.createElement('div');
      row.className = 'dynamic-item';
      let clean = provider.replace(/\.ts$/, '');
      let ext = clean.endsWith('.handler') ? '' : (clean.endsWith('.provider') ? '' : '.provider');
      row.innerHTML = `
        <input type="text" class="code-input provider-item-input" data-index="${index}" value="${escapeHtml(clean)}${ext}.ts">
        <button type="button" class="btn-remove" data-type="provider" data-index="${index}">${HUGEICONS.cancel}</button>
      `;
      providersContainer.appendChild(row);
    });
  }

  // Processors
  if (processorsContainer) {
    processorsContainer.innerHTML = '';
    processorList.forEach((proc, index) => {
      const row = document.createElement('div');
      row.className = 'dynamic-item';
      const clean = proc.replace(/\.processor\.ts$/, '').replace(/\.processor$/, '');
      row.innerHTML = `
        <input type="text" class="code-input processor-item-input" data-index="${index}" value="${escapeHtml(clean)}.processor.ts">
        <button type="button" class="btn-remove" data-type="processor" data-index="${index}">${HUGEICONS.cancel}</button>
      `;
      processorsContainer.appendChild(row);
    });
  }

  // Tasks
  if (tasksContainer) {
    tasksContainer.innerHTML = '';
    taskList.forEach((task, index) => {
      const row = document.createElement('div');
      row.className = 'dynamic-item';
      const clean = task.replace(/\.task\.ts$/, '').replace(/\.task$/, '');
      row.innerHTML = `
        <input type="text" class="code-input task-item-input" data-index="${index}" value="${escapeHtml(clean)}.task.ts">
        <button type="button" class="btn-remove" data-type="task" data-index="${index}">${HUGEICONS.cancel}</button>
      `;
      tasksContainer.appendChild(row);
    });
  }
}

function getFormState() {
  const featureName = featureNameInput.value.trim();

  const dtoInputs = Array.from(document.querySelectorAll('.dto-item-input'));
  const dtoFiles = dtoInputs.map((i) => ({ name: i.value.trim().replace(/\.dto\.ts$/, '') })).filter((x) => Boolean(x.name));

  const eventInputs = Array.from(document.querySelectorAll('.event-item-input'));
  const eventFiles = eventInputs.map((i) => ({ name: i.value.trim().replace(/\.event\.ts$/, '') })).filter((x) => Boolean(x.name));

  const listenerInputs = Array.from(document.querySelectorAll('.listener-item-input'));
  const listenerFiles = listenerInputs.map((i) => ({ name: i.value.trim().replace(/\.listener\.ts$/, '') })).filter((x) => Boolean(x.name));

  const processorInputs = Array.from(document.querySelectorAll('.processor-item-input'));
  const processorFiles = processorInputs.map((i) => ({ name: i.value.trim().replace(/\.processor\.ts$/, '') })).filter((x) => Boolean(x.name));

  const taskInputs = Array.from(document.querySelectorAll('.task-item-input'));
  const taskFiles = taskInputs.map((i) => ({ name: i.value.trim().replace(/\.task\.ts$/, '') })).filter((x) => Boolean(x.name));

  const ctrlInputs = Array.from(document.querySelectorAll('.ctrl-item-input'));
  const controllerFiles = ctrlInputs.map((i) => ({ name: i.value.trim().replace(/\.controller\.ts$/, '') })).filter((x) => Boolean(x.name));

  const srvInputs = Array.from(document.querySelectorAll('.srv-item-input'));
  const serviceFiles = srvInputs.map((i) => ({ name: i.value.trim().replace(/\.service\.ts$/, '') })).filter((x) => Boolean(x.name));

  const storeInputs = Array.from(document.querySelectorAll('.store-item-input'));
  const storeFiles = storeInputs.map((i) => ({ name: i.value.trim().replace(/\.store\.ts$/, '') })).filter((x) => Boolean(x.name));

  const providerInputs = Array.from(document.querySelectorAll('.provider-item-input'));
  const providerFiles = providerInputs.map((i) => ({ name: i.value.trim().replace(/\.provider\.ts$/, '').replace(/\.handler\.ts$/, '') })).filter((x) => Boolean(x.name));

  return {
    featureName,
    routePath: routePathInput ? routePathInput.value.trim() : '',
    structureMode,
    targetPath: targetPathInput.value.trim(),
    parentModulePath: parentModuleInput.value.trim(),
    serviceFileName: serviceFileName.value.trim(),
    controllerFileName: controllerFileName.value.trim(),
    moduleFileName: structureMode === 'grouped' ? (groupedModuleFileName?.value.trim() || `${featureName}.module.ts`) : moduleFileName.value.trim(),
    includeRepository: includeRepository.checked,
    repositoryFileName: repositoryFileName.value.trim(),
    includePolicy: includePolicy ? includePolicy.checked : false,
    policyFileName: policyFileName ? policyFileName.value.trim() : `${featureName}.policy.ts`,
    includeInterface: includeInterface.checked,
    interfaceFileName: interfaceFileName.value.trim(),
    includeSpecs: includeSpecs.checked,
    includeI18n: includeI18n ? includeI18n.checked : false,
    includeStores: includeStores ? includeStores.checked : true,
    storeFiles,
    includeProviders: includeProviders ? includeProviders.checked : true,
    providerFiles,
    includeProcessors: includeProcessors ? includeProcessors.checked : false,
    processorFiles,
    includeTasks: includeTasks ? includeTasks.checked : false,
    taskFiles,
    controllerFiles,
    serviceFiles,
    dtoFiles,
    includeEvents: includeEvents.checked,
    eventFiles,
    includeListeners: includeListeners.checked,
    listenerFiles,
  };
}

function requestPreview() {
  const state = getFormState();
  if (!state.featureName) return;
  vscode.postMessage({
    command: 'updatePreview',
    state,
  });
}

// Listen to messages from extension host
window.addEventListener('message', (event) => {
  const message = event.data;

  switch (message.command) {
    case 'setDefaults': {
      conventions = message.conventions;
      presetPill.textContent = `${conventions.orm.toUpperCase()} • ${conventions.validator.toUpperCase()}`;
      parentModuleInput.value = conventions.parentModule;
      if (message.initialTargetPath) {
        conventions.featuresDir = message.initialTargetPath;
      }
      onFeatureNameChange();
      break;
    }

    case 'previewUpdated': {
      renderPreviewTree(message.plans);
      break;
    }

    case 'forgeCancelled': {
      forgeBtn.disabled = false;
      document.getElementById('forgeBtnText').textContent = 'Forge Feature';
      break;
    }
  }
});

function renderPreviewTree(plans) {
  if (!plans || plans.length === 0) {
    previewTree.innerHTML = '<div class="tree-empty">No files to generate</div>';
    fileCountBadge.textContent = '0 files';
    conflictAlert.style.display = 'none';
    return;
  }

  let conflictCount = 0;
  let html = '';

  const targetDir = targetPathInput.value.trim();
  html += `<div class="tree-node dir"><span class="icon">${HUGEICONS.folder}</span> <span>${escapeHtml(targetDir)}/</span></div>`;

  plans.forEach((plan) => {
    if (plan.exists) conflictCount++;

    const fileName = plan.relativePath.replace(targetDir + '/', '');
    const isConflict = plan.exists;
    const tagClass = isConflict ? 'tag-conflict' : 'tag-new';
    const tagText = isConflict ? 'EXISTS' : 'NEW';

    html += `
      <div class="tree-node file" style="padding-left: 20px;">
        <span class="icon">${isConflict ? HUGEICONS.alert : HUGEICONS.file}</span>
        <span>${escapeHtml(fileName)}</span>
        <span class="tag ${tagClass}">${tagText}</span>
      </div>
    `;
  });

  const parentModule = parentModuleInput.value.trim();
  if (parentModule) {
    html += `
      <div class="tree-node file" style="margin-top: 8px; border-top: 1px dashed var(--border-color); padding-top: 6px;">
        <span class="icon">${HUGEICONS.fileEdit}</span>
        <span>${escapeHtml(parentModule)}</span>
        <span class="tag tag-modified">UPDATED</span>
      </div>
    `;
  }

  const hasI18nPlan = plans.some((p) => p.templateName === 'i18n-en' || p.templateName === 'i18n-ar');
  if (hasI18nPlan) {
    const i18nDir = conventions.i18nDir || 'src/i18n';
    html += `
      <div class="tree-node file" style="margin-top: 4px; border-top: 1px dashed var(--border-color); padding-top: 6px;">
        <span class="icon">${HUGEICONS.fileEdit}</span>
        <span>${escapeHtml(i18nDir)}/translations.ts</span>
        <span class="tag tag-modified">SYNCED</span>
      </div>
    `;
  }

  previewTree.innerHTML = html;
  fileCountBadge.textContent = `${plans.length} files`;

  if (conflictCount > 0) {
    conflictAlert.style.display = 'flex';
  } else {
    conflictAlert.style.display = 'none';
  }
}

// Event Listeners
if (modeFlat) {
  modeFlat.addEventListener('click', () => {
    structureMode = 'flat';
    modeFlat.classList.add('active');
    modeGrouped.classList.remove('active');
    if (flatComponentsCard) flatComponentsCard.style.display = 'block';
    if (groupedComponentsCard) groupedComponentsCard.style.display = 'none';
    requestPreview();
  });
}

if (modeGrouped) {
  modeGrouped.addEventListener('click', () => {
    structureMode = 'grouped';
    modeGrouped.classList.add('active');
    modeFlat.classList.remove('active');
    if (flatComponentsCard) flatComponentsCard.style.display = 'none';
    if (groupedComponentsCard) groupedComponentsCard.style.display = 'block';

    const raw = featureNameInput.value.trim();
    const names = deriveNames(raw);
    if (groupedCtrlList.length === 0) groupedCtrlList = [names.kebab || 'item'];
    if (groupedSrvList.length === 0) groupedSrvList = [names.kebab || 'item'];
    if (storeList.length === 0) storeList = [`drizzle-${names.kebab || 'item'}`];
    if (providerList.length === 0) providerList = ['session-auth'];

    renderDynamicLists(true);
    requestPreview();
  });
}

featureNameInput.addEventListener('input', onFeatureNameChange);
routePathInput.addEventListener('input', () => { userManuallyEdited.routePath = true; requestPreview(); });
targetPathInput.addEventListener('input', () => { userManuallyEdited.targetPath = true; requestPreview(); });
parentModuleInput.addEventListener('input', requestPreview);

serviceFileName.addEventListener('input', () => { userManuallyEdited.serviceFile = true; requestPreview(); });
controllerFileName.addEventListener('input', () => { userManuallyEdited.controllerFile = true; requestPreview(); });
moduleFileName.addEventListener('input', () => { userManuallyEdited.moduleFile = true; requestPreview(); });
if (groupedModuleFileName) {
  groupedModuleFileName.addEventListener('input', () => { userManuallyEdited.groupedModuleFile = true; requestPreview(); });
}
repositoryFileName.addEventListener('input', () => { userManuallyEdited.repositoryFile = true; requestPreview(); });
if (policyFileName) {
  policyFileName.addEventListener('input', () => { userManuallyEdited.policyFile = true; requestPreview(); });
}
interfaceFileName.addEventListener('input', () => { userManuallyEdited.interfaceFile = true; requestPreview(); });

includeRepository.addEventListener('change', () => {
  repositoryFileName.disabled = !includeRepository.checked;
  requestPreview();
});

if (includePolicy) {
  includePolicy.addEventListener('change', () => {
    policyFileName.disabled = !includePolicy.checked;
    requestPreview();
  });
}

includeInterface.addEventListener('change', () => {
  interfaceFileName.disabled = !includeInterface.checked;
  requestPreview();
});

includeSpecs.addEventListener('change', requestPreview);
if (includeI18n) {
  includeI18n.addEventListener('change', requestPreview);
}

if (includeStores) {
  includeStores.addEventListener('change', () => {
    const show = includeStores.checked;
    if (storesContainer) storesContainer.style.display = show ? 'flex' : 'none';
    if (addStoreBtn) addStoreBtn.style.display = show ? 'block' : 'none';
    requestPreview();
  });
}

if (includeProviders) {
  includeProviders.addEventListener('change', () => {
    const show = includeProviders.checked;
    if (providersContainer) providersContainer.style.display = show ? 'flex' : 'none';
    if (addProviderBtn) addProviderBtn.style.display = show ? 'block' : 'none';
    requestPreview();
  });
}

includeEvents.addEventListener('change', () => {
  const show = includeEvents.checked;
  eventsContainer.style.display = show ? 'flex' : 'none';
  addEventBtn.style.display = show ? 'block' : 'none';
  requestPreview();
});

includeListeners.addEventListener('change', () => {
  const show = includeListeners.checked;
  listenersContainer.style.display = show ? 'flex' : 'none';
  addListenerBtn.style.display = show ? 'block' : 'none';
  requestPreview();
});

if (includeProcessors) {
  includeProcessors.addEventListener('change', () => {
    const show = includeProcessors.checked;
    if (processorsContainer) processorsContainer.style.display = show ? 'flex' : 'none';
    if (addProcessorBtn) addProcessorBtn.style.display = show ? 'block' : 'none';
    requestPreview();
  });
}

if (includeTasks) {
  includeTasks.addEventListener('change', () => {
    const show = includeTasks.checked;
    if (tasksContainer) tasksContainer.style.display = show ? 'flex' : 'none';
    if (addTaskBtn) addTaskBtn.style.display = show ? 'block' : 'none';
    requestPreview();
  });
}

// Dynamic Inputs change listening to sync internal arrays without destroying focus
dtoContainer.addEventListener('input', (e) => {
  if (e.target.classList.contains('dto-item-input')) {
    const idx = parseInt(e.target.getAttribute('data-index'), 10);
    const val = e.target.value.trim().replace(/\.dto\.ts$/, '');
    if (val && !isNaN(idx) && idx < dtoList.length) {
      dtoList[idx] = val;
    }
    requestPreview();
  }
});

eventsContainer.addEventListener('input', (e) => {
  if (e.target.classList.contains('event-item-input')) {
    const idx = parseInt(e.target.getAttribute('data-index'), 10);
    const val = e.target.value.trim().replace(/\.event\.ts$/, '');
    if (val && !isNaN(idx) && idx < eventList.length) {
      eventList[idx] = val;
    }
    requestPreview();
  }
});

listenersContainer.addEventListener('input', (e) => {
  if (e.target.classList.contains('listener-item-input')) {
    const idx = parseInt(e.target.getAttribute('data-index'), 10);
    const val = e.target.value.trim().replace(/\.listener\.ts$/, '');
    if (val && !isNaN(idx) && idx < listenerList.length) {
      listenerList[idx] = val;
    }
    requestPreview();
  }
});

if (groupedCtrlContainer) {
  groupedCtrlContainer.addEventListener('input', (e) => {
    if (e.target.classList.contains('ctrl-item-input')) {
      const idx = parseInt(e.target.getAttribute('data-index'), 10);
      const val = e.target.value.trim().replace(/\.controller\.ts$/, '');
      if (val && !isNaN(idx) && idx < groupedCtrlList.length) {
        groupedCtrlList[idx] = val;
      }
      requestPreview();
    }
  });
}

if (groupedSrvContainer) {
  groupedSrvContainer.addEventListener('input', (e) => {
    if (e.target.classList.contains('srv-item-input')) {
      const idx = parseInt(e.target.getAttribute('data-index'), 10);
      const val = e.target.value.trim().replace(/\.service\.ts$/, '');
      if (val && !isNaN(idx) && idx < groupedSrvList.length) {
        groupedSrvList[idx] = val;
      }
      requestPreview();
    }
  });
}

if (storesContainer) {
  storesContainer.addEventListener('input', (e) => {
    if (e.target.classList.contains('store-item-input')) {
      const idx = parseInt(e.target.getAttribute('data-index'), 10);
      const val = e.target.value.trim().replace(/\.store\.ts$/, '');
      if (val && !isNaN(idx) && idx < storeList.length) {
        storeList[idx] = val;
      }
      requestPreview();
    }
  });
}

if (providersContainer) {
  providersContainer.addEventListener('input', (e) => {
    if (e.target.classList.contains('provider-item-input')) {
      const idx = parseInt(e.target.getAttribute('data-index'), 10);
      const val = e.target.value.trim().replace(/\.provider\.ts$/, '').replace(/\.handler\.ts$/, '');
      if (val && !isNaN(idx) && idx < providerList.length) {
        providerList[idx] = val;
      }
      requestPreview();
    }
  });
}

if (processorsContainer) {
  processorsContainer.addEventListener('input', (e) => {
    if (e.target.classList.contains('processor-item-input')) {
      const idx = parseInt(e.target.getAttribute('data-index'), 10);
      const val = e.target.value.trim().replace(/\.processor\.ts$/, '');
      if (val && !isNaN(idx) && idx < processorList.length) {
        processorList[idx] = val;
      }
      requestPreview();
    }
  });
}

if (tasksContainer) {
  tasksContainer.addEventListener('input', (e) => {
    if (e.target.classList.contains('task-item-input')) {
      const idx = parseInt(e.target.getAttribute('data-index'), 10);
      const val = e.target.value.trim().replace(/\.task\.ts$/, '');
      if (val && !isNaN(idx) && idx < taskList.length) {
        taskList[idx] = val;
      }
      requestPreview();
    }
  });
}

addDtoBtn.addEventListener('click', () => {
  syncCurrentDynamicInputs();
  dtoList.push('custom');
  renderDynamicLists(true);
  requestPreview();
});

addEventBtn.addEventListener('click', () => {
  syncCurrentDynamicInputs();
  eventList.push('action');
  renderDynamicLists(true);
  requestPreview();
});

addListenerBtn.addEventListener('click', () => {
  syncCurrentDynamicInputs();
  listenerList.push('action');
  renderDynamicLists(true);
  requestPreview();
});

if (addProcessorBtn) {
  addProcessorBtn.addEventListener('click', () => {
    syncCurrentDynamicInputs();
    processorList.push('worker');
    renderDynamicLists(true);
    requestPreview();
  });
}

if (addTaskBtn) {
  addTaskBtn.addEventListener('click', () => {
    syncCurrentDynamicInputs();
    taskList.push('cron');
    renderDynamicLists(true);
    requestPreview();
  });
}

if (addGroupedCtrlBtn) {
  addGroupedCtrlBtn.addEventListener('click', () => {
    syncCurrentDynamicInputs();
    groupedCtrlList.push('admin');
    renderDynamicLists(true);
    requestPreview();
  });
}

if (addGroupedSrvBtn) {
  addGroupedSrvBtn.addEventListener('click', () => {
    syncCurrentDynamicInputs();
    groupedSrvList.push('token');
    renderDynamicLists(true);
    requestPreview();
  });
}

if (addStoreBtn) {
  addStoreBtn.addEventListener('click', () => {
    syncCurrentDynamicInputs();
    storeList.push('session');
    renderDynamicLists(true);
    requestPreview();
  });
}

if (addProviderBtn) {
  addProviderBtn.addEventListener('click', () => {
    syncCurrentDynamicInputs();
    providerList.push('token-auth');
    renderDynamicLists(true);
    requestPreview();
  });
}

document.addEventListener('click', (e) => {
  const btn = e.target.closest('.btn-remove');
  if (btn) {
    syncCurrentDynamicInputs();
    const type = btn.getAttribute('data-type');
    const index = parseInt(btn.getAttribute('data-index'), 10);

    if (type === 'dto') {
      dtoList.splice(index, 1);
    } else if (type === 'event') {
      eventList.splice(index, 1);
    } else if (type === 'listener') {
      listenerList.splice(index, 1);
    } else if (type === 'ctrl') {
      groupedCtrlList.splice(index, 1);
    } else if (type === 'srv') {
      groupedSrvList.splice(index, 1);
    } else if (type === 'store') {
      storeList.splice(index, 1);
    } else if (type === 'provider') {
      providerList.splice(index, 1);
    } else if (type === 'processor') {
      processorList.splice(index, 1);
    } else if (type === 'task') {
      taskList.splice(index, 1);
    }
    renderDynamicLists(true);
    requestPreview();
  }
});

forgeBtn.addEventListener('click', () => {
  const state = getFormState();
  forgeBtn.disabled = true;
  document.getElementById('forgeBtnText').textContent = 'Forging...';

  vscode.postMessage({
    command: 'forgeFeature',
    state,
    overwriteConflicts: false,
  });
});

cancelBtn.addEventListener('click', () => {
  vscode.postMessage({ command: 'cancel' });
});

// Initialize
vscode.postMessage({ command: 'init' });


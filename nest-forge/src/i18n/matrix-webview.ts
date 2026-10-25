import * as crypto from 'node:crypto';
import * as vscode from 'vscode';
import { TranslationStore } from './store.js';

export function escapeHtml(str: string): string {
  return String(str || '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export class MatrixWebviewPanel {
  public static currentPanel: MatrixWebviewPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    store: TranslationStore,
  ): MatrixWebviewPanel {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (MatrixWebviewPanel.currentPanel) {
      MatrixWebviewPanel.currentPanel.panel.reveal(column);
      MatrixWebviewPanel.currentPanel.updateData();
      return MatrixWebviewPanel.currentPanel;
    }

    const panel = vscode.window.createWebviewPanel(
      'nestForgeI18nMatrix',
      'Nest Forge: Translation Matrix',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [],
      },
    );

    MatrixWebviewPanel.currentPanel = new MatrixWebviewPanel(panel, store);
    return MatrixWebviewPanel.currentPanel;
  }

  private constructor(
    panel: vscode.WebviewPanel,
    private readonly store: TranslationStore,
  ) {
    this.panel = panel;
    this.panel.webview.html = this.getHtml();

    this.panel.onDidDispose(() => this.dispose(), null, this.disposables);

    this.panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'ready':
            this.updateData();
            break;

          case 'saveCell': {
            const { key, lang, value } = message;
            const ok = await this.store.setKeyValue(key, lang, value);
            if (ok) {
              this.panel.webview.postMessage({
                command: 'cellSaved',
                key,
                lang,
              });
            }
            break;
          }

          case 'addKey': {
            const { key, enValue, arValue } = message;
            if (!key) return;
            await this.store.addMissingKey(key, 'en', enValue || '');
            await this.store.addMissingKey(key, 'ar', arValue || '');
            this.updateData();
            vscode.window.showInformationMessage(
              `✨ Created translation key "${key}".`,
            );
            break;
          }

          case 'deleteKey': {
            const { key } = message;
            const confirm = await vscode.window.showWarningMessage(
              `Delete translation key "${key}" from all translation files?`,
              { modal: true },
              'Delete',
            );
            if (confirm === 'Delete') {
              await this.store.deleteKey(key);
              this.updateData();
              vscode.window.showInformationMessage(`Deleted key "${key}".`);
            }
            break;
          }

          case 'jumpToKey': {
            const { key, lang } = message;
            const entry = this.store.getKey(key);
            const loc = entry?.locations[lang] || entry?.locations['en'] || entry?.locations['ar'];
            if (loc) {
              vscode.commands.executeCommand(
                'nestForge.i18n.openKeyLocation',
                loc.uri,
                loc.range,
              );
            }
            break;
          }

          case 'reload':
            this.store.reload();
            this.updateData();
            break;

          case 'fixAll':
            await this.store.fixAllMissing();
            this.updateData();
            break;
        }
      },
      null,
      this.disposables,
    );

    // Listen to store updates
    this.disposables.push(
      this.store.onDidUpdate(() => {
        this.updateData();
      }),
    );
  }

  public updateData(): void {
    const entries = this.store.getAllKeys().filter((e) => !e.isPlural);
    const parity = this.store.checkParity();

    const data = entries.map((entry) => {
      const en = entry.values['en'] ?? null;
      const ar = entry.values['ar'] ?? null;

      let status = 'complete';
      if (en !== null && ar === null) status = 'missing-ar';
      else if (ar !== null && en === null) status = 'missing-en';
      else if (en === '' || ar === '') status = 'empty';

      // Check for typography issue in Arabic
      const hasTypo = parity.typographyIssues.some((t) => t.key === entry.key);

      return {
        key: entry.key,
        namespace: entry.namespace,
        en: en ?? '',
        ar: ar ?? '',
        status,
        hasTypo,
      };
    });

    const stats = {
      total: entries.length,
      missingAr: parity.missingInAr.length,
      missingEn: parity.missingInEn.length,
      empty: parity.emptyValues.length,
      placeholders: parity.placeholderMismatches.length,
      typography: parity.typographyIssues.length,
    };

    this.panel.webview.postMessage({
      command: 'setData',
      entries: data,
      stats,
    });
  }

  public dispose(): void {
    MatrixWebviewPanel.currentPanel = undefined;
    this.panel.dispose();
    while (this.disposables.length) {
      const x = this.disposables.pop();
      if (x) x.dispose();
    }
  }

  private getHtml(): string {
    const nonce = crypto.randomBytes(16).toString('base64');
    return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; style-src 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <title>Nest Forge: Translation Matrix</title>
  <style>
    :root {
      --bg: var(--vscode-editor-background);
      --fg: var(--vscode-editor-foreground);
      --border: var(--vscode-input-border, #3c3c3c);
      --input-bg: var(--vscode-input-background, #252526);
      --input-fg: var(--vscode-input-foreground, #cccccc);
      --btn-bg: var(--vscode-button-background, #007acc);
      --btn-fg: var(--vscode-button-foreground, #ffffff);
      --btn-hover: var(--vscode-button-hoverBackground, #0062a3);
      --badge-bg: var(--vscode-badge-background, #4d4d4d);
      --badge-fg: var(--vscode-badge-foreground, #ffffff);
      --danger: #f87171;
      --warning: #fbbf24;
      --success: #34d399;
      --info: #60a5fa;
    }

    * { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background-color: var(--bg);
      color: var(--fg);
      font-family: var(--vscode-font-family, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif);
      font-size: var(--vscode-font-size, 13px);
      padding: 16px 24px;
      line-height: 1.5;
    }

    header {
      display: flex;
      flex-wrap: wrap;
      justify-content: space-between;
      align-items: center;
      gap: 12px;
      padding-bottom: 16px;
      border-bottom: 1px solid var(--border);
      margin-bottom: 16px;
    }

    .title-row {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    h1 {
      font-size: 18px;
      font-weight: 600;
      display: flex;
      align-items: center;
      gap: 8px;
    }

    .header-actions {
      display: flex;
      gap: 8px;
    }

    button {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border: 1px solid transparent;
      padding: 6px 12px;
      border-radius: 4px;
      font-size: 12px;
      cursor: pointer;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      transition: background 0.15s ease;
    }

    button:hover { background: var(--btn-hover); }

    button.secondary {
      background: transparent;
      border-color: var(--border);
      color: var(--fg);
    }
    button.secondary:hover { background: var(--input-bg); }

    /* Controls Bar */
    .controls-bar {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 12px;
      margin-bottom: 16px;
    }

    .search-box {
      flex: 1;
      min-width: 250px;
      position: relative;
    }

    .search-box input {
      width: 100%;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--border);
      padding: 7px 12px;
      border-radius: 4px;
      font-size: 13px;
      outline: none;
    }

    .search-box input:focus {
      border-color: var(--btn-bg);
    }

    .filter-chips {
      display: flex;
      gap: 6px;
      flex-wrap: wrap;
    }

    .chip {
      background: var(--input-bg);
      color: var(--fg);
      border: 1px solid var(--border);
      padding: 4px 10px;
      border-radius: 12px;
      font-size: 11px;
      cursor: pointer;
      user-select: none;
      transition: all 0.15s ease;
    }

    .chip.active {
      background: var(--btn-bg);
      color: var(--btn-fg);
      border-color: var(--btn-bg);
    }

    /* Table */
    .table-container {
      overflow-x: auto;
      border: 1px solid var(--border);
      border-radius: 6px;
      background: var(--input-bg);
    }

    table {
      width: 100%;
      border-collapse: collapse;
      text-align: left;
    }

    thead th {
      background: var(--bg);
      padding: 10px 14px;
      font-size: 12px;
      font-weight: 600;
      color: var(--fg);
      border-bottom: 1px solid var(--border);
      position: sticky;
      top: 0;
      z-index: 10;
    }

    tbody tr {
      border-bottom: 1px solid var(--border);
      transition: background 0.1s ease;
    }

    tbody tr:hover {
      background: rgba(255, 255, 255, 0.02);
    }

    td {
      padding: 8px 12px;
      vertical-align: top;
    }

    .key-cell {
      width: 240px;
      font-family: var(--vscode-editor-font-family, monospace);
      font-size: 12px;
      word-break: break-all;
    }

    .ns-tag {
      display: inline-block;
      font-size: 10px;
      padding: 2px 6px;
      border-radius: 3px;
      background: var(--badge-bg);
      color: var(--badge-fg);
      margin-bottom: 4px;
    }

    .key-text {
      color: #9cdcfe;
    }

    .text-cell {
      min-width: 220px;
    }

    textarea.cell-editor {
      width: 100%;
      background: transparent;
      color: var(--fg);
      border: 1px solid transparent;
      border-radius: 4px;
      padding: 6px 8px;
      font-family: inherit;
      font-size: 13px;
      resize: vertical;
      min-height: 48px;
      line-height: 1.4;
      outline: none;
      transition: border-color 0.15s ease, background 0.15s ease;
    }

    textarea.cell-editor:focus {
      background: var(--bg);
      border-color: var(--btn-bg);
    }

    textarea.cell-editor.rtl {
      direction: rtl;
      font-family: 'Segoe UI', Tahoma, Arial, sans-serif;
    }

    textarea.saved {
      border-color: var(--success) !important;
    }

    /* Badges */
    .status-badge {
      display: inline-block;
      font-size: 10px;
      padding: 2px 8px;
      border-radius: 10px;
      font-weight: 500;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .badge-complete { background: rgba(52, 211, 153, 0.15); color: var(--success); }
    .badge-missing-ar { background: rgba(248, 113, 113, 0.15); color: var(--danger); }
    .badge-missing-en { background: rgba(96, 165, 250, 0.15); color: var(--info); }
    .badge-empty { background: rgba(251, 191, 36, 0.15); color: var(--warning); }
    .badge-typo { background: rgba(249, 115, 22, 0.15); color: #fb923c; margin-top: 4px; }

    .actions-cell {
      width: 90px;
      text-align: center;
    }

    .icon-btn {
      background: transparent;
      border: none;
      color: var(--fg);
      opacity: 0.6;
      cursor: pointer;
      padding: 4px;
      border-radius: 4px;
      font-size: 14px;
    }

    .icon-btn:hover {
      opacity: 1;
      background: var(--input-bg);
    }

    /* Modal for Add Key */
    .modal-overlay {
      display: none;
      position: fixed;
      top: 0; left: 0; right: 0; bottom: 0;
      background: rgba(0, 0, 0, 0.6);
      z-index: 100;
      align-items: center;
      justify-content: center;
    }

    .modal-overlay.open { display: flex; }

    .modal {
      background: var(--bg);
      border: 1px solid var(--border);
      border-radius: 8px;
      width: 480px;
      max-width: 90vw;
      padding: 20px;
      box-shadow: 0 10px 25px rgba(0,0,0,0.5);
    }

    .modal h2 {
      font-size: 16px;
      margin-bottom: 16px;
    }

    .form-group {
      margin-bottom: 12px;
    }

    .form-group label {
      display: block;
      font-size: 12px;
      margin-bottom: 4px;
      color: #9cdcfe;
    }

    .form-group input, .form-group textarea {
      width: 100%;
      background: var(--input-bg);
      color: var(--input-fg);
      border: 1px solid var(--border);
      padding: 8px;
      border-radius: 4px;
      outline: none;
    }

    .modal-actions {
      display: flex;
      justify-content: flex-end;
      gap: 8px;
      margin-top: 16px;
    }
  </style>
</head>
<body>

  <header>
    <div class="title-row">
      <h1>🌐 Nest Forge: Translation Matrix</h1>
      <span id="statsLabel" style="opacity: 0.7; font-size: 12px;">Loading...</span>
    </div>
    <div class="header-actions">
      <button id="addKeyBtn">+ Add Translation Key</button>
      <button class="secondary" id="fixAllBtn">⚡ Auto-Fix All</button>
      <button class="secondary" id="reloadBtn">↻ Reload</button>
    </div>
  </header>

  <div class="controls-bar">
    <div class="search-box">
      <input type="text" id="searchInput" placeholder="Filter by key, English, or Arabic text..." />
    </div>
    <div class="filter-chips">
      <div class="chip active" data-filter="all">All (<span id="countAll">0</span>)</div>
      <div class="chip" data-filter="missing-ar">Missing AR (<span id="countMissingAr">0</span>)</div>
      <div class="chip" data-filter="missing-en">Missing EN (<span id="countMissingEn">0</span>)</div>
      <div class="chip" data-filter="empty">Empty (<span id="countEmpty">0</span>)</div>
      <div class="chip" data-filter="typo">AR Typo (<span id="countTypo">0</span>)</div>
    </div>
  </div>

  <div class="table-container">
    <table>
      <thead>
        <tr>
          <th style="width: 240px;">Key Path</th>
          <th>🇬🇧 English</th>
          <th>🇸🇦 Arabic (RTL)</th>
          <th style="width: 110px;">Status</th>
          <th style="width: 80px;">Actions</th>
        </tr>
      </thead>
      <tbody id="tableBody">
        <tr>
          <td colspan="5" style="text-align: center; padding: 32px; opacity: 0.6;">Loading translations...</td>
        </tr>
      </tbody>
    </table>
  </div>

  <!-- Add Key Modal -->
  <div class="modal-overlay" id="addKeyModal">
    <div class="modal">
      <h2>Add New Translation Key</h2>
      <div class="form-group">
        <label for="newKeyInput">Full Key Path (e.g. auth.messages.login_success)</label>
        <input type="text" id="newKeyInput" placeholder="namespace.group.key" />
      </div>
      <div class="form-group">
        <label for="newEnInput">English Translation (en)</label>
        <textarea id="newEnInput" rows="2" placeholder="English text..."></textarea>
      </div>
      <div class="form-group">
        <label for="newArInput">Arabic Translation (ar)</label>
        <textarea id="newArInput" rows="2" dir="rtl" placeholder="النص بالعربية..."></textarea>
      </div>
      <div class="modal-actions">
        <button class="secondary" id="modalCancelBtn">Cancel</button>
        <button id="modalSaveBtn">Create Key</button>
      </div>
    </div>
  </div>

  <script nonce="${nonce}">
    const vscode = acquireVsCodeApi();
    let allEntries = [];
    let currentFilter = 'all';

    const searchInput = document.getElementById('searchInput');
    const tableBody = document.getElementById('tableBody');
    const addKeyModal = document.getElementById('addKeyModal');

    // Notify extension that webview is loaded
    vscode.postMessage({ command: 'ready' });

    window.addEventListener('message', (event) => {
      const msg = event.data;
      if (msg.command === 'setData') {
        allEntries = msg.entries;
        updateCounts(msg.stats);
        renderTable();
      } else if (msg.command === 'cellSaved') {
        const el = Array.from(document.querySelectorAll('textarea.cell-editor')).find(
          (t) => t.getAttribute('data-key') === msg.key && t.getAttribute('data-lang') === msg.lang
        );
        if (el) {
          el.classList.add('saved');
          setTimeout(() => el.classList.remove('saved'), 1000);
        }
      }
    });

    function updateCounts(stats) {
      document.getElementById('countAll').innerText = stats.total;
      document.getElementById('countMissingAr').innerText = stats.missingAr;
      document.getElementById('countMissingEn').innerText = stats.missingEn;
      document.getElementById('countEmpty').innerText = stats.empty;
      document.getElementById('countTypo').innerText = stats.typography;
      document.getElementById('statsLabel').innerText = \`\${stats.total} total keys | \${stats.missingAr + stats.missingEn} missing\`;
    }

    function renderTable() {
      const query = searchInput.value.toLowerCase().trim();

      const filtered = allEntries.filter((entry) => {
        // Filter chip check
        if (currentFilter === 'missing-ar' && entry.status !== 'missing-ar') return false;
        if (currentFilter === 'missing-en' && entry.status !== 'missing-en') return false;
        if (currentFilter === 'empty' && entry.status !== 'empty') return false;
        if (currentFilter === 'typo' && !entry.hasTypo) return false;

        // Search query check
        if (!query) return true;
        return (
          entry.key.toLowerCase().includes(query) ||
          entry.en.toLowerCase().includes(query) ||
          entry.ar.toLowerCase().includes(query)
        );
      });

      if (filtered.length === 0) {
        tableBody.innerHTML = \`<tr><td colspan="5" style="text-align: center; padding: 32px; opacity: 0.6;">No matching translation keys found.</td></tr>\`;
        return;
      }

      tableBody.innerHTML = filtered.map((entry) => {
        let badgeHtml = '';
        if (entry.status === 'complete') badgeHtml = '<span class="status-badge badge-complete">Paired</span>';
        else if (entry.status === 'missing-ar') badgeHtml = '<span class="status-badge badge-missing-ar">Missing AR</span>';
        else if (entry.status === 'missing-en') badgeHtml = '<span class="status-badge badge-missing-en">Missing EN</span>';
        else if (entry.status === 'empty') badgeHtml = '<span class="status-badge badge-empty">Empty</span>';

        if (entry.hasTypo) {
          badgeHtml += '<br/><span class="status-badge badge-typo">AR Typo</span>';
        }

        const safeKey = escapeHtml(entry.key);
        const safeNamespace = escapeHtml(entry.namespace);

        return \`
          <tr data-key="\${safeKey}">
            <td class="key-cell">
              <span class="ns-tag">\${safeNamespace}</span><br/>
              <span class="key-text">\${safeKey}</span>
            </td>
            <td class="text-cell">
              <textarea class="cell-editor" data-key="\${safeKey}" data-lang="en">\${escapeHtml(entry.en)}</textarea>
            </td>
            <td class="text-cell">
              <textarea class="cell-editor rtl" data-key="\${safeKey}" data-lang="ar">\${escapeHtml(entry.ar)}</textarea>
            </td>
            <td>\${badgeHtml}</td>
            <td class="actions-cell">
              <button class="icon-btn" title="Jump to File" data-action="jump" data-key="\${safeKey}">📂</button>
              <button class="icon-btn" title="Delete Key" data-action="delete" data-key="\${safeKey}">🗑</button>
            </td>
          </tr>
        \`;
      }).join('');

      // Attach blur auto-save listeners
      document.querySelectorAll('textarea.cell-editor').forEach((textarea) => {
        textarea.addEventListener('change', (e) => {
          const key = e.target.getAttribute('data-key');
          const lang = e.target.getAttribute('data-lang');
          const value = e.target.value;
          vscode.postMessage({ command: 'saveCell', key, lang, value });
        });
      });
    }

    function escapeHtml(str) {
      return (str || '')
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
    }

    tableBody.addEventListener('click', (e) => {
      const btn = e.target.closest('button[data-action]');
      if (!btn) return;
      const action = btn.getAttribute('data-action');
      const key = btn.getAttribute('data-key');
      if (!key) return;
      if (action === 'jump') {
        vscode.postMessage({ command: 'jumpToKey', key, lang: 'en' });
      } else if (action === 'delete') {
        vscode.postMessage({ command: 'deleteKey', key });
      }
    });

    // Filter Chips
    document.querySelectorAll('.chip').forEach((chip) => {
      chip.addEventListener('click', () => {
        document.querySelectorAll('.chip').forEach((c) => c.classList.remove('active'));
        chip.classList.add('active');
        currentFilter = chip.getAttribute('data-filter');
        renderTable();
      });
    });

    searchInput.addEventListener('input', () => {
      renderTable();
    });

    document.getElementById('reloadBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'reload' });
    });

    document.getElementById('fixAllBtn').addEventListener('click', () => {
      vscode.postMessage({ command: 'fixAll' });
    });

    // Add Key Modal
    const addKeyBtn = document.getElementById('addKeyBtn');
    const modalCancelBtn = document.getElementById('modalCancelBtn');
    const modalSaveBtn = document.getElementById('modalSaveBtn');

    addKeyBtn.addEventListener('click', () => {
      addKeyModal.classList.add('open');
      document.getElementById('newKeyInput').focus();
    });

    modalCancelBtn.addEventListener('click', () => {
      addKeyModal.classList.remove('open');
    });

    modalSaveBtn.addEventListener('click', () => {
      const key = document.getElementById('newKeyInput').value.trim();
      const enValue = document.getElementById('newEnInput').value;
      const arValue = document.getElementById('newArInput').value;

      if (!key) {
        alert('Please provide a key path (e.g. auth.messages.login_success)');
        return;
      }

      vscode.postMessage({ command: 'addKey', key, enValue, arValue });
      addKeyModal.classList.remove('open');
      document.getElementById('newKeyInput').value = '';
      document.getElementById('newEnInput').value = '';
      document.getElementById('newArInput').value = '';
    });
  </script>
</body>
</html>`;
  }
}

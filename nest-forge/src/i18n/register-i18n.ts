import * as path from 'node:path';
import * as vscode from 'vscode';
import { lintArabicText } from './arabic-linter.js';
import { I18nCodeActionProvider } from './code-action-provider.js';
import { KeyTreeItem, KeysTreeProvider } from './keys-tree.js';
import { MatrixWebviewPanel } from './matrix-webview.js';
import { ParityTreeItem, ParityTreeProvider } from './parity-tree.js';
import { ParityIssueItem, TranslationStore } from './store.js';
import { TranslationsTypeGenerator } from './type-generator.js';

export function registerI18n(
  context: vscode.ExtensionContext,
  workspaceRoot: string,
): { store: TranslationStore; typeGen: TranslationsTypeGenerator } {
  const store = new TranslationStore(workspaceRoot);
  store.reload();

  const typeGen = new TranslationsTypeGenerator(workspaceRoot, () => store.getI18nDirectory());
  context.subscriptions.push(typeGen);

  // 1. Tree Views
  const keysProvider = new KeysTreeProvider(store);
  const parityProvider = new ParityTreeProvider(store);

  context.subscriptions.push(
    vscode.window.registerTreeDataProvider('nestForge.i18nKeysView', keysProvider),
    vscode.window.registerTreeDataProvider('nestForge.i18nParityView', parityProvider),
  );

  // 2. Diagnostics
  const diagnosticCollection = vscode.languages.createDiagnosticCollection('nest-forge-i18n');
  context.subscriptions.push(diagnosticCollection);

  const watcher = vscode.workspace.createFileSystemWatcher('**/src/i18n/**/*.{json,yaml,yml}');
  let updateDebounceTimer: NodeJS.Timeout | undefined;
  const pendingChangedPaths = new Set<string>();

  const onWatcherEvent = (uri: vscode.Uri) => {
    pendingChangedPaths.add(path.normalize(uri.fsPath));
    if (updateDebounceTimer) {
      clearTimeout(updateDebounceTimer);
    }
    updateDebounceTimer = setTimeout(() => {
      const paths = Array.from(pendingChangedPaths);
      pendingChangedPaths.clear();

      // Only reload if at least one changed file was NOT written by the store itself
      const hasExternalChanges = paths.some((p) => !store.isSelfWrite(p));
      if (hasExternalChanges) {
        store.reload();
      }
      typeGen.triggerGeneration();
      for (const doc of vscode.workspace.textDocuments) {
        updateDiagnostics(doc);
      }
    }, 200);
  };

  watcher.onDidChange(onWatcherEvent);
  watcher.onDidCreate(onWatcherEvent);
  watcher.onDidDelete(onWatcherEvent);
  context.subscriptions.push(watcher, {
    dispose: () => {
      if (updateDebounceTimer) {
        clearTimeout(updateDebounceTimer);
      }
    },
  });

  function updateDiagnostics(document: vscode.TextDocument) {
    if (
      document.languageId !== 'typescript' &&
      document.languageId !== 'json' &&
      document.languageId !== 'jsonc'
    ) {
      return;
    }

    const uri = document.uri;
    const fsPath = uri.fsPath;
    const diagnostics: vscode.Diagnostic[] = [];

    // Diagnostics for JSON translation files
    const i18nDir = store.getI18nDirectory();
    if (i18nDir && fsPath.startsWith(i18nDir) && fsPath.endsWith('.json')) {
      const rel = path.relative(i18nDir, fsPath);
      const parts = rel.split(path.sep);
      if (parts.length === 2) {
        const currentLang = parts[0];
        const namespace = parts[1].replace(/\.json$/, '');
        const otherLang = currentLang === 'en' ? 'ar' : 'en';

        const text = document.getText();
        const lines = text.split('\n');
        const pathStack: { key: string; indent: number }[] = [];

        for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
          const line = lines[lineIdx];
          const match = line.match(/^(\s*)"([^"]+)"\s*:\s*(.*)$/);
          if (!match) continue;

          const indent = match[1].length;
          const keySegment = match[2];
          const afterColon = match[3].trim();

          while (
            pathStack.length > 0 &&
            pathStack[pathStack.length - 1].indent >= indent
          ) {
            pathStack.pop();
          }

          pathStack.push({ key: keySegment, indent });
          const fullKey = [namespace, ...pathStack.map((p) => p.key)].join('.');

          if (afterColon && !afterColon.startsWith('{')) {
            pathStack.pop();
            const entry = store.getKey(fullKey);

            // Check Missing Counterpart (if not part of a paired plural object)
            if (entry && !entry.values[otherLang] && !entry.isPlural) {
              const startCol = match[1].length + 1;
              const endCol = startCol + keySegment.length;
              const range = new vscode.Range(lineIdx, startCol, lineIdx, endCol);

              const otherLangLabel = otherLang === 'ar' ? 'Arabic (ar)' : 'English (en)';
              const diag = new vscode.Diagnostic(
                range,
                `[Nest Forge i18n] Missing translation in ${otherLangLabel}`,
                vscode.DiagnosticSeverity.Warning,
              );
              diag.code = `missing_${otherLang}`;
              diag.source = 'Nest Forge i18n';
              diagnostics.push(diag);
            }

            // Check Arabic Typography
            if (currentLang === 'ar') {
              const strMatch = afterColon.match(/^"([^"]*)"/);
              if (strMatch) {
                const arVal = strMatch[1];
                const enVal = entry?.values['en'];
                const valueStartCol = line.indexOf(strMatch[0]) + 1;

                const typos = lintArabicText(
                  fullKey,
                  arVal,
                  enVal,
                  lineIdx,
                  valueStartCol,
                );

                for (const typo of typos) {
                  if (typo.range) {
                    const diag = new vscode.Diagnostic(
                      typo.range,
                      `[Nest Forge Arabic Typography] ${typo.message}`,
                      vscode.DiagnosticSeverity.Warning,
                    );
                    diag.code = `arabic_typography:${typo.issueType}:${typo.suggestedReplacement || ''}`;
                    diag.source = 'Nest Forge i18n';
                    diagnostics.push(diag);
                  }
                }
              }
            }
          }
        }
      }

      diagnosticCollection.set(uri, diagnostics);
      return;
    }

    // Diagnostics for TypeScript files
    if (document.languageId === 'typescript') {
      const text = document.getText();
      const namespaces = store.getNamespaces();
      if (namespaces.size === 0) return;

      const regexPatterns = [
        /@ResponseMessage\(\s*['"]([^'"]+)['"]/g,
        /new\s+(?:I18n)?[A-Z][a-zA-Z0-9]*Exception\(\s*['"]([^'"]+)['"]/g,
        /(?:this\.)?(?:i18n(?:Service|_service)?|i18nContext)\.t\(\s*['"]([^'"]+)['"]/g,
        /\bt\(\s*['"]([^'"]+)['"]/g,
        /i18nValidation(?:Message)?\s*\(\s*['"]([^'"]+)['"]/g,
        /['"]((?:[a-zA-Z0-9_-]+)\.[a-zA-Z0-9_.-]+)['"]/g,
      ];

      const reportedKeys = new Set<string>();

      for (const pattern of regexPatterns) {
        let match: RegExpExecArray | null;
        while ((match = pattern.exec(text)) !== null) {
          const keyCandidate = match[1];
          const firstDot = keyCandidate.indexOf('.');
          if (firstDot === -1) continue;
          const ns = keyCandidate.substring(0, firstDot);
          if (!namespaces.has(ns)) continue;

          const matchIndex = match.index + match[0].lastIndexOf(keyCandidate);
          const posKey = `${matchIndex}:${keyCandidate}`;
          if (reportedKeys.has(posKey)) continue;
          reportedKeys.add(posKey);

          if (!store.hasKey(keyCandidate)) {
            const startPos = document.positionAt(matchIndex);
            const endPos = document.positionAt(matchIndex + keyCandidate.length);
            const range = new vscode.Range(startPos, endPos);

            const diag = new vscode.Diagnostic(
              range,
              `[Nest Forge i18n] Translation key "${keyCandidate}" does not exist in src/i18n/`,
              vscode.DiagnosticSeverity.Warning,
            );
            diag.code = 'nonexistent_key';
            diag.source = 'Nest Forge i18n';
            diagnostics.push(diag);
          }
        }
      }

      diagnosticCollection.set(uri, diagnostics);
    }
  }

  let debounceTimer: NodeJS.Timeout | undefined;
  const debouncedUpdateDiagnostics = (doc: vscode.TextDocument) => {
    if (debounceTimer) clearTimeout(debounceTimer);
    debounceTimer = setTimeout(() => {
      updateDiagnostics(doc);
    }, 300);
  };

  context.subscriptions.push(
    vscode.workspace.onDidOpenTextDocument(updateDiagnostics),
    vscode.workspace.onDidChangeTextDocument((e) => debouncedUpdateDiagnostics(e.document)),
    vscode.workspace.onDidCloseTextDocument((doc) => {
      if (debounceTimer) clearTimeout(debounceTimer);
      diagnosticCollection.delete(doc.uri);
    }),
  );

  for (const doc of vscode.workspace.textDocuments) {
    updateDiagnostics(doc);
  }

  // 3. Code Actions
  const codeActionProvider = new I18nCodeActionProvider(store);
  context.subscriptions.push(
    vscode.languages.registerCodeActionsProvider(
      ['typescript', 'typescriptreact', 'json', 'jsonc'],
      codeActionProvider,
      {
        providedCodeActionKinds: I18nCodeActionProvider.providedCodeActionKinds,
      },
    ),
  );

  // 4. Hover Provider
  const hoverProvider = vscode.languages.registerHoverProvider(
    ['typescript', 'json', 'jsonc'],
    {
      provideHover(document, position) {
        const range = document.getWordRangeAtPosition(position, /[a-zA-Z0-9_.-]+/);
        if (!range) return null;

        const word = document.getText(range);
        const entry = store.getKey(word);

        if (entry) {
          const md = new vscode.MarkdownString();
          md.isTrusted = true;
          md.appendMarkdown(`### 🌐 @nestjs/i18n: \`${entry.key}\`\n\n`);
          md.appendMarkdown(
            `- 🇬🇧 **en**: ${entry.values['en'] ? `"${entry.values['en']}"` : '*(missing)*'}\n`,
          );
          md.appendMarkdown(
            `- 🇸🇦 **ar**: ${entry.values['ar'] ? `"${entry.values['ar']}"` : '*(missing)*'}\n`,
          );
          return new vscode.Hover(md, range);
        }

        const firstDot = word.indexOf('.');
        if (firstDot > 0 && store.getNamespaces().has(word.substring(0, firstDot))) {
          const md = new vscode.MarkdownString();
          md.appendMarkdown(
            `⚠️ **[Nest Forge i18n] Missing Key**\n\nTranslation key \`${word}\` does not exist in \`src/i18n/\`.\n\n*Press \`Ctrl+.\` to create it instantly.*`,
          );
          return new vscode.Hover(md, range);
        }

        return null;
      },
    },
  );
  context.subscriptions.push(hoverProvider);

  // 5. Completion Provider
  const completionProvider = vscode.languages.registerCompletionItemProvider(
    'typescript',
    {
      provideCompletionItems(document, position) {
        const linePrefix = document.lineAt(position).text.substr(0, position.character);
        const isInQuotes = /['"][a-zA-Z0-9_.-]*$/.test(linePrefix);
        if (!isInQuotes) return undefined;

        const items: vscode.CompletionItem[] = [];
        for (const entry of store.getAllKeys()) {
          const item = new vscode.CompletionItem(entry.key, vscode.CompletionItemKind.Value);
          item.detail = `🇬🇧 ${entry.values['en'] ?? ''}`;
          item.documentation = new vscode.MarkdownString(
            `**@nestjs/i18n Translation**\n\n- 🇬🇧 **en**: ${entry.values['en'] ?? '*(missing)*'}\n- 🇸🇦 **ar**: ${entry.values['ar'] ?? '*(missing)*'}`,
          );
          items.push(item);
        }

        return items;
      },
    },
    "'",
    '"',
    '.',
  );
  context.subscriptions.push(completionProvider);

  // 6. Definition Provider
  const definitionProvider = vscode.languages.registerDefinitionProvider('typescript', {
    provideDefinition(document, position) {
      const range = document.getWordRangeAtPosition(position, /[a-zA-Z0-9_.-]+/);
      if (!range) return null;

      const word = document.getText(range);
      const entry = store.getKey(word);
      if (!entry) return null;

      const locations: vscode.Location[] = [];
      for (const loc of Object.values(entry.locations)) {
        locations.push(new vscode.Location(loc.uri, loc.range));
      }

      return locations;
    },
  });
  context.subscriptions.push(definitionProvider);

  function resolveKeyFromArg(arg: unknown): string | undefined {
    if (!arg) return undefined;
    if (typeof arg === 'string') return arg;
    if (arg instanceof KeyTreeItem) {
      return arg.fullPath || (typeof arg.label === 'string' ? arg.label : undefined);
    }
    if (arg instanceof ParityTreeItem) {
      if (arg.data && 'key' in arg.data) {
        return (arg.data as { key: string }).key;
      }
      return typeof arg.label === 'string' ? arg.label : undefined;
    }
    return undefined;
  }

  // 7. Commands
  const reloadCommand = vscode.commands.registerCommand('nestForge.i18n.reload', () => {
    store.reload();
    typeGen.triggerGeneration();
    for (const doc of vscode.workspace.textDocuments) {
      updateDiagnostics(doc);
    }
    vscode.window.showInformationMessage(
      `Nest Forge i18n: Reloaded ${store.getAllKeys().length} translation keys.`,
    );
  });

  const parityCommand = vscode.commands.registerCommand('nestForge.i18n.checkParity', () => {
    const result = store.checkParity();
    if (result.ok) {
      vscode.window.showInformationMessage(
        `✅ Nest Forge i18n: All ${result.totalKeys} keys in 100% parity between Arabic and English!`,
      );
    } else {
      const msg: string[] = [];
      if (result.missingInAr.length > 0) msg.push(`${result.missingInAr.length} missing in Arabic`);
      if (result.missingInEn.length > 0) msg.push(`${result.missingInEn.length} missing in English`);
      if (result.emptyValues.length > 0) msg.push(`${result.emptyValues.length} empty values`);
      if (result.placeholderMismatches.length > 0) msg.push(`${result.placeholderMismatches.length} placeholder mismatches`);
      if (result.typographyIssues.length > 0) msg.push(`${result.typographyIssues.length} Arabic typography issues`);
      vscode.window.showWarningMessage(`⚠️ Nest Forge i18n Issues: ${msg.join(', ')}`);
    }
  });

  const openLocationCommand = vscode.commands.registerCommand(
    'nestForge.i18n.openKeyLocation',
    async (uri: vscode.Uri, range?: vscode.Range) => {
      if (!uri) return;
      try {
        const doc = await vscode.workspace.openTextDocument(uri);
        const editor = await vscode.window.showTextDocument(doc, { preview: false });
        if (range) {
          editor.selection = new vscode.Selection(range.start, range.end);
          editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
        }
      } catch (err) {
        console.error('[Nest Forge i18n] Failed to open document:', err);
      }
    },
  );

  const createKeyFromCodeCommand = vscode.commands.registerCommand(
    'nestForge.i18n.createKeyFromCode',
    async (keyCandidate?: string) => {
      if (!keyCandidate) return;

      const lastSegment = keyCandidate.split('.').pop() || '';
      const humanized = lastSegment
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .toLowerCase();
      const defaultEn = humanized.charAt(0).toUpperCase() + humanized.slice(1);

      const enVal = await vscode.window.showInputBox({
        title: `Nest Forge i18n: English Translation for "${keyCandidate}"`,
        prompt: 'Enter English translation text',
        value: defaultEn,
      });
      if (enVal === undefined) return;

      const arVal = await vscode.window.showInputBox({
        title: `Nest Forge i18n: Arabic Translation for "${keyCandidate}"`,
        prompt: 'أدخل النص بالعربية (اختياري)',
        value: '',
      });
      if (arVal === undefined) return;

      await store.addMissingKey(keyCandidate, 'en', enVal);
      await store.addMissingKey(keyCandidate, 'ar', arVal);
      typeGen.triggerGeneration(100);

      vscode.window.showInformationMessage(`✨ Created translation key "${keyCandidate}".`);
    },
  );

  const extractStringToKeyCommand = vscode.commands.registerCommand(
    'nestForge.i18n.extractStringToKey',
    async (extractedText?: string, doc?: vscode.TextDocument, range?: vscode.Range) => {
      if (!extractedText || !doc || !range) return;

      const suggestedKey = `common.messages.${extractedText
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '_')
        .replace(/^_+|_+$/g, '')
        .slice(0, 30)}`;

      const keyName = await vscode.window.showInputBox({
        title: 'Nest Forge i18n: Extract String to Translation Key',
        prompt: 'Enter translation key path (e.g. auth.errors.password_expired)',
        value: suggestedKey,
      });
      if (!keyName) return;

      const arVal = await vscode.window.showInputBox({
        title: `Nest Forge i18n: Arabic Translation for "${keyName}"`,
        prompt: 'أدخل النص بالعربية (اختياري)',
        value: '',
      });
      if (arVal === undefined) return;

      await store.addMissingKey(keyName, 'en', extractedText);
      await store.addMissingKey(keyName, 'ar', arVal);

      const edit = new vscode.WorkspaceEdit();
      edit.replace(doc.uri, range, `'${keyName}'`);
      await vscode.workspace.applyEdit(edit);

      typeGen.triggerGeneration(100);
      vscode.window.showInformationMessage(`✨ Extracted string to translation key "${keyName}".`);
    },
  );

  const openMatrixCommand = vscode.commands.registerCommand('nestForge.i18n.openMatrix', () => {
    MatrixWebviewPanel.createOrShow(context.extensionUri, store);
  });

  const generateTypesCommand = vscode.commands.registerCommand('nestForge.i18n.generateTypes', () => {
    typeGen.generate();
  });

  const addMissingKeyCommand = vscode.commands.registerCommand(
    'nestForge.i18n.addMissingKey',
    async (item?: ParityTreeItem | string) => {
      let keyToFix: string | undefined;
      let targetLang: string | undefined;

      if (item instanceof ParityTreeItem && item.data && 'targetLang' in item.data) {
        const data = item.data as ParityIssueItem;
        keyToFix = data.key;
        targetLang = data.targetLang;
      } else if (typeof item === 'string') {
        keyToFix = item;
      }

      if (!keyToFix) {
        const parity = store.checkParity();
        const choices = [
          ...parity.missingInAr.map((i) => ({
            label: i.key,
            description: 'Missing in Arabic (ar)',
            targetLang: 'ar',
          })),
          ...parity.missingInEn.map((i) => ({
            label: i.key,
            description: 'Missing in English (en)',
            targetLang: 'en',
          })),
        ];

        if (choices.length === 0) {
          vscode.window.showInformationMessage('Nest Forge i18n: No missing keys to fix!');
          return;
        }

        const picked = await vscode.window.showQuickPick(choices, {
          placeHolder: 'Select a missing key to scaffold',
        });
        if (!picked) return;
        keyToFix = picked.label;
        targetLang = picked.targetLang;
      }

      if (!targetLang) targetLang = 'ar';

      const res = await store.addMissingKey(keyToFix, targetLang, '');
      if (res) {
        typeGen.triggerGeneration(100);
        vscode.window.showInformationMessage(
          `✨ Inserted missing key "${keyToFix}" into ${targetLang.toUpperCase()} with empty value.`,
        );
        vscode.commands.executeCommand('nestForge.i18n.openKeyLocation', res.uri, res.range);
      }
    },
  );

  const fixAllMissingCommand = vscode.commands.registerCommand('nestForge.i18n.fixAllMissingKeys', async () => {
    const parity = store.checkParity();
    const totalMissing = parity.missingInAr.length + parity.missingInEn.length;
    if (totalMissing === 0) {
      vscode.window.showInformationMessage('✅ Nest Forge i18n: No missing keys! Key parity is at 100%.');
      return;
    }

    const confirm = await vscode.window.showInformationMessage(
      `Scaffold ${totalMissing} missing keys into counterpart translation files?`,
      { modal: true },
      'Yes, Scaffold All',
    );
    if (confirm !== 'Yes, Scaffold All') return;

    const res = await store.fixAllMissing();
    typeGen.triggerGeneration(100);
    vscode.window.showInformationMessage(
      `🎉 Successfully scaffolded ${res.fixed} missing keys into translation files.`,
    );
  });

  const findUnusedCommand = vscode.commands.registerCommand('nestForge.i18n.findUnusedKeys', async () => {
    await vscode.window.withProgress(
      {
        location: vscode.ProgressLocation.Notification,
        title: 'Scanning workspace for unused i18n keys...',
        cancellable: false,
      },
      async () => {
        const unused = await store.findUnusedKeys();
        if (unused.length === 0) {
          vscode.window.showInformationMessage(
            '🎉 Great news! All defined translation keys are actively referenced in codebase.',
          );
          return;
        }

        const picked = await vscode.window.showQuickPick(
          unused.map((k) => ({
            label: k,
            description: 'Never referenced in src/**/*.ts',
          })),
          {
            placeHolder: `Found ${unused.length} unused translation keys. Select one to jump to definition.`,
          },
        );

        if (picked) {
          const entry = store.getKey(picked.label);
          const loc = entry?.locations['en'] || entry?.locations['ar'];
          if (loc) {
            vscode.commands.executeCommand('nestForge.i18n.openKeyLocation', loc.uri, loc.range);
          }
        }
      },
    );
  });

  const copyKeyCommand = vscode.commands.registerCommand('nestForge.i18n.copyKey', (arg: unknown) => {
    const key = resolveKeyFromArg(arg);
    if (key) {
      vscode.env.clipboard.writeText(key);
      vscode.window.showInformationMessage(`Copied: "${key}"`);
    }
  });

  const copyI18nCallCommand = vscode.commands.registerCommand('nestForge.i18n.copyI18nCall', (arg: unknown) => {
    const key = resolveKeyFromArg(arg);
    if (key) {
      const paramStyle = vscode.workspace.getConfiguration('nestForge').get<string>('paramStyle', 'snake_case');
      const serviceName = paramStyle === 'snake_case' ? 'this.i18n_service' : 'this.i18nService';
      const snippet = `${serviceName}.t('${key}')`;
      vscode.env.clipboard.writeText(snippet);
      vscode.window.showInformationMessage(`Copied: ${snippet}`);
    }
  });

  const copyStandaloneTCommand = vscode.commands.registerCommand('nestForge.i18n.copyStandaloneT', (arg: unknown) => {
    const key = resolveKeyFromArg(arg);
    if (key) {
      const snippet = `t('${key}')`;
      vscode.env.clipboard.writeText(snippet);
      vscode.window.showInformationMessage(`Copied: ${snippet}`);
    }
  });

  const copyValidationMessageCommand = vscode.commands.registerCommand(
    'nestForge.i18n.copyValidationMessage',
    (arg: unknown) => {
      const key = resolveKeyFromArg(arg);
      if (key) {
        const snippet = `i18nValidationMessage('${key}')`;
        vscode.env.clipboard.writeText(snippet);
        vscode.window.showInformationMessage(`Copied: ${snippet}`);
      }
    },
  );

  const copyResponseMessageCommand = vscode.commands.registerCommand(
    'nestForge.i18n.copyResponseMessage',
    (arg: unknown) => {
      const key = resolveKeyFromArg(arg);
      if (key) {
        const snippet = `@ResponseMessage('${key}')`;
        vscode.env.clipboard.writeText(snippet);
        vscode.window.showInformationMessage(`Copied: ${snippet}`);
      }
    },
  );

  const findUsagesCommand = vscode.commands.registerCommand('nestForge.i18n.findUsages', (arg: unknown) => {
    const key = resolveKeyFromArg(arg);
    if (key) {
      vscode.commands.executeCommand('workbench.action.findInFiles', {
        query: key,
        triggerSearch: true,
        matchWholeWord: true,
      });
    }
  });

  // 8. Bootstrap @nestjs/i18n command
  const initI18nCommand = vscode.commands.registerCommand('nestForge.initI18n', async () => {
    const result = store.initializeI18nStructure();
    await typeGen.generate();

    let msg = `Initialized @nestjs/i18n structure with ${result.created.length} new catalog files and translations.ts.`;
    if (result.nestCliUpdated) {
      msg += ' Added i18n assets to nest-cli.json.';
    }
    vscode.window.showInformationMessage(msg);
  });

  context.subscriptions.push(
    reloadCommand,
    parityCommand,
    openLocationCommand,
    createKeyFromCodeCommand,
    extractStringToKeyCommand,
    openMatrixCommand,
    generateTypesCommand,
    addMissingKeyCommand,
    fixAllMissingCommand,
    findUnusedCommand,
    copyKeyCommand,
    copyI18nCallCommand,
    copyStandaloneTCommand,
    copyValidationMessageCommand,
    copyResponseMessageCommand,
    findUsagesCommand,
    initI18nCommand,
  );

  return { store, typeGen };
}

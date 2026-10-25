import * as vscode from 'vscode';
import { TranslationStore } from './store.js';

export class I18nCodeActionProvider implements vscode.CodeActionProvider {
  public static readonly providedCodeActionKinds = [
    vscode.CodeActionKind.QuickFix,
    vscode.CodeActionKind.RefactorExtract,
  ];

  constructor(private readonly store: TranslationStore) {}

  provideCodeActions(
    document: vscode.TextDocument,
    range: vscode.Range | vscode.Selection,
    context: vscode.CodeActionContext,
  ): vscode.CodeAction[] | undefined {
    const actions: vscode.CodeAction[] = [];

    // 1. TypeScript diagnostics: Nonexistent translation key
    if (document.languageId === 'typescript') {
      for (const diag of context.diagnostics) {
        if (diag.code === 'nonexistent_key') {
          const keyText = document.getText(diag.range);
          const cleanKey = keyText.replace(/['"]/g, '').trim();

          const fixAction = new vscode.CodeAction(
            `💡 Create translation key "${cleanKey}" in src/i18n`,
            vscode.CodeActionKind.QuickFix,
          );
          fixAction.isPreferred = true;
          fixAction.diagnostics = [diag];
          fixAction.command = {
            command: 'nestForge.i18n.createKeyFromCode',
            title: 'Create Translation Key',
            arguments: [cleanKey, document, diag.range],
          };
          actions.push(fixAction);
        }
      }

      // Check for hardcoded string extraction
      const wordRange = document.getWordRangeAtPosition(
        range.start,
        /['"][^'"]+['"]/,
      );
      if (wordRange) {
        const fullStringWithQuotes = document.getText(wordRange);
        const innerText = fullStringWithQuotes.slice(1, -1).trim();

        // If it's not already a valid namespaced key
        const firstDot = innerText.indexOf('.');
        const isExistingKey =
          firstDot > 0 &&
          this.store.getNamespaces().has(innerText.substring(0, firstDot));

        if (!isExistingKey && innerText.length > 2) {
          const extractAction = new vscode.CodeAction(
            `💡 Extract "${innerText.slice(0, 25)}${innerText.length > 25 ? '...' : ''}" to @nestjs/i18n key`,
            vscode.CodeActionKind.RefactorExtract,
          );
          extractAction.command = {
            command: 'nestForge.i18n.extractStringToKey',
            title: 'Extract String to @nestjs/i18n Key',
            arguments: [innerText, document, wordRange],
          };
          actions.push(extractAction);
        }
      }
    }

    // 2. JSON diagnostics: Arabic Typography & Punctuation fixes
    if (document.languageId === 'json' || document.languageId === 'jsonc') {
      for (const diag of context.diagnostics) {
        if (
          typeof diag.code === 'string' &&
          diag.code.startsWith('arabic_typography:')
        ) {
          const parts = diag.code.split(':');
          const issueType = parts[1];
          const replacement = parts[2] || '';

          if (replacement) {
            const fixPunctAction = new vscode.CodeAction(
              `💡 Replace with Arabic punctuation '${replacement}'`,
              vscode.CodeActionKind.QuickFix,
            );
            fixPunctAction.isPreferred = true;
            fixPunctAction.diagnostics = [diag];
            const edit = new vscode.WorkspaceEdit();
            edit.replace(document.uri, diag.range, replacement);
            fixPunctAction.edit = edit;
            actions.push(fixPunctAction);
          } else if (issueType === 'whitespace') {
            const lineText = document.lineAt(diag.range.start.line).text;
            const match = lineText.match(/^(\s*"[^"]+"\s*:\s*")([^"]*)(".*)$/);
            if (match) {
              const trimmed = match[2].trim();
              const fullFixed = `${match[1]}${trimmed}${match[3]}`;
              const fixWsAction = new vscode.CodeAction(
                `💡 Trim translation whitespace`,
                vscode.CodeActionKind.QuickFix,
              );
              fixWsAction.isPreferred = true;
              fixWsAction.diagnostics = [diag];
              const edit = new vscode.WorkspaceEdit();
              edit.replace(
                document.uri,
                new vscode.Range(
                  diag.range.start.line,
                  0,
                  diag.range.start.line,
                  lineText.length,
                ),
                fullFixed,
              );
              fixWsAction.edit = edit;
              actions.push(fixWsAction);
            }
          }
        }
      }
    }

    return actions;
  }
}

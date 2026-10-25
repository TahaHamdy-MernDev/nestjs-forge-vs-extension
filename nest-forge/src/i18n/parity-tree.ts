import * as vscode from 'vscode';
import { ArabicTypographyIssue } from './arabic-linter.js';
import {
  EmptyValueIssueItem,
  ParityIssueItem,
  PlaceholderMismatchItem,
  TranslationStore,
} from './store.js';

export type ParityItemType =
  | 'root-ok'
  | 'group-missing-ar'
  | 'group-missing-en'
  | 'group-empty'
  | 'group-placeholders'
  | 'group-typography'
  | 'item-missing-ar'
  | 'item-missing-en'
  | 'item-empty'
  | 'item-placeholder'
  | 'item-typography';

export class ParityTreeItem extends vscode.TreeItem {
  constructor(
    public readonly itemType: ParityItemType,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
    public readonly data?:
      | ParityIssueItem
      | EmptyValueIssueItem
      | PlaceholderMismatchItem
      | ArabicTypographyIssue
      | { count: number },
  ) {
    super(label, collapsibleState);
  }
}

export class ParityTreeProvider implements vscode.TreeDataProvider<ParityTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<ParityTreeItem | undefined | null | void> =
    new vscode.EventEmitter<ParityTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<ParityTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  constructor(private readonly store: TranslationStore) {
    this.store.onDidUpdate(() => this.refresh());
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: ParityTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: ParityTreeItem): Thenable<ParityTreeItem[]> {
    const parity = this.store.checkParity();

    if (!element) {
      if (parity.ok) {
        const okItem = new ParityTreeItem(
          'root-ok',
          'All translation keys in 100% parity!',
          vscode.TreeItemCollapsibleState.None,
        );
        okItem.description = `✅ ${parity.totalKeys} keys verified`;
        okItem.iconPath = new vscode.ThemeIcon(
          'pass-filled',
          new vscode.ThemeColor('testing.iconPassed'),
        );
        okItem.tooltip =
          'English and Arabic translation files have identical keys, non-empty values, valid typography, and matched placeholders.';
        return Promise.resolve([okItem]);
      }

      const groups: ParityTreeItem[] = [];

      if (parity.missingInAr.length > 0) {
        const item = new ParityTreeItem(
          'group-missing-ar',
          `Missing in Arabic (ar) (${parity.missingInAr.length})`,
          vscode.TreeItemCollapsibleState.Expanded,
          { count: parity.missingInAr.length },
        );
        item.iconPath = new vscode.ThemeIcon(
          'error',
          new vscode.ThemeColor('errorForeground'),
        );
        item.tooltip = `${parity.missingInAr.length} keys exist in English but are missing in Arabic.`;
        groups.push(item);
      }

      if (parity.missingInEn.length > 0) {
        const item = new ParityTreeItem(
          'group-missing-en',
          `Missing in English (en) (${parity.missingInEn.length})`,
          vscode.TreeItemCollapsibleState.Expanded,
          { count: parity.missingInEn.length },
        );
        item.iconPath = new vscode.ThemeIcon(
          'error',
          new vscode.ThemeColor('errorForeground'),
        );
        item.tooltip = `${parity.missingInEn.length} keys exist in Arabic but are missing in English.`;
        groups.push(item);
      }

      if (parity.emptyValues.length > 0) {
        const item = new ParityTreeItem(
          'group-empty',
          `Empty Translation Values (${parity.emptyValues.length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          { count: parity.emptyValues.length },
        );
        item.iconPath = new vscode.ThemeIcon(
          'warning',
          new vscode.ThemeColor('problemsWarningIcon.foreground'),
        );
        item.tooltip = `${parity.emptyValues.length} translation keys have empty string values.`;
        groups.push(item);
      }

      if (parity.placeholderMismatches.length > 0) {
        const item = new ParityTreeItem(
          'group-placeholders',
          `Placeholder Mismatches (${parity.placeholderMismatches.length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          { count: parity.placeholderMismatches.length },
        );
        item.iconPath = new vscode.ThemeIcon(
          'diff',
          new vscode.ThemeColor('charts.orange'),
        );
        item.tooltip = `${parity.placeholderMismatches.length} keys have inconsistent interpolation tokens between languages.`;
        groups.push(item);
      }

      if (parity.typographyIssues.length > 0) {
        const item = new ParityTreeItem(
          'group-typography',
          `Arabic Typography Issues (${parity.typographyIssues.length})`,
          vscode.TreeItemCollapsibleState.Collapsed,
          { count: parity.typographyIssues.length },
        );
        item.iconPath = new vscode.ThemeIcon(
          'symbol-parameter',
          new vscode.ThemeColor('charts.purple'),
        );
        item.tooltip = `${parity.typographyIssues.length} Arabic translations contain English punctuation (? / , / ;) or whitespace mismatches.`;
        groups.push(item);
      }

      return Promise.resolve(groups);
    }

    if (element.itemType === 'group-missing-ar') {
      return Promise.resolve(
        parity.missingInAr.map((issue) => {
          const item = new ParityTreeItem(
            'item-missing-ar',
            issue.key,
            vscode.TreeItemCollapsibleState.None,
            issue,
          );
          item.description = `EN: "${issue.sourceValue}"`;
          item.iconPath = new vscode.ThemeIcon(
            'circle-filled',
            new vscode.ThemeColor('errorForeground'),
          );
          item.contextValue = 'missing-key-ar';
          item.tooltip = new vscode.MarkdownString(
            `### 🔴 Missing in Arabic\n\n- **Key**: \`${issue.key}\`\n- **English**: "${issue.sourceValue}"\n\n*Click to view definition in English JSON, or click the **+** button to auto-insert into Arabic.*`,
          );
          if (issue.sourceLocation) {
            item.command = {
              command: 'nestForge.i18n.openKeyLocation',
              title: 'Open Location',
              arguments: [issue.sourceLocation.uri, issue.sourceLocation.range],
            };
          }
          return item;
        }),
      );
    }

    if (element.itemType === 'group-missing-en') {
      return Promise.resolve(
        parity.missingInEn.map((issue) => {
          const item = new ParityTreeItem(
            'item-missing-en',
            issue.key,
            vscode.TreeItemCollapsibleState.None,
            issue,
          );
          item.description = `AR: "${issue.sourceValue}"`;
          item.iconPath = new vscode.ThemeIcon(
            'circle-filled',
            new vscode.ThemeColor('errorForeground'),
          );
          item.contextValue = 'missing-key-en';
          item.tooltip = new vscode.MarkdownString(
            `### 🔵 Missing in English\n\n- **Key**: \`${issue.key}\`\n- **Arabic**: "${issue.sourceValue}"\n\n*Click to view definition in Arabic JSON, or click the **+** button to auto-insert into English.*`,
          );
          if (issue.sourceLocation) {
            item.command = {
              command: 'nestForge.i18n.openKeyLocation',
              title: 'Open Location',
              arguments: [issue.sourceLocation.uri, issue.sourceLocation.range],
            };
          }
          return item;
        }),
      );
    }

    if (element.itemType === 'group-empty') {
      return Promise.resolve(
        parity.emptyValues.map((issue) => {
          const item = new ParityTreeItem(
            'item-empty',
            issue.key,
            vscode.TreeItemCollapsibleState.None,
            issue,
          );
          item.description = `[${issue.lang.toUpperCase()}] is empty`;
          item.iconPath = new vscode.ThemeIcon(
            'warning',
            new vscode.ThemeColor('problemsWarningIcon.foreground'),
          );
          item.contextValue = 'key-empty';
          item.tooltip = `Key "${issue.key}" has an empty string value in ${issue.lang.toUpperCase()}.`;
          if (issue.location) {
            item.command = {
              command: 'nestForge.i18n.openKeyLocation',
              title: 'Open Location',
              arguments: [issue.location.uri, issue.location.range],
            };
          }
          return item;
        }),
      );
    }

    if (element.itemType === 'group-placeholders') {
      return Promise.resolve(
        parity.placeholderMismatches.map((issue) => {
          const item = new ParityTreeItem(
            'item-placeholder',
            issue.key,
            vscode.TreeItemCollapsibleState.None,
            issue,
          );
          item.description = `EN: {${issue.enTokens.join(', ')}} ≠ AR: {${issue.arTokens.join(', ')}}`;
          item.iconPath = new vscode.ThemeIcon(
            'diff',
            new vscode.ThemeColor('charts.orange'),
          );
          item.contextValue = 'key-diff';
          item.tooltip = `Tokens mismatch for "${issue.key}":\nEnglish: {${issue.enTokens.join(', ')}}\nArabic: {${issue.arTokens.join(', ')}}`;
          if (issue.location) {
            item.command = {
              command: 'nestForge.i18n.openKeyLocation',
              title: 'Open Location',
              arguments: [issue.location.uri, issue.location.range],
            };
          }
          return item;
        }),
      );
    }

    if (element.itemType === 'group-typography') {
      return Promise.resolve(
        parity.typographyIssues.map((issue) => {
          const item = new ParityTreeItem(
            'item-typography',
            issue.key,
            vscode.TreeItemCollapsibleState.None,
            issue,
          );
          item.description = issue.message;
          item.iconPath = new vscode.ThemeIcon(
            'symbol-parameter',
            new vscode.ThemeColor('charts.purple'),
          );
          item.contextValue = 'key-typography';
          item.tooltip = `${issue.key}: ${issue.message}`;

          const entry = this.store.getKey(issue.key);
          const arLoc = entry?.locations['ar'];
          if (arLoc) {
            item.command = {
              command: 'nestForge.i18n.openKeyLocation',
              title: 'Open Location',
              arguments: [arLoc.uri, issue.range || arLoc.range],
            };
          }
          return item;
        }),
      );
    }

    return Promise.resolve([]);
  }
}

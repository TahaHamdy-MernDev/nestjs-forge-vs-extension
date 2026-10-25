import * as vscode from 'vscode';
import { TranslationEntry, TranslationStore } from './store.js';

export type KeyNodeType = 'namespace' | 'subgroup' | 'key';

export class KeyTreeItem extends vscode.TreeItem {
  constructor(
    public readonly nodeType: KeyNodeType,
    label: string,
    collapsibleState: vscode.TreeItemCollapsibleState = vscode.TreeItemCollapsibleState.None,
    public readonly fullPath: string = '',
    public readonly entry?: TranslationEntry,
  ) {
    super(label, collapsibleState);
  }
}

interface TreeNode {
  name: string;
  fullPath: string;
  isLeaf: boolean;
  entry?: TranslationEntry;
  children: Map<string, TreeNode>;
}

export class KeysTreeProvider implements vscode.TreeDataProvider<KeyTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<KeyTreeItem | undefined | null | void> =
    new vscode.EventEmitter<KeyTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<KeyTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  private rootTrie: Map<string, TreeNode> = new Map();

  constructor(private readonly store: TranslationStore) {
    this.store.onDidUpdate(() => {
      this.rebuildTrie();
      this.refresh();
    });
    this.rebuildTrie();
  }

  public refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  private rebuildTrie(): void {
    this.rootTrie.clear();
    const entries = this.store.getAllKeys();

    for (const entry of entries) {
      const parts = entry.key.split('.');
      let currentMap = this.rootTrie;
      let pathAccum = '';

      for (let i = 0; i < parts.length; i++) {
        const part = parts[i];
        pathAccum = pathAccum ? `${pathAccum}.${part}` : part;
        const isLeaf = i === parts.length - 1;

        let node = currentMap.get(part);
        if (!node) {
          node = {
            name: part,
            fullPath: pathAccum,
            isLeaf,
            children: new Map(),
          };
          currentMap.set(part, node);
        }

        if (isLeaf) {
          node.isLeaf = true;
          node.entry = entry;
        }

        currentMap = node.children;
      }
    }
  }

  getTreeItem(element: KeyTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: KeyTreeItem): Thenable<KeyTreeItem[]> {
    if (!element) {
      // Root level: Namespaces
      const items: KeyTreeItem[] = [];
      const sortedNamespaces = Array.from(this.rootTrie.keys()).sort();

      for (const ns of sortedNamespaces) {
        const node = this.rootTrie.get(ns)!;
        const count = this.countKeys(node);
        const item = new KeyTreeItem(
          'namespace',
          ns,
          vscode.TreeItemCollapsibleState.Collapsed,
          ns,
        );
        item.description = `(${count} keys)`;
        item.iconPath = new vscode.ThemeIcon(
          'folder',
          new vscode.ThemeColor('symbolIcon.folderForeground'),
        );
        item.contextValue = 'namespace-group';
        items.push(item);
      }

      return Promise.resolve(items);
    }

    // Traverse down into node
    const parts = element.fullPath.split('.');
    let current: TreeNode | undefined;
    let currentMap = this.rootTrie;

    for (const part of parts) {
      current = currentMap.get(part);
      if (!current) break;
      currentMap = current.children;
    }

    if (!current) {
      return Promise.resolve([]);
    }

    const items: KeyTreeItem[] = [];
    const sortedChildKeys = Array.from(current.children.keys()).sort();

    for (const childKey of sortedChildKeys) {
      const childNode = current.children.get(childKey)!;

      if (childNode.children.size > 0 && !childNode.entry) {
        // Subgroup (e.g. auth.messages)
        const count = this.countKeys(childNode);
        const item = new KeyTreeItem(
          'subgroup',
          childKey,
          vscode.TreeItemCollapsibleState.Collapsed,
          childNode.fullPath,
        );
        item.description = `(${count})`;
        item.iconPath = new vscode.ThemeIcon('folder-opened');
        item.contextValue = 'subgroup';
        items.push(item);
      } else {
        // Leaf translation key
        const entry = childNode.entry;
        const hasEn = !!entry?.values['en'];
        const hasAr = !!entry?.values['ar'];
        const isComplete = hasEn && hasAr;

        const item = new KeyTreeItem(
          'key',
          childKey,
          childNode.children.size > 0
            ? vscode.TreeItemCollapsibleState.Collapsed
            : vscode.TreeItemCollapsibleState.None,
          childNode.fullPath,
          entry,
        );

        const enSnippet = entry?.values['en']
          ? `🇬🇧 "${entry.values['en'].slice(0, 30)}${entry.values['en'].length > 30 ? '...' : ''}"`
          : '🇬🇧 (missing)';
        const arSnippet = entry?.values['ar']
          ? `🇸🇦 "${entry.values['ar'].slice(0, 30)}${entry.values['ar'].length > 30 ? '...' : ''}"`
          : '🇸🇦 (missing)';

        item.description = `${enSnippet} | ${arSnippet}`;
        item.contextValue = isComplete ? 'key-complete' : 'key-incomplete';

        if (isComplete) {
          item.iconPath = new vscode.ThemeIcon(
            'symbol-string',
            new vscode.ThemeColor('testing.iconPassed'),
          );
        } else {
          item.iconPath = new vscode.ThemeIcon(
            'warning',
            new vscode.ThemeColor('problemsWarningIcon.foreground'),
          );
        }

        const md = new vscode.MarkdownString();
        md.appendMarkdown(`### 🌐 \`${childNode.fullPath}\`\n\n`);
        md.appendMarkdown(
          `- 🇬🇧 **English**: ${entry?.values['en'] ? `"${entry.values['en']}"` : '*(missing)*'}\n`,
        );
        md.appendMarkdown(
          `- 🇸🇦 **Arabic**: ${entry?.values['ar'] ? `"${entry.values['ar']}"` : '*(missing)*'}\n\n`,
        );
        md.appendMarkdown(
          `*Status*: ${isComplete ? '✅ 100% Paired' : '⚠️ Missing counterpart'}\n\n`,
        );
        md.appendMarkdown(
          `*Click to jump to definition. Right-click to copy as \`i18nService.t\`, \`t()\`, \`i18nValidationMessage\`, or find usages.*`,
        );
        item.tooltip = md;

        // Command on click: open location in EN (or AR if EN missing)
        const primaryLoc = entry?.locations['en'] || entry?.locations['ar'];
        if (primaryLoc) {
          item.command = {
            command: 'nestForge.i18n.openKeyLocation',
            title: 'Open Translation Location',
            arguments: [primaryLoc.uri, primaryLoc.range],
          };
        }

        items.push(item);
      }
    }

    return Promise.resolve(items);
  }

  private countKeys(node: TreeNode): number {
    let count = node.entry ? 1 : 0;
    for (const child of node.children.values()) {
      count += this.countKeys(child);
    }
    return count;
  }
}

import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { loadProjectConventions } from '../core/config-loader.js';
import {
  detectComponentKind,
  extractExportedClassInfo,
  inspectFeatureModule,
} from '../core/module-inspector.js';

export class FeatureTreeItem extends vscode.TreeItem {
  constructor(
    public readonly label: string,
    public readonly collapsibleState: vscode.TreeItemCollapsibleState,
    public readonly resourceUri?: vscode.Uri,
    public readonly isFolder: boolean = false,
  ) {
    super(label, collapsibleState);
    this.tooltip = this.resourceUri ? this.resourceUri.fsPath : this.label;

    if (!isFolder && resourceUri) {
      this.command = {
        command: 'vscode.open',
        title: 'Open File',
        arguments: [this.resourceUri],
      };
      this.contextValue = 'featureFile';
    } else if (isFolder) {
      this.contextValue = 'featureFolder';
    }
  }
}

export class FeaturesTreeProvider implements vscode.TreeDataProvider<FeatureTreeItem> {
  private _onDidChangeTreeData: vscode.EventEmitter<FeatureTreeItem | undefined | null | void> =
    new vscode.EventEmitter<FeatureTreeItem | undefined | null | void>();
  readonly onDidChangeTreeData: vscode.Event<FeatureTreeItem | undefined | null | void> =
    this._onDidChangeTreeData.event;

  constructor(
    private readonly defaultWorkspaceRoot?: string,
    private readonly extensionUri?: vscode.Uri,
  ) {}

  private getIcon(name: string): { light: vscode.Uri; dark: vscode.Uri } | vscode.ThemeIcon {
    if (this.extensionUri) {
      return {
        light: vscode.Uri.joinPath(this.extensionUri, 'resources', 'icons', 'light', `${name}.svg`),
        dark: vscode.Uri.joinPath(this.extensionUri, 'resources', 'icons', 'dark', `${name}.svg`),
      };
    }
    return new vscode.ThemeIcon('file');
  }

  refresh(): void {
    this._onDidChangeTreeData.fire();
  }

  getTreeItem(element: FeatureTreeItem): vscode.TreeItem {
    return element;
  }

  getChildren(element?: FeatureTreeItem): Thenable<FeatureTreeItem[]> {
    const folders = vscode.workspace.workspaceFolders;
    if (!folders || folders.length === 0) {
      return Promise.resolve([]);
    }

    // If multiple workspace folders and element is not provided:
    if (!element && folders.length > 1) {
      const folderItems = folders.map((folder) => {
        const item = new FeatureTreeItem(
          folder.name,
          vscode.TreeItemCollapsibleState.Expanded,
          folder.uri,
          true,
        );
        item.iconPath = new vscode.ThemeIcon('root-folder');
        item.contextValue = 'workspaceFolder';
        return item;
      });
      return Promise.resolve(folderItems);
    }

    // If element is a workspace folder, or element is undefined (single root)
    let rootPath: string;
    if (!element) {
      rootPath = this.defaultWorkspaceRoot || folders[0].uri.fsPath;
    } else if (element.contextValue === 'workspaceFolder' && element.resourceUri) {
      rootPath = element.resourceUri.fsPath;
    } else if (element.resourceUri && element.isFolder) {
      // Inside a feature directory or subfolder: list files
      const folderPath = element.resourceUri.fsPath;
      if (!fs.existsSync(folderPath)) {
        return Promise.resolve([]);
      }

      // Find root feature directory by walking up to find .module.ts
      let featureDir = folderPath;
      let curr = folderPath;
      while (curr.length > 1) {
        try {
          const dirEntries = fs.readdirSync(curr);
          if (dirEntries.some((e) => e.endsWith('.module.ts'))) {
            featureDir = curr;
            break;
          }
        } catch {
          break;
        }
        const parent = path.dirname(curr);
        if (parent === curr) break;
        curr = parent;
      }

      const inspection = inspectFeatureModule(featureDir);

      const entries = fs.readdirSync(folderPath, { withFileTypes: true });
      const items: FeatureTreeItem[] = [];

      for (const entry of entries) {
        const fullPath = path.join(folderPath, entry.name);
        const uri = vscode.Uri.file(fullPath);

        if (entry.isDirectory()) {
          const folderItem = new FeatureTreeItem(
            `${entry.name}/`,
            vscode.TreeItemCollapsibleState.Collapsed,
            uri,
            true,
          );
          folderItem.iconPath = this.getIcon('folder');
          folderItem.contextValue = 'featureSubfolder';
          items.push(folderItem);
        } else {
          const fileItem = new FeatureTreeItem(
            entry.name,
            vscode.TreeItemCollapsibleState.None,
            uri,
            false,
          );

          if (entry.name.endsWith('.spec.ts')) {
            fileItem.iconPath = this.getIcon('spec');
          } else if (entry.name.endsWith('.service.ts')) {
            fileItem.iconPath = this.getIcon('service');
          } else if (entry.name.endsWith('.controller.ts')) {
            fileItem.iconPath = this.getIcon('controller');
          } else if (entry.name.endsWith('.module.ts')) {
            fileItem.iconPath = this.getIcon('module');
          } else if (entry.name.endsWith('.repository.ts')) {
            fileItem.iconPath = this.getIcon('repository');
          } else if (entry.name.endsWith('.store.ts')) {
            fileItem.iconPath = this.getIcon('store');
          } else if (entry.name.endsWith('.policy.ts')) {
            fileItem.iconPath = this.getIcon('policy');
          } else if (entry.name.endsWith('.processor.ts')) {
            fileItem.iconPath = this.getIcon('processor');
          } else if (entry.name.endsWith('.task.ts')) {
            fileItem.iconPath = this.getIcon('task');
          } else if (entry.name.endsWith('.provider.ts') || entry.name.endsWith('.handler.ts')) {
            fileItem.iconPath = this.getIcon('provider');
          } else if (entry.name.endsWith('.interface.ts')) {
            fileItem.iconPath = this.getIcon('interface');
          } else if (entry.name.endsWith('.event.ts')) {
            fileItem.iconPath = this.getIcon('event');
          } else if (entry.name.endsWith('.listener.ts')) {
            fileItem.iconPath = this.getIcon('listener');
          } else if (entry.name.endsWith('.dto.ts')) {
            fileItem.iconPath = this.getIcon('dto');
          } else {
            fileItem.iconPath = this.getIcon('file');
          }

          // Architecture Health & Convention Linter diagnostics
          const kind = detectComponentKind(entry.name);
          let isOrphan = false;
          let isNoSpec = false;
          let isInjectable = false;

          const classInfo = extractExportedClassInfo(fullPath);

          if (classInfo) {
            if (['service', 'repository', 'store', 'provider', 'policy'].includes(kind)) {
              isInjectable = true;
            }

            const checkWired = [
              'service',
              'controller',
              'repository',
              'store',
              'provider',
              'policy',
              'processor',
              'task',
              'listener',
            ].includes(kind);

            if (checkWired && inspection.modulePath) {
              if (!inspection.allRegistered.has(classInfo.className)) {
                isOrphan = true;
              }
            }
          }

          if (kind === 'service' || kind === 'controller') {
            const spec1 = fullPath.replace(/\.ts$/, '.spec.ts');
            const spec2 = fullPath.replace(/\.(service|controller)\.ts$/, '.spec.ts');
            if (!fs.existsSync(spec1) && !fs.existsSync(spec2)) {
              isNoSpec = true;
            }
          }

          if (isOrphan && isNoSpec) {
            fileItem.description = 'unwired • no spec';
            fileItem.tooltip = `Unwired: ${classInfo?.className} not in module\nMissing: Unit test spec`;
          } else if (isOrphan) {
            fileItem.description = 'unwired';
            fileItem.tooltip = `Unwired: ${classInfo?.className} is not registered in ${path.basename(inspection.modulePath || 'module')}`;
          } else if (isNoSpec) {
            fileItem.description = 'no spec';
            fileItem.tooltip = 'Missing unit test spec';
          }

          let ctx = 'featureFile';
          if (isInjectable) ctx += '_injectable';
          if (isOrphan) ctx += '_orphan';
          if (isNoSpec) ctx += '_nospec';
          fileItem.contextValue = ctx;

          items.push(fileItem);
        }
      }

      return Promise.resolve(items);
    } else {
      return Promise.resolve([]);
    }

    // List all feature directories under rootPath
    const cfg = vscode.workspace.getConfiguration('nestForge', vscode.Uri.file(rootPath));
    const conventions = loadProjectConventions(rootPath, {
      featuresDir: cfg.get<string>('featuresDir'),
    });
    const featuresDir = path.isAbsolute(conventions.featuresDir)
      ? conventions.featuresDir
      : path.join(rootPath, conventions.featuresDir);

    if (!fs.existsSync(featuresDir)) {
      return Promise.resolve([]);
    }

    const entries = fs.readdirSync(featuresDir, { withFileTypes: true });
    const items: FeatureTreeItem[] = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const item = new FeatureTreeItem(
          entry.name,
          vscode.TreeItemCollapsibleState.Collapsed,
          vscode.Uri.file(path.join(featuresDir, entry.name)),
          true,
        );
        item.iconPath = this.getIcon('module');
        item.contextValue = 'featureRoot';
        items.push(item);
      }
    }

    return Promise.resolve(items);
  }
}

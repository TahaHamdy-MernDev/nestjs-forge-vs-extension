import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { loadProjectConventions } from '../core/config-loader.js';
import { formatFiles } from '../core/formatter.js';
import { registerInParentModule } from '../core/module-registrar.js';
import { deriveNames } from '../core/naming.js';
import { buildPlan } from '../core/planner.js';
import { TemplateRenderer } from '../core/renderer.js';
import { validateSafeFileName, validateWorkspacePath } from '../core/path-validator.js';
import { createFileHashes, saveLastScaffoldRecord } from '../core/scaffold-manifest.js';
import type { FeatureFormState, ProjectConventions } from '../core/types.js';
import { writeFeatureFiles } from '../core/writer.js';

function isFile(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

export class FeatureFormPanel {
  public static currentPanel: FeatureFormPanel | undefined;
  private readonly _panel: vscode.WebviewPanel;
  private readonly _extensionUri: vscode.Uri;
  private readonly _workspaceRoot: string;
  private readonly _conventions: ProjectConventions;
  private readonly _renderer: TemplateRenderer;
  private _disposables: vscode.Disposable[] = [];

  public static createOrShow(
    extensionUri: vscode.Uri,
    targetFolderUri?: any,
  ) {
    const column = vscode.window.activeTextEditor
      ? vscode.window.activeTextEditor.viewColumn
      : undefined;

    if (FeatureFormPanel.currentPanel) {
      FeatureFormPanel.currentPanel._panel.reveal(column);
      return;
    }

    let targetUri: vscode.Uri | undefined;
    if (targetFolderUri instanceof vscode.Uri) {
      targetUri = targetFolderUri;
    } else if (targetFolderUri && targetFolderUri.resourceUri instanceof vscode.Uri) {
      targetUri = targetFolderUri.resourceUri;
    } else if (vscode.window.activeTextEditor?.document.uri instanceof vscode.Uri) {
      targetUri = vscode.window.activeTextEditor.document.uri;
    }

    let wsFolder: vscode.WorkspaceFolder | undefined;
    if (targetUri) {
      try {
        wsFolder = vscode.workspace.getWorkspaceFolder(targetUri);
      } catch {
        // Fallback safely if not in a workspace folder
      }
    }

    const workspaceRoot = wsFolder
      ? wsFolder.uri.fsPath
      : (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0
          ? vscode.workspace.workspaceFolders[0].uri.fsPath
          : process.cwd());

    const panel = vscode.window.createWebviewPanel(
      'nestForgeNewFeature',
      'Nest Forge: New Feature',
      column || vscode.ViewColumn.One,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'dist'),
          vscode.Uri.joinPath(extensionUri, 'src'),
        ],
      },
    );

    panel.iconPath = vscode.Uri.joinPath(extensionUri, 'resources', 'icon.svg');

    FeatureFormPanel.currentPanel = new FeatureFormPanel(
      panel,
      extensionUri,
      workspaceRoot,
      targetFolderUri,
    );
  }

  private constructor(
    panel: vscode.WebviewPanel,
    extensionUri: vscode.Uri,
    workspaceRoot: string,
    targetFolderUri?: vscode.Uri,
  ) {
    this._panel = panel;
    this._extensionUri = extensionUri;
    this._workspaceRoot = workspaceRoot;
    const cfg = vscode.workspace.getConfiguration('nestForge');
    this._conventions = loadProjectConventions(workspaceRoot, {
      featuresDir: cfg.get<string>('featuresDir'),
      parentModule: cfg.get<string>('parentModule'),
      orm: cfg.get<'drizzle' | 'prisma' | 'typeorm' | 'none'>('orm'),
      importExtension: cfg.get<string>('importExtension'),
      pathAlias: cfg.get<string>('pathAlias'),
      controllerVersion: cfg.get<string>('controllerVersion'),
      paramStyle: cfg.get<'snake_case' | 'camelCase'>('paramStyle'),
      i18nDir: cfg.get<string>('i18nDir'),
      i18nDefaultLocale: cfg.get<string>('i18nDefaultLocale'),
    });

    const defaultTemplatesDir = path.join(extensionUri.fsPath, 'dist', 'templates');
    const customTemplatesDir = path.join(workspaceRoot, '.nest-forge', 'templates');
    this._renderer = new TemplateRenderer(defaultTemplatesDir, customTemplatesDir);

    this._updateHtml();

    this._panel.onDidDispose(() => this.dispose(), null, this._disposables);

    this._panel.webview.onDidReceiveMessage(
      async (message) => {
        switch (message.command) {
          case 'init': {
            let initialTargetPath = this._conventions.featuresDir;
            let suggestedFeatureName = '';

            if (targetFolderUri) {
              const rel = path.relative(this._workspaceRoot, targetFolderUri.fsPath);
              if (rel && !rel.startsWith('..')) {
                initialTargetPath = rel;
                const base = path.basename(rel);
                if (base !== 'features' && base !== 'src' && base !== 'modules') {
                  suggestedFeatureName = base;
                }
              }
            }
            this._panel.webview.postMessage({
              command: 'setDefaults',
              conventions: this._conventions,
              initialTargetPath,
              suggestedFeatureName,
              workspaceRoot: this._workspaceRoot,
            });
            break;
          }

          case 'updatePreview': {
            const state: FeatureFormState = message.state;
            const plans = buildPlan(state, this._conventions, this._workspaceRoot);
            this._panel.webview.postMessage({
              command: 'previewUpdated',
              plans,
            });
            break;
          }

          case 'forgeFeature': {
            await this._handleForgeFeature(message.state, message.overwriteConflicts);
            break;
          }

          case 'cancel': {
            this._panel.dispose();
            break;
          }
        }
      },
      null,
      this._disposables,
    );
  }

  private async _handleForgeFeature(
    state: FeatureFormState,
    overwriteConflicts: boolean,
  ) {
    try {
      // 0. Path validation
      const targetVal = validateWorkspacePath(this._workspaceRoot, state.targetPath);
      if (!targetVal.valid) {
        vscode.window.showErrorMessage(`Nest Forge: ${targetVal.error}`);
        return;
      }

      if (state.parentModulePath && state.parentModulePath.trim()) {
        const parentVal = validateWorkspacePath(this._workspaceRoot, state.parentModulePath);
        if (!parentVal.valid) {
          vscode.window.showErrorMessage(`Nest Forge: ${parentVal.error}`);
          return;
        }
      }

      const fileNames = [
        state.structureMode === 'grouped' ? '' : state.serviceFileName,
        state.structureMode === 'grouped' ? '' : state.controllerFileName,
        state.moduleFileName,
        state.includeRepository ? state.repositoryFileName : '',
        state.includeInterface ? state.interfaceFileName : '',
        state.includePolicy ? (state.policyFileName || `${state.featureName}.policy.ts`) : '',
        ...(state.controllerFiles || []).map((c) => c.name),
        ...(state.serviceFiles || []).map((s) => s.name),
        ...(state.storeFiles || []).map((s) => s.name),
        ...(state.providerFiles || []).map((p) => p.name),
        ...(state.dtoFiles || []).map((d) => d.name),
        ...(state.eventFiles || []).map((e) => e.name),
        ...(state.listenerFiles || []).map((l) => l.name),
      ].filter(Boolean);

      for (const fn of fileNames) {
        const fnVal = validateSafeFileName(fn);
        if (!fnVal.valid) {
          vscode.window.showErrorMessage(`Nest Forge: ${fnVal.error}`);
          return;
        }
      }

      const plans = buildPlan(state, this._conventions, this._workspaceRoot);
      if (plans.length === 0) {
        vscode.window.showErrorMessage('Nest Forge: No files to generate. Please specify a feature name.');
        return;
      }

      // Check conflicts
      const existing = plans.filter((p) => p.exists);
      if (existing.length > 0 && !overwriteConflicts) {
        const choice = await vscode.window.showWarningMessage(
          `${existing.length} file(s) already exist. Do you want to overwrite them?`,
          'Overwrite All',
          'Cancel',
        );
        if (choice !== 'Overwrite All') {
          return;
        }
      }

      // 1. Write files
      const { created } = writeFeatureFiles(plans, this._renderer, {
        overwriteExisting: true,
      });

      // 2. Register in parent module (Safely guarded)
      let parentModuleUpdated = false;
      let finalImportPath = '';
      const names = deriveNames(state.featureName);
      const moduleClassName = `${names.pascal}Module`;

      const rawParentModule = (state.parentModulePath || '').trim();
      if (rawParentModule) {
        const parentModulePath = path.isAbsolute(rawParentModule)
          ? rawParentModule
          : path.join(this._workspaceRoot, rawParentModule);

        // Crucial Guard: must exist AND be an actual file (not a directory)
        if (isFile(parentModulePath)) {
          if (this._conventions.pathAlias && this._conventions.pathAlias.startsWith('@/features')) {
            finalImportPath = `${this._conventions.pathAlias}/${names.kebab}/${state.moduleFileName.replace(/\.ts$/, '')}${this._conventions.importExtension}`;
          } else {
            const parentDir = path.dirname(parentModulePath);
            const targetModuleFile = path.join(
              this._workspaceRoot,
              state.targetPath,
              state.moduleFileName,
            );
            let rel = path.relative(parentDir, targetModuleFile).replace(/\\/g, '/');
            if (!rel.startsWith('.')) rel = './' + rel;
            finalImportPath = rel.replace(/\.ts$/, '') + this._conventions.importExtension;
          }

          parentModuleUpdated = registerInParentModule({
            parentModulePath,
            featureModuleClassName: moduleClassName,
            featureModuleImportPath: finalImportPath,
          });
        }
      }

      // 3. Format files
      const allPathsToFormat = [...created];
      if (parentModuleUpdated && rawParentModule) {
        const parentModulePath = path.isAbsolute(rawParentModule) ? rawParentModule : path.join(this._workspaceRoot, rawParentModule);
        if (isFile(parentModulePath)) {
          allPathsToFormat.push(parentModulePath);
        }
      }
      await formatFiles(allPathsToFormat, this._workspaceRoot, this._conventions.formatter);

      // 4. Save scaffold manifest for Undo support with file hashes
      const fileHashes = createFileHashes(created);
      saveLastScaffoldRecord(this._workspaceRoot, {
        featureName: state.featureName,
        createdFiles: created,
        fileHashes,
        targetPath: state.targetPath,
        parentModulePath: rawParentModule,
        moduleClassName,
        importSpecifier: finalImportPath,
        timestamp: Date.now(),
      });

      // 5. Refresh sidebar view & sync i18n
      vscode.commands.executeCommand('nestForge.refreshFeatures');
      if (state.includeI18n || plans.some((p) => p.templateName === 'i18n-en' || p.templateName === 'i18n-ar')) {
        await vscode.commands.executeCommand('nestForge.i18n.generateTypes');
        vscode.commands.executeCommand('nestForge.i18n.reload');
      }

      // 6. Success message & open module
      const modulePlan = plans.find((p) => p.templateName === 'module');
      const action = await vscode.window.showInformationMessage(
        `Nest Forge: Created feature '${state.featureName}' with ${created.length} files!`,
        'Open Module',
      );

      if (action === 'Open Module' && modulePlan && isFile(modulePlan.absolutePath)) {
        const doc = await vscode.workspace.openTextDocument(modulePlan.absolutePath);
        await vscode.window.showTextDocument(doc);
      }

      this._panel.dispose();
    } catch (err: unknown) {
      const errorMsg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Nest Forge Error: ${errorMsg}`);
    }
  }

  private _updateHtml() {
    const webview = this._panel.webview;
    const uiDistPath = path.join(this._extensionUri.fsPath, 'dist', 'webview', 'ui');
    const uiSrcPath = path.join(this._extensionUri.fsPath, 'src', 'webview', 'ui');
    const basePath = isFile(path.join(uiDistPath, 'form.html')) ? uiDistPath : uiSrcPath;

    let html = fs.readFileSync(path.join(basePath, 'form.html'), 'utf-8');
    const cssUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(basePath, 'form.css')),
    );
    const jsUri = webview.asWebviewUri(
      vscode.Uri.file(path.join(basePath, 'form.js')),
    );

    html = html.replace('{{CSS_URI}}', cssUri.toString());
    html = html.replace('{{JS_URI}}', jsUri.toString());
    html = html.replace(/{{CSP_SOURCE}}/g, webview.cspSource);

    webview.html = html;
  }

  public dispose() {
    FeatureFormPanel.currentPanel = undefined;
    this._panel.dispose();
    while (this._disposables.length) {
      const x = this._disposables.pop();
      if (x) x.dispose();
    }
  }
}

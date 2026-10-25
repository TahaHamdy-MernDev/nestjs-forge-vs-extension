import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { loadProjectConventions } from './core/config-loader.js';
import {
  injectDependencyIntoClass,
  wireComponentIntoModule,
  wireRepositoryIntoFeature,
} from './core/feature-wirer.js';
import { deleteFeature, renameFeature } from './core/feature-lifecycle.js';
import { formatFiles } from './core/formatter.js';
import { detectComponentKind, extractExportedClassInfo } from './core/module-inspector.js';
import { unregisterFromParentModule } from './core/module-unregistrar.js';
import { deriveNames, validateIdentifier } from './core/naming.js';
import { validateSafeFileName, validateWorkspacePath } from './core/path-validator.js';
import { TemplateRenderer } from './core/renderer.js';
import { clearLastScaffoldRecord, getLastScaffoldRecord, verifyFileUnchanged } from './core/scaffold-manifest.js';
import { FeatureTreeItem, FeaturesTreeProvider } from './views/FeaturesTreeProvider.js';
import { FeatureFormPanel } from './webview/FeatureFormPanel.js';
import { registerI18n } from './i18n/register-i18n.js';

function computeRelativeImport(fromFile: string, targetFile: string, ext: string = ''): string {
  let rel = path.relative(path.dirname(fromFile), targetFile).replace(/\\/g, '/');
  rel = rel.replace(/\.ts$/, '');
  if (!rel.startsWith('.')) {
    rel = `./${rel}`;
  }
  return `${rel}${ext}`;
}

async function resolveWorkspaceFolder(uri?: any): Promise<vscode.WorkspaceFolder | undefined> {
  let targetUri: vscode.Uri | undefined;
  if (uri instanceof vscode.Uri) {
    targetUri = uri;
  } else if (uri && uri.resourceUri instanceof vscode.Uri) {
    targetUri = uri.resourceUri;
  }

  if (targetUri) {
    try {
      const folder = vscode.workspace.getWorkspaceFolder(targetUri);
      if (folder) return folder;
    } catch {
      // Ignore non-workspace URI
    }
  }

  const activeUri = vscode.window.activeTextEditor?.document.uri;
  if (activeUri && activeUri instanceof vscode.Uri) {
    try {
      const folder = vscode.workspace.getWorkspaceFolder(activeUri);
      if (folder) return folder;
    } catch {
      // Ignore non-workspace URI
    }
  }

  const folders = vscode.workspace.workspaceFolders;
  if (!folders || folders.length === 0) {
    return undefined;
  }
  if (folders.length === 1) {
    return folders[0];
  }
  return await vscode.window.showWorkspaceFolderPick();
}

function getConventions(root: string) {
  const cfg = vscode.workspace.getConfiguration('nestForge', vscode.Uri.file(root));
  return loadProjectConventions(root, {
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
}

export function activate(context: vscode.ExtensionContext) {
  console.log('Nest Forge extension activated.');

  // Initialize unified @nestjs/i18n suite
  const workspaceFolders = vscode.workspace.workspaceFolders;
  const initialRoot = workspaceFolders && workspaceFolders.length > 0 ? workspaceFolders[0].uri.fsPath : process.cwd();
  const { store: i18nStore, typeGen: i18nTypeGen } = registerI18n(context, initialRoot);

  // 1. Sidebar Tree View
  const treeProvider = new FeaturesTreeProvider(undefined, context.extensionUri);
  vscode.window.registerTreeDataProvider('nestForge.featuresView', treeProvider);

  // 2. Refresh command
  const refreshCommand = vscode.commands.registerCommand('nestForge.refreshFeatures', () => {
    treeProvider.refresh();
  });

  // 3. New Feature command
  const newFeatureCommand = vscode.commands.registerCommand('nestForge.newFeature', (arg?: any) => {
    let folderUri: vscode.Uri | undefined;
    if (arg instanceof vscode.Uri) {
      folderUri = arg;
    } else if (arg && arg.resourceUri instanceof vscode.Uri) {
      folderUri = arg.resourceUri;
    }
    FeatureFormPanel.createOrShow(context.extensionUri, folderUri);
  });

  // Helper function to resolve feature directory from command arguments
  async function resolveFeatureDir(item?: any): Promise<{ featureDir: string; featureName: string; workspaceRoot: string } | null> {
    let targetUri: vscode.Uri | undefined;
    if (item instanceof vscode.Uri) {
      targetUri = item;
    } else if (item && item.resourceUri instanceof vscode.Uri) {
      targetUri = item.resourceUri;
    }

    const folder = await resolveWorkspaceFolder(targetUri);
    if (!folder) {
      vscode.window.showErrorMessage('Nest Forge: No workspace open.');
      return null;
    }
    const currentRoot = folder.uri.fsPath;

    if (targetUri) {
      const targetPath = targetUri.fsPath;
      const pathCheck = validateWorkspacePath(currentRoot, targetPath);
      if (!pathCheck.valid) {
        vscode.window.showErrorMessage(`Nest Forge: Invalid path: ${pathCheck.error}`);
        return null;
      }
      const stat = fs.statSync(targetPath);
      const folderPath = stat.isDirectory() ? targetPath : path.dirname(targetPath);

      const SUB_DIRS = new Set([
        'dto',
        'events',
        'listeners',
        'controllers',
        'services',
        'providers',
        'stores',
        'repositories',
        'policies',
        'processors',
        'tasks',
      ]);
      let currentDir = folderPath;
      while (SUB_DIRS.has(path.basename(currentDir))) {
        currentDir = path.dirname(currentDir);
      }
      const actualFeatureDir = currentDir;

      return {
        featureDir: actualFeatureDir,
        featureName: path.basename(actualFeatureDir),
        workspaceRoot: currentRoot,
      };
    }

    // Otherwise prompt user to select a feature
    const conventions = getConventions(currentRoot);
    const featuresDir = path.isAbsolute(conventions.featuresDir)
      ? conventions.featuresDir
      : path.join(currentRoot, conventions.featuresDir);

    if (!fs.existsSync(featuresDir)) {
      vscode.window.showErrorMessage(`Features directory not found at ${conventions.featuresDir}`);
      return null;
    }

    const dirs = fs.readdirSync(featuresDir, { withFileTypes: true }).filter((d) => d.isDirectory()).map((d) => d.name);
    if (dirs.length === 0) {
      vscode.window.showInformationMessage('No existing features found. Please create a new feature first.');
      return null;
    }

    const picked = await vscode.window.showQuickPick(dirs, { placeHolder: 'Select a feature:' });
    if (!picked) return null;

    return {
      featureDir: path.join(featuresDir, picked),
      featureName: picked,
      workspaceRoot: currentRoot,
    };
  }

  // 4. Undo Last Scaffold command
  const undoCommand = vscode.commands.registerCommand('nestForge.undoLastScaffold', async (arg?: any) => {
    let targetUri: vscode.Uri | undefined;
    if (arg instanceof vscode.Uri) {
      targetUri = arg;
    } else if (arg && arg.resourceUri instanceof vscode.Uri) {
      targetUri = arg.resourceUri;
    }

    const folder = await resolveWorkspaceFolder(targetUri);
    if (!folder) {
      vscode.window.showErrorMessage('Nest Forge: No workspace open.');
      return;
    }
    const currentRoot = folder.uri.fsPath;

    const record = getLastScaffoldRecord(currentRoot);
    if (!record) {
      vscode.window.showInformationMessage('Nest Forge: No recent scaffold record found to undo.');
      return;
    }

    const confirm = await vscode.window.showWarningMessage(
      `Undo scaffolding for '${record.featureName}'? This will delete unchanged generated files and revert '${path.basename(record.parentModulePath)}'.`,
      { modal: true },
      'Undo Scaffold',
    );

    if (confirm !== 'Undo Scaffold') {
      return;
    }

    // Delete created files (only if unchanged since generation)
    let deletedCount = 0;
    const skippedFiles: string[] = [];

    for (const file of record.createdFiles) {
      if (!fs.existsSync(file)) {
        continue;
      }

      // Check if file has been modified by the user
      const expectedHash = record.fileHashes?.[file];
      if (expectedHash && !verifyFileUnchanged(file, expectedHash)) {
        skippedFiles.push(path.basename(file));
        continue;
      }

      try {
        fs.unlinkSync(file);
        deletedCount++;
      } catch {
        skippedFiles.push(path.basename(file));
      }
    }

    // Try removing empty feature subdirectories and main feature dir
    const targetDirAbs = path.isAbsolute(record.targetPath)
      ? record.targetPath
      : path.join(currentRoot, record.targetPath);

    if (fs.existsSync(targetDirAbs)) {
      try {
        const subdirs = [
          'controllers',
          'services',
          'providers',
          'stores',
          'repositories',
          'policies',
          'processors',
          'tasks',
          'dto',
          'events',
          'listeners',
        ];
        for (const sub of subdirs) {
          const subPath = path.join(targetDirAbs, sub);
          if (fs.existsSync(subPath) && fs.statSync(subPath).isDirectory()) {
            if (fs.readdirSync(subPath).length === 0) {
              fs.rmdirSync(subPath);
            }
          }
        }
        if (fs.statSync(targetDirAbs).isDirectory() && fs.readdirSync(targetDirAbs).length === 0) {
          fs.rmdirSync(targetDirAbs);
        }
      } catch {
        // Ignore rmdir errors - folder not empty or locked
      }
    }

    // Revert parent module AST registration
    if (record.parentModulePath) {
      const parentModuleAbs = path.isAbsolute(record.parentModulePath)
        ? record.parentModulePath
        : path.join(currentRoot, record.parentModulePath);

      if (fs.existsSync(parentModuleAbs)) {
        unregisterFromParentModule({
          parentModulePath: parentModuleAbs,
          featureModuleClassName: record.moduleClassName,
        });

        const conventions = getConventions(currentRoot);
        await formatFiles([parentModuleAbs], currentRoot, conventions.formatter);
      }
    }

    clearLastScaffoldRecord(currentRoot);
    treeProvider.refresh();
    await i18nTypeGen.generate();
    i18nStore.reload();

    let msg = `Successfully reverted '${record.featureName}' and deleted ${deletedCount} file(s).`;
    if (skippedFiles.length > 0) {
      msg += ` Preserved ${skippedFiles.length} file(s) modified after scaffolding: ${skippedFiles.join(', ')}.`;
      vscode.window.showWarningMessage(msg);
    } else {
      vscode.window.showInformationMessage(msg);
    }
  });

  // 5. Eject Templates command
  const ejectCommand = vscode.commands.registerCommand('nestForge.ejectTemplates', async (uri?: vscode.Uri) => {
    const folder = await resolveWorkspaceFolder(uri);
    if (!folder) {
      vscode.window.showErrorMessage('Nest Forge: No workspace open.');
      return;
    }
    const root = folder.uri.fsPath;

    const defaultTemplatesDir = path.join(context.extensionUri.fsPath, 'dist', 'templates');
    const targetDir = path.join(root, '.nest-forge', 'templates');

    fs.mkdirSync(targetDir, { recursive: true });
    const templates = fs.readdirSync(defaultTemplatesDir);
    for (const t of templates) {
      const src = path.join(defaultTemplatesDir, t);
      const dest = path.join(targetDir, t);
      if (!fs.existsSync(dest)) {
        fs.copyFileSync(src, dest);
      }
    }

    vscode.window.showInformationMessage(
      'Templates ejected to .nest-forge/templates/. Any edits here will override default generation.',
    );
  });

  // 6. Add DTO command
  const addDtoCommand = vscode.commands.registerCommand('nestForge.addDto', async (arg?: vscode.Uri | FeatureTreeItem) => {
    const resolved = await resolveFeatureDir(arg);
    if (!resolved) return;
    const { featureDir, featureName, workspaceRoot } = resolved;

    const dtoNameInput = await vscode.window.showInputBox({
      prompt: `Enter DTO name for feature '${featureName}' (e.g. create-${featureName}, filter)`,
      placeHolder: `create-${featureName}`,
    });
    if (!dtoNameInput) return;

    const baseName = dtoNameInput.trim().replace(/\.dto\.ts$/, '').replace(/\.ts$/, '');
    const nameCheck = validateSafeFileName(baseName);
    if (!nameCheck.valid) {
      vscode.window.showErrorMessage(`Invalid DTO name: ${nameCheck.error}`);
      return;
    }
    const identCheck = validateIdentifier(baseName);
    if (!identCheck.valid) {
      vscode.window.showErrorMessage(`Invalid DTO name: ${identCheck.error}`);
      return;
    }

    const conventions = getConventions(workspaceRoot);
    const defaultTemplatesDir = path.join(context.extensionUri.fsPath, 'dist', 'templates');
    const customTemplatesDir = path.join(workspaceRoot, '.nest-forge', 'templates');
    const renderer = new TemplateRenderer(defaultTemplatesDir, customTemplatesDir);

    const dtoNames = deriveNames(baseName);
    const featureNames = deriveNames(featureName);

    const dtoDir = path.join(featureDir, 'dto');
    const targetFile = path.join(dtoDir, `${baseName}.dto.ts`);
    const pathCheck = validateWorkspacePath(workspaceRoot, targetFile);
    if (!pathCheck.valid) {
      vscode.window.showErrorMessage(`Invalid file path: ${pathCheck.error}`);
      return;
    }

    if (fs.existsSync(targetFile)) {
      const confirm = await vscode.window.showWarningMessage(
        `DTO already exists at ${path.relative(workspaceRoot, targetFile)}. Overwrite it?`,
        { modal: true },
        'Overwrite',
      );
      if (confirm !== 'Overwrite') {
        return;
      }
    }

    fs.mkdirSync(dtoDir, { recursive: true });
    const content = renderer.render('dto', {
      names: featureNames,
      conventions,
      dtoClassName: `${dtoNames.pascal}Dto`,
      dtoSchemaName: `${dtoNames.camel}Schema`,
    });

    fs.writeFileSync(targetFile, content, 'utf-8');
    await formatFiles([targetFile], workspaceRoot, conventions.formatter);

    treeProvider.refresh();
    const doc = await vscode.workspace.openTextDocument(targetFile);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`Created DTO: dto/${baseName}.dto.ts`);
  });

  // 7. Add Repository command
  const addRepositoryCommand = vscode.commands.registerCommand('nestForge.addRepository', async (arg?: vscode.Uri | FeatureTreeItem) => {
    const resolved = await resolveFeatureDir(arg);
    if (!resolved) return;
    const { featureDir, featureName, workspaceRoot } = resolved;

    const conventions = getConventions(workspaceRoot);
    const featureNames = deriveNames(featureName);
    const repoFileName = `${featureNames.kebab}.repository.ts`;
    const repoFile = path.join(featureDir, repoFileName);
    const pathCheck = validateWorkspacePath(workspaceRoot, repoFile);
    if (!pathCheck.valid) {
      vscode.window.showErrorMessage(`Invalid file path: ${pathCheck.error}`);
      return;
    }

    if (fs.existsSync(repoFile)) {
      vscode.window.showWarningMessage(`Repository already exists at ${path.relative(workspaceRoot, repoFile)}`);
      return;
    }

    const defaultTemplatesDir = path.join(context.extensionUri.fsPath, 'dist', 'templates');
    const customTemplatesDir = path.join(workspaceRoot, '.nest-forge', 'templates');
    const renderer = new TemplateRenderer(defaultTemplatesDir, customTemplatesDir);

    const content = renderer.render('repository', {
      names: featureNames,
      conventions,
    });
    fs.writeFileSync(repoFile, content, 'utf-8');

    // Auto-wire into module and service
    const moduleFile = path.join(featureDir, `${featureNames.kebab}.module.ts`);
    let serviceFile = path.join(featureDir, `${featureNames.kebab}.service.ts`);
    if (!fs.existsSync(serviceFile)) {
      const groupedService = path.join(featureDir, 'services', `${featureNames.kebab}.service.ts`);
      if (fs.existsSync(groupedService)) {
        serviceFile = groupedService;
      }
    }

    const repoClass = `${featureNames.pascal}Repository`;
    const repoImportForModule = computeRelativeImport(moduleFile, repoFile, conventions.importExtension);
    const repoImportForService = fs.existsSync(serviceFile)
      ? computeRelativeImport(serviceFile, repoFile, conventions.importExtension)
      : repoImportForModule;
    const paramName = conventions.paramStyle === 'snake_case' ? `${featureNames.snake}_repository` : `${featureNames.camel}Repository`;

    wireRepositoryIntoFeature({
      modulePath: fs.existsSync(moduleFile) ? moduleFile : '',
      servicePath: fs.existsSync(serviceFile) ? serviceFile : '',
      repositoryClassName: repoClass,
      repositoryImportPath: repoImportForModule,
      serviceImportPath: repoImportForService,
      paramName,
    });

    const filesToFormat = [repoFile];
    if (fs.existsSync(moduleFile)) filesToFormat.push(moduleFile);
    if (fs.existsSync(serviceFile)) filesToFormat.push(serviceFile);

    await formatFiles(filesToFormat, workspaceRoot, conventions.formatter);
    treeProvider.refresh();

    const doc = await vscode.workspace.openTextDocument(repoFile);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`Created ${repoFileName} and wired into module & service!`);
  });

  // 8. Add Event command
  const addEventCommand = vscode.commands.registerCommand('nestForge.addEvent', async (arg?: vscode.Uri | FeatureTreeItem) => {
    const resolved = await resolveFeatureDir(arg);
    if (!resolved) return;
    const { featureDir, featureName, workspaceRoot } = resolved;

    const eventNameInput = await vscode.window.showInputBox({
      prompt: `Enter event name for '${featureName}' (e.g. ${featureName}-created, order-shipped)`,
      placeHolder: `${featureName}-created`,
    });
    if (!eventNameInput) return;

    const baseName = eventNameInput.trim().replace(/\.event\.ts$/, '').replace(/\.ts$/, '');
    const nameCheck = validateSafeFileName(baseName);
    if (!nameCheck.valid) {
      vscode.window.showErrorMessage(`Invalid event name: ${nameCheck.error}`);
      return;
    }
    const identCheck = validateIdentifier(baseName);
    if (!identCheck.valid) {
      vscode.window.showErrorMessage(`Invalid event name: ${identCheck.error}`);
      return;
    }

    const conventions = getConventions(workspaceRoot);
    const defaultTemplatesDir = path.join(context.extensionUri.fsPath, 'dist', 'templates');
    const customTemplatesDir = path.join(workspaceRoot, '.nest-forge', 'templates');
    const renderer = new TemplateRenderer(defaultTemplatesDir, customTemplatesDir);

    const eventNames = deriveNames(baseName);
    const featureNames = deriveNames(featureName);

    const eventDir = path.join(featureDir, 'events');
    const targetFile = path.join(eventDir, `${baseName}.event.ts`);
    const pathCheck = validateWorkspacePath(workspaceRoot, targetFile);
    if (!pathCheck.valid) {
      vscode.window.showErrorMessage(`Invalid file path: ${pathCheck.error}`);
      return;
    }

    if (fs.existsSync(targetFile)) {
      const confirm = await vscode.window.showWarningMessage(
        `Event already exists at ${path.relative(workspaceRoot, targetFile)}. Overwrite it?`,
        { modal: true },
        'Overwrite',
      );
      if (confirm !== 'Overwrite') {
        return;
      }
    }

    fs.mkdirSync(eventDir, { recursive: true });
    const content = renderer.render('event', {
      names: featureNames,
      conventions,
      eventName: baseName,
      eventNames,
      eventClassName: `${eventNames.pascal}Event`,
    });

    fs.writeFileSync(targetFile, content, 'utf-8');
    await formatFiles([targetFile], workspaceRoot, conventions.formatter);

    treeProvider.refresh();
    const doc = await vscode.workspace.openTextDocument(targetFile);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`Created Event: events/${baseName}.event.ts`);
  });

  // 9. Add Listener command
  const addListenerCommand = vscode.commands.registerCommand('nestForge.addListener', async (arg?: vscode.Uri | FeatureTreeItem) => {
    const resolved = await resolveFeatureDir(arg);
    if (!resolved) return;
    const { featureDir, featureName, workspaceRoot } = resolved;

    const listenerNameInput = await vscode.window.showInputBox({
      prompt: `Enter listener name for '${featureName}' (e.g. ${featureName}-created, send-welcome-email)`,
      placeHolder: `${featureName}-created`,
    });
    if (!listenerNameInput) return;

    const baseName = listenerNameInput.trim().replace(/\.listener\.ts$/, '').replace(/\.ts$/, '');
    const nameCheck = validateSafeFileName(baseName);
    if (!nameCheck.valid) {
      vscode.window.showErrorMessage(`Invalid listener name: ${nameCheck.error}`);
      return;
    }
    const identCheck = validateIdentifier(baseName);
    if (!identCheck.valid) {
      vscode.window.showErrorMessage(`Invalid listener name: ${identCheck.error}`);
      return;
    }

    const conventions = getConventions(workspaceRoot);
    const defaultTemplatesDir = path.join(context.extensionUri.fsPath, 'dist', 'templates');
    const customTemplatesDir = path.join(workspaceRoot, '.nest-forge', 'templates');
    const renderer = new TemplateRenderer(defaultTemplatesDir, customTemplatesDir);

    const listenerNames = deriveNames(baseName);
    const featureNames = deriveNames(featureName);

    const listenerDir = path.join(featureDir, 'listeners');
    const targetFile = path.join(listenerDir, `${baseName}.listener.ts`);
    const pathCheck = validateWorkspacePath(workspaceRoot, targetFile);
    if (!pathCheck.valid) {
      vscode.window.showErrorMessage(`Invalid file path: ${pathCheck.error}`);
      return;
    }

    if (fs.existsSync(targetFile)) {
      const confirm = await vscode.window.showWarningMessage(
        `Listener already exists at ${path.relative(workspaceRoot, targetFile)}. Overwrite it?`,
        { modal: true },
        'Overwrite',
      );
      if (confirm !== 'Overwrite') {
        return;
      }
    }

    fs.mkdirSync(listenerDir, { recursive: true });
    const content = renderer.render('listener', {
      names: featureNames,
      conventions,
      listenerName: baseName,
      listenerNames,
      listenerClassName: `${listenerNames.pascal}Listener`,
    });

    fs.writeFileSync(targetFile, content, 'utf-8');

    // Auto-wire into module
    const moduleFile = path.join(featureDir, `${featureNames.kebab}.module.ts`);
    const filesToFormat = [targetFile];
    if (fs.existsSync(moduleFile)) {
      wireComponentIntoModule({
        modulePath: moduleFile,
        className: `${listenerNames.pascal}Listener`,
        importPath: computeRelativeImport(moduleFile, targetFile, conventions.importExtension),
        targetArrays: ['providers'],
      });
      filesToFormat.push(moduleFile);
    }

    await formatFiles(filesToFormat, workspaceRoot, conventions.formatter);

    treeProvider.refresh();
    const doc = await vscode.workspace.openTextDocument(targetFile);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`Created Listener: listeners/${baseName}.listener.ts`);
  });

  // 10. Add Controller command
  const addControllerCommand = vscode.commands.registerCommand('nestForge.addController', async (arg?: vscode.Uri | FeatureTreeItem) => {
    const resolved = await resolveFeatureDir(arg);
    if (!resolved) return;
    const { featureDir, featureName, workspaceRoot } = resolved;

    const ctrlNameInput = await vscode.window.showInputBox({
      prompt: `Enter controller name for feature '${featureName}' (e.g. ${featureName}, admin, session)`,
      placeHolder: featureName,
    });
    if (!ctrlNameInput) return;

    const baseName = ctrlNameInput.trim().replace(/\.controller\.ts$/, '').replace(/\.ts$/, '');
    const nameCheck = validateSafeFileName(baseName);
    if (!nameCheck.valid) {
      vscode.window.showErrorMessage(`Invalid controller name: ${nameCheck.error}`);
      return;
    }

    const conventions = getConventions(workspaceRoot);
    const defaultTemplatesDir = path.join(context.extensionUri.fsPath, 'dist', 'templates');
    const customTemplatesDir = path.join(workspaceRoot, '.nest-forge', 'templates');
    const renderer = new TemplateRenderer(defaultTemplatesDir, customTemplatesDir);

    const ctrlNames = deriveNames(baseName);
    const featureNames = deriveNames(featureName);

    const controllersDir = path.join(featureDir, 'controllers');
    const rootController = path.join(featureDir, `${featureNames.kebab}.controller.ts`);
    const useSubfolder = fs.existsSync(controllersDir) || fs.existsSync(rootController);

    const targetDir = useSubfolder ? controllersDir : featureDir;
    const targetFile = path.join(targetDir, `${baseName}.controller.ts`);
    const pathCheck = validateWorkspacePath(workspaceRoot, targetFile);
    if (!pathCheck.valid) {
      vscode.window.showErrorMessage(`Invalid file path: ${pathCheck.error}`);
      return;
    }

    if (fs.existsSync(targetFile)) {
      vscode.window.showWarningMessage(`Controller already exists at ${path.relative(workspaceRoot, targetFile)}`);
      return;
    }

    if (useSubfolder) {
      fs.mkdirSync(controllersDir, { recursive: true });
    }

    // Try to find a matching service in feature
    let serviceFile = path.join(featureDir, `${baseName}.service.ts`);
    if (!fs.existsSync(serviceFile)) {
      serviceFile = path.join(featureDir, 'services', `${baseName}.service.ts`);
    }
    if (!fs.existsSync(serviceFile)) {
      serviceFile = path.join(featureDir, `${featureNames.kebab}.service.ts`);
    }
    if (!fs.existsSync(serviceFile)) {
      serviceFile = path.join(featureDir, 'services', `${featureNames.kebab}.service.ts`);
    }

    const serviceExists = fs.existsSync(serviceFile);
    const srvNames = serviceExists ? deriveNames(path.basename(serviceFile).replace(/\.service\.ts$/, '')) : featureNames;
    const srvClass = `${srvNames.pascal}Service`;
    const srvImport = serviceExists ? computeRelativeImport(targetFile, serviceFile, conventions.importExtension) : undefined;
    const srvParam = conventions.paramStyle === 'snake_case' ? `${srvNames.snake}_service` : `${srvNames.camel}Service`;

    const content = renderer.render('controller', {
      names: featureNames,
      conventions,
      controllerClassName: `${ctrlNames.pascal}Controller`,
      routePath: ctrlNames.kebab === featureNames.kebab ? featureNames.pluralKebab : `${featureNames.pluralKebab}/${ctrlNames.kebab}`,
      serviceClassName: serviceExists ? srvClass : undefined,
      serviceImportPath: srvImport,
      serviceParamName: srvParam,
    });

    fs.writeFileSync(targetFile, content, 'utf-8');

    // Auto-wire into module
    const moduleFile = path.join(featureDir, `${featureNames.kebab}.module.ts`);
    const filesToFormat = [targetFile];
    if (fs.existsSync(moduleFile)) {
      wireComponentIntoModule({
        modulePath: moduleFile,
        className: `${ctrlNames.pascal}Controller`,
        importPath: computeRelativeImport(moduleFile, targetFile, conventions.importExtension),
        targetArrays: ['controllers'],
      });
      filesToFormat.push(moduleFile);
    }

    await formatFiles(filesToFormat, workspaceRoot, conventions.formatter);

    treeProvider.refresh();
    const doc = await vscode.workspace.openTextDocument(targetFile);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`Created Controller: ${path.relative(featureDir, targetFile)}`);
  });

  // 11. Add Service command
  const addServiceCommand = vscode.commands.registerCommand('nestForge.addService', async (arg?: vscode.Uri | FeatureTreeItem) => {
    const resolved = await resolveFeatureDir(arg);
    if (!resolved) return;
    const { featureDir, featureName, workspaceRoot } = resolved;

    const srvNameInput = await vscode.window.showInputBox({
      prompt: `Enter service name for feature '${featureName}' (e.g. ${featureName}, token, session)`,
      placeHolder: featureName,
    });
    if (!srvNameInput) return;

    const baseName = srvNameInput.trim().replace(/\.service\.ts$/, '').replace(/\.ts$/, '');
    const nameCheck = validateSafeFileName(baseName);
    if (!nameCheck.valid) {
      vscode.window.showErrorMessage(`Invalid service name: ${nameCheck.error}`);
      return;
    }

    const conventions = getConventions(workspaceRoot);
    const defaultTemplatesDir = path.join(context.extensionUri.fsPath, 'dist', 'templates');
    const customTemplatesDir = path.join(workspaceRoot, '.nest-forge', 'templates');
    const renderer = new TemplateRenderer(defaultTemplatesDir, customTemplatesDir);

    const srvNames = deriveNames(baseName);
    const featureNames = deriveNames(featureName);

    const servicesDir = path.join(featureDir, 'services');
    const rootService = path.join(featureDir, `${featureNames.kebab}.service.ts`);
    const useSubfolder = fs.existsSync(servicesDir) || fs.existsSync(rootService);

    const targetDir = useSubfolder ? servicesDir : featureDir;
    const targetFile = path.join(targetDir, `${baseName}.service.ts`);
    const pathCheck = validateWorkspacePath(workspaceRoot, targetFile);
    if (!pathCheck.valid) {
      vscode.window.showErrorMessage(`Invalid file path: ${pathCheck.error}`);
      return;
    }

    if (fs.existsSync(targetFile)) {
      vscode.window.showWarningMessage(`Service already exists at ${path.relative(workspaceRoot, targetFile)}`);
      return;
    }

    if (useSubfolder) {
      fs.mkdirSync(servicesDir, { recursive: true });
    }

    const content = renderer.render('service', {
      names: featureNames,
      conventions,
      serviceClassName: `${srvNames.pascal}Service`,
      state: { includeRepository: false },
    });
    fs.writeFileSync(targetFile, content, 'utf-8');

    // Create co-located unit test spec
    const specFile = path.join(targetDir, `${baseName}.service.spec.ts`);
    const filesToFormat = [targetFile];

    try {
      const specContent = renderer.render('spec', {
        names: featureNames,
        conventions,
        targetClass: `${srvNames.pascal}Service`,
        targetFileName: `${baseName}.service.ts`,
        specType: 'Service',
        state: { includeRepository: false },
      });
      fs.writeFileSync(specFile, specContent, 'utf-8');
      filesToFormat.push(specFile);
    } catch {
      // Ignore if spec fails
    }

    // Auto-wire into module
    const moduleFile = path.join(featureDir, `${featureNames.kebab}.module.ts`);
    if (fs.existsSync(moduleFile)) {
      wireComponentIntoModule({
        modulePath: moduleFile,
        className: `${srvNames.pascal}Service`,
        importPath: computeRelativeImport(moduleFile, targetFile, conventions.importExtension),
        targetArrays: ['providers', 'exports'],
      });
      filesToFormat.push(moduleFile);
    }

    await formatFiles(filesToFormat, workspaceRoot, conventions.formatter);

    treeProvider.refresh();
    const doc = await vscode.workspace.openTextDocument(targetFile);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`Created Service: ${path.relative(featureDir, targetFile)}`);
  });

  // 12. Add Provider command
  const addProviderCommand = vscode.commands.registerCommand('nestForge.addProvider', async (arg?: vscode.Uri | FeatureTreeItem) => {
    const resolved = await resolveFeatureDir(arg);
    if (!resolved) return;
    const { featureDir, featureName, workspaceRoot } = resolved;

    const input = await vscode.window.showInputBox({
      prompt: `Enter provider/handler name for '${featureName}' (e.g. session-auth, email-verification)`,
      placeHolder: `session-auth`,
    });
    if (!input) return;

    let raw = input.trim();
    let kind: 'handler' | 'provider' = 'provider';
    if (raw.endsWith('.handler.ts') || raw.endsWith('.handler') || raw.endsWith('-handler')) {
      kind = 'handler';
      raw = raw.replace(/\.handler\.ts$/, '').replace(/\.handler$/, '').replace(/-handler$/, '');
    } else if (raw.endsWith('.provider.ts') || raw.endsWith('.provider') || raw.endsWith('-provider')) {
      kind = 'provider';
      raw = raw.replace(/\.provider\.ts$/, '').replace(/\.provider$/, '').replace(/-provider$/, '');
    } else {
      raw = raw.replace(/\.ts$/, '');
    }

    const nameCheck = validateSafeFileName(raw);
    if (!nameCheck.valid) {
      vscode.window.showErrorMessage(`Invalid name: ${nameCheck.error}`);
      return;
    }

    const conventions = getConventions(workspaceRoot);
    const defaultTemplatesDir = path.join(context.extensionUri.fsPath, 'dist', 'templates');
    const customTemplatesDir = path.join(workspaceRoot, '.nest-forge', 'templates');
    const renderer = new TemplateRenderer(defaultTemplatesDir, customTemplatesDir);

    const featureNames = deriveNames(featureName);
    const itemNames = deriveNames(raw);
    const className = kind === 'handler' ? `${itemNames.pascal}Handler` : `${itemNames.pascal}Provider`;
    const fileName = kind === 'handler' ? `${itemNames.kebab}.handler.ts` : `${itemNames.kebab}.provider.ts`;

    const providersDir = path.join(featureDir, 'providers');
    const targetFile = path.join(providersDir, fileName);
    const pathCheck = validateWorkspacePath(workspaceRoot, targetFile);
    if (!pathCheck.valid) {
      vscode.window.showErrorMessage(`Invalid file path: ${pathCheck.error}`);
      return;
    }

    if (fs.existsSync(targetFile)) {
      vscode.window.showWarningMessage(`File already exists at ${path.relative(workspaceRoot, targetFile)}`);
      return;
    }

    fs.mkdirSync(providersDir, { recursive: true });
    const content = renderer.render('provider', {
      names: featureNames,
      conventions,
      providerClassName: className,
    });
    fs.writeFileSync(targetFile, content, 'utf-8');

    // Auto-wire into module
    const moduleFile = path.join(featureDir, `${featureNames.kebab}.module.ts`);
    const filesToFormat = [targetFile];
    if (fs.existsSync(moduleFile)) {
      wireComponentIntoModule({
        modulePath: moduleFile,
        className,
        importPath: computeRelativeImport(moduleFile, targetFile, conventions.importExtension),
        targetArrays: ['providers'],
      });
      filesToFormat.push(moduleFile);
    }

    await formatFiles(filesToFormat, workspaceRoot, conventions.formatter);

    treeProvider.refresh();
    const doc = await vscode.workspace.openTextDocument(targetFile);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`Created Provider: providers/${fileName}`);
  });

  // 13. Add Store command
  const addStoreCommand = vscode.commands.registerCommand('nestForge.addStore', async (arg?: vscode.Uri | FeatureTreeItem) => {
    const resolved = await resolveFeatureDir(arg);
    if (!resolved) return;
    const { featureDir, featureName, workspaceRoot } = resolved;

    const input = await vscode.window.showInputBox({
      prompt: `Enter store name for '${featureName}' (e.g. drizzle-session, token, cache)`,
      placeHolder: `drizzle-${featureName}`,
    });
    if (!input) return;

    const raw = input.trim().replace(/\.store\.ts$/, '').replace(/\.store$/, '').replace(/-store$/, '').replace(/\.ts$/, '');
    const nameCheck = validateSafeFileName(raw);
    if (!nameCheck.valid) {
      vscode.window.showErrorMessage(`Invalid store name: ${nameCheck.error}`);
      return;
    }

    const conventions = getConventions(workspaceRoot);
    const defaultTemplatesDir = path.join(context.extensionUri.fsPath, 'dist', 'templates');
    const customTemplatesDir = path.join(workspaceRoot, '.nest-forge', 'templates');
    const renderer = new TemplateRenderer(defaultTemplatesDir, customTemplatesDir);

    const featureNames = deriveNames(featureName);
    const itemNames = deriveNames(raw);
    const className = `${itemNames.pascal}Store`;
    const fileName = `${itemNames.kebab}.store.ts`;

    const storesDir = path.join(featureDir, 'stores');
    const targetFile = path.join(storesDir, fileName);
    const pathCheck = validateWorkspacePath(workspaceRoot, targetFile);
    if (!pathCheck.valid) {
      vscode.window.showErrorMessage(`Invalid file path: ${pathCheck.error}`);
      return;
    }

    if (fs.existsSync(targetFile)) {
      vscode.window.showWarningMessage(`Store already exists at ${path.relative(workspaceRoot, targetFile)}`);
      return;
    }

    fs.mkdirSync(storesDir, { recursive: true });
    const content = renderer.render('store', {
      names: featureNames,
      conventions,
      storeClassName: className,
    });
    fs.writeFileSync(targetFile, content, 'utf-8');

    // Auto-wire into module
    const moduleFile = path.join(featureDir, `${featureNames.kebab}.module.ts`);
    const filesToFormat = [targetFile];
    if (fs.existsSync(moduleFile)) {
      wireComponentIntoModule({
        modulePath: moduleFile,
        className,
        importPath: computeRelativeImport(moduleFile, targetFile, conventions.importExtension),
        targetArrays: ['providers', 'exports'],
      });
      filesToFormat.push(moduleFile);
    }

    await formatFiles(filesToFormat, workspaceRoot, conventions.formatter);

    treeProvider.refresh();
    const doc = await vscode.workspace.openTextDocument(targetFile);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`Created Store: stores/${fileName}`);
  });

  // 14. Add Policy command
  const addPolicyCommand = vscode.commands.registerCommand('nestForge.addPolicy', async (arg?: vscode.Uri | FeatureTreeItem) => {
    const resolved = await resolveFeatureDir(arg);
    if (!resolved) return;
    const { featureDir, featureName, workspaceRoot } = resolved;

    const input = await vscode.window.showInputBox({
      prompt: `Enter policy name for '${featureName}' (e.g. ${featureName}, admin, role)`,
      placeHolder: featureName,
    });
    if (!input) return;

    const raw = input.trim().replace(/\.policy\.ts$/, '').replace(/\.policy$/, '').replace(/-policy$/, '').replace(/\.ts$/, '');
    const nameCheck = validateSafeFileName(raw);
    if (!nameCheck.valid) {
      vscode.window.showErrorMessage(`Invalid policy name: ${nameCheck.error}`);
      return;
    }

    const conventions = getConventions(workspaceRoot);
    const defaultTemplatesDir = path.join(context.extensionUri.fsPath, 'dist', 'templates');
    const customTemplatesDir = path.join(workspaceRoot, '.nest-forge', 'templates');
    const renderer = new TemplateRenderer(defaultTemplatesDir, customTemplatesDir);

    const featureNames = deriveNames(featureName);
    const itemNames = deriveNames(raw);
    const className = `${itemNames.pascal}Policy`;
    const fileName = `${itemNames.kebab}.policy.ts`;

    const policiesDir = path.join(featureDir, 'policies');
    const targetDir = fs.existsSync(policiesDir) ? policiesDir : featureDir;
    const targetFile = path.join(targetDir, fileName);
    const pathCheck = validateWorkspacePath(workspaceRoot, targetFile);
    if (!pathCheck.valid) {
      vscode.window.showErrorMessage(`Invalid file path: ${pathCheck.error}`);
      return;
    }

    if (fs.existsSync(targetFile)) {
      vscode.window.showWarningMessage(`Policy already exists at ${path.relative(workspaceRoot, targetFile)}`);
      return;
    }

    const content = renderer.render('policy', {
      names: featureNames,
      conventions,
      policyClassName: className,
    });
    fs.writeFileSync(targetFile, content, 'utf-8');

    // Auto-wire into module
    const moduleFile = path.join(featureDir, `${featureNames.kebab}.module.ts`);
    const filesToFormat = [targetFile];
    if (fs.existsSync(moduleFile)) {
      wireComponentIntoModule({
        modulePath: moduleFile,
        className,
        importPath: computeRelativeImport(moduleFile, targetFile, conventions.importExtension),
        targetArrays: ['providers'],
      });
      filesToFormat.push(moduleFile);
    }

    await formatFiles(filesToFormat, workspaceRoot, conventions.formatter);

    treeProvider.refresh();
    const doc = await vscode.workspace.openTextDocument(targetFile);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`Created Policy: ${path.relative(featureDir, targetFile)}`);
  });

  // 15. Add BullMQ Processor command
  const addProcessorCommand = vscode.commands.registerCommand('nestForge.addProcessor', async (arg?: vscode.Uri | FeatureTreeItem) => {
    const resolved = await resolveFeatureDir(arg);
    if (!resolved) return;
    const { featureDir, featureName, workspaceRoot } = resolved;

    const input = await vscode.window.showInputBox({
      prompt: `Enter processor/queue name for '${featureName}' (e.g. email, report, notification)`,
      placeHolder: `email`,
    });
    if (!input) return;

    const raw = input.trim().replace(/\.processor\.ts$/, '').replace(/\.processor$/, '').replace(/-processor$/, '').replace(/\.ts$/, '');
    const nameCheck = validateSafeFileName(raw);
    if (!nameCheck.valid) {
      vscode.window.showErrorMessage(`Invalid processor name: ${nameCheck.error}`);
      return;
    }

    const conventions = getConventions(workspaceRoot);
    const defaultTemplatesDir = path.join(context.extensionUri.fsPath, 'dist', 'templates');
    const customTemplatesDir = path.join(workspaceRoot, '.nest-forge', 'templates');
    const renderer = new TemplateRenderer(defaultTemplatesDir, customTemplatesDir);

    const featureNames = deriveNames(featureName);
    const itemNames = deriveNames(raw);
    const processorClassName = `${itemNames.pascal}Processor`;
    const queueName = itemNames.kebab;
    const fileName = `${itemNames.kebab}.processor.ts`;

    const processorsDir = path.join(featureDir, 'processors');
    const targetFile = path.join(processorsDir, fileName);
    const pathCheck = validateWorkspacePath(workspaceRoot, targetFile);
    if (!pathCheck.valid) {
      vscode.window.showErrorMessage(`Invalid file path: ${pathCheck.error}`);
      return;
    }

    if (fs.existsSync(targetFile)) {
      vscode.window.showWarningMessage(`Processor already exists at ${path.relative(workspaceRoot, targetFile)}`);
      return;
    }

    fs.mkdirSync(processorsDir, { recursive: true });
    const content = renderer.render('processor', {
      names: featureNames,
      conventions,
      processorClassName,
      queueName,
    });
    fs.writeFileSync(targetFile, content, 'utf-8');

    // Auto-wire into module
    const moduleFile = path.join(featureDir, `${featureNames.kebab}.module.ts`);
    const filesToFormat = [targetFile];
    if (fs.existsSync(moduleFile)) {
      wireComponentIntoModule({
        modulePath: moduleFile,
        className: processorClassName,
        importPath: computeRelativeImport(moduleFile, targetFile, conventions.importExtension),
        targetArrays: ['providers'],
      });
      filesToFormat.push(moduleFile);
    }

    await formatFiles(filesToFormat, workspaceRoot, conventions.formatter);

    treeProvider.refresh();
    const doc = await vscode.workspace.openTextDocument(targetFile);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`Created Processor: processors/${fileName}`);
  });

  // 16. Add Scheduled Task (Cron) command
  const addTaskCommand = vscode.commands.registerCommand('nestForge.addTask', async (arg?: vscode.Uri | FeatureTreeItem) => {
    const resolved = await resolveFeatureDir(arg);
    if (!resolved) return;
    const { featureDir, featureName, workspaceRoot } = resolved;

    const input = await vscode.window.showInputBox({
      prompt: `Enter task name for '${featureName}' (e.g. sync, cleanup, health-check)`,
      placeHolder: `sync`,
    });
    if (!input) return;

    const raw = input.trim().replace(/\.task\.ts$/, '').replace(/\.task$/, '').replace(/-task$/, '').replace(/\.ts$/, '');
    const nameCheck = validateSafeFileName(raw);
    if (!nameCheck.valid) {
      vscode.window.showErrorMessage(`Invalid task name: ${nameCheck.error}`);
      return;
    }

    const conventions = getConventions(workspaceRoot);
    const defaultTemplatesDir = path.join(context.extensionUri.fsPath, 'dist', 'templates');
    const customTemplatesDir = path.join(workspaceRoot, '.nest-forge', 'templates');
    const renderer = new TemplateRenderer(defaultTemplatesDir, customTemplatesDir);

    const featureNames = deriveNames(featureName);
    const itemNames = deriveNames(raw);
    const taskClassName = `${itemNames.pascal}Task`;
    const fileName = `${itemNames.kebab}.task.ts`;

    const tasksDir = path.join(featureDir, 'tasks');
    const targetFile = path.join(tasksDir, fileName);
    const pathCheck = validateWorkspacePath(workspaceRoot, targetFile);
    if (!pathCheck.valid) {
      vscode.window.showErrorMessage(`Invalid file path: ${pathCheck.error}`);
      return;
    }

    if (fs.existsSync(targetFile)) {
      vscode.window.showWarningMessage(`Task already exists at ${path.relative(workspaceRoot, targetFile)}`);
      return;
    }

    fs.mkdirSync(tasksDir, { recursive: true });
    const content = renderer.render('task', {
      names: featureNames,
      conventions,
      taskClassName,
    });
    fs.writeFileSync(targetFile, content, 'utf-8');

    // Auto-wire into module
    const moduleFile = path.join(featureDir, `${featureNames.kebab}.module.ts`);
    const filesToFormat = [targetFile];
    if (fs.existsSync(moduleFile)) {
      wireComponentIntoModule({
        modulePath: moduleFile,
        className: taskClassName,
        importPath: computeRelativeImport(moduleFile, targetFile, conventions.importExtension),
        targetArrays: ['providers'],
      });
      filesToFormat.push(moduleFile);
    }

    await formatFiles(filesToFormat, workspaceRoot, conventions.formatter);

    treeProvider.refresh();
    const doc = await vscode.workspace.openTextDocument(targetFile);
    await vscode.window.showTextDocument(doc);
    vscode.window.showInformationMessage(`Created Scheduled Task: tasks/${fileName}`);
  });

  // 17. Add i18n Translation Catalog command
  const addI18nCatalogCommand = vscode.commands.registerCommand(
    'nestForge.addI18nCatalog',
    async (arg?: vscode.Uri | FeatureTreeItem) => {
      const resolved = await resolveFeatureDir(arg);
      if (!resolved) return;
      const { featureName, workspaceRoot } = resolved;

      const conventions = getConventions(workspaceRoot);
      const featureNames = deriveNames(featureName);
      const i18nRelDir = conventions.i18nDir || 'src/i18n';
      const i18nDirAbs = path.isAbsolute(i18nRelDir)
        ? i18nRelDir
        : path.join(workspaceRoot, i18nRelDir);

      const enDir = path.join(i18nDirAbs, 'en');
      const arDir = path.join(i18nDirAbs, 'ar');
      fs.mkdirSync(enDir, { recursive: true });
      fs.mkdirSync(arDir, { recursive: true });

      const enFile = path.join(enDir, `${featureNames.kebab}.json`);
      const arFile = path.join(arDir, `${featureNames.kebab}.json`);

      const defaultTemplatesDir = path.join(context.extensionUri.fsPath, 'dist', 'templates');
      const customTemplatesDir = path.join(workspaceRoot, '.nest-forge', 'templates');
      const renderer = new TemplateRenderer(defaultTemplatesDir, customTemplatesDir);

      const featureTitleEn = featureNames.pascal.replace(/([a-z])([A-Z])/g, '$1 $2');
      if (!fs.existsSync(enFile)) {
        const enContent = renderer.render('i18n-en', { names: featureNames, featureTitleEn });
        fs.writeFileSync(enFile, enContent, 'utf-8');
      }
      if (!fs.existsSync(arFile)) {
        const arContent = renderer.render('i18n-ar', { names: featureNames, featureTitleEn });
        fs.writeFileSync(arFile, arContent, 'utf-8');
      }

      await i18nTypeGen.generate();
      i18nStore.reload();

      const doc = await vscode.workspace.openTextDocument(enFile);
      await vscode.window.showTextDocument(doc);
      vscode.window.showInformationMessage(
        `Created i18n translation catalogs for '${featureName}' in ${path.relative(workspaceRoot, i18nDirAbs)}/!`,
      );
    },
  );

  // 18. Inject Into... command
  const injectIntoCommand = vscode.commands.registerCommand('nestForge.injectInto', async (arg?: vscode.Uri | FeatureTreeItem) => {
    let sourceUri: vscode.Uri | undefined;
    if (arg instanceof vscode.Uri) {
      sourceUri = arg;
    } else if (arg && arg.resourceUri instanceof vscode.Uri) {
      sourceUri = arg.resourceUri;
    } else if (vscode.window.activeTextEditor) {
      sourceUri = vscode.window.activeTextEditor.document.uri;
    }

    if (!sourceUri) {
      vscode.window.showErrorMessage('Nest Forge: No file selected to inject.');
      return;
    }

    const sourcePath = sourceUri.fsPath;
    const folder = await resolveWorkspaceFolder(sourceUri);
    if (!folder) {
      vscode.window.showErrorMessage('Nest Forge: No workspace open.');
      return;
    }
    const workspaceRoot = folder.uri.fsPath;
    const conventions = getConventions(workspaceRoot);

    const sourceClassInfo = extractExportedClassInfo(sourcePath);
    if (!sourceClassInfo) {
      vscode.window.showErrorMessage('Nest Forge: Could not find an exported class to inject in the selected file.');
      return;
    }

    const resolved = await resolveFeatureDir(sourceUri);
    if (!resolved) return;
    const { featureDir } = resolved;

    function findCandidateFiles(dir: string): string[] {
      const results: string[] = [];
      if (!fs.existsSync(dir)) return results;
      const entries = fs.readdirSync(dir, { withFileTypes: true });
      for (const entry of entries) {
        const full = path.join(dir, entry.name);
        if (entry.isDirectory()) {
          results.push(...findCandidateFiles(full));
        } else if (
          entry.name.endsWith('.ts') &&
          !entry.name.endsWith('.spec.ts') &&
          !entry.name.endsWith('.module.ts') &&
          !entry.name.endsWith('.interface.ts') &&
          !entry.name.endsWith('.dto.ts') &&
          !entry.name.endsWith('.event.ts') &&
          full !== sourcePath
        ) {
          results.push(full);
        }
      }
      return results;
    }

    const candidateFiles = findCandidateFiles(featureDir);
    interface TargetPickItem extends vscode.QuickPickItem {
      targetFile: string;
      targetClassName: string;
    }
    const picks: TargetPickItem[] = [];

    for (const f of candidateFiles) {
      const info = extractExportedClassInfo(f);
      if (info) {
        picks.push({
          label: info.className,
          description: path.relative(featureDir, f),
          targetFile: f,
          targetClassName: info.className,
        });
      }
    }

    if (picks.length === 0) {
      vscode.window.showInformationMessage('Nest Forge: No eligible recipient classes found in this feature.');
      return;
    }

    const selected = await vscode.window.showQuickPick(picks, {
      placeHolder: `Select classes to inject ${sourceClassInfo.className} into:`,
      canPickMany: true,
    });

    if (!selected || selected.length === 0) return;

    const names = deriveNames(sourceClassInfo.className);
    const paramName = conventions.paramStyle === 'snake_case' ? names.snake : names.camel;

    const filesToFormat: string[] = [];
    for (const item of selected) {
      const relImport = computeRelativeImport(item.targetFile, sourcePath, conventions.importExtension);
      injectDependencyIntoClass({
        targetFilePath: item.targetFile,
        targetClassName: item.targetClassName,
        dependencyClassName: sourceClassInfo.className,
        importPath: relImport,
        paramName,
      });
      filesToFormat.push(item.targetFile);
    }

    await formatFiles(filesToFormat, workspaceRoot, conventions.formatter);

    if (selected.length === 1) {
      const doc = await vscode.workspace.openTextDocument(selected[0].targetFile);
      await vscode.window.showTextDocument(doc);
    }

    vscode.window.showInformationMessage(
      `Successfully injected ${sourceClassInfo.className} into ${selected.length} class(es).`,
    );
  });

  // 18. Wire File Into Module command (Quick Fix)
  const wireFileIntoModuleCommand = vscode.commands.registerCommand(
    'nestForge.wireFileIntoModule',
    async (arg?: vscode.Uri | FeatureTreeItem) => {
      let targetUri: vscode.Uri | undefined;
      if (arg instanceof vscode.Uri) {
        targetUri = arg;
      } else if (arg && arg.resourceUri instanceof vscode.Uri) {
        targetUri = arg.resourceUri;
      } else if (vscode.window.activeTextEditor) {
        targetUri = vscode.window.activeTextEditor.document.uri;
      }

      if (!targetUri) {
        vscode.window.showErrorMessage('Nest Forge: No file selected to wire.');
        return;
      }

      const filePath = targetUri.fsPath;
      const folder = await resolveWorkspaceFolder(targetUri);
      if (!folder) {
        vscode.window.showErrorMessage('Nest Forge: No workspace open.');
        return;
      }
      const workspaceRoot = folder.uri.fsPath;
      const conventions = getConventions(workspaceRoot);

      const classInfo = extractExportedClassInfo(filePath);
      if (!classInfo) {
        vscode.window.showErrorMessage('Nest Forge: No exported class found in file.');
        return;
      }

      const resolved = await resolveFeatureDir(targetUri);
      if (!resolved) return;
      const { featureDir, featureName } = resolved;

      const moduleFile = path.join(featureDir, `${deriveNames(featureName).kebab}.module.ts`);
      const fallbackModuleFile = fs.existsSync(moduleFile)
        ? moduleFile
        : fs.readdirSync(featureDir).find((e) => e.endsWith('.module.ts'))
        ? path.join(featureDir, fs.readdirSync(featureDir).find((e) => e.endsWith('.module.ts'))!)
        : null;

      if (!fallbackModuleFile || !fs.existsSync(fallbackModuleFile)) {
        vscode.window.showErrorMessage(`Nest Forge: Feature module not found in ${path.relative(workspaceRoot, featureDir)}`);
        return;
      }

      const kind = detectComponentKind(path.basename(filePath));
      let targetArrays: Array<'controllers' | 'providers' | 'exports'> = ['providers'];
      if (kind === 'controller') {
        targetArrays = ['controllers'];
      } else if (kind === 'service' || kind === 'store' || kind === 'repository') {
        targetArrays = ['providers', 'exports'];
      }

      wireComponentIntoModule({
        modulePath: fallbackModuleFile,
        className: classInfo.className,
        importPath: computeRelativeImport(fallbackModuleFile, filePath, conventions.importExtension),
        targetArrays,
      });

      await formatFiles([fallbackModuleFile], workspaceRoot, conventions.formatter);
      treeProvider.refresh();
      vscode.window.showInformationMessage(
        `Wired ${classInfo.className} into ${path.basename(fallbackModuleFile)} (${targetArrays.join(', ')})!`,
      );
    },
  );

  // 19. Generate Spec for File command (Quick Fix)
  const generateSpecForFileCommand = vscode.commands.registerCommand(
    'nestForge.generateSpecForFile',
    async (arg?: vscode.Uri | FeatureTreeItem) => {
      let targetUri: vscode.Uri | undefined;
      if (arg instanceof vscode.Uri) {
        targetUri = arg;
      } else if (arg && arg.resourceUri instanceof vscode.Uri) {
        targetUri = arg.resourceUri;
      } else if (vscode.window.activeTextEditor) {
        targetUri = vscode.window.activeTextEditor.document.uri;
      }

      if (!targetUri) {
        vscode.window.showErrorMessage('Nest Forge: No file selected to generate spec for.');
        return;
      }

      const filePath = targetUri.fsPath;
      const folder = await resolveWorkspaceFolder(targetUri);
      if (!folder) {
        vscode.window.showErrorMessage('Nest Forge: No workspace open.');
        return;
      }
      const workspaceRoot = folder.uri.fsPath;
      const conventions = getConventions(workspaceRoot);

      const classInfo = extractExportedClassInfo(filePath);
      if (!classInfo) {
        vscode.window.showErrorMessage('Nest Forge: No exported class found in file.');
        return;
      }

      const kind = detectComponentKind(path.basename(filePath));
      const specType = kind === 'controller' ? 'Controller' : 'Service';

      const specFile = filePath.replace(/\.ts$/, '.spec.ts');
      if (fs.existsSync(specFile)) {
        vscode.window.showWarningMessage(`Spec file already exists: ${path.basename(specFile)}`);
        return;
      }

      const resolved = await resolveFeatureDir(targetUri);
      const featureName = resolved?.featureName || path.basename(path.dirname(filePath));
      const featureNames = deriveNames(featureName);

      const defaultTemplatesDir = path.join(context.extensionUri.fsPath, 'dist', 'templates');
      const customTemplatesDir = path.join(workspaceRoot, '.nest-forge', 'templates');
      const renderer = new TemplateRenderer(defaultTemplatesDir, customTemplatesDir);

      const content = renderer.render('spec', {
        names: featureNames,
        conventions,
        targetClass: classInfo.className,
        targetFileName: path.basename(filePath),
        specType,
        state: { includeRepository: false },
      });

      fs.writeFileSync(specFile, content, 'utf-8');
      await formatFiles([specFile], workspaceRoot, conventions.formatter);

      treeProvider.refresh();
      const doc = await vscode.workspace.openTextDocument(specFile);
      await vscode.window.showTextDocument(doc);
      vscode.window.showInformationMessage(`Generated unit test spec: ${path.basename(specFile)}`);
    },
  );

  // 20. Rename Feature command
  const renameFeatureCommand = vscode.commands.registerCommand(
    'nestForge.renameFeature',
    async (arg?: vscode.Uri | FeatureTreeItem) => {
      const resolved = await resolveFeatureDir(arg);
      if (!resolved) return;
      const { featureDir, featureName, workspaceRoot } = resolved;

      const newNameInput = await vscode.window.showInputBox({
        prompt: `Enter new name for feature '${featureName}':`,
        value: featureName,
      });
      if (!newNameInput || newNameInput.trim() === featureName) return;

      const newFeatureName = newNameInput.trim();
      const nameCheck = validateSafeFileName(newFeatureName);
      if (!nameCheck.valid) {
        vscode.window.showErrorMessage(`Invalid feature name: ${nameCheck.error}`);
        return;
      }

      const targetDir = path.join(path.dirname(featureDir), newFeatureName);
      if (fs.existsSync(targetDir)) {
        vscode.window.showErrorMessage(`Feature directory '${newFeatureName}' already exists.`);
        return;
      }

      const conventions = getConventions(workspaceRoot);
      const parentModulePath = path.isAbsolute(conventions.parentModule)
        ? conventions.parentModule
        : path.join(workspaceRoot, conventions.parentModule);

      const i18nDir = i18nStore.getI18nDirectory() || undefined;

      renameFeature({
        featureDir,
        newFeatureName,
        parentModulePath: fs.existsSync(parentModulePath) ? parentModulePath : undefined,
        conventions,
        i18nDir,
      });

      if (fs.existsSync(parentModulePath)) {
        await formatFiles([parentModulePath], workspaceRoot, conventions.formatter);
      }

      await i18nTypeGen.generate();
      i18nStore.reload();
      treeProvider.refresh();
      vscode.window.showInformationMessage(`Renamed feature '${featureName}' to '${newFeatureName}'.`);
    },
  );

  // 21. Delete Feature command
  const deleteFeatureCommand = vscode.commands.registerCommand(
    'nestForge.deleteFeature',
    async (arg?: vscode.Uri | FeatureTreeItem) => {
      const resolved = await resolveFeatureDir(arg);
      if (!resolved) return;
      const { featureDir, featureName, workspaceRoot } = resolved;

      const confirm = await vscode.window.showWarningMessage(
        `Are you sure you want to delete feature '${featureName}'? This will unregister it from parent module and delete all feature files.`,
        { modal: true },
        'Delete Feature',
      );
      if (confirm !== 'Delete Feature') return;

      const conventions = getConventions(workspaceRoot);
      const parentModulePath = path.isAbsolute(conventions.parentModule)
        ? conventions.parentModule
        : path.join(workspaceRoot, conventions.parentModule);

      const i18nDir = i18nStore.getI18nDirectory() || undefined;

      deleteFeature({
        featureDir,
        parentModulePath: fs.existsSync(parentModulePath) ? parentModulePath : undefined,
        i18nDir,
      });

      if (fs.existsSync(parentModulePath)) {
        await formatFiles([parentModulePath], workspaceRoot, conventions.formatter);
      }

      await i18nTypeGen.generate();
      i18nStore.reload();
      treeProvider.refresh();
      vscode.window.showInformationMessage(`Deleted feature '${featureName}' and unwired from parent module.`);
    },
  );

  // 22. Status Bar Item
  const statusBarItem = vscode.window.createStatusBarItem(
    vscode.StatusBarAlignment.Left,
    100,
  );
  statusBarItem.command = 'nestForge.newFeature';
  statusBarItem.text = '$(layers) Nest Forge';
  statusBarItem.tooltip = 'Nest Forge: Scaffold NestJS Feature Module';
  statusBarItem.show();

  // Watch features directory across workspaces for automatic tree refresh
  if (vscode.workspace.workspaceFolders && vscode.workspace.workspaceFolders.length > 0) {
    const watcher = vscode.workspace.createFileSystemWatcher('**/src/features/**');
    watcher.onDidCreate(() => treeProvider.refresh());
    watcher.onDidDelete(() => treeProvider.refresh());
    context.subscriptions.push(watcher);
  }

  context.subscriptions.push(
    newFeatureCommand,
    refreshCommand,
    undoCommand,
    ejectCommand,
    addDtoCommand,
    addRepositoryCommand,
    addEventCommand,
    addListenerCommand,
    addControllerCommand,
    addServiceCommand,
    addProviderCommand,
    addStoreCommand,
    addPolicyCommand,
    addProcessorCommand,
    addTaskCommand,
    injectIntoCommand,
    wireFileIntoModuleCommand,
    generateSpecForFileCommand,
    renameFeatureCommand,
    deleteFeatureCommand,
    addI18nCatalogCommand,
    statusBarItem,
  );
}

export function deactivate() {
  if (FeatureFormPanel.currentPanel) {
    FeatureFormPanel.currentPanel.dispose();
  }
}

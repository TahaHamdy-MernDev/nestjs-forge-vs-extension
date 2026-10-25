import * as fs from 'node:fs';
import * as path from 'node:path';
import { deriveNames } from './naming.js';
import { registerInParentModule } from './module-registrar.js';
import { unregisterFromParentModule } from './module-unregistrar.js';
import { validateSafeFileName } from './path-validator.js';
import { computeFileHash, getLastScaffoldRecord, saveLastScaffoldRecord } from './scaffold-manifest.js';
import type { ProjectConventions } from './types.js';

export interface DeleteFeatureOptions {
  featureDir: string;
  parentModulePath?: string;
  i18nDir?: string;
}

export interface RenameFeatureOptions {
  featureDir: string;
  newFeatureName: string;
  parentModulePath?: string;
  conventions?: Partial<ProjectConventions>;
  i18nDir?: string;
  workspaceRoot?: string;
}

export function deleteFeature(options: DeleteFeatureOptions): { success: boolean; error?: string } {
  const { featureDir, parentModulePath } = options;

  if (!featureDir || !fs.existsSync(featureDir)) {
    return { success: false, error: 'Feature directory does not exist' };
  }

  try {
    const oldFeatureName = path.basename(featureDir);
    const oldNames = deriveNames(oldFeatureName);
    const moduleClassName = `${oldNames.pascal}Module`;

    // 1. Unregister from parent module
    if (parentModulePath && fs.existsSync(parentModulePath)) {
      unregisterFromParentModule({
        parentModulePath,
        featureModuleClassName: moduleClassName,
      });
    }

    // 2. Remove directory
    fs.rmSync(featureDir, { recursive: true, force: true });

    // 3. Remove i18n catalogs if present
    const { i18nDir } = options;
    if (i18nDir && fs.existsSync(i18nDir)) {
      try {
        const langDirs = fs.readdirSync(i18nDir, { withFileTypes: true });
        for (const ld of langDirs) {
          if (ld.isDirectory()) {
            const catalogFile = path.join(i18nDir, ld.name, `${oldNames.kebab}.json`);
            if (fs.existsSync(catalogFile)) {
              fs.unlinkSync(catalogFile);
            }
          }
        }
      } catch {
        // Ignore i18n deletion errors
      }
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

function getAllFilesRecursive(dir: string): string[] {
  const results: string[] = [];
  if (!fs.existsSync(dir)) return results;
  const list = fs.readdirSync(dir, { withFileTypes: true });
  for (const item of list) {
    const fullPath = path.join(dir, item.name);
    if (item.isDirectory()) {
      results.push(...getAllFilesRecursive(fullPath));
    } else {
      results.push(fullPath);
    }
  }
  return results;
}

function replaceWordBoundary(content: string, oldWord: string, newWord: string, isPascalOrCamel: boolean): string {
  if (!oldWord || oldWord === newWord) return content;
  const isPascal = /^[A-Z]/.test(oldWord);
  const beforeBoundary = isPascal ? '(?<![A-Z0-9])' : '(?<![a-zA-Z0-9])';
  const afterBoundary = isPascalOrCamel ? '(?![a-z0-9])' : '(?![a-zA-Z0-9])';
  const regex = new RegExp(`${beforeBoundary}${oldWord}${afterBoundary}`, 'g');
  return content.replace(regex, newWord);
}

function findWorkspaceRoot(startDir: string): string | null {
  try {
    let cur = path.resolve(startDir);
    while (cur && cur !== path.dirname(cur)) {
      if (fs.existsSync(path.join(cur, '.nest-forge-last.json')) || fs.existsSync(path.join(cur, 'package.json'))) {
        return cur;
      }
      cur = path.dirname(cur);
    }
  } catch {
    // Ignore error
  }
  return null;
}

export function renameFeature(options: RenameFeatureOptions): {
  success: boolean;
  newFeatureDir?: string;
  error?: string;
} {
  const { featureDir, newFeatureName, parentModulePath, conventions } = options;

  if (!featureDir || !fs.existsSync(featureDir)) {
    return { success: false, error: 'Feature directory does not exist' };
  }

  const nameCheck = validateSafeFileName(newFeatureName);
  if (!nameCheck.valid) {
    return { success: false, error: `Invalid feature name: ${nameCheck.error}` };
  }

  const oldFeatureName = path.basename(featureDir);
  const oldNames = deriveNames(oldFeatureName);
  const newNames = deriveNames(newFeatureName);

  if (oldNames.kebab === newNames.kebab) {
    return { success: true, newFeatureDir: featureDir };
  }

  const parentDir = path.dirname(featureDir);
  const newFeatureDir = path.join(parentDir, newNames.kebab);

  if (fs.existsSync(newFeatureDir)) {
    return { success: false, error: `Target directory already exists at ${newFeatureDir}` };
  }

  try {
    // 1. Unregister old module from parentModule if present
    if (parentModulePath && fs.existsSync(parentModulePath)) {
      unregisterFromParentModule({
        parentModulePath,
        featureModuleClassName: `${oldNames.pascal}Module`,
      });
    }

    // 2. Update contents of all code files in the feature directory
    const allFiles = getAllFilesRecursive(featureDir);
    for (const filePath of allFiles) {
      if (filePath.endsWith('.ts') || filePath.endsWith('.json') || filePath.endsWith('.md')) {
        let content = fs.readFileSync(filePath, 'utf-8');

        // Order matters: replace longer identifiers first to prevent partial clobbering
        if (oldNames.pluralPascal !== oldNames.pascal) {
          content = replaceWordBoundary(content, oldNames.pluralPascal, newNames.pluralPascal, true);
        }
        if (oldNames.pluralCamel !== oldNames.camel) {
          content = replaceWordBoundary(content, oldNames.pluralCamel, newNames.pluralCamel, true);
        }
        if (oldNames.pluralKebab !== oldNames.kebab) {
          content = replaceWordBoundary(content, oldNames.pluralKebab, newNames.pluralKebab, false);
        }
        if (oldNames.pluralSnake !== oldNames.snake) {
          content = replaceWordBoundary(content, oldNames.pluralSnake, newNames.pluralSnake, false);
        }

        // Upper forms (e.g. AUTH_KEY -> CLIENT_KEY)
        const oldUpper = oldNames.snake.toUpperCase();
        const newUpper = newNames.snake.toUpperCase();
        if (oldUpper !== oldNames.snake) {
          content = replaceWordBoundary(content, oldUpper, newUpper, false);
        }

        content = replaceWordBoundary(content, oldNames.pascal, newNames.pascal, true);
        content = replaceWordBoundary(content, oldNames.camel, newNames.camel, true);
        content = replaceWordBoundary(content, oldNames.kebab, newNames.kebab, false);
        content = replaceWordBoundary(content, oldNames.snake, newNames.snake, false);

        fs.writeFileSync(filePath, content, 'utf-8');
      }
    }

    // 3. Rename files whose filename contains oldNames.kebab
    // Sort descending by path length so deeply nested files rename before their parents
    const sortedFiles = [...allFiles].sort((a, b) => b.length - a.length);
    const kebabFileRegex = new RegExp(`(?<![a-zA-Z0-9])${oldNames.kebab}(?![a-zA-Z0-9])`, 'g');
    for (const filePath of sortedFiles) {
      const fileName = path.basename(filePath);
      if (kebabFileRegex.test(fileName)) {
        const newFileName = fileName.replace(kebabFileRegex, newNames.kebab);
        const newFilePath = path.join(path.dirname(filePath), newFileName);
        fs.renameSync(filePath, newFilePath);
      }
    }

    // 4. Rename the feature directory itself
    fs.renameSync(featureDir, newFeatureDir);

    // 5. Register new module into parentModule if present
    if (parentModulePath && fs.existsSync(parentModulePath)) {
      const importExt = conventions?.importExtension ?? '.js';
      const newModuleFileName = `${newNames.kebab}.module.ts`;
      const newModulePath = path.join(newFeatureDir, newModuleFileName);

      let finalImportPath: string;
      if (conventions?.pathAlias && conventions.pathAlias.startsWith('@/features')) {
        finalImportPath = `${conventions.pathAlias}/${newNames.kebab}/${newNames.kebab}.module${importExt}`;
      } else {
        let relImport = path.relative(path.dirname(parentModulePath), newModulePath).replace(/\\/g, '/');
        if (!relImport.startsWith('.')) relImport = `./${relImport}`;
        finalImportPath = relImport.replace(/\.ts$/, '') + importExt;
      }

      registerInParentModule({
        parentModulePath,
        featureModuleClassName: `${newNames.pascal}Module`,
        featureModuleImportPath: finalImportPath,
      });
    }

    // 6. Rename i18n catalogs if present
    const { i18nDir } = options;
    if (i18nDir && fs.existsSync(i18nDir)) {
      try {
        const langDirs = fs.readdirSync(i18nDir, { withFileTypes: true });
        for (const ld of langDirs) {
          if (ld.isDirectory()) {
            const oldCatalog = path.join(i18nDir, ld.name, `${oldNames.kebab}.json`);
            const newCatalog = path.join(i18nDir, ld.name, `${newNames.kebab}.json`);
            if (fs.existsSync(oldCatalog) && !fs.existsSync(newCatalog)) {
              fs.renameSync(oldCatalog, newCatalog);
            }
          }
        }
      } catch {
        // Ignore i18n rename errors
      }
    }

    // 7. Update undo manifest (.nest-forge-last.json) if present
    const rootDir = options.workspaceRoot || (parentModulePath ? findWorkspaceRoot(path.dirname(parentModulePath)) : findWorkspaceRoot(parentDir));
    if (rootDir) {
      const record = getLastScaffoldRecord(rootDir);
      if (record && (record.featureName === oldNames.kebab || record.featureName === oldFeatureName)) {
        record.featureName = newNames.kebab;
        record.moduleClassName = `${newNames.pascal}Module`;

        const kebabRegex = new RegExp(`(?<![a-zA-Z0-9])${oldNames.kebab}(?![a-zA-Z0-9])`, 'g');
        record.targetPath = record.targetPath.replace(kebabRegex, newNames.kebab);
        if (record.importSpecifier) {
          if (conventions?.pathAlias && conventions.pathAlias.startsWith('@/features')) {
            const importExt = conventions?.importExtension ?? '.js';
            record.importSpecifier = `${conventions.pathAlias}/${newNames.kebab}/${newNames.kebab}.module${importExt}`;
          } else {
            record.importSpecifier = record.importSpecifier.replace(kebabRegex, newNames.kebab);
          }
        }

        const updatedFiles: string[] = [];
        const newHashes: Record<string, string> = {};
        for (const oldFile of record.createdFiles) {
          const relInsideFeature = path.relative(featureDir, oldFile);
          let newFilePath: string;
          if (!relInsideFeature.startsWith('..') && !path.isAbsolute(relInsideFeature)) {
            const newRel = relInsideFeature.replace(kebabRegex, newNames.kebab);
            newFilePath = path.join(newFeatureDir, newRel);
          } else {
            newFilePath = oldFile;
          }
          updatedFiles.push(newFilePath);
          if (fs.existsSync(newFilePath)) {
            const h = computeFileHash(newFilePath);
            if (h) {
              newHashes[newFilePath] = h;
            }
          }
        }
        record.createdFiles = updatedFiles;
        record.fileHashes = newHashes;
        saveLastScaffoldRecord(rootDir, record);
      }
    }

    return { success: true, newFeatureDir };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

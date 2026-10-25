import * as fs from 'node:fs';
import * as path from 'node:path';
import { deriveNames } from './naming.js';
import { registerInParentModule } from './module-registrar.js';
import { unregisterFromParentModule } from './module-unregistrar.js';
import { validateSafeFileName } from './path-validator.js';
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
          content = content.replaceAll(oldNames.pluralPascal, newNames.pluralPascal);
        }
        if (oldNames.pluralCamel !== oldNames.camel) {
          content = content.replaceAll(oldNames.pluralCamel, newNames.pluralCamel);
        }
        if (oldNames.pluralKebab !== oldNames.kebab) {
          content = content.replaceAll(oldNames.pluralKebab, newNames.pluralKebab);
        }
        if (oldNames.pluralSnake !== oldNames.snake) {
          content = content.replaceAll(oldNames.pluralSnake, newNames.pluralSnake);
        }

        content = content.replaceAll(oldNames.pascal, newNames.pascal);
        content = content.replaceAll(oldNames.camel, newNames.camel);
        content = content.replaceAll(oldNames.kebab, newNames.kebab);
        content = content.replaceAll(oldNames.snake, newNames.snake);

        fs.writeFileSync(filePath, content, 'utf-8');
      }
    }

    // 3. Rename files whose filename contains oldNames.kebab
    // Sort descending by path length so deeply nested files rename before their parents
    const sortedFiles = [...allFiles].sort((a, b) => b.length - a.length);
    for (const filePath of sortedFiles) {
      const fileName = path.basename(filePath);
      if (fileName.includes(oldNames.kebab)) {
        const newFileName = fileName.replaceAll(oldNames.kebab, newNames.kebab);
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

      let relImport = path.relative(path.dirname(parentModulePath), newModulePath).replace(/\\/g, '/');
      if (!relImport.startsWith('.')) relImport = `./${relImport}`;
      relImport = relImport.replace(/\.ts$/, '') + importExt;

      registerInParentModule({
        parentModulePath,
        featureModuleClassName: `${newNames.pascal}Module`,
        featureModuleImportPath: relImport,
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

    return { success: true, newFeatureDir };
  } catch (err: any) {
    return { success: false, error: err?.message || String(err) };
  }
}

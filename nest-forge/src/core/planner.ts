import * as fs from 'node:fs';
import * as path from 'node:path';
import { deriveNames } from './naming.js';
import type { FeatureFormState, FilePlan, ProjectConventions } from './types.js';

export interface ModuleComponentEntry {
  className: string;
  importPath: string;
}

export function getImportSpecifier(subPath: string, featureKebab: string, conventions: ProjectConventions): string {
  const cleanSub = subPath.replace(/\.ts$/, '');
  if (conventions.pathAlias && conventions.pathAlias.startsWith('@/features')) {
    return `${conventions.pathAlias}/${featureKebab}/${cleanSub}${conventions.importExtension}`;
  }
  return `./${cleanSub}${conventions.importExtension}`;
}

export function buildPlan(
  state: FeatureFormState,
  conventions: ProjectConventions,
  workspaceRoot: string,
): FilePlan[] {
  const names = deriveNames(state.featureName);
  if (!names.kebab) return [];

  const isGrouped = state.structureMode === 'grouped';
  const targetDirAbs = path.isAbsolute(state.targetPath)
    ? state.targetPath
    : path.join(workspaceRoot, state.targetPath);

  const plans: FilePlan[] = [];

  function addPlan(
    dirAbs: string,
    fileName: string,
    templateName: string,
    extraContext: Record<string, unknown> = {},
  ) {
    const absolutePath = path.join(dirAbs, fileName);
    const relativePath = path.relative(workspaceRoot, absolutePath);
    const exists = fs.existsSync(absolutePath);

    plans.push({
      absolutePath,
      relativePath,
      templateName,
      context: {
        names,
        conventions,
        state,
        isGrouped,
        ...extraContext,
      },
      exists,
    });
  }

  const moduleControllers: ModuleComponentEntry[] = [];
  const moduleProviders: ModuleComponentEntry[] = [];
  const moduleExports: ModuleComponentEntry[] = [];

  if (isGrouped) {
    // ==========================================
    // GROUPED (AUTH-STYLE) ARCHITECTURE
    // ==========================================
    const controllersDirAbs = path.join(targetDirAbs, 'controllers');
    const servicesDirAbs = path.join(targetDirAbs, 'services');
    const providersDirAbs = path.join(targetDirAbs, 'providers');
    const storesDirAbs = path.join(targetDirAbs, 'stores');

    // 1. Controllers (in controllers/ directory)
    const rawControllers = (state.controllerFiles && state.controllerFiles.length > 0)
      ? state.controllerFiles
      : [{ name: state.controllerFileName || `${names.kebab}.controller.ts` }];

    for (const ctrl of rawControllers) {
      if (!ctrl.name) continue;
      const baseName = ctrl.name.replace(/\.controller\.ts$/, '').replace(/\.ts$/, '');
      const ctrlNames = deriveNames(baseName);
      const ctrlClassName = `${ctrlNames.pascal}Controller`;
      const ctrlFileName = `${baseName}.controller.ts`;
      const importPath = getImportSpecifier(`controllers/${baseName}.controller`, names.kebab, conventions);

      moduleControllers.push({ className: ctrlClassName, importPath });

      // Primary service name to inject into this controller
      const primaryServiceName = `${names.pascal}Service`;
      const serviceImportPath = conventions.pathAlias && conventions.pathAlias.startsWith('@/features')
        ? `${conventions.pathAlias}/${names.kebab}/services/${names.kebab}.service${conventions.importExtension}`
        : `../services/${names.kebab}.service${conventions.importExtension}`;

      addPlan(controllersDirAbs, ctrlFileName, 'controller', {
        controllerClassName: ctrlClassName,
        routePath: ctrlNames.pluralKebab,
        serviceClassName: primaryServiceName,
        serviceImportPath,
        serviceParamName: conventions.paramStyle === 'snake_case' ? `${names.snake}_service` : `${names.camel}Service`,
      });

      if (state.includeSpecs) {
        addPlan(controllersDirAbs, `${baseName}.controller.spec.ts`, 'spec', {
          specType: 'Controller',
          targetClass: ctrlClassName,
          targetFileName: ctrlFileName,
          serviceClassName: primaryServiceName,
        });
      }
    }

    // 2. Services (in services/ directory)
    const rawServices = (state.serviceFiles && state.serviceFiles.length > 0)
      ? state.serviceFiles
      : [{ name: state.serviceFileName || `${names.kebab}.service.ts` }];

    for (const srv of rawServices) {
      if (!srv.name) continue;
      const baseName = srv.name.replace(/\.service\.ts$/, '').replace(/\.ts$/, '');
      const srvNames = deriveNames(baseName);
      const srvClassName = `${srvNames.pascal}Service`;
      const srvFileName = `${baseName}.service.ts`;
      const importPath = getImportSpecifier(`services/${baseName}.service`, names.kebab, conventions);

      moduleProviders.push({ className: srvClassName, importPath });
      moduleExports.push({ className: srvClassName, importPath });

      const repoClassName = `${names.pascal}Repository`;
      const repoImportPath = conventions.pathAlias && conventions.pathAlias.startsWith('@/features')
        ? `${conventions.pathAlias}/${names.kebab}/${names.kebab}.repository${conventions.importExtension}`
        : `../${names.kebab}.repository${conventions.importExtension}`;

      addPlan(servicesDirAbs, srvFileName, 'service', {
        serviceClassName: srvClassName,
        repositoryClassName: repoClassName,
        repositoryImportPath: repoImportPath,
      });

      if (state.includeSpecs) {
        addPlan(servicesDirAbs, `${baseName}.service.spec.ts`, 'spec', {
          specType: 'Service',
          targetClass: srvClassName,
          targetFileName: srvFileName,
          repositoryClassName: repoClassName,
        });
      }
    }

    // 3. Providers / Handlers (in providers/ directory)
    if (state.includeProviders && state.providerFiles && state.providerFiles.length > 0) {
      for (const prov of state.providerFiles) {
        if (!prov.name) continue;
        let cleanName = prov.name.replace(/\.ts$/, '');
        const isHandler = cleanName.endsWith('.handler') || cleanName.endsWith('-handler') || cleanName.includes('handler');
        cleanName = cleanName.replace(/\.handler$/, '').replace(/-handler$/, '').replace(/\.provider$/, '').replace(/-provider$/, '');
        const provNames = deriveNames(cleanName);
        const suffix = isHandler ? 'Handler' : 'Provider';
        const provClassName = `${provNames.pascal}${suffix}`;
        const provFileName = isHandler ? `${cleanName}.handler.ts` : `${cleanName}.provider.ts`;
        const importPath = getImportSpecifier(`providers/${provFileName.replace(/\.ts$/, '')}`, names.kebab, conventions);

        moduleProviders.push({ className: provClassName, importPath });

        addPlan(providersDirAbs, provFileName, 'provider', {
          providerClassName: provClassName,
          providerFileName: provFileName,
        });
      }
    }

    // 4. Stores (in stores/ directory)
    if (state.includeStores && state.storeFiles && state.storeFiles.length > 0) {
      for (const st of state.storeFiles) {
        if (!st.name) continue;
        const baseName = st.name.replace(/\.store\.ts$/, '').replace(/\.ts$/, '');
        const storeNames = deriveNames(baseName);
        const storeClassName = `${storeNames.pascal}Store`;
        const storeFileName = `${baseName}.store.ts`;
        const importPath = getImportSpecifier(`stores/${baseName}.store`, names.kebab, conventions);

        moduleProviders.push({ className: storeClassName, importPath });

        addPlan(storesDirAbs, storeFileName, 'store', {
          storeClassName,
          storeFileName,
        });
      }
    }

    // 5. Repository (Optional)
    if (state.includeRepository && state.repositoryFileName) {
      const repoClassName = `${names.pascal}Repository`;
      const repoFileName = state.repositoryFileName.endsWith('.ts') ? state.repositoryFileName : `${state.repositoryFileName}.ts`;
      const importPath = getImportSpecifier(repoFileName.replace(/\.ts$/, ''), names.kebab, conventions);

      moduleProviders.push({ className: repoClassName, importPath });
      moduleExports.push({ className: repoClassName, importPath });

      addPlan(targetDirAbs, repoFileName, 'repository', {
        repositoryClassName: repoClassName,
      });

      if (state.includeSpecs) {
        addPlan(targetDirAbs, `${names.kebab}.repository.spec.ts`, 'spec', {
          specType: 'Repository',
          targetClass: repoClassName,
          targetFileName: repoFileName,
        });
      }
    }

    // 6. Policy (Optional)
    if (state.includePolicy) {
      const policyFileName = state.policyFileName || `${names.kebab}.policy.ts`;
      const policyBase = policyFileName.replace(/\.policy\.ts$/, '').replace(/\.ts$/, '');
      const policyClassName = `${deriveNames(policyBase).pascal}Policy`;
      const importPath = getImportSpecifier(policyFileName.replace(/\.ts$/, ''), names.kebab, conventions);

      moduleProviders.push({ className: policyClassName, importPath });

      addPlan(targetDirAbs, policyFileName, 'policy', {
        policyClassName,
      });
    }

    // 7. Interface (Optional)
    if (state.includeInterface && state.interfaceFileName) {
      addPlan(targetDirAbs, state.interfaceFileName, 'interface');
    }

    // 8. Processors (BullMQ workers)
    if (state.includeProcessors && state.processorFiles && state.processorFiles.length > 0) {
      const processorsDirAbs = path.join(targetDirAbs, 'processors');
      for (const proc of state.processorFiles) {
        if (!proc.name) continue;
        const baseName = proc.name.replace(/\.processor\.ts$/, '').replace(/\.ts$/, '');
        const procNames = deriveNames(baseName);
        const procClassName = `${procNames.pascal}Processor`;
        const procFileName = `${baseName}.processor.ts`;
        const importPath = getImportSpecifier(`processors/${baseName}.processor`, names.kebab, conventions);

        moduleProviders.push({ className: procClassName, importPath });

        addPlan(processorsDirAbs, procFileName, 'processor', {
          queueName: procNames.kebab,
          processorClassName: procClassName,
          processorFileName: procFileName,
        });
      }
    }

    // 9. Tasks (Cron / Scheduled Jobs)
    if (state.includeTasks && state.taskFiles && state.taskFiles.length > 0) {
      const tasksDirAbs = path.join(targetDirAbs, 'tasks');
      for (const task of state.taskFiles) {
        if (!task.name) continue;
        const baseName = task.name.replace(/\.task\.ts$/, '').replace(/\.ts$/, '');
        const taskNames = deriveNames(baseName);
        const taskClassName = `${taskNames.pascal}Task`;
        const taskFileName = `${baseName}.task.ts`;
        const importPath = getImportSpecifier(`tasks/${baseName}.task`, names.kebab, conventions);

        moduleProviders.push({ className: taskClassName, importPath });

        addPlan(tasksDirAbs, taskFileName, 'task', {
          taskClassName,
          taskFileName,
        });
      }
    }

    // 10. Listeners
    if (state.includeListeners && state.listenerFiles && state.listenerFiles.length > 0) {
      const listenerDirAbs = path.join(targetDirAbs, 'listeners');
      for (const listener of state.listenerFiles) {
        if (!listener.name) continue;
        const baseName = listener.name.replace(/\.listener\.ts$/, '').replace(/\.ts$/, '');
        const listenerNames = deriveNames(baseName);
        const listenerClassName = `${listenerNames.pascal}Listener`;
        const listenerFileName = `${baseName}.listener.ts`;
        const importPath = getImportSpecifier(`listeners/${baseName}.listener`, names.kebab, conventions);

        moduleProviders.push({ className: listenerClassName, importPath });

        addPlan(listenerDirAbs, listenerFileName, 'listener', {
          listenerName: baseName,
          listenerNames,
          listenerClassName,
        });
      }
    }

    // 11. Module (at feature root)
    const moduleFileName = state.moduleFileName || `${names.kebab}.module.ts`;
    addPlan(targetDirAbs, moduleFileName, 'module', {
      moduleControllers,
      moduleProviders,
      moduleExports,
    });
  } else {
    // ==========================================
    // FLAT (STANDARD) ARCHITECTURE
    // ==========================================
    const srvClassName = `${names.pascal}Service`;
    const ctrlClassName = `${names.pascal}Controller`;
    const repoClassName = `${names.pascal}Repository`;
    const policyClassName = `${names.pascal}Policy`;

    const srvFile = state.serviceFileName || `${names.kebab}.service.ts`;
    const ctrlFile = state.controllerFileName || `${names.kebab}.controller.ts`;
    const modFile = state.moduleFileName || `${names.kebab}.module.ts`;

    moduleControllers.push({
      className: ctrlClassName,
      importPath: `./${ctrlFile.replace(/\.ts$/, '')}${conventions.importExtension}`,
    });
    moduleProviders.push({
      className: srvClassName,
      importPath: `./${srvFile.replace(/\.ts$/, '')}${conventions.importExtension}`,
    });
    moduleExports.push({
      className: srvClassName,
      importPath: `./${srvFile.replace(/\.ts$/, '')}${conventions.importExtension}`,
    });

    if (state.includeRepository && state.repositoryFileName) {
      const repoFile = state.repositoryFileName.endsWith('.ts') ? state.repositoryFileName : `${state.repositoryFileName}.ts`;
      moduleProviders.push({
        className: repoClassName,
        importPath: `./${repoFile.replace(/\.ts$/, '')}${conventions.importExtension}`,
      });
      moduleExports.push({
        className: repoClassName,
        importPath: `./${repoFile.replace(/\.ts$/, '')}${conventions.importExtension}`,
      });
      addPlan(targetDirAbs, repoFile, 'repository', {
        repositoryClassName: repoClassName,
      });
    }

    if (state.includePolicy) {
      const policyFile = state.policyFileName || `${names.kebab}.policy.ts`;
      moduleProviders.push({
        className: policyClassName,
        importPath: `./${policyFile.replace(/\.ts$/, '')}${conventions.importExtension}`,
      });
      addPlan(targetDirAbs, policyFile, 'policy', {
        policyClassName,
      });
    }

    addPlan(targetDirAbs, srvFile, 'service', {
      serviceClassName: srvClassName,
      repositoryClassName: repoClassName,
      repositoryImportPath: `./${names.kebab}.repository${conventions.importExtension}`,
    });

    addPlan(targetDirAbs, ctrlFile, 'controller', {
      controllerClassName: ctrlClassName,
      routePath: names.pluralKebab,
      serviceClassName: srvClassName,
      serviceImportPath: `./${names.kebab}.service${conventions.importExtension}`,
      serviceParamName: conventions.paramStyle === 'snake_case' ? `${names.snake}_service` : `${names.camel}Service`,
    });

    if (state.includeInterface && state.interfaceFileName) {
      addPlan(targetDirAbs, state.interfaceFileName, 'interface');
    }

    // Processors (BullMQ workers)
    if (state.includeProcessors && state.processorFiles && state.processorFiles.length > 0) {
      const processorsDirAbs = path.join(targetDirAbs, 'processors');
      for (const proc of state.processorFiles) {
        if (!proc.name) continue;
        const baseName = proc.name.replace(/\.processor\.ts$/, '').replace(/\.ts$/, '');
        const procNames = deriveNames(baseName);
        const procClassName = `${procNames.pascal}Processor`;
        const procFileName = `${baseName}.processor.ts`;
        const importPath = `./processors/${baseName}.processor${conventions.importExtension}`;

        moduleProviders.push({ className: procClassName, importPath });

        addPlan(processorsDirAbs, procFileName, 'processor', {
          queueName: procNames.kebab,
          processorClassName: procClassName,
          processorFileName: procFileName,
        });
      }
    }

    // Tasks (Cron / Scheduled Jobs)
    if (state.includeTasks && state.taskFiles && state.taskFiles.length > 0) {
      const tasksDirAbs = path.join(targetDirAbs, 'tasks');
      for (const task of state.taskFiles) {
        if (!task.name) continue;
        const baseName = task.name.replace(/\.task\.ts$/, '').replace(/\.ts$/, '');
        const taskNames = deriveNames(baseName);
        const taskClassName = `${taskNames.pascal}Task`;
        const taskFileName = `${baseName}.task.ts`;
        const importPath = `./tasks/${baseName}.task${conventions.importExtension}`;

        moduleProviders.push({ className: taskClassName, importPath });

        addPlan(tasksDirAbs, taskFileName, 'task', {
          taskClassName,
          taskFileName,
        });
      }
    }

    // Listeners
    if (state.includeListeners && state.listenerFiles && state.listenerFiles.length > 0) {
      const listenerDirAbs = path.join(targetDirAbs, 'listeners');
      for (const listener of state.listenerFiles) {
        if (!listener.name) continue;
        const baseName = listener.name.replace(/\.listener\.ts$/, '').replace(/\.ts$/, '');
        const listenerNames = deriveNames(baseName);
        const listenerClassName = `${listenerNames.pascal}Listener`;
        const listenerFileName = `${baseName}.listener.ts`;
        const importPath = `./listeners/${baseName}.listener${conventions.importExtension}`;

        moduleProviders.push({ className: listenerClassName, importPath });

        addPlan(listenerDirAbs, listenerFileName, 'listener', {
          listenerName: baseName,
          listenerNames,
          listenerClassName,
        });
      }
    }

    addPlan(targetDirAbs, modFile, 'module', {
      moduleControllers,
      moduleProviders,
      moduleExports,
    });

    if (state.includeSpecs) {
      addPlan(targetDirAbs, `${names.kebab}.service.spec.ts`, 'spec', {
        specType: 'Service',
        targetClass: srvClassName,
        targetFileName: srvFile,
      });
      addPlan(targetDirAbs, `${names.kebab}.controller.spec.ts`, 'spec', {
        specType: 'Controller',
        targetClass: ctrlClassName,
        targetFileName: ctrlFile,
      });
      if (state.includeRepository && state.repositoryFileName) {
        addPlan(targetDirAbs, `${names.kebab}.repository.spec.ts`, 'spec', {
          specType: 'Repository',
          targetClass: repoClassName,
          targetFileName: state.repositoryFileName,
        });
      }
    }
  }

  // Common DTOs
  if (state.dtoFiles && state.dtoFiles.length > 0) {
    const dtoDirAbs = path.join(targetDirAbs, 'dto');
    for (const dto of state.dtoFiles) {
      if (!dto.name) continue;
      const baseName = dto.name.replace(/\.dto\.ts$/, '').replace(/\.ts$/, '');
      const dtoNames = deriveNames(baseName);
      addPlan(dtoDirAbs, `${baseName}.dto.ts`, 'dto', {
        dtoName: baseName,
        dtoNames,
        dtoClassName: `${dtoNames.pascal}Dto`,
        dtoSchemaName: `${dtoNames.camel}Schema`,
      });
    }
  }

  // Common Events
  if (state.includeEvents && state.eventFiles && state.eventFiles.length > 0) {
    const eventDirAbs = path.join(targetDirAbs, 'events');
    for (const event of state.eventFiles) {
      if (!event.name) continue;
      const baseName = event.name.replace(/\.event\.ts$/, '').replace(/\.ts$/, '');
      const eventNames = deriveNames(baseName);
      addPlan(eventDirAbs, `${baseName}.event.ts`, 'event', {
        eventName: baseName,
        eventNames,
        eventClassName: `${eventNames.pascal}Event`,
      });
    }
  }

  // i18n Catalogs (EN & AR)
  if (state.includeI18n) {
    const i18nRelDir = conventions.i18nDir || 'src/i18n';
    const i18nDirAbs = path.isAbsolute(i18nRelDir)
      ? i18nRelDir
      : path.join(workspaceRoot, i18nRelDir);

    const enDir = path.join(i18nDirAbs, 'en');
    const arDir = path.join(i18nDirAbs, 'ar');

    const featureTitleEn = names.pascal.replace(/([a-z])([A-Z])/g, '$1 $2');

    addPlan(enDir, `${names.kebab}.json`, 'i18n-en', {
      featureTitleEn,
    });
    addPlan(arDir, `${names.kebab}.json`, 'i18n-ar', {
      featureTitleEn,
    });
  }

  return plans;
}

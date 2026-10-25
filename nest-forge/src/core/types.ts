export interface FeatureNames {
  kebab: string;
  pascal: string;
  camel: string;
  snake: string;
  pluralKebab: string;
  pluralPascal: string;
  pluralCamel: string;
  pluralSnake: string;
}

export interface SubFileEntry {
  name: string;
}

export interface FeatureFormState {
  featureName: string;
  targetPath: string;
  parentModulePath: string;
  structureMode?: 'flat' | 'grouped';

  // Core files (flat mode)
  serviceFileName: string;
  controllerFileName: string;
  moduleFileName: string;

  // Grouped mode dynamic files
  controllerFiles?: SubFileEntry[];
  serviceFiles?: SubFileEntry[];

  // Optional files
  includeRepository: boolean;
  repositoryFileName: string;
  includeInterface: boolean;
  interfaceFileName: string;
  includePolicy?: boolean;
  policyFileName?: string;

  // Grouped mode stores and providers
  includeStores?: boolean;
  storeFiles?: SubFileEntry[];
  includeProviders?: boolean;
  providerFiles?: SubFileEntry[];

  // Dynamic file lists
  dtoFiles: SubFileEntry[];
  includeEvents: boolean;
  eventFiles: SubFileEntry[];
  includeListeners: boolean;
  listenerFiles: SubFileEntry[];

  // Background workers & tasks
  includeProcessors?: boolean;
  processorFiles?: SubFileEntry[];
  includeTasks?: boolean;
  taskFiles?: SubFileEntry[];

  // Test files
  includeSpecs: boolean;

  // i18n Translation Catalog
  includeI18n?: boolean;
}

export interface FilePlan {
  absolutePath: string;
  relativePath: string;
  templateName: string;
  context: Record<string, unknown>;
  exists: boolean;
}

export interface ProjectConventions {
  featuresDir: string;
  importExtension: string;
  pathAlias: string;
  orm: 'drizzle' | 'prisma' | 'typeorm' | 'none';
  controllerVersion: string;
  paramStyle: 'snake_case' | 'camelCase';
  parentModule: string;
  validator: 'class-validator' | 'zod' | 'none';
  formatter: 'biome' | 'prettier' | 'none';
  testRunner?: 'jest' | 'vitest';
  i18nDir?: string;
  i18nDefaultLocale?: string;
}

export interface GenerationResult {
  createdFiles: string[];
  skippedFiles: string[];
  parentModuleUpdated: boolean;
  formatted: boolean;
}

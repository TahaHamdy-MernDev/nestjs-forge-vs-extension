import { describe, expect, it } from 'vitest';
import { buildPlan } from '../src/core/planner.js';
import type { FeatureFormState, ProjectConventions } from '../src/core/types.js';

describe('planner with i18n', () => {
  const conventions: ProjectConventions = {
    featuresDir: 'src/features',
    importExtension: '.js',
    pathAlias: '@/features',
    orm: 'drizzle',
    controllerVersion: '1',
    paramStyle: 'snake_case',
    parentModule: 'src/features/features.module.ts',
    validator: 'class-validator',
    formatter: 'biome',
    i18nDir: 'src/i18n',
  };

  const baseState: FeatureFormState = {
    featureName: 'invoice',
    targetPath: 'src/features/invoice',
    parentModulePath: 'src/features/features.module.ts',
    serviceFileName: 'invoice.service.ts',
    controllerFileName: 'invoice.controller.ts',
    moduleFileName: 'invoice.module.ts',
    includeRepository: false,
    repositoryFileName: 'invoice.repository.ts',
    includeInterface: false,
    interfaceFileName: 'invoice.interface.ts',
    includeSpecs: false,
    dtoFiles: [],
    includeEvents: false,
    eventFiles: [],
    includeListeners: false,
    listenerFiles: [],
  };

  it('does not generate i18n catalogs when includeI18n is false or undefined', () => {
    const plans = buildPlan({ ...baseState, includeI18n: false }, conventions, '/workspace');
    const relPaths = plans.map((p) => p.relativePath);
    expect(relPaths.some((p) => p.includes('i18n'))).toBe(false);
  });

  it('generates English and Arabic catalog JSON when includeI18n is true', () => {
    const plans = buildPlan({ ...baseState, includeI18n: true }, conventions, '/workspace');
    const relPaths = plans.map((p) => p.relativePath);

    expect(relPaths).toContain('src/i18n/en/invoice.json');
    expect(relPaths).toContain('src/i18n/ar/invoice.json');

    const enPlan = plans.find((p) => p.relativePath === 'src/i18n/en/invoice.json');
    const arPlan = plans.find((p) => p.relativePath === 'src/i18n/ar/invoice.json');

    expect(enPlan?.templateName).toBe('i18n-en');
    expect(arPlan?.templateName).toBe('i18n-ar');
  });
});

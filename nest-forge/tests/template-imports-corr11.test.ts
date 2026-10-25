import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveNames } from '../src/core/naming.js';
import { buildPlan } from '../src/core/planner.js';
import { TemplateRenderer } from '../src/core/renderer.js';
import type { FeatureFormState, ProjectConventions } from '../src/core/types.js';

describe('CORR-11: Template import bugs and path alias handling', () => {
  const templatesDir = path.resolve(__dirname, '../src/templates');
  const renderer = new TemplateRenderer(templatesDir);

  const baseConventions: ProjectConventions = {
    featuresDir: 'src/features',
    importExtension: '.js',
    pathAlias: '@/features',
    orm: 'prisma',
    controllerVersion: '1',
    paramStyle: 'camelCase',
    parentModule: 'src/features/features.module.ts',
    validator: 'class-validator',
    formatter: 'none',
  };

  const groupedState: FeatureFormState = {
    featureName: 'auth',
    targetPath: 'src/features/auth',
    parentModulePath: 'src/features/features.module.ts',
    structureMode: 'grouped',
    serviceFileName: 'auth.service.ts',
    controllerFileName: 'auth.controller.ts',
    moduleFileName: 'auth.module.ts',
    controllerFiles: [{ name: 'auth' }],
    serviceFiles: [{ name: 'auth' }],
    includeRepository: true,
    repositoryFileName: 'auth.repository.ts',
    includeInterface: false,
    interfaceFileName: 'auth.interface.ts',
    includePolicy: true,
    policyFileName: 'auth.policy.ts',
    includeSpecs: true,
    dtoFiles: [],
    includeEvents: false,
    eventFiles: [],
    includeListeners: false,
    listenerFiles: [],
  };

  it('passes serviceImportPath to controller spec plan in grouped mode and renders correct import', () => {
    const plans = buildPlan(groupedState, baseConventions, '/workspace');
    const ctrlSpecPlan = plans.find((p) => p.relativePath === 'src/features/auth/controllers/auth.controller.spec.ts');
    expect(ctrlSpecPlan).toBeDefined();
    expect(ctrlSpecPlan?.context.serviceImportPath).toBeDefined();
    expect(ctrlSpecPlan?.context.serviceImportPath).toBe('@/features/auth/services/auth.service.js');

    const output = renderer.render('spec', ctrlSpecPlan!.context);
    expect(output).toContain("import { AuthService } from '@/features/auth/services/auth.service.js';");
    expect(output).not.toContain("import { AuthService } from './auth.service.js';");
  });

  it('passes repositoryImportPath to service spec plan in grouped mode and renders correct import', () => {
    const plans = buildPlan(groupedState, baseConventions, '/workspace');
    const srvSpecPlan = plans.find((p) => p.relativePath === 'src/features/auth/services/auth.service.spec.ts');
    expect(srvSpecPlan).toBeDefined();
    expect(srvSpecPlan?.context.repositoryImportPath).toBeDefined();
    expect(srvSpecPlan?.context.repositoryImportPath).toBe('@/features/auth/auth.repository.js');

    const output = renderer.render('spec', srvSpecPlan!.context);
    expect(output).toContain("import { AuthRepository } from '@/features/auth/auth.repository.js';");
    expect(output).not.toContain("import { AuthRepository } from './auth.repository.js';");
  });

  it('passes relative service and repository import paths in grouped mode when pathAlias is empty (no-alias)', () => {
    const noAliasConventions: ProjectConventions = {
      ...baseConventions,
      pathAlias: '',
    };
    const plans = buildPlan(groupedState, noAliasConventions, '/workspace');

    const ctrlSpecPlan = plans.find((p) => p.relativePath === 'src/features/auth/controllers/auth.controller.spec.ts');
    expect(ctrlSpecPlan?.context.serviceImportPath).toBe('../services/auth.service.js');
    const ctrlSpecOutput = renderer.render('spec', ctrlSpecPlan!.context);
    expect(ctrlSpecOutput).toContain("import { AuthService } from '../services/auth.service.js';");

    const srvSpecPlan = plans.find((p) => p.relativePath === 'src/features/auth/services/auth.service.spec.ts');
    expect(srvSpecPlan?.context.repositoryImportPath).toBe('../auth.repository.js');
    const srvSpecOutput = renderer.render('spec', srvSpecPlan!.context);
    expect(srvSpecOutput).toContain("import { AuthRepository } from '../auth.repository.js';");
  });

  it('renders policy.eta with relative path fallback when pathAlias is empty', () => {
    const names = deriveNames('user');
    const noAliasContext = {
      names,
      conventions: { ...baseConventions, pathAlias: '' },
      state: groupedState,
      policyClassName: 'UserPolicy',
    };
    const output = renderer.render('policy', noAliasContext);
    expect(output).toContain("import type { PolicyUser } from '../auth/auth.interface.js';");
    expect(output).not.toContain('@/');
  });

  it('renders policy.eta respecting conventions.pathAlias when alias is present', () => {
    const names = deriveNames('user');
    const aliasContext = {
      names,
      conventions: { ...baseConventions, pathAlias: '@/features' },
      state: groupedState,
      policyClassName: 'UserPolicy',
    };
    const output = renderer.render('policy', aliasContext);
    expect(output).toContain("import type { PolicyUser } from '@/features/auth/auth.interface.js';");
  });

  it('renders repository.eta (Prisma) with relative path fallback when pathAlias is empty', () => {
    const names = deriveNames('user');
    const noAliasContext = {
      names,
      conventions: { ...baseConventions, orm: 'prisma' as const, pathAlias: '' },
      state: groupedState,
    };
    const output = renderer.render('repository', noAliasContext);
    expect(output).toContain("import { PrismaService } from '../../infrastructure/prisma/prisma.service.js';");
    expect(output).not.toContain('@/');
  });

  it('renders repository.eta (Prisma) respecting conventions.pathAlias when alias is present', () => {
    const names = deriveNames('user');
    const aliasContext = {
      names,
      conventions: { ...baseConventions, orm: 'prisma' as const, pathAlias: '@/features' },
      state: groupedState,
    };
    const output = renderer.render('repository', aliasContext);
    expect(output).toContain("import { PrismaService } from '@/infrastructure/prisma/prisma.service.js';");
  });
});

import { describe, expect, it } from 'vitest';
import { buildPlan } from '../src/core/planner.js';
import type { FeatureFormState, ProjectConventions } from '../src/core/types.js';

describe('planner', () => {
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
  };

  const defaultState: FeatureFormState = {
    featureName: 'user',
    targetPath: 'src/features/user',
    parentModulePath: 'src/features/features.module.ts',
    serviceFileName: 'user.service.ts',
    controllerFileName: 'user.controller.ts',
    moduleFileName: 'user.module.ts',
    includeRepository: true,
    repositoryFileName: 'user.repository.ts',
    includeInterface: false,
    interfaceFileName: 'user.interface.ts',
    includeSpecs: false,
    dtoFiles: [
      { name: 'create-user' },
      { name: 'update-user' },
    ],
    includeEvents: false,
    eventFiles: [],
    includeListeners: false,
    listenerFiles: [],
  };

  it('generates core files and repository and DTOs', () => {
    const plans = buildPlan(defaultState, conventions, '/workspace');
    const relativePaths = plans.map((p) => p.relativePath);

    expect(relativePaths).toContain('src/features/user/user.service.ts');
    expect(relativePaths).toContain('src/features/user/user.controller.ts');
    expect(relativePaths).toContain('src/features/user/user.module.ts');
    expect(relativePaths).toContain('src/features/user/user.repository.ts');
    expect(relativePaths).toContain('src/features/user/dto/create-user.dto.ts');
    expect(relativePaths).toContain('src/features/user/dto/update-user.dto.ts');
  });

  it('generates events and listeners when enabled', () => {
    const state: FeatureFormState = {
      ...defaultState,
      includeEvents: true,
      eventFiles: [{ name: 'user-created' }],
      includeListeners: true,
      listenerFiles: [{ name: 'user-created' }],
    };

    const plans = buildPlan(state, conventions, '/workspace');
    const relativePaths = plans.map((p) => p.relativePath);

    expect(relativePaths).toContain('src/features/user/events/user-created.event.ts');
    expect(relativePaths).toContain('src/features/user/listeners/user-created.listener.ts');
  });

  it('generates spec files when includeSpecs is true', () => {
    const state: FeatureFormState = {
      ...defaultState,
      includeSpecs: true,
    };

    const plans = buildPlan(state, conventions, '/workspace');
    const relativePaths = plans.map((p) => p.relativePath);

    expect(relativePaths).toContain('src/features/user/user.service.spec.ts');
    expect(relativePaths).toContain('src/features/user/user.controller.spec.ts');
    expect(relativePaths).toContain('src/features/user/user.repository.spec.ts');
  });

  it('generates grouped architecture with subfolders (auth style)', () => {
    const state: FeatureFormState = {
      featureName: 'auth',
      structureMode: 'grouped',
      targetPath: 'src/features/auth',
      parentModulePath: 'src/features/features.module.ts',
      serviceFileName: '',
      controllerFileName: '',
      moduleFileName: 'auth.module.ts',
      includeRepository: false,
      repositoryFileName: 'auth.repository.ts',
      includeInterface: true,
      interfaceFileName: 'auth.interface.ts',
      includePolicy: true,
      policyFileName: 'auth.policy.ts',
      includeSpecs: true,
      controllerFiles: [{ name: 'auth' }, { name: 'admin-auth' }],
      serviceFiles: [{ name: 'auth' }, { name: 'session' }],
      includeStores: true,
      storeFiles: [{ name: 'drizzle-session' }],
      includeProviders: true,
      providerFiles: [{ name: 'session-auth.provider' }, { name: 'email-verification.handler' }],
      dtoFiles: [{ name: 'login' }],
      includeEvents: false,
      eventFiles: [],
      includeListeners: false,
      listenerFiles: [],
    };

    const plans = buildPlan(state, conventions, '/workspace');
    const relativePaths = plans.map((p) => p.relativePath);

    // Module, interface, policy at root
    expect(relativePaths).toContain('src/features/auth/auth.module.ts');
    expect(relativePaths).toContain('src/features/auth/auth.interface.ts');
    expect(relativePaths).toContain('src/features/auth/auth.policy.ts');

    // Subfolders
    expect(relativePaths).toContain('src/features/auth/controllers/auth.controller.ts');
    expect(relativePaths).toContain('src/features/auth/controllers/admin-auth.controller.ts');
    expect(relativePaths).toContain('src/features/auth/services/auth.service.ts');
    expect(relativePaths).toContain('src/features/auth/services/auth.service.spec.ts');
    expect(relativePaths).toContain('src/features/auth/services/session.service.ts');
    expect(relativePaths).toContain('src/features/auth/services/session.service.spec.ts');
    expect(relativePaths).toContain('src/features/auth/stores/drizzle-session.store.ts');
    expect(relativePaths).toContain('src/features/auth/providers/session-auth.provider.ts');
    expect(relativePaths).toContain('src/features/auth/providers/email-verification.handler.ts');
    expect(relativePaths).toContain('src/features/auth/dto/login.dto.ts');
  });

  it('generates processors and tasks when enabled', () => {
    const state: FeatureFormState = {
      ...defaultState,
      includeProcessors: true,
      processorFiles: [{ name: 'email' }],
      includeTasks: true,
      taskFiles: [{ name: 'cleanup' }],
    };

    const plans = buildPlan(state, conventions, '/workspace');
    const relativePaths = plans.map((p) => p.relativePath);

    expect(relativePaths).toContain('src/features/user/processors/email.processor.ts');
    expect(relativePaths).toContain('src/features/user/tasks/cleanup.task.ts');
  });
});


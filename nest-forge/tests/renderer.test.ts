import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveNames } from '../src/core/naming.js';
import { TemplateRenderer } from '../src/core/renderer.js';
import type { FeatureFormState, ProjectConventions } from '../src/core/types.js';

describe('template renderer', () => {
  const templatesDir = path.resolve(__dirname, '../src/templates');
  const renderer = new TemplateRenderer(templatesDir);

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

  const state: FeatureFormState = {
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
    dtoFiles: [],
    includeEvents: false,
    eventFiles: [],
    includeListeners: false,
    listenerFiles: [],
  };

  const names = deriveNames('user');
  const context = { names, conventions, state };

  it('renders service with repository dependency and snake_case param', () => {
    const output = renderer.render('service', context);
    expect(output).toContain("import { Injectable } from '@nestjs/common';");
    expect(output).toContain("import { UserRepository } from './user.repository.js';");
    expect(output).toContain("export class UserService");
    expect(output).toContain("readonly user_repository: UserRepository");
  });

  it('renders controller with version 1 and plural route path', () => {
    const output = renderer.render('controller', context);
    expect(output).toContain("import { Controller } from '@nestjs/common';");
    expect(output).toContain("path: 'users'");
    expect(output).toContain("version: '1'");
    expect(output).toContain("export class UserController");
    expect(output).toContain("readonly user_service: UserService");
  });

  it('renders module with controller and providers', () => {
    const output = renderer.render('module', context);
    expect(output).toContain("controllers: [UserController]");
    expect(output).toContain("providers: [");
    expect(output).toContain("UserService,");
    expect(output).toContain("UserRepository,");
    expect(output).toContain("exports: [");
  });

  it('renders repository with Drizzle NodePgDatabase injection', () => {
    const output = renderer.render('repository', context);
    expect(output).toContain("import { InjectDrizzle } from '@nestjs/drizzle';");
    expect(output).toContain("import type { NodePgDatabase } from 'drizzle-orm/node-postgres';");
    expect(output).toContain("@InjectDrizzle()");
    expect(output).toContain("private readonly db: NodePgDatabase");
  });

  it('renders DTO with class-validator decorators', () => {
    const dtoNames = deriveNames('create-user');
    const dtoOutput = renderer.render('dto', {
      ...context,
      dtoClassName: 'CreateUserDto',
      dtoSchemaName: 'createUserSchema',
    });
    expect(dtoOutput).toContain("import { IsNotEmpty, IsString } from 'class-validator';");
    expect(dtoOutput).toContain("export class CreateUserDto");
    expect(dtoOutput).toContain("@IsString()");
  });

  it('renders spec file with class token providers and dependency imports', () => {
    const specOutput = renderer.render('spec', {
      ...context,
      specType: 'Service',
      targetClass: 'UserService',
      targetFileName: 'user.service.ts',
    });

    expect(specOutput).toContain("import { UserService } from './user.service.js';");
    expect(specOutput).toContain("import { UserRepository } from './user.repository.js';");
    expect(specOutput).toContain("provide: UserRepository,");
    expect(specOutput).not.toContain("provide: 'UserRepository'");
  });

  it('renders policy with @Policy() and PolicyBefore<PolicyUser>', () => {
    const policyOutput = renderer.render('policy', {
      ...context,
      policyClassName: 'MerchantPolicy',
    });
    expect(policyOutput).toContain("import { Policy, type PolicyBefore } from '@nestjs/authorization';");
    expect(policyOutput).toContain("import type { PolicyUser } from '@/features/auth/auth.interface.js';");
    expect(policyOutput).toContain("@Policy()");
    expect(policyOutput).toContain("export class MerchantPolicy implements PolicyBefore<PolicyUser>");
    expect(policyOutput).toContain("before(user: PolicyUser)");
  });

  it('renders store with @InjectDrizzle and NodePgDatabase', () => {
    const storeOutput = renderer.render('store', {
      ...context,
      storeClassName: 'DrizzleSessionStore',
    });
    expect(storeOutput).toContain("import { Injectable, Logger } from '@nestjs/common';");
    expect(storeOutput).toContain("import { InjectDrizzle } from '@nestjs/drizzle';");
    expect(storeOutput).toContain("export class DrizzleSessionStore");
    expect(storeOutput).toContain("@InjectDrizzle() private readonly db: NodePgDatabase");
  });

  it('renders provider with @Injectable()', () => {
    const providerOutput = renderer.render('provider', {
      ...context,
      providerClassName: 'SessionAuthProvider',
    });
    expect(providerOutput).toContain("import { Injectable } from '@nestjs/common';");
    expect(providerOutput).toContain("export class SessionAuthProvider");
  });

  it('renders module with dynamic controller, service, store, and provider lists', () => {
    const moduleOutput = renderer.render('module', {
      ...context,
      controllers: [
        { className: 'AuthController', importPath: './controllers/auth.controller.js' },
        { className: 'AdminAuthController', importPath: './controllers/admin-auth.controller.js' },
      ],
      services: [
        { className: 'AuthService', importPath: './services/auth.service.js' },
        { className: 'SessionService', importPath: './services/session.service.js' },
      ],
      stores: [
        { className: 'DrizzleSessionStore', importPath: './stores/drizzle-session.store.js' },
      ],
      providers: [
        { className: 'SessionAuthProvider', importPath: './providers/session-auth.provider.js' },
      ],
    });

    expect(moduleOutput).toContain("import { AuthController } from './controllers/auth.controller.js';");
    expect(moduleOutput).toContain("import { AdminAuthController } from './controllers/admin-auth.controller.js';");
    expect(moduleOutput).toContain("import { AuthService } from './services/auth.service.js';");
    expect(moduleOutput).toContain("import { SessionService } from './services/session.service.js';");
    expect(moduleOutput).toContain("import { DrizzleSessionStore } from './stores/drizzle-session.store.js';");
    expect(moduleOutput).toContain("import { SessionAuthProvider } from './providers/session-auth.provider.js';");

    expect(moduleOutput).toContain("controllers: [");
    expect(moduleOutput).toContain("AuthController,");
    expect(moduleOutput).toContain("AdminAuthController,");

    expect(moduleOutput).toContain("providers: [");
    expect(moduleOutput).toContain("AuthService,");
    expect(moduleOutput).toContain("SessionService,");
    expect(moduleOutput).toContain("DrizzleSessionStore,");
    expect(moduleOutput).toContain("SessionAuthProvider,");

    expect(moduleOutput).toContain("exports: [");
    expect(moduleOutput).toContain("AuthService,");
    expect(moduleOutput).toContain("SessionService,");
    expect(moduleOutput).toContain("DrizzleSessionStore,");
  });

  it('renders BullMQ processor template', () => {
    const output = renderer.render('processor', {
      ...context,
      queueName: 'emails',
      processorClassName: 'EmailProcessor',
    });
    expect(output).toContain("@Processor('emails')");
    expect(output).toContain("export class EmailProcessor extends WorkerHost");
    expect(output).toContain("async process(job: Job<unknown, unknown, string>)");
  });

  it('renders scheduled task cron template', () => {
    const output = renderer.render('task', {
      ...context,
      taskClassName: 'SyncTask',
    });
    expect(output).toContain("@Injectable()");
    expect(output).toContain("@Cron(CronExpression.EVERY_HOUR)");
    expect(output).toContain("export class SyncTask");
  });
});


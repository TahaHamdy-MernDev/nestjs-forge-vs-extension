import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { wireRepositoryIntoFeature } from '../src/core/feature-wirer.js';

describe('feature wirer (Add Repository)', () => {
  it('wires repository into existing module and service constructors', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-wire-'));
    const moduleFile = path.join(tmpDir, 'catalog.module.ts');
    const serviceFile = path.join(tmpDir, 'catalog.service.ts');

    fs.writeFileSync(moduleFile, `import { Module } from '@nestjs/common';
import { CatalogController } from './catalog.controller.js';
import { CatalogService } from './catalog.service.js';

@Module({
  controllers: [CatalogController],
  providers: [CatalogService],
  exports: [CatalogService],
})
export class CatalogModule {}
`, 'utf-8');

    fs.writeFileSync(serviceFile, `import { Injectable } from '@nestjs/common';

@Injectable()
export class CatalogService {
  constructor() {}
}
`, 'utf-8');

    wireRepositoryIntoFeature({
      modulePath: moduleFile,
      servicePath: serviceFile,
      repositoryClassName: 'CatalogRepository',
      repositoryImportPath: './catalog.repository.js',
      paramName: 'catalog_repository',
    });

    const modCode = fs.readFileSync(moduleFile, 'utf-8');
    expect(modCode).toContain("import { CatalogRepository } from './catalog.repository.js';");
    expect(modCode).toMatch(/providers:\s*\[CatalogService,\s*CatalogRepository\]/);
    expect(modCode).toMatch(/exports:\s*\[CatalogService,\s*CatalogRepository\]/);

    const srvCode = fs.readFileSync(serviceFile, 'utf-8');
    expect(srvCode).toContain("import { CatalogRepository } from './catalog.repository.js';");
    expect(srvCode).toContain('readonly catalog_repository: CatalogRepository');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('wires component into module controllers or providers array using wireComponentIntoModule', async () => {
    const { wireComponentIntoModule } = await import('../src/core/feature-wirer.js');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-wire-comp-'));
    const moduleFile = path.join(tmpDir, 'auth.module.ts');

    fs.writeFileSync(moduleFile, `import { Module } from '@nestjs/common';
import { AuthController } from './controllers/auth.controller.js';

@Module({
  controllers: [AuthController],
  providers: [],
  exports: [],
})
export class AuthModule {}
`, 'utf-8');

    // Wire a second controller
    wireComponentIntoModule({
      modulePath: moduleFile,
      className: 'AdminAuthController',
      importPath: './controllers/admin-auth.controller.js',
      targetArrays: ['controllers'],
    });

    // Wire a store into providers and exports
    wireComponentIntoModule({
      modulePath: moduleFile,
      className: 'DrizzleSessionStore',
      importPath: './stores/drizzle-session.store.js',
      targetArrays: ['providers', 'exports'],
    });

    const modCode = fs.readFileSync(moduleFile, 'utf-8');
    expect(modCode).toContain("import { AdminAuthController } from './controllers/admin-auth.controller.js';");
    expect(modCode).toContain("import { DrizzleSessionStore } from './stores/drizzle-session.store.js';");
    expect(modCode).toMatch(/controllers:\s*\[AuthController,\s*AdminAuthController\]/);
    expect(modCode).toMatch(/providers:\s*\[DrizzleSessionStore\]/);
    expect(modCode).toMatch(/exports:\s*\[DrizzleSessionStore\]/);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('uses serviceImportPath when wiring repository into subfolder service', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-wire-sub-'));
    const moduleFile = path.join(tmpDir, 'auth.module.ts');
    const servicesDir = path.join(tmpDir, 'services');
    fs.mkdirSync(servicesDir, { recursive: true });
    const serviceFile = path.join(servicesDir, 'auth.service.ts');

    fs.writeFileSync(moduleFile, `import { Module } from '@nestjs/common';

@Module({
  controllers: [],
  providers: [],
})
export class AuthModule {}
`, 'utf-8');

    fs.writeFileSync(serviceFile, `import { Injectable } from '@nestjs/common';

@Injectable()
export class AuthService {
  constructor() {}
}
`, 'utf-8');

    wireRepositoryIntoFeature({
      modulePath: moduleFile,
      servicePath: serviceFile,
      repositoryClassName: 'AuthRepository',
      repositoryImportPath: './auth.repository.js',
      serviceImportPath: '../auth.repository.js',
      paramName: 'auth_repository',
    });

    const srvCode = fs.readFileSync(serviceFile, 'utf-8');
    expect(srvCode).toContain("import { AuthRepository } from '../auth.repository.js';");
    expect(srvCode).toContain('readonly auth_repository: AuthRepository');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('injects dependency into class without an existing constructor', async () => {
    const { injectDependencyIntoClass } = await import('../src/core/feature-wirer.js');
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-inject-'));
    const targetFile = path.join(tmpDir, 'orders.controller.ts');

    fs.writeFileSync(
      targetFile,
      `import { Controller } from '@nestjs/common';

@Controller('orders')
export class OrdersController {
  findAll() {
    return [];
  }
}
`,
      'utf-8',
    );

    const success = injectDependencyIntoClass({
      targetFilePath: targetFile,
      dependencyClassName: 'OrdersService',
      importPath: './orders.service.js',
      paramName: 'orders_service',
    });

    expect(success).toBe(true);
    const content = fs.readFileSync(targetFile, 'utf-8');
    expect(content).toContain("import { OrdersService } from './orders.service.js';");
    expect(content).toContain('readonly orders_service: OrdersService');

    // Test idempotency: injecting again shouldn't duplicate
    const secondSuccess = injectDependencyIntoClass({
      targetFilePath: targetFile,
      dependencyClassName: 'OrdersService',
      importPath: './orders.service.js',
      paramName: 'orders_service',
    });
    expect(secondSuccess).toBe(true);
    const matches = content.match(/readonly orders_service: OrdersService/g);
    expect(matches?.length).toBe(1);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});


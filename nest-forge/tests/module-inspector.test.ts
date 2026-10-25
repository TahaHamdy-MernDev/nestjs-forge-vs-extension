import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  detectComponentKind,
  extractExportedClassInfo,
  inspectFeatureModule,
} from '../src/core/module-inspector.js';

describe('module inspector', () => {
  it('extracts exported class info and decorator', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-insp-class-'));
    const srvFile = path.join(tmpDir, 'user.service.ts');
    fs.writeFileSync(
      srvFile,
      `import { Injectable } from '@nestjs/common';

@Injectable()
export class UserService {}
`,
      'utf-8',
    );

    const info = extractExportedClassInfo(srvFile);
    expect(info).toEqual({
      className: 'UserService',
      decoratorName: 'Injectable',
    });

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('inspects feature module and discovers registered vs unwired components', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-insp-mod-'));
    const moduleFile = path.join(tmpDir, 'users.module.ts');
    fs.writeFileSync(
      moduleFile,
      `import { Module } from '@nestjs/common';
import { UsersController } from './users.controller.js';
import { UsersService } from './users.service.js';

@Module({
  controllers: [UsersController],
  providers: [UsersService],
  exports: [UsersService],
})
export class UsersModule {}
`,
      'utf-8',
    );

    const result = inspectFeatureModule(tmpDir);
    expect(result.modulePath).toBe(moduleFile);
    expect(result.moduleClassName).toBe('UsersModule');
    expect(result.registeredControllers.has('UsersController')).toBe(true);
    expect(result.registeredProviders.has('UsersService')).toBe(true);
    expect(result.registeredExports.has('UsersService')).toBe(true);
    expect(result.allRegistered.has('UsersController')).toBe(true);
    expect(result.allRegistered.has('UsersService')).toBe(true);
    expect(result.allRegistered.has('UnwiredStore')).toBe(false);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('detects component kinds accurately', () => {
    expect(detectComponentKind('user.controller.ts')).toBe('controller');
    expect(detectComponentKind('user.service.ts')).toBe('service');
    expect(detectComponentKind('drizzle-user.store.ts')).toBe('store');
    expect(detectComponentKind('auth.handler.ts')).toBe('provider');
    expect(detectComponentKind('order.processor.ts')).toBe('processor');
    expect(detectComponentKind('sync.task.ts')).toBe('task');
    expect(detectComponentKind('user.policy.ts')).toBe('policy');
    expect(detectComponentKind('user.repository.ts')).toBe('repository');
    expect(detectComponentKind('user.event.ts')).toBe('other');
  });
});

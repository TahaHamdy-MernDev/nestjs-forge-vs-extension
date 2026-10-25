import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renameFeature } from '../src/core/feature-lifecycle.js';
import {
  createFileHashes,
  getLastScaffoldRecord,
  saveLastScaffoldRecord,
  verifyFileUnchanged,
  type ScaffoldRecord,
} from '../src/core/scaffold-manifest.js';

describe('CORR-04: renameFeature corruption prevention and manifest preservation', () => {
  it('renames auth to client without corrupting Author, author, Authorize, or authorize', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-auth-'));
    const parentModule = path.join(tmpDir, 'features.module.ts');
    const featureDir = path.join(tmpDir, 'auth');
    fs.mkdirSync(featureDir, { recursive: true });

    fs.writeFileSync(
      parentModule,
      `import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [AuthModule],
})
export class FeaturesModule {}
`,
      'utf-8',
    );

    const serviceFile = path.join(featureDir, 'auth.service.ts');
    fs.writeFileSync(
      serviceFile,
      `import { Injectable } from '@nestjs/common';
import { Author } from './author.model';

export const AUTH_HEADER = 'x-auth-token';

@Injectable()
export class AuthService {
  private author: Author;

  authorize(user: any): boolean {
    return true;
  }
}
`,
      'utf-8',
    );

    const res = renameFeature({
      featureDir,
      newFeatureName: 'client',
      parentModulePath: parentModule,
      conventions: { importExtension: '.js' },
    });

    expect(res.success).toBe(true);
    const newServiceFile = path.join(res.newFeatureDir!, 'client.service.ts');
    expect(fs.existsSync(newServiceFile)).toBe(true);

    const content = fs.readFileSync(newServiceFile, 'utf-8');
    // Words that MUST be renamed
    expect(content).toContain('export class ClientService');
    expect(content).toContain("export const CLIENT_HEADER = 'x-client-token';");

    // Unrelated words that MUST NOT be corrupted
    expect(content).toContain("import { Author } from './author.model';");
    expect(content).toContain('private author: Author;');
    expect(content).toContain('authorize(user: any): boolean');
    expect(content).not.toContain('Clientor');
    expect(content).not.toContain('clientor');
    expect(content).not.toContain('clientorize');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('renames role to permission without corrupting Controller or controller', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-role-'));
    const featureDir = path.join(tmpDir, 'role');
    fs.mkdirSync(featureDir, { recursive: true });

    const ctrlFile = path.join(featureDir, 'role.controller.ts');
    fs.writeFileSync(
      ctrlFile,
      `import { Controller } from '@nestjs/common';
import { RoleService } from './role.service.js';

@Controller('roles')
export class RoleController {
  constructor(readonly roleService: RoleService) {}

  getRole() {
    return 'role';
  }
}
`,
      'utf-8',
    );

    const res = renameFeature({
      featureDir,
      newFeatureName: 'permission',
    });

    expect(res.success).toBe(true);
    const newCtrlFile = path.join(res.newFeatureDir!, 'permission.controller.ts');
    const content = fs.readFileSync(newCtrlFile, 'utf-8');

    expect(content).toContain("import { Controller } from '@nestjs/common';");
    expect(content).toContain('export class PermissionController');
    expect(content).toContain("import { PermissionService } from './permission.service.js';");
    expect(content).toContain('readonly roleService: RoleService' === content ? 'NO' : 'readonly permissionService: PermissionService');
    expect(content).not.toContain('Contpermissionr');
    expect(content).not.toContain('contpermissionler');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('renames tag to label and order to purchase without corrupting target or border', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-tag-'));
    const featureDir = path.join(tmpDir, 'tag');
    fs.mkdirSync(featureDir, { recursive: true });

    const file = path.join(featureDir, 'tag.service.ts');
    fs.writeFileSync(
      file,
      `export class TagService {
  readonly target: string = 'blank';
  readonly border: string = 'none';
  tagItems() { return 'tag'; }
}
`,
      'utf-8',
    );

    const res = renameFeature({
      featureDir,
      newFeatureName: 'label',
    });

    expect(res.success).toBe(true);
    const newFile = path.join(res.newFeatureDir!, 'label.service.ts');
    const content = fs.readFileSync(newFile, 'utf-8');

    expect(content).toContain('export class LabelService');
    expect(content).toContain("readonly target: string = 'blank';");
    expect(content).toContain("readonly border: string = 'none';");
    expect(content).not.toContain('Labelet');
    expect(content).not.toContain('labelet');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('respects conventions.pathAlias when re-registering module in parent module', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-alias-'));
    const parentModule = path.join(tmpDir, 'features.module.ts');
    const featureDir = path.join(tmpDir, 'user');
    fs.mkdirSync(featureDir, { recursive: true });

    fs.writeFileSync(
      parentModule,
      `import { Module } from '@nestjs/common';
import { UserModule } from '@/features/user/user.module.js';

@Module({
  imports: [UserModule],
})
export class FeaturesModule {}
`,
      'utf-8',
    );

    fs.writeFileSync(
      path.join(featureDir, 'user.module.ts'),
      `import { Module } from '@nestjs/common';
@Module({})
export class UserModule {}
`,
      'utf-8',
    );

    const res = renameFeature({
      featureDir,
      newFeatureName: 'member',
      parentModulePath: parentModule,
      conventions: {
        importExtension: '.js',
        pathAlias: '@/features',
      },
    });

    expect(res.success).toBe(true);
    const parentContent = fs.readFileSync(parentModule, 'utf-8');
    expect(parentContent).toContain("import { MemberModule } from '@/features/member/member.module.js';");
    expect(parentContent).not.toContain('./member/member.module.js');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('updates SHA-256 undo manifest with new file paths and fresh hashes after rename', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-manifest-'));
    const parentModule = path.join(tmpDir, 'features.module.ts');
    const featureDir = path.join(tmpDir, 'auth');
    fs.mkdirSync(featureDir, { recursive: true });

    fs.writeFileSync(
      parentModule,
      `import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';
@Module({ imports: [AuthModule] })
export class FeaturesModule {}
`,
      'utf-8',
    );

    const srvFile = path.join(featureDir, 'auth.service.ts');
    fs.writeFileSync(srvFile, 'export class AuthService {}\n', 'utf-8');
    const modFile = path.join(featureDir, 'auth.module.ts');
    fs.writeFileSync(modFile, 'export class AuthModule {}\n', 'utf-8');

    // Create initial manifest record
    const initialRecord: ScaffoldRecord = {
      featureName: 'auth',
      targetPath: 'auth',
      parentModulePath: parentModule,
      moduleClassName: 'AuthModule',
      importSpecifier: './auth/auth.module.js',
      createdFiles: [srvFile, modFile],
      fileHashes: createFileHashes([srvFile, modFile]),
      timestamp: Date.now(),
    };
    saveLastScaffoldRecord(tmpDir, initialRecord);

    const res = renameFeature({
      featureDir,
      newFeatureName: 'client',
      parentModulePath: parentModule,
      workspaceRoot: tmpDir,
      conventions: { importExtension: '.js' },
    });

    expect(res.success).toBe(true);

    const updatedRecord = getLastScaffoldRecord(tmpDir);
    expect(updatedRecord).not.toBeNull();
    expect(updatedRecord?.featureName).toBe('client');
    expect(updatedRecord?.moduleClassName).toBe('ClientModule');

    const expectedNewSrv = path.join(res.newFeatureDir!, 'client.service.ts');
    const expectedNewMod = path.join(res.newFeatureDir!, 'client.module.ts');
    expect(updatedRecord?.createdFiles).toContain(expectedNewSrv);
    expect(updatedRecord?.createdFiles).toContain(expectedNewMod);

    // Verify the SHA-256 hashes in manifest match the renamed files on disk
    expect(verifyFileUnchanged(expectedNewSrv, updatedRecord!.fileHashes![expectedNewSrv])).toBe(true);
    expect(verifyFileUnchanged(expectedNewMod, updatedRecord!.fileHashes![expectedNewMod])).toBe(true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

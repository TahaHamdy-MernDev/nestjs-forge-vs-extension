import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { renameFeature } from '../src/core/feature-lifecycle.js';

describe('CORR-04b: renameFeature compound identifier matching', () => {
  it('renames PascalCase forms embedded in compound identifiers while preserving unrelated words', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-compound-'));
    const parentModule = path.join(tmpDir, 'features.module.ts');
    const featureDir = path.join(tmpDir, 'user');
    fs.mkdirSync(featureDir, { recursive: true });

    fs.writeFileSync(
      parentModule,
      `import { Module } from '@nestjs/common';
import { UserModule } from './user/user.module.js';
@Module({ imports: [UserModule] })
export class FeaturesModule {}
`,
      'utf-8',
    );

    const testFile = path.join(featureDir, 'user.service.ts');
    fs.writeFileSync(
      testFile,
      `export class CreateUserDto {}
export class UpdateUserDto {}
export function onUserCreated() {}
export function findUserById() {}
export class UserService {}
export const USER_KEY = 'usr_123';
// Unrelated words
const author = 'Jane';
function authorize() {}
const border = '1px solid black';
export class Controller {}
`,
      'utf-8',
    );

    const res = renameFeature({
      featureDir,
      newFeatureName: 'account',
      parentModulePath: parentModule,
      conventions: { importExtension: '.js' },
    });

    expect(res.success).toBe(true);
    const renamedFile = path.join(res.newFeatureDir!, 'account.service.ts');
    expect(fs.existsSync(renamedFile)).toBe(true);

    const content = fs.readFileSync(renamedFile, 'utf-8');

    // Expected compound identifier replacements
    expect(content).toContain('CreateAccountDto');
    expect(content).toContain('UpdateAccountDto');
    expect(content).toContain('onAccountCreated');
    expect(content).toContain('findAccountById');
    expect(content).toContain('AccountService');
    expect(content).toContain('ACCOUNT_KEY');

    // Expected untouched unrelated words
    expect(content).toContain("const author = 'Jane';");
    expect(content).toContain('function authorize() {}');
    expect(content).toContain("const border = '1px solid black';");
    expect(content).toContain('export class Controller {}');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

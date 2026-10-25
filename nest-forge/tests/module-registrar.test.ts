import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { registerInParentModule } from '../src/core/module-registrar.js';

describe('module registrar', () => {
  it('registers new feature module into features.module.ts with AST', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-test-'));
    const moduleFile = path.join(tmpDir, 'features.module.ts');

    const initialCode = `import { Module } from '@nestjs/common';
import { UserModule } from '@/features/user/user.module.js';

@Module({
  imports: [UserModule],
})
export class FeaturesModule {}
`;

    fs.writeFileSync(moduleFile, initialCode, 'utf-8');

    // First call: register OrderModule
    const registered = registerInParentModule({
      parentModulePath: moduleFile,
      featureModuleClassName: 'OrderModule',
      featureModuleImportPath: '@/features/order/order.module.js',
    });

    expect(registered).toBe(true);

    const updatedCode = fs.readFileSync(moduleFile, 'utf-8');
    expect(updatedCode).toContain("import { OrderModule } from '@/features/order/order.module.js';");
    expect(updatedCode).toMatch(/imports:\s*\[UserModule,\s*OrderModule\]/);

    // Second call: idempotent (should not duplicate)
    registerInParentModule({
      parentModulePath: moduleFile,
      featureModuleClassName: 'OrderModule',
      featureModuleImportPath: '@/features/order/order.module.js',
    });

    const secondCode = fs.readFileSync(moduleFile, 'utf-8');
    const orderImportCount = (secondCode.match(/import\s*\{[^}]*OrderModule[^}]*\}\s*from/g) || []).length;
    expect(orderImportCount).toBe(1);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('safely handles empty string or directory paths without error', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-dir-test-'));

    const resultOnDir = registerInParentModule({
      parentModulePath: tmpDir,
      featureModuleClassName: 'OrderModule',
      featureModuleImportPath: './order.module.js',
    });
    expect(resultOnDir).toBe(false);

    const resultOnEmpty = registerInParentModule({
      parentModulePath: '',
      featureModuleClassName: 'OrderModule',
      featureModuleImportPath: './order.module.js',
    });
    expect(resultOnEmpty).toBe(false);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles @Module with no imports key', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-no-imports-'));
    const moduleFile = path.join(tmpDir, 'app.module.ts');

    fs.writeFileSync(
      moduleFile,
      `import { Module } from '@nestjs/common';
import { AppController } from './app.controller.js';

@Module({
  controllers: [AppController],
})
export class AppModule {}
`,
      'utf-8',
    );

    const registered = registerInParentModule({
      parentModulePath: moduleFile,
      featureModuleClassName: 'UserModule',
      featureModuleImportPath: './features/user/user.module.js',
    });

    expect(registered).toBe(true);
    const code = fs.readFileSync(moduleFile, 'utf-8');
    expect(code).toContain("import { UserModule } from './features/user/user.module.js';");
    expect(code).toContain('imports: [UserModule],');
    expect(code).toContain('controllers: [AppController],');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles an empty imports array: []', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-empty-arr-'));
    const moduleFile = path.join(tmpDir, 'app.module.ts');

    fs.writeFileSync(
      moduleFile,
      `import { Module } from '@nestjs/common';

@Module({
  imports: [],
})
export class AppModule {}
`,
      'utf-8',
    );

    const registered = registerInParentModule({
      parentModulePath: moduleFile,
      featureModuleClassName: 'UserModule',
      featureModuleImportPath: './user.module.js',
    });

    expect(registered).toBe(true);
    const code = fs.readFileSync(moduleFile, 'utf-8');
    expect(code).toMatch(/imports:\s*\[UserModule\]/);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles multiline imports array with trailing comma preserving indentation', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-multiline-'));
    const moduleFile = path.join(tmpDir, 'app.module.ts');

    fs.writeFileSync(
      moduleFile,
      `import { Module } from '@nestjs/common';
import { AuthModule } from './auth/auth.module.js';

@Module({
  imports: [
    AuthModule,
  ],
})
export class AppModule {}
`,
      'utf-8',
    );

    const registered = registerInParentModule({
      parentModulePath: moduleFile,
      featureModuleClassName: 'PaymentModule',
      featureModuleImportPath: './payment/payment.module.js',
    });

    expect(registered).toBe(true);
    const code = fs.readFileSync(moduleFile, 'utf-8');
    expect(code).toContain("import { PaymentModule } from './payment/payment.module.js';");
    expect(code).toContain('    AuthModule,\n    PaymentModule,\n  ]');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles comments inside the imports array without corruption', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-comments-'));
    const moduleFile = path.join(tmpDir, 'app.module.ts');

    fs.writeFileSync(
      moduleFile,
      `import { Module } from '@nestjs/common';
import { CoreModule } from './core.module.js';

@Module({
  imports: [
    // Core foundational module
    CoreModule,
    /* Feature modules below */
  ],
})
export class AppModule {}
`,
      'utf-8',
    );

    const registered = registerInParentModule({
      parentModulePath: moduleFile,
      featureModuleClassName: 'OrderModule',
      featureModuleImportPath: './order.module.js',
    });

    expect(registered).toBe(true);
    const code = fs.readFileSync(moduleFile, 'utf-8');
    expect(code).toContain('// Core foundational module');
    expect(code).toContain('/* Feature modules below */');
    expect(code).toContain('OrderModule');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('handles non-literal imports (spread element or variable)', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-spread-'));
    const moduleFile = path.join(tmpDir, 'app.module.ts');

    fs.writeFileSync(
      moduleFile,
      `import { Module } from '@nestjs/common';
const coreModules = [];

@Module({
  imports: [...coreModules],
})
export class AppModule {}
`,
      'utf-8',
    );

    const registered = registerInParentModule({
      parentModulePath: moduleFile,
      featureModuleClassName: 'UserModule',
      featureModuleImportPath: './user.module.js',
    });

    expect(registered).toBe(true);
    const code = fs.readFileSync(moduleFile, 'utf-8');
    expect(code).toMatch(/imports:\s*\[\.\.\.coreModules,\s*UserModule\]/);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('preserves CRLF line endings on Windows files', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-crlf-'));
    const moduleFile = path.join(tmpDir, 'app.module.ts');

    const crlfCode = "import { Module } from '@nestjs/common';\r\n\r\n@Module({\r\n  imports: [AuthModule],\r\n})\r\nexport class AppModule {}\r\n";
    fs.writeFileSync(moduleFile, crlfCode, 'utf-8');

    const registered = registerInParentModule({
      parentModulePath: moduleFile,
      featureModuleClassName: 'UserModule',
      featureModuleImportPath: './user.module.js',
    });

    expect(registered).toBe(true);
    const code = fs.readFileSync(moduleFile, 'utf-8');
    expect(code).toContain('\r\n');
    expect(code).toMatch(/imports:\s*\[AuthModule,\s*UserModule\]/);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('aborts cleanly and does not modify file on syntax error / parse failure', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-syntax-err-'));
    const moduleFile = path.join(tmpDir, 'broken.module.ts');

    const brokenCode = `import { Module } from '@nestjs/common';
@Module({
  imports: [
// intentionally unterminated syntax here
`;
    fs.writeFileSync(moduleFile, brokenCode, 'utf-8');

    const registered = registerInParentModule({
      parentModulePath: moduleFile,
      featureModuleClassName: 'UserModule',
      featureModuleImportPath: './user.module.js',
    });

    expect(registered).toBe(false);
    const codeAfter = fs.readFileSync(moduleFile, 'utf-8');
    // File must be byte-for-byte identical, never corrupted
    expect(codeAfter).toBe(brokenCode);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

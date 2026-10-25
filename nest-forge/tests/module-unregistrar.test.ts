import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { registerInParentModule } from '../src/core/module-registrar.js';
import { unregisterFromParentModule } from '../src/core/module-unregistrar.js';

describe('module unregistrar (Undo)', () => {
  it('reverts parent module import and array entry cleanly', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-undo-'));
    const moduleFile = path.join(tmpDir, 'features.module.ts');

    fs.writeFileSync(moduleFile, `import { Module } from '@nestjs/common';
import { UserModule } from '@/features/user/user.module.js';

@Module({
  imports: [UserModule],
})
export class FeaturesModule {}
`, 'utf-8');

    // 1. Register
    registerInParentModule({
      parentModulePath: moduleFile,
      featureModuleClassName: 'PaymentModule',
      featureModuleImportPath: '@/features/payment/payment.module.js',
    });

    let code = fs.readFileSync(moduleFile, 'utf-8');
    expect(code).toContain('PaymentModule');

    // 2. Unregister (Undo)
    const undone = unregisterFromParentModule({
      parentModulePath: moduleFile,
      featureModuleClassName: 'PaymentModule',
    });

    expect(undone).toBe(true);

    code = fs.readFileSync(moduleFile, 'utf-8');
    expect(code).not.toContain('PaymentModule');
    expect(code).toContain('UserModule');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

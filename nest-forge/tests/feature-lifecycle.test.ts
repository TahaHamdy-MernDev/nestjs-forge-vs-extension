import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deleteFeature, renameFeature } from '../src/core/feature-lifecycle.js';

describe('feature lifecycle (delete & rename)', () => {
  it('deletes feature directory and unregisters from parent module', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-del-'));
    const parentModule = path.join(tmpDir, 'features.module.ts');
    const featureDir = path.join(tmpDir, 'billing');
    fs.mkdirSync(featureDir, { recursive: true });

    fs.writeFileSync(
      parentModule,
      `import { Module } from '@nestjs/common';
import { BillingModule } from './billing/billing.module.js';

@Module({
  imports: [BillingModule],
})
export class FeaturesModule {}
`,
      'utf-8',
    );

    fs.writeFileSync(
      path.join(featureDir, 'billing.module.ts'),
      `import { Module } from '@nestjs/common';
@Module({})
export class BillingModule {}
`,
      'utf-8',
    );

    const res = deleteFeature({
      featureDir,
      parentModulePath: parentModule,
    });

    expect(res.success).toBe(true);
    expect(fs.existsSync(featureDir)).toBe(false);

    const updatedParent = fs.readFileSync(parentModule, 'utf-8');
    expect(updatedParent).not.toContain('BillingModule');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('renames feature directory, files, class names, and updates parent module registration', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-ren-'));
    const parentModule = path.join(tmpDir, 'features.module.ts');
    const featureDir = path.join(tmpDir, 'order');
    const dtoDir = path.join(featureDir, 'dto');
    fs.mkdirSync(dtoDir, { recursive: true });

    fs.writeFileSync(
      parentModule,
      `import { Module } from '@nestjs/common';
import { OrderModule } from './order/order.module.js';

@Module({
  imports: [OrderModule],
})
export class FeaturesModule {}
`,
      'utf-8',
    );

    fs.writeFileSync(
      path.join(featureDir, 'order.module.ts'),
      `import { Module } from '@nestjs/common';
import { OrderService } from './order.service.js';

@Module({
  providers: [OrderService],
})
export class OrderModule {}
`,
      'utf-8',
    );

    fs.writeFileSync(
      path.join(featureDir, 'order.service.ts'),
      `import { Injectable } from '@nestjs/common';

@Injectable()
export class OrderService {}
`,
      'utf-8',
    );

    fs.writeFileSync(
      path.join(dtoDir, 'create-order.dto.ts'),
      `export class CreateOrderDto {}
`,
      'utf-8',
    );

    const res = renameFeature({
      featureDir,
      newFeatureName: 'invoice',
      parentModulePath: parentModule,
      conventions: { importExtension: '.js' },
    });

    expect(res.success).toBe(true);
    expect(res.newFeatureDir).toBe(path.join(tmpDir, 'invoice'));
    expect(fs.existsSync(featureDir)).toBe(false);
    expect(fs.existsSync(res.newFeatureDir!)).toBe(true);

    // Verify renamed files
    expect(fs.existsSync(path.join(res.newFeatureDir!, 'invoice.module.ts'))).toBe(true);
    expect(fs.existsSync(path.join(res.newFeatureDir!, 'invoice.service.ts'))).toBe(true);
    expect(fs.existsSync(path.join(res.newFeatureDir!, 'dto', 'create-invoice.dto.ts'))).toBe(true);

    // Verify updated content inside invoice.module.ts
    const modContent = fs.readFileSync(path.join(res.newFeatureDir!, 'invoice.module.ts'), 'utf-8');
    expect(modContent).toContain('InvoiceModule');
    expect(modContent).toContain('InvoiceService');
    expect(modContent).toContain('./invoice.service.js');

    // Verify updated parent module
    const parentContent = fs.readFileSync(parentModule, 'utf-8');
    expect(parentContent).not.toContain('OrderModule');
    expect(parentContent).toContain('InvoiceModule');
    expect(parentContent).toContain('./invoice/invoice.module.js');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

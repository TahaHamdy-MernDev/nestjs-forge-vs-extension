import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { detectConventions } from '../src/core/convention-detector.js';

describe('convention detector', () => {
  it('detects drizzle, class-validator, biome, and nodenext .js extensions', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-detect-'));

    // Mock package.json
    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        dependencies: {
          '@nestjs/drizzle': '^0.0.1',
          'drizzle-orm': '^1.0.0',
          'class-validator': '^0.14.0',
        },
        devDependencies: {
          '@biomejs/biome': '^1.9.0',
        },
      }),
    );

    // Mock tsconfig.json
    fs.writeFileSync(
      path.join(tmpDir, 'tsconfig.json'),
      JSON.stringify({
        compilerOptions: {
          moduleResolution: 'nodenext',
          paths: {
            '@/*': ['./src/*'],
          },
        },
      }),
    );

    // Mock features.module.ts
    fs.mkdirSync(path.join(tmpDir, 'src', 'features'), { recursive: true });
    fs.writeFileSync(
      path.join(tmpDir, 'src', 'features', 'features.module.ts'),
      '@Module({}) export class FeaturesModule {}',
    );

    const conventions = detectConventions(tmpDir);

    expect(conventions.orm).toBe('drizzle');
    expect(conventions.validator).toBe('class-validator');
    expect(conventions.formatter).toBe('biome');
    expect(conventions.importExtension).toBe('.js');
    expect(conventions.parentModule).toBe('src/features/features.module.ts');
    expect(conventions.pathAlias).toBe('@/features');
    expect(conventions.testRunner).toBe('jest');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('safely parses tsconfig.json containing single-line and block comments and trailing commas', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-jsonc-'));

    fs.writeFileSync(
      path.join(tmpDir, 'package.json'),
      JSON.stringify({
        devDependencies: {
          vitest: '^3.0.0',
        },
      }),
    );

    const commentedTsConfig = `{
      // Base configuration
      "compilerOptions": {
        /* Standard resolution */
        "moduleResolution": "NodeNext",
        "paths": {
          "@/*": ["./src/*"],
        }, // Trailing comma
      },
    }`;

    fs.writeFileSync(path.join(tmpDir, 'tsconfig.json'), commentedTsConfig, 'utf-8');

    const conventions = detectConventions(tmpDir);

    expect(conventions.importExtension).toBe('.js');
    expect(conventions.pathAlias).toBe('@/features');
    expect(conventions.testRunner).toBe('vitest');

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});

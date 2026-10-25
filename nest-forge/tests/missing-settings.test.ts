import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Item 7: Missing settings in contributes.configuration', () => {
  const pkgPath = path.resolve(__dirname, '../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
  const properties = pkg.contributes?.configuration?.properties || {};

  it('defines nestForge.formatter with correct type, enum, default, and description', () => {
    const formatterConfig = properties['nestForge.formatter'];
    expect(formatterConfig).toBeDefined();
    expect(formatterConfig.type).toBe('string');
    expect(formatterConfig.enum).toEqual(['biome', 'prettier', 'none']);
    expect(formatterConfig.default).toBe('biome');
    expect(typeof formatterConfig.description).toBe('string');
    expect(formatterConfig.description.length).toBeGreaterThan(0);
  });

  it('defines nestForge.validator with correct type, enum, default, and description', () => {
    const validatorConfig = properties['nestForge.validator'];
    expect(validatorConfig).toBeDefined();
    expect(validatorConfig.type).toBe('string');
    expect(validatorConfig.enum).toEqual(['class-validator', 'zod', 'none']);
    expect(validatorConfig.default).toBe('class-validator');
    expect(typeof validatorConfig.description).toBe('string');
    expect(validatorConfig.description.length).toBeGreaterThan(0);
  });
});

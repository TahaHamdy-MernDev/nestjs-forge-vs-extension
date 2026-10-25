import { describe, expect, it } from 'vitest';
import { generateTranslationsContent } from '../src/i18n/type-generator.js';

describe('i18n type generator', () => {
  it('generates zero-codegen module augmentation for @nestjs/i18n', () => {
    const namespaces = ['auth', 'order-items', 'users'];
    const output = generateTranslationsContent(namespaces, 'en');

    // Should import each catalog JSON type
    expect(output).toContain("import type auth from './en/auth.json';");
    expect(output).toContain("import type orderItems from './en/order-items.json';");
    expect(output).toContain("import type users from './en/users.json';");

    // Should build Translations interface
    expect(output).toContain('export interface Translations {');
    expect(output).toContain('  auth: typeof auth;');
    expect(output).toContain('  "order-items": typeof orderItems;');
    expect(output).toContain('  users: typeof users;');

    // Should augment @nestjs/i18n
    expect(output).toContain("declare module '@nestjs/i18n' {");
    expect(output).toContain('  interface I18nTypes {');
    expect(output).toContain('    translations: Translations;');
    expect(output).toContain('  }');
  });

  it('handles empty namespaces gracefully', () => {
    const output = generateTranslationsContent([], 'en');
    expect(output).toContain('export interface Translations {');
    expect(output).toContain("declare module '@nestjs/i18n' {");
  });

  it('handles custom default locale', () => {
    const namespaces = ['common'];
    const output = generateTranslationsContent(namespaces, 'ar');
    expect(output).toContain("import type common from './ar/common.json';");
  });
});

import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { deriveNames } from '../src/core/naming.js';
import { TemplateRenderer } from '../src/core/renderer.js';
import type { FeatureFormState, ProjectConventions } from '../src/core/types.js';

describe('renderer i18n templates', () => {
  const templatesDir = path.resolve(__dirname, '../src/templates');
  const renderer = new TemplateRenderer(templatesDir);

  const conventions: ProjectConventions = {
    featuresDir: 'src/features',
    importExtension: '.js',
    pathAlias: '@/features',
    orm: 'drizzle',
    controllerVersion: '1',
    paramStyle: 'snake_case',
    parentModule: 'src/features/features.module.ts',
    validator: 'class-validator',
    formatter: 'biome',
    i18nDir: 'src/i18n',
  };

  const state: FeatureFormState = {
    featureName: 'customer',
    targetPath: 'src/features/customer',
    parentModulePath: 'src/features/features.module.ts',
    serviceFileName: 'customer.service.ts',
    controllerFileName: 'customer.controller.ts',
    moduleFileName: 'customer.module.ts',
    includeRepository: false,
    repositoryFileName: 'customer.repository.ts',
    includeInterface: false,
    interfaceFileName: 'customer.interface.ts',
    includeSpecs: false,
    dtoFiles: [],
    includeEvents: false,
    eventFiles: [],
    includeListeners: false,
    listenerFiles: [],
    includeI18n: true,
  };

  const names = deriveNames('customer');
  const context = { names, conventions, state };

  it('renders valid English catalog JSON with humanized CRUD messages', () => {
    const raw = renderer.render('i18n-en', context);
    const parsed = JSON.parse(raw);

    expect(parsed.CREATED).toContain('Customer created successfully.');
    expect(parsed.UPDATED).toContain('Customer updated successfully.');
    expect(parsed.DELETED).toContain('Customer removed successfully.');
    expect(parsed.NOT_FOUND).toContain("We couldn't find this customer.");
    expect(parsed.ALREADY_EXISTS).toContain('This customer already exists.');
  });

  it('renders valid Arabic catalog JSON with humanized CRUD messages and proper typography', () => {
    const raw = renderer.render('i18n-ar', context);
    const parsed = JSON.parse(raw);

    expect(parsed.CREATED).toContain('تم إنشاء Customer بنجاح.');
    expect(parsed.UPDATED).toContain('تم حفظ تعديلات Customer بنجاح.');
    expect(parsed.DELETED).toContain('تم حذف Customer بنجاح.');
    expect(parsed.NOT_FOUND).toContain('لم نتمكن من العثور على Customer المطلوب.');
    expect(parsed.ALREADY_EXISTS).toContain('هذا السجل مسجل بالفعل في النظام.');
  });

  it('uses custom feature titles when provided in context', () => {
    const customContext = {
      ...context,
      featureTitleEn: 'Client Profile',
      featureTitleAr: 'ملف العميل',
    };

    const enRaw = renderer.render('i18n-en', customContext);
    const enParsed = JSON.parse(enRaw);
    expect(enParsed.CREATED).toBe('Client Profile created successfully.');
    expect(enParsed.NOT_FOUND).toBe("We couldn't find this client profile.");

    const arRaw = renderer.render('i18n-ar', customContext);
    const arParsed = JSON.parse(arRaw);
    expect(arParsed.CREATED).toBe('تم إنشاء ملف العميل بنجاح.');
    expect(arParsed.NOT_FOUND).toBe('لم نتمكن من العثور على ملف العميل المطلوب.');
  });
});

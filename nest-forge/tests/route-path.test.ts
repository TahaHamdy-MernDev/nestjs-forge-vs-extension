import { describe, expect, it } from 'vitest';
import { validateRoutePath } from '../src/core/path-validator.js';
import { buildPlan } from '../src/core/planner.js';
import type { FeatureFormState, ProjectConventions } from '../src/core/types.js';

describe('CORR-03: Route Path validation and planning', () => {
  const conventions: ProjectConventions = {
    featuresDir: 'src/features',
    importExtension: '.js',
    pathAlias: '@/features',
    orm: 'drizzle',
    controllerVersion: '1',
    paramStyle: 'camelCase',
    parentModule: 'src/features/features.module.ts',
    validator: 'class-validator',
    formatter: 'none',
  };

  const baseState: FeatureFormState = {
    featureName: 'order-item',
    targetPath: 'src/features/order-item',
    parentModulePath: 'src/features/features.module.ts',
    serviceFileName: 'order-item.service.ts',
    controllerFileName: 'order-item.controller.ts',
    moduleFileName: 'order-item.module.ts',
    includeRepository: false,
    repositoryFileName: 'order-item.repository.ts',
    includeInterface: false,
    interfaceFileName: 'order-item.interface.ts',
    includeSpecs: false,
    dtoFiles: [],
    includeEvents: false,
    eventFiles: [],
    includeListeners: false,
    listenerFiles: [],
  };

  describe('validateRoutePath', () => {
    it('allows valid alphanumeric paths with hyphens, underscores, slashes, and colons', () => {
      const res = validateRoutePath('api/v1/order-items/:id');
      expect(res.valid).toBe(true);
      expect(res.sanitized).toBe('api/v1/order-items/:id');
    });

    it('strips leading and trailing slashes', () => {
      const res = validateRoutePath('///v1/orders///');
      expect(res.valid).toBe(true);
      expect(res.sanitized).toBe('v1/orders');
    });

    it('handles empty or undefined route path gracefully', () => {
      expect(validateRoutePath(undefined).valid).toBe(true);
      expect(validateRoutePath(undefined).sanitized).toBe('');
      expect(validateRoutePath('').valid).toBe(true);
      expect(validateRoutePath('   ').valid).toBe(true);
      expect(validateRoutePath('///').sanitized).toBe('');
    });

    it('rejects single quotes, double quotes, and backticks', () => {
      expect(validateRoutePath("orders'").valid).toBe(false);
      expect(validateRoutePath('orders"').valid).toBe(false);
      expect(validateRoutePath('orders`').valid).toBe(false);
    });

    it('rejects template literals and expressions (${...})', () => {
      expect(validateRoutePath('orders/${id}').valid).toBe(false);
      expect(validateRoutePath('${evil}').valid).toBe(false);
    });

    it('rejects spaces, semicolons, and other invalid characters', () => {
      expect(validateRoutePath('orders list').valid).toBe(false);
      expect(validateRoutePath('orders;drop').valid).toBe(false);
      expect(validateRoutePath('orders@v1').valid).toBe(false);
      expect(validateRoutePath('orders!').valid).toBe(false);
    });
  });

  describe('buildPlan with custom routePath', () => {
    it('uses custom routePath in flat mode controller plan', () => {
      const state: FeatureFormState = {
        ...baseState,
        routePath: '/custom-order-items/',
      };
      const plans = buildPlan(state, conventions, '/workspace');
      const ctrlPlan = plans.find((p) => p.templateName === 'controller');
      expect(ctrlPlan).toBeDefined();
      expect(ctrlPlan?.context.routePath).toBe('custom-order-items');
    });

    it('falls back to pluralKebab when routePath is empty in flat mode', () => {
      const state: FeatureFormState = {
        ...baseState,
        routePath: '',
      };
      const plans = buildPlan(state, conventions, '/workspace');
      const ctrlPlan = plans.find((p) => p.templateName === 'controller');
      expect(ctrlPlan).toBeDefined();
      expect(ctrlPlan?.context.routePath).toBe('order-items');
    });

    it('uses custom routePath in grouped mode controller plan', () => {
      const state: FeatureFormState = {
        ...baseState,
        structureMode: 'grouped',
        controllerFiles: [{ name: 'order-item' }],
        routePath: 'api/orders',
      };
      const plans = buildPlan(state, conventions, '/workspace');
      const ctrlPlan = plans.find((p) => p.templateName === 'controller');
      expect(ctrlPlan).toBeDefined();
      expect(ctrlPlan?.context.routePath).toBe('api/orders');
    });

    it('throws error in buildPlan if malicious routePath is provided', () => {
      const state: FeatureFormState = {
        ...baseState,
        routePath: "orders', malicious: true",
      };
      expect(() => buildPlan(state, conventions, '/workspace')).toThrow(/Invalid route path/);
    });
  });
});

import { describe, expect, it } from 'vitest';
import { deriveNames, pluralize, validateIdentifier } from '../src/core/naming.js';

describe('CORR-09: Naming correctness and identifier validation', () => {
  describe('pluralize avoids double pluralization', () => {
    it('does not double-pluralize users to userses', () => {
      expect(pluralize('users')).toBe('users');
    });

    it('handles all required words correctly', () => {
      expect(pluralize('users')).toBe('users');
      expect(pluralize('orders')).toBe('orders');
      expect(pluralize('roles')).toBe('roles');
      expect(pluralize('categories')).toBe('categories');
      expect(pluralize('addresses')).toBe('addresses');
      expect(pluralize('buses')).toBe('buses');
      expect(pluralize('status')).toBe('statuses');
      expect(pluralize('news')).toBe('news');
      expect(pluralize('auth')).toBe('auth');
      expect(pluralize('index')).toBe('indexes');
    });

    it('still pluralizes singular forms properly', () => {
      expect(pluralize('user')).toBe('users');
      expect(pluralize('order')).toBe('orders');
      expect(pluralize('role')).toBe('roles');
      expect(pluralize('category')).toBe('categories');
      expect(pluralize('address')).toBe('addresses');
      expect(pluralize('bus')).toBe('buses');
    });
  });

  describe('validateIdentifier', () => {
    it('accepts valid identifiers', () => {
      expect(validateIdentifier('order').valid).toBe(true);
      expect(validateIdentifier('order-item').valid).toBe(true);
      expect(validateIdentifier('order_item').valid).toBe(true);
      expect(validateIdentifier('order.item').valid).toBe(true);
      expect(validateIdentifier('order123').valid).toBe(true);
      expect(validateIdentifier('order-123').valid).toBe(true);
      expect(validateIdentifier('User').valid).toBe(true);
    });

    it('rejects identifiers that do not start with a letter', () => {
      const numRes = validateIdentifier('123-order');
      expect(numRes.valid).toBe(false);
      expect(numRes.error).toMatch(/must start with a letter/i);

      const dashRes = validateIdentifier('-order');
      expect(dashRes.valid).toBe(false);
      expect(dashRes.error).toMatch(/must start with a letter/i);

      const underRes = validateIdentifier('_order');
      expect(underRes.valid).toBe(false);
      expect(underRes.error).toMatch(/must start with a letter/i);
    });

    it('rejects identifiers with invalid characters', () => {
      const atRes = validateIdentifier('user@profile');
      expect(atRes.valid).toBe(false);
      expect(atRes.error).toMatch(/can only contain letters, digits, '\.', '_', and '-'/i);

      const spaceRes = validateIdentifier('user profile');
      expect(spaceRes.valid).toBe(false);

      const slashRes = validateIdentifier('user/profile');
      expect(slashRes.valid).toBe(false);
    });

    it('rejects empty or whitespace-only identifiers', () => {
      expect(validateIdentifier('').valid).toBe(false);
      expect(validateIdentifier('   ').valid).toBe(false);
    });
  });

  describe('deriveNames with identifier validation', () => {
    it('returns empty names for invalid identifiers like 123-order or user@profile', () => {
      expect(deriveNames('123-order').kebab).toBe('');
      expect(deriveNames('user@profile').kebab).toBe('');
    });
  });
});

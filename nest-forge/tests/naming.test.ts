import { describe, expect, it } from 'vitest';
import { deriveNames, pluralize, splitWords } from '../src/core/naming.js';

describe('naming utils', () => {
  it('splits words correctly from various formats', () => {
    expect(splitWords('user')).toEqual(['user']);
    expect(splitWords('order-item')).toEqual(['order', 'item']);
    expect(splitWords('OrderItem')).toEqual(['order', 'item']);
    expect(splitWords('order_item')).toEqual(['order', 'item']);
    expect(splitWords('orderItem')).toEqual(['order', 'item']);
    expect(splitWords('payment-gateway-transaction')).toEqual(['payment', 'gateway', 'transaction']);
  });

  it('pluralizes correctly with English rules and irregulars', () => {
    expect(pluralize('user')).toBe('users');
    expect(pluralize('item')).toBe('items');
    expect(pluralize('category')).toBe('categories');
    expect(pluralize('company')).toBe('companies');
    expect(pluralize('status')).toBe('statuses');
    expect(pluralize('tax')).toBe('taxes');
    expect(pluralize('box')).toBe('boxes');
    expect(pluralize('match')).toBe('matches');
    expect(pluralize('person')).toBe('people');
    expect(pluralize('child')).toBe('children');
  });

  it('derives all casing variants for a multi-word feature', () => {
    const names = deriveNames('order-item');
    expect(names.kebab).toBe('order-item');
    expect(names.pascal).toBe('OrderItem');
    expect(names.camel).toBe('orderItem');
    expect(names.snake).toBe('order_item');
    expect(names.pluralKebab).toBe('order-items');
    expect(names.pluralPascal).toBe('OrderItems');
    expect(names.pluralCamel).toBe('orderItems');
    expect(names.pluralSnake).toBe('order_items');
  });

  it('derives all casing variants for a single-word feature ending in y', () => {
    const names = deriveNames('category');
    expect(names.kebab).toBe('category');
    expect(names.pascal).toBe('Category');
    expect(names.camel).toBe('category');
    expect(names.snake).toBe('category');
    expect(names.pluralKebab).toBe('categories');
    expect(names.pluralPascal).toBe('Categories');
  });
});

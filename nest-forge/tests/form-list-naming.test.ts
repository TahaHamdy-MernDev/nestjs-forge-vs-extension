import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vm from 'node:vm';
import { describe, expect, it } from 'vitest';

describe('Grouped subfolder list naming helper (list-naming.js)', () => {
  const code = fs.readFileSync(
    path.resolve(__dirname, '../src/webview/ui/list-naming.js'),
    'utf-8',
  );

  const sandbox: any = {};
  vm.createContext(sandbox);
  vm.runInContext(code, sandbox);
  const naming = sandbox.NestForgeListNaming;

  it('exports expected helper functions and roles', () => {
    expect(naming).toBeDefined();
    expect(naming.ROLES).toBeDefined();
    expect(typeof naming.autoName).toBe('function');
    expect(typeof naming.itemName).toBe('function');
    expect(typeof naming.nextItem).toBe('function');
    expect(typeof naming.applyEdit).toBe('function');
  });

  it('first item for feature "taha" is "taha" without prefix or suffix', () => {
    const item = { suffix: '' };
    expect(naming.itemName(item, 'taha')).toBe('taha');
  });

  it('autoName produces kebab for empty suffix, kebab-suffix otherwise, or dot suffix', () => {
    expect(naming.autoName('taha', '')).toBe('taha');
    expect(naming.autoName('taha', 'admin')).toBe('taha-admin');
    expect(naming.autoName('taha', '.handler')).toBe('taha.handler');
  });

  it('auto rows track feature rename (taha -> order)', () => {
    const row1 = { suffix: '' };
    const row2 = { suffix: 'admin' };
    const row3 = { suffix: 'cache' };

    expect(naming.itemName(row1, 'taha')).toBe('taha');
    expect(naming.itemName(row2, 'taha')).toBe('taha-admin');
    expect(naming.itemName(row3, 'taha')).toBe('taha-cache');

    expect(naming.itemName(row1, 'order')).toBe('order');
    expect(naming.itemName(row2, 'order')).toBe('order-admin');
    expect(naming.itemName(row3, 'order')).toBe('order-cache');
  });

  it('custom edited rows survive feature rename', () => {
    const customRow = { suffix: 'admin', custom: 'special-ctrl' };
    expect(naming.itemName(customRow, 'taha')).toBe('special-ctrl');
    expect(naming.itemName(customRow, 'order')).toBe('special-ctrl');
  });

  it('applyEdit turns custom back to auto if user retypes the auto name', () => {
    const row = { suffix: 'admin' };
    const edited = naming.applyEdit(row, 'custom-admin', 'taha');
    expect(edited.custom).toBe('custom-admin');

    const reverted = naming.applyEdit(edited, 'taha-admin', 'taha');
    expect(reverted.custom).toBeUndefined();
    expect(reverted.suffix).toBe('admin');
  });

  it('nextItem picks sequentially from roles and never creates duplicates', () => {
    const list: any[] = [{ suffix: '' }];
    const next1 = naming.nextItem('ctrl', list, 'taha');
    expect(next1.suffix).toBe('admin');
    list.push(next1);

    const next2 = naming.nextItem('ctrl', list, 'taha');
    expect(next2.suffix).toBe('public');
    list.push(next2);

    const next3 = naming.nextItem('ctrl', list, 'taha');
    expect(next3.suffix).toBe('internal');
    list.push(next3);

    const names = list.map((i) => naming.itemName(i, 'taha'));
    expect(names).toEqual(['taha', 'taha-admin', 'taha-public', 'taha-internal']);
    expect(new Set(names).size).toBe(4);
  });

  it('providers 2nd item is .handler', () => {
    const list: any[] = [{ suffix: '' }];
    const next = naming.nextItem('provider', list, 'taha');
    expect(next.suffix).toBe('.handler');
    list.push(next);
    expect(naming.itemName(list[1], 'taha')).toBe('taha.handler');
  });

  it('exhausted roles fall back to numbers (e.g. taha-2, taha-3)', () => {
    const list: any[] = [
      { suffix: '' },
      { suffix: 'admin' },
      { suffix: 'public' },
      { suffix: 'internal' },
      { suffix: 'webhook' },
    ];
    const fallback = naming.nextItem('ctrl', list, 'taha');
    expect(fallback.suffix).toBe('2');
    expect(naming.itemName(fallback, 'taha')).toBe('taha-2');
  });

  it('form.js does not contain hardcoded "admin", "token", "session", "drizzle-" seeds', () => {
    const formJs = fs.readFileSync(
      path.resolve(__dirname, '../src/webview/ui/form.js'),
      'utf-8',
    );
    expect(formJs).not.toMatch(/groupedCtrlList\.push\(['"]admin['"]\)/);
    expect(formJs).not.toMatch(/groupedSrvList\.push\(['"]token['"]\)/);
    expect(formJs).not.toMatch(/storeList\.push\(['"]session['"]\)/);
    expect(formJs).not.toMatch(/providerList\.push\(['"]token-auth['"]\)/);
    expect(formJs).not.toMatch(/storeList\s*=\s*\[`drizzle-/);
    expect(formJs).not.toMatch(/providerList\s*=\s*\['session-auth'\]/);
  });
});

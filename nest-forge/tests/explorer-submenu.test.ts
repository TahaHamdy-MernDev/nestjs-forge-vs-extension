import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('Item 6: Explorer context submenu', () => {
  const pkgPath = path.resolve(__dirname, '../package.json');
  const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

  const expectedCommands = [
    'nestForge.newFeature',
    'nestForge.addController',
    'nestForge.addService',
    'nestForge.addRepository',
    'nestForge.addProvider',
    'nestForge.addStore',
    'nestForge.addPolicy',
    'nestForge.addProcessor',
    'nestForge.addTask',
    'nestForge.injectInto',
    'nestForge.addDto',
    'nestForge.addEvent',
    'nestForge.addListener',
    'nestForge.addI18nCatalog',
    'nestForge.initI18n',
    'nestForge.renameFeature',
    'nestForge.deleteFeature',
  ];

  it('defines a Nest Forge submenu in contributes.submenus', () => {
    const submenus = pkg.contributes?.submenus || [];
    const nestSubmenu = submenus.find((s: any) => s.label === 'Nest Forge');
    expect(nestSubmenu).toBeDefined();
    expect(nestSubmenu.id).toBeDefined();
  });

  it('references the submenu in contributes.menus["explorer/context"]', () => {
    const submenus = pkg.contributes?.submenus || [];
    const nestSubmenu = submenus.find((s: any) => s.label === 'Nest Forge');
    const explorerMenu = pkg.contributes?.menus?.['explorer/context'] || [];

    expect(explorerMenu).toHaveLength(1);
    expect(explorerMenu[0].submenu).toBe(nestSubmenu.id);
  });

  it('groups all 17 commands inside the submenu with their original when clauses', () => {
    const submenus = pkg.contributes?.submenus || [];
    const nestSubmenu = submenus.find((s: any) => s.label === 'Nest Forge');
    const submenuItems = pkg.contributes?.menus?.[nestSubmenu.id] || [];

    expect(submenuItems).toHaveLength(17);

    const commandsInSubmenu = submenuItems.map((item: any) => item.command);
    for (const expectedCmd of expectedCommands) {
      expect(commandsInSubmenu).toContain(expectedCmd);
    }

    const injectItem = submenuItems.find((item: any) => item.command === 'nestForge.injectInto');
    expect(injectItem?.when).toBe('!explorerResourceIsFolder && resourceExtname == .ts');

    const folderItems = submenuItems.filter((item: any) => item.command !== 'nestForge.injectInto');
    for (const item of folderItems) {
      expect(item.when).toBe('explorerResourceIsFolder');
    }
  });
});

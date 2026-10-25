import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PERF-01: Activation events hygiene', () => {
  const packageJsonPath = path.resolve(__dirname, '../package.json');
  const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));
  const events: string[] = pkg.activationEvents || [];

  it('removes eager onLanguage events', () => {
    expect(events).not.toContain('onLanguage:typescript');
    expect(events).not.toContain('onLanguage:typescriptreact');
    expect(events).not.toContain('onLanguage:json');
    expect(events).not.toContain('onLanguage:jsonc');
  });

  it('removes expensive node_modules scanning', () => {
    expect(events).not.toContain('workspaceContains:**/node_modules/@nestjs/core');
  });

  it('includes targeted workspaceContains for nest-cli.json and i18n folders', () => {
    const hasNestCli = events.some((e) => e.includes('nest-cli.json'));
    expect(hasNestCli).toBe(true);

    const hasI18n = events.some((e) => e.includes('i18n'));
    expect(hasI18n).toBe(true);
  });

  it('preserves on demand activation for all contributed views', () => {
    expect(events).toContain('onView:nestForge.featuresView');
    expect(events).toContain('onView:nestForge.i18nKeysView');
    expect(events).toContain('onView:nestForge.i18nParityView');
  });

  it('preserves on demand activation for all contributed commands', () => {
    const contributedCommands: { command: string }[] = pkg.contributes?.commands || [];
    for (const cmd of contributedCommands) {
      expect(events).toContain(`onCommand:${cmd.command}`);
    }
  });
});

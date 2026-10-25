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

  it('does not contain redundant onCommand entries since engines.vscode >= 1.74', () => {
    const onCommands = events.filter((e) => e.startsWith('onCommand:'));
    expect(onCommands).toEqual([]);
  });

  it('does not contain overly broad i18n workspaceContains triggers', () => {
    expect(events).not.toContain('workspaceContains:**/i18n/**');
    expect(events).not.toContain('workspaceContains:i18n/**');
  });

  it('contains exactly the required targeted activation events', () => {
    expect(events).toEqual([
      'onView:nestForge.featuresView',
      'onView:nestForge.i18nKeysView',
      'onView:nestForge.i18nParityView',
      'workspaceContains:**/nest-cli.json',
      'workspaceContains:nest-cli.json',
      'workspaceContains:**/src/i18n/**',
      'workspaceContains:src/i18n/**',
    ]);
  });
});

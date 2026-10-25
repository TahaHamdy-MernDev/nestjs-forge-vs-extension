import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { formatFiles } from '../core/formatter.js';

function toCamelCase(str: string): string {
  return str
    .replace(/[-_. ]+([a-zA-Z0-9])/g, (_, char) => char.toUpperCase())
    .replace(/^([A-Z])/, (char) => char.toLowerCase());
}

export function generateTranslationsContent(
  namespaces: string[],
  defaultLocale = 'en',
): string {
  const sorted = [...namespaces].sort();
  const imports: string[] = [];
  const properties: string[] = [];

  for (const ns of sorted) {
    let importId = toCamelCase(ns);
    // Ensure importId is a valid JS identifier
    if (!/^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(importId)) {
      importId = `ns_${importId.replace(/[^a-zA-Z0-9_$]/g, '_')}`;
    }
    imports.push(`import type ${importId} from './${defaultLocale}/${ns}.json';`);

    const key = /^[a-zA-Z_$][a-zA-Z0-9_$]*$/.test(ns) ? ns : JSON.stringify(ns);
    properties.push(`  ${key}: typeof ${importId};`);
  }

  const lines: string[] = [];
  if (imports.length > 0) {
    lines.push(imports.join('\n'));
    lines.push('');
  }

  lines.push('export interface Translations {');
  if (properties.length > 0) {
    lines.push(properties.join('\n'));
  }
  lines.push('}');
  lines.push('');
  lines.push("declare module '@nestjs/i18n' {");
  lines.push('  interface I18nTypes {');
  lines.push('    translations: Translations;');
  lines.push('  }');
  lines.push('}');
  lines.push('');

  return lines.join('\n');
}

export class TranslationsTypeGenerator implements vscode.Disposable {
  private timer: NodeJS.Timeout | null = null;
  private isGenerating = false;
  private outputChannel: vscode.OutputChannel;
  private statusBarItem: vscode.StatusBarItem;

  constructor(
    private readonly workspaceRoot: string,
    private readonly getI18nDir: () => string | null,
  ) {
    this.outputChannel = vscode.window.createOutputChannel('Nest Forge i18n Types');
    this.statusBarItem = vscode.window.createStatusBarItem(
      vscode.StatusBarAlignment.Right,
      100,
    );
    this.statusBarItem.command = 'nestForge.i18n.generateTypes';
    this.statusBarItem.tooltip = 'Click to sync src/i18n/translations.ts (@nestjs/i18n types)';
  }

  public triggerGeneration(delayMs = 400): void {
    const isEnabled = vscode.workspace
      .getConfiguration('nestForge')
      .get<boolean>('i18nAutoSyncTypes', true);

    if (!isEnabled) return;

    if (this.timer) {
      clearTimeout(this.timer);
    }

    this.timer = setTimeout(() => {
      this.generate();
    }, delayMs);
  }

  public async generate(): Promise<boolean> {
    if (this.isGenerating) return false;
    this.isGenerating = true;

    this.statusBarItem.text = '$(sync~spin) i18n: Syncing Types...';
    this.statusBarItem.show();

    const i18nDir = this.getI18nDir();
    if (!i18nDir || !fs.existsSync(i18nDir)) {
      this.isGenerating = false;
      this.statusBarItem.hide();
      return false;
    }

    const defaultLocale = vscode.workspace
      .getConfiguration('nestForge')
      .get<string>('i18nDefaultLocale', 'en');

    try {
      let scanDir = path.join(i18nDir, defaultLocale);
      if (!fs.existsSync(scanDir)) {
        // Fallback to first directory found in i18nDir
        const entries = fs.readdirSync(i18nDir, { withFileTypes: true });
        const firstDir = entries.find((e) => e.isDirectory());
        if (firstDir) {
          scanDir = path.join(i18nDir, firstDir.name);
        }
      }

      const namespaces: string[] = [];
      if (fs.existsSync(scanDir)) {
        const files = fs.readdirSync(scanDir);
        for (const file of files) {
          if (file.endsWith('.json')) {
            namespaces.push(file.replace(/\.json$/, ''));
          }
        }
      }

      const targetFile = path.join(i18nDir, 'translations.ts');
      const content = generateTranslationsContent(namespaces, defaultLocale);

      fs.writeFileSync(targetFile, content, 'utf-8');

      // Format using user's configured formatter (biome/prettier)
      const formatter = vscode.workspace
        .getConfiguration('nestForge')
        .get<'biome' | 'prettier' | 'none'>('formatter', 'biome');
      await formatFiles([targetFile], this.workspaceRoot, formatter);

      this.outputChannel.appendLine(
        `[${new Date().toLocaleTimeString()}] Synced ${namespaces.length} namespaces into ${path.relative(this.workspaceRoot, targetFile)}`,
      );

      this.statusBarItem.text = '$(check) i18n: Types Synced';
      setTimeout(() => {
        this.statusBarItem.hide();
      }, 3000);

      this.isGenerating = false;
      return true;
    } catch (err: any) {
      this.isGenerating = false;
      this.outputChannel.appendLine(`❌ Type sync failed: ${err?.message || err}`);
      this.statusBarItem.text = '$(error) i18n: Type Error';
      return false;
    }
  }

  public dispose(): void {
    if (this.timer) {
      clearTimeout(this.timer);
    }
    this.statusBarItem.dispose();
    this.outputChannel.dispose();
  }
}

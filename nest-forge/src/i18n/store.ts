import * as fs from 'node:fs';
import * as path from 'node:path';
import * as vscode from 'vscode';
import { validateSafeFileName, validateWorkspacePath } from '../core/path-validator.js';
import { ArabicTypographyIssue, lintArabicText } from './arabic-linter.js';

export interface TranslationEntry {
  key: string;
  namespace: string;
  values: Record<string, string>;
  locations: Record<string, { uri: vscode.Uri; range: vscode.Range }>;
  isPlural?: boolean;
}

export interface ParityIssueItem {
  key: string;
  sourceLang: string;
  targetLang: string;
  sourceValue: string;
  sourceLocation?: { uri: vscode.Uri; range: vscode.Range };
}

export interface EmptyValueIssueItem {
  key: string;
  lang: string;
  location?: { uri: vscode.Uri; range: vscode.Range };
}

export interface PlaceholderMismatchItem {
  key: string;
  enTokens: string[];
  arTokens: string[];
  location?: { uri: vscode.Uri; range: vscode.Range };
}

export interface ParityCheckResult {
  ok: boolean;
  totalKeys: number;
  missingInAr: ParityIssueItem[];
  missingInEn: ParityIssueItem[];
  emptyValues: EmptyValueIssueItem[];
  placeholderMismatches: PlaceholderMismatchItem[];
  typographyIssues: ArabicTypographyIssue[];
}

const PLURAL_KEYS = new Set(['zero', 'one', 'two', 'few', 'many', 'other']);

function isPluralObject(obj: unknown): boolean {
  if (!obj || typeof obj !== 'object' || Array.isArray(obj)) return false;
  const keys = Object.keys(obj);
  if (keys.length === 0) return false;
  return keys.every((k) => PLURAL_KEYS.has(k));
}

export class TranslationStore {
  private entries = new Map<string, TranslationEntry>();
  private namespaces = new Set<string>();
  private languages = new Set<string>();
  private i18nDir: string | null = null;

  private _onDidUpdate = new vscode.EventEmitter<void>();
  public readonly onDidUpdate = this._onDidUpdate.event;

  constructor(private readonly workspaceRoot: string) {
    this.detectI18nDir();
  }

  public detectI18nDir(): void {
    const configured = vscode.workspace
      .getConfiguration('nestForge')
      .get<string>('i18nDir', 'src/i18n');

    const candidates = [
      path.isAbsolute(configured) ? configured : path.join(this.workspaceRoot, configured),
      path.join(this.workspaceRoot, 'src', 'i18n'),
      path.join(this.workspaceRoot, 'api', 'src', 'i18n'),
      path.join(this.workspaceRoot, 'i18n'),
    ];

    for (const cand of candidates) {
      if (fs.existsSync(cand) && fs.statSync(cand).isDirectory()) {
        this.i18nDir = cand;
        return;
      }
    }

    // Default to configured path even if it doesn't exist yet
    this.i18nDir = path.isAbsolute(configured)
      ? configured
      : path.join(this.workspaceRoot, configured);
  }

  public getI18nDirectory(): string | null {
    if (!this.i18nDir || !fs.existsSync(this.i18nDir)) {
      this.detectI18nDir();
    }
    return this.i18nDir;
  }

  public reload(): void {
    this.entries.clear();
    this.namespaces.clear();
    this.languages.clear();

    const i18nDir = this.getI18nDirectory();
    if (!i18nDir || !fs.existsSync(i18nDir)) {
      this._onDidUpdate.fire();
      return;
    }

    try {
      const langEntries = fs.readdirSync(i18nDir, { withFileTypes: true });
      for (const langDirent of langEntries) {
        if (!langDirent.isDirectory()) continue;
        const lang = langDirent.name;
        this.languages.add(lang);

        const langDir = path.join(i18nDir, lang);
        const files = fs.readdirSync(langDir);

        for (const file of files) {
          if (!file.endsWith('.json')) continue;
          const namespace = file.replace(/\.json$/, '');
          this.namespaces.add(namespace);

          const filePath = path.join(langDir, file);
          const uri = vscode.Uri.file(filePath);

          try {
            const content = fs.readFileSync(filePath, 'utf8');
            const parsed = JSON.parse(content);
            const keyLocations = this.findKeyLocations(content, namespace, uri);

            this.flattenObject(parsed, namespace, (fullKey, val, isPlural) => {
              let entry = this.entries.get(fullKey);
              if (!entry) {
                entry = {
                  key: fullKey,
                  namespace,
                  values: {},
                  locations: {},
                  isPlural,
                };
                this.entries.set(fullKey, entry);
              }

              entry.values[lang] = val;
              if (isPlural) {
                entry.isPlural = true;
              }

              const loc = keyLocations.get(fullKey);
              if (loc) {
                entry.locations[lang] = loc;
              } else {
                entry.locations[lang] = {
                  uri,
                  range: new vscode.Range(0, 0, 0, 0),
                };
              }
            });
          } catch (err) {
            console.error(`[Nest Forge i18n] Failed to parse ${filePath}:`, err);
          }
        }
      }
    } catch (err) {
      console.error('[Nest Forge i18n] Error reading i18n directory:', err);
    }

    this._onDidUpdate.fire();
  }

  private flattenObject(
    obj: Record<string, unknown>,
    prefix: string,
    callback: (fullKey: string, val: string, isPlural?: boolean) => void,
  ) {
    for (const [k, v] of Object.entries(obj)) {
      const full = prefix ? `${prefix}.${k}` : k;

      if (isPluralObject(v)) {
        // Register the parent key as a plural entry (e.g. 'orders.items')
        const pluralSummary = Object.entries(v as Record<string, string>)
          .map(([pk, pv]) => `${pk}: "${pv}"`)
          .join(', ');
        callback(full, `{${pluralSummary}}`, true);

        // Also register individual plural forms so specific keys can still be matched
        for (const [pk, pv] of Object.entries(v as Record<string, string>)) {
          if (typeof pv === 'string') {
            callback(`${full}.${pk}`, pv, false);
          }
        }
      } else if (v && typeof v === 'object' && !Array.isArray(v)) {
        this.flattenObject(v as Record<string, unknown>, full, callback);
      } else if (typeof v === 'string') {
        callback(full, v, false);
      }
    }
  }

  private findKeyLocations(
    content: string,
    namespace: string,
    uri: vscode.Uri,
  ): Map<string, { uri: vscode.Uri; range: vscode.Range }> {
    const locations = new Map<
      string,
      { uri: vscode.Uri; range: vscode.Range }
    >();
    const lines = content.split('\n');
    const pathStack: { key: string; indent: number }[] = [];

    for (let lineIdx = 0; lineIdx < lines.length; lineIdx++) {
      const line = lines[lineIdx];
      const match = line.match(/^(\s*)"([^"]+)"\s*:\s*(.*)$/);
      if (!match) continue;

      const indent = match[1].length;
      const keySegment = match[2];
      const afterColon = match[3].trim();

      while (
        pathStack.length > 0 &&
        pathStack[pathStack.length - 1].indent >= indent
      ) {
        pathStack.pop();
      }

      pathStack.push({ key: keySegment, indent });
      const currentPath = [namespace, ...pathStack.map((p) => p.key)].join('.');
      const colStart = match[1].length + 1;
      const colEnd = colStart + keySegment.length;
      const range = new vscode.Range(lineIdx, colStart, lineIdx, colEnd);

      locations.set(currentPath, { uri, range });

      if (afterColon && !afterColon.startsWith('{')) {
        pathStack.pop();
      }
    }

    return locations;
  }

  public hasKey(key: string): boolean {
    return this.entries.has(key);
  }

  public getKey(key: string): TranslationEntry | undefined {
    return this.entries.get(key);
  }

  public getAllKeys(): TranslationEntry[] {
    return Array.from(this.entries.values()).sort((a, b) =>
      a.key.localeCompare(b.key),
    );
  }

  public getLanguages(): string[] {
    return Array.from(this.languages).sort();
  }

  public getNamespaces(): Set<string> {
    return this.namespaces;
  }

  private extractPlaceholders(str: string): string[] {
    const matches = str.match(/\{([a-zA-Z0-9_.-]+)\}/g);
    return matches ? matches.map((m) => m.slice(1, -1)).sort() : [];
  }

  public checkParity(): ParityCheckResult {
    const missingInAr: ParityIssueItem[] = [];
    const missingInEn: ParityIssueItem[] = [];
    const emptyValues: EmptyValueIssueItem[] = [];
    const placeholderMismatches: PlaceholderMismatchItem[] = [];
    const typographyIssues: ArabicTypographyIssue[] = [];

    for (const [key, entry] of this.entries) {
      // If this is an individual plural sub-key like 'orders.items.zero'
      // and Arabic has 'zero' while English only defines 'one' and 'other',
      // skip false-positive missing warnings on the individual plural forms if the parent plural exists.
      const lastDot = key.lastIndexOf('.');
      const lastSegment = lastDot !== -1 ? key.substring(lastDot + 1) : '';
      if (PLURAL_KEYS.has(lastSegment)) {
        const parentKey = key.substring(0, lastDot);
        const parentEntry = this.entries.get(parentKey);
        if (parentEntry?.isPlural) {
          // If both EN and AR have the parent plural object, don't flag missing grammatical plural forms
          if (parentEntry.values['en'] && parentEntry.values['ar']) {
            continue;
          }
        }
      }

      const enVal = entry.values['en'];
      const arVal = entry.values['ar'];

      // Missing checks
      if (enVal !== undefined && arVal === undefined) {
        missingInAr.push({
          key,
          sourceLang: 'en',
          targetLang: 'ar',
          sourceValue: enVal,
          sourceLocation: entry.locations['en'],
        });
      } else if (arVal !== undefined && enVal === undefined) {
        missingInEn.push({
          key,
          sourceLang: 'ar',
          targetLang: 'en',
          sourceValue: arVal,
          sourceLocation: entry.locations['ar'],
        });
      }

      // Empty values check
      if (enVal !== undefined && !enVal.trim()) {
        emptyValues.push({
          key,
          lang: 'en',
          location: entry.locations['en'],
        });
      }
      if (arVal !== undefined && !arVal.trim()) {
        emptyValues.push({
          key,
          lang: 'ar',
          location: entry.locations['ar'],
        });
      }

      // Placeholder mismatches check (when both languages exist and not a plural wrapper)
      if (enVal !== undefined && arVal !== undefined && !entry.isPlural) {
        const enTokens = this.extractPlaceholders(enVal);
        const arTokens = this.extractPlaceholders(arVal);
        if (JSON.stringify(enTokens) !== JSON.stringify(arTokens)) {
          placeholderMismatches.push({
            key,
            enTokens,
            arTokens,
            location: entry.locations['en'] || entry.locations['ar'],
          });
        }
      }

      // Arabic Typography Checks
      if (arVal && !entry.isPlural) {
        const typos = lintArabicText(key, arVal, enVal);
        if (typos.length > 0) {
          typographyIssues.push(...typos);
        }
      }
    }

    return {
      ok:
        missingInAr.length === 0 &&
        missingInEn.length === 0 &&
        emptyValues.length === 0 &&
        placeholderMismatches.length === 0 &&
        typographyIssues.length === 0,
      totalKeys: this.entries.size,
      missingInAr,
      missingInEn,
      emptyValues,
      placeholderMismatches,
      typographyIssues,
    };
  }

  public async setKeyValue(
    fullKey: string,
    lang: string,
    value: string,
  ): Promise<boolean> {
    const i18nDir = this.getI18nDirectory();
    if (!i18nDir) {
      vscode.window.showErrorMessage('Nest Forge i18n: i18n directory is not configured.');
      return false;
    }

    if (!fullKey || typeof fullKey !== 'string') {
      vscode.window.showErrorMessage('Nest Forge i18n: Invalid translation key: key must be a non-empty string.');
      return false;
    }

    const parts = fullKey.split('.');
    if (parts.length < 2) {
      vscode.window.showErrorMessage(
        `Nest Forge i18n: Invalid translation key '${fullKey}'. Keys must include a namespace and key path (e.g. 'auth.login').`,
      );
      return false;
    }

    const namespace = parts[0];
    const keyPath = parts.slice(1);

    const langCheck = validateSafeFileName(lang);
    if (!langCheck.valid) {
      vscode.window.showErrorMessage(`Nest Forge i18n: Invalid language '${lang}': ${langCheck.error}`);
      return false;
    }

    const nsCheck = validateSafeFileName(namespace);
    if (!nsCheck.valid) {
      vscode.window.showErrorMessage(`Nest Forge i18n: Invalid namespace '${namespace}': ${nsCheck.error}`);
      return false;
    }

    if (keyPath.some((p) => !p.trim())) {
      vscode.window.showErrorMessage(
        `Nest Forge i18n: Invalid translation key '${fullKey}'. Key path segments cannot be empty.`,
      );
      return false;
    }

    const targetFile = path.join(i18nDir, lang, `${namespace}.json`);
    const pathCheck = validateWorkspacePath(i18nDir, targetFile);
    if (!pathCheck.valid) {
      vscode.window.showErrorMessage(`Nest Forge i18n: Invalid translation file path: ${pathCheck.error}`);
      return false;
    }

    try {
      const targetDir = path.dirname(targetFile);
      if (!fs.existsSync(targetDir)) {
        fs.mkdirSync(targetDir, { recursive: true });
      }

      let content: Record<string, unknown> = {};
      if (fs.existsSync(targetFile)) {
        try {
          content = JSON.parse(fs.readFileSync(targetFile, 'utf8'));
        } catch {
          content = {};
        }
      }

      let current: Record<string, unknown> = content;
      for (let i = 0; i < keyPath.length - 1; i++) {
        const seg = keyPath[i];
        if (
          !current[seg] ||
          typeof current[seg] !== 'object' ||
          Array.isArray(current[seg])
        ) {
          current[seg] = {};
        }
        current = current[seg] as Record<string, unknown>;
      }

      const leafKey = keyPath[keyPath.length - 1];
      current[leafKey] = value;

      fs.writeFileSync(
        targetFile,
        JSON.stringify(content, null, 2) + '\n',
        'utf8',
      );

      this.reload();
      return true;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      vscode.window.showErrorMessage(`Nest Forge i18n: Failed to save translation key '${fullKey}': ${msg}`);
      console.error(`[Nest Forge i18n] Failed to set key value for ${fullKey}:`, err);
      return false;
    }
  }

  public async deleteKey(fullKey: string): Promise<boolean> {
    const i18nDir = this.getI18nDirectory();
    if (!i18nDir) {
      vscode.window.showErrorMessage('Nest Forge i18n: i18n directory is not configured.');
      return false;
    }

    if (!fullKey || typeof fullKey !== 'string') {
      vscode.window.showErrorMessage('Nest Forge i18n: Invalid translation key: key must be a non-empty string.');
      return false;
    }

    const parts = fullKey.split('.');
    if (parts.length < 2) {
      vscode.window.showErrorMessage(
        `Nest Forge i18n: Invalid translation key '${fullKey}'. Keys must include a namespace and key path.`,
      );
      return false;
    }

    const namespace = parts[0];
    const keyPath = parts.slice(1);

    const nsCheck = validateSafeFileName(namespace);
    if (!nsCheck.valid) {
      vscode.window.showErrorMessage(`Nest Forge i18n: Invalid namespace '${namespace}': ${nsCheck.error}`);
      return false;
    }

    if (keyPath.some((p) => !p.trim())) {
      vscode.window.showErrorMessage(
        `Nest Forge i18n: Invalid translation key '${fullKey}'. Key path segments cannot be empty.`,
      );
      return false;
    }

    for (const lang of Array.from(this.languages)) {
      const langCheck = validateSafeFileName(lang);
      if (!langCheck.valid) {
        vscode.window.showErrorMessage(`Nest Forge i18n: Invalid language '${lang}': ${langCheck.error}`);
        return false;
      }

      const targetFile = path.join(i18nDir, lang, `${namespace}.json`);
      const pathCheck = validateWorkspacePath(i18nDir, targetFile);
      if (!pathCheck.valid) {
        vscode.window.showErrorMessage(`Nest Forge i18n: Invalid translation file path: ${pathCheck.error}`);
        return false;
      }

      if (!fs.existsSync(targetFile)) continue;

      try {
        const content = JSON.parse(fs.readFileSync(targetFile, 'utf8'));

        let current: Record<string, unknown> = content;
        const stack: { obj: Record<string, unknown>; key: string }[] = [];

        for (let i = 0; i < keyPath.length - 1; i++) {
          const seg = keyPath[i];
          if (!current[seg] || typeof current[seg] !== 'object') break;
          stack.push({ obj: current, key: seg });
          current = current[seg] as Record<string, unknown>;
        }

        const leafKey = keyPath[keyPath.length - 1];
        delete current[leafKey];

        // Clean up empty parent objects
        while (stack.length > 0) {
          const parent = stack.pop()!;
          const childObj = parent.obj[parent.key] as Record<string, unknown>;
          if (childObj && Object.keys(childObj).length === 0) {
            delete parent.obj[parent.key];
          }
        }

        fs.writeFileSync(
          targetFile,
          JSON.stringify(content, null, 2) + '\n',
          'utf8',
        );
      } catch (err) {
        const msg = err instanceof Error ? err.message : String(err);
        vscode.window.showErrorMessage(`Nest Forge i18n: Failed to delete key '${fullKey}': ${msg}`);
        console.error(`[Nest Forge i18n] Failed to delete key in ${targetFile}:`, err);
        return false;
      }
    }

    this.reload();
    return true;
  }

  public async addMissingKey(
    fullKey: string,
    targetLang: string,
    initialValue = '',
  ): Promise<{ uri: vscode.Uri; range?: vscode.Range } | null> {
    const i18nDir = this.getI18nDirectory();
    if (!i18nDir) {
      vscode.window.showErrorMessage('Nest Forge i18n: i18n directory is not configured.');
      return null;
    }

    if (!fullKey || typeof fullKey !== 'string') {
      vscode.window.showErrorMessage('Nest Forge i18n: Invalid translation key: key must be a non-empty string.');
      return null;
    }

    const parts = fullKey.split('.');
    if (parts.length < 2) {
      vscode.window.showErrorMessage(
        `Nest Forge i18n: Invalid translation key '${fullKey}'. Keys must include a namespace and key path (e.g. 'auth.login').`,
      );
      return null;
    }

    const namespace = parts[0];
    const keyPath = parts.slice(1);

    const langCheck = validateSafeFileName(targetLang);
    if (!langCheck.valid) {
      vscode.window.showErrorMessage(`Nest Forge i18n: Invalid language '${targetLang}': ${langCheck.error}`);
      return null;
    }

    const nsCheck = validateSafeFileName(namespace);
    if (!nsCheck.valid) {
      vscode.window.showErrorMessage(`Nest Forge i18n: Invalid namespace '${namespace}': ${nsCheck.error}`);
      return null;
    }

    if (keyPath.some((p) => !p.trim())) {
      vscode.window.showErrorMessage(
        `Nest Forge i18n: Invalid translation key '${fullKey}'. Key path segments cannot be empty.`,
      );
      return null;
    }

    const targetFile = path.join(i18nDir, targetLang, `${namespace}.json`);
    const pathCheck = validateWorkspacePath(i18nDir, targetFile);
    if (!pathCheck.valid) {
      vscode.window.showErrorMessage(`Nest Forge i18n: Invalid translation file path: ${pathCheck.error}`);
      return null;
    }

    const ok = await this.setKeyValue(fullKey, targetLang, initialValue);
    if (!ok) return null;

    const uri = vscode.Uri.file(targetFile);
    const entry = this.getKey(fullKey);

    return {
      uri,
      range: entry?.locations[targetLang]?.range,
    };
  }

  public async fixAllMissing(): Promise<{ fixed: number; details: string[] }> {
    const parity = this.checkParity();
    let fixed = 0;
    const details: string[] = [];

    for (const item of parity.missingInAr) {
      const res = await this.addMissingKey(item.key, 'ar', '');
      if (res) {
        fixed++;
        details.push(`Added "${item.key}" to Arabic (ar)`);
      }
    }

    for (const item of parity.missingInEn) {
      const res = await this.addMissingKey(item.key, 'en', '');
      if (res) {
        fixed++;
        details.push(`Added "${item.key}" to English (en)`);
      }
    }

    return { fixed, details };
  }

  public async findUnusedKeys(): Promise<string[]> {
    const allKeys = this.getAllKeys()
      .filter((e) => !e.isPlural)
      .map((e) => e.key);
    if (allKeys.length === 0) return [];

    const unusedKeys = new Set<string>(allKeys);

    const files = await vscode.workspace.findFiles(
      'src/**/*.ts',
      '{**/node_modules/**,**/src/i18n/**,**/dist/**}',
    );

    for (const fileUri of files) {
      if (unusedKeys.size === 0) break;
      try {
        const fileContent = fs.readFileSync(fileUri.fsPath, 'utf8');
        for (const key of Array.from(unusedKeys)) {
          if (fileContent.includes(key)) {
            unusedKeys.delete(key);
          }
        }
      } catch {
        // Ignore read errors
      }
    }

    return Array.from(unusedKeys).sort();
  }

  public initializeI18nStructure(): { created: string[]; nestCliUpdated: boolean } {
    let dir = this.i18nDir;
    if (!dir) {
      dir = path.join(this.workspaceRoot, 'src', 'i18n');
    }

    const enDir = path.join(dir, 'en');
    const arDir = path.join(dir, 'ar');
    fs.mkdirSync(enDir, { recursive: true });
    fs.mkdirSync(arDir, { recursive: true });

    const created: string[] = [];

    // 1. common.json
    const enCommonFile = path.join(enDir, 'common.json');
    if (!fs.existsSync(enCommonFile)) {
      const enCommon = {
        SUCCESS: 'All set! The operation completed successfully.',
        CREATED: 'Created successfully.',
        UPDATED: 'Your changes have been saved.',
        DELETED: 'Item removed successfully.',
        BAD_REQUEST: 'Please double-check the information you entered and try again.',
        UNAUTHORIZED: 'Please sign in to access this page.',
        FORBIDDEN: "You don't have permission to perform this action.",
        NOT_FOUND: "We couldn't find what you were looking for.",
        CONFLICT: 'This record has already been modified or already exists.',
        VALIDATION_ERROR: 'Please review the highlighted fields and correct any errors.',
        SERVER_ERROR: 'Something went wrong on our end. Please try again in a few moments.',
      };
      fs.writeFileSync(enCommonFile, JSON.stringify(enCommon, null, 2) + '\n', 'utf8');
      created.push(enCommonFile);
    }

    const arCommonFile = path.join(arDir, 'common.json');
    if (!fs.existsSync(arCommonFile)) {
      const arCommon = {
        SUCCESS: 'تمت العملية بنجاح وبكل سهولة.',
        CREATED: 'تم الحفظ والإضافة بنجاح.',
        UPDATED: 'تم حفظ تعديلاتك بنجاح.',
        DELETED: 'تم الحذف بنجاح.',
        BAD_REQUEST: 'يرجى مراجعة البيانات المدخلة والتأكد من صحتها ثم المحاولة ثانية.',
        UNAUTHORIZED: 'يرجى تسجيل الدخول أولاً للوصول إلى هذه الصفحة.',
        FORBIDDEN: 'عذراً، ليس لديك الصلاحية الكافية للقيام بهذا الإجراء.',
        NOT_FOUND: 'لم نتمكن من العثور على ما تبحث عنه.',
        CONFLICT: 'هذا السجل مسجل مسبقاً أو تم تعديله مؤخراً.',
        VALIDATION_ERROR: 'يرجى مراجعة الحقول المطلوبة وتصحيح الأخطاء المدخلة.',
        SERVER_ERROR: 'حدث خطأ غير متوقع من جانبنا. يرجى الانتظار قليلاً والمحاولة مجدداً.',
      };
      fs.writeFileSync(arCommonFile, JSON.stringify(arCommon, null, 2) + '\n', 'utf8');
      created.push(arCommonFile);
    }

    // 2. validation.json
    const enValFile = path.join(enDir, 'validation.json');
    if (!fs.existsSync(enValFile)) {
      const enVal = {
        REQUIRED: 'Please provide a value for {property}.',
        INVALID_EMAIL: 'Please enter a valid email address.',
        IS_STRING: '{property} must be text.',
        IS_NUMBER: '{property} must be a number.',
        IS_BOOLEAN: '{property} must be yes or no.',
        IS_INT: '{property} must be a whole number.',
        IS_UUID: 'Please provide a valid ID for {property}.',
        MIN_LENGTH: '{property} must be at least {constraint1} characters.',
        MAX_LENGTH: '{property} cannot be longer than {constraint1} characters.',
        MIN: '{property} must be at least {constraint1}.',
        MAX: '{property} cannot exceed {constraint1}.',
        IS_ARRAY: '{property} must be a list of items.',
        IS_NOT_EMPTY: 'Please fill in {property}.',
        IS_ENUM: 'Please choose a valid option for {property}.',
      };
      fs.writeFileSync(enValFile, JSON.stringify(enVal, null, 2) + '\n', 'utf8');
      created.push(enValFile);
    }

    const arValFile = path.join(arDir, 'validation.json');
    if (!fs.existsSync(arValFile)) {
      const arVal = {
        REQUIRED: 'يرجى إدخال {property}.',
        INVALID_EMAIL: 'يرجى كتابة عنوان بريد إلكتروني صالح ومكتمل.',
        IS_STRING: 'يجب أن تكون قيمة {property} نصية.',
        IS_NUMBER: 'يجب أن تكون قيمة {property} رقماً صحيحاً.',
        IS_BOOLEAN: 'يجب أن تكون قيمة {property} إما نعم أو لا.',
        IS_INT: 'يجب أن يكون {property} عدداً صحيحاً بدون كسور.',
        IS_UUID: 'يرجى إدخال معرف فريد صحيح لـ {property}.',
        MIN_LENGTH: 'يجب ألا يقل {property} عن {constraint1} أحرف.',
        MAX_LENGTH: 'يجب ألا يتجاوز {property} {constraint1} حرفاً.',
        MIN: 'يجب ألا تقل قيمة {property} عن {constraint1}.',
        MAX: 'يجب ألا تتجاوز قيمة {property} {constraint1}.',
        IS_ARRAY: 'يجب أن يحتوي {property} على قائمة من العناصر.',
        IS_NOT_EMPTY: 'يرجى عدم ترك {property} فارغاً.',
        IS_ENUM: 'يرجى اختيار قيمة صحيحة ومتاحة لـ {property}.',
      };
      fs.writeFileSync(arValFile, JSON.stringify(arVal, null, 2) + '\n', 'utf8');
      created.push(arValFile);
    }

    // 3. Update nest-cli.json compilerOptions.assets if present
    let nestCliUpdated = false;
    const nestCliPath = path.join(this.workspaceRoot, 'nest-cli.json');
    if (fs.existsSync(nestCliPath)) {
      try {
        const nestCli = JSON.parse(fs.readFileSync(nestCliPath, 'utf8'));
        nestCli.compilerOptions = nestCli.compilerOptions || {};
        const assets: Array<{ include: string; watchAssets?: boolean }> =
          nestCli.compilerOptions.assets || [];

        const hasI18nAsset = assets.some(
          (a) => typeof a === 'object' && a.include && a.include.includes('i18n'),
        );

        if (!hasI18nAsset) {
          assets.push({
            include: 'i18n/**/*.json',
            watchAssets: true,
          });
          nestCli.compilerOptions.assets = assets;
          fs.writeFileSync(
            nestCliPath,
            JSON.stringify(nestCli, null, 2) + '\n',
            'utf8',
          );
          nestCliUpdated = true;
        }
      } catch (err) {
        console.error('Failed to update nest-cli.json with i18n assets:', err);
      }
    }

    this.detectI18nDir();
    this.reload();

    return { created, nestCliUpdated };
  }
}

import type { FeatureNames } from './types.js';

export function splitWords(input: string): string[] {
  if (!input) return [];

  // Replace separators with spaces, split camelCase & PascalCase
  const cleaned = input
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/[\s_\-\.]+/g, ' ')
    .trim();

  return cleaned.split(' ').map((w) => w.toLowerCase()).filter(Boolean);
}

export function capitalize(word: string): string {
  if (!word) return '';
  return word.charAt(0).toUpperCase() + word.slice(1);
}

export function toPascalCase(words: string[]): string {
  return words.map(capitalize).join('');
}

export function toCamelCase(words: string[]): string {
  if (words.length === 0) return '';
  return words[0] + words.slice(1).map(capitalize).join('');
}

export function toKebabCase(words: string[]): string {
  return words.join('-');
}

export function toSnakeCase(words: string[]): string {
  return words.join('_');
}

export interface IdentifierValidationResult {
  valid: boolean;
  error?: string;
}

export function validateIdentifier(name: string): IdentifierValidationResult {
  if (!name || typeof name !== 'string') {
    return { valid: false, error: 'Identifier must be a non-empty string' };
  }
  const trimmed = name.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'Identifier cannot be empty' };
  }
  if (!/^[a-zA-Z]/.test(trimmed)) {
    return {
      valid: false,
      error: `Invalid identifier '${name}': must start with a letter`,
    };
  }
  if (!/^[a-zA-Z][a-zA-Z0-9._-]*$/.test(trimmed)) {
    return {
      valid: false,
      error: `Invalid identifier '${name}': can only contain letters, digits, '.', '_', and '-'`,
    };
  }
  return { valid: true };
}

export function pluralize(word: string): string {
  if (!word) return '';
  const lower = word.toLowerCase();

  // Invariant / uncountable words
  const uncountables = new Set([
    'news',
    'information',
    'feedback',
    'data',
    'auth',
  ]);
  if (uncountables.has(lower)) {
    return word;
  }

  const irregulars: Record<string, string> = {
    person: 'people',
    child: 'children',
    man: 'men',
    woman: 'women',
    datum: 'data',
    criterion: 'criteria',
  };

  if (irregulars[lower]) {
    const plural = irregulars[lower];
    return word.charAt(0) === word.charAt(0).toUpperCase() ? capitalize(plural) : plural;
  }

  const irregularPlurals = new Set(Object.values(irregulars));
  if (irregularPlurals.has(lower)) {
    return word;
  }

  // Words ending with consonant + y -> ies (e.g. category -> categories)
  if (/[bcdfghjklmnpqrstvwxyz]y$/i.test(word)) {
    return word.slice(0, -1) + 'ies';
  }

  // Already plural ending in 'ies' (e.g. categories)
  if (/ies$/i.test(word)) {
    return word;
  }

  // Already plural ending in 'sses', 'xes', 'zes', 'ches', 'shes', 'statuses', 'buses'
  if (/(sses|xes|zes|ches|shes|statuses|buses)$/i.test(word)) {
    return word;
  }

  // Words ending in us, ss, x, z, ch, sh -> es (e.g. status -> statuses, bus -> buses, address -> addresses, box -> boxes, tax -> taxes, index -> indexes)
  if (/(us|ss|x|z|ch|sh)$/i.test(word)) {
    return word + 'es';
  }

  // Already plural ending in 's' (e.g. users, orders, roles)
  if (/s$/i.test(word)) {
    return word;
  }

  // Default: append s
  return word + 's';
}

export function deriveNames(raw: string): FeatureNames {
  const emptyNames: FeatureNames = {
    kebab: '',
    pascal: '',
    camel: '',
    snake: '',
    pluralKebab: '',
    pluralPascal: '',
    pluralCamel: '',
    pluralSnake: '',
  };

  if (!raw) return emptyNames;
  const validation = validateIdentifier(raw);
  if (!validation.valid) return emptyNames;

  const words = splitWords(raw);
  if (words.length === 0) {
    return emptyNames;
  }

  const kebab = toKebabCase(words);
  const pascal = toPascalCase(words);
  const camel = toCamelCase(words);
  const snake = toSnakeCase(words);

  // Pluralize the last word
  const lastWord = words[words.length - 1];
  const pluralLastWord = pluralize(lastWord);
  const pluralWords = [...words.slice(0, -1), pluralLastWord];

  return {
    kebab,
    pascal,
    camel,
    snake,
    pluralKebab: toKebabCase(pluralWords),
    pluralPascal: toPascalCase(pluralWords),
    pluralCamel: toCamelCase(pluralWords),
    pluralSnake: toSnakeCase(pluralWords),
  };
}

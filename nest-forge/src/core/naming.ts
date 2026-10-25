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

export function pluralize(word: string): string {
  if (!word) return '';
  const lower = word.toLowerCase();

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

  // Words ending with consonant + y -> ies (e.g. category -> categories)
  if (/[bcdfghjklmnpqrstvwxyz]y$/i.test(word)) {
    return word.slice(0, -1) + 'ies';
  }

  // Words ending in s, x, z, ch, sh -> es (e.g. status -> statuses, tax -> taxes)
  if (/(s|x|z|ch|sh)$/i.test(word)) {
    return word + 'es';
  }

  // Default: append s
  return word + 's';
}

export function deriveNames(raw: string): FeatureNames {
  const words = splitWords(raw);
  if (words.length === 0) {
    return {
      kebab: '',
      pascal: '',
      camel: '',
      snake: '',
      pluralKebab: '',
      pluralPascal: '',
      pluralCamel: '',
      pluralSnake: '',
    };
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

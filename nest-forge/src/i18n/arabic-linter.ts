import * as vscode from 'vscode';

export interface ArabicTypographyIssue {
  key: string;
  issueType: 'question_mark' | 'comma' | 'semicolon' | 'whitespace';
  message: string;
  charIndex: number;
  length: number;
  originalChar: string;
  suggestedReplacement?: string;
  range?: vscode.Range;
}

/**
 * Strips interpolation placeholders like {count}, {name} before checking punctuation
 * but preserves string length/indexing by replacing them with spaces.
 */
function maskPlaceholders(str: string): string {
  return str.replace(/\{[a-zA-Z0-9_.-]+\}/g, (m) => ' '.repeat(m.length));
}

export function lintArabicText(
  key: string,
  arabicText: string,
  englishText?: string,
  lineIdx?: number,
  valueStartCol?: number,
): ArabicTypographyIssue[] {
  const issues: ArabicTypographyIssue[] = [];
  if (!arabicText) return issues;

  const masked = maskPlaceholders(arabicText);

  // 1. English question mark '?' -> Arabic '؟'
  let qIdx = masked.indexOf('?');
  while (qIdx !== -1) {
    const range =
      lineIdx !== undefined && valueStartCol !== undefined
        ? new vscode.Range(
            lineIdx,
            valueStartCol + qIdx,
            lineIdx,
            valueStartCol + qIdx + 1,
          )
        : undefined;

    issues.push({
      key,
      issueType: 'question_mark',
      message: 'Use Arabic question mark (؟) instead of English (?)',
      charIndex: qIdx,
      length: 1,
      originalChar: '?',
      suggestedReplacement: '؟',
      range,
    });
    qIdx = masked.indexOf('?', qIdx + 1);
  }

  // 2. English comma ',' -> Arabic '،'
  let cIdx = masked.indexOf(',');
  while (cIdx !== -1) {
    // Check if it's between digits (like 1,000)
    const prevChar = cIdx > 0 ? masked[cIdx - 1] : '';
    const nextChar = cIdx < masked.length - 1 ? masked[cIdx + 1] : '';
    const isNumber = /\d/.test(prevChar) && /\d/.test(nextChar);

    if (!isNumber) {
      const range =
        lineIdx !== undefined && valueStartCol !== undefined
          ? new vscode.Range(
              lineIdx,
              valueStartCol + cIdx,
              lineIdx,
              valueStartCol + cIdx + 1,
            )
          : undefined;

      issues.push({
        key,
        issueType: 'comma',
        message: 'Use Arabic comma (،) instead of English (,)',
        charIndex: cIdx,
        length: 1,
        originalChar: ',',
        suggestedReplacement: '،',
        range,
      });
    }
    cIdx = masked.indexOf(',', cIdx + 1);
  }

  // 3. English semicolon ';' -> Arabic '؛'
  let sIdx = masked.indexOf(';');
  while (sIdx !== -1) {
    const range =
      lineIdx !== undefined && valueStartCol !== undefined
        ? new vscode.Range(
            lineIdx,
            valueStartCol + sIdx,
            lineIdx,
            valueStartCol + sIdx + 1,
          )
        : undefined;

    issues.push({
      key,
      issueType: 'semicolon',
      message: 'Use Arabic semicolon (؛) instead of English (;)',
      charIndex: sIdx,
      length: 1,
      originalChar: ';',
      suggestedReplacement: '؛',
      range,
    });
    sIdx = masked.indexOf(';', sIdx + 1);
  }

  // 4. Leading / trailing whitespace mismatch
  if (englishText !== undefined) {
    const enLeading = englishText.match(/^\s+/)?.[0] || '';
    const enTrailing = englishText.match(/\s+$/)?.[0] || '';
    const arLeading = arabicText.match(/^\s+/)?.[0] || '';
    const arTrailing = arabicText.match(/\s+$/)?.[0] || '';

    if (
      (enLeading && !arLeading) ||
      (!enLeading && arLeading) ||
      (enTrailing && !arTrailing) ||
      (!enTrailing && arTrailing)
    ) {
      const range =
        lineIdx !== undefined && valueStartCol !== undefined
          ? new vscode.Range(
              lineIdx,
              valueStartCol,
              lineIdx,
              valueStartCol + arabicText.length,
            )
          : undefined;

      issues.push({
        key,
        issueType: 'whitespace',
        message:
          'Leading/trailing whitespace does not match English translation counterpart',
        charIndex: 0,
        length: arabicText.length,
        originalChar: arabicText,
        range,
      });
    }
  }

  return issues;
}

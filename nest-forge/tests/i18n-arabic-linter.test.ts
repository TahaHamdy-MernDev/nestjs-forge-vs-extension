import { describe, expect, it } from 'vitest';
import { lintArabicText } from '../src/i18n/arabic-linter.js';

describe('arabic linter', () => {
  it('detects English question mark in Arabic strings', () => {
    const issues = lintArabicText('help', 'هل تحتاج إلى مساعدة؟');
    expect(issues).toHaveLength(0);

    const issuesBad = lintArabicText('help', 'هل تحتاج إلى مساعدة?');
    expect(issuesBad).toHaveLength(1);
    expect(issuesBad[0].issueType).toBe('question_mark');
    expect(issuesBad[0].suggestedReplacement).toBe('؟');
  });

  it('detects English comma in Arabic strings but ignores numbers with commas', () => {
    const issuesBad = lintArabicText('greeting', 'مرحبا بك, أهلا وسهلا');
    expect(issuesBad).toHaveLength(1);
    expect(issuesBad[0].issueType).toBe('comma');
    expect(issuesBad[0].suggestedReplacement).toBe('،');

    // Numbers like 1,000 should not trigger comma issue
    const issuesNum = lintArabicText('amount', 'الإجمالي هو 1,000 ريال');
    expect(issuesNum).toHaveLength(0);
  });

  it('detects English semicolon in Arabic strings', () => {
    const issuesBad = lintArabicText('notice', 'يرجى الانتباه; هذا تنبيه');
    expect(issuesBad).toHaveLength(1);
    expect(issuesBad[0].issueType).toBe('semicolon');
    expect(issuesBad[0].suggestedReplacement).toBe('؛');
  });

  it('ignores punctuation inside interpolation placeholders', () => {
    // Placeholder like {param_1} or {url?query} shouldn't trigger
    const issues = lintArabicText('msg', 'مرحبا {user_name}، كيف حالك؟');
    expect(issues).toHaveLength(0);
  });

  it('detects whitespace mismatch between English and Arabic', () => {
    const issues = lintArabicText('title', 'العنوان', ' Title ');
    const wsIssues = issues.filter((i) => i.issueType === 'whitespace');
    expect(wsIssues.length).toBeGreaterThan(0);
  });
});

export interface TextEdit {
  start: number;
  end: number;
  newText: string;
}

export function applyEditsRightToLeft(source: string, edits: TextEdit[]): string {
  const sorted = [...edits].sort((a, b) => b.start - a.start);
  let result = source;
  for (const edit of sorted) {
    result = result.slice(0, edit.start) + edit.newText + result.slice(edit.end);
  }
  return result;
}

import * as fs from 'node:fs';
import * as path from 'node:path';
import { describe, expect, it } from 'vitest';

describe('PERF-07: Packaging hygiene and vscodeignore', () => {
  const extensionRoot = path.resolve(__dirname, '..');
  const vscodeIgnorePath = path.join(extensionRoot, '.vscodeignore');
  const vscodeIgnoreContent = fs.readFileSync(vscodeIgnorePath, 'utf-8');
  const ignoreLines = vscodeIgnoreContent
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

  it('ignores AGENTS.md and GEMINI.md in .vscodeignore', () => {
    expect(ignoreLines).toContain('AGENTS.md');
    expect(ignoreLines).toContain('GEMINI.md');
  });

  it('does not duplicate resources in dist/resources', () => {
    const esbuildPath = path.join(extensionRoot, 'esbuild.mjs');
    const esbuildContent = fs.readFileSync(esbuildPath, 'utf-8');
    expect(esbuildContent).not.toContain("copyDirRecursive('resources', 'dist/resources')");
  });

  it('ensures all icons referenced in package.json exist at their paths', () => {
    const pkg = JSON.parse(
      fs.readFileSync(path.join(extensionRoot, 'package.json'), 'utf-8'),
    );
    expect(fs.existsSync(path.join(extensionRoot, pkg.icon))).toBe(true);

    const contributesViews = pkg.contributes?.viewsContainers?.activitybar || [];
    for (const view of contributesViews) {
      if (view.icon && !view.icon.startsWith('$(')) {
        expect(fs.existsSync(path.join(extensionRoot, view.icon))).toBe(true);
      }
    }
  });
});

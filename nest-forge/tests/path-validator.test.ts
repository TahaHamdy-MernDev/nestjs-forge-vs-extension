import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { validateSafeFileName, validateWorkspacePath } from '../src/core/path-validator.js';

describe('path validator', () => {
  const workspaceRoot = '/project/root';

  it('accepts valid relative paths inside workspace', () => {
    const res1 = validateWorkspacePath(workspaceRoot, 'src/features/user');
    expect(res1.valid).toBe(true);
    expect(res1.resolvedPath).toBe(path.resolve(workspaceRoot, 'src/features/user'));

    const res2 = validateWorkspacePath(workspaceRoot, './src/modules/order');
    expect(res2.valid).toBe(true);
  });

  it('accepts absolute paths as long as they are inside workspaceRoot', () => {
    const abs = path.join(workspaceRoot, 'src', 'features', 'billing');
    const res = validateWorkspacePath(workspaceRoot, abs);
    expect(res.valid).toBe(true);
    expect(res.resolvedPath).toBe(abs);
  });

  it('rejects directory traversal attacks (../../etc/passwd)', () => {
    const res = validateWorkspacePath(workspaceRoot, '../../etc/passwd');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('outside workspace root');
  });

  it('rejects absolute paths outside workspace root (/etc/passwd)', () => {
    const res = validateWorkspacePath(workspaceRoot, '/etc/passwd');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('outside workspace root');
  });

  it('rejects paths containing null bytes', () => {
    const res = validateWorkspacePath(workspaceRoot, 'src/features/\0sneaky');
    expect(res.valid).toBe(false);
    expect(res.error).toContain('null bytes');
  });

  it('validates safe file names without path separators or traversal', () => {
    expect(validateSafeFileName('user.service.ts').valid).toBe(true);
    expect(validateSafeFileName('create-user.dto.ts').valid).toBe(true);
    expect(validateSafeFileName('sub/user.dto.ts').valid).toBe(false);
    expect(validateSafeFileName('..').valid).toBe(false);
    expect(validateSafeFileName('../user.ts').valid).toBe(false);
    expect(validateSafeFileName('').valid).toBe(false);
    expect(validateSafeFileName('bad\0file.ts').valid).toBe(false);
  });
});

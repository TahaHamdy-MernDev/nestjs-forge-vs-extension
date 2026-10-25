import * as path from 'node:path';

export interface PathValidationResult {
  valid: boolean;
  error?: string;
  resolvedPath?: string;
}

export interface RoutePathValidationResult {
  valid: boolean;
  error?: string;
  sanitized?: string;
}

export function validateRoutePath(routePath?: string): RoutePathValidationResult {
  if (routePath === undefined || routePath === null) {
    return { valid: true, sanitized: '' };
  }

  const trimmed = routePath.trim();
  if (trimmed.length === 0) {
    return { valid: true, sanitized: '' };
  }

  if (trimmed.includes("'") || trimmed.includes('"') || trimmed.includes('`') || trimmed.includes('${')) {
    return { valid: false, error: 'Route path cannot contain quotes, backticks, or template literals' };
  }

  const stripped = trimmed.replace(/^\/+|\/+$/g, '');
  if (stripped.length === 0) {
    return { valid: true, sanitized: '' };
  }

  if (!/^[a-zA-Z0-9_\-\/:]+$/.test(stripped)) {
    return {
      valid: false,
      error: `Invalid route path '${routePath}': allowed characters are letters, digits, '-', '_', '/', and ':'`,
    };
  }

  return { valid: true, sanitized: stripped };
}

export function validateSafeFileName(fileName: string): PathValidationResult {
  if (!fileName || typeof fileName !== 'string') {
    return { valid: false, error: 'File name must be a non-empty string' };
  }

  const trimmed = fileName.trim();
  if (trimmed.length === 0) {
    return { valid: false, error: 'File name cannot be empty' };
  }

  if (trimmed.includes('\0')) {
    return { valid: false, error: 'File name contains invalid null bytes' };
  }

  if (trimmed.includes('/') || trimmed.includes('\\')) {
    return { valid: false, error: `File name '${fileName}' cannot contain path separators` };
  }

  if (trimmed === '.' || trimmed === '..' || trimmed.startsWith('..')) {
    return { valid: false, error: `Invalid file name '${fileName}'` };
  }

  return { valid: true };
}

export function validateWorkspacePath(
  workspaceRoot: string,
  relativeOrAbsolutePath: string,
): PathValidationResult {
  if (!workspaceRoot || typeof workspaceRoot !== 'string') {
    return { valid: false, error: 'Invalid workspace root' };
  }

  if (!relativeOrAbsolutePath || typeof relativeOrAbsolutePath !== 'string') {
    return { valid: false, error: 'Path must be a non-empty string' };
  }

  const trimmed = relativeOrAbsolutePath.trim();
  if (trimmed.includes('\0')) {
    return { valid: false, error: 'Path contains invalid null bytes' };
  }

  const resolved = path.isAbsolute(trimmed)
    ? path.normalize(trimmed)
    : path.resolve(workspaceRoot, trimmed);

  const normalizedRoot = path.normalize(workspaceRoot);
  const rel = path.relative(normalizedRoot, resolved);

  if (rel.startsWith('..') || path.isAbsolute(rel)) {
    return {
      valid: false,
      error: `Path '${relativeOrAbsolutePath}' resolves outside workspace root`,
      resolvedPath: resolved,
    };
  }

  return { valid: true, resolvedPath: resolved };
}

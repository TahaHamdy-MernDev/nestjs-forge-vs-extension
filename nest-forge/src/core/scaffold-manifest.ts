import * as crypto from 'node:crypto';
import * as fs from 'node:fs';
import * as path from 'node:path';

export interface ScaffoldRecord {
  featureName: string;
  createdFiles: string[];
  fileHashes?: Record<string, string>;
  targetPath: string;
  parentModulePath: string;
  moduleClassName: string;
  importSpecifier: string;
  timestamp: number;
}

const MANIFEST_FILE = '.nest-forge-last.json';

export function computeFileHash(filePath: string): string | null {
  try {
    if (fs.existsSync(filePath) && fs.statSync(filePath).isFile()) {
      const buffer = fs.readFileSync(filePath);
      return crypto.createHash('sha256').update(buffer).digest('hex');
    }
  } catch {
    // Ignore error
  }
  return null;
}

export function createFileHashes(filePaths: string[]): Record<string, string> {
  const hashes: Record<string, string> = {};
  for (const fp of filePaths) {
    const hash = computeFileHash(fp);
    if (hash) {
      hashes[fp] = hash;
    }
  }
  return hashes;
}

export function verifyFileUnchanged(filePath: string, expectedHash: string): boolean {
  const current = computeFileHash(filePath);
  return current !== null && current === expectedHash;
}

export function saveLastScaffoldRecord(workspaceRoot: string, record: ScaffoldRecord): void {
  try {
    const filePath = path.join(workspaceRoot, MANIFEST_FILE);
    fs.writeFileSync(filePath, JSON.stringify(record, null, 2), 'utf-8');
  } catch {
    // Ignore error
  }
}

export function getLastScaffoldRecord(workspaceRoot: string): ScaffoldRecord | null {
  try {
    const filePath = path.join(workspaceRoot, MANIFEST_FILE);
    if (fs.existsSync(filePath)) {
      return JSON.parse(fs.readFileSync(filePath, 'utf-8'));
    }
  } catch {
    // Ignore error
  }
  return null;
}

export function clearLastScaffoldRecord(workspaceRoot: string): void {
  try {
    const filePath = path.join(workspaceRoot, MANIFEST_FILE);
    if (fs.existsSync(filePath)) {
      fs.unlinkSync(filePath);
    }
  } catch {
    // Ignore error
  }
}

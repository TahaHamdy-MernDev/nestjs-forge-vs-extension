import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  clearLastScaffoldRecord,
  computeFileHash,
  createFileHashes,
  getLastScaffoldRecord,
  saveLastScaffoldRecord,
  verifyFileUnchanged,
} from '../src/core/scaffold-manifest.js';

describe('scaffold manifest & file hashing', () => {
  it('computes file hash and verifies unchanged file', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-hash-'));
    const testFile = path.join(tmpDir, 'user.service.ts');
    fs.writeFileSync(testFile, 'export class UserService {}', 'utf-8');

    const hash1 = computeFileHash(testFile);
    expect(hash1).toBeTruthy();
    expect(verifyFileUnchanged(testFile, hash1!)).toBe(true);

    // Modify file
    fs.appendFileSync(testFile, '\n// user added custom code');
    const hash2 = computeFileHash(testFile);
    expect(hash2).not.toBe(hash1);
    expect(verifyFileUnchanged(testFile, hash1!)).toBe(false);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('saves and retrieves scaffold records with hashes', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-manifest-'));
    const file1 = path.join(tmpDir, 'file1.ts');
    fs.writeFileSync(file1, 'const a = 1;', 'utf-8');

    const hashes = createFileHashes([file1]);

    saveLastScaffoldRecord(tmpDir, {
      featureName: 'demo',
      createdFiles: [file1],
      fileHashes: hashes,
      targetPath: 'src/features/demo',
      parentModulePath: 'src/app.module.ts',
      moduleClassName: 'DemoModule',
      importSpecifier: './demo.module.js',
      timestamp: 123456,
    });

    const record = getLastScaffoldRecord(tmpDir);
    expect(record).toBeTruthy();
    expect(record?.featureName).toBe('demo');
    expect(record?.fileHashes?.[file1]).toBe(hashes[file1]);

    clearLastScaffoldRecord(tmpDir);
    expect(getLastScaffoldRecord(tmpDir)).toBeNull();

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });

  it('correctly distinguishes modified files and preserves non-empty directory on undo simulation', () => {
    const tmpDir = fs.mkdtempSync(path.join(os.tmpdir(), 'nest-forge-undo-safety-'));
    const featureDir = path.join(tmpDir, 'order');
    fs.mkdirSync(featureDir, { recursive: true });

    const fileA = path.join(featureDir, 'order.service.ts');
    const fileB = path.join(featureDir, 'order.controller.ts');
    fs.writeFileSync(fileA, 'export class OrderService {}', 'utf-8');
    fs.writeFileSync(fileB, 'export class OrderController {}', 'utf-8');

    const hashes = createFileHashes([fileA, fileB]);

    // User modifies fileB
    fs.appendFileSync(fileB, '\n// custom business logic');

    // Also user creates a new file in featureDir
    const customUserFile = path.join(featureDir, 'custom-helper.ts');
    fs.writeFileSync(customUserFile, 'export function helper() {}', 'utf-8');

    // Simulate undo logic:
    const filesToDelete = [fileA, fileB];
    const skippedFiles: string[] = [];
    let deletedCount = 0;

    for (const file of filesToDelete) {
      const expectedHash = hashes[file];
      if (expectedHash && !verifyFileUnchanged(file, expectedHash)) {
        skippedFiles.push(file);
        continue;
      }
      fs.unlinkSync(file);
      deletedCount++;
    }

    expect(deletedCount).toBe(1);
    expect(fs.existsSync(fileA)).toBe(false);
    expect(skippedFiles).toContain(fileB);
    expect(fs.existsSync(fileB)).toBe(true);

    // Try removing directory using safe rmdirSync only if empty
    if (fs.existsSync(featureDir) && fs.readdirSync(featureDir).length === 0) {
      fs.rmdirSync(featureDir);
    }

    // Because customUserFile and fileB still exist, featureDir MUST NOT be deleted
    expect(fs.existsSync(featureDir)).toBe(true);
    expect(fs.existsSync(customUserFile)).toBe(true);

    fs.rmSync(tmpDir, { recursive: true, force: true });
  });
});


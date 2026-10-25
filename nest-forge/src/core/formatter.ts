import { execFile } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { promisify } from 'node:util';
import * as vscode from 'vscode';

const execFileAsync = promisify(execFile);

let untrustedFormatterNoticeShown = false;

export async function formatFiles(
  filePaths: string[],
  workspaceRoot: string,
  formatter: 'biome' | 'prettier' | 'none',
): Promise<boolean> {
  if (vscode.workspace.isTrusted) {
    untrustedFormatterNoticeShown = false;
  }

  if (formatter === 'none' || filePaths.length === 0) {
    return false;
  }

  const existingFiles = filePaths.filter((p) => fs.existsSync(p));
  if (existingFiles.length === 0) return false;

  if (!vscode.workspace.isTrusted) {
    if (!untrustedFormatterNoticeShown) {
      untrustedFormatterNoticeShown = true;
      vscode.window.showInformationMessage(
        'Nest Forge: Local code formatter execution is skipped in untrusted workspaces.',
      );
    }
    return false;
  }

  try {
    if (formatter === 'biome') {
      const localBiome = path.join(workspaceRoot, 'node_modules', '.bin', 'biome');
      const bin = fs.existsSync(localBiome) ? localBiome : 'biome';
      await execFileAsync(bin, ['format', '--write', ...existingFiles], { cwd: workspaceRoot });
      return true;
    }

    if (formatter === 'prettier') {
      const localPrettier = path.join(workspaceRoot, 'node_modules', '.bin', 'prettier');
      const bin = fs.existsSync(localPrettier) ? localPrettier : 'prettier';
      await execFileAsync(bin, ['--write', ...existingFiles], { cwd: workspaceRoot });
      return true;
    }
  } catch {
    // If format fails or tool not found, fail silently
    return false;
  }

  return false;
}

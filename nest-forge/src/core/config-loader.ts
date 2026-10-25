import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import { detectConventions } from './convention-detector.js';
import type { ProjectConventions } from './types.js';

export function loadProjectConventions(
  workspaceRoot: string,
  overrides?: Partial<ProjectConventions>,
): ProjectConventions {
  const detected = detectConventions(workspaceRoot);

  const configFiles = [
    'nest-forge.json',
    '.nest-forge.json',
    '.nest-scaffold.json',
  ];

  let merged: ProjectConventions = { ...detected };

  for (const file of configFiles) {
    const configPath = path.join(workspaceRoot, file);
    if (fs.existsSync(configPath)) {
      try {
        const raw = parseJsonc(fs.readFileSync(configPath, 'utf-8'));
        if (raw && typeof raw === 'object') {
          merged = {
            ...merged,
            ...raw,
          };
          break;
        }
      } catch {
        // Continue if parsing failed
      }
    }
  }

  if (overrides) {
    const cleanOverrides: Partial<ProjectConventions> = {};
    for (const [key, val] of Object.entries(overrides)) {
      if (val !== undefined && val !== null && val !== '') {
        (cleanOverrides as Record<string, unknown>)[key] = val;
      }
    }
    merged = { ...merged, ...cleanOverrides };
  }

  return merged;
}

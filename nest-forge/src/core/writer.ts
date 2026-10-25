import * as fs from 'node:fs';
import * as path from 'node:path';
import type { FilePlan } from './types.js';
import { TemplateRenderer } from './renderer.js';

export interface WriteOptions {
  overwriteExisting?: boolean;
}

export function writeFeatureFiles(
  plans: FilePlan[],
  renderer: TemplateRenderer,
  options: WriteOptions = {},
): { created: string[]; skipped: string[] } {
  const created: string[] = [];
  const skipped: string[] = [];

  for (const plan of plans) {
    try {
      // Guard against trying to write over an existing directory
      if (fs.existsSync(plan.absolutePath) && fs.statSync(plan.absolutePath).isDirectory()) {
        skipped.push(plan.absolutePath);
        continue;
      }

      if (plan.exists && !options.overwriteExisting) {
        skipped.push(plan.absolutePath);
        continue;
      }

      const content = renderer.render(plan.templateName, plan.context);
      fs.mkdirSync(path.dirname(plan.absolutePath), { recursive: true });
      fs.writeFileSync(plan.absolutePath, content, 'utf-8');
      created.push(plan.absolutePath);
    } catch (err) {
      console.error(`Failed to write ${plan.absolutePath}:`, err);
    }
  }

  return { created, skipped };
}

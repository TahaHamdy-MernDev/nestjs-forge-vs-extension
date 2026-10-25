import * as fs from 'node:fs';
import * as path from 'node:path';
import { Eta } from 'eta';

export class TemplateRenderer {
  private defaultEta: Eta;
  private customTemplatesDir?: string;

  constructor(defaultTemplatesDir: string, customTemplatesDir?: string) {
    this.defaultEta = new Eta({
      views: defaultTemplatesDir,
      autoEscape: false,
      useWith: true,
    });
    this.customTemplatesDir = customTemplatesDir;
  }

  render(templateName: string, context: Record<string, unknown>): string {
    if (this.customTemplatesDir) {
      const customPath = path.join(this.customTemplatesDir, `${templateName}.eta`);
      try {
        if (fs.existsSync(customPath) && fs.statSync(customPath).isFile()) {
          const customContent = fs.readFileSync(customPath, 'utf-8');
          return this.defaultEta.renderString(customContent, context).trim() + '\n';
        }
      } catch {
        // Fallback to default
      }
    }

    const rendered = this.defaultEta.render(templateName, context);
    return rendered.trim() + '\n';
  }
}

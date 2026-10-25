import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse as parseJsonc } from 'jsonc-parser';
import type { ProjectConventions } from './types.js';

function isFile(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isFile();
  } catch {
    return false;
  }
}

function isDirectory(p: string): boolean {
  try {
    return fs.existsSync(p) && fs.statSync(p).isDirectory();
  } catch {
    return false;
  }
}

export function detectConventions(workspaceRoot: string): ProjectConventions {
  const defaults: ProjectConventions = {
    featuresDir: 'src/features',
    importExtension: '.js',
    pathAlias: '@/features',
    orm: 'drizzle',
    controllerVersion: '1',
    paramStyle: 'snake_case',
    parentModule: 'src/features/features.module.ts',
    validator: 'class-validator',
    formatter: 'biome',
    testRunner: 'jest',
  };

  try {
    const pkgPath = path.join(workspaceRoot, 'package.json');
    if (isFile(pkgPath)) {
      const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));
      const deps = { ...pkg.dependencies, ...pkg.devDependencies };

      // ORM detection
      if (deps['@nestjs/drizzle'] || deps['drizzle-orm']) {
        defaults.orm = 'drizzle';
      } else if (deps['@prisma/client'] || deps['prisma']) {
        defaults.orm = 'prisma';
      } else if (deps['typeorm']) {
        defaults.orm = 'typeorm';
      }

      // Validator detection
      if (deps['class-validator']) {
        defaults.validator = 'class-validator';
      } else if (deps['zod']) {
        defaults.validator = 'zod';
      }

      // Formatter detection
      if (deps['@biomejs/biome']) {
        defaults.formatter = 'biome';
      } else if (deps['prettier']) {
        defaults.formatter = 'prettier';
      }

      // Test runner detection
      if (deps['vitest']) {
        defaults.testRunner = 'vitest';
      } else {
        defaults.testRunner = 'jest';
      }
    }
  } catch {
    // Ignore JSON parse errors
  }

  try {
    const tsconfigPath = path.join(workspaceRoot, 'tsconfig.json');
    if (isFile(tsconfigPath)) {
      const tsconfig = parseJsonc(fs.readFileSync(tsconfigPath, 'utf-8')) || {};
      const paths = tsconfig.compilerOptions?.paths || {};

      if (paths['@/*'] || paths['@features/*']) {
        defaults.pathAlias = '@/features';
      } else {
        defaults.pathAlias = '';
      }

      const moduleResolution = (tsconfig.compilerOptions?.moduleResolution || '').toLowerCase();
      if (moduleResolution === 'nodenext' || moduleResolution === 'node16') {
        defaults.importExtension = '.js';
      } else {
        defaults.importExtension = '';
      }
    }
  } catch {
    // Ignore tsconfig parse errors
  }

  // 1. Detect features directory
  const featuresDirPath = path.join(workspaceRoot, 'src', 'features');
  const modulesDirPath = path.join(workspaceRoot, 'src', 'modules');

  if (isDirectory(featuresDirPath)) {
    defaults.featuresDir = 'src/features';
  } else if (isDirectory(modulesDirPath)) {
    defaults.featuresDir = 'src/modules';
  } else {
    defaults.featuresDir = 'src/features';
  }

  // 2. Detect parent module location
  const candidateParentModules = [
    path.join(workspaceRoot, 'src', 'features', 'features.module.ts'),
    path.join(workspaceRoot, 'src', 'features', 'feature.module.ts'),
    path.join(workspaceRoot, 'src', 'modules', 'modules.module.ts'),
    path.join(workspaceRoot, 'src', 'app.module.ts'),
  ];

  let detectedParent = '';
  for (const candidate of candidateParentModules) {
    if (isFile(candidate)) {
      detectedParent = path.relative(workspaceRoot, candidate);
      break;
    }
  }

  // Fallback: search for any *.module.ts in featuresDir
  if (!detectedParent && isDirectory(featuresDirPath)) {
    try {
      const entries = fs.readdirSync(featuresDirPath);
      const mod = entries.find((e) => e.endsWith('.module.ts'));
      if (mod) {
        detectedParent = path.join('src', 'features', mod);
      }
    } catch {
      // Ignore
    }
  }

  defaults.parentModule = detectedParent || (isFile(path.join(workspaceRoot, 'src', 'app.module.ts')) ? 'src/app.module.ts' : 'src/features/features.module.ts');

  return defaults;
}

import * as fs from 'node:fs';
import * as path from 'node:path';
import { parse } from '@babel/parser';

export interface ClassInfo {
  className: string;
  decoratorName?: string;
}

export interface ComponentDiagnostic {
  filePath: string;
  fileName: string;
  className: string;
  kind: 'controller' | 'service' | 'store' | 'provider' | 'repository' | 'policy' | 'listener' | 'processor' | 'task' | 'dto' | 'other';
  isWired: boolean;
  hasSpec: boolean;
}

export interface ModuleInspectionResult {
  modulePath: string | null;
  moduleClassName: string | null;
  registeredControllers: Set<string>;
  registeredProviders: Set<string>;
  registeredExports: Set<string>;
  registeredImports: Set<string>;
  allRegistered: Set<string>;
  diagnostics: Map<string, ComponentDiagnostic>;
}

export function extractExportedClassInfo(filePath: string): ClassInfo | null {
  if (!filePath || !fs.existsSync(filePath) || !fs.statSync(filePath).isFile()) {
    return null;
  }

  try {
    const code = fs.readFileSync(filePath, 'utf-8');
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'decorators-legacy'],
    });

    for (const node of ast.program.body) {
      let classNode: any = null;

      if (node.type === 'ClassDeclaration' && node.id) {
        classNode = node;
      } else if (
        node.type === 'ExportNamedDeclaration' &&
        node.declaration?.type === 'ClassDeclaration' &&
        node.declaration.id
      ) {
        classNode = node.declaration;
      }

      if (classNode) {
        let decoratorName: string | undefined;
        if (classNode.decorators && classNode.decorators.length > 0) {
          const dec = classNode.decorators[0];
          decoratorName = dec.expression?.callee?.name || dec.expression?.name;
        }

        return {
          className: classNode.id.name,
          decoratorName,
        };
      }
    }

    return null;
  } catch {
    return null;
  }
}

export function inspectFeatureModule(featureDir: string): ModuleInspectionResult {
  const result: ModuleInspectionResult = {
    modulePath: null,
    moduleClassName: null,
    registeredControllers: new Set<string>(),
    registeredProviders: new Set<string>(),
    registeredExports: new Set<string>(),
    registeredImports: new Set<string>(),
    allRegistered: new Set<string>(),
    diagnostics: new Map<string, ComponentDiagnostic>(),
  };

  if (!featureDir || !fs.existsSync(featureDir) || !fs.statSync(featureDir).isDirectory()) {
    return result;
  }

  // Find module file in featureDir
  const entries = fs.readdirSync(featureDir);
  const moduleFile = entries.find((e) => e.endsWith('.module.ts'));
  if (moduleFile) {
    result.modulePath = path.join(featureDir, moduleFile);
    try {
      const code = fs.readFileSync(result.modulePath, 'utf-8');
      const ast = parse(code, {
        sourceType: 'module',
        plugins: ['typescript', 'decorators-legacy'],
      });

      for (const node of ast.program.body) {
        let classNode: any = null;
        if (node.type === 'ClassDeclaration') classNode = node;
        else if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'ClassDeclaration') {
          classNode = node.declaration;
        }

        if (classNode) {
          const moduleDec = (classNode.decorators || []).find((d: any) => {
            const calleeName = d.expression?.callee?.name || d.expression?.name;
            return calleeName === 'Module';
          });

          if (moduleDec) {
            result.moduleClassName = classNode.id?.name || null;
            if (moduleDec.expression.arguments?.length > 0) {
              const arg = moduleDec.expression.arguments[0];
              if (arg.type === 'ObjectExpression') {
                for (const prop of arg.properties) {
                  if (prop.type === 'ObjectProperty' && prop.value.type === 'ArrayExpression') {
                    const keyName = prop.key?.name || prop.key?.value;
                    const targetSet =
                      keyName === 'controllers'
                        ? result.registeredControllers
                        : keyName === 'providers'
                        ? result.registeredProviders
                        : keyName === 'exports'
                        ? result.registeredExports
                        : keyName === 'imports'
                        ? result.registeredImports
                        : null;

                    if (targetSet) {
                      for (const el of prop.value.elements) {
                        const name = el?.name || el?.value;
                        if (name) {
                          targetSet.add(name);
                          result.allRegistered.add(name);
                        }
                      }
                    }
                  }
                }
              }
            }
          }
        }
      }
    } catch {
      // Ignore module parse errors
    }
  }

  return result;
}

export function detectComponentKind(fileName: string): ComponentDiagnostic['kind'] {
  if (fileName.endsWith('.controller.ts')) return 'controller';
  if (fileName.endsWith('.service.ts')) return 'service';
  if (fileName.endsWith('.store.ts')) return 'store';
  if (fileName.endsWith('.provider.ts') || fileName.endsWith('.handler.ts')) return 'provider';
  if (fileName.endsWith('.repository.ts')) return 'repository';
  if (fileName.endsWith('.policy.ts')) return 'policy';
  if (fileName.endsWith('.listener.ts')) return 'listener';
  if (fileName.endsWith('.processor.ts')) return 'processor';
  if (fileName.endsWith('.task.ts')) return 'task';
  if (fileName.endsWith('.dto.ts')) return 'dto';
  return 'other';
}

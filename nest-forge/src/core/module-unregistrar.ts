import * as fs from 'node:fs';
import { parse } from '@babel/parser';
import { applyEditsRightToLeft, type TextEdit } from './ast/splicer.js';

export interface UnregisterModuleOptions {
  parentModulePath: string;
  featureModuleClassName: string;
}

export function unregisterFromParentModule(options: UnregisterModuleOptions): boolean {
  const { parentModulePath, featureModuleClassName } = options;

  if (!parentModulePath || !parentModulePath.trim()) {
    return false;
  }

  try {
    if (!fs.existsSync(parentModulePath) || !fs.statSync(parentModulePath).isFile()) {
      return false;
    }
  } catch {
    return false;
  }

  try {
    const code = fs.readFileSync(parentModulePath, 'utf-8');
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'decorators-legacy'],
    });

    const edits: TextEdit[] = [];

    // 1. Remove from @Module imports array
    const classDeclarations: any[] = [];
    for (const node of ast.program.body) {
      if (node.type === 'ClassDeclaration') {
        classDeclarations.push(node);
      } else if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'ClassDeclaration') {
        classDeclarations.push(node.declaration);
      }
    }

    const moduleClass = classDeclarations.find((cls) => {
      return (cls.decorators || []).some((d: any) => {
        const calleeName = d.expression?.callee?.name || d.expression?.name;
        return calleeName === 'Module';
      });
    }) || classDeclarations[0];

    if (moduleClass) {
      const decorator = (moduleClass.decorators || []).find((d: any) => {
        const calleeName = d.expression?.callee?.name || d.expression?.name;
        return calleeName === 'Module';
      });

      if (decorator && decorator.expression.arguments?.length > 0) {
        const obj = decorator.expression.arguments[0];
        if (obj.type === 'ObjectExpression') {
          const importsProp = obj.properties.find(
            (p: any) => p.type === 'ObjectProperty' && (p.key?.name === 'imports' || p.key?.value === 'imports'),
          );

          if (importsProp && importsProp.value.type === 'ArrayExpression') {
            const arr = importsProp.value;
            const idx = arr.elements.findIndex(
              (el: any) => el?.name === featureModuleClassName || el?.value === featureModuleClassName,
            );

            if (idx !== -1) {
              if (arr.elements.length === 1) {
                edits.push({
                  start: arr.start + 1,
                  end: arr.end - 1,
                  newText: '',
                });
              } else if (idx < arr.elements.length - 1) {
                edits.push({
                  start: arr.elements[idx].start,
                  end: arr.elements[idx + 1].start,
                  newText: '',
                });
              } else {
                edits.push({
                  start: arr.elements[idx - 1].end,
                  end: arr.elements[idx].end,
                  newText: '',
                });
              }
            }
          }
        }
      }
    }

    // 2. Remove import statement or named specifier
    const importDeclarations = ast.program.body.filter(
      (node): node is any => node.type === 'ImportDeclaration',
    );

    for (const decl of importDeclarations) {
      const specIdx = decl.specifiers.findIndex(
        (s: any) => s.type === 'ImportSpecifier' && s.local.name === featureModuleClassName,
      );

      if (specIdx !== -1) {
        if (decl.specifiers.length === 1) {
          let end = decl.end;
          if (code[end] === '\r' && code[end + 1] === '\n') {
            end += 2;
          } else if (code[end] === '\n') {
            end += 1;
          }
          edits.push({
            start: decl.start,
            end,
            newText: '',
          });
        } else {
          if (specIdx < decl.specifiers.length - 1) {
            edits.push({
              start: decl.specifiers[specIdx].start,
              end: decl.specifiers[specIdx + 1].start,
              newText: '',
            });
          } else {
            edits.push({
              start: decl.specifiers[specIdx - 1].end,
              end: decl.specifiers[specIdx].end,
              newText: '',
            });
          }
        }
      }
    }

    if (edits.length > 0) {
      const updated = applyEditsRightToLeft(code, edits);
      fs.writeFileSync(parentModulePath, updated, 'utf-8');
    }

    return true;
  } catch {
    return false;
  }
}

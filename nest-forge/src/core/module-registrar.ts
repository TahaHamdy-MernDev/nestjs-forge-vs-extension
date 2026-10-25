import * as fs from 'node:fs';
import { parse } from '@babel/parser';
import { applyEditsRightToLeft, type TextEdit } from './ast/splicer.js';

export interface RegisterModuleOptions {
  parentModulePath: string;
  featureModuleClassName: string;
  featureModuleImportPath: string;
}

export function registerInParentModule(options: RegisterModuleOptions): boolean {
  const { parentModulePath, featureModuleClassName, featureModuleImportPath } = options;

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
    const nl = code.includes('\r\n') ? '\r\n' : '\n';

    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'decorators-legacy'],
    });

    const edits: TextEdit[] = [];

    // 1. Add or verify import declaration (Idempotent)
    const importDeclarations = ast.program.body.filter(
      (node): node is any => node.type === 'ImportDeclaration',
    );

    const alreadyImported = importDeclarations.some((decl) => {
      const matchSource = decl.source.value === featureModuleImportPath;
      const matchNamed = decl.specifiers.some(
        (s: any) => s.type === 'ImportSpecifier' && s.local.name === featureModuleClassName,
      );
      return matchSource || matchNamed;
    });

    if (!alreadyImported) {
      const newImport = `import { ${featureModuleClassName} } from '${featureModuleImportPath}';${nl}`;
      if (importDeclarations.length > 0) {
        const lastImport = importDeclarations[importDeclarations.length - 1];
        edits.push({
          start: lastImport.end,
          end: lastImport.end,
          newText: `${nl}${newImport}`,
        });
      } else {
        edits.push({
          start: 0,
          end: 0,
          newText: newImport,
        });
      }
    }

    // 2. Find the class decorated with @Module
    const classDeclarations: any[] = [];
    for (const node of ast.program.body) {
      if (node.type === 'ClassDeclaration') {
        classDeclarations.push(node);
      } else if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'ClassDeclaration') {
        classDeclarations.push(node.declaration);
      }
    }

    let moduleClass = classDeclarations.find((cls) => {
      return (cls.decorators || []).some((d: any) => {
        const calleeName = d.expression?.callee?.name || d.expression?.name;
        return calleeName === 'Module';
      });
    });

    if (!moduleClass && classDeclarations.length > 0) {
      moduleClass = classDeclarations[0];
    }

    if (!moduleClass) {
      if (edits.length > 0) {
        fs.writeFileSync(parentModulePath, applyEditsRightToLeft(code, edits), 'utf-8');
      }
      return false;
    }

    const moduleDecorator = (moduleClass.decorators || []).find((d: any) => {
      const calleeName = d.expression?.callee?.name || d.expression?.name;
      return calleeName === 'Module';
    });

    if (!moduleDecorator) {
      if (edits.length > 0) {
        fs.writeFileSync(parentModulePath, applyEditsRightToLeft(code, edits), 'utf-8');
      }
      return false;
    }

    const decoratorArgs = moduleDecorator.expression.arguments || [];
    if (decoratorArgs.length === 0) {
      edits.push({
        start: moduleDecorator.expression.end - 1,
        end: moduleDecorator.expression.end - 1,
        newText: `{${nl}  imports: [${featureModuleClassName}],${nl}}`,
      });
    } else {
      const arg = decoratorArgs[0];
      if (arg.type === 'ObjectExpression') {
        const importsProp = arg.properties.find(
          (p: any) => p.type === 'ObjectProperty' && (p.key?.name === 'imports' || p.key?.value === 'imports'),
        );

        if (importsProp) {
          if (importsProp.value.type === 'ArrayExpression') {
            const arr = importsProp.value;
            const alreadyInArray = arr.elements.some((el: any) => {
              if (!el) return false;
              if (el.type === 'Identifier') return el.name === featureModuleClassName;
              if (el.type === 'StringLiteral') return el.value === featureModuleClassName;
              if (el.type === 'SpreadElement') return el.argument?.name === featureModuleClassName;
              return false;
            });

            if (!alreadyInArray) {
              if (arr.elements.length === 0) {
                if (code.slice(arr.start, arr.end).includes('\n')) {
                  const lastNl = code.lastIndexOf('\n', arr.end - 1);
                  const indent = code.slice(lastNl + 1, arr.end - 1);
                  edits.push({
                    start: arr.end - 1,
                    end: arr.end - 1,
                    newText: `  ${featureModuleClassName},${nl}${indent}`,
                  });
                } else {
                  edits.push({
                    start: arr.end - 1,
                    end: arr.end - 1,
                    newText: featureModuleClassName,
                  });
                }
              } else {
                const lastEl = arr.elements[arr.elements.length - 1];
                const between = code.slice(lastEl.end, arr.end - 1);
                const isMultiline = between.includes('\n');

                if (isMultiline) {
                  const lastNl = code.lastIndexOf('\n', arr.end - 1);
                  const closingIndent = code.slice(lastNl + 1, arr.end - 1);
                  const lastElLineStart = code.lastIndexOf('\n', lastEl.start) + 1;
                  const itemIndent = code.slice(lastElLineStart, lastEl.start).match(/^\s*/)?.[0] || `${closingIndent}  `;

                  const sliceAfterLast = code.slice(lastEl.end, arr.end - 1);
                  const hasComma = /^\s*,/.test(sliceAfterLast);

                  if (!hasComma) {
                    edits.push({
                      start: lastEl.end,
                      end: lastEl.end,
                      newText: ',',
                    });
                  }

                  edits.push({
                    start: lastNl + 1,
                    end: lastNl + 1,
                    newText: `${itemIndent}${featureModuleClassName},${nl}`,
                  });
                } else {
                  const hasComma = code.slice(lastEl.end, arr.end - 1).includes(',');
                  if (hasComma) {
                    const commaOffset = lastEl.end + code.slice(lastEl.end, arr.end - 1).indexOf(',') + 1;
                    edits.push({
                      start: commaOffset,
                      end: commaOffset,
                      newText: ` ${featureModuleClassName}`,
                    });
                  } else {
                    edits.push({
                      start: lastEl.end,
                      end: lastEl.end,
                      newText: `, ${featureModuleClassName}`,
                    });
                  }
                }
              }
            }
          } else {
            // Non-literal imports (e.g. variable or expression) -> wrap with spread safely
            edits.push({
              start: importsProp.value.start,
              end: importsProp.value.end,
              newText: `[...${code.slice(importsProp.value.start, importsProp.value.end)}, ${featureModuleClassName}]`,
            });
          }
        } else {
          // imports property does not exist
          const isMultilineObj = code.slice(arg.start, arg.end).includes('\n');
          const insertPos = arg.start + 1;
          if (isMultilineObj) {
            edits.push({
              start: insertPos,
              end: insertPos,
              newText: `${nl}  imports: [${featureModuleClassName}],`,
            });
          } else {
            edits.push({
              start: insertPos,
              end: insertPos,
              newText: ` imports: [${featureModuleClassName}], `,
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

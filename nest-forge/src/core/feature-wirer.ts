import * as fs from 'node:fs';
import { parse } from '@babel/parser';
import { applyEditsRightToLeft, type TextEdit } from './ast/splicer.js';

export interface WireRepositoryOptions {
  modulePath: string;
  servicePath: string;
  repositoryClassName: string;
  repositoryImportPath: string;
  serviceImportPath?: string;
  paramName: string;
}

export interface WireComponentOptions {
  modulePath: string;
  className: string;
  importPath: string;
  targetArrays: Array<'controllers' | 'providers' | 'exports' | 'imports'>;
}

function findClassDeclarations(ast: any): any[] {
  const classes: any[] = [];
  for (const node of ast.program.body) {
    if (node.type === 'ClassDeclaration') {
      classes.push(node);
    } else if (node.type === 'ExportNamedDeclaration' && node.declaration?.type === 'ClassDeclaration') {
      classes.push(node.declaration);
    }
  }
  return classes;
}

function ensureArrayProperty(
  obj: any,
  propName: string,
  elementName: string,
  code: string,
  edits: TextEdit[],
) {
  const prop = obj.properties.find(
    (p: any) => p.type === 'ObjectProperty' && (p.key?.name === propName || p.key?.value === propName),
  );

  if (prop) {
    if (prop.value.type === 'ArrayExpression') {
      const arr = prop.value;
      const alreadyPresent = arr.elements.some(
        (el: any) => el?.name === elementName || el?.value === elementName,
      );
      if (!alreadyPresent) {
        if (arr.elements.length === 0) {
          edits.push({
            start: arr.end - 1,
            end: arr.end - 1,
            newText: elementName,
          });
        } else {
          const lastEl = arr.elements[arr.elements.length - 1];
          const between = code.slice(lastEl.end, arr.end - 1);
          if (between.includes(',')) {
            const commaOffset = lastEl.end + between.indexOf(',') + 1;
            edits.push({
              start: commaOffset,
              end: commaOffset,
              newText: ` ${elementName}`,
            });
          } else {
            edits.push({
              start: lastEl.end,
              end: lastEl.end,
              newText: `, ${elementName}`,
            });
          }
        }
      }
    }
  } else {
    edits.push({
      start: obj.start + 1,
      end: obj.start + 1,
      newText: `\n  ${propName}: [${elementName}],`,
    });
  }
}

export function wireComponentIntoModule(options: WireComponentOptions): boolean {
  const { modulePath, className, importPath, targetArrays } = options;
  if (!modulePath || !fs.existsSync(modulePath) || !fs.statSync(modulePath).isFile()) {
    return false;
  }

  try {
    const code = fs.readFileSync(modulePath, 'utf-8');
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'decorators-legacy'],
    });

    const edits: TextEdit[] = [];

    // Check import
    const importDeclarations = ast.program.body.filter(
      (node): node is any => node.type === 'ImportDeclaration',
    );

    const hasImport = importDeclarations.some((decl) => {
      return decl.specifiers.some(
        (s: any) => s.type === 'ImportSpecifier' && s.local.name === className,
      );
    });

    if (!hasImport) {
      const newImport = `import { ${className} } from '${importPath}';\n`;
      if (importDeclarations.length > 0) {
        const lastImport = importDeclarations[importDeclarations.length - 1];
        edits.push({
          start: lastImport.end,
          end: lastImport.end,
          newText: `\n${newImport}`,
        });
      } else {
        edits.push({
          start: 0,
          end: 0,
          newText: newImport,
        });
      }
    }

    // Find @Module class
    const classes = findClassDeclarations(ast);
    const moduleClass = classes.find((cls) => {
      return (cls.decorators || []).some((d: any) => {
        const calleeName = d.expression?.callee?.name || d.expression?.name;
        return calleeName === 'Module';
      });
    }) || classes[0];

    if (moduleClass) {
      const moduleDec = (moduleClass.decorators || []).find((d: any) => {
        const calleeName = d.expression?.callee?.name || d.expression?.name;
        return calleeName === 'Module';
      });

      if (moduleDec && moduleDec.expression.arguments?.length > 0) {
        const obj = moduleDec.expression.arguments[0];
        if (obj.type === 'ObjectExpression') {
          for (const arrName of targetArrays) {
            ensureArrayProperty(obj, arrName, className, code, edits);
          }
        }
      }
    }

    if (edits.length > 0) {
      const updated = applyEditsRightToLeft(code, edits);
      fs.writeFileSync(modulePath, updated, 'utf-8');
    }
    return true;
  } catch {
    return false;
  }
}

export interface InjectDependencyOptions {
  targetFilePath: string;
  targetClassName?: string;
  dependencyClassName: string;
  importPath: string;
  paramName: string;
}

export function injectDependencyIntoClass(options: InjectDependencyOptions): boolean {
  const { targetFilePath, targetClassName, dependencyClassName, importPath, paramName } = options;
  if (!targetFilePath || !fs.existsSync(targetFilePath) || !fs.statSync(targetFilePath).isFile()) {
    return false;
  }

  try {
    const code = fs.readFileSync(targetFilePath, 'utf-8');
    const ast = parse(code, {
      sourceType: 'module',
      plugins: ['typescript', 'decorators-legacy'],
    });

    const edits: TextEdit[] = [];

    // 1. Check or add import
    const importDeclarations = ast.program.body.filter(
      (node): node is any => node.type === 'ImportDeclaration',
    );

    const hasImport = importDeclarations.some((decl) => {
      return decl.specifiers.some(
        (s: any) => s.type === 'ImportSpecifier' && s.local.name === dependencyClassName,
      );
    });

    if (!hasImport) {
      const newImport = `import { ${dependencyClassName} } from '${importPath}';\n`;
      if (importDeclarations.length > 0) {
        const lastImport = importDeclarations[importDeclarations.length - 1];
        edits.push({
          start: lastImport.end,
          end: lastImport.end,
          newText: `\n${newImport}`,
        });
      } else {
        edits.push({
          start: 0,
          end: 0,
          newText: newImport,
        });
      }
    }

    // 2. Find target class (either specific targetClassName, or @Injectable, @Controller, @Processor, or first exported class)
    const classes = findClassDeclarations(ast);
    const targetClass =
      (targetClassName ? classes.find((cls) => cls.id?.name === targetClassName) : undefined) ||
      classes.find((cls) => {
        return (cls.decorators || []).some((d: any) => {
          const calleeName = d.expression?.callee?.name || d.expression?.name;
          return ['Injectable', 'Controller', 'Processor'].includes(calleeName);
        });
      }) ||
      classes[0];

    if (!targetClass) {
      return false;
    }

    const ctor = (targetClass.body?.body || []).find(
      (m: any) => (m.type === 'ClassMethod' || m.type === 'MethodDefinition') && m.kind === 'constructor',
    );

    const paramText = `readonly ${paramName}: ${dependencyClassName}`;

    if (ctor) {
      const hasParam = (ctor.params || []).some((p: any) => {
        const pName = p.name || p.parameter?.name;
        const typeName = p.typeAnnotation?.typeAnnotation?.typeName?.name ||
          p.parameter?.typeAnnotation?.typeAnnotation?.typeName?.name;
        return pName === paramName || typeName === dependencyClassName;
      });

      if (!hasParam) {
        if (ctor.params.length === 0) {
          const parenClose = code.lastIndexOf(')', ctor.body.start);
          if (parenClose !== -1) {
            edits.push({
              start: parenClose,
              end: parenClose,
              newText: paramText,
            });
          }
        } else {
          const lastParam = ctor.params[ctor.params.length - 1];
          edits.push({
            start: lastParam.end,
            end: lastParam.end,
            newText: `, ${paramText}`,
          });
        }
      }
    } else {
      const insertPos = targetClass.body.start + 1;
      edits.push({
        start: insertPos,
        end: insertPos,
        newText: `\n  constructor(\n    readonly ${paramName}: ${dependencyClassName},\n  ) {}\n`,
      });
    }

    if (edits.length > 0) {
      const updated = applyEditsRightToLeft(code, edits);
      fs.writeFileSync(targetFilePath, updated, 'utf-8');
    }
    return true;
  } catch {
    return false;
  }
}

export function wireRepositoryIntoFeature(options: WireRepositoryOptions): boolean {
  const { modulePath, servicePath, repositoryClassName, repositoryImportPath, serviceImportPath, paramName } = options;

  // 1. Wire into *.module.ts
  if (modulePath) {
    wireComponentIntoModule({
      modulePath,
      className: repositoryClassName,
      importPath: repositoryImportPath,
      targetArrays: ['providers', 'exports'],
    });
  }

  // 2. Wire into *.service.ts via injectDependencyIntoClass
  if (servicePath) {
    injectDependencyIntoClass({
      targetFilePath: servicePath,
      dependencyClassName: repositoryClassName,
      importPath: serviceImportPath || repositoryImportPath,
      paramName,
    });
  }

  return true;
}

import * as path from 'node:path';

export class Range {
  constructor(
    public startLine: number,
    public startCharacter: number,
    public endLine: number,
    public endCharacter: number,
  ) {}
}

export class Position {
  constructor(
    public line: number,
    public character: number,
  ) {}
}

export class Uri {
  public fsPath: string;
  public path: string;
  public scheme: string;

  constructor(fsPath: string, scheme = 'file') {
    this.fsPath = fsPath;
    this.path = fsPath;
    this.scheme = scheme;
  }

  static file(fsPath: string): Uri {
    return new Uri(fsPath, 'file');
  }

  static parse(str: string): Uri {
    return new Uri(str, 'file');
  }

  static joinPath(base: Uri, ...pathSegments: string[]): Uri {
    return new Uri(path.join(base.fsPath, ...pathSegments), base.scheme);
  }

  toString(): string {
    return `${this.scheme}://${this.fsPath}`;
  }
}

export class EventEmitter<T = any> {
  private listeners: ((e: T) => void)[] = [];
  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return {
      dispose: () => {
        const idx = this.listeners.indexOf(listener);
        if (idx !== -1) this.listeners.splice(idx, 1);
      },
    };
  };
  fire(data: T): void {
    for (const l of [...this.listeners]) {
      l(data);
    }
  }
  dispose(): void {
    this.listeners = [];
  }
  listenerCount(): number {
    return this.listeners.length;
  }
}

export class RelativePattern {
  constructor(
    public base: any,
    public pattern: string,
  ) {}
}

export const ViewColumn = {
  One: 1,
  Two: 2,
  Three: 3,
};

export const CodeActionKind = {
  QuickFix: 'quickfix',
  RefactorExtract: 'refactor.extract',
};

export const StatusBarAlignment = {
  Left: 1,
  Right: 2,
};

export const workspace = {
  isTrusted: true,
  workspaceFolders: [] as any[],
  textDocuments: [] as any[],
  getWorkspaceFolder: (_uri: any): any => workspace.workspaceFolders[0],
  findFiles: async () => [],
  getConfiguration: () => ({
    get: (_key: string, defaultValue?: any) => defaultValue,
  }),
  createFileSystemWatcher: () => ({
    onDidChange: () => ({ dispose: () => {} }),
    onDidCreate: () => ({ dispose: () => {} }),
    onDidDelete: () => ({ dispose: () => {} }),
    dispose: () => {},
  }),
  onDidOpenTextDocument: () => ({ dispose: () => {} }),
  onDidChangeTextDocument: () => ({ dispose: () => {} }),
  onDidCloseTextDocument: () => ({ dispose: () => {} }),
  openTextDocument: async () => ({}),
};

export const window = {
  showInformationMessage: async (..._args: any[]): Promise<any> => undefined,
  showErrorMessage: async (..._args: any[]): Promise<any> => undefined,
  showWarningMessage: async (..._args: any[]): Promise<any> => undefined,
  showQuickPick: async (..._args: any[]): Promise<any> => undefined,
  showInputBox: async (..._args: any[]): Promise<any> => undefined,
  showTextDocument: async (..._args: any[]): Promise<any> => ({}),
  registerTreeDataProvider: () => ({ dispose: () => {} }),
  createWebviewPanel: (..._args: any[]): any => ({}),
  createOutputChannel: () => ({
    appendLine: () => {},
    show: () => {},
    dispose: () => {},
  }),
  createStatusBarItem: () => ({
    show: () => {},
    hide: () => {},
    dispose: () => {},
    text: '',
    tooltip: '',
  }),
  activeTextEditor: undefined as any,
};

export const commands = {
  registerCommand: (_command: string, _callback: (...args: any[]) => any) => ({ dispose: () => {} }),
  executeCommand: async (..._args: any[]): Promise<any> => undefined,
};

export enum DiagnosticSeverity {
  Error = 0,
  Warning = 1,
  Information = 2,
  Hint = 3,
}

export class Diagnostic {
  code?: string | number | { value: string | number; target: any };
  source?: string;
  constructor(
    public range: Range,
    public message: string,
    public severity: DiagnosticSeverity = DiagnosticSeverity.Error,
  ) {}
}

export enum TreeItemCollapsibleState {
  None = 0,
  Collapsed = 1,
  Expanded = 2,
}

export class TreeItem {
  constructor(
    public label: string,
    public collapsibleState: TreeItemCollapsibleState = TreeItemCollapsibleState.None,
  ) {}
}

export class ThemeIcon {
  constructor(public id: string) {}
}

export const languages = {
  createDiagnosticCollection: () => ({
    set: () => {},
    delete: () => {},
    clear: () => {},
    dispose: () => {},
  }),
  registerCodeActionsProvider: () => ({ dispose: () => {} }),
  registerHoverProvider: () => ({ dispose: () => {} }),
  registerCompletionItemProvider: () => ({ dispose: () => {} }),
  registerDefinitionProvider: () => ({ dispose: () => {} }),
};


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

export const Uri = {
  file(fsPath: string) {
    return { fsPath, path: fsPath, scheme: 'file' };
  },
  parse(str: string) {
    return { fsPath: str, path: str, scheme: 'file' };
  },
};

export class EventEmitter<T = any> {
  private listeners: ((e: T) => void)[] = [];
  event = (listener: (e: T) => void) => {
    this.listeners.push(listener);
    return { dispose: () => {} };
  };
  fire(data: T): void {
    for (const l of this.listeners) {
      l(data);
    }
  }
  dispose(): void {
    this.listeners = [];
  }
}

export class RelativePattern {
  constructor(
    public base: any,
    public pattern: string,
  ) {}
}

export const workspace = {
  findFiles: async () => [],
  getConfiguration: () => ({
    get: (key: string, defaultValue?: any) => defaultValue,
  }),
  createFileSystemWatcher: () => ({
    onDidChange: () => ({ dispose: () => {} }),
    onDidCreate: () => ({ dispose: () => {} }),
    onDidDelete: () => ({ dispose: () => {} }),
    dispose: () => {},
  }),
  openTextDocument: async () => ({}),
};

export const window = {
  showInformationMessage: async () => undefined,
  showErrorMessage: async () => undefined,
  showWarningMessage: async () => undefined,
  showQuickPick: async () => undefined,
  showInputBox: async () => undefined,
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
  activeTextEditor: undefined,
};

export const commands = {
  registerCommand: () => ({ dispose: () => {} }),
  executeCommand: async () => undefined,
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
};

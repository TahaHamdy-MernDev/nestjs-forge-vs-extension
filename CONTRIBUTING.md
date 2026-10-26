# Contributing to Nest Forge

Thank you for your interest in contributing to **Nest Forge**! We welcome contributions, bug reports, and suggestions.

## Development Workflow

This project is a Visual Studio Code / Antigravity extension built with TypeScript, esbuild, and Vitest.

### Prerequisites

- [Node.js](https://nodejs.org/) (v20+ recommended)
- [pnpm](https://pnpm.io/) (`corepack enable` or `npm install -g pnpm`)

### Setup

1. Clone the repository:
   ```bash
   git clone https://github.com/TahaHamdy-MernDev/nestjs-forge-vs-extension.git
   cd nestjs-forge-vs-extension/nest-forge
   ```

2. Install dependencies:
   ```bash
   pnpm install
   ```

### Building & Running

Inside `nest-forge/`:

- **Watch mode (incremental compilation)**:
  ```bash
  pnpm run watch
  ```
- **One-off build**:
  ```bash
  pnpm run compile
  ```
- **Type checking**:
  ```bash
  pnpm run typecheck
  ```
- **Run test suite**:
  ```bash
  pnpm run test
  ```
- **Package `.vsix` extension package**:
  ```bash
  pnpm run package
  ```

### Debugging in VS Code

1. Open the project root or the `nest-forge` folder in VS Code.
2. Press `F5` (or choose **Run Extension (Nest Forge)** in the Run & Debug view).
3. A new Extension Development Host window will launch with the extension activated.

## Guidelines

- Keep code clean and self-documenting.
- Add unit/integration tests in `tests/` for any new features or bug fixes.
- Ensure `pnpm run compile`, `pnpm run typecheck`, and `pnpm run test` all pass cleanly before opening a pull request.

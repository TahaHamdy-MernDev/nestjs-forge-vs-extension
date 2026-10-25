# Nest Forge 🔨

An intelligent, visual VS Code / Antigravity extension to scaffold NestJS feature modules with opinionated conventions, live tree preview, and AST-powered parent module registration.

## Features
- **Visual Webview Form**: Type a feature name once; kebab, Pascal, snake, camel, and plural route paths are automatically derived.
- **Editable Filenames**: Fine-tune any file name directly before confirming.
- **Dynamic File Lists**: Add multiple DTOs, events, and listeners on the fly.
- **Drizzle ORM & class-validator by default**: Ships with your exact production conventions (Drizzle node-pg injection, class-validator, versioned controllers).
- **AST Parent Module Registration**: Modifies `features.module.ts` (or `app.module.ts`) using `ts-morph` — completely idempotent with no regex fragility.
- **Workspace Auto-Detection**: Infers your ORM, formatter, validator, and path aliases from `package.json` and `tsconfig.json`.
- **Formatter Integration**: Formats newly generated files using Biome or Prettier automatically.

## Usage
1. Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) and run **NestJS: New Feature**.
2. Or right-click any folder in the Explorer and choose **NestJS: New Feature**.
3. Fill in or customize the generated files.
4. Click **🔨 Forge Feature**.

## License
MIT

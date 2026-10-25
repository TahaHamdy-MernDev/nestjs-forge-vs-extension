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
- **Explorer Submenu**: Context commands in the file explorer are neatly organized under a dedicated **Nest Forge** submenu.

## Activation
Nest Forge activates on-demand when invoking its views or commands, or automatically when opening a workspace containing `nest-cli.json` or `src/i18n`.

## Workspace Trust
Nest Forge supports VS Code Workspace Trust in limited mode. When a workspace is untrusted:
- Custom templates in `.nest-forge/templates` are ignored, falling back safely to built-in templates.
- Local formatters from `node_modules/.bin` are skipped to prevent untrusted binary execution.

## Configuration
- `nestForge.formatter`: Code formatter used after scaffolding (`biome`, `prettier`, or `none`; defaults to `biome`).
- `nestForge.validator`: Validation library used for DTOs and schema generation (`class-validator`, `zod`, or `none`; defaults to `class-validator`).
- `nestForge.featuresDir`: Target directory for new features (defaults to `src/features`).
- `nestForge.parentModule`: Path to the parent module for AST registration.
- `nestForge.orm`: Selected ORM (`drizzle`, `prisma`, `typeorm`, or `none`).
- `nestForge.pathAlias`: Import path alias for generated cross-module references.

## Usage
1. Open Command Palette (`Ctrl+Shift+P` or `Cmd+Shift+P`) and run **NestJS: New Feature**.
2. Or right-click any folder or TypeScript file in the Explorer and choose **Nest Forge** > **NestJS: New Feature**.
3. Fill in or customize the generated files.
4. Click **🔨 Forge Feature**.

## License
MIT

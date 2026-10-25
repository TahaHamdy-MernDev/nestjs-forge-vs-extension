# Nest Forge Development & Release Rules

Whenever making any code changes, bug fixes, or enhancements to **Nest Forge** (`nest-forge`):

## 1. Version Bump
- Automatically bump the `version` in `nest-forge/package.json` using semantic versioning:
  - **Patch** (`0.1.x`) for bug fixes, styling tweaks, template adjustments, and minor refactors.
  - **Minor** (`0.x.0`) for new features, new generators, schema updates, or new view integrations.
  - **Major** (`x.0.0`) for breaking changes or architectural redesigns.

## 2. Validation & Quality Checks
Before releasing, always run and verify:
- `pnpm run compile`: Build extension bundles and copy templates/assets to `dist/`.
- `pnpm run typecheck`: Ensure TypeScript passes with 0 diagnostics errors (`tsc --noEmit`).
- `pnpm run test`: Ensure 100% of the Vitest unit test suite passes.

## 3. Package & Release (.vsix)
- Run `pnpm run package` (which runs `vsce package --no-dependencies`) to produce the newly versioned `.vsix` bundle in the `nest-forge/` directory.
- Confirm the new `.vsix` file is generated and ready for local installation.

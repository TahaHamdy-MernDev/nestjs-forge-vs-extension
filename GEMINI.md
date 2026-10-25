# Workspace Rules

## Nest Forge Development & Release
Whenever making any code changes, bug fixes, or enhancements to **Nest Forge** (`nest-forge`):

1. **Version Bump**: Automatically bump the `version` in `nest-forge/package.json` using semantic versioning:
   - **Patch** (`0.1.x`) for bug fixes, styling tweaks, template adjustments, and minor refactors.
   - **Minor** (`0.x.0`) for new features, new generators, schema updates, or new view integrations.
   - **Major** (`x.0.0`) for breaking changes or architectural redesigns.
2. **Validation**: Always run `pnpm run compile`, `pnpm run typecheck`, and `pnpm run test` inside `nest-forge/`.
3. **Release & Package**: Run `pnpm run package` in `nest-forge/` to package the newly versioned `.vsix` release file.

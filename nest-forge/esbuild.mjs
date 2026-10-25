import esbuild from 'esbuild';
import fs from 'node:fs';
import path from 'node:path';

const isWatch = process.argv.includes('--watch');

function copyDirRecursive(src, dest) {
  if (!fs.existsSync(src)) return;
  fs.mkdirSync(dest, { recursive: true });
  const entries = fs.readdirSync(src, { withFileTypes: true });
  for (const entry of entries) {
    const srcPath = path.join(src, entry.name);
    const destPath = path.join(dest, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(srcPath, destPath);
    } else {
      fs.copyFileSync(srcPath, destPath);
    }
  }
}

function copyAssets() {
  copyDirRecursive('src/templates', 'dist/templates');
  copyDirRecursive('src/webview/ui', 'dist/webview/ui');
  copyDirRecursive('resources', 'dist/resources');
  console.log('Copied templates, webview UI, and icon assets to dist/');
}

const copyAssetsPlugin = {
  name: 'copy-assets',
  setup(build) {
    build.onEnd(() => {
      copyAssets();
    });
  },
};

const buildOptions = {
  entryPoints: ['src/extension.ts'],
  bundle: true,
  outfile: 'dist/extension.js',
  external: ['vscode'],
  format: 'cjs',
  platform: 'node',
  target: 'node20',
  mainFields: ['module', 'main'],
  sourcemap: isWatch,
  minify: !isWatch,
  legalComments: 'none',
  metafile: true,
  plugins: [copyAssetsPlugin],
};

async function run() {
  if (isWatch) {
    const ctx = await esbuild.context(buildOptions);
    await ctx.watch();
    console.log('Watching for changes in extension...');
  } else {
    const result = await esbuild.build(buildOptions);
    if (result.metafile) {
      fs.writeFileSync('dist/meta.json', JSON.stringify(result.metafile, null, 2));
    }
    console.log('Build completed successfully.');
  }
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});

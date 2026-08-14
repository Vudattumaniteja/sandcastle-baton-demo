import { defineConfig } from 'tsup';
import fs from 'node:fs';
import path from 'node:path';

const packageJsonPath = path.resolve(__dirname, 'package.json');
const pkg = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

export default defineConfig([
  // Standalone CLI Executable
  {
    entry: {
      'bin/sandcastle': 'src/bin/sandcastle.ts',
    },
    format: ['esm'],
    platform: 'node',
    target: 'node18',
    clean: true,
    dts: false,
    banner: {
      js: '#!/usr/bin/env node\nimport { createRequire as __createRequire } from "node:module";\nvar require = __createRequire(import.meta.url);',
    },
    noExternal: [/.*/],
    define: {
      __SANDCASTLE_VERSION__: JSON.stringify(pkg.version),
    },
    outDir: 'dist',
    async onSuccess() {
      // Ensure LF shebang line ending for Unix compatibility
      const binFile = path.resolve(__dirname, 'dist/bin/sandcastle.js');
      if (fs.existsSync(binFile)) {
        let content = fs.readFileSync(binFile, 'utf-8');
        // Normalize CRLF to LF on the entire header
        content = content.replace(/\r\n/g, '\n');
        fs.writeFileSync(binFile, content, 'utf-8');
        // Set execute permissions
        try {
          fs.chmodSync(binFile, 0o755);
        } catch {
          // chmod might fail on Windows, safe to ignore
        }
      }
    },
  },
  // Typed Library
  {
    entry: {
      index: 'src/index.ts',
    },
    format: ['esm'],
    platform: 'node',
    target: 'node18',
    clean: false,
    dts: true,
    define: {
      __SANDCASTLE_VERSION__: JSON.stringify(pkg.version),
    },
    outDir: 'dist',
  },
]);

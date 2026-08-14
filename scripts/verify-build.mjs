#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const rootDir = path.resolve(__dirname, '..');
const pkgPath = path.resolve(rootDir, 'package.json');
const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf-8'));

console.log(`[verify-build] Validating build artifacts for sandcastle v${pkg.version}...`);

// 1. Validate package.json configuration
if (pkg.type !== 'module') {
  throw new Error(`package.json "type" must be "module", got "${pkg.type}"`);
}
if (!pkg.engines?.node || !pkg.engines.node.includes('>=18')) {
  throw new Error(`package.json "engines.node" must require >=18.0.0, got "${pkg.engines?.node}"`);
}
if (pkg.bin?.sandcastle !== './dist/bin/sandcastle.js') {
  throw new Error(`package.json "bin.sandcastle" must be "./dist/bin/sandcastle.js", got "${pkg.bin?.sandcastle}"`);
}
if (pkg.bin?.sc !== './dist/bin/sandcastle.js') {
  throw new Error(`package.json "bin.sc" must be "./dist/bin/sandcastle.js", got "${pkg.bin?.sc}"`);
}
console.log('  ✓ package.json metadata and dual-binary configuration verified');

// 2. Validate artifact existence
const distBin = path.resolve(rootDir, 'dist/bin/sandcastle.js');
const distLib = path.resolve(rootDir, 'dist/index.js');
const distDts = path.resolve(rootDir, 'dist/index.d.ts');

if (!fs.existsSync(distBin)) throw new Error(`Missing CLI executable: ${distBin}`);
if (!fs.existsSync(distLib)) throw new Error(`Missing library output: ${distLib}`);
if (!fs.existsSync(distDts)) throw new Error(`Missing TypeScript declarations: ${distDts}`);
console.log('  ✓ Artifacts exist (dist/bin/sandcastle.js, dist/index.js, dist/index.d.ts)');

// 3. Validate Shebang header format (must be LF line ending)
const binContent = fs.readFileSync(distBin, 'utf-8');
if (!binContent.startsWith('#!/usr/bin/env node\n')) {
  // If CRLF was present, normalize it
  if (binContent.startsWith('#!/usr/bin/env node\r\n')) {
    const fixed = '#!/usr/bin/env node\n' + binContent.slice('#!/usr/bin/env node\r\n'.length);
    fs.writeFileSync(distBin, fixed, 'utf-8');
    console.log('  ! Normalized shebang line ending from CRLF to LF');
  } else {
    throw new Error(`dist/bin/sandcastle.js does not start with valid LF shebang "#!/usr/bin/env node\\n"`);
  }
}
console.log('  ✓ CLI shebang format valid (#!/usr/bin/env node with LF)');

// 4. Validate CLI execution (--version)
const versionOutput = execFileSync(process.execPath, [distBin, '--version'], { encoding: 'utf-8' }).trim();
if (versionOutput !== pkg.version) {
  throw new Error(`--version mismatch: expected "${pkg.version}", got "${versionOutput}"`);
}
console.log(`  ✓ CLI --version smoke test passed ("${versionOutput}")`);

// 5. Validate CLI execution (--help)
const helpOutput = execFileSync(process.execPath, [distBin, '--help'], { encoding: 'utf-8' });
if (!helpOutput.includes('Usage: sandcastle') || !helpOutput.includes('--version')) {
  throw new Error(`--help output missing expected sections: ${helpOutput}`);
}
console.log('  ✓ CLI --help smoke test passed');

// 6. Validate typed library export
const libModule = await import(`file://${distLib.replace(/\\/g, '/')}`);
if (libModule.VERSION !== pkg.version) {
  throw new Error(`Library VERSION mismatch: expected "${pkg.version}", got "${libModule.VERSION}"`);
}
console.log(`  ✓ Programmatic library export verified (VERSION = "${libModule.VERSION}")`);

console.log('[verify-build] All prepack and build verifications PASSED successfully! 🏖️\n');

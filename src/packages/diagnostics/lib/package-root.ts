import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

/**
 * Resolves the root directory of the Sandcastle repository/package from disk.
 */
export function resolveSandcastlePackageRoot(fromUrl?: string): string {
  try {
    let currentDir = path.dirname(fileURLToPath(fromUrl || import.meta.url));
    if (fs.existsSync(currentDir)) {
      currentDir = fs.realpathSync(currentDir);
    }
    let dir = currentDir;
    while (dir && dir !== path.dirname(dir)) {
      const pkgPath = path.join(dir, 'package.json');
      if (fs.existsSync(pkgPath)) {
        try {
          const pkg = JSON.parse(fs.readFileSync(pkgPath, 'utf8'));
          if (pkg.name === 'sandcastle') {
            return dir;
          }
        } catch {
          // Ignore unreadable or malformed package.json in ancestor directories
        }
      }
      dir = path.dirname(dir);
    }
  } catch {
    // Non-fatal: filesystem traversal or invalid URL failed, return empty string fallback
  }
  return '';
}

import fs from 'fs';
import path from 'path';

/**
 * Writes data to a file atomically by writing to a temporary file
 * in the same directory first, then renaming it to the target file.
 */
export function writeAtomicSync(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  fs.writeFileSync(tmpPath, content, 'utf-8');

  try {
    fs.renameSync(tmpPath, filePath);
  } catch {
    // Fallback for Windows locking, AV scans, or cross-filesystem quirks
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
      fs.renameSync(tmpPath, filePath);
    } catch {
      fs.copyFileSync(tmpPath, filePath);
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        // Tolerates ENOENT or transient file lock if temp file is already removed
      }
    }
  }
}

/**
 * Async version of atomic file writing.
 */
export async function writeAtomic(filePath: string, content: string): Promise<void> {
  const dir = path.dirname(filePath);
  await fs.promises.mkdir(dir, { recursive: true });

  const tmpPath = `${filePath}.${Date.now()}.${Math.random().toString(36).slice(2, 8)}.tmp`;
  await fs.promises.writeFile(tmpPath, content, 'utf-8');

  try {
    await fs.promises.rename(tmpPath, filePath);
  } catch {
    try {
      if (fs.existsSync(filePath)) {
        await fs.promises.unlink(filePath);
      }
      await fs.promises.rename(tmpPath, filePath);
    } catch {
      await fs.promises.copyFile(tmpPath, filePath);
      try {
        await fs.promises.unlink(tmpPath);
      } catch {
        // Tolerates ENOENT or transient file lock if temp file is already removed
      }
    }
  }
}

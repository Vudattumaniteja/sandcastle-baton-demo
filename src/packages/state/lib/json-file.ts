import fs from 'fs';
import path from 'path';
import { writeAtomicSync, writeAtomic } from './atomic-file.js';

/**
 * Safely reads and parses a JSON file.
 * Returns null if the file does not exist, is empty, or contains invalid JSON.
 */
export function readJsonFileSync<T = unknown>(filePath: string): T | null {
  try {
    if (fs.existsSync(filePath)) {
      const raw = fs.readFileSync(filePath, 'utf-8');
      if (raw && raw.trim()) {
        return JSON.parse(raw) as T;
      }
    }
  } catch {
    // Expected ENOENT or syntax errors from incomplete writes return null
  }
  return null;
}

/**
 * Safely writes JSON data to a file, creating parent directories if necessary.
 * By default uses atomic writes (writes to .tmp then renames).
 */
export function writeJsonFileSync<T = unknown>(
  filePath: string,
  data: T,
  atomic: boolean = true
): void {
  const content = JSON.stringify(data, null, 2);
  if (atomic) {
    writeAtomicSync(filePath, content);
  } else {
    const dir = path.dirname(filePath);
    if (!fs.existsSync(dir)) {
      fs.mkdirSync(dir, { recursive: true });
    }
    fs.writeFileSync(filePath, content, 'utf-8');
  }
}

/**
 * Async safe JSON reading.
 */
export async function readJsonFile<T = unknown>(filePath: string): Promise<T | null> {
  try {
    const raw = await fs.promises.readFile(filePath, 'utf-8');
    if (raw && raw.trim()) {
      return JSON.parse(raw) as T;
    }
  } catch {
    // Expected ENOENT or syntax errors from incomplete writes return null
  }
  return null;
}

/**
 * Async safe JSON writing.
 */
export async function writeJsonFile<T = unknown>(
  filePath: string,
  data: T,
  atomic: boolean = true
): Promise<void> {
  const content = JSON.stringify(data, null, 2);
  if (atomic) {
    await writeAtomic(filePath, content);
  } else {
    const dir = path.dirname(filePath);
    await fs.promises.mkdir(dir, { recursive: true });
    await fs.promises.writeFile(filePath, content, 'utf-8');
  }
}

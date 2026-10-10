import type { EventEmitter } from 'events';

export interface KeypressListenerOptions {
  stdin?: NodeJS.ReadStream;
  onKey?: (key: string, raw: Buffer | string) => void;
}

export class KeypressListener {
  private stdin: NodeJS.ReadStream;
  private onKey?: (key: string, raw: Buffer | string) => void;
  private handler?: (chunk: Buffer | string) => void;
  private isListening = false;
  private wasRawMode = false;

  constructor(options: KeypressListenerOptions = {}) {
    this.stdin = options.stdin ?? process.stdin;
    this.onKey = options.onKey;
  }

  start(onKey?: (key: string, raw: Buffer | string) => void): this {
    if (onKey) {
      this.onKey = onKey;
    }
    if (this.isListening || !this.stdin) {
      return this;
    }

    if (this.stdin.isTTY && typeof this.stdin.setRawMode === 'function') {
      try {
        this.stdin.setRawMode(true);
        this.stdin.resume();
        this.wasRawMode = true;
      } catch {
        // Non-fatal: terminal may not support raw mode in mocked or redirected environments
      }
    }

    this.handler = (chunk: Buffer | string) => {
      const key = chunk.toString();
      if (this.onKey) {
        this.onKey(key, chunk);
      }
    };

    this.stdin.on('data', this.handler);
    this.isListening = true;
    return this;
  }

  stop(): void {
    if (!this.isListening) {
      return;
    }

    if (this.stdin && this.handler) {
      this.stdin.removeListener('data', this.handler);
      this.handler = undefined;
      if (this.wasRawMode && this.stdin.isTTY && typeof this.stdin.setRawMode === 'function') {
        try {
          this.stdin.setRawMode(false);
        } catch {
          // Non-fatal: terminal may be closed or already restored
        }
      }
    }
    this.isListening = false;
  }
}

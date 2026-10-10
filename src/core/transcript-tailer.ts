import {
  TranscriptTailer as WorkerTranscriptTailer,
  type TranscriptTailerOptions,
} from '#packages/worker-runtime';

/**
 * Backward-compatible bridge to TranscriptTailer from src/packages/worker-runtime.
 */
export class TranscriptTailer extends WorkerTranscriptTailer {
  constructor(options: TranscriptTailerOptions = {}) {
    super(options);
  }
}

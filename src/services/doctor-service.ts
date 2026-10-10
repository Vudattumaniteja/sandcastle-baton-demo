import { DoctorEngine } from '#packages/diagnostics';
import type { DoctorServiceOptions } from '../types/doctor.js';

export { DoctorEngine };

export class DoctorService extends DoctorEngine {
  constructor(options: DoctorServiceOptions = {}) {
    super(options);
  }
}

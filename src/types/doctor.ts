export interface DoctorCheck {
  id: string;
  name: string;
  passed: boolean;
  message: string;
  fatal?: boolean;
  remediation?: string;
}

export interface DoctorReport {
  healthy: boolean;
  checks: DoctorCheck[];
}

export interface DoctorServiceOptions {
  cwd?: string;
  commandExecutor?: (
    file: string,
    args: string[]
  ) => Promise<{ stdout: string; stderr: string; exitCode: number }>;
}

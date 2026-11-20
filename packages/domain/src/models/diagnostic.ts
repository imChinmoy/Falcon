export type DiagnosticSeverity = 'info' | 'warning' | 'error';

export interface Diagnostic {
  readonly id: string;
  readonly code: string;
  readonly severity: DiagnosticSeverity;
  readonly message: string;
  readonly filePath?: string;
  readonly line?: number;
  readonly column?: number;
  readonly details?: Record<string, unknown>;
}

import { IMPORT_LIMITS } from '@darvas/contracts';
import type { ImportDiagnostic } from '@darvas/contracts';

/** Messages are static; never echo cell text, filenames or dependency errors. */
export class Diagnostics {
  readonly samples: ImportDiagnostic[] = [];
  errors = 0;
  warnings = 0;
  add(
    code: string,
    message: string,
    severity: ImportDiagnostic['severity'] = 'ERROR',
    row: number | null = null,
    field: ImportDiagnostic['field'] = null,
  ): void {
    if (severity === 'ERROR') this.errors++;
    else this.warnings++;
    const diagnostic = { code, message, severity, row, field };
    if (this.samples.length < IMPORT_LIMITS.diagnostics) this.samples.push(diagnostic);
    else if (severity === 'ERROR') {
      // Keep blockers visible even when earlier nonblocking warnings filled the sample.
      const index = this.samples.findIndex((entry) => entry.severity === 'WARNING');
      if (index >= 0) this.samples[index] = diagnostic;
    }
  }
  get truncated(): boolean {
    return this.errors + this.warnings > this.samples.length;
  }
}

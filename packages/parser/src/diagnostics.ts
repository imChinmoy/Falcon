import ts from 'typescript';
import type { Diagnostic, DiagnosticSeverity } from '@falcon/domain';

function mapDiagnosticCategory(category: ts.DiagnosticCategory): DiagnosticSeverity {
  switch (category) {
    case ts.DiagnosticCategory.Error:
      return 'error';
    case ts.DiagnosticCategory.Warning:
      return 'warning';
    case ts.DiagnosticCategory.Suggestion:
    case ts.DiagnosticCategory.Message:
    default:
      return 'info';
  }
}

/**
 * Extracts syntax and parse diagnostics from a TypeScript SourceFile.
 */
export function extractSyntaxDiagnostics(
  sourceFile: ts.SourceFile,
  program?: ts.Program | undefined,
): readonly Diagnostic[] {
  const tsDiagnostics: ts.Diagnostic[] = [];

  // 1. Direct syntactic diagnostics from program if available
  if (program) {
    try {
      tsDiagnostics.push(...program.getSyntacticDiagnostics(sourceFile));
    } catch {
      // Fallback to sourceFile diagnostics
    }
  }

  // 2. Syntactic diagnostics embedded in sourceFile (if parsed with diagnostics enabled)
  const parseDiagnostics = (sourceFile as unknown as { parseDiagnostics?: ts.Diagnostic[] })
    .parseDiagnostics;
  if (parseDiagnostics && parseDiagnostics.length > 0) {
    for (const d of parseDiagnostics) {
      if (
        !tsDiagnostics.some((existing) => existing.start === d.start && existing.code === d.code)
      ) {
        tsDiagnostics.push(d);
      }
    }
  }

  const results: Diagnostic[] = [];

  for (let i = 0; i < tsDiagnostics.length; i++) {
    const d = tsDiagnostics[i]!;
    const message = ts.flattenDiagnosticMessageText(d.messageText, '\n');
    const severity = mapDiagnosticCategory(d.category);

    let line: number | undefined;
    let column: number | undefined;

    if (d.start !== undefined) {
      const pos = sourceFile.getLineAndCharacterOfPosition(d.start);
      line = pos.line + 1;
      column = pos.character + 1;
    }

    results.push({
      id: `diag-syntax-${sourceFile.fileName}-${d.code}-${i + 1}`,
      code: `TS${d.code}`,
      severity,
      message,
      filePath: sourceFile.fileName.replace(/\\/g, '/'),
      ...(line !== undefined ? { line } : {}),
      ...(column !== undefined ? { column } : {}),
      details: {
        rawCode: d.code,
        category: d.category,
        length: d.length,
      },
    });
  }

  return results;
}

/**
 * Checks whether any diagnostics in the list are errors.
 */
export function hasSyntaxErrors(diagnostics: readonly Diagnostic[]): boolean {
  return diagnostics.some((d) => d.severity === 'error');
}

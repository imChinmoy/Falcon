export const VERSION = '0.1.0';
export const PKG_NAME = 'falcon';

export const ExitCodes = {
  SUCCESS: 0,
  INTERNAL_ERROR: 1,
  INVALID_ARGUMENTS: 2,
  REPOSITORY_ERROR: 3,
  FATAL_DIAGNOSTICS: 4,
  UNSUPPORTED_OPERATION: 5,
} as const;

export type ExitCode = (typeof ExitCodes)[keyof typeof ExitCodes];

export const HELP_TEXT = `FALCON CLI — Explainable Code-Change Impact Analysis (v${VERSION})

Usage:
  falcon <command> [options]

Commands:
  analyze <path>               Scan and analyze repository source files
  file read <path>             Safely read a file within the repository (alias: falcon read)
  file write <path>            Safely write/create a file (alias: falcon write)
  file edit <path>             Safely edit a file by finding and replacing text (alias: falcon edit)
  file info <path>             Get file metadata and content hash
  file list                    List supported source files in the repository
  file delete <path>           Safely delete a file within the repository
  inspect-symbol <selector>    Inspect a symbol and its relationships
  impact                       Compare revisions and generate impact report
  gui                          Launch the clean Apple-style dark mode Web GUI dashboard
  version                      Print CLI and analyzer version
  help                         Display this help message

Options:
  --repo <path>                Repository root path (default: current directory)
  --format <text|json>         Output format (default: text)
  --output <file>              Write output to a specified file
  --content <string>           Content to write (for write/create)
  --find <string>              Text or pattern to replace (for edit)
  --replace <string>           Replacement text (for edit)
  --include <glob>             Include glob pattern for scanning
  --exclude <glob>             Exclude glob pattern for scanning
  --base <git-ref>             Base git revision (for impact)
  --target <git-ref>           Target git revision (for impact)
  --help, -h                   Show this help message
`;

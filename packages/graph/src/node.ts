import type { CodeSymbol, SourceFile } from '@falcon/domain';
import type { GraphNode, GraphNodeKind } from './types.js';

export interface CreateNodeOptions {
  readonly id: string;
  readonly kind: GraphNodeKind;
  readonly name: string;
  readonly filePath: string;
  readonly symbol?: CodeSymbol | undefined;
  readonly file?: SourceFile | undefined;
  readonly metadata?: Readonly<Record<string, unknown>> | undefined;
}

/**
 * Creates a generic graph node.
 */
export function createNode(options: CreateNodeOptions): GraphNode {
  return {
    id: options.id,
    kind: options.kind,
    name: options.name,
    filePath: options.filePath.replace(/\\/g, '/'),
    symbol: options.symbol,
    file: options.file,
    metadata: options.metadata,
  };
}

/**
 * Creates a graph node representing a CodeSymbol.
 */
export function createSymbolNode(
  symbol: CodeSymbol,
  metadata?: Readonly<Record<string, unknown>>,
): GraphNode {
  return {
    id: symbol.id,
    kind: 'symbol',
    name: symbol.name,
    filePath: symbol.filePath.replace(/\\/g, '/'),
    symbol,
    metadata,
  };
}

/**
 * Creates a graph node representing a SourceFile.
 */
export function createFileNode(
  filePath: string,
  file?: SourceFile,
  metadata?: Readonly<Record<string, unknown>>,
): GraphNode {
  const normalizedPath = filePath.replace(/\\/g, '/');
  const name = normalizedPath.split('/').pop() ?? normalizedPath;
  return {
    id: file?.id ?? normalizedPath,
    kind: 'file',
    name,
    filePath: normalizedPath,
    file,
    metadata,
  };
}

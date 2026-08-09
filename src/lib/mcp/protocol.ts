// Local replacement for @lovable.dev/mcp-js's tool-definition surface, kept
// intentionally identical in shape to what it replaces (ToolContext,
// ToolResult, defineTool) so the individual tool files in ./tools only need
// their import line changed, not their logic. The actual protocol handling
// (JSON-RPC, transport, auth wiring) lives in index.ts and
// ../../routes/mcp.ts, built on the official @modelcontextprotocol/sdk
// rather than Lovable's wrapper around it.
import type { z } from "zod";
import type { ToolAnnotations } from "@modelcontextprotocol/sdk/types.js";

export interface ToolContext {
  isAuthenticated(): boolean;
  /** The signed-in EliteFlux user's Supabase user ID, if authenticated. */
  getUserId(): string | undefined;
  /** The raw bearer token, if authenticated — forwarded to Supabase so RLS runs as the caller. */
  getToken(): string | undefined;
}

export type ZodRawShape = Record<string, z.ZodTypeAny>;

export interface ToolResult {
  [key: string]: unknown;
  content: { type: "text"; text: string }[];
  isError?: boolean;
  structuredContent?: Record<string, unknown>;
}

/** Type-erased form for heterogeneous tool registries (index.ts) — each tool's own Args stay precise at its definition site. */
export type AnyToolDefinition = ToolDefinition<any>;

export interface ToolDefinition<Args extends ZodRawShape = ZodRawShape> {
  name: string;
  title?: string;
  description?: string;
  /** Empty object for a zero-argument tool, matching the existing tool files' convention. */
  inputSchema: Args;
  annotations?: ToolAnnotations;
  handler: (input: { [K in keyof Args]: z.infer<Args[K]> }, ctx: ToolContext) => Promise<ToolResult>;
}

/** Identity function — exists purely so tool files get inference on `handler`'s input from `inputSchema`. */
export function defineTool<Args extends ZodRawShape>(def: ToolDefinition<Args>): ToolDefinition<Args> {
  return def;
}

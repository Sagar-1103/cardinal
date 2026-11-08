import type { z } from "zod";

// Permission categories required to run a tool
export type ToolPermissionLevel = "read" | "write" | "execute" | "network";

// Runtime execution context provided to tools during execution
export interface ToolContext {
  workingDir: string;
  sessionId: string;
  readFiles: Set<string>;
}

// Result returned by a tool after execution
export interface ToolResult {
  content: string;
  isError: boolean;
  metadata?: Record<string, unknown>;
}

// Interface implemented by all tools in Cardinal
export interface Tool {
  name: string;
  description: string;
  parameters: z.ZodSchema;
  permissionLevel: ToolPermissionLevel;
  execute(args: unknown, context: ToolContext): Promise<ToolResult>;
}

// JSON Schema representation for LLM function calling
export interface ToolSchema {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}


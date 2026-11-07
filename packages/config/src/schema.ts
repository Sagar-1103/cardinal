import { z } from "zod";

// Settings for connecting to language model providers
export const ProviderConfigSchema = z.object({
  name: z
    .enum(["anthropic", "openai", "google", "ollama", "openrouter"])
    .default("anthropic"),
  model: z.string().default("claude-sonnet-4-20250514"),
  apiKey: z.string().optional(),
  baseUrl: z.string().url().optional(),
  maxTokens: z.number().int().positive().default(4096),
  temperature: z.number().min(0).max(2).default(0.7),
});

// Rules for tool execution and user permission prompts
export const PermissionsConfigSchema = z.object({
  requireApproval: z
    .enum(["always", "write-only", "never"])
    .default("write-only"),
  blockedCommands: z
    .array(z.string())
    .default([
      "rm -rf /",
      "rm -rf ~",
      "format",
      ":(){:|:&};:",
      "mkfs",
      "dd if=",
    ]),
  maxExecutionTimeMs: z.number().int().positive().default(30000),
});

// Storage and history settings for chat sessions
export const SessionConfigSchema = z.object({
  maxHistory: z.number().int().positive().default(100),
  persistSessions: z.boolean().default(true),
  dbPath: z.string().default(".cardinal/cardinal.db"),
});

// Logging outputs and detail levels
export const LogConfigSchema = z.object({
  level: z
    .enum(["trace", "debug", "info", "warn", "error", "fatal"])
    .default("info"),
  filePath: z.string().default(".cardinal/logs/cardinal.log"),
  enableFile: z.boolean().default(true),
  enableStderr: z.boolean().default(false),
});

// Configuration for external MCP tool servers
export const McpServerSchema = z.object({
  command: z.string().optional(),
  args: z.array(z.string()).optional(),
  url: z.string().url().optional(),
  headers: z.record(z.string()).optional(),
  env: z.record(z.string()).optional(),
});

// Root configuration schema for cardinal
export const CardinalConfigSchema = z.object({
  provider: ProviderConfigSchema.default({}),
  permissions: PermissionsConfigSchema.default({}),
  session: SessionConfigSchema.default({}),
  log: LogConfigSchema.default({}),
  beacons: z.record(McpServerSchema).default({}),
  customInstructions: z.string().optional(),
});

// TypeScript types inferred from the schemas
export type CardinalConfig = z.infer<typeof CardinalConfigSchema>;
export type ProviderConfig = z.infer<typeof ProviderConfigSchema>;
export type PermissionsConfig = z.infer<typeof PermissionsConfigSchema>;
export type SessionConfig = z.infer<typeof SessionConfigSchema>;
export type LogConfig = z.infer<typeof LogConfigSchema>;
export type McpServerConfig = z.infer<typeof McpServerSchema>;


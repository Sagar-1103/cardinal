import type { ToolCall, TokenUsage } from "@cardinal/types";
import type { ProviderConfig } from "@cardinal/config";

// A single tool description passed to language models
export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

// Formatted chat message input for streaming requests
export interface StreamMessage {
  role: "system" | "user" | "assistant" | "tool";
  content: string;
  toolCallId?: string;
}

// Parameters supplied to stream an LLM response
export interface StreamParams {
  messages: StreamMessage[];
  tools?: ToolDefinition[];
  maxTokens?: number;
  temperature?: number;
  signal?: AbortSignal;
}

// Discriminated union of chunks emitted during response streaming
export type StreamPart =
  | { type: "text"; text: string }
  | { type: "tool-call"; toolCall: ToolCall }
  | { type: "usage"; usage: TokenUsage }
  | { type: "error"; error: string }
  | { type: "finish"; reason: "stop" | "tool-calls" | "length" | "error" | string };

// Return value for an active streaming operation
export interface StreamResult {
  stream: AsyncIterable<StreamPart>;
  abort: () => void;
}

// Metadata for an LLM provider and its supported models
export interface ProviderInfo {
  id: string;
  name: string;
  models: string[];
}

// Interface implemented by all LLM provider adapters
export interface LLMProvider {
  readonly info: ProviderInfo;
  stream(params: StreamParams, config: ProviderConfig): StreamResult;
}


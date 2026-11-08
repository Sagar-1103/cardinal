import { ProviderRegistry } from "./registry";
import { anthropicProvider } from "./providers/anthropic";
import { openaiProvider } from "./providers/openai";
import { googleProvider } from "./providers/google";
import { ollamaProvider } from "./providers/ollama";
import { openrouterProvider } from "./providers/openrouter";

// Exports for provider management and orchestration
export { ProviderRegistry } from "./registry";
export {
  ProviderOrchestrator,
  type OrchestratorOptions,
} from "./orchestrator";

// Individual provider instances
export { anthropicProvider } from "./providers/anthropic";
export { openaiProvider } from "./providers/openai";
export { googleProvider } from "./providers/google";
export { ollamaProvider } from "./providers/ollama";
export { openrouterProvider } from "./providers/openrouter";

// Shared helpers for format conversion
export {
  convertTools,
  convertMessages,
  transformStream,
} from "./providers/shared";

// Core types
export type {
  LLMProvider,
  StreamParams,
  StreamMessage,
  StreamResult,
  StreamPart,
  ToolDefinition,
  ProviderInfo,
} from "./types";

// Creates a pre-populated registry with all five standard providers
export function createDefaultRegistry(): ProviderRegistry {
  const registry = new ProviderRegistry();
  registry.register(anthropicProvider);
  registry.register(openaiProvider);
  registry.register(googleProvider);
  registry.register(ollamaProvider);
  registry.register(openrouterProvider);
  return registry;
}

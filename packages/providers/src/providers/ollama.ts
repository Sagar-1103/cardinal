import { streamText } from "ai";
import { createOllama } from "ollama-ai-provider";
import type { ProviderConfig } from "@cardinal/config";
import type { LLMProvider, StreamParams, StreamResult } from "../types";
import { convertMessages, convertTools, transformStream } from "./shared";

// Ollama local model provider implementation using the Vercel AI SDK
export const ollamaProvider: LLMProvider = {
  info: {
    id: "ollama",
    name: "Ollama",
    models: [
      "llama3.3",
      "deepseek-coder-v2",
      "qwen2.5-coder",
    ],
  },

  stream(params: StreamParams, config: ProviderConfig): StreamResult {
    const controller = new AbortController();

    const baseURL = config.baseUrl ?? "http://localhost:11434/api";
    const ollama = createOllama({
      baseURL,
    });

    const model = ollama(config.model);

    if (params.signal) {
      if (params.signal.aborted) {
        controller.abort();
      } else {
        params.signal.addEventListener("abort", () => controller.abort());
      }
    }

    const result = streamText({
      model,
      messages: convertMessages(params.messages),
      tools: convertTools(params.tools),
      maxTokens: params.maxTokens ?? config.maxTokens,
      temperature: params.temperature ?? config.temperature,
      abortSignal: controller.signal,
    });

    return {
      stream: transformStream(result.fullStream),
      abort: () => controller.abort(),
    };
  },
};


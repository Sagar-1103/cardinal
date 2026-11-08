import { streamText } from "ai";
import { createOpenRouter } from "@openrouter/ai-sdk-provider";
import type { ProviderConfig } from "@cardinal/config";
import type { LLMProvider, StreamParams, StreamResult } from "../types";
import { convertMessages, convertTools, transformStream } from "./shared";

// OpenRouter provider implementation using the Vercel AI SDK
export const openrouterProvider: LLMProvider = {
  info: {
    id: "openrouter",
    name: "OpenRouter",
    models: [
      "anthropic/claude-3.5-sonnet",
      "openai/gpt-4o",
      "meta-llama/llama-3.3-70b-instruct",
    ],
  },

  stream(params: StreamParams, config: ProviderConfig): StreamResult {
    const controller = new AbortController();

    const apiKey = config.apiKey ?? process.env.OPENROUTER_API_KEY;
    const openrouter = createOpenRouter({
      apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });

    const model = openrouter(config.model);

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


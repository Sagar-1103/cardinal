import { streamText } from "ai";
import { createAnthropic } from "@ai-sdk/anthropic";
import type { ProviderConfig } from "@cardinal/config";
import type { LLMProvider, StreamParams, StreamResult } from "../types";
import { convertMessages, convertTools, transformStream } from "./shared";

// Anthropic provider implementation using the Vercel AI SDK
export const anthropicProvider: LLMProvider = {
  info: {
    id: "anthropic",
    name: "Anthropic",
    models: [
      "claude-sonnet-4-20250514",
      "claude-opus-4-20250514",
      "claude-haiku-3-5-20241022",
      "claude-3-7-sonnet-20250219",
    ],
  },

  stream(params: StreamParams, config: ProviderConfig): StreamResult {
    const controller = new AbortController();

    const apiKey = config.apiKey ?? process.env.ANTHROPIC_API_KEY;
    const anthropic = createAnthropic({
      apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });

    const model = anthropic(config.model);

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


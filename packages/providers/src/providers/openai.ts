import { streamText } from "ai";
import { createOpenAI } from "@ai-sdk/openai";
import type { ProviderConfig } from "@cardinal/config";
import type { LLMProvider, StreamParams, StreamResult } from "../types";
import { convertMessages, convertTools, transformStream } from "./shared";

// OpenAI provider implementation using the Vercel AI SDK
export const openaiProvider: LLMProvider = {
  info: {
    id: "openai",
    name: "OpenAI",
    models: [
      "gpt-4o",
      "gpt-4o-mini",
      "o3-mini",
      "gpt-4-turbo",
    ],
  },

  stream(params: StreamParams, config: ProviderConfig): StreamResult {
    const controller = new AbortController();

    const apiKey = config.apiKey ?? process.env.OPENAI_API_KEY;
    const openai = createOpenAI({
      apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });

    const model = openai(config.model);

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


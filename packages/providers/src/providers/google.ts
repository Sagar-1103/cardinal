import { streamText } from "ai";
import { createGoogleGenerativeAI } from "@ai-sdk/google";
import type { ProviderConfig } from "@cardinal/config";
import type { LLMProvider, StreamParams, StreamResult } from "../types";
import { convertMessages, convertTools, transformStream } from "./shared";

// Google Gemini provider implementation using the Vercel AI SDK
export const googleProvider: LLMProvider = {
  info: {
    id: "google",
    name: "Google",
    models: [
      "gemini-2.5-flash",
      "gemini-2.5-pro",
      "gemini-2.0-flash",
    ],
  },

  stream(params: StreamParams, config: ProviderConfig): StreamResult {
    const controller = new AbortController();

    const apiKey =
      config.apiKey ??
      process.env.GOOGLE_GENERATIVE_AI_API_KEY ??
      process.env.GEMINI_API_KEY;

    const google = createGoogleGenerativeAI({
      apiKey,
      ...(config.baseUrl ? { baseURL: config.baseUrl } : {}),
    });

    const model = google(config.model);

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


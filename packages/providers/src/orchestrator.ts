import { getEventBus } from "@cardinal/events";
import type { ProviderConfig } from "@cardinal/config";
import type { ProviderRegistry } from "./registry";
import type { StreamParams, StreamPart, StreamResult } from "./types";

// Configuration options for the provider orchestrator
export interface OrchestratorOptions {
  maxRetries?: number;
  retryDelayMs?: number;
}

// Coordinates streaming from providers with retry logic and event notifications
export class ProviderOrchestrator {
  private bus = getEventBus();
  private maxRetries: number;
  private retryDelayMs: number;

  constructor(
    private registry: ProviderRegistry,
    options: OrchestratorOptions = {},
  ) {
    this.maxRetries = options.maxRetries ?? 3;
    this.retryDelayMs = options.retryDelayMs ?? 1000;
  }

  // Streams a response for a given session with retries and event emissions
  stream(
    sessionId: string,
    params: StreamParams,
    config: ProviderConfig,
  ): StreamResult {
    const provider = this.registry.getOrThrow(config.name);
    let currentResult: StreamResult | null = null;
    let isAborted = false;
    let delayTimeout: ReturnType<typeof setTimeout> | null = null;

    const abort = () => {
      isAborted = true;
      if (delayTimeout) {
        clearTimeout(delayTimeout);
        delayTimeout = null;
      }
      currentResult?.abort();
    };

    if (params.signal) {
      if (params.signal.aborted) {
        abort();
      } else {
        params.signal.addEventListener("abort", abort);
      }
    }

    const self = this;
    const wrappedStream = (async function* (): AsyncIterable<StreamPart> {
      self.bus.emit("provider:request", {
        sessionId,
        provider: config.name,
        model: config.model,
      });

      let retryCount = 0;

      while (!isAborted && retryCount <= self.maxRetries) {
        try {
          self.bus.emit("provider:stream-start", { sessionId });

          currentResult = provider.stream(params, config);

          for await (const part of currentResult.stream) {
            if (isAborted) {
              return;
            }

            if (part.type === "text") {
              self.bus.emit("provider:stream-chunk", {
                sessionId,
                chunk: part.text,
              });
            } else if (part.type === "usage") {
              self.bus.emit("provider:complete", {
                sessionId,
                usage: part.usage,
              });
            } else if (part.type === "finish") {
              self.bus.emit("provider:stream-end", { sessionId });
            }

            yield part;
          }

          return;
        } catch (error) {
          if (isAborted) {
            return;
          }

          retryCount++;
          const errorMsg =
            error instanceof Error ? error.message : String(error);

          self.bus.emit("provider:error", {
            sessionId,
            error: errorMsg,
            retryCount,
          });

          if (retryCount > self.maxRetries) {
            yield { type: "error", error: errorMsg };
            yield { type: "finish", reason: "error" };
            return;
          }

          const delay =
            self.retryDelayMs * Math.pow(2, retryCount - 1);
          await new Promise<void>((resolve) => {
            delayTimeout = setTimeout(() => {
              delayTimeout = null;
              resolve();
            }, delay);
          });
        }
      }
    })();

    return {
      stream: wrappedStream,
      abort,
    };
  }
}


import type { LLMProvider, ProviderInfo } from "./types";

// Registry for managing and retrieving available LLM providers
export class ProviderRegistry {
  private providers = new Map<string, LLMProvider>();

  // Registers a new provider instance
  register(provider: LLMProvider): void {
    this.providers.set(provider.info.id, provider);
  }

  // Retrieves a provider by id, or returns undefined if not found
  get(id: string): LLMProvider | undefined {
    return this.providers.get(id);
  }

  // Retrieves a provider by id, or throws a helpful error listing available options
  getOrThrow(id: string): LLMProvider {
    const provider = this.get(id);
    if (!provider) {
      const available = this.list()
        .map((p) => p.id)
        .join(", ");
      throw new Error(`Unknown provider "${id}". Available: ${available}`);
    }
    return provider;
  }

  // Returns metadata for all registered providers
  list(): ProviderInfo[] {
    return Array.from(this.providers.values()).map((p) => p.info);
  }
}


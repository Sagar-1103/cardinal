import { describe, it, expect } from "bun:test";
import {
  CardinalConfigSchema,
  loadConfig,
  deepMerge,
} from "../index";

describe("Configuration", () => {
  describe("Defaults", () => {
    it("should provide expected defaults when given empty input", () => {
      const config = CardinalConfigSchema.parse({});

      expect(config.provider.name).toBe("anthropic");
      expect(config.provider.model).toBe("claude-sonnet-4-20250514");
      expect(config.provider.maxTokens).toBe(4096);
      expect(config.provider.temperature).toBe(0.7);

      expect(config.permissions.requireApproval).toBe("write-only");
      expect(config.permissions.maxExecutionTimeMs).toBe(30000);
      expect(config.permissions.blockedCommands.length).toBeGreaterThan(0);

      expect(config.session.maxHistory).toBe(100);
      expect(config.session.persistSessions).toBe(true);
      expect(config.session.dbPath).toBe(".cardinal/cardinal.db");

      expect(config.log.level).toBe("info");
      expect(config.log.filePath).toBe(".cardinal/logs/cardinal.log");
      expect(config.log.enableFile).toBe(true);
      expect(config.log.enableStderr).toBe(false);

      expect(config.beacons).toEqual({});
    });
  });

  describe("Provider Validation", () => {
    it("should accept openrouter as a valid provider", () => {
      const result = CardinalConfigSchema.safeParse({
        provider: { name: "openrouter", model: "anthropic/claude-3.5-sonnet" },
      });
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.provider.name).toBe("openrouter");
        expect(result.data.provider.model).toBe("anthropic/claude-3.5-sonnet");
      }
    });

    it("should accept all standard provider types", () => {
      const providers = ["anthropic", "openai", "google", "ollama", "openrouter"] as const;
      for (const name of providers) {
        const result = CardinalConfigSchema.safeParse({
          provider: { name },
        });
        expect(result.success).toBe(true);
      }
    });

    it("should reject unsupported provider names", () => {
      const result = CardinalConfigSchema.safeParse({
        provider: { name: "not-a-real-provider" },
      });
      expect(result.success).toBe(false);
    });

    it("should reject negative maxTokens", () => {
      const result = CardinalConfigSchema.safeParse({
        provider: { maxTokens: -100 },
      });
      expect(result.success).toBe(false);
    });

    it("should reject temperature above 2", () => {
      const result = CardinalConfigSchema.safeParse({
        provider: { temperature: 3.5 },
      });
      expect(result.success).toBe(false);
    });
  });

  describe("Deep Merge", () => {
    it("should merge nested objects without dropping sibling properties", () => {
      const base = {
        provider: {
          name: "anthropic",
          model: "claude-sonnet-4-20250514",
          maxTokens: 4096,
        },
      };

      const override = {
        provider: {
          model: "claude-3-opus",
        },
      };

      const merged = deepMerge(base, override);

      expect(merged).toEqual({
        provider: {
          name: "anthropic",
          model: "claude-3-opus",
          maxTokens: 4096,
        },
      });
    });
  });

  describe("Environment Overrides", () => {
    it("should override provider settings via env variables", () => {
      const customEnv = {
        CARDINAL_PROVIDER_NAME: "openrouter",
        CARDINAL_PROVIDER_MODEL: "meta-llama/llama-3.3-70b-instruct",
        CARDINAL_PROVIDER_MAX_TOKENS: "8192",
        CARDINAL_SESSION_PERSIST_SESSIONS: "false",
      };

      const config = loadConfig({
        env: customEnv,
        globalPath: "/non-existent/global.json",
        customPath: "/non-existent/project.json",
      });

      expect(config.provider.name).toBe("openrouter");
      expect(config.provider.model).toBe("meta-llama/llama-3.3-70b-instruct");
      expect(config.provider.maxTokens).toBe(8192);
      expect(config.session.persistSessions).toBe(false);
    });
  });

  describe("Error Formatting", () => {
    it("should throw a formatted error message when config is invalid", () => {
      expect(() => {
        loadConfig({
          env: {
            CARDINAL_PROVIDER_NAME: "invalid-name",
          },
          globalPath: "/non-existent/global.json",
          customPath: "/non-existent/project.json",
        });
      }).toThrow(/Invalid Cardinal configuration:/);
    });
  });
});


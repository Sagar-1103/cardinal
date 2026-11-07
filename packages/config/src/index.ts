// Exports for loading and validating configuration
export {
  loadConfig,
  deepMerge,
  type LoadConfigOptions,
} from "./loader";

export {
  CardinalConfigSchema,
  ProviderConfigSchema,
  PermissionsConfigSchema,
  SessionConfigSchema,
  LogConfigSchema,
  McpServerSchema,
  type CardinalConfig,
  type ProviderConfig,
  type PermissionsConfig,
  type SessionConfig,
  type LogConfig,
  type McpServerConfig,
} from "./schema";

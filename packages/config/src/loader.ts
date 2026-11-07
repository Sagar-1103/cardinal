import { readFileSync, existsSync } from "fs";
import { join, dirname } from "path";
import { homedir } from "os";
import { CardinalConfigSchema, type CardinalConfig } from "./schema";

// Standard location for user-level global configuration
const GLOBAL_CONFIG_PATH = join(homedir(), ".cardinal", "config.json");
const PROJECT_CONFIG_NAME = "cardinal.json";

// Known top-level sections in the config schema
const KNOWN_SECTIONS = new Set([
  "provider",
  "permissions",
  "session",
  "log",
  "beacons",
]);

// Safely reads and parses a JSON file from disk
function readJsonFile(path: string): Record<string, unknown> | null {
  if (!existsSync(path)) {
    return null;
  }
  try {
    const content = readFileSync(path, "utf-8");
    return JSON.parse(content) as Record<string, unknown>;
  } catch {
    return null;
  }
}

// Searches parent directories for cardinal.json starting from the given folder
function resolveProjectRoot(startDir = process.cwd()): string {
  let dir = startDir;
  while (true) {
    const configPath = join(dir, PROJECT_CONFIG_NAME);
    if (existsSync(configPath)) {
      return dir;
    }
    const parent = dirname(dir);
    if (parent === dir) {
      break;
    }
    dir = parent;
  }
  return startDir;
}

// Converts string values from environment variables into appropriate numbers or booleans
function coerceEnvValue(value: string): unknown {
  const trimmed = value.trim();
  const lower = trimmed.toLowerCase();
  if (lower === "true") {
    return true;
  }
  if (lower === "false") {
    return false;
  }
  if (!isNaN(Number(trimmed)) && trimmed !== "") {
    return Number(trimmed);
  }
  return value;
}

// Extracts and maps CARDINAL_* environment variables into configuration fields
function getEnvOverrides(
  env: Record<string, string | undefined> = process.env,
): Record<string, unknown> {
  const overrides: Record<string, unknown> = {};

  for (const [key, rawValue] of Object.entries(env)) {
    if (!key.startsWith("CARDINAL_") || typeof rawValue !== "string") {
      continue;
    }

    const parts = key.slice("CARDINAL_".length).toLowerCase().split("_");
    if (parts.length === 0 || parts[0] === "") {
      continue;
    }

    const coerced = coerceEnvValue(rawValue);

    // Check if the first segment matches a known section like provider or permissions
    if (parts.length >= 2 && KNOWN_SECTIONS.has(parts[0])) {
      const section = parts[0];
      const field = parts
        .slice(1)
        .map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1)))
        .join("");

      if (!overrides[section] || typeof overrides[section] !== "object") {
        overrides[section] = {};
      }
      (overrides[section] as Record<string, unknown>)[field] = coerced;
    } else {
      // Map to a root-level property
      const field = parts
        .map((p, i) => (i === 0 ? p : p[0].toUpperCase() + p.slice(1)))
        .join("");
      overrides[field] = coerced;
    }
  }

  return overrides;
}

// Recursively merges source properties into target without losing sibling defaults
export function deepMerge(
  target: Record<string, unknown>,
  source: Record<string, unknown>,
): Record<string, unknown> {
  const result: Record<string, unknown> = { ...target };

  for (const key of Object.keys(source)) {
    const targetVal = target[key];
    const sourceVal = source[key];

    const isTargetObject =
      targetVal && typeof targetVal === "object" && !Array.isArray(targetVal);
    const isSourceObject =
      sourceVal && typeof sourceVal === "object" && !Array.isArray(sourceVal);

    if (isTargetObject && isSourceObject) {
      result[key] = deepMerge(
        targetVal as Record<string, unknown>,
        sourceVal as Record<string, unknown>,
      );
    } else if (sourceVal !== undefined) {
      result[key] = sourceVal;
    }
  }

  return result;
}

// Options for customizing configuration loading
export interface LoadConfigOptions {
  projectDir?: string;
  customPath?: string;
  globalPath?: string;
  env?: Record<string, string | undefined>;
}

// Loads, merges, and validates configuration across all layers
export function loadConfig(options: LoadConfigOptions = {}): CardinalConfig {
  let merged: Record<string, unknown> = {};

  // Layer 2: Read global user settings if the file exists
  const globalPath = options.globalPath ?? GLOBAL_CONFIG_PATH;
  const globalConfig = readJsonFile(globalPath);
  if (globalConfig) {
    merged = deepMerge(merged, globalConfig);
  }

  // Layer 3: Read project-specific settings
  let projectConfigPath: string | null = null;
  if (options.customPath) {
    projectConfigPath = options.customPath;
  } else {
    const projectRoot = resolveProjectRoot(options.projectDir);
    const candidate = join(projectRoot, PROJECT_CONFIG_NAME);
    if (existsSync(candidate)) {
      projectConfigPath = candidate;
    }
  }

  if (projectConfigPath) {
    const projectConfig = readJsonFile(projectConfigPath);
    if (projectConfig) {
      merged = deepMerge(merged, projectConfig);
    }
  }

  // Layer 4: Apply environment variable overrides
  const envOverrides = getEnvOverrides(options.env ?? process.env);
  merged = deepMerge(merged, envOverrides);

  // Validate the final object against the schema and fill in Layer 1 defaults
  const result = CardinalConfigSchema.safeParse(merged);
  if (!result.success) {
    const errorDetails = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");
    throw new Error(`Invalid Cardinal configuration:\n${errorDetails}`);
  }

  return result.data;
}


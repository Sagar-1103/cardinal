import { z } from "zod";
import { execSync } from "child_process";
import { resolve, join, relative } from "path";
import { readdirSync, statSync, readFileSync, existsSync } from "fs";
import type { Tool, ToolContext, ToolResult } from "../types";

const parameters = z.object({
  pattern: z.string().describe("Search pattern (regex supported)"),
  path: z.string().default(".").describe("Directory to search in"),
  filePattern: z
    .string()
    .optional()
    .describe("File glob pattern (e.g., '*.ts')"),
  maxResults: z
    .number()
    .int()
    .positive()
    .default(50)
    .describe("Maximum results to return"),
});

const IGNORED_DIRS = new Set([
  "node_modules",
  ".git",
  "dist",
  ".turbo",
  ".cardinal",
]);

// Pure TypeScript fallback search when rg and grep are unavailable
function searchFilesFallback(
  dir: string,
  regex: RegExp,
  filePatternRegex: RegExp | null,
  maxResults: number,
  baseDir: string,
): string[] {
  const matches: string[] = [];

  function traverse(currentDir: string): void {
    if (matches.length >= maxResults) {
      return;
    }

    let items: string[] = [];
    try {
      items = readdirSync(currentDir);
    } catch {
      return;
    }

    for (const item of items) {
      if (matches.length >= maxResults) {
        break;
      }
      if (IGNORED_DIRS.has(item)) {
        continue;
      }

      const fullPath = join(currentDir, item);
      let stat;
      try {
        stat = statSync(fullPath);
      } catch {
        continue;
      }

      if (stat.isDirectory()) {
        traverse(fullPath);
      } else if (stat.isFile()) {
        if (filePatternRegex && !filePatternRegex.test(item)) {
          continue;
        }

        try {
          const content = readFileSync(fullPath, "utf-8");
          const lines = content.split("\n");
          const relPath = relative(baseDir, fullPath).replace(/\\/g, "/");

          for (let i = 0; i < lines.length; i++) {
            if (matches.length >= maxResults) {
              break;
            }
            if (regex.test(lines[i])) {
              matches.push(`${relPath}:${i + 1}: ${lines[i].trimEnd()}`);
            }
          }
        } catch {
          // Skip unreadable files (e.g. binary)
        }
      }
    }
  }

  traverse(dir);
  return matches;
}

// Converts a glob like "*.ts" into a RegExp
function globToRegex(glob: string): RegExp {
  const escaped = glob.replace(/[.+^${}()|[\]\\]/g, "\\$&");
  const regexStr = escaped.replace(/\*/g, ".*").replace(/\?/g, ".");
  return new RegExp(`^${regexStr}$`, "i");
}

// Tool for searching text patterns across project files
export const searchFilesTool: Tool = {
  name: "search_files",
  description:
    "Search for a text pattern across files in the project. Returns matching lines with file paths and line numbers.",
  parameters,
  permissionLevel: "read",

  async execute(args: unknown, context: ToolContext): Promise<ToolResult> {
    const parsed = parameters.parse(args);
    const searchDir = resolve(context.workingDir, parsed.path);

    if (!existsSync(searchDir)) {
      return {
        content: `Error: Directory not found: ${parsed.path}`,
        isError: true,
      };
    }

    // Try ripgrep first
    try {
      execSync("rg --version", { stdio: "ignore" });
      let cmd = `rg --line-number --max-count ${parsed.maxResults} --no-heading`;
      if (parsed.filePattern) {
        cmd += ` --glob "${parsed.filePattern}"`;
      }
      cmd += ` "${parsed.pattern}" "${searchDir}"`;

      const output = execSync(cmd, {
        encoding: "utf-8",
        maxBuffer: 1024 * 1024,
        timeout: 10000,
      }).trim();

      if (!output) {
        return { content: "No matches found.", isError: false };
      }

      const lines = output.split("\n");
      return {
        content: lines.slice(0, parsed.maxResults).join("\n"),
        isError: false,
        metadata: { matchCount: lines.length },
      };
    } catch {
      // Fallback to pure TypeScript search if ripgrep or grep fails
      try {
        const regex = new RegExp(parsed.pattern);
        const fileRegex = parsed.filePattern
          ? globToRegex(parsed.filePattern)
          : null;

        const matches = searchFilesFallback(
          searchDir,
          regex,
          fileRegex,
          parsed.maxResults,
          context.workingDir,
        );

        if (matches.length === 0) {
          return { content: "No matches found.", isError: false };
        }

        return {
          content: matches.join("\n"),
          isError: false,
          metadata: { matchCount: matches.length },
        };
      } catch (error) {
        return {
          content: `Error searching files: ${error instanceof Error ? error.message : String(error)}`,
          isError: true,
        };
      }
    }
  },
};


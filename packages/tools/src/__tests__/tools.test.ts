import { describe, it, expect, beforeEach, afterEach } from "bun:test";
import { mkdtempSync, rmSync, writeFileSync, mkdirSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { getEventBus, resetEventBus } from "@cardinal/events";
import {
  ToolRegistry,
  ToolExecutor,
  createDefaultToolRegistry,
  readFileTool,
  writeFileTool,
  editFileTool,
  listDirectoryTool,
  searchFilesTool,
  executeCommandTool,
  type ToolContext,
} from "../index";

describe("Built-in Tools", () => {
  let tempDir: string;
  let context: ToolContext;

  beforeEach(() => {
    resetEventBus();
    tempDir = mkdtempSync(join(tmpdir(), "cardinal-tools-test-"));
    context = {
      workingDir: tempDir,
      sessionId: "test-session",
      readFiles: new Set<string>(),
    };
  });

  afterEach(() => {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // Ignore cleanup error
    }
  });

  describe("read_file", () => {
    it("should read file contents with line numbers and record in context", async () => {
      const filePath = join(tempDir, "sample.txt");
      writeFileSync(filePath, "line 1\nline 2\nline 3", "utf-8");

      const result = await readFileTool.execute({ path: "sample.txt" }, context);

      expect(result.isError).toBe(false);
      expect(result.content).toBe("1: line 1\n2: line 2\n3: line 3");
      expect(context.readFiles.has(filePath)).toBe(true);
    });

    it("should support line range slicing", async () => {
      const filePath = join(tempDir, "sample.txt");
      writeFileSync(filePath, "alpha\nbeta\ngamma\ndelta", "utf-8");

      const result = await readFileTool.execute(
        { path: "sample.txt", startLine: 2, endLine: 3 },
        context,
      );

      expect(result.isError).toBe(false);
      expect(result.content).toBe("2: beta\n3: gamma");
    });

    it("should return an error for non-existent files", async () => {
      const result = await readFileTool.execute({ path: "missing.txt" }, context);

      expect(result.isError).toBe(true);
      expect(result.content).toContain("File not found");
    });
  });

  describe("write_file", () => {
    it("should write a new file and automatically create parent directories", async () => {
      const result = await writeFileTool.execute(
        { path: "sub/folder/created.txt", content: "new content" },
        context,
      );

      expect(result.isError).toBe(false);
      expect(result.content).toContain("File created");

      const fullPath = join(tempDir, "sub/folder/created.txt");
      expect(context.readFiles.has(fullPath)).toBe(true);
    });

    it("should fail if the target file already exists", async () => {
      writeFileSync(join(tempDir, "exists.txt"), "already here", "utf-8");

      const result = await writeFileTool.execute(
        { path: "exists.txt", content: "override" },
        context,
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain("File already exists");
    });
  });

  describe("edit_file", () => {
    it("should reject edits if the file has not been read in the session first", async () => {
      writeFileSync(join(tempDir, "target.txt"), "hello world", "utf-8");

      const result = await editFileTool.execute(
        { path: "target.txt", oldString: "hello", newString: "hi" },
        context,
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain("You must read_file");
    });

    it("should reject edits if oldString does not exist in the file", async () => {
      const filePath = join(tempDir, "target.txt");
      writeFileSync(filePath, "hello world", "utf-8");
      context.readFiles.add(filePath);

      const result = await editFileTool.execute(
        { path: "target.txt", oldString: "goodbye", newString: "farewell" },
        context,
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain("oldString was not found");
    });

    it("should reject edits if oldString appears multiple times", async () => {
      const filePath = join(tempDir, "target.txt");
      writeFileSync(filePath, "repeat repeat repeat", "utf-8");
      context.readFiles.add(filePath);

      const result = await editFileTool.execute(
        { path: "target.txt", oldString: "repeat", newString: "single" },
        context,
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain("found 3 times");
    });

    it("should successfully perform surgical replacement when unique", async () => {
      const filePath = join(tempDir, "target.txt");
      writeFileSync(filePath, "const greeting = 'hello';", "utf-8");
      context.readFiles.add(filePath);

      const result = await editFileTool.execute(
        {
          path: "target.txt",
          oldString: "const greeting = 'hello';",
          newString: "const greeting = 'howdy';",
        },
        context,
      );

      expect(result.isError).toBe(false);
      expect(result.content).toContain("File edited");
    });
  });

  describe("list_directory", () => {
    it("should list directories and files with markers", async () => {
      writeFileSync(join(tempDir, "file1.txt"), "a", "utf-8");
      mkdirSync(join(tempDir, "subDir"));
      writeFileSync(join(tempDir, "subDir", "nested.txt"), "b", "utf-8");

      const result = await listDirectoryTool.execute({ path: "." }, context);

      expect(result.isError).toBe(false);
      expect(result.content).toContain("📁 subDir/");
      expect(result.content).toContain("📄 file1.txt");
    });
  });

  describe("search_files", () => {
    it("should find matching text across files", async () => {
      writeFileSync(join(tempDir, "test1.ts"), "const magicWord = 42;", "utf-8");
      writeFileSync(join(tempDir, "test2.ts"), "const other = 10;", "utf-8");

      const result = await searchFilesTool.execute(
        { pattern: "magicWord", path: "." },
        context,
      );

      expect(result.isError).toBe(false);
      expect(result.content).toContain("magicWord");
    });

    it("should return friendly message when no matches found", async () => {
      writeFileSync(join(tempDir, "test.ts"), "console.log('hi');", "utf-8");

      const result = await searchFilesTool.execute(
        { pattern: "nonexistentKeyword", path: "." },
        context,
      );

      expect(result.isError).toBe(false);
      expect(result.content).toBe("No matches found.");
    });
  });

  describe("execute_command", () => {
    it("should run a basic shell command and return its output", async () => {
      const result = await executeCommandTool.execute(
        { command: "node -e \"console.log('cardinal-test')\"" },
        context,
      );

      expect(result.isError).toBe(false);
      expect(result.content).toBe("cardinal-test");
    });

    it("should report errors when a command exits non-zero", async () => {
      const result = await executeCommandTool.execute(
        { command: "node -e \"process.exit(1)\"" },
        context,
      );

      expect(result.isError).toBe(true);
      expect(result.content).toContain("Command failed");
    });
  });

  describe("ToolRegistry and ToolExecutor", () => {
    it("should register tools and generate valid schemas", () => {
      const registry = createDefaultToolRegistry();
      const list = registry.list();
      expect(list).toHaveLength(6);

      const schemas = registry.schemas();
      expect(schemas).toHaveLength(6);
      expect(schemas.map((s) => s.name)).toContain("read_file");
      expect(schemas[0].parameters).toBeDefined();
    });

    it("should execute tools and emit lifecycle events", async () => {
      const bus = getEventBus();
      const events: string[] = [];

      bus.on("tool:executing", () => events.push("executing"));
      bus.on("tool:completed", () => events.push("completed"));

      const registry = createDefaultToolRegistry();
      const executor = new ToolExecutor(registry);

      writeFileSync(join(tempDir, "read-me.txt"), "content", "utf-8");

      const result = await executor.execute(
        {
          id: "call_1",
          name: "read_file",
          arguments: { path: "read-me.txt" },
        },
        context,
      );

      expect(result.isError).toBe(false);
      expect(events).toEqual(["executing", "completed"]);
    });

    it("should emit tool:error on invalid tool arguments", async () => {
      const bus = getEventBus();
      let errorEmitted = false;

      bus.on("tool:error", () => {
        errorEmitted = true;
      });

      const registry = createDefaultToolRegistry();
      const executor = new ToolExecutor(registry);

      const result = await executor.execute(
        {
          id: "call_2",
          name: "read_file",
          arguments: { path: 123 as any },
        },
        context,
      );

      expect(result.isError).toBe(true);
      expect(errorEmitted).toBe(true);
    });
  });
});


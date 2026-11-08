import { describe, it, expect, beforeEach } from "bun:test";
import { getEventBus, resetEventBus } from "@cardinal/events";
import type { PermissionsConfig } from "@cardinal/config";
import type { ToolCall } from "@cardinal/types";
import { PermissionChecker } from "../index";

describe("PermissionChecker", () => {
  const baseConfig: PermissionsConfig = {
    requireApproval: "write-only",
    blockedCommands: ["rm -rf /", ":(){:|:&};:", "mkfs"],
    maxExecutionTimeMs: 30000,
  };

  beforeEach(() => {
    resetEventBus();
  });

  describe("Blocked Commands", () => {
    it("should immediately deny blocked commands and emit permission:denied", async () => {
      const bus = getEventBus();
      let deniedReason = "";
      bus.on("permission:denied", ({ reason }) => {
        deniedReason = reason;
      });

      const checker = new PermissionChecker(baseConfig);
      const toolCall: ToolCall = {
        id: "call_1",
        name: "execute_command",
        arguments: { command: "sudo rm -rf / --no-preserve-root" },
      };

      const result = await checker.check("session_1", toolCall, "execute");

      expect(result.approved).toBe(false);
      if (!result.approved) {
        expect(result.reason).toContain('contains "rm -rf /"');
      }
      expect(deniedReason).toContain('contains "rm -rf /"');
    });
  });

  describe("Write-only Mode", () => {
    it("should auto-approve read operations", async () => {
      const bus = getEventBus();
      let autoApproved = false;
      bus.on("permission:auto-approved", () => {
        autoApproved = true;
      });

      const checker = new PermissionChecker({
        ...baseConfig,
        requireApproval: "write-only",
      });

      const toolCall: ToolCall = {
        id: "call_read",
        name: "read_file",
        arguments: { path: "src/index.ts" },
      };

      const result = await checker.check("session_1", toolCall, "read");

      expect(result.approved).toBe(true);
      if (result.approved) {
        expect(result.auto).toBe(true);
      }
      expect(autoApproved).toBe(true);
    });

    it("should prompt user for write operations and approve when confirmed", async () => {
      const bus = getEventBus();
      const events: string[] = [];
      bus.on("permission:requested", () => events.push("requested"));
      bus.on("permission:approved", () => events.push("approved"));

      const checker = new PermissionChecker({
        ...baseConfig,
        requireApproval: "write-only",
      });

      checker.setApprovalCallback(async () => true);

      const toolCall: ToolCall = {
        id: "call_write",
        name: "write_file",
        arguments: { path: "new.ts", content: "export {}" },
      };

      const result = await checker.check("session_1", toolCall, "write");

      expect(result.approved).toBe(true);
      if (result.approved) {
        expect(result.auto).toBe(false);
      }
      expect(events).toEqual(["requested", "approved"]);
    });

    it("should deny write operations when user declines", async () => {
      const bus = getEventBus();
      const events: string[] = [];
      bus.on("permission:requested", () => events.push("requested"));
      bus.on("permission:denied", () => events.push("denied"));

      const checker = new PermissionChecker({
        ...baseConfig,
        requireApproval: "write-only",
      });

      checker.setApprovalCallback(async () => false);

      const toolCall: ToolCall = {
        id: "call_write",
        name: "write_file",
        arguments: { path: "new.ts", content: "export {}" },
      };

      const result = await checker.check("session_1", toolCall, "write");

      expect(result.approved).toBe(false);
      if (!result.approved) {
        expect(result.reason).toBe("User denied the action");
      }
      expect(events).toEqual(["requested", "denied"]);
    });
  });

  describe("Never Mode", () => {
    it("should auto-approve write and execute actions if not blocked", async () => {
      const checker = new PermissionChecker({
        ...baseConfig,
        requireApproval: "never",
      });

      const toolCall: ToolCall = {
        id: "call_exec",
        name: "execute_command",
        arguments: { command: "bun test" },
      };

      const result = await checker.check("session_1", toolCall, "execute");

      expect(result.approved).toBe(true);
      if (result.approved) {
        expect(result.auto).toBe(true);
      }
    });
  });

  describe("Always Mode", () => {
    it("should require approval even for read operations", async () => {
      const checker = new PermissionChecker({
        ...baseConfig,
        requireApproval: "always",
      });

      let promptShown = false;
      checker.setApprovalCallback(async () => {
        promptShown = true;
        return true;
      });

      const toolCall: ToolCall = {
        id: "call_read",
        name: "read_file",
        arguments: { path: "src/index.ts" },
      };

      const result = await checker.check("session_1", toolCall, "read");

      expect(result.approved).toBe(true);
      expect(promptShown).toBe(true);
    });
  });

  describe("Missing Approval Handler", () => {
    it("should default to denied when approval is required but no handler exists", async () => {
      const checker = new PermissionChecker({
        ...baseConfig,
        requireApproval: "always",
      });

      const toolCall: ToolCall = {
        id: "call_read",
        name: "read_file",
        arguments: { path: "src/index.ts" },
      };

      const result = await checker.check("session_1", toolCall, "read");

      expect(result.approved).toBe(false);
      if (!result.approved) {
        expect(result.reason).toBe("No approval handler configured");
      }
    });
  });
});


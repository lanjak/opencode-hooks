import { test, expect } from "bun:test";
import { toPreToolUsePayload, toPostToolUsePayload, parseHookResponse } from "./cchook.js";

test("maps opencode bash to Claude Bash payload", () => {
  const p = toPreToolUsePayload({ tool: "bash", args: { command: "ls -la" }, sessionID: "s1", cwd: "/tmp" });
  expect(p.hook_event_name).toBe("PreToolUse");
  expect(p.tool_name).toBe("Bash");
  expect(p.tool_input.command).toBe("ls -la");
  expect(p.session_id).toBe("s1");
});

test("returns null for unbridged tools", () => {
  expect(toPreToolUsePayload({ tool: "todowrite", args: {}, sessionID: "s", cwd: "/" })).toBeNull();
});

test("post payload carries tool_response", () => {
  const p = toPostToolUsePayload({ tool: "webfetch", args: { url: "https://x" }, sessionID: "s", cwd: "/", output: "big page text" });
  expect(p.hook_event_name).toBe("PostToolUse");
  expect(p.tool_name).toBe("WebFetch");
  expect(p.tool_response).toBe("big page text");
});

test("parses additionalContext from hook stdout", () => {
  const out = JSON.stringify({ hookSpecificOutput: { hookEventName: "PostToolUse", additionalContext: "use ctx tools" } });
  expect(parseHookResponse(out)).toBe("use ctx tools");
});

test("parses systemMessage fallback and handles junk", () => {
  expect(parseHookResponse(JSON.stringify({ systemMessage: "tip" }))).toBe("tip");
  expect(parseHookResponse("not json")).toBeNull();
  expect(parseHookResponse("")).toBeNull();
});

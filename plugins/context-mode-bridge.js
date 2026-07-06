// Bridge context-mode's Claude Code hook scripts into opencode: translate
// tool.execute payloads to Claude hook JSON, pipe to the existing bun
// scripts, and surface any additionalContext guidance back into the tool
// output. Fail-open and time-bounded; no-ops if context-mode is absent.
//
// v1 is guidance-only. Task 1's probe (docs/probe-findings.md, Finding 4)
// found that throwing in opencode's tool.execute.before DOES block the
// tool call, so a deny/block mechanism is available in principle -- but
// porting context-mode's PreToolUse deny decisions is out of scope for v1.
// TODO(finding-4): wire deny/block through tool.execute.before once the
// deny-payload contract (matching Claude Code's "deny" decision shape) is
// designed and reviewed.
import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { toPreToolUsePayload, toPostToolUsePayload, parseHookResponse } from "../lib/cchook.js";

const HOOKS_DIR = join(homedir(), ".claude", "plugins", "marketplaces", "context-mode", "hooks");
const TIMEOUT_MS = 10000;
const MAX_PENDING = 200;

function runScript(script, payload) {
  return new Promise((resolve) => {
    try {
      const p = join(HOOKS_DIR, script);
      if (!existsSync(p)) return resolve(null);
      const child = spawn("bun", [p], { stdio: ["pipe", "pipe", "ignore"] });
      let out = "";
      let settled = false;
      const timer = setTimeout(() => {
        if (settled) return;
        settled = true;
        try { child.kill("SIGKILL"); } catch {}
        resolve(null);
      }, TIMEOUT_MS);
      child.stdout.on("data", (b) => { out += b; });
      child.on("exit", () => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        resolve(parseHookResponse(out));
      });
      child.on("error", (e) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        // Keep exactly one diagnostic line for a real spawn failure (e.g. bun
        // not resolvable in this environment's PATH) -- everything else in
        // this module fails open and silent by design.
        console.error("[context-mode-bridge] spawn failed for " + script + ": " + (e && e.message));
        resolve(null);
      });
      child.stdin.write(JSON.stringify(payload));
      child.stdin.end();
    } catch {
      resolve(null);
    }
  });
}

export const ContextModeBridge = async ({ directory }) => {
  const pending = new Map(); // callID -> guidance from the before hook

  return {
    "tool.execute.before": async (input, output) => {
      try {
        const payload = toPreToolUsePayload({ tool: input.tool, args: output.args, sessionID: input.sessionID, cwd: directory });
        if (!payload) return;
        const guidance = await runScript("pretooluse.mjs", payload);
        if (guidance) {
          // Stale callIDs accumulate if a call crashes before the matching
          // after-hook fires. Cap growth instead of letting the map leak.
          if (pending.size > MAX_PENDING) pending.clear();
          pending.set(input.callID, guidance);
        }
      } catch (e) {
        console.error("[context-mode-bridge] before handler error: " + (e && e.message));
      }
    },
    "tool.execute.after": async (input, output) => {
      try {
        const payload = toPostToolUsePayload({ tool: input.tool, args: input.args, sessionID: input.sessionID, cwd: directory, output: (output.output || "").slice(0, 20000) });
        let guidance = pending.get(input.callID) ?? null;
        pending.delete(input.callID);
        if (payload) {
          const post = await runScript("posttooluse.mjs", payload);
          if (post) guidance = guidance ? guidance + "\n" + post : post;
        }
        if (guidance) output.output = (output.output || "") + "\n\n<context_guidance>\n" + guidance + "\n</context_guidance>";
      } catch (e) {
        console.error("[context-mode-bridge] after handler error: " + (e && e.message));
      }
    },
  };
};

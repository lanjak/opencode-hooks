// MemPalace auto-save for opencode: the Stop/PreCompact hook port.
// On session completion, export the session as a Claude-format transcript
// and feed it to `mempalace hook run --harness claude-code` exactly like
// the Claude Code hooks do. Best-effort: mempalace may be locked by a
// concurrent Claude Code session; failures are logged and dropped.
import { spawn } from "node:child_process";
import { exportTranscript } from "../lib/transcript.js";

// Verified against docs/probe-findings.md, Finding 1: the event fired on
// session completion is "session.idle", carrying the id at
// event.properties.sessionID.
const SESSION_DONE_EVENT = "session.idle";
const STOP_TIMEOUT_MS = 120000;
const PRECOMPACT_TIMEOUT_MS = 30000;
const DEBOUNCE_MS = 5 * 60 * 1000;

const SESSION_ID_RE = /^[A-Za-z0-9_-]+$/;

const lastRun = new Map(); // sessionID -> epoch ms of last stop hook

function runHook(hook, sessionID, transcriptPath, timeoutMs) {
  return new Promise((resolve) => {
    try {
      const child = spawn("mempalace", ["hook", "run", "--hook", hook, "--harness", "claude-code"], {
        stdio: ["pipe", "ignore", "ignore"],
      });
      const timer = setTimeout(() => {
        try { child.kill("SIGKILL"); } catch {}
        resolve(false);
      }, timeoutMs);
      child.on("exit", (code) => { clearTimeout(timer); resolve(code === 0); });
      child.on("error", () => { clearTimeout(timer); resolve(false); });
      child.stdin.write(JSON.stringify({ session_id: sessionID, transcript_path: transcriptPath, stop_hook_active: false }));
      child.stdin.end();
    } catch {
      resolve(false);
    }
  });
}

export const MempalaceAutoSave = async ({ client, directory }) => {
  async function save(hook, sessionID, timeoutMs) {
    try {
      const path = await exportTranscript(client, sessionID, directory);
      if (!path) return;
      const ok = await runHook(hook, sessionID, path, timeoutMs);
      console.error("[mempalace-plugin] " + hook + " " + sessionID + " -> " + (ok ? "ok" : "failed/timeout"));
    } catch (e) {
      console.error("[mempalace-plugin] " + hook + " error: " + (e && e.message));
    }
  }

  return {
    event: async ({ event }) => {
      try {
        if (!event || event.type !== SESSION_DONE_EVENT) return;
        const sessionID = event.properties?.sessionID ?? event.properties?.info?.id;
        if (!sessionID || typeof sessionID !== "string" || !SESSION_ID_RE.test(sessionID)) return;
        const now = Date.now();
        if (now - (lastRun.get(sessionID) ?? 0) < DEBOUNCE_MS) return;
        lastRun.set(sessionID, now);
        await save("stop", sessionID, STOP_TIMEOUT_MS);
      } catch (e) {
        console.error("[mempalace-plugin] event handler error: " + (e && e.message));
      }
    },
    "experimental.session.compacting": async (input) => {
      try {
        const sessionID = input?.sessionID;
        if (!sessionID || typeof sessionID !== "string" || !SESSION_ID_RE.test(sessionID)) return;
        await save("precompact", sessionID, PRECOMPACT_TIMEOUT_MS);
      } catch (e) {
        console.error("[mempalace-plugin] compacting handler error: " + (e && e.message));
      }
    },
  };
};

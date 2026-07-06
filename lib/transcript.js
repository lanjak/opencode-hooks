// Export an opencode session as a Claude-Code-shaped transcript JSONL, the
// format `mempalace hook run --harness claude-code` mines. Only the fields
// mempalace reads are emitted: type, cwd, sessionId, timestamp,
// message.role, message.content[].text. Fail-open: any error returns null.
//
// Field shapes (info.role, info.time.created, parts[].type/.text/.tool) are
// verified against a real running session -- see docs/probe-findings.md,
// "Finding 3 re-verification" -- not just the SDK's declared types.
import { mkdirSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";

export async function exportTranscript(client, sessionID, cwd) {
  try {
    const res = await client.session.messages({ path: { id: sessionID } });
    const messages = res?.data ?? res ?? [];
    if (!Array.isArray(messages) || messages.length === 0) return null;

    const lines = [];
    for (const m of messages) {
      const info = m.info ?? m;
      const role = info.role;
      if (role !== "user" && role !== "assistant") continue;
      const content = [];
      for (const part of m.parts ?? []) {
        if (part.type === "text" && part.text) content.push({ type: "text", text: part.text });
        else if (part.type === "tool") content.push({ type: "text", text: "[tool: " + (part.tool ?? "unknown") + "]" });
      }
      if (content.length === 0) continue;
      const ts = info.time?.created ? new Date(info.time.created).toISOString() : new Date().toISOString();
      lines.push(JSON.stringify({ type: role, cwd, sessionId: sessionID, timestamp: ts, message: { role, content } }));
    }
    if (lines.length === 0) return null;

    const dir = join(homedir(), ".cache", "opencode-hooks");
    mkdirSync(dir, { recursive: true });
    const path = join(dir, "transcript-" + sessionID + ".jsonl");
    writeFileSync(path, lines.join("\n") + "\n");
    return path;
  } catch {
    return null;
  }
}

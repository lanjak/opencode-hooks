// Translate opencode tool hook payloads to/from Claude Code hook JSON so
// context-mode's existing hook scripts can be reused verbatim.
//
// Field shapes verified directly against the consuming scripts on this
// machine (~/.claude/plugins/marketplaces/context-mode/hooks/{pretooluse,
// posttooluse}.mjs and session-helpers.mjs): tool_name/tool_input are read
// as-is, cwd is read via getInputProjectDir(input) (checks input.cwd first),
// session_id is read via getSessionId(input) (checks sessionId/session_id),
// and tool_response is read as a string (JSON.stringify'd if not already a
// string). No deltas from the brief's payload shape were required.
const TOOL_MAP = { bash: "Bash", webfetch: "WebFetch", read: "Read", grep: "Grep" };

export function toPreToolUsePayload({ tool, args, sessionID, cwd }) {
  const name = TOOL_MAP[tool];
  if (!name) return null;
  return { hook_event_name: "PreToolUse", tool_name: name, tool_input: args ?? {}, session_id: sessionID, cwd, transcript_path: "" };
}

export function toPostToolUsePayload({ tool, args, sessionID, cwd, output }) {
  const base = toPreToolUsePayload({ tool, args, sessionID, cwd });
  if (!base) return null;
  return { ...base, hook_event_name: "PostToolUse", tool_response: output ?? "" };
}

export function parseHookResponse(stdoutText) {
  try {
    const d = JSON.parse(stdoutText);
    return d?.hookSpecificOutput?.additionalContext ?? d?.systemMessage ?? null;
  } catch {
    return null;
  }
}

# opencode-hooks

Plugins that bring Claude Code style lifecycle hooks to [OpenCode](https://opencode.ai).

If you run both Claude Code and OpenCode, you have probably noticed that tools
built around Claude Code's hook system (automatic memory capture, tool-output
guidance, session context) simply do not fire in OpenCode. These plugins close
that gap by translating OpenCode's plugin events into the hook payloads those
tools already understand - the same tooling works in both harnesses without a
rewrite.

## What's included

**mempalace.js** - auto-save for MemPalace memory. When a session goes idle,
the plugin exports it as a Claude-format transcript (JSONL) and feeds it to
`mempalace hook run --harness claude-code`, the same entry point Claude Code's
Stop hook uses. Compaction triggers the precompact hook the same way.
Debounced, time-bounded, and fail-open: a slow or missing `mempalace` binary
never blocks your session.

**context-mode-bridge.js** - reuses context-mode's existing hook scripts.
OpenCode's `tool.execute.before/after` events are translated into Claude hook
JSON and piped to the scripts you already have installed; any guidance they
return is appended to the tool output as a `<context_guidance>` block. If
context-mode is not installed, the plugin is a no-op.

**lib/transcript.js** - the session exporter behind the mempalace plugin.
Converts OpenCode sessions (via the plugin SDK client) into the transcript
shape Claude Code writes to disk. Useful on its own if you are bridging any
other transcript-consuming tool.

## Install

```sh
git clone https://github.com/lanjak/opencode-hooks
cd opencode-hooks
./install.sh
```

The installer symlinks the plugins into `~/.config/opencode/plugins/`, so a
`git pull` picks up updates. Works on Linux and macOS. Remove a plugin by
deleting its symlink.

Requirements:

- OpenCode 1.17+ (plugin API with `tool.execute.*` and the `event` hook)
- For mempalace.js: the `mempalace` CLI on your PATH
- For context-mode-bridge.js: context-mode installed as a Claude Code plugin
  (the bridge calls its scripts under
  `~/.claude/plugins/marketplaces/context-mode/hooks/`), plus `bun`

Neither plugin depends on the other; install both, or delete the symlink for
the one you do not need.

## How it behaves

- Everything is fail-open. Hook errors are swallowed, subprocesses get hard
  timeouts (120s for a stop save, 30s for precompact, 10s for guidance
  scripts), and a broken plugin never crashes or stalls a session.
- Saves follow MemPalace's own cadence: its stop hook saves every N user
  exchanges (default 15), so short sessions do not generate noise. This
  matches its behavior in Claude Code.
- The bridge is guidance-only for now. OpenCode can block a tool call from a
  `tool.execute.before` hook, but this version does not use that - deny
  semantics are a planned follow-up.
- One line per hook attempt is logged to stderr (session id and outcome,
  never content).

## Notes and sharp edges

- Guidance text produced by context-mode references Claude Code MCP tool
  names. In OpenCode, reach the same tools through whatever MCP wiring you
  have for context-mode there.
- If a Claude Code session is running its own MemPalace MCP server, the
  palace write lock belongs to it. The `mempalace` hook CLI used here does
  not fight over that lock, but MemPalace itself may defer mutating work.
- The transcript exporter flattens tool calls to short `[tool: name]` stubs.
  MemPalace mines dialogue, not tool payloads, so nothing of value is lost -
  but do not expect full tool I/O in the exported files.

## License

MIT - see [LICENSE](LICENSE).

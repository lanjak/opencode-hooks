// Diagnostic plugin: appends one JSON line per hook firing to
// ~/.cache/opencode-hooks-probe.ndjson so we can learn the runtime shapes.
// Never installed by default; enable with ./install.sh --with-probe.
import { appendFileSync } from "node:fs";
import { homedir } from "node:os";

const LOG = homedir() + "/.cache/opencode-hooks-probe.ndjson";

function log(hook, data) {
  try {
    appendFileSync(LOG, JSON.stringify({ t: new Date().toISOString(), hook, data }) + "\n");
  } catch {}
}

// Summarize deeply without dumping content: keys + types + truncated strings.
function shape(v, depth = 0) {
  if (depth > 3) return typeof v;
  if (v === null) return null;
  if (Array.isArray(v)) return v.slice(0, 3).map((x) => shape(x, depth + 1));
  if (typeof v === "object") {
    const o = {};
    for (const k of Object.keys(v).slice(0, 20)) o[k] = shape(v[k], depth + 1);
    return o;
  }
  if (typeof v === "string") return v.length > 80 ? v.slice(0, 80) + "..." : v;
  return v;
}

export const Probe = async ({ client, project, directory }) => {
  log("plugin.init", { project: shape(project), directory });
  return {
    event: async ({ event }) => {
      log("event", { type: event.type, properties: shape(event.properties) });
      try {
        if (event.type === "session.idle") {
          const sessionID = event.properties && event.properties.sessionID;
          if (sessionID) {
            const res = await client.session.messages({ path: { id: sessionID } });
            log("session.messages", { sessionID, shape: shape(res) });
          }
        }
      } catch (e) {
        log("session.messages.error", { message: String(e && e.message) });
      }
    },
    "tool.execute.before": async (input, output) => log("tool.execute.before", { input: shape(input), args: shape(output.args) }),
    "tool.execute.after": async (input, output) => log("tool.execute.after", { input: shape(input), title: output.title, outputLen: (output.output || "").length }),
    "experimental.session.compacting": async (input, output) => log("session.compacting", { input: shape(input) }),
    "experimental.chat.system.transform": async (input, output) => log("chat.system.transform", { systemCount: output.system.length }),
    "chat.message": async (input, output) => log("chat.message", { input: shape(input) }),
  };
};

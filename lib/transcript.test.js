import { test, expect } from "bun:test";
import { exportTranscript } from "./transcript.js";
import { readFileSync } from "node:fs";

function fakeClient(messages) {
  return { session: { messages: async () => ({ data: messages }) } };
}

const sampleMessages = [
  { info: { id: "m1", role: "user", time: { created: 1751760000000 } }, parts: [{ type: "text", text: "hello world" }] },
  { info: { id: "m2", role: "assistant", time: { created: 1751760001000 } }, parts: [
    { type: "text", text: "hi back" },
    { type: "tool", tool: "bash", state: {} },
  ] },
];

test("exports user and assistant lines with cwd and text content", async () => {
  const p = await exportTranscript(fakeClient(sampleMessages), "sess-1", "/home/rufio/projects/x");
  expect(p).not.toBeNull();
  const lines = readFileSync(p, "utf8").trim().split("\n").map((l) => JSON.parse(l));
  expect(lines.length).toBe(2);
  expect(lines[0].type).toBe("user");
  expect(lines[0].cwd).toBe("/home/rufio/projects/x");
  expect(lines[0].sessionId).toBe("sess-1");
  expect(lines[0].message.content[0].text).toBe("hello world");
  expect(lines[1].type).toBe("assistant");
  expect(lines[1].message.content.map((c) => c.text).join(" ")).toContain("hi back");
  expect(lines[1].message.content.map((c) => c.text).join(" ")).toContain("[tool: bash]");
});

test("returns null when the client errors (fail-open)", async () => {
  const broken = { session: { messages: async () => { throw new Error("nope"); } } };
  expect(await exportTranscript(broken, "sess-2", "/tmp")).toBeNull();
});

test("returns null for a session with no messages", async () => {
  expect(await exportTranscript(fakeClient([]), "sess-3", "/tmp")).toBeNull();
});

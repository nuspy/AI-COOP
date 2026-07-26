// Client MCP minimale per sondare codex mcp-server.
// Uso:  node mcp-probe.mjs open  <cwd> <prompt>
//       node mcp-probe.mjs reply <threadId> <prompt>
// Tiene stdin aperto finche' la risposta non arriva.

import { spawn } from "node:child_process";

const [, , mode, arg1, ...rest] = process.argv;
const prompt = rest.join(" ");

const child = spawn("codex", ["mcp-server"], {
  stdio: ["pipe", "pipe", "ignore"],
  shell: true
});

let buffer = "";
const send = (msg) => child.stdin.write(JSON.stringify(msg) + "\n");

send({
  jsonrpc: "2.0", id: 1, method: "initialize",
  params: {
    protocolVersion: "2025-06-18",
    capabilities: {},
    clientInfo: { name: "probe", version: "1.0" }
  }
});

child.stdout.on("data", (chunk) => {
  buffer += chunk.toString();
  let idx;
  while ((idx = buffer.indexOf("\n")) !== -1) {
    const line = buffer.slice(0, idx).trim();
    buffer = buffer.slice(idx + 1);
    if (!line) continue;

    let msg;
    try { msg = JSON.parse(line); } catch { continue; }

    if (msg.id === 1) {
      send({ jsonrpc: "2.0", method: "notifications/initialized" });

      const call = mode === "open"
        ? {
            name: "codex",
            arguments: {
              prompt,
              sandbox: "read-only",
              cwd: arg1,
              config: { model_reasoning_effort: "low" }
            }
          }
        : {
            name: "codex-reply",
            arguments: { threadId: arg1, prompt }
          };

      send({ jsonrpc: "2.0", id: 2, method: "tools/call", params: call });
    }

    if (msg.id === 2) {
      const sc = msg.result?.structuredContent ?? {};
      console.log(JSON.stringify({
        isError: msg.result?.isError ?? false,
        threadId: sc.threadId ?? null,
        content: (sc.content ?? "").slice(0, 400)
      }, null, 2));
      child.kill();
      process.exit(0);
    }
  }
});

setTimeout(() => {
  console.log(JSON.stringify({ timeout: true }));
  child.kill();
  process.exit(1);
}, 300000);

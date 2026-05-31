// E2E: boots its own hub on a fresh temp DB, then drives two MCP agents
// through the full collaboration flow. Self-contained: `node scripts/e2e.mjs`.
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";
import { spawn } from "node:child_process";
import { rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Derive a per-process port so back-to-back / concurrent runs don't collide.
const PORT = process.env.PORT ?? String(8000 + (process.pid % 1000));
const TOKEN = "e2e-test-secret-token-1234567890";
const HUB_URL = `http://localhost:${PORT}/mcp`;
const DB_PATH = join(tmpdir(), `3some-e2e-${process.pid}.db`);

function cleanupDb() {
  for (const suffix of ["", "-wal", "-shm"]) {
    try { rmSync(DB_PATH + suffix); } catch {}
  }
}

// `npm start` spawns tsx→node grandchildren; signalling npm alone orphans them
// (they keep holding the port). Run detached so we can kill the whole group.
function stopServer(proc) {
  try { process.kill(-proc.pid, "SIGKILL"); } catch { try { proc.kill("SIGKILL"); } catch {} }
}

async function bootServer() {
  cleanupDb();
  const proc = spawn("npm", ["start"], {
    env: { ...process.env, COLLAB_TOKEN: TOKEN, DB_PATH, PORT },
    stdio: "ignore",
    detached: true,
  });
  for (let i = 0; i < 40; i++) {
    try {
      const r = await fetch(`http://localhost:${PORT}/healthz`);
      if (r.ok) return proc;
    } catch {}
    await new Promise((r) => setTimeout(r, 250));
  }
  stopServer(proc);
  throw new Error("server did not come up within 10s");
}

// Claude Code style: custom X-Auth-Token + X-Agent-Id headers.
async function connect(agentId) {
  const transport = new StreamableHTTPClientTransport(new URL(HUB_URL), {
    requestInit: {
      headers: { "x-auth-token": TOKEN, "x-agent-id": agentId, "x-agent-tool": "e2e" },
    },
  });
  const client = new Client({ name: `e2e-${agentId}`, version: "0.0.0" });
  await client.connect(transport);
  return client;
}

// Codex style: Authorization: Bearer + ?agent_id query param, NO custom headers.
async function connectCodex(agentId) {
  const url = new URL(HUB_URL);
  url.searchParams.set("agent_id", agentId);
  const transport = new StreamableHTTPClientTransport(url, {
    requestInit: { headers: { Authorization: `Bearer ${TOKEN}` } },
  });
  const client = new Client({ name: `e2e-${agentId}`, version: "0.0.0" });
  await client.connect(transport);
  return client;
}

async function call(client, name, args = {}) {
  const res = await client.callTool({ name, arguments: args });
  if (res.isError) throw new Error(`tool ${name} errored: ${res.content?.[0]?.text}`);
  return JSON.parse(res.content?.[0]?.text ?? "null");
}

const assert = (cond, msg) => {
  if (!cond) throw new Error("ASSERT FAILED: " + msg);
  console.log("  ✓ " + msg);
};

async function main() {
  console.log("== booting hub on fresh temp db ==");
  const server = await bootServer();
  console.log("  ✓ hub up on :" + PORT);

  console.log("== connecting agents ==");
  const claude = await connect("claude-1");
  // codex-1 connects exactly as the Codex CLI does: bearer token + ?agent_id,
  // proving the documented Codex setup actually works against the hub.
  const codex = await connectCodex("codex-1");
  console.log("  ✓ claude-1 (header auth) + codex-1 (bearer + ?agent_id) connected");
  const codexWho = await call(codex, "whoami");
  assert(codexWho.agentId === "codex-1", "codex identity resolved from ?agent_id");

  console.log("== tool discovery ==");
  const tools = await claude.listTools();
  console.log(`  tools: ${tools.tools.map((t) => t.name).join(", ")}`);
  assert(tools.tools.length >= 14, "at least 14 tools exposed");

  console.log("== identity ==");
  const who = await call(claude, "whoami");
  assert(who.agentId === "claude-1", "whoami returns claude-1");

  console.log("== channel message with mention ==");
  await call(claude, "send_message", { to: "#general", body: "Hey @codex-1, review the auth layer?" });
  const chan = await call(codex, "read_messages");
  assert(chan.length === 1, "codex reads 1 unread message");
  assert(chan[0].body.includes("@codex-1"), "message body carries the mention");
  const again = await call(codex, "read_messages");
  assert(again.length === 0, "cursor advanced — no repeat on second read");

  console.log("== direct message ==");
  await call(claude, "send_message", { to: "@codex-1", body: "ping (private)" });
  const dm = await call(codex, "read_messages");
  assert(dm.length === 1, "codex sees the DM");
  assert(dm[0].recipient === "@codex-1", "DM addressed to codex");
  const claudeView = await call(claude, "read_messages");
  assert(!claudeView.some((m) => m.recipient === "@codex-1"), "claude does NOT see codex's DM");

  console.log("== task board ==");
  const task = await call(claude, "post_task", { title: "Review auth", assignee: "codex-1", description: "Check token compare" });
  assert(task.id != null, "task created with id");
  const codexTasks = await call(codex, "list_tasks", { assignee: "codex-1" });
  assert(codexTasks.length === 1, "codex has 1 assigned task");
  await call(codex, "claim_task", { task_id: task.id });
  const claimed = await call(codex, "list_tasks", { status: "doing" });
  assert(claimed.some((t) => t.id === task.id), "task moved to doing on claim");
  await call(codex, "update_task", { task_id: task.id, status: "done", note: "lgtm" });
  const done = await call(codex, "list_tasks", { status: "done" });
  assert(done.some((t) => t.id === task.id), "task marked done");

  console.log("== snippets ==");
  const snip = await call(claude, "share_snippet", { title: "auth helper", content: "x-auth-token compare", language: "ts" });
  const got = await call(codex, "get_snippet", { id: snip.id });
  assert(got.content === "x-auth-token compare", "codex fetches shared snippet by id");
  const list = await call(codex, "list_snippets");
  assert(list.some((s) => s.id === snip.id), "snippet appears in list");

  console.log("== presence ==");
  await call(claude, "set_presence", { status: "writing tests", working_on: "e2e.mjs" });
  const online = await call(codex, "who_is_online");
  assert(online.some((p) => p.agent_id === "claude-1" || p.agentId === "claude-1"), "claude shows online with presence");

  console.log("== team_status (aggregated inbox) ==");
  const status = await call(claude, "team_status");
  console.log("  team_status:", JSON.stringify(status));
  assert(Array.isArray(status.unread), "team_status has unread array");
  assert(Array.isArray(status.myTasks), "team_status has myTasks array");
  assert(Array.isArray(status.online), "team_status has online roster");

  console.log("\n🎉 E2E PASSED — full 2-agent collaboration flow works end to end.");
  // Best-effort teardown; the streamable-http client's SSE stream can reject on
  // abort, so don't let teardown noise flip a passing run to a failure.
  await Promise.allSettled([claude.close(), codex.close()]);
  stopServer(server);
}

main().then(
  () => { cleanupDb(); process.exit(0); },
  (e) => {
    console.error("\n❌ E2E FAILED:", e.message);
    cleanupDb();
    process.exit(1);
  }
);

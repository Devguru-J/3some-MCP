import "dotenv/config";
import express from "express";
import { randomUUID } from "node:crypto";
import { StreamableHTTPServerTransport } from "@modelcontextprotocol/sdk/server/streamableHttp.js";
import { loadConfig } from "./config.js";
import { openDb } from "./db/index.js";
import { createServices } from "./services/index.js";
import { registerRestRoutes } from "./http/rest.js";
import { registerWebRoutes } from "./http/web.js";
import { requireToken, requireIdentity } from "./http/auth.js";
import { createMcpServer } from "./mcp/server.js";

const cfg = loadConfig();
const db = openDb(cfg.dbPath);
const services = createServices(db);

const app = express();
app.use(express.json());

// REST hook routes (inbox/heartbeat/healthz)
registerRestRoutes(app, services, { token: cfg.token, presenceTtlSec: cfg.presenceTtlSec });

// Browser chat UI (GET / + /api/messages)
registerWebRoutes(app, services, { token: cfg.token, presenceTtlSec: cfg.presenceTtlSec });

// --- MCP over Streamable HTTP ---
// One transport (and one McpServer) per session, keyed by mcp-session-id.
const transports = new Map<string, StreamableHTTPServerTransport>();

app.post("/mcp", requireToken(cfg.token), requireIdentity(), async (req, res) => {
  const sessionId = req.header("mcp-session-id");
  let transport = sessionId ? transports.get(sessionId) : undefined;

  if (!transport) {
    // New session: bind a fresh MCP server to this caller's identity.
    transport = new StreamableHTTPServerTransport({
      sessionIdGenerator: () => randomUUID(),
      onsessioninitialized: (sid: string) => {
        transports.set(sid, transport!);
      },
    });
    transport.onclose = () => {
      if (transport!.sessionId) transports.delete(transport!.sessionId);
    };
    const mcp = createMcpServer(req.agentId!, req.agentTool!, services, cfg.presenceTtlSec);
    await mcp.connect(transport);
  }

  await transport.handleRequest(req, res, req.body);
});

// SSE stream + session termination for the Streamable HTTP transport.
const replay = async (req: express.Request, res: express.Response) => {
  const sessionId = req.header("mcp-session-id");
  const transport = sessionId ? transports.get(sessionId) : undefined;
  if (!transport) {
    res.status(400).json({ error: "unknown or missing mcp-session-id" });
    return;
  }
  await transport.handleRequest(req, res);
};
app.get("/mcp", requireToken(cfg.token), replay);
app.delete("/mcp", requireToken(cfg.token), replay);

app.listen(cfg.port, () => {
  console.log(`3some-collab hub listening on :${cfg.port}`);
  console.log(`  MCP:  POST /mcp   REST: GET /inbox, POST /heartbeat`);
});

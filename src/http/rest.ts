import type { Express } from "express";
import type { Services } from "../services/index.js";
import { requireToken, requireIdentity } from "./auth.js";

export function registerRestRoutes(
  app: Express,
  services: Services,
  cfg: { token: string; presenceTtlSec: number }
): void {
  const guard = [requireToken(cfg.token), requireIdentity()];

  // Inbox: the hook polls this every turn. Side effects: register + heartbeat.
  app.get("/inbox", ...guard, (req, res) => {
    const agentId = req.agentId!;
    services.agents.ensure(agentId, req.agentTool!);
    services.agents.heartbeat(agentId);
    const summary = services.inbox.forAgent(agentId, cfg.presenceTtlSec);
    res.json(summary);
  });

  // Heartbeat: keep presence fresh, optionally set a status line.
  app.post("/heartbeat", ...guard, (req, res) => {
    const agentId = req.agentId!;
    services.agents.ensure(agentId, req.agentTool!);
    services.agents.heartbeat(agentId);
    const { status, working_on } = req.body ?? {};
    if (typeof status === "string") {
      services.presence.set({ agentId, status, workingOn: working_on });
    }
    res.json({ ok: true });
  });

  // Liveness probe (no auth) for launchd / uptime checks.
  app.get("/healthz", (_req, res) => res.json({ ok: true }));
}

import type { Request, Response, NextFunction } from "express";

// Augment Express request with the resolved agent id.
declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      agentId?: string;
      agentTool?: string;
    }
  }
}

/**
 * Rejects requests missing/with-wrong shared token. Accepts either the
 * `X-Auth-Token` header or `Authorization: Bearer <token>` — the latter so
 * Codex's MCP client (which only speaks bearer auth) can connect.
 */
export function requireToken(expected: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const header = req.header("X-Auth-Token");
    const auth = req.header("Authorization");
    const bearer = auth?.startsWith("Bearer ") ? auth.slice("Bearer ".length) : undefined;
    const got = header ?? bearer;
    if (got !== expected) {
      res.status(401).json({ error: "invalid or missing token (X-Auth-Token or Authorization: Bearer)" });
      return;
    }
    next();
  };
}

/**
 * Resolves the caller's identity. Prefers the `X-Agent-Id` header, falling back
 * to the `?agent_id=` query param — the latter so Codex (which can't set custom
 * headers) can still identify itself.
 */
export function requireIdentity() {
  return (req: Request, res: Response, next: NextFunction) => {
    const queryId = typeof req.query.agent_id === "string" ? req.query.agent_id : undefined;
    const id = req.header("X-Agent-Id") ?? queryId;
    if (!id) {
      res.status(400).json({ error: "missing identity (X-Agent-Id header or ?agent_id query param)" });
      return;
    }
    req.agentId = id;
    req.agentTool = req.header("X-Agent-Tool") ?? "unknown";
    next();
  };
}

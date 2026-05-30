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

/** Rejects requests missing/with-wrong shared token. */
export function requireToken(expected: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    const got = req.header("X-Auth-Token");
    if (got !== expected) {
      res.status(401).json({ error: "invalid or missing X-Auth-Token" });
      return;
    }
    next();
  };
}

/** Resolves the caller's identity from X-Agent-Id (required). */
export function requireIdentity() {
  return (req: Request, res: Response, next: NextFunction) => {
    const id = req.header("X-Agent-Id");
    if (!id) {
      res.status(400).json({ error: "missing X-Agent-Id header" });
      return;
    }
    req.agentId = id;
    req.agentTool = req.header("X-Agent-Tool") ?? "unknown";
    next();
  };
}

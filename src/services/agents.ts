import type { DB } from "../db/index.js";
import type { Agent } from "./types.js";
import { now } from "../time.js";

export function createAgentsService(db: DB) {
  const insert = db.prepare(
    "INSERT OR IGNORE INTO agents (id, tool, last_seen) VALUES (?, ?, NULL)"
  );
  const get = db.prepare("SELECT * FROM agents WHERE id = ?");
  const touch = db.prepare("UPDATE agents SET last_seen = ? WHERE id = ?");

  return {
    /** Register the agent if unseen; always returns the current row. */
    ensure(id: string, tool: string): Agent {
      insert.run(id, tool);
      return get.get(id) as Agent;
    },

    get(id: string): Agent | undefined {
      return get.get(id) as Agent | undefined;
    },

    /** Mark the agent active right now. */
    heartbeat(id: string): void {
      touch.run(now(), id);
    },

    /** Agents whose last_seen is within `ttlSec` seconds of now. */
    listOnline(ttlSec: number): Agent[] {
      const cutoff = new Date(Date.now() - ttlSec * 1000).toISOString();
      return db
        .prepare(
          "SELECT * FROM agents WHERE last_seen IS NOT NULL AND last_seen >= ? ORDER BY id"
        )
        .all(cutoff) as Agent[];
    },
  };
}

export type AgentsService = ReturnType<typeof createAgentsService>;

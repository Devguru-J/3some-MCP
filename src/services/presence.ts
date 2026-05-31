import type { DB } from "../db/index.js";
import type { PresenceRow } from "./types.js";
import { now } from "../time.js";

export function createPresenceService(db: DB) {
  const upsert = db.prepare(
    `INSERT INTO presence (agent_id, status, working_on, updated_at)
     VALUES (@agentId, @status, @workingOn, @ts)
     ON CONFLICT(agent_id) DO UPDATE SET
       status = excluded.status,
       working_on = excluded.working_on,
       updated_at = excluded.updated_at`
  );

  return {
    set(input: { agentId: string; status: string; workingOn?: string }): void {
      upsert.run({
        agentId: input.agentId,
        status: input.status,
        workingOn: input.workingOn ?? null,
        ts: now(),
      });
    },

    whoIsOnline(ttlSec: number): PresenceRow[] {
      const cutoff = new Date(Date.now() - ttlSec * 1000).toISOString();
      return db
        .prepare(
          "SELECT * FROM presence WHERE updated_at >= ? ORDER BY agent_id"
        )
        .all(cutoff) as PresenceRow[];
    },
  };
}

export type PresenceService = ReturnType<typeof createPresenceService>;

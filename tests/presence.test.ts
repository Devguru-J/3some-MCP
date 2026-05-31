import { describe, it, expect } from "vitest";
import { openDb } from "../src/db/index.js";
import { createPresenceService } from "../src/services/presence.js";

describe("presence service", () => {
  it("set() upserts presence for an agent", () => {
    const db = openDb(":memory:");
    const presence = createPresenceService(db);
    presence.set({ agentId: "a", status: "refactoring auth.ts", workingOn: "auth.ts" });
    presence.set({ agentId: "a", status: "writing tests" }); // update
    const online = presence.whoIsOnline(120);
    expect(online).toHaveLength(1);
    expect(online[0].status).toBe("writing tests");
  });

  it("whoIsOnline() drops entries older than the TTL", () => {
    const db = openDb(":memory:");
    const presence = createPresenceService(db);
    // manually insert a stale row
    db.prepare(
      "INSERT INTO presence (agent_id, status, working_on, updated_at) VALUES (?,?,?,?)"
    ).run("old", "idle", null, "2000-01-01T00:00:00.000Z");
    expect(presence.whoIsOnline(120)).toEqual([]);
  });
});

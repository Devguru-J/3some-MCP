import { describe, it, expect } from "vitest";
import { openDb } from "../src/db/index.js";
import { createAgentsService } from "../src/services/agents.js";

describe("openDb", () => {
  it("creates tables in an in-memory db", () => {
    const db = openDb(":memory:");
    const row = db
      .prepare(
        "SELECT name FROM sqlite_master WHERE type='table' AND name='messages'"
      )
      .get() as { name: string } | undefined;
    expect(row?.name).toBe("messages");
  });
});

describe("agents service", () => {
  it("ensure() registers a new agent and is idempotent", () => {
    const db = openDb(":memory:");
    const agents = createAgentsService(db);
    const a = agents.ensure("minsu-claude", "claude");
    expect(a.id).toBe("minsu-claude");
    expect(a.tool).toBe("claude");
    // calling again does not duplicate or wipe tool
    const again = agents.ensure("minsu-claude", "claude");
    expect(again.id).toBe("minsu-claude");
    expect(db.prepare("SELECT COUNT(*) c FROM agents").get()).toEqual({ c: 1 });
  });

  it("heartbeat() sets last_seen and listOnline() respects the TTL window", () => {
    const db = openDb(":memory:");
    const agents = createAgentsService(db);
    agents.ensure("a", "claude");
    agents.ensure("b", "codex");
    agents.heartbeat("a");
    // b has never sent a heartbeat -> last_seen null -> offline
    const online = agents.listOnline(120);
    expect(online.map((x) => x.id)).toEqual(["a"]);
  });
});

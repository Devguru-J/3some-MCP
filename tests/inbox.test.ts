import { describe, it, expect } from "vitest";
import { openDb } from "../src/db/index.js";
import { createServices } from "../src/services/index.js";

describe("inbox.forAgent", () => {
  it("summarizes unread messages, my open tasks, and online roster; advances cursor", () => {
    const db = openDb(":memory:");
    const s = createServices(db);
    s.agents.ensure("me", "claude");
    s.agents.heartbeat("me");
    s.agents.ensure("mate", "codex");
    s.agents.heartbeat("mate");
    s.presence.set({ agentId: "mate", status: "writing parser" });

    s.messages.send({ from: "mate", to: "#general", body: "ready?" });
    s.messages.send({ from: "mate", to: "@me", body: "ping" });
    const t = s.tasks.post({ title: "wire api", createdBy: "mate" });
    s.tasks.claim({ taskId: t.id, agentId: "me" });

    const inbox = s.inbox.forAgent("me", 120);
    expect(inbox.unread.map((m) => m.body).sort()).toEqual(["ping", "ready?"]);
    expect(inbox.myTasks.map((t) => t.title)).toEqual(["wire api"]);
    expect(inbox.online.map((a) => a.id).sort()).toEqual(["mate", "me"]);

    // cursor advanced -> next call has no unread
    const again = s.inbox.forAgent("me", 120);
    expect(again.unread).toEqual([]);
  });
});

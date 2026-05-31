import { describe, it, expect } from "vitest";
import { openDb } from "../src/db/index.js";
import { createTasksService } from "../src/services/tasks.js";

describe("tasks service", () => {
  it("post() creates a todo task and a 'created' event", () => {
    const db = openDb(":memory:");
    const tasks = createTasksService(db);
    const t = tasks.post({ title: "Build login", createdBy: "a" });
    expect(t.status).toBe("todo");
    expect(t.title).toBe("Build login");
    const events = db.prepare("SELECT * FROM task_events WHERE task_id = ?").all(t.id);
    expect(events).toHaveLength(1);
    expect((events[0] as any).kind).toBe("created");
  });

  it("claim() assigns the agent and moves todo -> doing", () => {
    const db = openDb(":memory:");
    const tasks = createTasksService(db);
    const t = tasks.post({ title: "x", createdBy: "a" });
    const claimed = tasks.claim({ taskId: t.id, agentId: "b" });
    expect(claimed.assignee).toBe("b");
    expect(claimed.status).toBe("doing");
  });

  it("update() changes status and records an event", () => {
    const db = openDb(":memory:");
    const tasks = createTasksService(db);
    const t = tasks.post({ title: "x", createdBy: "a" });
    const done = tasks.update({ taskId: t.id, status: "done", agentId: "b", note: "shipped" });
    expect(done.status).toBe("done");
    const kinds = (db.prepare("SELECT kind FROM task_events WHERE task_id = ? ORDER BY id").all(t.id) as any[]).map(e => e.kind);
    expect(kinds).toEqual(["created", "status"]);
  });

  it("list() filters by status and assignee", () => {
    const db = openDb(":memory:");
    const tasks = createTasksService(db);
    const t1 = tasks.post({ title: "a", createdBy: "x" });
    tasks.post({ title: "b", createdBy: "x" });
    tasks.claim({ taskId: t1.id, agentId: "me" });
    expect(tasks.list({ status: "doing" }).map(t => t.title)).toEqual(["a"]);
    expect(tasks.list({ assignee: "me" }).map(t => t.title)).toEqual(["a"]);
    expect(tasks.list({}).length).toBe(2);
  });
});

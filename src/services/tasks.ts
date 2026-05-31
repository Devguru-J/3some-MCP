import type { DB } from "../db/index.js";
import type { Task, TaskStatus } from "./types.js";
import { now } from "../time.js";

export interface PostInput {
  title: string;
  description?: string;
  assignee?: string;
  createdBy: string;
}

export function createTasksService(db: DB) {
  const insertTask = db.prepare(
    `INSERT INTO tasks (title, description, status, assignee, created_by, created_at, updated_at)
     VALUES (@title, @description, 'todo', @assignee, @createdBy, @ts, @ts)`
  );
  const byId = db.prepare("SELECT * FROM tasks WHERE id = ?");
  const insertEvent = db.prepare(
    `INSERT INTO task_events (task_id, agent_id, kind, detail, created_at)
     VALUES (?, ?, ?, ?, ?)`
  );

  function event(taskId: number, agentId: string, kind: string, detail?: string) {
    insertEvent.run(taskId, agentId, kind, detail ?? null, now());
  }

  return {
    post(input: PostInput): Task {
      const info = insertTask.run({
        title: input.title,
        description: input.description ?? null,
        assignee: input.assignee ?? null,
        createdBy: input.createdBy,
        ts: now(),
      });
      const id = info.lastInsertRowid as number;
      event(id, input.createdBy, "created", input.title);
      return byId.get(id) as Task;
    },

    claim(input: { taskId: number; agentId: string }): Task {
      const t = byId.get(input.taskId) as Task | undefined;
      if (!t) throw new Error(`task ${input.taskId} not found`);
      const nextStatus: TaskStatus = t.status === "todo" ? "doing" : t.status;
      db.prepare(
        "UPDATE tasks SET assignee = ?, status = ?, updated_at = ? WHERE id = ?"
      ).run(input.agentId, nextStatus, now(), input.taskId);
      event(input.taskId, input.agentId, "claimed");
      return byId.get(input.taskId) as Task;
    },

    update(input: {
      taskId: number;
      status: TaskStatus;
      agentId: string;
      note?: string;
    }): Task {
      const t = byId.get(input.taskId) as Task | undefined;
      if (!t) throw new Error(`task ${input.taskId} not found`);
      db.prepare("UPDATE tasks SET status = ?, updated_at = ? WHERE id = ?").run(
        input.status,
        now(),
        input.taskId
      );
      event(input.taskId, input.agentId, "status", input.note ?? input.status);
      return byId.get(input.taskId) as Task;
    },

    list(filter: { status?: TaskStatus; assignee?: string }): Task[] {
      const where: string[] = [];
      const params: unknown[] = [];
      if (filter.status) {
        where.push("status = ?");
        params.push(filter.status);
      }
      if (filter.assignee) {
        where.push("assignee = ?");
        params.push(filter.assignee);
      }
      const sql =
        "SELECT * FROM tasks" +
        (where.length ? ` WHERE ${where.join(" AND ")}` : "") +
        " ORDER BY updated_at DESC";
      return db.prepare(sql).all(...params) as Task[];
    },
  };
}

export type TasksService = ReturnType<typeof createTasksService>;

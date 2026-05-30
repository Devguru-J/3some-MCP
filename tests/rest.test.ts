import { describe, it, expect, beforeAll, afterAll } from "vitest";
import type { Server } from "node:http";
import express from "express";
import { openDb } from "../src/db/index.js";
import { createServices } from "../src/services/index.js";
import { registerRestRoutes } from "../src/http/rest.js";

let server: Server;
let base: string;
const TOKEN = "test-token";

beforeAll(async () => {
  const db = openDb(":memory:");
  const services = createServices(db);
  // seed a message from "mate" to #general
  services.agents.ensure("mate", "codex");
  services.messages.send({ from: "mate", to: "#general", body: "hello team" });

  const app = express();
  app.use(express.json());
  registerRestRoutes(app, services, { token: TOKEN, presenceTtlSec: 120 });
  await new Promise<void>((resolve) => {
    server = app.listen(0, () => resolve());
  });
  const addr = server.address();
  if (typeof addr === "object" && addr) base = `http://127.0.0.1:${addr.port}`;
});

afterAll(() => server?.close());

const headers = (extra: Record<string, string> = {}) => ({
  "X-Auth-Token": TOKEN,
  "X-Agent-Id": "me",
  "Content-Type": "application/json",
  ...extra,
});

describe("REST inbox/heartbeat", () => {
  it("rejects requests without the token", async () => {
    const res = await fetch(`${base}/inbox`, {
      headers: { "X-Agent-Id": "me" },
    });
    expect(res.status).toBe(401);
  });

  it("rejects requests without an agent id", async () => {
    const res = await fetch(`${base}/inbox`, {
      headers: { "X-Auth-Token": TOKEN },
    });
    expect(res.status).toBe(400);
  });

  it("GET /inbox returns unread messages and registers + heartbeats the agent", async () => {
    const res = await fetch(`${base}/inbox`, { headers: headers() });
    expect(res.status).toBe(200);
    const body = await res.json();
    expect(body.unread.map((m: any) => m.body)).toEqual(["hello team"]);
    // second call: cursor advanced, nothing new
    const res2 = await fetch(`${base}/inbox`, { headers: headers() });
    expect((await res2.json()).unread).toEqual([]);
  });

  it("POST /heartbeat updates presence and returns ok", async () => {
    const res = await fetch(`${base}/heartbeat`, {
      method: "POST",
      headers: headers(),
      body: JSON.stringify({ status: "coding", working_on: "rest.ts" }),
    });
    expect(res.status).toBe(200);
    expect((await res.json()).ok).toBe(true);
  });
});

// 브라우저 채팅 UI / 토큰 게이트 인증 vitest 스펙 (tmp/token-gate.test.ts 승격본)
//
// rest.test.ts 와 동일 디렉토리·컨벤션(:memory: DB + app.listen(0)). tests/**/*.test.ts
// 가 vitest include 라서 이 파일은 `npm test` 에 자동 포함된다.
//
// 검증 스펙:
//   GET /            : 토큰 유무와 무관하게 항상 200 + 채팅 HTML (서버측 게이트 없음, 의도된 설계)
//   GET /api/messages: 토큰 없음 -> 401 / 틀린 토큰 -> 401 / 올바른 X-Auth-Token -> 200 + JSON
//   + 보너스: Bearer 토큰도 200 (Codex 호환 경로)

import { describe, it, expect, beforeEach, afterEach } from "vitest";
import express from "express";
import type { Server } from "node:http";
import { openDb } from "../src/db/index.js";
import { createServices } from "../src/services/index.js";
import { registerWebRoutes } from "../src/http/web.js";
import type { Services } from "../src/services/index.js";

const TOKEN = "test-token";
const WRONG = "nope-wrong-token";

let server: Server;
let base: string;
let services: Services;

beforeEach(async () => {
  const db = openDb(":memory:");
  services = createServices(db);
  services.agents.ensure("mate", "codex");
  services.messages.send({ from: "mate", to: "#general", body: "hello team" });

  const app = express();
  app.use(express.json());
  registerWebRoutes(app, services, { token: TOKEN, presenceTtlSec: 120 });

  server = await new Promise<Server>((resolve) => {
    const s = app.listen(0, () => resolve(s));
  });
  base = `http://127.0.0.1:${(server.address() as any).port}`;
});

afterEach(() => {
  server.close();
});

describe("browser chat UI — GET / (의도적으로 무인증)", () => {
  it("토큰 없이도 200 + 채팅 HTML", async () => {
    const res = await fetch(`${base}/`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toMatch(/<!doctype html>/i);
  });

  it("틀린 토큰이어도 200 (서버측 게이트 없음 — 게이트는 클라이언트측)", async () => {
    const res = await fetch(`${base}/`, { headers: { "X-Auth-Token": WRONG } });
    expect(res.status).toBe(200);
  });
});

describe("token gate — GET /api/messages (서버측 requireToken)", () => {
  it("토큰 없음 -> 401", async () => {
    const res = await fetch(`${base}/api/messages`);
    expect(res.status).toBe(401);
  });

  it("틀린 토큰 -> 401", async () => {
    const res = await fetch(`${base}/api/messages`, {
      headers: { "X-Auth-Token": WRONG },
    });
    expect(res.status).toBe(401);
  });

  it("올바른 X-Auth-Token -> 200 + messages[] JSON", async () => {
    const res = await fetch(`${base}/api/messages`, {
      headers: { "X-Auth-Token": TOKEN },
    });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type") || "").toContain("application/json");
    const body = await res.json();
    expect(Array.isArray(body.messages)).toBe(true);
  });

  it("Bearer 토큰도 200 (Codex 호환 경로)", async () => {
    const res = await fetch(`${base}/api/messages`, {
      headers: { Authorization: `Bearer ${TOKEN}` },
    });
    expect(res.status).toBe(200);
  });
});

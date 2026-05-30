import { describe, it, expect } from "vitest";
import { openDb } from "../src/db/index.js";
import { createMessagesService } from "../src/services/messages.js";

describe("messages service", () => {
  it("send() stores a message and returns it with an id", () => {
    const db = openDb(":memory:");
    const messages = createMessagesService(db);
    const m = messages.send({ from: "a", to: "#general", body: "hi" });
    expect(m.id).toBeGreaterThan(0);
    expect(m.recipient).toBe("#general");
    expect(m.from_agent).toBe("a");
  });

  it("read() returns unread channel + DM messages, excludes own, advances cursor", () => {
    const db = openDb(":memory:");
    const messages = createMessagesService(db);
    messages.send({ from: "a", to: "#general", body: "channel msg" });
    messages.send({ from: "a", to: "@b", body: "dm to b" });
    messages.send({ from: "a", to: "@c", body: "dm to c" });   // not for b
    messages.send({ from: "b", to: "#general", body: "b's own msg" });

    const first = messages.read({ agentId: "b" });
    const bodies = first.messages.map((m) => m.body).sort();
    expect(bodies).toEqual(["channel msg", "dm to b"]); // own + @c excluded

    // cursor advanced: reading again returns nothing new
    const second = messages.read({ agentId: "b" });
    expect(second.messages).toEqual([]);
  });

  it("listChannels() returns distinct channels seen so far", () => {
    const db = openDb(":memory:");
    const messages = createMessagesService(db);
    messages.send({ from: "a", to: "#general", body: "x" });
    messages.send({ from: "a", to: "#frontend", body: "y" });
    messages.send({ from: "a", to: "@b", body: "z" }); // DM, not a channel
    expect(messages.listChannels().sort()).toEqual(["#frontend", "#general"]);
  });
});

import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { ModelNode, ModelEdge } from "@mc/okf";
import * as sdk from "@owox/plugin-sdk";
import { buildFocus, focusCacheKey, getQuestions, AiLimitError, __clearCache } from "./questions";

const mart = (key: string, title: string): ModelNode => ({
  key, title, inputSource: "SQL", schema: [{ name: "id", type: "INTEGER", pk: true }],
  position: { x: 0, y: 0 }, status: "pending",
});
const NODES: ModelNode[] = [mart("a", "Orders"), mart("b", "Customers"), mart("c", "Faraway")];
const EDGES: ModelEdge[] = [
  { id: "e1", from: "a", to: "b", keys: [{ left: "customer_id", right: "id" }], bidirectional: false },
  { id: "e2", from: "b", to: "c", keys: [{ left: "x", right: "y" }], bidirectional: false },
];
const GOAL = { niche: "E-commerce / Retail", goal: "Increase ROAS while holding CPC" };

describe("buildFocus", () => {
  it("includes the selected mart and its 1-hop neighbours only", () => {
    const focus = buildFocus(NODES, EDGES, "a");
    const titles = focus.marts.map(m => m.title).sort();
    expect(titles).toEqual(["Customers", "Orders"]); // "Faraway" is 2 hops away
    expect(focus.marts.find(m => m.title === "Orders")?.role).toBe("selected");
    expect(focus.joins).toHaveLength(1);
    expect(focus.joins[0].on).toEqual([{ left: "customer_id", right: "id" }]);
  });
});

describe("focusCacheKey", () => {
  it("is stable for the same focus+goal and changes when the goal changes", () => {
    const f = buildFocus(NODES, EDGES, "a");
    expect(focusCacheKey(f, GOAL)).toBe(focusCacheKey(f, GOAL));
    expect(focusCacheKey(f, GOAL)).not.toBe(focusCacheKey(f, { ...GOAL, goal: "Other" }));
  });
});

describe("getQuestions", () => {
  beforeEach(() => {
    __clearCache();
    vi.spyOn(sdk.ai, "chat").mockResolvedValue({
      text: JSON.stringify([{ question: "Q", unlockedBy: "U" }]),
      model: "m",
      raw: {},
    });
  });
  afterEach(() => vi.restoreAllMocks());

  it("calls ai.chat and caches by focus+goal", async () => {
    const f = buildFocus(NODES, EDGES, "a");
    const a = await getQuestions(f, GOAL);
    const b = await getQuestions(f, GOAL); // served from cache
    expect(a).toEqual(b);
    expect(a).toEqual([{ question: "Q", unlockedBy: "U" }]);
    expect(sdk.ai.chat).toHaveBeenCalledTimes(1);
  });

  it("force re-fetches even when cached", async () => {
    const f = buildFocus(NODES, EDGES, "a");
    await getQuestions(f, GOAL);
    await getQuestions(f, GOAL, { force: true });
    expect(sdk.ai.chat).toHaveBeenCalledTimes(2);
  });

  it("throws AiLimitError when the AI grant is denied", async () => {
    vi.spyOn(sdk.ai, "chat").mockRejectedValue(Object.assign(new Error("denied"), { code: "GRANT_DENIED" }));
    const f = buildFocus(NODES, EDGES, "a");
    await expect(getQuestions(f, GOAL)).rejects.toBeInstanceOf(AiLimitError);
  });

  it("throws AiLimitError when there is no credential", async () => {
    vi.spyOn(sdk.ai, "chat").mockRejectedValue(Object.assign(new Error("no cred"), { code: "NO_CREDENTIAL" }));
    const f = buildFocus(NODES, EDGES, "a");
    await expect(getQuestions(f, GOAL)).rejects.toBeInstanceOf(AiLimitError);
  });

  it("throws AiLimitError when the error status is 429", async () => {
    vi.spyOn(sdk.ai, "chat").mockRejectedValue(Object.assign(new Error("rate limited"), { status: 429 }));
    const f = buildFocus(NODES, EDGES, "a");
    await expect(getQuestions(f, GOAL)).rejects.toBeInstanceOf(AiLimitError);
  });
});

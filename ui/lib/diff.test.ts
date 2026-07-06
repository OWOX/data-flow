import { describe, it, expect } from "vitest";
import { diffGraphs } from "./diff";
import type { ModelGraph, ModelNode } from "@mc/okf";

const node = (key: string, title: string, fields: string[]): ModelNode => ({
  key, title, inputSource: "VIEW",
  schema: fields.map(name => ({ name, type: "STRING", pk: false })),
  position: { x: 0, y: 0 }, status: "pending", owoxId: null,
});

const base: ModelGraph = {
  storageId: null,
  nodes: [node("cust", "Customer", ["id", "email"]), node("ord", "Orders", ["id", "cust_id"])],
  edges: [{ id: "e1", from: "ord", to: "cust", keys: [{ left: "cust_id", right: "id" }], bidirectional: false, cardinality: "N:1" }],
};

describe("diffGraphs", () => {
  it("reports no change for identical graphs", () => {
    const d = diffGraphs(base, structuredClone(base));
    expect(d.changed).toBe(false);
    expect(d.tables.added).toEqual([]);
    expect(d.joins.added).toEqual([]);
  });

  it("detects an added table", () => {
    const next = structuredClone(base);
    next.nodes.push(node("prod", "Product", ["id"]));
    const d = diffGraphs(base, next);
    expect(d.changed).toBe(true);
    expect(d.tables.added).toEqual(["Product"]);
    expect(d.tables.removed).toEqual([]);
  });

  it("detects added/removed fields on a kept table", () => {
    const next = structuredClone(base);
    next.nodes[0].schema = [{ name: "id", type: "STRING", pk: false }, { name: "country", type: "STRING", pk: false }];
    const d = diffGraphs(base, next);
    const cust = d.fields.find(f => f.table === "Customer")!;
    expect(cust.added).toEqual(["country"]);
    expect(cust.removed).toEqual(["email"]);
  });

  it("detects an added join with a readable label", () => {
    const next = structuredClone(base);
    next.nodes.push(node("prod", "Product", ["id"]));
    next.edges.push({ id: "e2", from: "ord", to: "prod", keys: [{ left: "prod_id", right: "id" }], bidirectional: false, cardinality: "N:1" });
    const d = diffGraphs(base, next);
    expect(d.joins.added).toEqual(["Orders → Product"]);
  });

  it("detects a removed join", () => {
    const next = structuredClone(base);
    next.edges = [];
    const d = diffGraphs(base, next);
    expect(d.joins.removed).toEqual(["Orders → Customer"]);
  });
});

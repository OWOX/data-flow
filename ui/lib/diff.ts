import type { ModelGraph } from "@mc/okf";

// Structural diff between two model versions — what tables, fields and joins were
// added or removed. Far more readable than a raw text diff, and it's exactly the
// shape a data reviewer cares about ("which joins changed?").

export interface FieldChange {
  table: string;
  added: string[];
  removed: string[];
}

export interface GraphDiff {
  tables: { added: string[]; removed: string[] };
  fields: FieldChange[];
  joins: { added: string[]; removed: string[] };
  changed: boolean;
}

const titleMap = (g: ModelGraph): Map<string, string> =>
  new Map(g.nodes.map(n => [n.key, n.title || n.key]));

/** A stable identity for a join, independent of node order within the pair. */
const joinKey = (from: string, to: string, keys: { left: string; right: string }[]): string => {
  const pair = [from, to].sort().join("|");
  const k = keys.map(x => `${x.left}=${x.right}`).sort().join(",");
  return `${pair}#${k}`;
};

export function diffGraphs(prev: ModelGraph, next: ModelGraph): GraphDiff {
  const prevTitles = titleMap(prev);
  const nextTitles = titleMap(next);
  const titleOf = (key: string) => nextTitles.get(key) ?? prevTitles.get(key) ?? key;

  const prevKeys = new Set(prev.nodes.map(n => n.key));
  const nextKeys = new Set(next.nodes.map(n => n.key));

  const tables = {
    added: next.nodes.filter(n => !prevKeys.has(n.key)).map(n => n.title || n.key),
    removed: prev.nodes.filter(n => !nextKeys.has(n.key)).map(n => n.title || n.key),
  };

  // Field changes only for tables present in both versions.
  const prevByKey = new Map(prev.nodes.map(n => [n.key, n]));
  const fields: FieldChange[] = [];
  for (const n of next.nodes) {
    const before = prevByKey.get(n.key);
    if (!before) continue;
    const beforeFields = new Set(before.schema.map(f => f.name));
    const afterFields = new Set(n.schema.map(f => f.name));
    const added = n.schema.map(f => f.name).filter(f => !beforeFields.has(f));
    const removed = before.schema.map(f => f.name).filter(f => !afterFields.has(f));
    if (added.length || removed.length) fields.push({ table: n.title || n.key, added, removed });
  }

  const prevJoins = new Map(prev.edges.map(e => [joinKey(e.from, e.to, e.keys), e]));
  const nextJoins = new Map(next.edges.map(e => [joinKey(e.from, e.to, e.keys), e]));
  const label = (e: { from: string; to: string }) => `${titleOf(e.from)} → ${titleOf(e.to)}`;
  const joins = {
    added: [...nextJoins].filter(([k]) => !prevJoins.has(k)).map(([, e]) => label(e)),
    removed: [...prevJoins].filter(([k]) => !nextJoins.has(k)).map(([, e]) => label(e)),
  };

  const changed =
    tables.added.length > 0 || tables.removed.length > 0 ||
    fields.length > 0 ||
    joins.added.length > 0 || joins.removed.length > 0;

  return { tables, fields, joins, changed };
}

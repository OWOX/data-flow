import type { ModelNode, ModelEdge } from "@mc/okf";
import type { BusinessGoal } from "../state/goal";
import { ai } from "@owox/plugin-sdk";

export interface InsightQuestion {
  question: string;
  unlockedBy: string;
}

// Thrown when the broker denies/limits the AI grant — no credential, denied
// grant, or provider rate/spend cap (surfaced as a 429). The panel shows a
// friendly "limit reached" message for this, distinct from a generic failure.
export class AiLimitError extends Error {
  constructor() {
    super("ai_limit");
    this.name = "AiLimitError";
  }
}

export interface FocusMart {
  title: string;
  description?: string;
  fields: { name: string; type: string; pk: boolean; alias?: string; description?: string }[];
  role: "selected" | "neighbour";
}

export interface FocusJoin {
  from: string;
  to: string;
  on: { left: string; right: string }[];
}

export interface QuestionFocus {
  marts: FocusMart[];
  joins: FocusJoin[];
}

function martToFocus(node: ModelNode, role: "selected" | "neighbour"): FocusMart {
  return {
    title: node.title.trim() || "Untitled",
    description: node.description,
    fields: node.schema.map(f => ({ name: f.name, type: f.type, pk: f.pk, alias: f.alias, description: f.description })),
    role,
  };
}

// Selected mart + every mart it is directly joined to (1 hop), plus the joins
// between the selected mart and those neighbours.
export function buildFocus(nodes: ModelNode[], edges: ModelEdge[], selectedKey: string): QuestionFocus {
  const byKey = new Map(nodes.map(n => [n.key, n]));
  const selected = byKey.get(selectedKey);
  if (!selected) return { marts: [], joins: [] };

  const neighbourKeys = new Set<string>();
  const joins: FocusJoin[] = [];
  for (const e of edges) {
    if (e.from !== selectedKey && e.to !== selectedKey) continue;
    const otherKey = e.from === selectedKey ? e.to : e.from;
    const other = byKey.get(otherKey);
    if (!other) continue;
    neighbourKeys.add(otherKey);
    joins.push({
      from: byKey.get(e.from)!.title.trim() || "Untitled",
      to: byKey.get(e.to)!.title.trim() || "Untitled",
      on: e.keys.map(k => ({ left: k.left, right: k.right })),
    });
  }

  const marts: FocusMart[] = [martToFocus(selected, "selected")];
  for (const k of neighbourKeys) marts.push(martToFocus(byKey.get(k)!, "neighbour"));
  return { marts, joins };
}

export function focusCacheKey(focus: QuestionFocus, goal: BusinessGoal): string {
  return JSON.stringify({ goal, focus });
}

const cache = new Map<string, InsightQuestion[]>();

export function __clearCache(): void {
  cache.clear();
}

// Ported from the old server/llm/gemini.ts buildPrompt — pure string assembly.
function buildPrompt(input: { niche: string; goal: string; focus: QuestionFocus }): string {
  const { niche, goal, focus } = input;
  const marts = focus.marts.map(m => {
    const fields = m.fields.map(f => {
      const label = f.alias && f.alias !== f.name ? ` "${f.alias}"` : "";
      const note = f.description ? ` — ${f.description}` : "";
      return `${f.name}:${f.type}${f.pk ? " (PK)" : ""}${label}${note}`;
    }).join("\n    ");
    return `- ${m.title}${m.role === "selected" ? " [SELECTED]" : ""}${m.description ? ` — ${m.description}` : ""}\n  fields:\n    ${fields || "(none)"}`;
  }).join("\n");
  const joins = focus.joins.length
    ? focus.joins.map(j => `- ${j.from} ⨝ ${j.to} on ${j.on.map(k => `${j.from}.${k.left} = ${j.to}.${k.right}`).join(", ")}`).join("\n")
    : "(none)";
  return [
    `You are a senior analytics consultant helping a data team show business stakeholders the value of data modelling.`,
    `Business niche: ${niche}`,
    `Primary business goal: ${goal}`,
    ``,
    `Data marts in focus (the SELECTED one is the centre of attention; others are joined neighbours):`,
    marts, ``,
    `Relationships (joins) between them:`,
    joins, ``,
    `Generate EXACTLY 5 NON-TRIVIAL business questions that this modelled data — especially the joins — makes answerable, in service of the goal above. Avoid trivial single-column lookups. Favour questions that only become possible BECAUSE these marts are joined.`,
    `For each question, "unlockedBy" must name the specific field(s) or join that makes it answerable (e.g. "Orders ⨝ Customers join").`,
    `Return ONLY a JSON array of exactly 5 objects: [{"question": string, "unlockedBy": string}].`,
  ].join("\n");
}

function parseQuestions(text: string): InsightQuestion[] {
  let parsed: unknown;
  try { parsed = JSON.parse(text); } catch { throw new Error("AI returned malformed JSON"); }
  if (!Array.isArray(parsed)) throw new Error("AI response was not an array");
  const qs = parsed
    .filter((q): q is InsightQuestion => !!q && typeof (q as any).question === "string" && typeof (q as any).unlockedBy === "string")
    .slice(0, 5)
    .map(q => ({ question: q.question, unlockedBy: q.unlockedBy }));
  if (qs.length === 0) throw new Error("AI response had no valid questions");
  return qs;
}

export async function getQuestions(
  focus: QuestionFocus,
  goal: BusinessGoal,
  opts: { force?: boolean } = {},
): Promise<InsightQuestion[]> {
  const cacheKey = focusCacheKey(focus, goal);
  if (!opts.force) {
    const hit = cache.get(cacheKey);
    if (hit) return hit;
  }
  let questions: InsightQuestion[];
  try {
    const reply = await ai.chat({
      messages: [{ role: "user", content: buildPrompt({ niche: goal.niche, goal: goal.goal, focus }) }],
    });
    questions = parseQuestions(reply.text || "");
  } catch (err) {
    const code = (err as { code?: string; status?: number }).code;
    const status = (err as { status?: number }).status;
    // No AI grant, revoked secret, or provider rate/spend cap → the panel's
    // friendly "limit reached" UX (same as the old 429).
    if (code === "GRANT_DENIED" || code === "NO_CREDENTIAL" || status === 429) throw new AiLimitError();
    throw err;
  }
  cache.set(cacheKey, questions);
  return questions;
}

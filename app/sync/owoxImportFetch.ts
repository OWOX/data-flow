import { api } from '../lib/api';
import type { ImportPayload, ImportMart, ImportRelationship } from './owoxImport';
import type { InputSource } from '../okf';

const MAX_IMPORT = 100;

// Paginate every data mart (list items carry storage:{title,type} but NO id).
async function listDataMarts(): Promise<any[]> {
  const out: any[] = [];
  let offset: number | undefined;
  for (;;) {
    const qs = offset !== undefined ? `?offset=${offset}` : '';
    const page = await api<{ items: any[]; nextOffset: number | null }>(`/api/data-marts${qs}`);
    out.push(...(page.items ?? []));
    if (page.nextOffset === null || page.nextOffset === undefined) break;
    offset = page.nextOffset;
  }
  return out;
}

async function getImportMart(id: string): Promise<ImportMart> {
  const d = await api<any>(`/api/data-marts/${encodeURIComponent(id)}`);
  const fields: any[] = d.schema?.fields ?? [];
  const dt: string | undefined = d.definitionType;
  const def = d.definition ?? {};
  const definition =
    dt === 'SQL' ? (def.sqlQuery ?? null)
    : (dt === 'TABLE' || dt === 'VIEW') ? (def.fullyQualifiedName ?? null)
    : null;
  const inputSource = (dt === 'SQL' || dt === 'TABLE' || dt === 'VIEW' || dt === 'CONNECTOR' ? dt : 'SQL') as InputSource;
  return {
    id: d.id ?? id, title: d.title ?? '', status: d.status,
    ...(d.description ? { description: d.description } : {}),
    schema: fields.map(f => ({
      name: f.name, type: f.type, pk: !!f.isPrimaryKey,
      ...(f.alias ? { alias: f.alias } : {}),
      ...(f.description ? { description: f.description } : {}),
    })),
    inputSource, definition,
  };
}

async function getRelationshipGraph(id: string): Promise<ImportRelationship[]> {
  const g = await api<{ nodes?: any[] }>(`/api/data-marts/${encodeURIComponent(id)}/relationships/graph`).catch(() => ({ nodes: [] }));
  const seen = new Set<string>();
  const out: ImportRelationship[] = [];
  for (const n of g.nodes ?? []) {
    if (n.isCycleStub) continue;
    const r = n.relationship; if (!r || seen.has(r.id)) continue;
    seen.add(r.id);
    out.push({
      sourceId: r.sourceDataMart.id,
      targetId: r.targetDataMart.id,
      joinConditions: (r.joinConditions ?? []).map((j: any) => ({ sourceFieldName: j.sourceFieldName, targetFieldName: j.targetFieldName })),
    });
  }
  return out;
}

// Resolve the chosen storage → title+type, list+cap its marts, fetch details in
// parallel, then walk relationship graphs (each spans a connected component, so
// skip re-rooting once covered; dedupe by directed pair).
export async function buildImportPayload(storageId: string): Promise<ImportPayload> {
  const storages = await api<any[]>('/api/data-storages');
  const storage = storages.find(s => s.id === storageId);
  if (!storage) throw new Error(`Unknown storage id: ${storageId}`);

  const all = await listDataMarts();
  const forStorage = all.filter(m => m.storage?.title === storage.title && m.storage?.type === storage.type)
    .map(m => ({ id: m.id, title: m.title, status: m.status }));
  const total = forStorage.length;
  const picked = forStorage.slice(0, MAX_IMPORT);

  const marts = await Promise.all(picked.map(m => getImportMart(m.id)));

  const covered = new Set<string>();
  const seenPair = new Set<string>();
  const relationships: ImportRelationship[] = [];
  for (const m of picked) {
    if (covered.has(m.id)) continue;
    const rels = await getRelationshipGraph(m.id);
    covered.add(m.id);
    for (const r of rels) {
      covered.add(r.sourceId); covered.add(r.targetId);
      const key = `${r.sourceId}>${r.targetId}`;
      if (seenPair.has(key)) continue;
      seenPair.add(key);
      relationships.push(r);
    }
  }
  return { storageId, total, truncated: total > MAX_IMPORT, marts, relationships };
}

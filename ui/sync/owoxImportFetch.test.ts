import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as sdk from '@owox/plugin-sdk';
import { buildImportPayload } from './owoxImportFetch';

describe('buildImportPayload', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('resolves storage → marts → relationships via owox.request', async () => {
    vi.spyOn(sdk.owox, 'request').mockImplementation(async (method: string, path: string) => {
      if (path === '/api/data-storages') return [{ id: 's1', title: 'BQ', type: 'GOOGLE_BIGQUERY' }] as any;
      if (path.startsWith('/api/data-marts') && !path.includes('/', '/api/data-marts'.length)) return { items: [{ id: 'm1', title: 'Orders', storage: { title: 'BQ', type: 'GOOGLE_BIGQUERY' } }], nextOffset: null } as any;
      if (path === '/api/data-marts?') return { items: [], nextOffset: null } as any;
      if (path === '/api/data-marts/m1') return { id: 'm1', title: 'Orders', schema: { fields: [] }, definitionType: 'SQL', definition: { sqlQuery: 'select 1' } } as any;
      if (path.includes('/relationships/graph')) return { nodes: [] } as any;
      return { items: [], nextOffset: null } as any;
    });
    const payload = await buildImportPayload('s1');
    expect(payload.storageId).toBe('s1');
    expect(payload.marts.map(m => m.id)).toEqual(['m1']);
  });

  it('throws on unknown storage id', async () => {
    vi.spyOn(sdk.owox, 'request').mockResolvedValue([] as any);
    await expect(buildImportPayload('nope')).rejects.toThrow(/Unknown storage/);
  });
});

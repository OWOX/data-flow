import { describe, it, expect, vi, beforeEach } from 'vitest';
import * as sdk from '@owox/plugin-sdk';
import { api } from './api';

describe('api → owox.request', () => {
  beforeEach(() => vi.restoreAllMocks());

  it('maps method + path + parsed body to owox.request', async () => {
    const spy = vi.spyOn(sdk.owox, 'request').mockResolvedValue({ id: 'x' } as any);
    const out = await api('/api/data-marts', { method: 'POST', body: JSON.stringify({ title: 'T' }) });
    expect(spy).toHaveBeenCalledWith('POST', '/api/data-marts', { title: 'T' });
    expect(out).toEqual({ id: 'x' });
  });

  it('defaults to GET with no body', async () => {
    const spy = vi.spyOn(sdk.owox, 'request').mockResolvedValue([]);
    await api('/api/data-marts');
    expect(spy).toHaveBeenCalledWith('GET', '/api/data-marts', undefined);
  });

  it('rewrites the BFF-only /api/storages alias to /api/data-storages', async () => {
    const spy = vi.spyOn(sdk.owox, 'request').mockResolvedValue([]);
    await api('/api/storages');
    expect(spy).toHaveBeenCalledWith('GET', '/api/data-storages', undefined);
  });
});

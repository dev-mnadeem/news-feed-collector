import { describe, expect, it, vi } from 'vitest';
import { HttpError, buildUrl, getJson, postJson } from '../src/services/http.js';

const okResponse = (body) => ({ ok: true, status: 200, json: async () => body });

describe('buildUrl', () => {
  it('drops empty, null and undefined params', () => {
    const url = buildUrl('https://api.test/search', {
      q: 'rail',
      from: '',
      to: null,
      page: undefined,
    });
    expect(url).toBe('https://api.test/search?q=rail');
  });

  it('returns the bare url when every param is empty', () => {
    expect(buildUrl('https://api.test/search', { q: '' })).toBe('https://api.test/search');
  });

  it('appends with & when the base url already has a query string', () => {
    expect(buildUrl('https://api.test/s?a=1', { b: '2' })).toBe('https://api.test/s?a=1&b=2');
  });

  it('encodes values', () => {
    expect(buildUrl('https://api.test/s', { q: 'a b&c' })).toBe('https://api.test/s?q=a+b%26c');
  });
});

describe('getJson', () => {
  it('returns the parsed body on success', async () => {
    const fetchImpl = vi.fn(async () => okResponse({ hello: 'world' }));
    await expect(getJson('https://api.test/x', { fetchImpl })).resolves.toEqual({ hello: 'world' });
  });

  it('raises HttpError carrying the status for a non-2xx response', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: false, status: 429, json: async () => ({}) }));
    const error = await getJson('https://api.test/x', { fetchImpl }).catch((e) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.status).toBe(429);
    expect(error.message).toContain('429');
  });

  it('wraps a transport failure rather than leaking the raw error', async () => {
    const fetchImpl = vi.fn(async () => {
      throw new Error('getaddrinfo ENOTFOUND');
    });
    const error = await getJson('https://api.test/x', { fetchImpl }).catch((e) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.cause).toBeInstanceOf(Error);
  });

  it('reports a timeout when the request outlives timeoutMs', async () => {
    const fetchImpl = (url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          const abort = new Error('aborted');
          abort.name = 'AbortError';
          reject(abort);
        });
      });
    const error = await getJson('https://api.test/x', { fetchImpl, timeoutMs: 5 }).catch((e) => e);
    expect(error).toBeInstanceOf(HttpError);
    expect(error.message).toContain('timed out');
  });

  it('honours a caller-supplied abort signal', async () => {
    const controller = new AbortController();
    const fetchImpl = (url, { signal }) =>
      new Promise((_resolve, reject) => {
        signal.addEventListener('abort', () => {
          const abort = new Error('aborted');
          abort.name = 'AbortError';
          reject(abort);
        });
      });
    const promise = getJson('https://api.test/x', { fetchImpl, signal: controller.signal });
    controller.abort();
    await expect(promise).rejects.toBeInstanceOf(HttpError);
  });
});

describe('postJson', () => {
  it('sends a JSON body with the matching content type', async () => {
    const fetchImpl = vi.fn(async () => okResponse({ ok: 1 }));
    await expect(postJson('https://api.test/digest', { a: 1 }, { fetchImpl })).resolves.toEqual({
      ok: 1,
    });
    const [url, init] = fetchImpl.mock.calls[0];
    expect(url).toBe('https://api.test/digest');
    expect(init.method).toBe('POST');
    expect(init.body).toBe('{"a":1}');
    expect(init.headers).toMatchObject({
      Accept: 'application/json',
      'Content-Type': 'application/json',
    });
  });

  it('raises HttpError on a non-2xx answer', async () => {
    const fetchImpl = async () => ({ ok: false, status: 422, json: async () => ({}) });
    await expect(postJson('https://api.test/digest', {}, { fetchImpl })).rejects.toBeInstanceOf(
      HttpError
    );
  });
});

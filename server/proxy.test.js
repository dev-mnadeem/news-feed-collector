import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdir, mkdtemp, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createApp } from './index.js';

async function withApp(options, run) {
  const server = createApp(options);
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  try {
    await run('http://127.0.0.1:' + server.address().port);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}
test('only server-injected keys reach the fixed upstream', async () => {
  let target;
  await withApp(
    {
      env: { NEWSAPI_KEY: 'server-only-test-key' },
      fetchImpl: async (url) => {
        target = url;
        return new Response(JSON.stringify({ articles: [] }));
      },
    },
    async (base) => {
      const response = await fetch(base + '/api/news/newsapi?q=rail');
      assert.equal(response.status, 200);
      assert.equal(target.origin, 'https://newsapi.org');
      assert.equal(target.searchParams.get('apiKey'), 'server-only-test-key');
      assert.ok(!(await response.text()).includes('server-only-test-key'));
      assert.equal((await fetch(base + '/api/news/newsapi?apiKey=attacker')).status, 400);
      assert.equal((await fetch(base + '/api/news/unknown')).status, 404);
    }
  );
});
test('missing configuration and upstream failures stay sanitized', async () => {
  await withApp({ env: {} }, async (base) =>
    assert.equal((await fetch(base + '/api/news/nyt')).status, 503)
  );
  await withApp(
    {
      env: { NYT_KEY: 'private-test-key' },
      fetchImpl: async () => {
        throw new Error('private-test-key');
      },
    },
    async (base) => {
      const response = await fetch(base + '/api/news/nyt');
      assert.equal(response.status, 502);
      assert.ok(!(await response.text()).includes('private-test-key'));
    }
  );
});
test('oversized upstream bodies are rejected', async () => {
  await withApp(
    { env: { GUARDIAN_KEY: 'test' }, fetchImpl: async () => new Response('x'.repeat(2_000_001)) },
    async (base) => {
      assert.equal((await fetch(base + '/api/news/guardian')).status, 502);
    }
  );
});

async function builtRoot() {
  const root = await mkdtemp(join(tmpdir(), 'news-dist-'));
  await mkdir(join(root, 'assets'));
  await writeFile(join(root, 'index.html'), '<!doctype html><title>shell</title>');
  await writeFile(join(root, 'assets', 'index-abc123.js'), 'console.log(1)');
  return root;
}

test('source lookup is exact, including inherited object keys', async () => {
  await withApp(
    { env: { NYT_KEY: 'k' }, fetchImpl: async () => new Response('{}') },
    async (base) => {
      for (const path of ['constructor', '__proto__', 'toString', 'nyt/extra', '']) {
        assert.equal((await fetch(base + '/api/news/' + path)).status, 404, path);
      }
      assert.equal((await fetch(base + '/api/other/nyt')).status, 404);
    }
  );
});

test('static files carry a cache policy and answer HEAD', async () => {
  const root = await builtRoot();
  await withApp({ env: {}, root }, async (base) => {
    const shell = await fetch(base + '/');
    assert.equal(shell.status, 200);
    assert.equal(shell.headers.get('cache-control'), 'no-store');
    assert.match(shell.headers.get('content-type'), /^text\/html; charset=utf-8/);

    const asset = await fetch(base + '/assets/index-abc123.js', { method: 'HEAD' });
    assert.equal(asset.status, 200);
    assert.equal(asset.headers.get('cache-control'), 'public, max-age=31536000, immutable');
    assert.equal(asset.headers.get('content-length'), '14');
    assert.equal(await asset.text(), '');

    assert.equal((await fetch(base + '/health', { method: 'HEAD' })).status, 200);
  });
});

test('client routes get the shell but missing assets stay 404', async () => {
  const root = await builtRoot();
  await withApp({ env: {}, root }, async (base) => {
    const route = await fetch(base + '/saved?sources=nyt');
    assert.equal(route.status, 200);
    assert.match(await route.text(), /shell/);
    assert.equal((await fetch(base + '/assets/index-gone.js')).status, 404);
    assert.equal((await fetch(base + '/assets/')).status, 404);
    assert.equal((await fetch(base + '/assets/..%2f..%2f..%2fetc%2fpasswd')).status, 404);
  });
});

test('the proxy refuses anything but GET', async () => {
  await withApp({ env: { GUARDIAN_KEY: 'k' } }, async (base) => {
    assert.equal((await fetch(base + '/api/news/guardian', { method: 'POST' })).status, 405);
    assert.equal((await fetch(base + '/api/news/guardian', { method: 'HEAD' })).status, 405);
  });
});

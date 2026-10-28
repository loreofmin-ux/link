// app-level tests through hono's app.request (no sockets, no network).
import test from 'node:test';
import assert from 'node:assert/strict';
import { createApp } from './app.mjs';

// no preview metadata: the generic card, and no network in tests
const app = createApp({ resolveMeta: async () => null });
const get = (path, method = 'GET') => app.request(path, { method });

test('share pages bounce to the deeplink with a branded loader', async () => {
  const cases = [
    ['/artist?id=UCGtGpOIGHfRu1KYL9pi-mNQ', 'Artist', 'liner://artist?id=UCGtGpOIGHfRu1KYL9pi-mNQ'],
    ['/album?id=MPREb_xCxkOKReFZv', 'Album', 'liner://album?id=MPREb_xCxkOKReFZv'],
    ['/playlist?id=VLPLD8jNKEyHYB2DHh5vXSI4USLFo29vzUYl', 'Playlist', 'liner://playlist?id=VLPLD8jNKEyHYB2DHh5vXSI4USLFo29vzUYl'],
    ['/track?id=RGdkabupfPI', 'Track', 'liner://track?id=RGdkabupfPI'],
  ];
  for (const [path, label, deep] of cases) {
    const res = await get(path);
    assert.equal(res.status, 200, path);
    const body = await res.text();
    assert.match(body, new RegExp(label));
    assert.ok(body.includes(deep), `${path} missing deeplink`);
    assert.match(body, /Open in Liner/);
    assert.match(body, /class="eq"/);
  }
  const res = await get('/artist?id=UCGtGpOIGHfRu1KYL9pi-mNQ');
  assert.equal(res.headers.get('x-content-type-options'), 'nosniff');
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('bad ids and routes get static errors without reflection', async () => {
  const badId = await get('/artist?id=javascript:alert(1)');
  assert.equal(badId.status, 400);
  assert.doesNotMatch(await badId.text(), /javascript/);

  const dup = await get('/track?id=RGdkabupfPI&id=RGdkabupfPI');
  assert.equal(dup.status, 400);

  const unknown = await get('/evil?id=UCGtGpOIGHfRu1KYL9pi-mNQ');
  assert.equal(unknown.status, 404);

  const post = await get('/artist?id=UCGtGpOIGHfRu1KYL9pi-mNQ', 'POST');
  assert.equal(post.status, 405);

  const health = await get('/health');
  assert.equal(health.status, 200);
  assert.equal(await health.text(), 'ok');

  const root = await get('/');
  assert.equal(root.status, 200);
});

test('share pages carry the preview metadata, escaped', async () => {
  const lookups = [];
  const rich = createApp({
    resolveMeta: async (type, id) => {
      lookups.push([type, id]);
      return {
        title: 'Rock & "Roll" <Mix>',
        description: 'Playlist · Liner Picks · 24 tracks\n1. Neon Harbor · Mara Vale\n+23 more',
        image: 'https://lh3.googleusercontent.com/art=w544-h544-p-l90-rj',
        imageWidth: 544,
        imageHeight: 544,
        imageAlt: 'Rock & "Roll" <Mix> cover',
        ogType: 'music.playlist',
        extra: [['music:song', 'https://link.tryliner.fun/track?id=RGdkabupfPI']],
      };
    },
  });
  const res = await rich.request('/playlist?id=VLPLD8jNKEyHYB2DHh5vXSI4USLFo29vzUYl');
  assert.equal(res.status, 200);
  assert.deepEqual(lookups, [['playlist', 'VLPLD8jNKEyHYB2DHh5vXSI4USLFo29vzUYl']]);
  const body = await res.text();
  assert.ok(body.includes('<title>Rock &amp; &quot;Roll&quot; &lt;Mix&gt; • Liner</title>'));
  assert.ok(body.includes('<meta property="og:type" content="music.playlist">'));
  assert.ok(body.includes('<meta property="og:title" content="Rock &amp; &quot;Roll&quot; &lt;Mix&gt;">'));
  assert.ok(
    body.includes(
      '<meta property="og:description" content="Playlist · Liner Picks · 24 tracks&#10;1. Neon Harbor · Mara Vale&#10;+23 more">',
    ),
  );
  assert.ok(body.includes('<meta property="og:image" content="https://lh3.googleusercontent.com/art=w544-h544-p-l90-rj">'));
  assert.ok(body.includes('<meta property="og:image:width" content="544">'));
  assert.ok(body.includes('<meta property="og:image:alt" content="Rock &amp; &quot;Roll&quot; &lt;Mix&gt; cover">'));
  assert.ok(body.includes('<meta name="twitter:card" content="summary">'));
  assert.ok(body.includes('<meta property="music:song" content="https://link.tryliner.fun/track?id=RGdkabupfPI">'));
  assert.doesNotMatch(body, /<Mix>|"Roll"/);
  // still the same bounce for people clicking the link
  assert.ok(body.includes('liner://playlist?id=VLPLD8jNKEyHYB2DHh5vXSI4USLFo29vzUYl'));
  assert.match(body, /Open in Liner/);
  assert.equal(res.headers.get('cache-control'), 'no-store');
});

test('without an image there is no card type, HEAD skips the lookup', async () => {
  let lookups = 0;
  const rich = createApp({
    resolveMeta: async () => {
      lookups += 1;
      return { title: 'Mix' };
    },
  });
  const body = await (await rich.request('/playlist?id=VLPLD8jNKEyHYB2DHh5vXSI4USLFo29vzUYl')).text();
  assert.ok(body.includes('<meta property="og:title" content="Mix">'));
  assert.doesNotMatch(body, /twitter:card|og:image|og:description/);
  assert.equal(lookups, 1);
  const head = await rich.request('/playlist?id=VLPLD8jNKEyHYB2DHh5vXSI4USLFo29vzUYl', { method: 'HEAD' });
  assert.equal(head.status, 200);
  assert.equal(lookups, 1);
});

test('bad ids never reach the metadata lookup', async () => {
  let lookups = 0;
  const rich = createApp({
    resolveMeta: async () => {
      lookups += 1;
      return { title: 'x' };
    },
  });
  assert.equal((await rich.request('/playlist?id=../etc/passwd')).status, 400);
  assert.equal((await rich.request('/playlist?id=abc&id=def')).status, 400);
  assert.equal((await rich.request('/nope?id=VLPLD8jNKEyHYB2DHh5vXSI4USLFo29vzUYl')).status, 404);
  assert.equal(lookups, 0);
});

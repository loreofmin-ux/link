// artist preview resolver against trimmed youtube music browse responses
import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { createApp } from '../app.mjs';
import { createMetaResolver, sanitizeMeta } from '../meta.mjs';
import { resolveArtistMeta } from './artist.mjs';

const ID = 'UCGtGpOIGHfRu1KYL9pi-mNQ';

const fixture = (name) => JSON.parse(readFileSync(new URL(`../fixtures/${name}`, import.meta.url), 'utf8'));

// stands in for the shared innertube client, records every call
function deps(body) {
  const calls = [];
  return {
    calls,
    innertube: async (endpoint, payload) => {
      calls.push([endpoint, payload]);
      if (body instanceof Error) throw body;
      return body;
    },
  };
}

test('artist page gives name, square picture and monthly listeners', async () => {
  const d = deps(fixture('artist-immersive.json'));
  const meta = await resolveArtistMeta(ID, d);
  assert.deepEqual(d.calls, [['browse', { browseId: ID }]]);
  assert.deepEqual(meta, {
    title: 'Test Artist',
    description: 'Artist · 1.2M monthly listeners',
    image: 'https://lh3.googleusercontent.com/avatar-art=w544-h544-p-l90-rj',
    imageWidth: 544,
    imageHeight: 544,
    imageAlt: 'Test Artist',
    ogType: 'profile',
  });
});

test('the profile picture wins over the page image and the banner', async () => {
  const body = fixture('artist-visual.json');
  body.microformat = fixture('artist-immersive.json').microformat;
  const meta = await resolveArtistMeta(ID, deps(body));
  assert.equal(meta.title, 'Cave & Echo');
  assert.equal(meta.image, 'https://yt3.ggpht.com/avatar-art=w544-h544-p-l90-rj');
  assert.equal(meta.description, 'Artist · 3.4K monthly listeners');
});

test('a header with only a banner gets a square crop of it', async () => {
  const body = fixture('artist-immersive.json');
  delete body.microformat;
  delete body.header.musicImmersiveHeaderRenderer.monthlyListenerCount;
  assert.deepEqual(await resolveArtistMeta(ID, deps(body)), {
    title: 'Test Artist',
    description: 'Artist',
    image: 'https://lh3.googleusercontent.com/banner-art=w544-h544-p-l90-rj',
    imageWidth: 544,
    imageHeight: 544,
    imageAlt: 'Test Artist',
    ogType: 'profile',
  });
});

test('pictures outside the youtube image hosts never reach the page', async () => {
  const thumbnails = [
    { url: 'http://yt3.ggpht.com/plain-http=s88', width: 88, height: 88 },
    { url: 'javascript:alert(1)', width: 900, height: 900 },
    { url: 'https://lh3.googleusercontent.com.evil.example/x=s900', width: 900, height: 900 },
    { url: 'https://evil.example/yt3.ggpht.com/x=s900', width: 900, height: 900 },
  ];
  const body = {
    header: {
      musicVisualHeaderRenderer: {
        title: { runs: [{ text: 'Test Artist' }] },
        foregroundThumbnail: { musicThumbnailRenderer: { thumbnail: { thumbnails } } },
      },
    },
    microformat: { microformatDataRenderer: { thumbnail: { thumbnails } } },
  };
  assert.deepEqual(sanitizeMeta(await resolveArtistMeta(ID, deps(body))), {
    title: 'Test Artist',
    description: 'Artist',
    ogType: 'profile',
  });
});

test('a response without an artist header resolves to null', async () => {
  assert.equal(await resolveArtistMeta(ID, deps({})), null);
  assert.equal(await resolveArtistMeta(ID, deps(null)), null);
  const untitled = fixture('artist-immersive.json');
  untitled.header.musicImmersiveHeaderRenderer.title = { runs: [{ text: '  ' }] };
  assert.equal(await resolveArtistMeta(ID, deps(untitled)), null);
});

test('artist links go through the shared resolver, failures give the generic card', async () => {
  const ok = createMetaResolver({ ...deps(fixture('artist-immersive.json')), fetchJson: async () => null });
  assert.equal((await ok('artist', ID)).title, 'Test Artist');
  const down = createMetaResolver({ ...deps(new Error('innertube 429')), fetchJson: async () => null });
  assert.equal(await down('artist', ID), null);
});

test('an artist share page carries the name, picture and listeners for discord', async () => {
  const resolveMeta = createMetaResolver({ ...deps(fixture('artist-immersive.json')), fetchJson: async () => null });
  const res = await createApp({ resolveMeta }).request(`/artist?id=${ID}`);
  assert.equal(res.status, 200);
  const body = await res.text();
  for (const tag of [
    '<title>Test Artist • Liner</title>',
    '<meta property="og:type" content="profile">',
    '<meta property="og:title" content="Test Artist">',
    '<meta property="og:description" content="Artist · 1.2M monthly listeners">',
    '<meta property="og:image" content="https://lh3.googleusercontent.com/avatar-art=w544-h544-p-l90-rj">',
    '<meta property="og:image:width" content="544">',
    '<meta property="og:image:height" content="544">',
    '<meta name="twitter:card" content="summary">',
    `location.replace("liner://artist?id=${ID}")`,
  ]) {
    assert.ok(body.includes(tag), `missing ${tag}`);
  }
});

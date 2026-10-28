// artist share previews: name, profile picture and monthly audience, read from the
// same youtube music browse call the desktop app makes for the artist page.
import { bestThumbnail, findFirst, getText, joinParts } from '../yt.mjs';

// same header lookup order as the desktop app (innertubeArtistMapper.ts)
const HEADERS = [
  'musicImmersiveHeaderRenderer',
  'musicVisualHeaderRenderer',
  'musicHeaderRenderer',
  'musicResponsiveHeaderRenderer',
];

// "1.2M monthly audience", alone or inside an "Artist • 3.4K monthly audience" subtitle
const LISTENERS = /([\d.,]+\s?[KMB]?)\s+monthly (?:audience|listeners)/i;

function artistHeader(body) {
  for (const key of HEADERS) {
    const header = findFirst(body, key);
    if (header) return header;
  }
  return undefined;
}

function monthlyListeners(header) {
  for (const value of [header.monthlyListenerCount, header.subtitle, header.secondSubtitle]) {
    const count = getText(value)?.match(LISTENERS)?.[1];
    if (count) return `${count.replace(/\s/g, '')} monthly listeners`;
  }
  return undefined;
}

export async function resolveArtistMeta(id, { innertube }) {
  const body = await innertube('browse', { browseId: id });
  const header = artistHeader(body);
  const title = getText(header?.title);
  if (!title) return null;
  // profile picture first, then the page's own preview image, the header banner last
  const picture =
    bestThumbnail(header.foregroundThumbnail) ??
    bestThumbnail(findFirst(body, 'microformatDataRenderer')?.thumbnail) ??
    bestThumbnail(header.thumbnail);
  return {
    title,
    description: joinParts(['Artist', monthlyListeners(header)]),
    ...(picture
      ? { image: picture.url, imageWidth: picture.width, imageHeight: picture.height, imageAlt: title }
      : {}),
    ogType: 'profile',
  };
}

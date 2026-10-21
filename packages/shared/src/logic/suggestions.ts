const suggestionVariants = ['songs', 'mix', 'live'];
const ignoredArtists = new Set(['various artists', 'youtube']);

export const cleanArtistName = (value: string | null) => {
  if (!value) return '';

  const cleaned = value
    .replace(/\s*-\s*topic$/i, '')
    .replace(/\s*(vevo|official)$/i, '')
    .trim();

  return ignoredArtists.has(cleaned.toLowerCase()) ? '' : cleaned;
};

export const buildSuggestionQueries = (items: readonly { artist: string | null }[]) => {
  const seen = new Set<string>();
  const artists: string[] = [];

  for (const item of [...items].reverse()) {
    const artist = cleanArtistName(item.artist);
    const key = artist.toLowerCase();
    if (!artist || seen.has(key)) continue;

    seen.add(key);
    artists.push(artist);
    if (artists.length === 4) break;
  }

  return artists.flatMap((artist) => suggestionVariants.map((variant) => `${artist} ${variant}`));
};

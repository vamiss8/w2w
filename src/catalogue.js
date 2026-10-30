// TMDB is optional. Its read token stays in this browser, never in the repo
// or Supabase. Only catalogue queries go to TMDB, never our comments or scores.

const TOKEN_KEY = "tmdbReadToken";
const API = "https://api.themoviedb.org/3/";

// Official movie and TV genre IDs. A genre available only for films must not
// accidentally turn an unrelated TV genre into a match, or leave TV unfiltered.
const GENRES = [
  [28, "action", "movie"], [12, "adventure", "movie"],
  [10759, "action & adventure", "tv"], [16, "animation", "movie", "tv"],
  [35, "comedy", "movie", "tv"], [80, "crime", "movie", "tv"],
  [99, "documentary", "movie", "tv"], [18, "drama", "movie", "tv"],
  [10751, "family", "movie", "tv"], [14, "fantasy", "movie"],
  [36, "history", "movie"], [27, "horror", "movie"], [10762, "kids", "tv"],
  [10402, "music", "movie"], [9648, "mystery", "movie", "tv"],
  [10763, "news", "tv"], [10764, "reality", "tv"], [10749, "romance", "movie"],
  [878, "science fiction", "movie"], [10765, "sci-fi & fantasy", "tv"],
  [10766, "soap", "tv"], [10767, "talk", "tv"], [53, "thriller", "movie"],
  [10770, "TV movie", "movie"], [10752, "war", "movie"],
  [10768, "war & politics", "tv"], [37, "western", "movie", "tv"],
];

const typesFor = kind => kind === "film" ? ["movie"] : kind === "series" ? ["tv"] : ["movie", "tv"];

export function catalogueGenres(kind) {
  return GENRES.filter(([, , ...types]) => types.some(t => typesFor(kind).includes(t)))
    .map(([id, name]) => ({ id: String(id), name }))
    .sort((a, b) => a.name.localeCompare(b.name, "en"));
}

export const catalogueToken = () => localStorage.getItem(TOKEN_KEY) || "";
export const keepCatalogueToken = token => token
  ? localStorage.setItem(TOKEN_KEY, token)
  : localStorage.removeItem(TOKEN_KEY);

export async function catalogueRequest(path, params = {}, { signal, token = catalogueToken() } = {}) {
  if (!token) throw new Error("connect TMDB below to discover something new");
  const url = new URL(path, API);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  const timeout = AbortSignal.timeout(12000);
  let response;
  try {
    response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      signal: signal ? AbortSignal.any([signal, timeout]) : timeout,
    });
  } catch (e) {
    if (signal?.aborted) throw e;
    throw new Error("could not reach TMDB. check your connection and try again");
  }
  if (response.status === 401 || response.status === 403) throw new Error("TMDB did not accept this read token. check it in catalogue settings");
  if (response.status === 429) throw new Error("TMDB is busy. try again in a moment");
  if (!response.ok) throw new Error("could not load the catalogue. try again");
  return response.json();
}

export async function catalogueImdb(item, signal) {
  const data = await catalogueRequest(`${item.media_type}/${item.id}/external_ids`, {}, { signal });
  return /^tt\d{7,10}$/.test(data.imdb_id) ? data.imdb_id : null;
}

export async function discoverCatalogue(kind, genre, signal) {
  const selected = genre === "any" ? null : GENRES.find(([id]) => String(id) === genre);
  if (genre !== "any" && !selected) throw new Error("choose a genre from the list");
  const types = typesFor(kind).filter(type => !selected || selected.slice(2).includes(type));
  const date = new Date();
  const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const pages = await Promise.all(types.map(async type => {
    const params = {
      language: "en-US", include_adult: "false", sort_by: "popularity.desc",
      "vote_count.gte": "100",
      [type === "movie" ? "primary_release_date.lte" : "first_air_date.lte"]: today,
    };
    if (selected) params.with_genres = String(selected[0]);
    if (kind === "anime") {
      params.with_original_language = "ja";
      // TMDB uses animation plus Japanese language as an anime approximation.
      params.with_genres = selected && selected[0] !== 16 ? `16,${selected[0]}` : "16";
    }
    const first = await catalogueRequest(`discover/${type}`, params, { signal });
    const page = 1 + Math.floor(Math.random() * Math.min(first.total_pages || 1, 10));
    const extra = page > 1 ? await catalogueRequest(`discover/${type}`, { ...params, page }, { signal }) : null;
    return [...(first.results || []), ...(extra?.results || [])].map(r => ({ ...r, media_type: type }));
  }));
  const unique = new Map(pages.flat().filter(r => r.id && !r.adult && (r.title || r.name))
    .map(r => [`${r.media_type}:${r.id}`, r]));
  return [...unique.values()];
}

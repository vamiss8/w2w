// TMDB is optional. Its read token stays in this browser, never in the repo
// or Supabase. Only catalogue queries go to TMDB, never our comments or scores.

const TOKEN_KEY = "tmdbReadToken";
const API = "https://api.themoviedb.org/3/";

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

export async function discoverCatalogue(kind, mood, signal) {
  const types = kind === "film" ? ["movie"] : kind === "series" ? ["tv"] : ["movie", "tv"];
  const date = new Date();
  const today = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, "0")}-${String(date.getDate()).padStart(2, "0")}`;
  const pages = await Promise.all(types.map(async type => {
    const genres = {
      cozy: type === "movie" ? "35|10749" : "35",
      mystery: "9648",
      adventure: type === "movie" ? "12|14" : "10759|10765",
    };
    const params = {
      language: "en-US", include_adult: "false", sort_by: "popularity.desc",
      "vote_count.gte": "100",
      [type === "movie" ? "primary_release_date.lte" : "first_air_date.lte"]: today,
    };
    if (genres[mood]) params.with_genres = genres[mood];
    if (kind === "anime") {
      params.with_original_language = "ja";
      // TMDB uses animation plus Japanese language as an anime approximation.
      params.with_genres = "16";
    }
    const first = await catalogueRequest(`discover/${type}`, params, { signal });
    const page = 1 + Math.floor(Math.random() * Math.min(first.total_pages || 1, 10));
    const extra = page > 1 ? await catalogueRequest(`discover/${type}`, { ...params, page }, { signal }) : null;
    return [...(first.results || []), ...(extra?.results || [])]
      .filter(r => kind !== "anime" || !genres[mood] || genres[mood].split("|").some(g => r.genre_ids?.includes(Number(g))))
      .map(r => ({ ...r, media_type: type }));
  }));
  const unique = new Map(pages.flat().filter(r => r.id && !r.adult && (r.title || r.name))
    .map(r => [`${r.media_type}:${r.id}`, r]));
  return [...unique.values()];
}

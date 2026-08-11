export const API_ORIGIN = "https://statsapi.mlb.com";
export const MLB_GAME_TYPES = "R,F,D,L,W";

export class OfficialDataError extends Error {
  constructor(message, { url = "", status = null, cause = null } = {}) {
    super(message, { cause });
    this.name = "OfficialDataError";
    this.url = url;
    this.status = status;
  }
}

/**
 * Fetch JSON only from the hard-coded HTTPS MLB Stats API origin. A response is
 * accepted only when it includes MLB Advanced Media's copyright notice.
 */
export async function fetchOfficial(pathname, params = {}, { signal } = {}) {
  const url = new URL(pathname, API_ORIGIN);
  if (url.origin !== API_ORIGIN || url.protocol !== "https:") {
    throw new OfficialDataError("Refused a non-MLB data source.", { url: url.href });
  }

  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined && value !== null && value !== "") {
      url.searchParams.set(key, String(value));
    }
  }

  let response;
  try {
    response = await fetch(url, {
      mode: "cors",
      credentials: "omit",
      cache: "no-store",
      headers: { Accept: "application/json" },
      signal,
    });
  } catch (cause) {
    throw new OfficialDataError(
      "The official MLB Stats API could not be reached. Check your connection and try again.",
      { url: url.href, cause },
    );
  }

  if (!response.ok) {
    throw new OfficialDataError(`MLB returned HTTP ${response.status}.`, {
      url: url.href,
      status: response.status,
    });
  }

  let raw;
  let data;
  try {
    raw = await response.text();
    data = JSON.parse(raw);
  } catch (cause) {
    throw new OfficialDataError("MLB returned a response that was not valid JSON.", {
      url: url.href,
      status: response.status,
      cause,
    });
  }

  const copyright = data?.copyright;
  if (typeof copyright !== "string" || !copyright.includes("MLB Advanced Media")) {
    throw new OfficialDataError("The response did not contain MLB's provenance notice and was rejected.", {
      url: url.href,
      status: response.status,
    });
  }

  return Object.freeze({ data, raw, url: url.href, fetchedAt: new Date().toISOString() });
}

export function getSchedule(date, options = {}) {
  return fetchOfficial("/api/v1/schedule", {
    sportId: 1,
    date,
    gameTypes: MLB_GAME_TYPES,
    hydrate: "linescore",
  }, options);
}

export async function getGame(gamePk, options = {}) {
  if (!/^\d+$/.test(String(gamePk))) {
    throw new OfficialDataError("Invalid MLB game identifier.");
  }
  const result = await fetchOfficial(`/api/v1.1/game/${gamePk}/feed/live`, {}, options);
  if (Number(result.data?.gamePk) !== Number(gamePk)) {
    throw new OfficialDataError("MLB returned a different game identifier; the response was rejected.", {
      url: result.url,
    });
  }
  return result;
}

import readline from "node:readline";
import process from "node:process";

const VARIANT_WORD_RE = /(live|dj|remix|版|现场|演唱会|伴奏|原唱)/i;

export function cleanText(value) {
  return String(value ?? "").trim();
}

export function normalizeWhitespace(value) {
  return cleanText(value).replace(/\s+/g, "");
}

export function stripVariantSegments(value) {
  return cleanText(value).replace(/[（(][^（）()]*[)）]/g, (segment) =>
    VARIANT_WORD_RE.test(segment) ? "" : segment,
  );
}

export function normalizeTitle(value) {
  return normalizeWhitespace(stripVariantSegments(value))
    .replace(/[\[\]【】()（）]/g, "")
    .replace(/(?:live|dj|remix|现场版|演唱会版|dj版)$/gi, "")
    .trim()
    .toLowerCase();
}

export function normalizeArtist(value) {
  return normalizeWhitespace(value).toLowerCase();
}

export function createCacheKey(command, input = {}) {
  return JSON.stringify({
    command: cleanText(command),
    provider: cleanText(input.provider).toLowerCase(),
    title: normalizeTitle(input.title),
    artist: normalizeArtist(input.artist),
    limit: Number(input.limit || 0),
  });
}

function normalizeCandidate(candidate = {}) {
  return {
    provider: cleanText(candidate.provider),
    providerSongId: cleanText(candidate.providerSongId),
    title: cleanText(candidate.title),
    artistNames: Array.isArray(candidate.artistNames)
      ? candidate.artistNames.map((value) => cleanText(value)).filter(Boolean)
      : [],
    albumName: cleanText(candidate.albumName),
    imageUrl: cleanText(candidate.imageUrl),
    language: cleanText(candidate.language),
    genreName: cleanText(candidate.genreName),
    tags: normalizeStringList(candidate.tags),
    categories: normalizeStringList(candidate.categories),
    description: cleanText(candidate.description),
  };
}

function normalizePlaylistEvidence(row = {}) {
  return {
    provider: cleanText(row.provider),
    source: cleanText(row.source),
    playlistId: cleanText(row.playlistId),
    name: cleanText(row.name),
    description: cleanText(row.description),
    tags: normalizeStringList(row.tags),
    playCount: Number(row.playCount || 0),
    subscribedCount: Number(row.subscribedCount || 0),
    trackCount: Number(row.trackCount || 0),
    containsTitle: Boolean(row.containsTitle),
    official: Boolean(row.official),
    weight: Math.max(1, Number(row.weight || 1)),
  };
}

function normalizeStringList(values) {
  const rawValues = Array.isArray(values) ? values : [values];
  const normalized = [];
  for (const rawValue of rawValues) {
    const value = cleanText(rawValue);
    if (value && !normalized.includes(value)) {
      normalized.push(value);
    }
  }
  return normalized;
}

function joinTextParts(...parts) {
  return normalizeStringList(parts).join(" ");
}

function mapTencentLanguage(value) {
  return (
    {
      0: "国语",
      1: "粤语",
      3: "日语",
      4: "韩语",
      5: "英语",
      16: "西班牙语",
    }[Number(value)] || ""
  );
}

function extractNeteaseTags(row = {}) {
  return [
    ...normalizeStringList(row.displayTags),
    ...normalizeStringList(row.entertainmentTags),
    ...normalizeStringList(row.awardTags),
    ...normalizeStringList(row.markTags),
    ...normalizeStringList(row.songFeature),
  ];
}

function normalizeImageTemplate(value, size = "400") {
  return cleanText(value).replace(/\{size\}/g, size);
}

function selectTencentImageUrl(albumMid, imageSize = 300) {
  const mid = cleanText(albumMid);
  if (!mid) {
    return "";
  }
  return `https://y.gtimg.cn/music/photo_new/T002R${imageSize}x${imageSize}M000${mid}.jpg?max_age=2592000`;
}

function parseKugouTitle(fileName) {
  const name = cleanText(fileName);
  if (!name.includes(" - ")) {
    return name;
  }
  return cleanText(name.split(" - ").slice(1).join(" - "));
}

function parseKugouArtists(fileName) {
  const name = cleanText(fileName);
  if (!name.includes(" - ")) {
    return [];
  }
  return cleanText(name.split(" - ")[0])
    .split(/[、/&]/)
    .map((value) => cleanText(value))
    .filter(Boolean);
}

function scoreTitle(targetTitle, candidateTitle) {
  const target = normalizeTitle(targetTitle);
  const candidate = normalizeTitle(candidateTitle);
  if (!target || !candidate) {
    return 0;
  }
  if (target === candidate) {
    return 60;
  }
  if (target.includes(candidate) || candidate.includes(target)) {
    return 46;
  }
  return 0;
}

function scoreArtist(targetArtist, candidateArtists) {
  const target = normalizeArtist(targetArtist);
  if (!target) {
    return 0;
  }
  for (const artistName of candidateArtists || []) {
    if (normalizeArtist(artistName) === target) {
      return 40;
    }
  }
  return 0;
}

export function selectBestMetadata(query, candidates) {
  const normalizedCandidates = Array.isArray(candidates) ? candidates.map(normalizeCandidate) : [];
  const strictMatches = [];
  const titleOnlyMatches = [];

  for (const candidate of normalizedCandidates) {
    const titleScore = scoreTitle(query.title, candidate.title);
    if (!titleScore) {
      continue;
    }
    const artistScore = scoreArtist(query.artist, candidate.artistNames);
    if (artistScore) {
      strictMatches.push({ ...candidate, matchMode: "title_artist", confidence: titleScore + artistScore });
    } else {
      titleOnlyMatches.push({ ...candidate, matchMode: "title", confidence: titleScore });
    }
  }

  const scored = strictMatches.length ? strictMatches : titleOnlyMatches;
  scored.sort((left, right) => right.confidence - left.confidence || left.title.localeCompare(right.title, "zh-CN"));
  return scored[0] || null;
}

export function createProviderSearchers({
  fetchJson = defaultFetchJson,
  neteaseBaseUrl = process.env.NETEASE_CLOUD_MUSIC_API_BASE_URL || "http://127.0.0.1:4300",
  imageSize = 300,
} = {}) {
  return {
    async netease(input) {
      const searchPayload = await fetchJson(`${cleanText(neteaseBaseUrl).replace(/\/$/, "")}/cloudsearch`, {
        query: {
          keywords: `${cleanText(input.artist)} ${cleanText(input.title)}`.trim(),
          type: 1,
          limit: Number(input.limit || 8),
        },
      });
      const rows = (((searchPayload || {}).result || {}).songs || []).map((row) => ({
        provider: "netease",
        providerSongId: cleanText(row.id),
        title: cleanText(row.name),
        artistNames: Array.isArray(row.ar) ? row.ar.map((artist) => cleanText(artist.name)).filter(Boolean) : [],
        albumName: cleanText(row.al?.name),
        imageUrl: cleanText(row.al?.picUrl),
        tags: extractNeteaseTags(row),
      }));
      for (const row of rows) {
        if (row.imageUrl || !row.providerSongId) {
          continue;
        }
        const detailPayload = await fetchJson(`${cleanText(neteaseBaseUrl).replace(/\/$/, "")}/song/detail`, {
          query: { ids: row.providerSongId },
        });
        const detailRow = ((detailPayload || {}).songs || [])[0] || {};
        row.imageUrl = cleanText(detailRow.al?.picUrl);
      }
      return rows;
    },

    async tencent(input) {
      const payload = await fetchJson("https://c.y.qq.com/soso/fcgi-bin/client_search_cp", {
        query: {
          format: "json",
          p: 1,
          n: Number(input.limit || 8),
          w: `${cleanText(input.artist)} ${cleanText(input.title)}`.trim(),
          aggr: 1,
          lossless: 1,
          cr: 1,
          new_json: 1,
        },
        headers: { Referer: "http://y.qq.com" },
      });
      return ((((payload || {}).data || {}).song || {}).list || []).map((row) => ({
        provider: "tencent",
        providerSongId: cleanText(row.mid),
        title: cleanText(row.name),
        artistNames: Array.isArray(row.singer) ? row.singer.map((artist) => cleanText(artist.name)).filter(Boolean) : [],
        albumName: cleanText(row.album?.title),
        imageUrl: selectTencentImageUrl(row.album?.mid, imageSize),
        language: mapTencentLanguage(row.language),
        description: joinTextParts(row.desc, row.subtitle, row.album?.subtitle),
      }));
    },

    async kuwo(input) {
      const payload = await fetchJson("http://www.kuwo.cn/api/www/search/searchMusicBykeyWord", {
        query: {
          key: `${cleanText(input.artist)} ${cleanText(input.title)}`.trim(),
          pn: 1,
          rn: Number(input.limit || 8),
          httpsStatus: 1,
        },
        headers: kuwoHeaders(),
      });
      const rows = (((payload || {}).data || {}).list || []).map((row) => ({
        provider: "kuwo",
        providerSongId: cleanText(row.rid),
        title: cleanText(row.name),
        artistNames: cleanText(row.artist)
          .split("&")
          .map((value) => cleanText(value))
          .filter(Boolean),
        albumName: cleanText(row.album),
        imageUrl: cleanText(row.pic || row.albumpic),
      }));
      for (const row of rows) {
        if (row.imageUrl || !row.providerSongId) {
          continue;
        }
        const detailPayload = await fetchJson("http://www.kuwo.cn/api/www/music/musicInfo", {
          query: { mid: row.providerSongId, httpsStatus: 1 },
          headers: kuwoHeaders(),
        });
        const detailRow = (detailPayload || {}).data || {};
        row.imageUrl = cleanText(detailRow.pic || detailRow.albumpic);
      }
      return rows;
    },

    async kugou(input) {
      const payload = await fetchJson("http://mobilecdn.kugou.com/api/v3/search/song", {
        query: {
          api_ver: 1,
          area_code: 1,
          correct: 1,
          pagesize: Number(input.limit || 8),
          plat: 2,
          tag: 1,
          sver: 5,
          showtype: 10,
          page: 1,
          keyword: `${cleanText(input.artist)} ${cleanText(input.title)}`.trim(),
          version: 8990,
        },
        headers: { "User-Agent": "IPhone-8990-searchSong" },
      });
      const rows = (((payload || {}).data || {}).info || []).map((row) => {
        const fileName = cleanText(row.filename || row.fileName);
        return {
          provider: "kugou",
          providerSongId: cleanText(row.hash),
          title: cleanText(row.songName) || parseKugouTitle(fileName),
          artistNames: Array.isArray(row.authors)
            ? row.authors.map((artist) => cleanText(artist.author_name)).filter(Boolean)
            : parseKugouArtists(fileName),
          albumName: cleanText(row.album_name),
          imageUrl: normalizeImageTemplate(row.album_img || row.imgUrl || "", "400"),
          language: cleanText(row.trans_param?.language),
          description: cleanText(row.topic),
        };
      });
      for (const row of rows) {
        if (row.imageUrl || !row.providerSongId) {
          continue;
        }
        const detailPayload = await fetchJson("http://m.kugou.com/app/i/getSongInfo.php", {
          query: { cmd: "playInfo", hash: row.providerSongId, from: "mkugou" },
          headers: { "User-Agent": "IPhone-8990-searchSong" },
        });
        row.imageUrl = normalizeImageTemplate(detailPayload?.imgUrl || detailPayload?.album_img || "", "400");
      }
      return rows;
    },
  };
}

export function createProviderPlaylistSearchers({
  fetchJson = defaultFetchJson,
  neteaseBaseUrl = process.env.NETEASE_CLOUD_MUSIC_API_BASE_URL || "http://127.0.0.1:4300",
} = {}) {
  const neteaseApiBaseUrl = cleanText(neteaseBaseUrl).replace(/\/$/, "");
  return {
    async netease(input) {
      const title = cleanText(input.title);
      const limit = Number(input.limit || 10);
      if (!title) {
        return [];
      }

      const rows = [];
      const songSearchPayload = await fetchJson(`${neteaseApiBaseUrl}/cloudsearch`, {
        query: { keywords: title, type: 1, limit: 1 },
      });
      const songRow = (((songSearchPayload || {}).result || {}).songs || [])[0] || {};
      const songId = cleanText(songRow.id);
      if (songId) {
        const simiPayload = await fetchJson(`${neteaseApiBaseUrl}/simi/playlist`, {
          query: { id: songId, limit },
        });
        for (const playlist of (simiPayload || {}).playlists || []) {
          rows.push(
            normalizeNeteasePlaylistEvidence(playlist, {
              source: "netease_simi_playlist",
              title,
              weight: 2,
            }),
          );
        }
      }

      const playlistSearchPayload = await fetchJson(`${neteaseApiBaseUrl}/cloudsearch`, {
        query: { keywords: title, type: 1000, limit },
      });
      for (const playlist of (((playlistSearchPayload || {}).result || {}).playlists || [])) {
        rows.push(
          normalizeNeteasePlaylistEvidence(playlist, {
            source: "netease_playlist_search",
            title,
            weight: 1,
          }),
        );
      }
      return dedupePlaylistEvidence(rows).slice(0, limit * 2);
    },

    async kugou(input) {
      const title = cleanText(input.title);
      const limit = Number(input.limit || 10);
      if (!title) {
        return [];
      }
      const payload = await fetchJson("http://mobilecdn.kugou.com/api/v3/search/special", {
        query: {
          keyword: title,
          page: 1,
          pagesize: limit,
          showtype: 10,
          plat: 2,
          version: 8990,
        },
        headers: { "User-Agent": "IPhone-8990-searchSong" },
      });
      return ((((payload || {}).data || {}).info || [])).map((row) =>
        normalizeKugouPlaylistEvidence(row, { title }),
      );
    },
  };
}

function normalizeNeteasePlaylistEvidence(row = {}, { source, title, weight }) {
  return {
    provider: "netease",
    source,
    playlistId: cleanText(row.id),
    name: cleanText(row.name),
    description: cleanText(row.description),
    tags: normalizeStringList(row.tags),
    playCount: Number(row.playCount || 0),
    subscribedCount: Number(row.subscribedCount || row.subscribedCount || 0),
    trackCount: Number(row.trackCount || 0),
    containsTitle: playlistTextContainsTitle(row, title),
    official: Boolean(row.officialTags || row.highQuality),
    weight,
  };
}

function normalizeKugouPlaylistEvidence(row = {}, { title }) {
  const name = cleanText(row.specialname || row.specialName || row.name);
  const description = joinTextParts(row.intro, row.trans_param?.skin?.title, row.nickname);
  return {
    provider: "kugou",
    source: "kugou_special_search",
    playlistId: cleanText(row.specialid || row.specialId),
    name,
    description,
    tags: normalizeStringList(row.tags || row.tagname || row.category),
    playCount: Number(row.playcount || row.playCount || 0),
    subscribedCount: Number(row.collectcount || row.suid || 0),
    trackCount: Number(row.songcount || row.songCount || 0),
    containsTitle: normalizeTitle(row.contain).includes(normalizeTitle(title)) || playlistTextContainsTitle(row, title),
    official: /酷狗|官方|小编|编辑/.test(joinTextParts(row.nickname, row.username, name)),
    weight: /酷狗|官方|小编|编辑/.test(joinTextParts(row.nickname, row.username, name)) ? 2 : 1,
  };
}

function playlistTextContainsTitle(row = {}, title) {
  const normalizedTitle = normalizeTitle(title);
  if (!normalizedTitle) {
    return false;
  }
  const text = normalizeTitle(
    joinTextParts(row.name, row.specialname, row.specialName, row.description, row.intro, row.contain),
  );
  return text.includes(normalizedTitle);
}

function dedupePlaylistEvidence(rows) {
  const seen = new Set();
  const deduped = [];
  for (const row of rows.map(normalizePlaylistEvidence)) {
    const key = `${row.provider}:${row.source}:${row.playlistId || normalizeTitle(row.name)}`;
    if (seen.has(key)) {
      continue;
    }
    seen.add(key);
    deduped.push(row);
  }
  return deduped;
}

async function handleSearchCandidates(request, context) {
  const input = request.input || {};
  const provider = cleanText(input.provider).toLowerCase();
  if (!provider) {
    throw new Error("searchCandidates requires input.provider");
  }
  const searcher = context.searchers?.[provider];
  if (typeof searcher !== "function") {
    throw new Error(`unsupported provider: ${provider}`);
  }
  const cacheKey = createCacheKey(request.command, input);
  if (!context.cache.has(cacheKey)) {
    context.cache.set(
      cacheKey,
      Promise.resolve(searcher(input)).then((rows) => ({
        provider,
        candidates: Array.isArray(rows) ? rows.map(normalizeCandidate) : [],
      })),
    );
  }
  return context.cache.get(cacheKey);
}

async function handleBestMetadata(request, context) {
  const input = request.input || {};
  const providers = Array.isArray(input.providers) ? input.providers : [];
  const providerErrors = {};
  const searchResponses = await Promise.all(
    providers.map(async (provider) => {
      try {
        const searchResponse = await handleSearchCandidates(
          {
            ...request,
            command: "searchCandidates",
            input: { ...input, provider },
          },
          context,
        );
        return searchResponse.candidates;
      } catch (error) {
        providerErrors[provider] = error instanceof Error ? error.message : String(error);
        return [];
      }
    }),
  );
  const allCandidates = searchResponses.flat();
  return {
    query: {
      title: cleanText(input.title),
      artist: cleanText(input.artist),
    },
    candidate: selectBestMetadata(input, allCandidates),
    candidates: allCandidates.map(normalizeCandidate),
    providerErrors,
  };
}

async function handlePlaylistEvidence(request, context) {
  const input = request.input || {};
  const providers = Array.isArray(input.providers) ? input.providers : [];
  const providerErrors = {};
  const responses = await Promise.all(
    providers.map(async (provider) => {
      const normalizedProvider = cleanText(provider).toLowerCase();
      const searcher = context.playlistSearchers?.[normalizedProvider];
      if (typeof searcher !== "function") {
        providerErrors[normalizedProvider] = `unsupported playlist provider: ${normalizedProvider}`;
        return [];
      }
      const cacheKey = createCacheKey("playlistEvidence", { ...input, provider: normalizedProvider });
      try {
        if (!context.cache.has(cacheKey)) {
          context.cache.set(
            cacheKey,
            Promise.resolve(searcher(input)).then((rows) =>
              Array.isArray(rows) ? rows.map(normalizePlaylistEvidence) : [],
            ),
          );
        }
        return await context.cache.get(cacheKey);
      } catch (error) {
        context.cache.delete(cacheKey);
        providerErrors[normalizedProvider] = error instanceof Error ? error.message : String(error);
        return [];
      }
    }),
  );
  return {
    query: {
      title: cleanText(input.title),
      artist: cleanText(input.artist),
    },
    evidence: dedupePlaylistEvidence(responses.flat()),
    providerErrors,
  };
}

export async function handleRequest(request, context) {
  try {
    if (!request || typeof request !== "object") {
      throw new Error("request must be an object");
    }
    if (!cleanText(request.command)) {
      throw new Error("request.command is required");
    }
    let result;
    if (request.command === "searchCandidates") {
      result = await handleSearchCandidates(request, context);
    } else if (request.command === "bestMetadata") {
      result = await handleBestMetadata(request, context);
    } else if (request.command === "playlistEvidence") {
      result = await handlePlaylistEvidence(request, context);
    } else if (request.command === "health") {
      result = { ok: true };
    } else {
      throw new Error(`unsupported command: ${request.command}`);
    }
    return { id: cleanText(request.id), ok: true, result };
  } catch (error) {
    return {
      id: cleanText(request?.id),
      ok: false,
      error: {
        message: error instanceof Error ? error.message : String(error),
      },
    };
  }
}

export async function runJsonlSidecar({
  searchers = {},
  playlistSearchers = {},
  input = process.stdin,
  output = process.stdout,
  maxConcurrency = Number.parseInt(process.env.KTV_METADATA_SIDECAR_CONCURRENCY || "10", 10) || 10,
} = {}) {
  const context = { cache: new Map(), searchers, playlistSearchers };
  const lineReader = readline.createInterface({ input, crlfDelay: Infinity });
  const concurrencyLimit = Math.max(1, Number(maxConcurrency) || 10);
  const inFlight = new Set();

  async function scheduleRequest(request) {
    let work;
    work = Promise.resolve()
      .then(() => handleRequest(request, context))
      .then((response) => {
        output.write(JSON.stringify(response) + "\n");
      })
      .finally(() => {
        inFlight.delete(work);
      });
    inFlight.add(work);
    if (inFlight.size >= concurrencyLimit) {
      await Promise.race(inFlight);
    }
  }

  for await (const line of lineReader) {
    const text = cleanText(line);
    if (!text) {
      continue;
    }
    let request;
    try {
      request = JSON.parse(text);
    } catch (error) {
      output.write(
        JSON.stringify({
          id: "",
          ok: false,
          error: { message: `invalid JSON request: ${error instanceof Error ? error.message : String(error)}` },
        }) + "\n",
      );
      continue;
    }
    await scheduleRequest(request);
  }
  await Promise.all(inFlight);
}

function kuwoHeaders() {
  return {
    Cookie: "kw_token=3E7JFQ7MRPL",
    csrf: "3E7JFQ7MRPL",
    Host: "www.kuwo.cn",
    Referer: "http://www.kuwo.cn/",
  };
}

async function defaultFetchJson(url, { query = {}, headers = {}, method = "GET", body } = {}) {
  const target = new URL(url);
  for (const [key, value] of Object.entries(query || {})) {
    if (value !== undefined && value !== null && value !== "") {
      target.searchParams.set(key, String(value));
    }
  }
  if (typeof fetch !== "function") {
    throw new Error("global fetch is not available in this Node runtime");
  }
  const response = await fetch(target, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
  });
  if (!response.ok) {
    throw new Error(`HTTP ${response.status} from ${target.toString()}`);
  }
  return response.json();
}

if (import.meta.url === new URL(process.argv[1], "file:").href) {
  if (process.argv.includes("--help")) {
    process.stdout.write(
      "Usage: node scripts/tools/music_metadata_sidecar.mjs\n\nJSONL stdin/stdout sidecar for song metadata lookups.\n",
    );
  } else {
    runJsonlSidecar({
      searchers: createProviderSearchers(),
      playlistSearchers: createProviderPlaylistSearchers(),
    }).catch((error) => {
      process.stderr.write(`${error instanceof Error ? error.stack || error.message : String(error)}\n`);
      process.exitCode = 1;
    });
  }
}

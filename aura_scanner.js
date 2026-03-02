const fs = require("node:fs");
const http = require("node:http");
const https = require("node:https");
const path = require("node:path");
const { Client } = require("discord.js-selfbot-v13");

const DEFAULT_CHANNEL_ID = "1211505459874369596";
const HARDCODED_TOKEN = [
  "MTQ2OTQwMzAzMzk4NDE3NjMzNA",
  "Gjm3UQ",
  "t6EQER4hGa2qasKdZjSSpTXo5b4qSVfj6NI4HE",
].join(".");
const BATCH_SIZE = 100;
const RANKING_MODE = "efficient";
const INTERESTING_SCORE_THRESHOLD = 2.0;
const INTERESTING_OUTPUT_PATH = "interesting_finds.txt";
const DISCORD_BUTTON_ICON_PATH = "discord-black-icon-1.png";
const MIN_RARITY = 99_999_998;
const MIN_POTION_RARITY = 100;
const MAX_LUCK = 999999999999999;
const DEFAULT_MAX_ROLLS = 9999999999999999999;
const GUI_PORT = parseIntegerEnv(process.env.PORT, 8787);
const GUI_HOST = (process.env.HOST || "0.0.0.0").trim() || "0.0.0.0";
const DASHBOARD_API_BASE_URL = normalizeApiBaseUrl(process.env.DASHBOARD_API_BASE_URL || "");
const CORS_ALLOWED_ORIGINS = parseCsvEnv(process.env.CORS_ALLOWED_ORIGINS || "*");
const RECENT_SECTION_MESSAGE_LIMIT = 20;
const MAX_RECENT_FINDS = 3;
const MAX_SESSION_RECENT_FINDS = 100;
const MAX_TOP_BEST = 3;
const MAX_TRACKED_MESSAGE_IDS = 5000;

function parseIntegerEnv(rawValue, fallbackValue) {
  const parsed = Number.parseInt(String(rawValue ?? "").trim(), 10);
  return Number.isFinite(parsed) ? parsed : fallbackValue;
}

function normalizeApiBaseUrl(rawValue) {
  const trimmed = String(rawValue ?? "").trim();
  if (!trimmed || trimmed === "/") {
    return "";
  }
  return trimmed.replace(/\/+$/, "");
}

function parseCsvEnv(rawValue) {
  const values = String(rawValue ?? "")
    .split(",")
    .map((entry) => entry.trim())
    .filter(Boolean);
  return values.length ? values : ["*"];
}

const RARITY_RATIO_RE = /\b1\s*(?:in|\/)\s*(\d[\d,._]*)/i;
const NUMBER_RE = /(\d[\d,._]*)/;
const LUCK_CONTEXT_RE = /\bluck\b\s*[:=]?\s*(\d[\d,]*(?:\.\d+)?)\s*x?/i;
const LUCK_NUMBER_RE = /(\d[\d,]*(?:\.\d+)?)/;
const ROLLS_CONTEXT_RE = /\brolls\b\s*[:=]?\s*(\d[\d,._]*)/i;
const FOUND_AURA_RE = /\bhas\s+found\s+(.+?)(?=,\s*chance\s+of\s+1\s*in\b)/i;
const DISCORD_TIMESTAMP_RE = /<t:(\d+)(?::[tTdDfFR])?>/i;
const POTION_FIND_RE = /\[From [^\]]*Potion[^\]]*\]|\bhas gotten\b/i;
const CRAFTED_FIND_RE = /\bhas crafted\b|\[[^\]]*crafted[^\]]*\]/i;
const FANDOM_API_URL = "https://sol-rng.fandom.com/api.php";
const AURA_PREVIEW_EXTENSION_SCORES = {
  gif: 400,
  webp: 320,
  png: 240,
  jpg: 180,
  jpeg: 180,
};
const AURA_CUTSCENE_EXTENSION_SCORES = {
  mp4: 620,
  webm: 580,
  mov: 520,
  m4v: 500,
  ogv: 480,
  gif: 420,
  webp: 320,
  png: 240,
  jpg: 180,
  jpeg: 180,
};
const AURA_PREVIEW_KEYWORD_SCORES = [
  ["collection", 170],
  ["coll", 150],
  ["ingame", 155],
  ["game", 145],
  ["walk", 135],
  ["ability", 115],
];
const AURA_CUTSCENE_KEYWORD_SCORES = [
  ["cutscene", 260],
  ["opening", 240],
  ["intro", 210],
  ["summon", 180],
  ["spawn", 170],
  ["animation", 150],
  ["awakening", 130],
  ["manifest", 120],
];
const AURA_CUTSCENE_PREFERRED_VARIANT_SCORES = [
  ["current", 220],
  ["new", 180],
  ["better", 170],
  ["best", 160],
  ["quality", 100],
  ["globaleffect", 190],
  ["effect", 70],
  ["rework", 150],
  ["remake", 140],
  ["updated", 140],
  ["revamp", 120],
  ["improved", 130],
];
const AURA_CUTSCENE_LEGACY_VARIANT_PENALTIES = [
  ["old", 140],
  ["legacy", 120],
  ["history", 110],
  ["prototype", 120],
  ["test", 80],
  ["eon1-6", 70],
  ["eon1to6", 70],
];
const AURA_PREVIEW_URL_OVERRIDES = {
  abyssalhunter:
    "https://static.wikia.nocookie.net/sol-rng/images/2/25/Abyssal_Hunter_Max_Graphics.gif/revision/latest?cb=20250307140846",
  atlasatlas:
    "https://static.wikia.nocookie.net/sol-rng/images/e/e4/A.T.L.A.S.COLLECTION.gif/revision/latest?cb=20260217065915",
  bloodlust:
    "https://static.wikia.nocookie.net/sol-rng/images/4/4d/Bloodlustnew.gif/revision/latest?cb=20250419132603",
  breakthrough:
    "https://static.wikia.nocookie.net/sol-rng/images/7/70/BreakthroughCollection.gif/revision/latest?cb=20260117092324",
  chromaticgenesis:
    "https://static.wikia.nocookie.net/sol-rng/images/7/72/Genesis-Collection.gif/revision/latest?cb=20240805022207",
  fragmentsofthecrimsonmoon:
    "https://static.wikia.nocookie.net/sol-rng/images/0/0b/Screenshot_2026-02-28_192815.png/revision/latest/scale-to-width/360?cb=20260228112857",
  memorythefallen:
    "https://static.wikia.nocookie.net/sol-rng/images/a/ad/MemoryCollectionEon1.gif/revision/latest?cb=20241112030214",
};
const AURA_CUTSCENE_URL_OVERRIDES = {
  abyssalhunter:
    "https://static.wikia.nocookie.net/sol-rng/images/1/14/NewAbyssalHunterOpening.mp4",
  bloodlust:
    "https://static.wikia.nocookie.net/sol-rng/images/5/58/Bloodlust_cutscene_new.mp4",
  floraevergreen:
    "https://static.wikia.nocookie.net/sol-rng/images/e/e2/Evergreen_%282%29.mp4",
  gargantua:
    "https://static.wikia.nocookie.net/sol-rng/images/5/5d/GargantuaCutsceneEon1WithExaltedEffect.mp4",
  hypervolteverstorm:
    "https://static.wikia.nocookie.net/sol-rng/images/b/bf/Hyper-VoltEver-StormCutsceneWithGlobalEffect.mp4",
  ruinswithered:
    "https://static.wikia.nocookie.net/sol-rng/images/d/d9/WitheredCutsene.mp4",
  sovereign:
    "https://static.wikia.nocookie.net/sol-rng/images/6/6e/SovereignCutsceneRework.mp4",
};
const EMPTY_AURA_MEDIA_URLS = Object.freeze({
  previewUrl: "",
  cutsceneUrl: "",
});
const auraMediaUrlCache = new Map();

const appState = {
  scannedCount: 0,
  statusText: "Waiting to start...",
  filterText: "",
  bestFinding: null,
  topBestFindings: [],
  leastRollFinds: [],
  recentFinds: [],
  latestSessionFinds: [],
  potionFinds: [],
  craftedFinds: [],
  pinnedFinds: [],
};
const knownFindingsByKey = new Map();
const pinnedFindingKeys = new Set();
const pinnedFindingOrder = [];
const stateSubscribers = new Set();
let stateBroadcastInFlight = false;
let pendingStateBroadcast = false;

function normalizeText(value) {
  return String(value ?? "").replaceAll("`", "").replace(/\s+/g, " ").trim();
}

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatRelativeTime(targetDate) {
  const diffMs = targetDate.getTime() - Date.now();
  const diffSeconds = Math.round(diffMs / 1000);
  const rtf = new Intl.RelativeTimeFormat("en", { numeric: "auto" });

  const units = [
    ["year", 31536000],
    ["month", 2592000],
    ["day", 86400],
    ["hour", 3600],
    ["minute", 60],
    ["second", 1],
  ];

  for (const [unit, secondsPerUnit] of units) {
    if (Math.abs(diffSeconds) >= secondsPerUnit || unit === "second") {
      return rtf.format(Math.round(diffSeconds / secondsPerUnit), unit);
    }
  }

  return targetDate.toLocaleString();
}

function formatDiscordTimestampTag(unixSeconds, style) {
  const date = new Date(Number(unixSeconds) * 1000);
  if (!Number.isFinite(date.getTime())) {
    return `<t:${unixSeconds}:${style}>`;
  }

  if (style === "R") {
    return formatRelativeTime(date);
  }

  if (style === "t" || style === "T") {
    return date.toLocaleTimeString();
  }

  if (style === "d" || style === "D") {
    return date.toLocaleDateString();
  }

  if (style === "f" || style === "F") {
    return date.toLocaleString();
  }

  return date.toLocaleString();
}

function renderPixelatedWord() {
  const letters = "PIXELATED!".split("");
  return `<span class="pixelated-word" aria-label="PIXELATED!">${letters
    .map((letter, index) => `<span class="pixelated-char" style="--pixel-index:${index}">${letter}</span>`)
    .join("")}</span>`;
}

function renderBlindingLightPhrase() {
  return '<span class="blinding-light-phrase">The <span class="blinding-light-core">Blinding Light</span></span>';
}

function renderInlineMarkdown(value) {
  let html = escapeHtml(value);
  html = html.replace(
    /&lt;t:(\d+)(?::([tTdDfFR]))?&gt;/g,
    (_, unixSeconds, style) => {
      const timestampStyle = style || "f";
      if (timestampStyle === "R") {
        return `<span class="live-relative-time" data-unix="${escapeHtml(unixSeconds)}"></span>`;
      }
      return escapeHtml(formatDiscordTimestampTag(unixSeconds, timestampStyle));
    }
  );
  html = html.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  html = html.replace(/`(.+?)`/g, "<code>$1</code>");
  html = html.replace(
    /(https:\/\/discord\.com\/channels\/[^\s<]+)/g,
    '<a href="$1" target="_blank" rel="noreferrer">$1</a>'
  );
  html = html.replace(
    /PIXELATED!/g,
    renderPixelatedWord()
  );
  html = html.replace(
    /The Blinding Light/g,
    renderBlindingLightPhrase()
  );
  html = html.replace(/\bPOSITIVE\b/g, '<span class="polarity-positive">POSITIVE</span>');
  html = html.replace(/\bNEGATIVE\b/g, '<span class="polarity-negative">NEGATIVE</span>');
  return html;
}

function renderBlockMarkdown(value) {
  return String(value ?? "")
    .split("\n")
    .map((line) => {
      const trimmed = line.trim();
      if (!trimmed) {
        return "<div class=\"line empty\"></div>";
      }
      if (trimmed.startsWith(">")) {
        const quoteContent = trimmed.replace(/^>\s?/, "");
        return `<div class="line line-quote"><span class="quote-bar" aria-hidden="true"></span><span class="quote-content">${renderInlineMarkdown(quoteContent)}</span></div>`;
      }
      return `<div class="line">${renderInlineMarkdown(line)}</div>`;
    })
    .join("");
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function normalizeAuraName(value) {
  const cleaned = normalizeText(value)
    .replace(/\s*:\s*/g, ": ")
    .replace(/^[^0-9A-Za-z]+|[^0-9A-Za-z]+$/g, "");
  return cleaned || null;
}

function normalizeComparableText(value) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "");
}

function buildAuraLookupVariants(auraName) {
  const normalized = normalizeAuraName(auraName);
  if (!normalized) {
    return [];
  }

  return [
    normalized,
    normalized.replace(/\s*:\s*/g, ": "),
    normalized.replace(/\s*:\s*/g, " : "),
    normalized.replace(/\s*:\s*/g, ":"),
  ].filter((value, index, values) => value && values.indexOf(value) === index);
}

function inferAuraMediaType(mediaUrl) {
  const normalized = String(mediaUrl ?? "").toLowerCase();
  return /\.(mp4|webm|mov|m4v|ogv)(?:[/?#]|$)/i.test(normalized) ? "video" : "image";
}

function canonicalizeAuraMediaUrl(mediaUrl) {
  const normalized = String(mediaUrl ?? "").trim();
  if (!normalized) {
    return "";
  }
  if (inferAuraMediaType(normalized) !== "video") {
    return normalized;
  }

  return normalized.replace(/(\/[^/?#]+\.(?:mp4|webm|mov|m4v|ogv))(?:\/revision\/[^?#]+)?(?:\?[^#]*)?$/i, "$1");
}

function fetchJson(url, redirectCount = 0) {
  return new Promise((resolve, reject) => {
    const request = https.get(
      url,
      {
        headers: {
          Accept: "application/json",
          "User-Agent": "aura-scanner/0.1",
        },
      },
      (response) => {
        const { statusCode = 0, headers } = response;
        if (statusCode >= 300 && statusCode < 400 && headers.location && redirectCount < 3) {
          response.resume();
          resolve(fetchJson(new URL(headers.location, url).toString(), redirectCount + 1));
          return;
        }

        if (statusCode < 200 || statusCode >= 300) {
          response.resume();
          reject(new Error(`Request failed with status ${statusCode} for ${url}`));
          return;
        }

        let payload = "";
        response.setEncoding("utf8");
        response.on("data", (chunk) => {
          payload += chunk;
        });
        response.on("end", () => {
          try {
            resolve(JSON.parse(payload));
          } catch (error) {
            reject(error);
          }
        });
      }
    );

    request.on("error", reject);
    request.setTimeout(8000, () => {
      request.destroy(new Error(`Request timed out for ${url}`));
    });
  });
}

function queryFandomApi(params) {
  const search = new URLSearchParams({
    format: "json",
    ...params,
  });
  return fetchJson(`${FANDOM_API_URL}?${search.toString()}`);
}

function getFirstWikiPage(payload) {
  const pages = payload?.query?.pages;
  if (!pages || typeof pages !== "object") {
    return null;
  }
  return Object.values(pages)[0] ?? null;
}

async function fetchAuraPageData(title) {
  const payload = await queryFandomApi({
    action: "query",
    titles: title,
    prop: "images",
    imlimit: "max",
  });
  const page = getFirstWikiPage(payload);
  if (!page || Object.prototype.hasOwnProperty.call(page, "missing")) {
    return null;
  }

  return {
    title: String(page.title ?? title),
    images: Array.isArray(page.images) ? page.images : [],
  };
}

function scoreAuraPageTitle(title, auraName) {
  const titleKey = normalizeComparableText(title);
  const auraKey = normalizeComparableText(auraName);
  if (!titleKey || !auraKey) {
    return Number.NEGATIVE_INFINITY;
  }
  if (titleKey === auraKey) {
    return 1000;
  }
  if (titleKey.includes(auraKey) || auraKey.includes(titleKey)) {
    return 700;
  }

  let score = 0;
  const lowerTitle = String(title ?? "").toLowerCase();
  const auraTokens = String(auraName ?? "")
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((token) => token.length >= 4);
  for (const token of auraTokens) {
    if (lowerTitle.includes(token)) {
      score += 90;
    }
  }
  return score;
}

async function findAuraPageData(auraName) {
  let fallbackPageData = null;
  for (const variant of buildAuraLookupVariants(auraName)) {
    const pageData = await fetchAuraPageData(variant);
    if (pageData?.images?.length) {
      return pageData;
    }
    if (!fallbackPageData && pageData) {
      fallbackPageData = pageData;
    }
  }

  const searchPayload = await queryFandomApi({
    action: "query",
    list: "search",
    srsearch: `"${normalizeText(auraName)}"`,
    srlimit: "5",
  });
  const searchResults = Array.isArray(searchPayload?.query?.search)
    ? searchPayload.query.search
    : [];
  const bestTitle = searchResults
    .map((result) => String(result?.title ?? ""))
    .filter(Boolean)
    .sort((left, right) => scoreAuraPageTitle(right, auraName) - scoreAuraPageTitle(left, auraName))[0];

  if (!bestTitle) {
    return fallbackPageData;
  }
  return (await fetchAuraPageData(bestTitle)) ?? fallbackPageData;
}

function scoreAuraPreviewFile(fileTitle, auraName) {
  const rawTitle = String(fileTitle ?? "").replace(/^File:/i, "");
  const lowerTitle = rawTitle.toLowerCase();
  const extensionMatch = lowerTitle.match(/\.([a-z0-9]+)$/);
  const extension = extensionMatch ? extensionMatch[1] : "";
  const extensionScore = AURA_PREVIEW_EXTENSION_SCORES[extension] ?? Number.NEGATIVE_INFINITY;
  if (!Number.isFinite(extensionScore)) {
    return Number.NEGATIVE_INFINITY;
  }

  const auraKey = normalizeComparableText(auraName);
  const compactTitle = normalizeComparableText(rawTitle);
  let score = extensionScore;

  if (auraKey && compactTitle.includes(auraKey)) {
    score += 120;
  } else {
    const auraTokens = String(auraName ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4);
    for (const token of auraTokens) {
      if (lowerTitle.includes(token)) {
        score += 35;
      }
    }
  }

  for (const [keyword, keywordScore] of AURA_PREVIEW_KEYWORD_SCORES) {
    if (lowerTitle.includes(keyword)) {
      score += keywordScore;
    }
  }

  if (lowerTitle.includes("chat")) {
    score -= 260;
  }
  if (lowerTitle.includes("title")) {
    score -= 180;
  }
  if (lowerTitle.includes("closeup")) {
    score -= 160;
  }
  if (lowerTitle.includes("cutscene")) {
    score -= 80;
  }
  if (lowerTitle.includes("comparison")) {
    score -= 100;
  }
  if (lowerTitle.includes("curation")) {
    score -= 70;
  }
  if (lowerTitle.includes("inventory")) {
    score -= 120;
  }
  if (lowerTitle.includes("placeholder")) {
    score -= 500;
  }
  if (lowerTitle.includes("collectionicon")) {
    score -= 260;
  }
  if (lowerTitle.includes("icon")) {
    score -= 50;
  }

  return score;
}

function pickBestAuraPreviewFile(images, auraName) {
  let bestTitle = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const image of images) {
    const title = String(image?.title ?? "");
    if (!title) {
      continue;
    }
    const score = scoreAuraPreviewFile(title, auraName);
    if (score > bestScore) {
      bestScore = score;
      bestTitle = title;
    }
  }

  return bestScore >= 200 ? bestTitle : null;
}

function scoreAuraCutsceneFile(fileTitle, auraName) {
  const rawTitle = String(fileTitle ?? "").replace(/^File:/i, "");
  const lowerTitle = rawTitle.toLowerCase();
  const extensionMatch = lowerTitle.match(/\.([a-z0-9]+)$/);
  const extension = extensionMatch ? extensionMatch[1] : "";
  const extensionScore = AURA_CUTSCENE_EXTENSION_SCORES[extension] ?? Number.NEGATIVE_INFINITY;
  if (!Number.isFinite(extensionScore)) {
    return Number.NEGATIVE_INFINITY;
  }

  let matchedKeyword = false;
  let score = extensionScore;
  for (const [keyword, keywordScore] of AURA_CUTSCENE_KEYWORD_SCORES) {
    if (lowerTitle.includes(keyword)) {
      matchedKeyword = true;
      score += keywordScore;
    }
  }
  if (!matchedKeyword) {
    return Number.NEGATIVE_INFINITY;
  }

  const auraKey = normalizeComparableText(auraName);
  const compactTitle = normalizeComparableText(rawTitle);
  if (auraKey && compactTitle.includes(auraKey)) {
    score += 120;
  } else {
    const auraTokens = String(auraName ?? "")
      .toLowerCase()
      .split(/[^a-z0-9]+/)
      .filter((token) => token.length >= 4);
    for (const token of auraTokens) {
      if (lowerTitle.includes(token)) {
        score += 35;
      }
    }
  }

  for (const [keyword, keywordScore] of AURA_CUTSCENE_PREFERRED_VARIANT_SCORES) {
    if (compactTitle.includes(keyword)) {
      score += keywordScore;
    }
  }
  for (const [keyword, keywordPenalty] of AURA_CUTSCENE_LEGACY_VARIANT_PENALTIES) {
    if (compactTitle.includes(keyword)) {
      score -= keywordPenalty;
    }
  }

  if (lowerTitle.includes("collectionicon")) {
    score -= 360;
  }
  if (lowerTitle.includes("collection")) {
    score -= 320;
  }
  if (lowerTitle.includes("coll")) {
    score -= 180;
  }
  if (lowerTitle.includes("ingame")) {
    score -= 240;
  }
  if (lowerTitle.includes("game")) {
    score -= 160;
  }
  if (lowerTitle.includes("chat")) {
    score -= 260;
  }
  if (lowerTitle.includes("title")) {
    score -= 180;
  }
  if (lowerTitle.includes("comparison")) {
    score -= 100;
  }
  if (lowerTitle.includes("curation")) {
    score -= 70;
  }
  if (lowerTitle.includes("inventory")) {
    score -= 120;
  }
  if (lowerTitle.includes("placeholder")) {
    score -= 500;
  }
  if (lowerTitle.includes("icon")) {
    score -= 80;
  }

  return score;
}

function pickBestAuraCutsceneFile(images, auraName, excludedTitle = "") {
  const excludedKey = String(excludedTitle ?? "").toLowerCase();
  let bestTitle = null;
  let bestScore = Number.NEGATIVE_INFINITY;

  for (const image of images) {
    const title = String(image?.title ?? "");
    if (!title || title.toLowerCase() === excludedKey) {
      continue;
    }
    const score = scoreAuraCutsceneFile(title, auraName);
    if (score > bestScore) {
      bestScore = score;
      bestTitle = title;
    }
  }

  return bestScore >= 300 ? bestTitle : null;
}

async function fetchWikiFileUrl(fileTitle) {
  const payload = await queryFandomApi({
    action: "query",
    titles: fileTitle,
    prop: "imageinfo",
    iiprop: "url",
  });
  const page = getFirstWikiPage(payload);
  const imageInfo = Array.isArray(page?.imageinfo) ? page.imageinfo[0] : null;
  const url = typeof imageInfo?.url === "string" ? imageInfo.url : "";
  return /^https?:\/\//i.test(url) ? url : "";
}

async function resolveAuraMediaUrls(auraName) {
  const normalized = normalizeAuraName(auraName);
  if (!normalized) {
    return EMPTY_AURA_MEDIA_URLS;
  }
  const auraKey = normalizeComparableText(normalized);
  const previewOverrideUrl = AURA_PREVIEW_URL_OVERRIDES[auraKey] ?? "";
  const cutsceneOverrideUrl = AURA_CUTSCENE_URL_OVERRIDES[auraKey] ?? "";

  const pageData = await findAuraPageData(normalized);
  const images = Array.isArray(pageData?.images) ? pageData.images : [];

  const previewFileTitle = previewOverrideUrl
    ? ""
    : pickBestAuraPreviewFile(images, normalized);
  const cutsceneFileTitle = cutsceneOverrideUrl
    ? ""
    : pickBestAuraCutsceneFile(images, normalized, previewFileTitle);

  const [previewUrl, cutsceneUrl] = await Promise.all([
    previewOverrideUrl
      ? Promise.resolve(previewOverrideUrl)
      : (previewFileTitle ? fetchWikiFileUrl(previewFileTitle) : Promise.resolve("")),
    cutsceneOverrideUrl
      ? Promise.resolve(cutsceneOverrideUrl)
      : (cutsceneFileTitle ? fetchWikiFileUrl(cutsceneFileTitle) : Promise.resolve("")),
  ]);

  return {
    previewUrl: canonicalizeAuraMediaUrl(previewUrl),
    cutsceneUrl: canonicalizeAuraMediaUrl(cutsceneUrl),
  };
}

function getAuraMediaUrls(auraName) {
  const cacheKey = normalizeComparableText(auraName);
  if (!cacheKey) {
    return Promise.resolve(EMPTY_AURA_MEDIA_URLS);
  }
  if (auraMediaUrlCache.has(cacheKey)) {
    return auraMediaUrlCache.get(cacheKey);
  }

  const pendingUrls = resolveAuraMediaUrls(auraName).catch((error) => {
    console.warn(`Failed to resolve aura media for "${auraName}": ${error.message}`);
    return EMPTY_AURA_MEDIA_URLS;
  });
  auraMediaUrlCache.set(cacheKey, pendingUrls);
  return pendingUrls;
}

function getAuraPreviewUrl(auraName) {
  return getAuraMediaUrls(auraName).then((mediaUrls) => mediaUrls.previewUrl);
}

function getAuraCutsceneUrl(auraName) {
  return getAuraMediaUrls(auraName).then((mediaUrls) => mediaUrls.cutsceneUrl);
}

function parseIntegerLike(value) {
  const match = String(value).match(NUMBER_RE);
  if (!match) {
    return null;
  }
  return Number.parseInt(match[1].replaceAll(",", "").replaceAll("_", "").replaceAll(".", ""), 10);
}

function parseFloatLike(value) {
  const normalized = String(value).replaceAll(",", "").replaceAll("_", "").trim();
  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function parseRarity(value, assumeContext = false) {
  const match = String(value).match(RARITY_RATIO_RE);
  if (match) {
    return Number.parseInt(match[1].replaceAll(",", "").replaceAll("_", "").replaceAll(".", ""), 10);
  }
  return assumeContext ? parseIntegerLike(value) : null;
}

function parseRolls(value, assumeContext = false) {
  const match = String(value).match(ROLLS_CONTEXT_RE);
  if (match) {
    return Number.parseInt(match[1].replaceAll(",", "").replaceAll("_", "").replaceAll(".", ""), 10);
  }
  return assumeContext ? parseIntegerLike(value) : null;
}

function parseLuck(value, assumeContext = false) {
  const direct = String(value).match(LUCK_CONTEXT_RE);
  if (direct) {
    return parseFloatLike(direct[1]);
  }
  if (!assumeContext) {
    return null;
  }
  const fallback = String(value).match(LUCK_NUMBER_RE);
  return fallback ? parseFloatLike(fallback[1]) : null;
}

function parseAuraName(value) {
  const cleaned = normalizeText(value).replace(/[*_~|]/g, "");
  if (/\batlas:\s*a\.t\.l\.a\.s\./i.test(cleaned)) {
    return "Atlas: A.T.L.A.S.";
  }
  const craftedMatch = cleaned.match(/\bhas\s+crafted\s+(.+?)(?=\s*\[[^\]]*crafted[^\]]*\]|\s*$)/i);
  if (craftedMatch) {
    return normalizeAuraName(craftedMatch[1]);
  }
  if (/\bfragment\s+of\s+chaos\b/i.test(cleaned)) {
    return "赤月の破片 (Fragments of the Crimson Moon)";
  }
  if (/\[\s*breakthrough(?:!+)?\s*\]/i.test(cleaned)) {
    return "Breakthrough";
  }
  if (/\ball\s+hail\b/i.test(cleaned)) {
    return "Monarch";
  }
  if (/\bruler\s+of\s+beneath\b/i.test(cleaned)) {
    return "Leviathan";
  }
  if (/\bliteral\s+nightmare\b/i.test(cleaned)) {
    return "Nyctophobia";
  }
  if (/\bhas\s+become\s+pixelated!?/i.test(cleaned)) {
    return "Pixelation";
  }
  if (/\bpositive\b[\s\S]*\bnegative\b|\bnegative\b[\s\S]*\bpositive\b/i.test(cleaned)) {
    return "Equinox";
  }
  if (/\bthe\s+blinding\s+light\s+has\s+devoured\b/i.test(cleaned)) {
    return "Luminosity";
  }

  const match = cleaned.match(FOUND_AURA_RE);
  if (match) {
    return normalizeAuraName(match[1]);
  }

  const fallback = cleaned.match(/\bhas\s+found\s+(.+?)(?=,\s*chance\s+of\b)/i);
  if (fallback) {
    return normalizeAuraName(fallback[1]);
  }

  const plainFound = cleaned.match(/\bhas\s+found\s+(.+?)(?=[!?\.](?:\s|$)|$)/i);
  if (plainFound) {
    return normalizeAuraName(plainFound[1]);
  }

  return null;
}

function extractAuraNameFromTitle(value) {
  return parseAuraName(value) || normalizeAuraName(value);
}

function parseDiscordUnixTimestamp(value) {
  const match = String(value).match(DISCORD_TIMESTAMP_RE);
  if (!match) {
    return null;
  }
  const parsed = Number.parseInt(match[1], 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function buildDisplayText(snapshot) {
  const sourceParts = [];
  const normalizedContent = normalizeText(snapshot.content);
  if (normalizedContent) {
    sourceParts.push(normalizedContent);
  }
  for (const title of snapshot.embedTitles) {
    const normalizedTitle = normalizeText(title);
    if (normalizedTitle) {
      sourceParts.push(normalizedTitle);
    }
  }
  for (const description of snapshot.embedDescriptions) {
    const normalizedDescription = normalizeText(description);
    if (normalizedDescription) {
      sourceParts.push(normalizedDescription);
    }
  }
  for (const [fieldName, fieldValue] of snapshot.embedFields) {
    const normalizedName = normalizeText(fieldName);
    const normalizedValue = normalizeText(fieldValue);
    if (normalizedName || normalizedValue) {
      sourceParts.push(`${normalizedName}: ${normalizedValue}`);
    }
  }
  return sourceParts.join("\n");
}

function buildEmbedModel(snapshot) {
  return {
    authorText: normalizeText(snapshot.content) || normalizeText(snapshot.embedAuthorName),
    authorIcon: snapshot.embedAuthorIcon || "",
    title: snapshot.embedTitles.map(normalizeText).find(Boolean) || "",
    description: snapshot.embedDescriptions.map(normalizeText).filter(Boolean).join("\n"),
    color: snapshot.embedColor ?? null,
    fields: snapshot.embedFields
      .map(([fieldName, fieldValue]) => ({
        name: normalizeText(fieldName),
        value: normalizeText(fieldValue),
      }))
      .filter((field) => field.name || field.value),
  };
}

function getEmbedAuthorIcon(embed) {
  const rawIcon = embed?.author?.iconURL ?? embed?.author?.icon_url ?? null;
  if (typeof rawIcon === "function") {
    try {
      const resolved = rawIcon.call(embed.author) || "";
      return isUsableIconUrl(resolved) ? resolved : "";
    } catch {
      return "";
    }
  }
  if (typeof rawIcon === "string" && isUsableIconUrl(rawIcon)) {
    return rawIcon;
  }
  const thumbnailUrl = embed?.thumbnail?.url ?? embed?.thumbnail?.proxyURL ?? "";
  return isUsableIconUrl(thumbnailUrl) ? String(thumbnailUrl) : "";
}

function isUsableIconUrl(value) {
  const url = String(value || "");
  if (!url) {
    return false;
  }
  return /^https?:\/\//i.test(url);
}

function extractFindingsFromSnapshot(snapshot, includeDisplay = true) {
  let rarity = null;
  let rolls = null;
  let luck = null;
  let discoveredAtUnix = null;
  let auraName = snapshot.embedTitles.map(extractAuraNameFromTitle).find(Boolean) ?? null;

  const textBlocks = [snapshot.content, ...snapshot.embedDescriptions];
  for (const block of textBlocks) {
    const text = normalizeText(block);
    if (!text) {
      continue;
    }
    if (rarity === null) {
      rarity = parseRarity(text);
    }
    if (rolls === null) {
      rolls = parseRolls(text);
    }
    if (luck === null) {
      luck = parseLuck(text);
    }
    if (auraName === null) {
      auraName = parseAuraName(text);
    }
    if (discoveredAtUnix === null) {
      discoveredAtUnix = parseDiscordUnixTimestamp(block);
    }
  }

  for (const [rawName, rawValue] of snapshot.embedFields) {
    const fieldName = normalizeText(rawName).toLowerCase();
    const fieldValue = normalizeText(rawValue);
    if (!fieldValue) {
      continue;
    }

    if (rarity === null && (fieldName.includes("rarity") || fieldName.includes("chance"))) {
      rarity = parseRarity(fieldValue, true);
    }
    if (rolls === null && fieldName.includes("roll")) {
      rolls = parseRolls(fieldValue, true);
    }
    if (luck === null && fieldName.includes("luck")) {
      luck = parseLuck(fieldValue, true);
    }
    if (auraName === null) {
      auraName = parseAuraName(rawValue) || parseAuraName(rawName);
    }
    if (discoveredAtUnix === null && fieldName.includes("time")) {
      discoveredAtUnix = parseDiscordUnixTimestamp(rawValue);
    }
  }

  const sourceText = buildDisplayText(snapshot);
  if (auraName === null) {
    auraName = parseAuraName(sourceText);
  }
  const craftedLike = CRAFTED_FIND_RE.test(sourceText);

  if (rarity === null || rolls === null) {
    return [];
  }
  const hasLuck = luck !== null;
  if (luck === null) {
    if (craftedLike) {
      luck = 0;
    } else {
      return [];
    }
  }
  const displayText = includeDisplay ? sourceText : "";

  return [
    {
      rarity,
      rolls,
      luck,
      hasLuck,
      sourceText,
      displayText,
      auraName,
      discoveredAtUnix,
      authorName: snapshot.authorName ?? null,
      messageId: snapshot.messageId ?? null,
      messageUrl: snapshot.messageUrl ?? null,
    },
  ];
}

function compareFindings(left, right) {
  if (RANKING_MODE === "efficient") {
    const leftScore = scoreFinding(left);
    const rightScore = scoreFinding(right);
    if (leftScore !== rightScore) {
      return rightScore - leftScore;
    }
  }

  if (left.rarity !== right.rarity) {
    return right.rarity - left.rarity;
  }
  if (left.rolls !== right.rolls) {
    return left.rolls - right.rolls;
  }
  if (left.luck !== right.luck) {
    return left.luck - right.luck;
  }
  return (left.messageId ?? 0) - (right.messageId ?? 0);
}

function scoreFinding(finding) {
  const rarityTerm = Math.log10(Math.max(finding.rarity, 1));
  const rollsPenalty = Math.log10(Math.max(finding.rolls, 1));
  const luckPenalty = 0.5 * Math.log10(Math.max(finding.luck, 1));
  return rarityTerm - rollsPenalty - luckPenalty;
}

function getFindingKey(finding) {
  return `${finding.messageId ?? "no-id"}|${finding.sourceText}`;
}

function rememberKnownFinding(finding) {
  if (!finding) {
    return null;
  }

  const findingKey = getFindingKey(finding);
  knownFindingsByKey.set(findingKey, finding);
  return findingKey;
}

function rememberKnownFindings(findings) {
  for (const finding of findings) {
    rememberKnownFinding(finding);
  }
}

function refreshPinnedFinds() {
  appState.pinnedFinds = pinnedFindingOrder
    .map((findingKey) => knownFindingsByKey.get(findingKey))
    .filter(Boolean);
}

function setPinnedFinding(findingKey, shouldPin) {
  if (!findingKey || !knownFindingsByKey.has(findingKey)) {
    return false;
  }

  if (shouldPin) {
    if (!pinnedFindingKeys.has(findingKey)) {
      pinnedFindingKeys.add(findingKey);
      pinnedFindingOrder.unshift(findingKey);
    }
  } else if (pinnedFindingKeys.has(findingKey)) {
    pinnedFindingKeys.delete(findingKey);
    const index = pinnedFindingOrder.indexOf(findingKey);
    if (index >= 0) {
      pinnedFindingOrder.splice(index, 1);
    }
  }

  refreshPinnedFinds();
  return true;
}

function mergeLatestSessionFinds(findings) {
  if (!findings.length) {
    return;
  }

  const mergedByKey = new Map(
    appState.latestSessionFinds.map((finding) => [getFindingKey(finding), finding])
  );

  for (const finding of findings) {
    const findingKey = rememberKnownFinding(finding);
    mergedByKey.set(findingKey, finding);
  }

  appState.latestSessionFinds = [...mergedByKey.values()]
    .sort(compareFindingsByDiscoveryTime)
    .slice(0, MAX_SESSION_RECENT_FINDS);
  refreshPinnedFinds();
}

function isInterestingFinding(finding, maxRolls = DEFAULT_MAX_ROLLS) {
  return passesThresholds(finding, maxRolls);
}

function isPotionFinding(finding) {
  const haystack = `${finding.sourceText || ""}\n${finding.displayText || ""}`;
  return POTION_FIND_RE.test(haystack);
}

function isCraftedFinding(finding) {
  const haystack = `${finding.sourceText || ""}\n${finding.displayText || ""}`;
  return CRAFTED_FIND_RE.test(haystack);
}

function passesThresholds(finding, maxRolls = DEFAULT_MAX_ROLLS) {
  const withinRollThreshold =
    maxRolls === null ? true : finding.rolls <= maxRolls;
  const meetsNormalThreshold = finding.rarity >= MIN_RARITY;
  const meetsPotionThreshold = isPotionFinding(finding) && finding.rarity >= MIN_POTION_RARITY;
  const meetsCraftedThreshold = isCraftedFinding(finding) && finding.rarity >= MIN_POTION_RARITY;
  return (meetsNormalThreshold || meetsPotionThreshold || meetsCraftedThreshold) && finding.luck < MAX_LUCK && withinRollThreshold;
}

function formatThresholdSummary(maxRolls = DEFAULT_MAX_ROLLS) {
  const parts = [
    `rarity >= ${MIN_RARITY.toLocaleString("en-US")}`,
    `potion rarity >= ${MIN_POTION_RARITY.toLocaleString("en-US")}`,
    `luck < ${MAX_LUCK}`,
  ];
  if (maxRolls !== null) {
    parts.push(`rolls <= ${maxRolls.toLocaleString("en-US")}`);
  }
  return parts.join(" | ");
}

function appendInterestingFinding(finding) {
  fs.appendFileSync(INTERESTING_OUTPUT_PATH, buildInterestingFindingText(finding), "utf8");
}

function buildInterestingFindingText(finding) {
  const lines = [
    "==== Interesting Find ====",
    `score : ${scoreFinding(finding).toFixed(3)}`,
    `rarity: ${formatRarity(finding.rarity)}`,
    `rolls : ${finding.rolls.toLocaleString("en-US")}`,
    `luck  : ${finding.luck.toFixed(3)}`,
    finding.displayText || finding.sourceText,
  ];
  if (finding.messageUrl) {
    lines.push(`link  : ${finding.messageUrl}`);
  }
  if (finding.embedModel?.color !== null && finding.embedModel?.color !== undefined) {
    lines.push(`color : ${formatEmbedColor(finding.embedModel.color)}`);
  }
  lines.push("");
  return `${lines.join("\n")}\n`;
}

function formatEmbedColor(colorValue) {
  if (typeof colorValue !== "number" || !Number.isFinite(colorValue)) {
    return "";
  }
  return `#${colorValue.toString(16).padStart(6, "0")}`;
}

function renderDiscordEmbedHtml(finding) {
  const model = finding.embedModel || {
    authorText: "",
    authorIcon: "",
    title: "",
    description: finding.displayText || finding.sourceText,
    color: null,
    fields: [],
  };
  const borderColor = formatEmbedColor(model.color) || "var(--embedEdge)";
  const iconParts = [];
  if (model.authorIcon) {
    iconParts.push(
      `<img class="discord-author-icon discord-author-icon-embed" src="${escapeHtml(model.authorIcon)}" alt="" width="20" height="20" />`
    );
  }
  const safeAuthorIcon = iconParts.length
    ? `<span class="discord-author-icons">${iconParts.join("")}</span>`
    : "";

  const contentHtml = model.authorText
    ? `<div class="discord-author">${safeAuthorIcon}<span>${renderInlineMarkdown(model.authorText)}</span></div>`
    : "";
  const titleHtml = model.title
    ? `<div class="discord-title">${renderInlineMarkdown(model.title)}</div>`
    : "";
  const descriptionHtml = model.description
    ? `<div class="discord-description">${renderBlockMarkdown(model.description)}</div>`
    : "";
  const fieldsHtml = model.fields.length
    ? `<div class="discord-fields">${model.fields
        .map(
          (field) =>
            `<div class="discord-field"><div class="discord-field-name">${renderInlineMarkdown(field.name)}</div>` +
            `<div class="discord-field-value">${renderBlockMarkdown(field.value)}</div></div>`
        )
        .join("")}</div>`
    : "";

  return `<div class="discord-card" style="--embed-accent: ${borderColor};">${contentHtml}${titleHtml}${descriptionHtml}${fieldsHtml}</div>`;
}

async function findingToViewModel(finding) {
  if (!finding) {
    return null;
  }
  const findingKey = rememberKnownFinding(finding);
  const auraName = finding.auraName
    || parseAuraName(finding.displayText || "")
    || parseAuraName(finding.sourceText || "")
    || parseAuraName(finding.embedModel?.title || "")
    || null;
  const auraMediaUrls = auraName ? await getAuraMediaUrls(auraName) : EMPTY_AURA_MEDIA_URLS;
  return {
    rarity: finding.rarity,
    rolls: finding.rolls,
    luck: finding.luck,
    hasLuck: finding.hasLuck !== false,
    luckText: finding.hasLuck === false ? "N/A" : finding.luck.toLocaleString("en-US"),
    score: scoreFinding(finding).toFixed(3),
    messageUrl: finding.messageUrl ?? "",
    embedColor: formatEmbedColor(finding.embedModel?.color),
    embedHtml: renderDiscordEmbedHtml(finding),
    findingKey,
    isPinned: pinnedFindingKeys.has(findingKey),
    auraName,
    auraPreviewUrl: auraMediaUrls.previewUrl,
    auraPreviewMediaType: inferAuraMediaType(auraMediaUrls.previewUrl),
    auraCutsceneUrl: auraMediaUrls.cutsceneUrl,
    auraCutsceneMediaType: inferAuraMediaType(auraMediaUrls.cutsceneUrl),
  };
}

function compareFindingsByRarity(left, right) {
  if (left.rarity !== right.rarity) {
    return right.rarity - left.rarity;
  }
  if (left.rolls !== right.rolls) {
    return left.rolls - right.rolls;
  }
  if (left.luck !== right.luck) {
    return left.luck - right.luck;
  }
  return (left.messageId ?? 0) - (right.messageId ?? 0);
}

function compareFindingsByDiscoveryTime(left, right) {
  const leftDiscovered = left.discoveredAtUnix ?? -1;
  const rightDiscovered = right.discoveredAtUnix ?? -1;
  if (leftDiscovered !== rightDiscovered) {
    return rightDiscovered - leftDiscovered;
  }
  return (right.messageId ?? 0) - (left.messageId ?? 0);
}

function getLatestDiscoveryFindings(findings, limit) {
  const unique = new Map();
  for (const finding of findings) {
    const key = `${finding.rarity}|${finding.rolls}|${finding.luck}|${finding.sourceText}`;
    unique.set(key, finding);
  }
  return [...unique.values()]
    .sort(compareFindingsByDiscoveryTime)
    .slice(0, limit);
}

function getTopRarestRawFindings(findings) {
  const unique = new Map();
  for (const finding of findings) {
    const key = `${finding.rarity}|${finding.rolls}|${finding.luck}|${finding.sourceText}`;
    unique.set(key, finding);
  }
  return [...unique.values()]
    .sort(compareFindingsByRarity)
    .slice(0, MAX_RECENT_FINDS);
}

function compareFindingsByLowestLuck(left, right) {
  if (left.luck !== right.luck) {
    return left.luck - right.luck;
  }
  if (left.rarity !== right.rarity) {
    return right.rarity - left.rarity;
  }
  if (left.rolls !== right.rolls) {
    return left.rolls - right.rolls;
  }
  return (left.messageId ?? 0) - (right.messageId ?? 0);
}

function rankFindingsByLowestLuck(findings) {
  const unique = new Map();
  for (const finding of findings) {
    const key = `${finding.rarity}|${finding.rolls}|${finding.luck}|${finding.sourceText}`;
    unique.set(key, finding);
  }

  return [...unique.values()].sort(compareFindingsByLowestLuck);
}

function compareFindingsByLeastRolls(left, right) {
  if (left.rolls !== right.rolls) {
    return left.rolls - right.rolls;
  }
  if (left.rarity !== right.rarity) {
    return right.rarity - left.rarity;
  }
  if (left.luck !== right.luck) {
    return left.luck - right.luck;
  }
  return (left.messageId ?? 0) - (right.messageId ?? 0);
}

function getTopLeastRollRawFindings(findings) {
  const unique = new Map();
  for (const finding of findings) {
    const key = `${finding.rarity}|${finding.rolls}|${finding.luck}|${finding.sourceText}`;
    unique.set(key, finding);
  }

  return [...unique.values()]
    .sort(compareFindingsByLeastRolls)
    .slice(0, MAX_TOP_BEST);
}

function refreshTopBestFindings(findings) {
  appState.topBestFindings = rankFindingsByLowestLuck(findings)
    .slice(0, MAX_TOP_BEST);
}

function getTopBestRawFindings(findings) {
  return rankFindingsByLowestLuck(findings).slice(0, MAX_TOP_BEST);
}

function rememberMessageId(seenMessageIds, seenMessageOrder, messageId) {
  if (!messageId || seenMessageIds.has(messageId)) {
    return false;
  }

  seenMessageIds.add(messageId);
  seenMessageOrder.push(messageId);

  while (seenMessageOrder.length > MAX_TRACKED_MESSAGE_IDS) {
    const evictedId = seenMessageOrder.shift();
    if (evictedId) {
      seenMessageIds.delete(evictedId);
    }
  }

  return true;
}

function selectBestFinding(findings) {
  let best = null;
  for (const finding of findings) {
    if (!best || compareFindings(finding, best) < 0) {
      best = finding;
    }
  }
  return best;
}

function rankFindings(findings) {
  const unique = new Map();
  for (const finding of findings) {
    const key = `${finding.rarity}|${finding.rolls}|${finding.luck}|${finding.sourceText}`;
    unique.set(key, finding);
  }

  return [...unique.values()].sort(compareFindings);
}

function snapshotsFromMessage(message) {
  const baseSnapshot = {
    content: String(message.content ?? ""),
    authorName: message.author?.username ?? null,
    messageId: message.id ?? null,
    messageUrl: message.url ?? null,
  };

  if (!message.embeds?.length) {
    return [
      {
        ...baseSnapshot,
        embedTitles: [],
        embedDescriptions: [],
        embedFields: [],
      },
    ];
  }

  return message.embeds.map((embed) => ({
    ...baseSnapshot,
    embedTitles: embed.title ? [String(embed.title)] : [],
    embedDescriptions: embed.description ? [String(embed.description)] : [],
    embedAuthorName: embed.author?.name ? String(embed.author.name) : "",
    embedAuthorIcon: getEmbedAuthorIcon(embed),
    embedColor: typeof embed.color === "number" ? embed.color : null,
    embedFields: (embed.fields ?? []).map((field) => [
      String(field.name ?? ""),
      String(field.value ?? ""),
    ]),
  }));
}

function renderDashboardHtml(apiBaseUrl = "") {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Aura Scanner</title>
  <style>
    @font-face { font-family: "gg sans"; src: local("gg sans Regular"), local("gg sans"); font-weight: 400; font-style: normal; font-display: swap; }
    @font-face { font-family: "gg sans"; src: local("gg sans Medium"); font-weight: 500; font-style: normal; font-display: swap; }
    @font-face { font-family: "gg sans"; src: local("gg sans Semibold"); font-weight: 600; font-style: normal; font-display: swap; }
    @font-face { font-family: "gg sans"; src: local("gg sans Bold"); font-weight: 700; font-style: normal; font-display: swap; }
    :root { color-scheme: dark; --bg:#0b1020; --panel:#121a30; --line:#24314f; --text:#eef3ff; --muted:#9fb0d1; --accent:#7cc7ff; --accentSoft: rgba(124,199,255,.18); --accentLine: rgba(124,199,255,.34); --embed:#3a3d44; --embedShade:#24262b; --embedEdge:#00b0f4; }
    * { box-sizing: border-box; }
    html, body { height: 100%; }
    body { margin: 0; font-family: "gg sans", "Noto Sans", "Helvetica Neue", Helvetica, Arial, sans-serif; background:
      radial-gradient(circle at top left, rgba(33,78,168,.35), transparent 34%),
      radial-gradient(circle at top right, rgba(0,176,244,.18), transparent 22%),
      radial-gradient(circle at top, #132042, var(--bg) 58%);
      color: var(--text); line-height: 1.45; overflow: hidden; }
    .wrap { max-width: 1300px; height: 100vh; margin: 0 auto; padding: 18px 18px 20px; display: flex; flex-direction: column; }
    h1 { margin: 0 0 6px; font-size: 28px; letter-spacing: -.02em; text-shadow: 0 2px 16px rgba(0,0,0,.28); }
    .meta { color: var(--muted); margin-bottom: 12px; font-size: 13px; flex: 0 0 auto; }
    .tab-shell { display: flex; flex-direction: column; gap: 12px; flex: 1 1 auto; min-height: 0; }
    .tab-bar { display: flex; gap: 10px; flex-wrap: wrap; flex: 0 0 auto; }
    .tab-button { border: 1px solid rgba(72,101,158,.62); background: linear-gradient(180deg, rgba(18,31,62,.88), rgba(12,22,42,.88)); color: var(--muted); padding: 10px 14px; border-radius: 12px; font: inherit; font-size: 13px; font-weight: 700; cursor: pointer; transition: color .18s ease, border-color .18s ease, background .18s ease, box-shadow .18s ease; }
    .tab-button:hover { color: #eaf4ff; border-color: rgba(124,199,255,.46); }
    .tab-button.is-active { color: #ffffff; border-color: rgba(124,199,255,.68); background: linear-gradient(180deg, rgba(36,74,146,.48), rgba(15,33,68,.92)); box-shadow: inset 0 1px 0 rgba(255,255,255,.06), 0 8px 20px rgba(0,0,0,.18); }
    .tab-content { flex: 1 1 auto; min-height: 0; }
    .panel { background: linear-gradient(180deg, rgba(19,31,60,.96), rgba(14,23,44,.94)); border: 1px solid rgba(58,89,146,.55); border-radius: 18px; padding: 14px; box-shadow: 0 18px 44px rgba(0,0,0,.3), inset 0 1px 0 rgba(255,255,255,.04); min-height: 0; overflow: hidden; display: flex; flex-direction: column; align-self: start; }
    .panel h2 { margin: 0 0 10px; font-size: 18px; letter-spacing: -.01em; flex: 0 0 auto; }
    .stats { display: flex; gap: 14px; flex-wrap: wrap; color: var(--muted); margin-bottom: 10px; font-size: 13px; flex: 0 0 auto; }
    .embed { padding-left: 0; min-height: 0; overflow: auto; }
    .tab-pane { display: none; height: 100%; }
    .tab-pane.is-active { display: flex; }
    .tab-pane .panel { width: 100%; height: 100%; min-height: 0; }
    .tab-body { min-height: 0; overflow: auto; padding-right: 4px; }
    .tab-body, .embed { transition: transform .18s ease, opacity .18s ease, filter .18s ease; transform-origin: top center; }
    .tab-body.swap-stage-out, .embed.swap-stage-out { opacity: 0; transform: translateY(18px); filter: blur(1px); }
    .tab-body.swap-stage-in, .embed.swap-stage-in { opacity: 0; transform: translateY(-16px); filter: blur(1px); }
    .tab-body::-webkit-scrollbar, .embed::-webkit-scrollbar { width: 8px; }
    .tab-body::-webkit-scrollbar-thumb, .embed::-webkit-scrollbar-thumb { background: rgba(132,161,214,.22); border-radius: 999px; }
    .line { margin: 4px 0; line-height: 1.45; word-break: break-word; }
    .empty { min-height: 10px; }
    strong { color: #ffffff; text-shadow: 0 0 6px rgba(255,255,255,.35), 0 0 12px rgba(255,255,255,.12); }
    code { background: rgba(255,255,255,.08); padding: 1px 5px; border-radius: 5px; }
    a { color: #8bd3ff; text-decoration: none; display: inline-block; max-width: 100%; overflow-wrap: anywhere; padding: 2px 0; border-bottom: 1px solid rgba(139,211,255,.28); text-shadow: 0 1px 6px rgba(0,0,0,.35); transition: color .18s ease, border-color .18s ease, text-shadow .18s ease; }
    a:hover { color: #c9ecff; border-bottom-color: rgba(201,236,255,.7); text-shadow: 0 0 10px rgba(124,199,255,.26); }
    a:focus-visible { outline: 2px solid var(--accentLine); outline-offset: 3px; border-bottom-color: rgba(201,236,255,.7); border-radius: 3px; }
    a.discord-jump { display: inline-flex; align-items: center; gap: 9px; margin-top: 10px; padding: 9px 12px; max-width: none; border: 1px solid rgba(255,255,255,.72); border-bottom-width: 1px; border-radius: 10px; background: linear-gradient(180deg, rgba(255,255,255,.98), rgba(241,245,252,.95)); color: #151922; font-weight: 700; text-shadow: none; box-shadow: inset 0 1px 0 rgba(255,255,255,.9), 0 8px 20px rgba(0,0,0,.18); }
    a.discord-jump:hover { color: #0f131a; border-color: rgba(255,255,255,.95); border-bottom-color: rgba(255,255,255,.95); text-shadow: none; box-shadow: inset 0 1px 0 rgba(255,255,255,1), 0 10px 24px rgba(0,0,0,.22); }
    a.discord-jump:focus-visible { border-radius: 10px; }
    .discord-jump-icon { width: 18px; height: 18px; flex: 0 0 auto; display: block; object-fit: contain; }
    .discord-jump-label { line-height: 1.1; }
    .finding-action-row { display: flex; flex-wrap: wrap; gap: 10px; margin-top: 10px; }
    .finding-action-row a.discord-jump { margin-top: 0; }
    button.pin-toggle { display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 9px 12px; border: 1px solid rgba(124,199,255,.36); border-radius: 10px; background: linear-gradient(180deg, rgba(124,199,255,.16), rgba(124,199,255,.08)); color: var(--text); font: inherit; font-weight: 700; cursor: pointer; box-shadow: inset 0 1px 0 rgba(255,255,255,.05), 0 8px 20px rgba(0,0,0,.14); }
    button.pin-toggle:hover { border-color: rgba(124,199,255,.56); background: linear-gradient(180deg, rgba(124,199,255,.22), rgba(124,199,255,.12)); }
    button.pin-toggle:focus-visible { outline: 2px solid var(--accentLine); outline-offset: 2px; }
    button.pin-toggle.is-pinned { border-color: rgba(255,225,140,.5); background: linear-gradient(180deg, rgba(255,225,140,.18), rgba(255,225,140,.1)); color: #fff5c7; }
    button.pin-toggle:disabled { opacity: .65; cursor: wait; }
    .find { display: grid; grid-template-columns: minmax(0, 1fr) auto; gap: 16px; align-items: start; width: min(100%, 1000px); border-top: 1px solid var(--line); padding-top: 12px; margin-top: 12px; }
    .find:first-child { border-top: 0; padding-top: 0; margin-top: 0; }
    .find-main { min-width: 0; display: flex; flex-direction: column; align-items: flex-start; }
    .aura-media-strip { display: flex; flex-wrap: wrap; gap: 12px; align-items: flex-start; justify-content: flex-start; width: min(100%, 432px); }
    .small { color: var(--muted); font-size: 13px; margin-bottom: 8px; line-height: 1.5; }
    .discord-card { --embed-accent: var(--embedEdge); position: relative; isolation: isolate; display: grid; align-content: start; gap: 8px; min-height: 152px; background-color: var(--embed); background-image:
      linear-gradient(90deg, #1d2026 0%, #262a31 14%, #31343b 32%, #383b42 52%, #3a3d44 100%);
      width: min(100%, 500px); border: 1px solid rgba(255,255,255,.06); border-radius: 4px; padding: 9px 12px 10px 14px; overflow: hidden; box-shadow: inset 0 1px 0 rgba(255,255,255,.03), 0 0 0 1px rgba(255,255,255,.015); }
    .discord-card::before { content: ""; position: absolute; inset: 0 auto 0 0; width: 3px; background: linear-gradient(180deg, var(--embed-accent) 0%, #ffffff 45%, var(--embed-accent) 100%); background-size: 100% 220%; background-position: 0 var(--embed-shift, 0%); box-shadow: 0 0 10px color-mix(in srgb, var(--embed-accent) 65%, white 35%); }
    .discord-card::after { content: ""; position: absolute; inset: 0; pointer-events: none; background:
      linear-gradient(118deg, rgba(255,255,255,0) 18%, rgba(255,255,255,.035) 32%, rgba(195,250,255,.08) 40%, rgba(255,255,255,.11) 48%, rgba(255,220,245,.05) 57%, rgba(255,255,255,0) 68%),
      radial-gradient(circle at 78% 22%, rgba(210,248,255,.055), transparent 28%),
      radial-gradient(circle at 24% 78%, rgba(255,230,245,.04), transparent 26%);
      mix-blend-mode: screen; opacity: .68; z-index: 0; }
    .discord-card > * { position: relative; z-index: 1; }
    .discord-author { color: #dcddde; font-size: 14px; margin: 0; display: flex; align-items: center; gap: 8px; font-weight: 600; text-shadow: 0 1px 0 rgba(255,255,255,.05), 0 2px 6px rgba(0,0,0,.55); }
    .discord-author-icons { display: inline-flex; align-items: center; gap: 6px; flex: 0 0 auto; }
    .discord-author-icon { width: 20px !important; height: 20px !important; min-width: 20px; max-width: 20px; min-height: 20px; max-height: 20px; border-radius: 50%; object-fit: cover; flex: 0 0 auto; display: inline-block; overflow: hidden; }
    .discord-author-icon-embed { border-radius: 4px; }
    .discord-title { color: #ffffff; font-weight: 700; margin: 0; text-shadow: 0 1px 0 rgba(255,255,255,.08), 0 2px 8px rgba(0,0,0,.6); }
    .discord-description { color: #dcddde; margin: 0; min-height: 2.9em; text-shadow: 0 1px 0 rgba(255,255,255,.04), 0 2px 6px rgba(0,0,0,.5); }
    .line-quote { display: grid; grid-template-columns: 4px 1fr; align-items: stretch; gap: 8px; color: #e8efff; }
    .quote-bar { width: 4px; border-radius: 999px; background: rgba(79, 84, 92, .9); box-shadow: inset 0 1px 0 rgba(255,255,255,.08); }
    .quote-content { min-width: 0; }
    .discord-fields { display: grid; grid-template-columns: repeat(3, minmax(110px, max-content)); gap: 8px 18px; justify-content: start; margin-top: auto; }
    .discord-field-name { color: #ffffff; font-size: 12px; font-weight: 700; text-transform: uppercase; margin-bottom: 3px; text-shadow: 0 1px 0 rgba(255,255,255,.07), 0 2px 6px rgba(0,0,0,.55); }
    .discord-field-value { color: #dcddde; font-size: 14px; text-shadow: 0 1px 0 rgba(255,255,255,.04), 0 2px 6px rgba(0,0,0,.5); }
    .discord-field-value .line + .line { display: none; }
    .aura-preview { width: 210px; flex: 0 1 210px; border: 1px solid rgba(96,128,194,.42); border-radius: 14px; padding: 10px; background:
      radial-gradient(circle at top right, rgba(124,199,255,.12), transparent 38%),
      linear-gradient(180deg, rgba(17,28,55,.96), rgba(11,18,36,.92));
      box-shadow: inset 0 1px 0 rgba(255,255,255,.04), 0 12px 24px rgba(0,0,0,.22); }
    .aura-preview-label { color: #e9f4ff; font-size: 12px; font-weight: 700; letter-spacing: .01em; margin-bottom: 3px; }
    .aura-preview-kind { color: rgba(201,236,255,.72); font-size: 10px; font-weight: 700; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 8px; }
    .aura-preview-media-wrap { border-radius: 10px; overflow: hidden; border: 1px solid rgba(124,199,255,.18); background:
      linear-gradient(135deg, rgba(255,255,255,.03), rgba(255,255,255,.01)),
      rgba(6,10,18,.9); min-height: 168px; display: grid; place-items: center; }
    .aura-preview-media { display: block; width: 100%; max-height: 240px; object-fit: contain; }
    .aura-preview-video { background: #04070d; object-fit: cover; }
    .aura-preview-empty .aura-preview-media-wrap { color: var(--muted); font-size: 12px; text-align: center; padding: 18px; }
    .polarity-positive, .polarity-negative { display: inline-block; transition: color .12s linear, text-shadow .12s linear; }
    .polarity-positive { color: #ffffff; text-shadow: 0 0 6px rgba(255,255,255,.18), 0 1px 1px rgba(0,0,0,.55); animation: polarity-positive-flash 1s steps(1, end) infinite; }
    .polarity-negative { color: #080808; text-shadow: 0 0 0 rgba(0,0,0,0), 0 0 1px rgba(255,255,255,.85), 0 1px 1px rgba(255,255,255,.18); animation: polarity-negative-flash 1s steps(1, end) infinite; }
    @keyframes polarity-positive-flash {
      0%, 49.999% { color: #ffffff; text-shadow: 0 0 6px rgba(255,255,255,.18), 0 1px 1px rgba(0,0,0,.55); }
      50%, 100% { color: #080808; text-shadow: 0 0 0 rgba(0,0,0,0), 0 0 1px rgba(255,255,255,.85), 0 1px 1px rgba(255,255,255,.18); }
    }
    @keyframes polarity-negative-flash {
      0%, 49.999% { color: #080808; text-shadow: 0 0 0 rgba(0,0,0,0), 0 0 1px rgba(255,255,255,.85), 0 1px 1px rgba(255,255,255,.18); }
      50%, 100% { color: #ffffff; text-shadow: 0 0 6px rgba(255,255,255,.18), 0 1px 1px rgba(0,0,0,.55); }
    }
    .blinding-light-phrase { color: #f4feff; }
    .blinding-light-core { display: inline-block; font-weight: 800; background-image: linear-gradient(110deg, #d8ffff 0%, #ffffff 18%, #9afcff 34%, #55f0ff 52%, #f7ffff 68%, #8befff 84%, #d8ffff 100%); background-size: 220% 100%; color: transparent; -webkit-background-clip: text; background-clip: text; text-shadow: 0 0 8px rgba(111,246,255,.18), 0 0 18px rgba(79,226,255,.16), 0 1px 1px rgba(0,0,0,.45); animation: blinding-light-shimmer 1.35s linear infinite; }
    @keyframes blinding-light-shimmer {
      from { background-position: 0% 50%; filter: brightness(1); }
      50% { filter: brightness(1.12); }
      to { background-position: 220% 50%; filter: brightness(1); }
    }
    .pixelated-word { display: inline-flex; align-items: baseline; gap: .02em; font-family: "Consolas", "Courier New", monospace; font-weight: 900; letter-spacing: .015em; line-height: 1; vertical-align: baseline; }
    .pixelated-char { display: inline-block; color: hsl(calc(var(--pixel-index) * 36), 100%, 56%); text-shadow:
      1px 0 0 #000000,
      -1px 0 0 #000000,
      0 1px 0 #000000,
      0 -1px 0 #000000,
      1px 1px 0 #000000,
      -1px 1px 0 #000000,
      1px -1px 0 #000000,
      -1px -1px 0 #000000,
      0 0 6px rgba(255,255,255,.08);
      image-rendering: pixelated;
      animation: pixelated-rainbow 2.4s linear infinite, pixelated-flicker 1.8s steps(2, end) infinite;
      animation-delay: calc(var(--pixel-index) * -0.12s);
    }
    @keyframes pixelated-rainbow {
      0% { color: hsl(calc(var(--pixel-index) * 36), 100%, 56%); }
      100% { color: hsl(calc(var(--pixel-index) * 36 + 360), 100%, 56%); }
    }
    @keyframes pixelated-flicker {
      0%, 100% { transform: translateY(0); }
      50% { transform: translateY(-.02em); }
    }
    @media (max-width: 920px) { .find { grid-template-columns: 1fr; width: 100%; } .aura-media-strip { width: 100%; } }
    @media (max-width: 560px) { body { overflow: auto; } .wrap { height: auto; min-height: 100vh; } .tab-shell, .tab-content, .tab-pane { min-height: auto; } .tab-pane { height: auto; } .tab-pane.is-active { display: block; } .panel, .tab-body, .embed { overflow: visible; min-height: auto; height: auto; } .find { grid-template-columns: 1fr; width: 100%; } .discord-card { width: 100%; } .aura-media-strip { gap: 10px; } .aura-preview { width: 100%; flex-basis: 100%; } }
  </style>
</head>
<body>
  <div class="wrap">
    <h1>Aura Scanner</h1>
    <div class="meta" id="meta">Connecting...</div>
    <div class="tab-shell">
      <div class="tab-bar" role="tablist" aria-label="Aura sections">
        <button class="tab-button is-active" data-tab="current" role="tab" type="button" aria-selected="true">Top 1 Stats</button>
        <button class="tab-button" data-tab="latest" role="tab" type="button" aria-selected="false">Recent Feed</button>
        <button class="tab-button" data-tab="pinned" role="tab" type="button" aria-selected="false">Pinned</button>
        <button class="tab-button" data-tab="best" role="tab" type="button" aria-selected="false">Lowest Luck</button>
        <button class="tab-button" data-tab="rolls" role="tab" type="button" aria-selected="false">Least Rolls</button>
        <button class="tab-button" data-tab="rare" role="tab" type="button" aria-selected="false">Most Rare</button>
        <button class="tab-button" data-tab="potion" role="tab" type="button" aria-selected="false">Potion Finds</button>
        <button class="tab-button" data-tab="crafted" role="tab" type="button" aria-selected="false">Crafted Finds</button>
      </div>
      <div class="tab-content">
        <section class="tab-pane is-active" data-pane="current">
          <div class="panel">
            <h2>Top 1 Stats</h2>
            <div class="stats">
              <div id="scanCount"></div>
              <div id="filters"></div>
            </div>
            <div class="embed tab-body" id="bestEmbed">No result yet.</div>
          </div>
        </section>
        <section class="tab-pane" data-pane="latest">
          <div class="panel">
            <h2>Most Recent Finds (Session)</h2>
            <div id="latestSessionFinds" class="tab-body">No recent finds yet.</div>
          </div>
        </section>
        <section class="tab-pane" data-pane="pinned">
          <div class="panel">
            <h2>Pinned Stats</h2>
            <div id="pinnedFinds" class="tab-body">No pinned stats yet.</div>
          </div>
        </section>
        <section class="tab-pane" data-pane="best">
          <div class="panel">
            <h2>Top 3 Lowest Luck</h2>
            <div id="topBest" class="tab-body">No low-luck finds yet.</div>
          </div>
        </section>
        <section class="tab-pane" data-pane="rolls">
          <div class="panel">
            <h2>Top 3 Least Rolls</h2>
            <div id="leastRollFinds" class="tab-body">No least-roll finds yet.</div>
          </div>
        </section>
        <section class="tab-pane" data-pane="rare">
          <div class="panel">
            <h2>Top 3 Most Rare (Live Window)</h2>
            <div id="recentFinds" class="tab-body">No matching finds yet.</div>
          </div>
        </section>
        <section class="tab-pane" data-pane="potion">
          <div class="panel">
            <h2>Top 3 Potion Finds</h2>
            <div id="potionFinds" class="tab-body">No potion finds yet.</div>
          </div>
        </section>
        <section class="tab-pane" data-pane="crafted">
          <div class="panel">
            <h2>Top 3 Crafted Finds</h2>
            <div id="craftedFinds" class="tab-body">No crafted finds yet.</div>
          </div>
        </section>
      </div>
    </div>
  </div>
  <script>
    const API_BASE_URL_DEFAULT = ${JSON.stringify(normalizeApiBaseUrl(apiBaseUrl))};
    function normalizeClientApiBaseUrl(rawValue) {
      const trimmed = String(rawValue ?? '').trim();
      if (!trimmed || trimmed === '/') {
        return '';
      }
      return trimmed.replace(/\\/+$/, '');
    }
    function resolveRuntimeApiBaseUrl() {
      const queryValue = new URLSearchParams(window.location.search).get('api');
      if (queryValue) {
        const normalized = normalizeClientApiBaseUrl(queryValue);
        if (/^https?:\\/\\//i.test(normalized)) {
          try {
            localStorage.setItem('aura_api_base_url', normalized);
          } catch {}
          return normalized;
        }
      }
      try {
        const stored = normalizeClientApiBaseUrl(localStorage.getItem('aura_api_base_url') || '');
        if (stored && /^https?:\\/\\//i.test(stored)) {
          return stored;
        }
      } catch {}
      return API_BASE_URL_DEFAULT;
    }
    const API_BASE_URL = resolveRuntimeApiBaseUrl();
    const DISCORD_ICON_URL = API_BASE_URL
      ? API_BASE_URL + '/${DISCORD_BUTTON_ICON_PATH}'
      : '${DISCORD_BUTTON_ICON_PATH}';
    function buildApiUrl(pathname) {
      return API_BASE_URL ? API_BASE_URL + pathname : pathname;
    }

    const domCache = {
      meta: null,
      scanCount: null,
      filters: null,
      latestSessionFinds: null,
      pinnedFinds: null,
      topBest: null,
      bestEmbed: null,
      leastRollFinds: null,
      recentFinds: null,
      potionFinds: null,
      craftedFinds: null,
    };
    const EMBED_GRADIENT_CYCLE_MS = 2800;
    const relativeTimeFormatter = new Intl.RelativeTimeFormat('en', { numeric: 'auto' });

    function formatRelativeTimeFromUnix(unixSeconds) {
      const targetMs = Number(unixSeconds) * 1000;
      if (!Number.isFinite(targetMs)) {
        return '';
      }
      const diffSeconds = Math.round((targetMs - Date.now()) / 1000);
      const units = [
        ['year', 31536000],
        ['month', 2592000],
        ['day', 86400],
        ['hour', 3600],
        ['minute', 60],
        ['second', 1],
      ];
      for (const [unit, secondsPerUnit] of units) {
        if (Math.abs(diffSeconds) >= secondsPerUnit || unit === 'second') {
          return relativeTimeFormatter.format(Math.round(diffSeconds / secondsPerUnit), unit);
        }
      }
      return '';
    }

    function refreshRelativeTimes() {
      document.querySelectorAll('.live-relative-time').forEach((element) => {
        const nextText = formatRelativeTimeFromUnix(element.dataset.unix);
        if (element.textContent !== nextText) {
          element.textContent = nextText;
        }
      });
    }

    function startEmbedGradientClock() {
      const rootStyle = document.documentElement.style;
      function tick(now) {
        const progress = (now % EMBED_GRADIENT_CYCLE_MS) / EMBED_GRADIENT_CYCLE_MS;
        rootStyle.setProperty('--embed-shift', (progress * 220).toFixed(3) + '%');
        requestAnimationFrame(tick);
      }
      requestAnimationFrame(tick);
    }

    function setTextIfChanged(id, nextValue, cacheKey) {
      if (domCache[cacheKey] === nextValue) {
        return;
      }
      domCache[cacheKey] = nextValue;
      document.getElementById(id).textContent = nextValue;
    }

    function setHtmlIfChanged(id, nextValue, cacheKey) {
      if (domCache[cacheKey] === nextValue) {
        return;
      }
      domCache[cacheKey] = nextValue;
      const element = document.getElementById(id);
      const nextToken = String((Number(element.dataset.swapToken || '0') + 1));
      element.dataset.swapToken = nextToken;
      element.classList.remove('swap-stage-in');
      element.classList.add('swap-stage-out');
      window.setTimeout(() => {
        if (element.dataset.swapToken !== nextToken) {
          return;
        }
        element.innerHTML = nextValue;
        void hydratePersistentAuraMedia();
        element.classList.remove('swap-stage-out');
        element.classList.add('swap-stage-in');
        requestAnimationFrame(() => {
          requestAnimationFrame(() => {
            if (element.dataset.swapToken !== nextToken) {
              return;
            }
            element.classList.remove('swap-stage-in');
          });
        });
      }, 140);
    }

    function escapeHtmlText(value) {
      return String(value ?? '')
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&#39;');
    }

    function setActiveTab(tabKey) {
      document.querySelectorAll('[data-tab]').forEach((button) => {
        const isActive = button.dataset.tab === tabKey;
        button.classList.toggle('is-active', isActive);
        button.setAttribute('aria-selected', isActive ? 'true' : 'false');
      });
      document.querySelectorAll('[data-pane]').forEach((pane) => {
        pane.classList.toggle('is-active', pane.dataset.pane === tabKey);
      });
      scheduleAuraVideoPlaybackUpdate();
    }

    function renderDiscordJumpLink(url) {
      if (!url) {
        return '';
      }
      return '<a class="discord-jump" href="' + url + '" target="_blank" rel="noreferrer">' +
        '<img class="discord-jump-icon" src="' + DISCORD_ICON_URL + '" alt="" width="18" height="18" />' +
        '<span class="discord-jump-label">Open this stat in Discord</span>' +
      '</a>';
    }

    function renderPinToggle(find) {
      if (!find.findingKey) {
        return '';
      }

      const safeKey = escapeHtmlText(find.findingKey);
      const pinnedClass = find.isPinned ? ' is-pinned' : '';
      return '<button class="pin-toggle' + pinnedClass + '" type="button" data-pin-key="' + safeKey + '" data-pinned="' + (find.isPinned ? '1' : '0') + '">' +
        (find.isPinned ? 'Unpin stat' : 'Pin stat') +
      '</button>';
    }

    function renderFindingActions(find) {
      const jumpLink = renderDiscordJumpLink(find.messageUrl);
      const pinToggle = renderPinToggle(find);
      if (!jumpLink && !pinToggle) {
        return '';
      }

      return '<div class="finding-action-row">' + jumpLink + pinToggle + '</div>';
    }

    function renderAuraMediaCard(auraName, kindLabel, mediaUrl, mediaType) {
      const safeName = escapeHtmlText(auraName);
      const safeKind = escapeHtmlText(kindLabel);
      if (!mediaUrl) {
        return '<aside class="aura-preview aura-preview-empty">' +
          '<div class="aura-preview-label">' + safeName + '</div>' +
          '<div class="aura-preview-kind">' + safeKind + '</div>' +
          '<div class="aura-preview-media-wrap">No Fandom media found.</div>' +
        '</aside>';
      }

      const safeUrl = escapeHtmlText(mediaUrl);
      const safeAlt = safeName + ' ' + safeKind.toLowerCase();
      const mediaHtml = mediaType === 'video'
        ? '<video class="aura-preview-media aura-preview-video" data-media-src="' + safeUrl + '" muted loop playsinline preload="none" disablepictureinpicture></video>'
        : '<img class="aura-preview-media" src="' + safeUrl + '" alt="' + safeAlt + '" loading="lazy" referrerpolicy="no-referrer" />';
      return '<aside class="aura-preview">' +
        '<div class="aura-preview-label">' + safeName + '</div>' +
        '<div class="aura-preview-kind">' + safeKind + '</div>' +
        '<div class="aura-preview-media-wrap">' +
          mediaHtml +
        '</div>' +
      '</aside>';
    }

    function renderAuraPreview(find) {
      if (!find.auraName) {
        return '';
      }

      const cards = [];
      if (find.auraPreviewUrl) {
        cards.push(renderAuraMediaCard(find.auraName, 'Preview', find.auraPreviewUrl, find.auraPreviewMediaType));
      }
      if (find.auraCutsceneUrl) {
        cards.push(renderAuraMediaCard(find.auraName, 'Opening', find.auraCutsceneUrl, find.auraCutsceneMediaType));
      }
      if (!cards.length) {
        cards.push(renderAuraMediaCard(find.auraName, 'Preview', '', 'image'));
      }

      return '<div class="aura-media-strip">' + cards.join('') + '</div>';
    }

    function renderFindingBlock(find, prefixText = '') {
      return '<div class="find">' +
        '<div class="find-main">' +
          (prefixText ? '<div class="small">' + prefixText + '</div>' : '') +
          find.embedHtml +
          renderFindingActions(find) +
        '</div>' +
        renderAuraPreview(find) +
      '</div>';
    }

    let stateEventSource = null;
    let stateStreamConnected = false;
    const AURA_MEDIA_CACHE_NAME = 'aura-media-cache-v1';
    let auraMediaCachePromise = null;
    const auraMediaBlobUrls = new Map();
    const auraMediaPersistPromises = new Map();
    const auraMediaCacheMisses = new Set();
    let auraMediaHydrationPromise = null;
    let auraVideoPlaybackFrame = 0;

    function supportsPersistentAuraMedia() {
      return typeof caches !== 'undefined' &&
        typeof URL !== 'undefined' &&
        typeof URL.createObjectURL === 'function';
    }

    function openAuraMediaCache() {
      if (!supportsPersistentAuraMedia()) {
        return Promise.resolve(null);
      }
      if (!auraMediaCachePromise) {
        auraMediaCachePromise = caches.open(AURA_MEDIA_CACHE_NAME).catch(() => null);
      }
      return auraMediaCachePromise;
    }

    async function resolveCachedAuraMediaUrl(sourceUrl) {
      if (!sourceUrl || !supportsPersistentAuraMedia()) {
        return '';
      }
      if (auraMediaBlobUrls.has(sourceUrl)) {
        return auraMediaBlobUrls.get(sourceUrl);
      }
      if (auraMediaCacheMisses.has(sourceUrl)) {
        return '';
      }

      const cache = await openAuraMediaCache();
      if (!cache) {
        return '';
      }

      try {
        const response = await cache.match(sourceUrl);
        if (!response || !response.ok) {
          auraMediaCacheMisses.add(sourceUrl);
          return '';
        }
        const blobUrl = URL.createObjectURL(await response.blob());
        auraMediaBlobUrls.set(sourceUrl, blobUrl);
        auraMediaCacheMisses.delete(sourceUrl);
        return blobUrl;
      } catch {
        return '';
      }
    }

    function persistAuraMediaUrl(sourceUrl) {
      if (!sourceUrl || !supportsPersistentAuraMedia()) {
        return Promise.resolve('');
      }
      if (auraMediaPersistPromises.has(sourceUrl)) {
        return auraMediaPersistPromises.get(sourceUrl);
      }

      const persistPromise = (async () => {
        const cache = await openAuraMediaCache();
        if (!cache) {
          return '';
        }

        try {
          const existing = await cache.match(sourceUrl);
          if (!existing) {
            const response = await fetch(sourceUrl, {
              cache: 'force-cache',
              credentials: 'omit',
              mode: 'cors',
            });
            if (!response.ok) {
              return '';
            }
            await cache.put(sourceUrl, response.clone());
          }
          auraMediaCacheMisses.delete(sourceUrl);
        } catch {
          return '';
        }

        return resolveCachedAuraMediaUrl(sourceUrl);
      })();

      auraMediaPersistPromises.set(sourceUrl, persistPromise);
      persistPromise.finally(() => {
        auraMediaPersistPromises.delete(sourceUrl);
      });
      return persistPromise;
    }

    function setAuraVideoSource(video, nextUrl) {
      if (!video || !nextUrl) {
        return;
      }

      if (video.dataset.activeMediaSrc !== nextUrl) {
        video.dataset.activeMediaSrc = nextUrl;
        video.src = nextUrl;
        video.load();
      }
      const playAttempt = video.play();
      if (playAttempt && typeof playAttempt.catch === 'function') {
        playAttempt.catch(() => {});
      }
    }

    function isAuraVideoInActivePane(video) {
      const pane = video.closest('.tab-pane');
      return !pane || pane.classList.contains('is-active');
    }

    function isAuraVideoInViewport(video) {
      if (!video.isConnected) {
        return false;
      }
      const rect = video.getBoundingClientRect();
      if (rect.width <= 0 || rect.height <= 0) {
        return false;
      }
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight || 0;
      return rect.bottom >= -80 && rect.top <= viewportHeight + 80;
    }

    function shouldAuraVideoPlay(video) {
      if (document.hidden) {
        return false;
      }
      return isAuraVideoInActivePane(video) && isAuraVideoInViewport(video);
    }

    function updateAuraVideoPlayback() {
      auraVideoPlaybackFrame = 0;
      const videos = document.querySelectorAll('video[data-media-src]');
      videos.forEach((video) => {
        if (!shouldAuraVideoPlay(video)) {
          if (!video.paused) {
            video.pause();
          }
          return;
        }

        const resolvedUrl = video.dataset.resolvedMediaSrc || video.dataset.mediaSrc || '';
        if (!resolvedUrl) {
          return;
        }
        setAuraVideoSource(video, resolvedUrl);
      });
    }

    function scheduleAuraVideoPlaybackUpdate() {
      if (auraVideoPlaybackFrame) {
        return;
      }
      auraVideoPlaybackFrame = requestAnimationFrame(updateAuraVideoPlayback);
    }

    async function hydratePersistentAuraMedia() {
      if (auraMediaHydrationPromise) {
        return auraMediaHydrationPromise;
      }
      auraMediaHydrationPromise = (async () => {
      const videos = Array.from(document.querySelectorAll('video[data-media-src]'));
      if (!videos.length) {
        return;
      }

      await Promise.all(videos.map(async (video) => {
        const sourceUrl = video.dataset.mediaSrc || '';
        if (!sourceUrl) {
          return;
        }

        if (!video.dataset.resolvedMediaSrc) {
          const cachedUrl = await resolveCachedAuraMediaUrl(sourceUrl);
          video.dataset.resolvedMediaSrc = cachedUrl || sourceUrl;
        }

        if (video.dataset.persistOnPlayBound === 'true') {
          return;
        }

        video.dataset.persistOnPlayBound = 'true';
        video.addEventListener('playing', () => {
          void persistAuraMediaUrl(sourceUrl);
        }, { once: true });
      }));
      scheduleAuraVideoPlaybackUpdate();
      })();
      try {
        await auraMediaHydrationPromise;
      } finally {
        auraMediaHydrationPromise = null;
      }
    }

    function applyState(state) {
      setTextIfChanged('meta', state.statusText, 'meta');
      setTextIfChanged('scanCount', 'Scanned: ' + state.scannedCount.toLocaleString('en-US'), 'scanCount');
      setTextIfChanged('filters', state.filterText, 'filters');
      const latest = state.latestSessionFinds.length
        ? state.latestSessionFinds.map((find, index) =>
            renderFindingBlock(
              find,
              '#' + (index + 1) + ' | Most recent first'
            )
          ).join('')
        : 'No recent finds yet.';
      setHtmlIfChanged('latestSessionFinds', latest, 'latestSessionFinds');
      const pinned = state.pinnedFinds.length
        ? state.pinnedFinds.map((find, index) =>
            renderFindingBlock(
              find,
              '#' + (index + 1) + ' | Pinned'
            )
          ).join('')
        : 'No pinned stats yet.';
      setHtmlIfChanged('pinnedFinds', pinned, 'pinnedFinds');
      const topBest = state.topBestFindings.length
        ? state.topBestFindings.map((find, index) =>
            renderFindingBlock(
              find,
              '#' + (index + 1) + ' | Luck: ' + find.luckText + ' | Rarity: 1 in ' + find.rarity.toLocaleString('en-US') + ' | Rolls: ' + find.rolls.toLocaleString('en-US') + (find.embedColor ? ' | Color: ' + find.embedColor : '')
            )
          ).join('')
        : 'No low-luck finds yet.';
      setHtmlIfChanged('topBest', topBest, 'topBest');
      const leastRolls = state.leastRollFinds.length
        ? state.leastRollFinds.map((find, index) =>
            renderFindingBlock(
              find,
              '#' + (index + 1) + ' | Rolls: ' + find.rolls.toLocaleString('en-US') + ' | Rarity: 1 in ' + find.rarity.toLocaleString('en-US') + ' | Luck: ' + find.luckText + (find.embedColor ? ' | Color: ' + find.embedColor : '')
            )
          ).join('')
        : 'No least-roll finds yet.';
      setHtmlIfChanged('leastRollFinds', leastRolls, 'leastRollFinds');
      const currentStatWinners = [];
      const lowestLuckWinner = state.topBestFindings[0] || null;
      const leastRollsWinner = state.leastRollFinds[0] || null;
      const mostRareWinner = state.recentFinds[0] || null;
      if (lowestLuckWinner) {
        currentStatWinners.push(
          renderFindingBlock(
            lowestLuckWinner,
            'Top 1 Lowest Luck | Luck: ' + lowestLuckWinner.luckText + ' | Rarity: 1 in ' + lowestLuckWinner.rarity.toLocaleString('en-US') + ' | Rolls: ' + lowestLuckWinner.rolls.toLocaleString('en-US') + (lowestLuckWinner.embedColor ? ' | Color: ' + lowestLuckWinner.embedColor : '')
          )
        );
      }
      if (leastRollsWinner) {
        currentStatWinners.push(
          renderFindingBlock(
            leastRollsWinner,
            'Top 1 Least Rolls | Rolls: ' + leastRollsWinner.rolls.toLocaleString('en-US') + ' | Rarity: 1 in ' + leastRollsWinner.rarity.toLocaleString('en-US') + ' | Luck: ' + leastRollsWinner.luckText + (leastRollsWinner.embedColor ? ' | Color: ' + leastRollsWinner.embedColor : '')
          )
        );
      }
      if (mostRareWinner) {
        currentStatWinners.push(
          renderFindingBlock(
            mostRareWinner,
            'Top 1 Most Rare | Rarity: 1 in ' + mostRareWinner.rarity.toLocaleString('en-US') + ' | Rolls: ' + mostRareWinner.rolls.toLocaleString('en-US') + ' | Luck: ' + mostRareWinner.luckText + (mostRareWinner.embedColor ? ' | Color: ' + mostRareWinner.embedColor : '')
          )
        );
      }
      const bestEmbed = currentStatWinners.length
        ? currentStatWinners.join('')
        : 'No top-1 finds yet.';
      setHtmlIfChanged('bestEmbed', bestEmbed, 'bestEmbed');
      const recent = state.recentFinds.length
        ? state.recentFinds.map((find) =>
            renderFindingBlock(
              find,
              'Score: ' + find.score + ' | Rarity: 1 in ' + find.rarity.toLocaleString('en-US') + ' | Rolls: ' + find.rolls.toLocaleString('en-US') + ' | Luck: ' + find.luckText + (find.embedColor ? ' | Color: ' + find.embedColor : '')
            )
          ).join('')
        : 'No matching finds yet.';
      setHtmlIfChanged('recentFinds', recent, 'recentFinds');
      const potion = state.potionFinds.length
        ? state.potionFinds.map((find) =>
            renderFindingBlock(
              find,
              'Score: ' + find.score + ' | Rarity: 1 in ' + find.rarity.toLocaleString('en-US') + ' | Rolls: ' + find.rolls.toLocaleString('en-US') + ' | Luck: ' + find.luckText + (find.embedColor ? ' | Color: ' + find.embedColor : '')
            )
          ).join('')
        : 'No potion finds yet.';
      setHtmlIfChanged('potionFinds', potion, 'potionFinds');
      const crafted = state.craftedFinds.length
        ? state.craftedFinds.map((find) =>
            renderFindingBlock(
              find,
              'Score: ' + find.score + ' | Rarity: 1 in ' + find.rarity.toLocaleString('en-US') + ' | Rolls: ' + find.rolls.toLocaleString('en-US') + ' | Luck: ' + find.luckText + (find.embedColor ? ' | Color: ' + find.embedColor : '')
            )
          ).join('')
        : 'No crafted finds yet.';
      setHtmlIfChanged('craftedFinds', crafted, 'craftedFinds');
      refreshRelativeTimes();
      void hydratePersistentAuraMedia();
    }

    async function refresh() {
      const response = await fetch(buildApiUrl('/state'), { cache: 'no-store' });
      applyState(await response.json());
    }

    async function togglePinnedFinding(findingKey, shouldPin) {
      const response = await fetch(buildApiUrl('/pin'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ findingKey, pinned: shouldPin }),
      });
      if (!response.ok) {
        throw new Error('Pin update failed');
      }
    }

    function connectStateStream() {
      if (stateEventSource) {
        stateEventSource.close();
      }

      const eventSource = new EventSource(buildApiUrl('/events'));
      stateEventSource = eventSource;
      eventSource.addEventListener('open', () => {
        stateStreamConnected = true;
      });
      eventSource.addEventListener('state', (event) => {
        try {
          stateStreamConnected = true;
          applyState(JSON.parse(event.data));
        } catch {}
      });
      eventSource.addEventListener('error', () => {
        stateStreamConnected = false;
        eventSource.close();
        if (stateEventSource === eventSource) {
          stateEventSource = null;
          setTimeout(connectStateStream, 1000);
        }
      });
    }

    document.querySelectorAll('[data-tab]').forEach((button) => {
      button.addEventListener('click', () => setActiveTab(button.dataset.tab));
    });
    document.addEventListener('click', (event) => {
      const button = event.target.closest('button.pin-toggle[data-pin-key]');
      if (!button) {
        return;
      }

      const findingKey = button.dataset.pinKey || '';
      if (!findingKey) {
        return;
      }

      const shouldPin = button.dataset.pinned !== '1';
      button.disabled = true;
      togglePinnedFinding(findingKey, shouldPin)
        .catch(() => refresh().catch(() => {}))
        .finally(() => {
          button.disabled = false;
        });
    });
    startEmbedGradientClock();
    refresh().catch(() => {});
    connectStateStream();
    window.addEventListener('scroll', scheduleAuraVideoPlaybackUpdate, { passive: true });
    window.addEventListener('resize', scheduleAuraVideoPlaybackUpdate);
    document.addEventListener('visibilitychange', scheduleAuraVideoPlaybackUpdate);
    setInterval(() => {
      if (stateStreamConnected) {
        return;
      }
      refresh().catch(() => {});
    }, 15000);
    setInterval(refreshRelativeTimes, 1000);
  </script>
</body>
</html>`;
}

async function serializeAppState() {
  return {
    ...appState,
    bestFinding: appState.bestFinding ? await findingToViewModel(appState.bestFinding) : null,
    topBestFindings: await Promise.all(appState.topBestFindings.map((finding) => findingToViewModel(finding))),
    leastRollFinds: await Promise.all(appState.leastRollFinds.map((finding) => findingToViewModel(finding))),
    recentFinds: await Promise.all(appState.recentFinds.map((finding) => findingToViewModel(finding))),
    latestSessionFinds: await Promise.all(appState.latestSessionFinds.map((finding) => findingToViewModel(finding))),
    potionFinds: await Promise.all(appState.potionFinds.map((finding) => findingToViewModel(finding))),
    craftedFinds: await Promise.all(appState.craftedFinds.map((finding) => findingToViewModel(finding))),
    pinnedFinds: await Promise.all(appState.pinnedFinds.map((finding) => findingToViewModel(finding))),
  };
}

function writeSseEvent(response, eventName, payload) {
  response.write(`event: ${eventName}\n`);
  response.write(`data: ${JSON.stringify(payload)}\n\n`);
}

async function broadcastStateNow() {
  if (!stateSubscribers.size) {
    return;
  }

  const serializedState = await serializeAppState();
  for (const response of [...stateSubscribers]) {
    if (response.destroyed || response.writableEnded) {
      stateSubscribers.delete(response);
      continue;
    }

    try {
      writeSseEvent(response, "state", serializedState);
    } catch {
      stateSubscribers.delete(response);
      response.end();
    }
  }
}

function scheduleStateBroadcast() {
  if (!stateSubscribers.size) {
    return;
  }
  if (stateBroadcastInFlight) {
    pendingStateBroadcast = true;
    return;
  }

  stateBroadcastInFlight = true;
  void (async () => {
    try {
      do {
        pendingStateBroadcast = false;
        await broadcastStateNow();
      } while (pendingStateBroadcast);
    } catch (error) {
      console.error(`State broadcast failed: ${error?.message ?? String(error)}`);
    } finally {
      stateBroadcastInFlight = false;
    }
  })();
}

function readJsonRequestBody(request) {
  return new Promise((resolve, reject) => {
    let payload = "";
    request.setEncoding("utf8");
    request.on("data", (chunk) => {
      payload += chunk;
      if (payload.length > 100_000) {
        reject(new Error("Request body too large."));
        request.destroy();
      }
    });
    request.on("end", () => {
      if (!payload) {
        resolve({});
        return;
      }
      try {
        resolve(JSON.parse(payload));
      } catch (error) {
        reject(error);
      }
    });
    request.on("error", reject);
  });
}

function resolveCorsOrigin(requestOrigin) {
  if (CORS_ALLOWED_ORIGINS.includes("*")) {
    return "*";
  }
  const normalizedOrigin = String(requestOrigin ?? "").trim();
  if (normalizedOrigin && CORS_ALLOWED_ORIGINS.includes(normalizedOrigin)) {
    return normalizedOrigin;
  }
  return "";
}

function applyCorsHeaders(request, response) {
  const allowedOrigin = resolveCorsOrigin(request.headers.origin);
  if (allowedOrigin) {
    response.setHeader("Access-Control-Allow-Origin", allowedOrigin);
    if (allowedOrigin !== "*") {
      response.setHeader("Vary", "Origin");
    }
  }
  response.setHeader("Access-Control-Allow-Methods", "GET,POST,OPTIONS");
  response.setHeader("Access-Control-Allow-Headers", "Content-Type");
}

function startDashboardServer(apiBaseUrl = DASHBOARD_API_BASE_URL) {
  const server = http.createServer(async (request, response) => {
    const requestOrigin = request.headers.host || `127.0.0.1:${GUI_PORT}`;
    const requestUrl = new URL(request.url || "/", `http://${requestOrigin}`);
    applyCorsHeaders(request, response);

    if (request.method === "OPTIONS") {
      response.writeHead(204, { "Cache-Control": "no-store" });
      response.end();
      return;
    }

    if (request.url === "/" + DISCORD_BUTTON_ICON_PATH) {
      try {
        const iconBuffer = fs.readFileSync(DISCORD_BUTTON_ICON_PATH);
        response.writeHead(200, { "Content-Type": "image/png", "Cache-Control": "no-store" });
        response.end(iconBuffer);
      } catch {
        response.writeHead(404, { "Content-Type": "text/plain; charset=utf-8", "Cache-Control": "no-store" });
        response.end("Not found");
      }
      return;
    }

    if (requestUrl.pathname === "/events") {
      response.writeHead(200, {
        "Content-Type": "text/event-stream; charset=utf-8",
        "Cache-Control": "no-store",
        Connection: "keep-alive",
      });
      response.write("retry: 1000\n\n");
      stateSubscribers.add(response);
      void serializeAppState()
        .then((serializedState) => {
          if (!response.destroyed && !response.writableEnded) {
            writeSseEvent(response, "state", serializedState);
          }
        })
        .catch(() => {});
      request.on("close", () => {
        stateSubscribers.delete(response);
      });
      return;
    }

    if (requestUrl.pathname === "/pin" && request.method === "POST") {
      try {
        const body = await readJsonRequestBody(request);
        const findingKey = typeof body?.findingKey === "string" ? body.findingKey : "";
        const shouldPin = body?.pinned !== false;

        if (!findingKey) {
          response.writeHead(400, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
          response.end(JSON.stringify({ error: "findingKey is required." }));
          return;
        }

        if (!setPinnedFinding(findingKey, shouldPin)) {
          response.writeHead(404, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
          response.end(JSON.stringify({ error: "Finding not available to pin." }));
          return;
        }

        scheduleStateBroadcast();
        response.writeHead(204, { "Cache-Control": "no-store" });
        response.end();
      } catch (error) {
        response.writeHead(400, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
        response.end(JSON.stringify({ error: error?.message ?? "Invalid request." }));
      }
      return;
    }

    if (requestUrl.pathname === "/state") {
      const serializedState = await serializeAppState();
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify(serializedState));
      return;
    }

    if (requestUrl.pathname === "/health") {
      response.writeHead(200, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
      response.end(JSON.stringify({ ok: true }));
      return;
    }

    response.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    response.end(renderDashboardHtml(apiBaseUrl));
  });

  server.listen(GUI_PORT, GUI_HOST);
  return server;
}

async function fetchMessages(channel, requestedLimit, maxRolls = DEFAULT_MAX_ROLLS) {
  const findings = [];
  const savedInterestingKeys = new Set();
  const pendingInterestingEntries = [];
  let bestOverall = null;
  let remaining = Number.isFinite(requestedLimit) ? requestedLimit : Number.POSITIVE_INFINITY;
  let before = undefined;
  let scannedCount = 0;

  while (remaining > 0) {
    const batchSize = Math.min(BATCH_SIZE, remaining);
    updateStatusLine(scannedCount, bestOverall);
    const options = before ? { limit: batchSize, before } : { limit: batchSize };
    const messages = await channel.messages.fetch(options);
    if (!messages.size) {
      break;
    }

    const batchFindings = [];
    for (const message of messages.values()) {
      for (const snapshot of snapshotsFromMessage(message)) {
        const parsed = extractFindingsFromSnapshot(snapshot, false);
        let displayText = null;
        let embedModel = null;
        const eligibleFindings = [];
        for (const finding of parsed) {
          if (!passesThresholds(finding, maxRolls)) {
            continue;
          }
          if (displayText === null) {
            displayText = buildDisplayText(snapshot);
            embedModel = buildEmbedModel(snapshot);
          }
          eligibleFindings.push({
            ...finding,
            sourceText: displayText,
            displayText,
            embedModel,
          });
        }
        batchFindings.push(...eligibleFindings);
        findings.push(...eligibleFindings);
        for (const finding of eligibleFindings) {
          const findingKey = getFindingKey(finding);
          if (!savedInterestingKeys.has(findingKey) && isInterestingFinding(finding, maxRolls)) {
            savedInterestingKeys.add(findingKey);
            pendingInterestingEntries.push(buildInterestingFindingText(finding));
          }
        }
      }
    }

    if (pendingInterestingEntries.length) {
      fs.appendFileSync(INTERESTING_OUTPUT_PATH, pendingInterestingEntries.join(""), "utf8");
      pendingInterestingEntries.length = 0;
    }

    scannedCount += messages.size;
    if (batchFindings.length) {
      const batchBest = selectBestFinding(batchFindings);
      if (!bestOverall || compareFindings(batchBest, bestOverall) < 0) {
        bestOverall = batchBest;
        renderNewBestScreen(bestOverall, scannedCount, maxRolls);
      } else {
        updateStatusLine(scannedCount, bestOverall, maxRolls);
      }
    } else {
      updateStatusLine(scannedCount, bestOverall, maxRolls);
    }

    before = messages.lastKey();
    remaining -= messages.size;

    if (messages.size < batchSize) {
      break;
    }
  }

  process.stdout.write("\n");

  return rankFindings(findings);
}

async function collectFindingsFromMessages(messages, savedInterestingKeys, maxRolls = DEFAULT_MAX_ROLLS) {
  const findings = collectEligibleFindingsFromMessages(messages, maxRolls);
  const pendingInterestingEntries = [];
  const newlySavedFinds = [];

  rememberKnownFindings(findings);
  refreshPinnedFinds();

  for (const hydratedFinding of findings) {
    const findingKey = getFindingKey(hydratedFinding);
    if (!savedInterestingKeys.has(findingKey) && isInterestingFinding(hydratedFinding, maxRolls)) {
      savedInterestingKeys.add(findingKey);
      pendingInterestingEntries.push(buildInterestingFindingText(hydratedFinding));
      newlySavedFinds.push(hydratedFinding);
    }
  }

  if (pendingInterestingEntries.length) {
    fs.appendFileSync(INTERESTING_OUTPUT_PATH, pendingInterestingEntries.join(""), "utf8");
  }

  return { findings, newlySavedFinds };
}

function collectEligibleFindingsFromMessages(messages, maxRolls = DEFAULT_MAX_ROLLS) {
  const findings = [];

  for (const message of messages) {
    for (const snapshot of snapshotsFromMessage(message)) {
      const parsed = extractFindingsFromSnapshot(snapshot, false);
      let displayText = null;
      let embedModel = null;

      for (const finding of parsed) {
        if (!passesThresholds(finding, maxRolls)) {
          continue;
        }
        if (displayText === null) {
          displayText = buildDisplayText(snapshot);
          embedModel = buildEmbedModel(snapshot);
        }
        findings.push({
          ...finding,
          sourceText: displayText,
          displayText,
          embedModel,
        });
      }
    }
  }

  return findings;
}

function refreshLiveDashboardFromMessages(recentMessages, scannedCount, maxRolls = DEFAULT_MAX_ROLLS) {
  const recentSampleFindings = collectEligibleFindingsFromMessages(recentMessages, maxRolls);
  const latestDiscoveryFindings = getLatestDiscoveryFindings(
    recentSampleFindings,
    RECENT_SECTION_MESSAGE_LIMIT
  );
  const latestCraftedFindings = latestDiscoveryFindings.filter((finding) => isCraftedFinding(finding));
  const latestPotionFindings = latestDiscoveryFindings.filter(
    (finding) => !isCraftedFinding(finding) && isPotionFinding(finding)
  );
  const latestAuraFindings = latestDiscoveryFindings.filter(
    (finding) => !isCraftedFinding(finding) && !isPotionFinding(finding)
  );

  if (!recentSampleFindings.length) {
    appState.topBestFindings = [];
    appState.leastRollFinds = [];
    appState.bestFinding = null;
    appState.recentFinds = [];
    appState.potionFinds = [];
    appState.craftedFinds = [];
    updateStatusLine(scannedCount, null, maxRolls);
    return;
  }

  const currentBest = selectBestFinding(latestAuraFindings);
  appState.topBestFindings = getTopBestRawFindings(latestAuraFindings);
  appState.leastRollFinds = getTopLeastRollRawFindings(latestAuraFindings);
  appState.recentFinds = getTopRarestRawFindings(latestAuraFindings);
  appState.potionFinds = getTopRarestRawFindings(latestPotionFindings);
  appState.craftedFinds = getTopRarestRawFindings(latestCraftedFindings);
  updateStatusLine(scannedCount, currentBest, maxRolls);
}

function upsertRecentMessage(recentMessages, message, limit) {
  const messageId = message?.id ?? null;
  if (!messageId) {
    return;
  }

  const existingIndex = recentMessages.findIndex((entry) => entry?.id === messageId);
  if (existingIndex >= 0) {
    recentMessages[existingIndex] = message;
    return;
  }

  recentMessages.push(message);
  while (recentMessages.length > limit) {
    recentMessages.shift();
  }
}

async function hydrateLiveMessage(message) {
  if (!message) {
    return null;
  }

  if (message.partial && typeof message.fetch === "function") {
    try {
      return await message.fetch();
    } catch (error) {
      console.warn(
        `Failed to hydrate live message ${message.id ?? "unknown"}: ${error?.message ?? String(error)}`
      );
      return null;
    }
  }

  return message;
}

async function monitorLatestMessages(client, channel, requestedLimit, maxRolls = DEFAULT_MAX_ROLLS) {
  const state = {
    savedInterestingKeys: new Set(),
    scannedCount: 0,
    seenMessageIds: new Set(),
    seenMessageOrder: [],
    recentMessages: [],
  };
  const liveWindowSize = Math.max(
    1,
    Math.min(BATCH_SIZE, Number.isFinite(requestedLimit) ? requestedLimit : BATCH_SIZE)
  );
  const trackedChannelId = String(channel.id);
  let processingQueue = Promise.resolve();

  const queueWork = (work) => {
    processingQueue = processingQueue
      .then(work)
      .catch((error) => {
        const message = error?.message ?? String(error);
        appState.statusText = `Live scan failed: ${message}`;
        scheduleStateBroadcast();
        console.error(`Live scan failed: ${message}`);
      });
    return processingQueue;
  };

  const processIncomingMessage = async (incomingMessage) => {
    const message = await hydrateLiveMessage(incomingMessage);
    if (!message) {
      return;
    }

    const messageChannelId = String(message.channelId ?? message.channel?.id ?? "");
    if (messageChannelId !== trackedChannelId) {
      return;
    }

    if (rememberMessageId(state.seenMessageIds, state.seenMessageOrder, message.id)) {
      state.scannedCount += 1;
    }

    upsertRecentMessage(state.recentMessages, message, liveWindowSize);
    const { newlySavedFinds } = await collectFindingsFromMessages([message], state.savedInterestingKeys, maxRolls);
    mergeLatestSessionFinds(newlySavedFinds);
    refreshLiveDashboardFromMessages(state.recentMessages, state.scannedCount, maxRolls);
  };

  client.on("messageCreate", (message) => {
    void queueWork(() => processIncomingMessage(message));
  });
  client.on("messageUpdate", (_oldMessage, newMessage) => {
    void queueWork(() => processIncomingMessage(newMessage));
  });

  await queueWork(async () => {
    setDashboardStatus(`Seeding latest ${liveWindowSize} messages...`, 0, maxRolls);
    const seededSnapshot = await channel.messages.fetch({ limit: liveWindowSize });
    const seededMessages = Array.from(seededSnapshot.values()).reverse();
    state.recentMessages = seededMessages.slice(-liveWindowSize);

    const { newlySavedFinds } = await collectFindingsFromMessages(seededMessages, state.savedInterestingKeys, maxRolls);
    mergeLatestSessionFinds(newlySavedFinds);
    for (const message of seededMessages) {
      if (rememberMessageId(state.seenMessageIds, state.seenMessageOrder, message.id)) {
        state.scannedCount += 1;
      }
    }

    refreshLiveDashboardFromMessages(state.recentMessages, state.scannedCount, maxRolls);
  });

  await new Promise(() => {});
}

function formatRarity(rarity) {
  return `1 in ${rarity.toLocaleString("en-US")}`;
}

function formatFindingSummary(finding, index = null) {
  const prefix = index === null ? "" : `${String(index).padStart(2, " ")}. `;
  const auraLabel = finding.auraName ?? "Unknown Aura";
  const authorLabel = finding.authorName ? ` by ${finding.authorName}` : "";
  return (
    `${prefix}${auraLabel}${authorLabel}\n` +
    `    rarity: ${formatRarity(finding.rarity)}\n` +
    `    rolls : ${finding.rolls.toLocaleString("en-US")}\n` +
    `    luck  : ${finding.luck.toFixed(3)}`
  );
}

function formatEmbedText(finding) {
  return (finding.displayText || finding.sourceText)
    .split("\n")
    .map((line) => `    ${line}`)
    .join("\n");
}

function printBestSoFar(finding) {
  console.log("Best so far");
  console.log(formatEmbedText(finding));
  if (finding.messageUrl) {
    console.log(`    link  : ${finding.messageUrl}`);
  }
}

function renderNewBestScreen(finding, scannedCount, maxRolls = DEFAULT_MAX_ROLLS) {
  appState.scannedCount = scannedCount;
  appState.filterText = `Filters: ${formatThresholdSummary(maxRolls)}`;
  appState.bestFinding = finding;
  appState.statusText = "New best found. Watching newest messages...";
  scheduleStateBroadcast();
  console.clear();
  console.log(`Scanned ${scannedCount.toLocaleString("en-US")} messages`);
  console.log(
    RANKING_MODE === "efficient"
      ? "Ranked by: best rarity efficiency (rarity vs rolls and luck)"
      : "Ranked by: highest rarity -> lowest rolls -> lowest luck"
  );
  console.log(`Filters: ${formatThresholdSummary(maxRolls)}`);
  console.log("");
  printBestSoFar(finding);
  console.log("");
  console.log("Watching newest messages for a better result...");
}

function updateStatusLine(scannedCount, bestOverall, maxRolls = DEFAULT_MAX_ROLLS) {
  const baseText = bestOverall
    ? `best overall ${formatRarity(bestOverall.rarity)} | rolls ${bestOverall.rolls.toLocaleString("en-US")} | luck ${bestOverall.luck.toFixed(3)}`
    : `no match yet (${formatThresholdSummary(maxRolls)})`;
  const bestText = `${baseText} | listening live for new messages`;
  appState.scannedCount = scannedCount;
  appState.filterText = `Filters: ${formatThresholdSummary(maxRolls)}`;
  appState.bestFinding = bestOverall ?? null;
  appState.statusText = bestText;
  process.stdout.write(
    `\rScanned ${scannedCount.toLocaleString("en-US")} messages... ${bestText}      `
  );
  scheduleStateBroadcast();
}

function setDashboardStatus(statusText, scannedCount = appState.scannedCount, maxRolls = DEFAULT_MAX_ROLLS) {
  appState.scannedCount = scannedCount;
  appState.filterText = `Filters: ${formatThresholdSummary(maxRolls)}`;
  appState.statusText = statusText;
  scheduleStateBroadcast();
}

function printFindings(findings, top, maxRolls = DEFAULT_MAX_ROLLS) {
  if (!findings.length) {
    console.log("No parseable records with rarity, rolls, and luck were found.");
    return;
  }

  console.log("");
  console.log("Top Results");
  console.log(
    RANKING_MODE === "efficient"
      ? "Ranked by: best rarity efficiency (rarity vs rolls and luck)"
      : "Ranked by: highest rarity -> lowest rolls -> lowest luck"
  );
  console.log(`Filters: ${formatThresholdSummary(maxRolls)}`);
  console.log("");

  findings.slice(0, top).forEach((finding, index) => {
    console.log(formatFindingSummary(finding, index + 1));
    if (finding.messageUrl) {
      console.log(`    link  : ${finding.messageUrl}`);
    }
    console.log("");
  });
}

function parseArgs(argv) {
  const options = {
    channelId: DEFAULT_CHANNEL_ID,
    token: null,
    limit: null,
    top: 15,
    maxRolls: DEFAULT_MAX_ROLLS,
    exportStatic: false,
    outPath: path.join("docs", "index.html"),
    apiBaseUrl: DASHBOARD_API_BASE_URL,
  };

  const args = [...argv];
  while (args.length) {
    const current = args.shift();
    if (!current) {
      continue;
    }

    if (current === "--help" || current === "-h") {
      options.help = true;
      break;
    }

    if (current === "--token") {
      options.token = args.shift() ?? null;
      continue;
    }

    if (current === "--limit") {
      const raw = args.shift();
      options.limit = raw ? Number.parseInt(raw, 10) : null;
      continue;
    }

    if (current === "--top") {
      const raw = args.shift();
      options.top = raw ? Number.parseInt(raw, 10) : 15;
      continue;
    }

    if (current === "--max-rolls") {
      const raw = args.shift();
      options.maxRolls = raw ? Number.parseInt(raw, 10) : DEFAULT_MAX_ROLLS;
      continue;
    }

    if (current === "--api-base") {
      options.apiBaseUrl = normalizeApiBaseUrl(args.shift() ?? "");
      continue;
    }

    if (current === "--out") {
      options.outPath = args.shift() ?? options.outPath;
      continue;
    }

    if (current === "--export-static") {
      options.exportStatic = true;
      continue;
    }

    if (!current.startsWith("--")) {
      options.channelId = current;
      continue;
    }

    throw new Error(`Unknown argument: ${current}`);
  }

  return options;
}

function printHelp() {
  console.log("usage: node aura_scanner.js [channel_id] [--token TOKEN] [--limit LIMIT] [--top TOP] [--max-rolls N] [--api-base URL]");
  console.log("       node aura_scanner.js --export-static [--api-base URL] [--out PATH]");
  console.log("");
  console.log("Watch the newest messages in a Discord channel and keep the dashboard updated with new qualifying finds.");
  console.log("Use --export-static to build a GitHub Pages-compatible dashboard HTML file.");
}

function resolveToken(cliToken) {
  return cliToken || process.env.DISCORD_TOKEN || HARDCODED_TOKEN;
}

async function loginWithTimeout(client, token, timeoutMs = 45_000) {
  return new Promise((resolve, reject) => {
    const timeoutHandle = setTimeout(() => {
      reject(new Error("Discord login timed out. This host may be blocked/challenged by Discord."));
    }, timeoutMs);
    client
      .login(token)
      .then(resolve)
      .catch(reject)
      .finally(() => clearTimeout(timeoutHandle));
  });
}

function exportStaticDashboard(outPath, apiBaseUrl) {
  const outputPath = path.resolve(outPath || path.join("docs", "index.html"));
  const outputDir = path.dirname(outputPath);
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(outputPath, renderDashboardHtml(apiBaseUrl), "utf8");
  const iconSourcePath = path.resolve(DISCORD_BUTTON_ICON_PATH);
  if (fs.existsSync(iconSourcePath)) {
    fs.copyFileSync(iconSourcePath, path.join(outputDir, DISCORD_BUTTON_ICON_PATH));
  }
  console.log(`Static dashboard exported to ${outputPath}`);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (options.help) {
    printHelp();
    return;
  }

  if (options.exportStatic) {
    exportStaticDashboard(options.outPath, options.apiBaseUrl);
    return;
  }

  const token = resolveToken(options.token);
  if (!token) {
    throw new Error("No Discord token provided. Pass --token or set DISCORD_TOKEN.");
  }

  const client = new Client({ checkUpdate: false });
  const dashboardServer = startDashboardServer(options.apiBaseUrl);

  try {
    setDashboardStatus("Connecting to Discord...");
    console.log(`Dashboard: http://localhost:${GUI_PORT}`);
    console.log(`Server bind: ${GUI_HOST}:${GUI_PORT}`);
    await loginWithTimeout(client, token);
    setDashboardStatus("Logged in. Fetching channel...");
    console.log(`Logged in as ${client.user?.username ?? "unknown user"}.`);
    const channel = await client.channels.fetch(options.channelId);
    if (!channel || !channel.messages || typeof channel.messages.fetch !== "function") {
      throw new Error(`Channel ${options.channelId} does not support message fetching.`);
    }
    setDashboardStatus("Channel ready. Starting live scan...", 0, options.maxRolls);
    await monitorLatestMessages(client, channel, options.limit, options.maxRolls);
  } finally {
    client.destroy();
    dashboardServer.close();
  }
}

main().catch((error) => {
  const message = error?.message ?? String(error);
  appState.statusText = `Scan failed: ${message}`;
  scheduleStateBroadcast();
  console.error(`Scan failed: ${message}`);
  process.exitCode = 1;
});

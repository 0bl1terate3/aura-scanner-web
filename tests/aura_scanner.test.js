const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const vm = require("node:vm");
const { createRequire } = require("node:module");

const SCANNER_PATH = path.resolve(__dirname, "..", "aura_scanner.js");
const CRIMSON_MOON_NAME = "赤月の破片 (Fragments of the Crimson Moon)";
const CRIMSON_MOON_IMAGE =
  "https://static.wikia.nocookie.net/sol-rng/images/0/0b/Screenshot_2026-02-28_192815.png/revision/latest/scale-to-width/360?cb=20260228112857";
const MEMORY_FALLEN_NAME = "Memory, The Fallen";
const MEMORY_FALLEN_IMAGE =
  "https://static.wikia.nocookie.net/sol-rng/images/a/ad/MemoryCollectionEon1.gif/revision/latest?cb=20241112030214";
const ATLAS_NAME = "Atlas: A.T.L.A.S.";
const ATLAS_IMAGE =
  "https://static.wikia.nocookie.net/sol-rng/images/e/e4/A.T.L.A.S.COLLECTION.gif/revision/latest?cb=20260217065915";

function loadScannerInternals() {
  const source = fs.readFileSync(SCANNER_PATH, "utf8");
  const entrypointPattern = /\nmain\(\)\.catch\(\(error\) => \{[\s\S]*?\n\}\);\s*$/;
  const instrumented = source.replace(
    entrypointPattern,
    "\nmodule.exports = { parseAuraName, AURA_PREVIEW_URL_OVERRIDES, AURA_CUTSCENE_URL_OVERRIDES, normalizeComparableText, pickBestAuraPreviewFile, pickBestAuraCutsceneFile, inferAuraMediaType, canonicalizeAuraMediaUrl };\n"
  );

  assert.notEqual(instrumented, source, "Expected to remove the script entrypoint for testing.");

  const context = {
    module: { exports: {} },
    exports: {},
    require: createRequire(SCANNER_PATH),
    __dirname: path.dirname(SCANNER_PATH),
    __filename: SCANNER_PATH,
    console,
    process,
    Buffer,
    setTimeout,
    clearTimeout,
    setInterval,
    clearInterval,
    setImmediate,
    clearImmediate,
  };
  context.global = context;
  context.globalThis = context;

  vm.runInNewContext(instrumented, context, { filename: SCANNER_PATH });
  return context.module.exports;
}

test("maps Fragment of Chaos messages to the crimson moon aura name", () => {
  const { parseAuraName } = loadScannerInternals();

  assert.equal(
    parseAuraName("| HoUsE(@jasonkjw1) has gotten the Fragment of Chaos."),
    CRIMSON_MOON_NAME
  );
});

test("uses the crimson moon image override for the custom aura name", () => {
  const { AURA_PREVIEW_URL_OVERRIDES, normalizeComparableText } = loadScannerInternals();

  assert.equal(
    AURA_PREVIEW_URL_OVERRIDES[normalizeComparableText(CRIMSON_MOON_NAME)],
    CRIMSON_MOON_IMAGE
  );
});

test("parses simple has found messages with punctuation", () => {
  const { parseAuraName } = loadScannerInternals();

  assert.equal(
    parseAuraName("@VTX_Mint HAS FOUND Memory, The Fallen!"),
    MEMORY_FALLEN_NAME
  );
});

test("uses the provided image override for Memory, The Fallen", () => {
  const { AURA_PREVIEW_URL_OVERRIDES, normalizeComparableText } = loadScannerInternals();

  assert.equal(
    AURA_PREVIEW_URL_OVERRIDES[normalizeComparableText(MEMORY_FALLEN_NAME)],
    MEMORY_FALLEN_IMAGE
  );
});

test("parses crafted atlas messages", () => {
  const { parseAuraName } = loadScannerInternals();

  assert.equal(
    parseAuraName("Seven_votri(@seven_votri) HAS CRAFTED Atlas: A.T.L.A.S. [ GLORIOUS Crafted ]"),
    ATLAS_NAME
  );
});

test("uses the provided image override for Atlas: A.T.L.A.S.", () => {
  const { AURA_PREVIEW_URL_OVERRIDES, normalizeComparableText } = loadScannerInternals();

  assert.equal(
    AURA_PREVIEW_URL_OVERRIDES[normalizeComparableText(ATLAS_NAME)],
    ATLAS_IMAGE
  );
});

test("picks preview and cutscene media independently from the same fandom image list", () => {
  const { pickBestAuraPreviewFile, pickBestAuraCutsceneFile } = loadScannerInternals();
  const images = [
    { title: "File:LilyCollection.gif" },
    { title: "File:Lily Opening Cutscene.gif" },
    { title: "File:LilyChat.png" },
  ];

  const previewTitle = pickBestAuraPreviewFile(images, "Lily");

  assert.equal(previewTitle, "File:LilyCollection.gif");
  assert.equal(
    pickBestAuraCutsceneFile(images, "Lily", previewTitle),
    "File:Lily Opening Cutscene.gif"
  );
});

test("prefers video files for cutscene media and classifies them as video", () => {
  const { pickBestAuraCutsceneFile, inferAuraMediaType } = loadScannerInternals();
  const images = [
    { title: "File:Sophyra Opening Cutscene.gif" },
    { title: "File:Sophyra Opening Cutscene.mp4" },
  ];

  assert.equal(
    pickBestAuraCutsceneFile(images, "Sophyra"),
    "File:Sophyra Opening Cutscene.mp4"
  );
  assert.equal(
    inferAuraMediaType("https://static.wikia.nocookie.net/sol-rng/video.mp4"),
    "video"
  );
});

test("classifies fandom revision video urls as video", () => {
  const { inferAuraMediaType } = loadScannerInternals();

  assert.equal(
    inferAuraMediaType("https://static.wikia.nocookie.net/sol-rng/images/b/bb/LilyCutscene.mp4/revision/latest?cb=20260228100529"),
    "video"
  );
});

test("canonicalizes fandom revision video urls to the stable file path", () => {
  const { canonicalizeAuraMediaUrl } = loadScannerInternals();

  assert.equal(
    canonicalizeAuraMediaUrl("https://static.wikia.nocookie.net/sol-rng/images/b/bb/LilyCutscene.mp4/revision/latest?cb=20260228100529"),
    "https://static.wikia.nocookie.net/sol-rng/images/b/bb/LilyCutscene.mp4"
  );
});

test("prefers newer or improved cutscene variants over older generic ones", () => {
  const { pickBestAuraCutsceneFile } = loadScannerInternals();
  const images = [
    { title: "File:AtlasCutscene.mp4" },
    { title: "File:AtlasCutsceneButActuallyBetter.mp4" },
    { title: "File:AtlasCurrentCutsceneWithGlobalEffect.mp4" },
  ];

  assert.equal(
    pickBestAuraCutsceneFile(images, "Atlas: A.T.L.A.S."),
    "File:AtlasCurrentCutsceneWithGlobalEffect.mp4"
  );
});

test("uses explicit cutscene overrides for known inconsistent aura pages", () => {
  const { AURA_CUTSCENE_URL_OVERRIDES, normalizeComparableText } = loadScannerInternals();

  assert.equal(
    AURA_CUTSCENE_URL_OVERRIDES[normalizeComparableText("Abyssal Hunter")],
    "https://static.wikia.nocookie.net/sol-rng/images/1/14/NewAbyssalHunterOpening.mp4"
  );
  assert.equal(
    AURA_CUTSCENE_URL_OVERRIDES[normalizeComparableText("Bloodlust")],
    "https://static.wikia.nocookie.net/sol-rng/images/5/58/Bloodlust_cutscene_new.mp4"
  );
  assert.equal(
    AURA_CUTSCENE_URL_OVERRIDES[normalizeComparableText("Ruins: Withered")],
    "https://static.wikia.nocookie.net/sol-rng/images/d/d9/WitheredCutsene.mp4"
  );
  assert.equal(
    AURA_CUTSCENE_URL_OVERRIDES[normalizeComparableText("Flora: Evergreen")],
    "https://static.wikia.nocookie.net/sol-rng/images/e/e2/Evergreen_%282%29.mp4"
  );
});

test("includes client-side persistent cache hooks for aura videos", () => {
  const source = fs.readFileSync(SCANNER_PATH, "utf8");

  assert.match(source, /function hydratePersistentAuraMedia\(/);
  assert.match(source, /aura-media-cache-v1/);
  assert.match(source, /video class="aura-preview-media aura-preview-video" data-media-src="/);
});

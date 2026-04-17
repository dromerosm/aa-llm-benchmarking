const fs = require("fs/promises");
const path = require("path");
const express = require("express");
const dotenv = require("dotenv");

dotenv.config();

const app = express();
const port = Number(process.env.PORT) || 3000;
const apiKey = process.env.API_KEY_AA;
const upstreamUrl = "https://artificialanalysis.ai/api/v2/data/llms/models";
const cacheTtlMs = 10 * 60 * 1000;
const cacheDir = path.join(__dirname, ".cache");
const cacheFilePath = path.join(cacheDir, "models-cache.json");

if (!apiKey) {
  throw new Error("Missing API_KEY_AA in .env");
}

let cache = {
  data: null,
  expiresAt: 0,
};

async function ensureCacheDir() {
  await fs.mkdir(cacheDir, { recursive: true });
}

async function readPersistentCache() {
  try {
    const raw = await fs.readFile(cacheFilePath, "utf8");
    const parsed = JSON.parse(raw);

    if (!parsed?.data || !parsed?.expiresAt) {
      return null;
    }

    return parsed;
  } catch (error) {
    if (error && typeof error === "object" && error.code === "ENOENT") {
      return null;
    }

    console.warn("Failed to read persistent cache:", error);
    return null;
  }
}

async function writePersistentCache(data, expiresAt) {
  try {
    await ensureCacheDir();
    await fs.writeFile(
      cacheFilePath,
      JSON.stringify({ data, expiresAt }, null, 2),
      "utf8",
    );
  } catch (error) {
    console.warn("Failed to write persistent cache:", error);
  }
}

function normalizeOptionalMetric(value) {
  return value && value > 0 ? value : null;
}

function hydrateModel(model) {
  return {
    hle: null,
    scicode: null,
    math500: null,
    aime: null,
    creatorId: "",
    ...model,
  };
}

function normalizeModel(model) {
  const evaluations = model.evaluations || {};
  const pricing = model.pricing || {};

  return hydrateModel({
    id: model.id,
    slug: model.slug,
    name: model.name,
    creatorId: model.model_creator?.id || "",
    creator: model.model_creator?.name || "Unknown",
    creatorSlug: model.model_creator?.slug || "",
    releaseDate: model.release_date || null,
    intelligence: evaluations.artificial_analysis_intelligence_index ?? null,
    coding: evaluations.artificial_analysis_coding_index ?? null,
    math: evaluations.artificial_analysis_math_index ?? null,
    gpqa: evaluations.gpqa ?? null,
    mmluPro: evaluations.mmlu_pro ?? null,
    liveCodeBench: evaluations.livecodebench ?? null,
    hle: evaluations.hle ?? null,
    scicode: evaluations.scicode ?? null,
    math500: evaluations.math_500 ?? null,
    aime: evaluations.aime ?? null,
    priceBlended: pricing.price_1m_blended_3_to_1 ?? null,
    priceInput: pricing.price_1m_input_tokens ?? null,
    priceOutput: pricing.price_1m_output_tokens ?? null,
    outputSpeed: normalizeOptionalMetric(model.median_output_tokens_per_second),
    latency: normalizeOptionalMetric(model.median_time_to_first_token_seconds),
    firstAnswerToken: normalizeOptionalMetric(model.median_time_to_first_answer_token),
    detailsUrl: model.slug
      ? `https://artificialanalysis.ai/models/${model.slug}`
      : null,
  });
}

async function fetchModels() {
  const response = await fetch(upstreamUrl, {
    headers: {
      "x-api-key": apiKey,
      Accept: "application/json",
    },
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Artificial Analysis API error ${response.status}: ${body}`);
  }

  const payload = await response.json();

  return {
    apiStatus: payload.status ?? null,
    refreshedAt: new Date().toISOString(),
    promptOptions: payload.prompt_options || {},
    models: (payload.data || []).map(normalizeModel),
  };
}

async function getCachedModels() {
  const now = Date.now();
  if (cache.data && cache.expiresAt > now) {
    return {
      ...cache.data,
      models: (cache.data.models || []).map(hydrateModel),
      cache: {
        hit: true,
        layer: "memory",
        persistent: true,
        expiresAt: new Date(cache.expiresAt).toISOString(),
      },
    };
  }

  const persisted = await readPersistentCache();
  if (persisted?.data && persisted.expiresAt > now) {
    cache = {
      data: persisted.data,
      expiresAt: persisted.expiresAt,
    };

    return {
      ...persisted.data,
      models: (persisted.data.models || []).map(hydrateModel),
      cache: {
        hit: true,
        layer: "disk",
        persistent: true,
        expiresAt: new Date(persisted.expiresAt).toISOString(),
      },
    };
  }

  try {
    const fresh = await fetchModels();
    const expiresAt = now + cacheTtlMs;
    cache = {
      data: fresh,
      expiresAt,
    };
    await writePersistentCache(fresh, expiresAt);

    return {
      ...fresh,
      models: (fresh.models || []).map(hydrateModel),
      cache: {
        hit: false,
        layer: "network",
        persistent: true,
        expiresAt: new Date(expiresAt).toISOString(),
      },
    };
  } catch (error) {
    if (persisted?.data) {
      cache = {
        data: persisted.data,
        expiresAt: persisted.expiresAt,
      };

      return {
        ...persisted.data,
        models: (persisted.data.models || []).map(hydrateModel),
        cache: {
          hit: true,
          layer: "stale-disk",
          persistent: true,
          expiresAt: new Date(persisted.expiresAt).toISOString(),
        },
      };
    }

    throw error;
  }
}

app.use(express.static(path.join(__dirname, "public")));

app.get("/evolution", (_req, res) => {
  res.sendFile(path.join(__dirname, "public", "evolution.html"));
});

app.get("/api/models", async (_req, res) => {
  try {
    const data = await getCachedModels();
    res.json(data);
  } catch (error) {
    res.status(502).json({
      error: "Failed to fetch data from Artificial Analysis API",
      message: error instanceof Error ? error.message : String(error),
    });
  }
});

app.listen(port, () => {
  console.log(`Leaderboard running on http://localhost:${port}`);
});

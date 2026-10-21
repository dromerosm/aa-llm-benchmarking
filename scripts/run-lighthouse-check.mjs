import { spawn } from "node:child_process";
import process from "node:process";
import { setTimeout as delay } from "node:timers/promises";

import * as chromeLauncher from "chrome-launcher";
import lighthouse from "lighthouse";

const PORT = Number(process.env.LIGHTHOUSE_PORT || "8787");
const HOST = process.env.LIGHTHOUSE_HOST || "127.0.0.1";
const BASE_URL = process.env.LIGHTHOUSE_BASE_URL || `http://${HOST}:${PORT}`;
const ROUTES = ["/", "/evolution"];
const THRESHOLDS = {
  performance: 0.75,
  accessibility: 0.9,
  "best-practices": 0.9,
  seo: 0.9,
};
const SERVER_BOOT_TIMEOUT_MS = Number(process.env.LIGHTHOUSE_SERVER_TIMEOUT_MS || "90000");
const REQUEST_TIMEOUT_MS = 5000;
const CATEGORY_ORDER = ["performance", "accessibility", "best-practices", "seo"];

let devServerProcess = null;
let chromeProcess = null;
let cleaningUp = false;
let chromeDebugPort = null;

function log(message) {
  console.log(`[lighthouse] ${message}`);
}

async function fetchWithTimeout(url) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

  try {
    return await fetch(url, {
      signal: controller.signal,
      redirect: "follow",
    });
  } finally {
    clearTimeout(timeout);
  }
}

async function isServerReachable() {
  try {
    const response = await fetchWithTimeout(`${BASE_URL}/`);
    return response.ok;
  } catch {
    return false;
  }
}

async function waitForServer() {
  const startedAt = Date.now();

  while (Date.now() - startedAt < SERVER_BOOT_TIMEOUT_MS) {
    if (await isServerReachable()) {
      return;
    }

    await delay(1000);
  }

  throw new Error(`Timed out waiting for local app at ${BASE_URL}`);
}

function startLocalServer() {
  log(`Starting local dev server on ${BASE_URL}`);
  devServerProcess = spawn("npm", ["run", "dev"], {
    stdio: ["ignore", "pipe", "pipe"],
    env: {
      ...process.env,
      BROWSER: "none",
    },
  });

  devServerProcess.stdout.on("data", (chunk) => {
    process.stdout.write(`[wrangler] ${chunk}`);
  });

  devServerProcess.stderr.on("data", (chunk) => {
    process.stderr.write(`[wrangler] ${chunk}`);
  });

  devServerProcess.on("exit", (code, signal) => {
    if (!cleaningUp && code !== 0) {
      console.error(
        `[lighthouse] Local dev server exited unexpectedly (code=${code ?? "null"}, signal=${signal ?? "null"})`,
      );
    }
  });
}

async function ensureLocalServer() {
  if (await isServerReachable()) {
    log(`Using existing local server at ${BASE_URL}`);
    return;
  }

  startLocalServer();
  await waitForServer();
}

async function verifyRoutesReachable() {
  for (const route of ROUTES) {
    const response = await fetchWithTimeout(new URL(route, BASE_URL));
    if (!response.ok) {
      throw new Error(`Expected ${route} to respond with 200, received ${response.status}`);
    }
  }
}

async function startChrome() {
  chromeProcess = await chromeLauncher.launch({
    port: Number(process.env.LIGHTHOUSE_CHROME_PORT || 0),
    chromeFlags: ["--headless=new"],
  });
  chromeDebugPort = chromeProcess.port;
}

function formatScore(score) {
  return Math.round(score * 100);
}

async function runAuditForRoute(route) {
  const auditUrl = new URL(route, BASE_URL).toString();
  const result = await lighthouse(auditUrl, {
    port: chromeDebugPort,
    output: "json",
    logLevel: "error",
    onlyCategories: CATEGORY_ORDER,
  });

  return {
    route,
    scores: Object.fromEntries(
      CATEGORY_ORDER.map((category) => [category, result.lhr.categories[category].score ?? 0]),
    ),
  };
}

function assertThresholds(report) {
  const failures = [];

  for (const [category, threshold] of Object.entries(THRESHOLDS)) {
    const score = report.scores[category];
    if (score < threshold) {
      failures.push(`${category} ${formatScore(score)} < ${formatScore(threshold)}`);
    }
  }

  return failures;
}

function printSummary(reports) {
  for (const report of reports) {
    const summary = CATEGORY_ORDER.map(
      (category) => `${category}=${formatScore(report.scores[category])}`,
    ).join(" ");
    log(`${report.route} ${summary}`);
  }
}

async function cleanup(exitCode) {
  if (cleaningUp) {
    return;
  }

  cleaningUp = true;

  if (chromeProcess) {
    await chromeProcess.kill();
    chromeProcess = null;
  }

  if (devServerProcess && !devServerProcess.killed) {
    devServerProcess.kill("SIGTERM");
    await Promise.race([
      new Promise((resolve) => devServerProcess.once("exit", resolve)),
      delay(5000),
    ]);

    if (!devServerProcess.killed) {
      devServerProcess.kill("SIGKILL");
    }
  }

  process.exit(exitCode);
}

for (const signal of ["SIGINT", "SIGTERM"]) {
  process.on(signal, async () => {
    await cleanup(1);
  });
}

try {
  await ensureLocalServer();
  await verifyRoutesReachable();
  await startChrome();

  const reports = [];
  const failures = [];

  for (const route of ROUTES) {
    const report = await runAuditForRoute(route);
    reports.push(report);

    const routeFailures = assertThresholds(report);
    if (routeFailures.length) {
      failures.push(`${route}: ${routeFailures.join(", ")}`);
    }
  }

  printSummary(reports);

  if (failures.length) {
    throw new Error(`Lighthouse thresholds failed:\n- ${failures.join("\n- ")}`);
  }

  log("All Lighthouse checks passed");
  await cleanup(0);
} catch (error) {
  console.error(`[lighthouse] ${error.message}`);
  await cleanup(1);
}

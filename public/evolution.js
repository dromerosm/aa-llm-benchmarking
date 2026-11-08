const state = {
  models: [],
  visibleModels: [],
  refreshedAt: null,
  cache: null,
  apiStatus: null,
  rangeModels: [],
  timeWindow: null,
  chartView: null,
  chartPan: null,
  brushDrag: null,
  renderFrame: 0,
  suppressChartClickUntil: 0,
};

const SESSION_CACHE_KEY = "aa-models-payload-v1";
const BOOTSTRAP_PAYLOAD_ID = "aa-models-payload";

const elements = {
  heroMeta: document.querySelector("#timeline-hero-meta"),
  statusValue: document.querySelector("#timeline-status-value"),
  summaryGrid: document.querySelector("#timeline-summary-grid"),
  creatorDropdown: document.querySelector("#timeline-creator-dropdown"),
  creatorSummary: document.querySelector("#timeline-creator-summary"),
  creatorSearchInput: document.querySelector("#timeline-creator-search"),
  creatorEmptyState: document.querySelector("#timeline-creator-empty"),
  creatorFilter: document.querySelector("#timeline-creator-filter"),
  creatorsAllButton: document.querySelector("#timeline-creators-all"),
  creatorsNoneButton: document.querySelector("#timeline-creators-none"),
  timeRangeSelect: document.querySelector("#timeline-range-select"),
  rangePanel: document.querySelector("#timeline-range"),
  rangeFromInput: document.querySelector("#timeline-range-from"),
  rangeToInput: document.querySelector("#timeline-range-to"),
  rangeResetButton: document.querySelector("#timeline-range-reset"),
  brushTrack: document.querySelector("#timeline-brush-track"),
  brushBars: document.querySelector("#timeline-brush-bars"),
  brushWindow: document.querySelector("#timeline-brush-window"),
  brushStartHandle: document.querySelector("#timeline-brush-start"),
  brushEndHandle: document.querySelector("#timeline-brush-end"),
  brushStartMask: document.querySelector("#timeline-brush-mask-start"),
  brushEndMask: document.querySelector("#timeline-brush-mask-end"),
  brushAxis: document.querySelector("#timeline-brush-axis"),
  minIntelligenceInput: document.querySelector("#timeline-min-intelligence"),
  searchInput: document.querySelector("#timeline-search-input"),
  pricedOnly: document.querySelector("#timeline-priced-only"),
  showAllLabels: document.querySelector("#timeline-show-all-labels"),
  downloadPngButton: document.querySelector("#timeline-download-png"),
  caption: document.querySelector("#timeline-caption"),
  chartWrap: document.querySelector(".timeline-chart-wrap"),
  chart: document.querySelector("#timeline-chart"),
  tooltip: document.querySelector("#timeline-tooltip"),
  summaryTemplate: document.querySelector("#timeline-summary-card-template"),
};

const chartConfig = {
  width: 1600,
  height: 940,
  marginTop: 70,
  marginRight: 250,
  marginBottom: 90,
  marginLeft: 95,
};
const LABEL_LIMITS = {
  medium: 120,
  dense: 88,
  veryDense: 72,
};
const DEFAULT_TOP_CREATOR_COUNT = 10;
const DEFAULT_TIME_RANGE_MODE = "max";
const DAY_MS = 1000 * 60 * 60 * 24;
// Space on each side of the selected dates so edge bubbles are not cut off.
const CHART_X_PADDING_RATIO = 0.02;
const CHART_MAX_X_TICKS = 8;
const BRUSH_TICK_SPACING_PX = 96;
// Below this span the range bar counts releases per day instead of per week.
const BRUSH_DAILY_BINS_MAX_SPAN_MS = DAY_MS * 120;
const PAN_DRAG_THRESHOLD_PX = 6;
const PNG_EXPORT_SCALE = 2;
const TIME_RANGE_PRESETS = Object.freeze({
  "7d": {
    label: "7 days",
    kind: "days",
    amount: 7,
  },
  "30d": {
    label: "30 days",
    kind: "days",
    amount: 30,
  },
  "3m": {
    label: "3 months",
    kind: "months",
    amount: 3,
  },
  "6m": {
    label: "6 months",
    kind: "months",
    amount: 6,
  },
  max: {
    label: "Max",
    kind: "max",
  },
  custom: {
    label: "Custom",
    kind: "custom",
  },
});

const numberFormat = new Intl.NumberFormat("en-US", {
  maximumFractionDigits: 1,
});

const moneyFormat = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function escapeHtml(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function formatMetric(value, suffix = "") {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return `${numberFormat.format(value)}${suffix}`;
}

function formatMoney(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return moneyFormat.format(value);
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return `${numberFormat.format(value)}%`;
}

const dayTickFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});

const monthTickFormat = new Intl.DateTimeFormat("en-US", {
  month: "short",
  year: "numeric",
  timeZone: "UTC",
});

function formatDate(dateString) {
  const date = dateString instanceof Date ? dateString : new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  // Release dates are calendar days stored as UTC midnight.
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeZone: "UTC",
  }).format(date);
}

function formatUpdatedLabel(dateString) {
  if (!dateString) {
    return "";
  }

  return `Updated: ${new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(dateString))}`;
}

function readCachedPayload() {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const payload = JSON.parse(raw);
    if (!payload || !Array.isArray(payload.models)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function writeCachedPayload(payload) {
  try {
    sessionStorage.setItem(SESSION_CACHE_KEY, JSON.stringify(payload));
  } catch {}
}

function readBootstrapPayload() {
  try {
    const element = document.getElementById(BOOTSTRAP_PAYLOAD_ID);
    if (!element?.textContent) {
      return null;
    }

    const payload = JSON.parse(element.textContent);
    if (!payload || !Array.isArray(payload.models)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

function formatTooltipMetric(value, formatter, suffix = "") {
  if (formatter === "money") {
    return formatMoney(value);
  }

  if (formatter === "percent") {
    return formatPercent(value);
  }

  if (formatter === "date") {
    return formatDate(value);
  }

  return formatMetric(value, suffix);
}

function topModelsByIntelligence(models, limit = 5) {
  return [...models]
    .filter(
      (model) =>
        model.intelligence !== null &&
        model.intelligence !== undefined &&
        !Number.isNaN(model.intelligence),
    )
    .sort((a, b) => b.intelligence - a.intelligence)
    .slice(0, limit);
}

function getCreatorTopScore(creator, models) {
  const topScore = models
    .filter(
      (model) =>
        model.creator === creator &&
        model.intelligence !== null &&
        model.intelligence !== undefined &&
        !Number.isNaN(model.intelligence),
    )
    .reduce((best, model) => Math.max(best, model.intelligence), Number.NEGATIVE_INFINITY);

  return Number.isFinite(topScore) ? topScore : null;
}

function getCreatorsSortedByTopIntelligence(models) {
  return [...new Set(models.map((model) => model.creator))].sort((left, right) => {
    const leftScore = getCreatorTopScore(left, models);
    const rightScore = getCreatorTopScore(right, models);

    if (leftScore === null && rightScore === null) {
      return left.localeCompare(right);
    }

    if (leftScore === null) {
      return 1;
    }

    if (rightScore === null) {
      return -1;
    }

    if (rightScore !== leftScore) {
      return rightScore - leftScore;
    }

    return left.localeCompare(right);
  });
}

function getTimelineEligibleModels() {
  return state.models.filter(
    (model) =>
      model.releaseDate &&
      model.intelligence !== null &&
      model.intelligence !== undefined &&
      !Number.isNaN(model.intelligence),
  );
}

function getReleaseTimestamp(model) {
  const releaseTimestamp = new Date(model.releaseDate).getTime();
  return Number.isNaN(releaseTimestamp) ? null : releaseTimestamp;
}

function startOfUtcDay(ms) {
  return Math.floor(ms / DAY_MS) * DAY_MS;
}

function endOfUtcDay(ms) {
  return startOfUtcDay(ms) + DAY_MS - 1;
}

function toDateInputValue(ms) {
  return new Date(ms).toISOString().slice(0, 10);
}

function fromDateInputValue(value) {
  const ms = Date.parse(`${value}T00:00:00Z`);
  return Number.isNaN(ms) ? null : ms;
}

function clamp(value, lower, upper) {
  return Math.min(upper, Math.max(lower, value));
}

// Whole UTC days from the first to the last release with an intelligence score.
function getTimelineDataExtent() {
  const timestamps = getTimelineEligibleModels()
    .map(getReleaseTimestamp)
    .filter((timestamp) => timestamp !== null);

  if (!timestamps.length) {
    return null;
  }

  return {
    min: startOfUtcDay(Math.min(...timestamps)),
    max: endOfUtcDay(Math.max(...timestamps)),
  };
}

function getPresetTimeRange(mode) {
  const preset = TIME_RANGE_PRESETS[mode];
  const extent = getTimelineDataExtent();
  if (!preset || preset.kind === "custom" || !extent) {
    return null;
  }

  if (preset.kind === "max") {
    return { startMs: extent.min, endMs: extent.max };
  }

  // Presets count back from the latest release, not from today.
  const lastDay = startOfUtcDay(extent.max);
  let startMs = lastDay - (preset.amount - 1) * DAY_MS;

  if (preset.kind === "months") {
    const start = new Date(lastDay);
    start.setUTCMonth(start.getUTCMonth() - preset.amount);
    startMs = start.getTime();
  }

  return { startMs: Math.max(extent.min, startMs), endMs: extent.max };
}

function isFullTimeWindow(range, extent) {
  return Boolean(range && extent && range.startMs <= extent.min && range.endMs >= extent.max);
}

// Single source of truth for the dates shown: the preset menu, the date inputs,
// the range bar, and zooming or panning the chart all go through here.
function setTimeWindow(startMs, endMs, mode) {
  const extent = getTimelineDataExtent();
  if (!extent) {
    state.timeWindow = null;
    syncTimeRangeControls(null);
    return;
  }

  const start = startOfUtcDay(clamp(startMs, extent.min, extent.max));
  let end = endOfUtcDay(clamp(endMs, extent.min, extent.max));
  if (end < start) {
    end = endOfUtcDay(start);
  }

  const range = { startMs: start, endMs: end };
  state.timeWindow = {
    ...range,
    mode: mode ?? (isFullTimeWindow(range, extent) ? "max" : "custom"),
  };
  syncTimeRangeControls(extent);
}

// Moves the range without changing its length, stopping at the data edges.
function shiftTimeWindow(fromWindow, deltaMs) {
  const extent = getTimelineDataExtent();
  if (!extent || !fromWindow) {
    return;
  }

  const length = fromWindow.endMs - fromWindow.startMs;
  const start = clamp(
    fromWindow.startMs + Math.round(deltaMs / DAY_MS) * DAY_MS,
    extent.min,
    Math.max(extent.min, extent.max - length),
  );
  setTimeWindow(start, start + length);
}

function applyTimeRangePreset(mode) {
  if (mode === "custom") {
    if (state.timeWindow) {
      setTimeWindow(state.timeWindow.startMs, state.timeWindow.endMs, "custom");
    }
    return;
  }

  const range = getPresetTimeRange(TIME_RANGE_PRESETS[mode] ? mode : DEFAULT_TIME_RANGE_MODE);
  if (range) {
    setTimeWindow(range.startMs, range.endMs, TIME_RANGE_PRESETS[mode] ? mode : DEFAULT_TIME_RANGE_MODE);
  } else {
    setTimeWindow(0, 0);
  }
}

function syncTimeRangeControls(extent) {
  const range = state.timeWindow;

  if (elements.timeRangeSelect) {
    elements.timeRangeSelect.value = range?.mode || DEFAULT_TIME_RANGE_MODE;
  }

  for (const input of [elements.rangeFromInput, elements.rangeToInput]) {
    if (!input) {
      continue;
    }
    input.disabled = !extent;
    input.min = extent ? toDateInputValue(extent.min) : "";
    input.max = extent ? toDateInputValue(extent.max) : "";
  }

  if (elements.rangeFromInput) {
    elements.rangeFromInput.value = range ? toDateInputValue(range.startMs) : "";
  }
  if (elements.rangeToInput) {
    elements.rangeToInput.value = range ? toDateInputValue(range.endMs) : "";
  }
  if (elements.rangeResetButton) {
    elements.rangeResetButton.disabled = !extent || isFullTimeWindow(range, extent);
  }
}

function isTimeWindowNarrowed() {
  const extent = getTimelineDataExtent();
  return Boolean(state.timeWindow && extent && !isFullTimeWindow(state.timeWindow, extent));
}

function describeTimeRange(range) {
  if (!range) {
    return "All release dates";
  }

  const label = TIME_RANGE_PRESETS[range.mode]?.label || "Custom";
  return `${label} · ${formatDate(range.startMs)} to ${formatDate(range.endMs)}`;
}

function isModelWithinTimeRange(model, range) {
  if (!range) {
    return true;
  }

  const releaseTimestamp = getReleaseTimestamp(model);
  if (releaseTimestamp === null) {
    return false;
  }

  if (range.startMs !== null && releaseTimestamp < range.startMs) {
    return false;
  }

  if (range.endMs !== null && releaseTimestamp > range.endMs) {
    return false;
  }

  return true;
}

function modelFamilyName(model) {
  return (model.name || "")
    .replace(/\s*\([^)]*\)/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function modelFamilyKey(model) {
  return modelFamilyName(model).toLowerCase();
}

function hashCreator(creator) {
  let hash = 0;
  for (const char of creator) {
    hash = (hash * 31 + char.charCodeAt(0)) % 360;
  }
  return hash;
}

function creatorColor(creator) {
  const hue = hashCreator(creator);
  return {
    fill: `hsla(${hue} 68% 53% / 0.58)`,
    stroke: `hsl(${hue} 72% 32%)`,
    label: `hsl(${hue} 78% 18%)`,
    patternBase: `hsla(${hue} 54% 94% / 0.98)`,
    patternStripe: `hsla(${hue} 74% 34% / 0.88)`,
  };
}

function patternIdForCreator(creator) {
  return `timeline-pattern-${String(creator)
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")}`;
}

function populateCreatorFilter() {
  const creators = getCreatorsSortedByTopIntelligence(state.models);
  const previousSelection = getSelectedCreators();
  const shouldUseDefaultTopCreators =
    previousSelection.size === 0 && !elements.creatorFilter.children.length;
  const defaultSelectedCreators = new Set(creators.slice(0, DEFAULT_TOP_CREATOR_COUNT));

  elements.creatorFilter.innerHTML = creators
    .map((creator) => {
      const checked = shouldUseDefaultTopCreators
        ? defaultSelectedCreators.has(creator)
        : previousSelection.has(creator);
      return `
        <label class="control-checkbox-option">
          <input type="checkbox" value="${escapeHtml(creator)}" ${checked ? "checked" : ""} />
          <span>${escapeHtml(creator)}</span>
        </label>
      `;
    })
    .join("");

  renderCreatorSummary();
  filterCreatorOptions();
}

function setCreatorSelection(mode) {
  const selectAll = mode === "all";
  const checkboxes = elements.creatorFilter.querySelectorAll('input[type="checkbox"]');
  for (const checkbox of checkboxes) {
    checkbox.checked = selectAll;
  }

  renderCreatorSummary();
}

function getSelectedCreators() {
  return new Set(
    Array.from(elements.creatorFilter.querySelectorAll('input[type="checkbox"]:checked')).map(
      (checkbox) => checkbox.value,
    ),
  );
}

function renderCreatorSummary() {
  const totalCreators = elements.creatorFilter.querySelectorAll('input[type="checkbox"]').length;
  const selectedCreators = getSelectedCreators();

  if (selectedCreators.size === 0) {
    elements.creatorSummary.textContent = "No creators";
    return;
  }

  if (selectedCreators.size === totalCreators) {
    elements.creatorSummary.textContent = "All creators";
    return;
  }

  if (selectedCreators.size === 1) {
    elements.creatorSummary.textContent = [...selectedCreators][0];
    return;
  }

  elements.creatorSummary.textContent = `${selectedCreators.size} creators`;
}

function filterCreatorOptions() {
  const query = elements.creatorSearchInput.value.trim().toLowerCase();
  const options = elements.creatorFilter.querySelectorAll(".control-checkbox-option");
  let visibleCount = 0;

  for (const option of options) {
    const label = option.textContent.trim().toLowerCase();
    const matches = !query || label.includes(query);
    option.hidden = !matches;

    if (matches) {
      visibleCount += 1;
    }
  }

  elements.creatorEmptyState.hidden = visibleCount > 0;
}

function renderHeroMeta() {
  const pills = [
    `${state.models.length} models`,
    state.cache?.persistent ? "Edge cache: active" : "Edge cache: inactive",
    formatUpdatedLabel(state.refreshedAt),
  ].filter(Boolean);

  elements.heroMeta.innerHTML = pills
    .map((pill) => `<span class="hero-meta-pill">${escapeHtml(pill)}</span>`)
    .join("");
}

function renderHeroSpotlight() {
  const topModels = topModelsByIntelligence(state.models);

  if (!topModels.length) {
    elements.statusValue.textContent = "No scores";
    return;
  }

  elements.statusValue.innerHTML = `
    <ol class="hero-panel-ranking">
      ${topModels
        .map(
          (model, index) => `
            <li class="hero-panel-ranking-item">
              <span class="hero-panel-rank">${index + 1}</span>
              <span class="hero-panel-model">
                <span class="hero-panel-model-name">${escapeHtml(model.name)}</span>
                <span class="hero-panel-model-meta">${escapeHtml(model.creator)} · ${escapeHtml(
                  formatMetric(model.intelligence),
                )}</span>
              </span>
            </li>
          `,
        )
        .join("")}
    </ol>
  `;
}

function summarizeVisibleModels() {
  const visible = state.visibleModels;
  const byIntelligence = [...visible]
    .filter((model) => model.intelligence !== null)
    .sort((a, b) => b.intelligence - a.intelligence);
  const newest = [...visible]
    .filter((model) => model.releaseDate)
    .sort((a, b) => new Date(b.releaseDate) - new Date(a.releaseDate));
  const priciest = [...visible]
    .filter((model) => model.priceBlended !== null)
    .sort((a, b) => b.priceBlended - a.priceBlended);

  return [
    {
      label: "Visible Models",
      title: `${visible.length} plotted`,
      subtitle: "Models with both release date and intelligence score",
      metric: visible.length ? `${visible.length}` : "0",
    },
    {
      label: "Top Intelligence",
      title: byIntelligence[0]?.name || "N/A",
      subtitle: byIntelligence[0]
        ? `${byIntelligence[0].creator} · ${formatDate(byIntelligence[0].releaseDate)}`
        : "No model in current filter",
      metric: byIntelligence[0] ? formatMetric(byIntelligence[0].intelligence) : "—",
    },
    {
      label: "Newest Visible",
      title: newest[0]?.name || "N/A",
      subtitle: newest[0]
        ? `${newest[0].creator} · Intelligence ${formatMetric(newest[0].intelligence)}`
        : "No model in current filter",
      metric: newest[0] ? formatDate(newest[0].releaseDate) : "—",
    },
    {
      label: "Largest Bubble",
      title: priciest[0]?.name || "N/A",
      subtitle: priciest[0]
        ? `${priciest[0].creator} · Highest blended token cost`
        : "No priced model in current filter",
      metric: priciest[0] ? formatMoney(priciest[0].priceBlended) : "—",
    },
  ];
}

function renderSummary() {
  const cards = summarizeVisibleModels();
  elements.summaryGrid.innerHTML = "";

  for (const card of cards) {
    const node = elements.summaryTemplate.content.cloneNode(true);
    node.querySelector(".summary-label").textContent = card.label;
    node.querySelector(".summary-title").textContent = card.title;
    node.querySelector(".summary-subtitle").textContent = card.subtitle;
    node.querySelector(".summary-metric").textContent = card.metric;
    elements.summaryGrid.appendChild(node);
  }
}

function createLinearScale(domainMin, domainMax, rangeMin, rangeMax) {
  if (domainMax === domainMin) {
    return () => (rangeMin + rangeMax) / 2;
  }

  const domainSpan = domainMax - domainMin;
  const rangeSpan = rangeMax - rangeMin;
  return (value) => rangeMin + ((value - domainMin) / domainSpan) * rangeSpan;
}

function radiusScale(price, maxPrice) {
  const minRadius = 9;
  const maxRadius = 42;

  if (price === null || price === undefined || Number.isNaN(price) || price <= 0 || maxPrice <= 0) {
    return minRadius;
  }

  const normalized = Math.sqrt(price / maxPrice);
  return minRadius + 2 + normalized * (maxRadius - minRadius - 2);
}

const TIME_TICK_STEPS = [
  { unit: "day", amount: 1 },
  { unit: "day", amount: 2 },
  { unit: "week", amount: 1 },
  { unit: "week", amount: 2 },
  { unit: "month", amount: 1 },
  { unit: "month", amount: 2 },
  { unit: "month", amount: 3 },
  { unit: "month", amount: 6 },
  { unit: "month", amount: 12 },
];

function buildTimeTicks(minMs, maxMs, step) {
  const ticks = [];

  if (step.unit === "month") {
    const cursor = new Date(startOfUtcDay(minMs));
    cursor.setUTCDate(1);
    while (cursor.getUTCMonth() % step.amount !== 0 || cursor.getTime() < minMs) {
      cursor.setUTCMonth(cursor.getUTCMonth() + 1);
    }
    while (cursor.getTime() <= maxMs) {
      ticks.push(cursor.getTime());
      cursor.setUTCMonth(cursor.getUTCMonth() + step.amount);
    }
    return ticks;
  }

  const stepMs = (step.unit === "week" ? 7 : 1) * step.amount * DAY_MS;
  let cursor = startOfUtcDay(minMs);
  if (step.unit === "week") {
    // Weeks start on Monday; 1970-01-01 was a Thursday.
    const dayOfWeek = (Math.floor(cursor / DAY_MS) + 3) % 7;
    cursor -= dayOfWeek * DAY_MS;
  }
  while (cursor < minMs) {
    cursor += stepMs;
  }
  for (; cursor <= maxMs; cursor += stepMs) {
    ticks.push(cursor);
  }
  return ticks;
}

// Calendar-aligned ticks (days, weeks, or months) so labels never repeat.
function createTimeTicks(minMs, maxMs, maxTicks) {
  const step =
    TIME_TICK_STEPS.find((candidate) => buildTimeTicks(minMs, maxMs, candidate).length <= maxTicks) ||
    TIME_TICK_STEPS[TIME_TICK_STEPS.length - 1];
  const format = step.unit === "month" ? monthTickFormat : dayTickFormat;

  return buildTimeTicks(minMs, maxMs, step).map((ms) => ({ ms, label: format.format(ms) }));
}

function getChartPlotGeometry() {
  if (!state.chartView) {
    return null;
  }

  const rect = elements.chart.getBoundingClientRect();
  const scaleX = rect.width / chartConfig.width;
  const scaleY = rect.height / chartConfig.height;

  return {
    rect,
    plotLeft: rect.left + chartConfig.marginLeft * scaleX,
    plotRight: rect.left + (chartConfig.width - chartConfig.marginRight) * scaleX,
    plotTop: rect.top + chartConfig.marginTop * scaleY,
    plotBottom: rect.top + (chartConfig.height - chartConfig.marginBottom) * scaleY,
  };
}

function isPointerInsidePlot(clientX, clientY, geometry) {
  return (
    geometry &&
    clientX >= geometry.plotLeft &&
    clientX <= geometry.plotRight &&
    clientY >= geometry.plotTop &&
    clientY <= geometry.plotBottom
  );
}

function getChartXPadding(startMs, endMs) {
  return Math.max(DAY_MS / 2, (endMs - startMs) * CHART_X_PADDING_RATIO);
}

// The range bar uses the same padding as the chart at "Max", so dates line up.
function getBrushDomain(extent) {
  const padding = getChartXPadding(extent.min, extent.max);
  return { min: extent.min - padding, max: extent.max + padding };
}

function getChartDomain(models) {
  const range = state.timeWindow;
  const releaseTimes = models.map((model) => new Date(model.releaseDate).getTime());
  const xMin = range ? range.startMs : Math.min(...releaseTimes);
  const xMax = range ? range.endMs : Math.max(...releaseTimes);
  const xPadding = getChartXPadding(xMin, xMax);

  // The Y axis fits the points inside the selected dates.
  const intelligenceValues = models.map((model) => model.intelligence);
  const hasPoints = intelligenceValues.length > 0;

  return {
    xMin: xMin - xPadding,
    xMax: xMax + xPadding,
    yMin: hasPoints ? Math.max(0, Math.floor(Math.min(...intelligenceValues) - 3)) : 0,
    yMax: hasPoints ? Math.ceil(Math.max(...intelligenceValues) + 2) : 100,
  };
}

function buildLabelPlacements(points) {
  const sorted = [...points].sort((a, b) => b.intelligence - a.intelligence);
  const placedBoxes = [];
  const labelHeight = 14;
  const labelGap = 8;
  const labelPaddingX = 6;
  const labelPaddingY = 4;
  const minX = chartConfig.marginLeft + 8;
  const maxX = chartConfig.width - chartConfig.marginRight + 205;
  const minY = chartConfig.marginTop + 14;
  const maxY = chartConfig.height - chartConfig.marginBottom - 12;
  const placedPointIndexes = new Set();

  function clamp(value, lower, upper) {
    return Math.max(lower, Math.min(upper, value));
  }

  function intersects(box) {
    return placedBoxes.some(
      (placed) =>
        box.left < placed.right &&
        box.right > placed.left &&
        box.top < placed.bottom &&
        box.bottom > placed.top,
    );
  }

  for (const point of sorted) {
    const labelWidth = Math.min(220, point.label.length * 6.7 + 8);
    const baseOffset = point.r + labelGap;
    const distanceSteps = [0, 14, 28, 44];
    const candidateSeeds = [];

    for (const step of distanceSteps) {
      const offset = baseOffset + step;
      candidateSeeds.push(
        { x: point.cx + offset, y: point.cy - offset },
        { x: point.cx + offset, y: point.cy + 4 },
        { x: point.cx + offset, y: point.cy + offset + 10 },
        { x: point.cx - labelWidth - offset, y: point.cy - offset },
        { x: point.cx - labelWidth - offset, y: point.cy + 4 },
        { x: point.cx - labelWidth - offset, y: point.cy + offset + 10 },
        { x: point.cx - labelWidth / 2, y: point.cy - offset - 12 },
        { x: point.cx - labelWidth / 2, y: point.cy + offset + 16 },
      );
    }

    const candidatePositions = candidateSeeds.map((candidate) => {
      const x = clamp(candidate.x, minX, maxX - labelWidth);
      const y = clamp(candidate.y, minY, maxY);
      const box = {
        left: x - labelPaddingX,
        right: x + labelWidth + labelPaddingX,
        top: y - labelHeight - labelPaddingY,
        bottom: y + labelPaddingY,
      };
      const dx = x - point.cx;
      const dy = y - point.cy;
      return {
        x,
        y,
        box,
        distance: Math.hypot(dx, dy),
        intersects: intersects(box),
      };
    });

    const bestCandidate = candidatePositions.find((candidate) => !candidate.intersects);
    if (!bestCandidate) {
      continue;
    }

    placedBoxes.push(bestCandidate.box);
    placedPointIndexes.add(point.pointIndex);
    point.labelX = bestCandidate.x;
    point.labelY = bestCandidate.y;
  }

  return placedPointIndexes;
}

function addPointsUntil(selected, maxLabels, list, perRunLimit = list.length, options = {}) {
  const { selectedFamilies = null, uniqueByFamily = false } = options;
  let added = 0;

  for (const point of list) {
    if (selected.size >= maxLabels || added >= perRunLimit) {
      break;
    }

    if (uniqueByFamily && selectedFamilies?.has(point.familyKey)) {
      continue;
    }

    if (!selected.has(point.pointIndex)) {
      selected.add(point.pointIndex);
      if (uniqueByFamily && selectedFamilies) {
        selectedFamilies.add(point.familyKey);
      }
      added += 1;
    }
  }
}

function getLabelBudget(pointCount) {
  if (pointCount <= LABEL_LIMITS.medium) {
    return pointCount;
  }

  if (pointCount <= 220) {
    return LABEL_LIMITS.medium;
  }

  if (pointCount <= 340) {
    return LABEL_LIMITS.dense;
  }

  return LABEL_LIMITS.veryDense;
}

function selectLabelPointIndexes(points) {
  if (elements.showAllLabels.checked) {
    return new Set(points.map((point) => point.pointIndex));
  }

  const maxLabels = getLabelBudget(points.length);
  if (points.length <= maxLabels) {
    return new Set(points.map((point) => point.pointIndex));
  }

  const selected = new Set();
  const selectedFamilies = new Set();
  const search = elements.searchInput.value.trim().toLowerCase();
  const byIntelligence = [...points].sort((a, b) => b.intelligence - a.intelligence);
  const byRecent = [...points].sort(
    (a, b) => new Date(b.releaseDate).getTime() - new Date(a.releaseDate).getTime(),
  );
  const byPrice = [...points]
    .filter(
      (point) =>
        point.priceBlended !== null &&
        point.priceBlended !== undefined &&
        !Number.isNaN(point.priceBlended),
    )
    .sort((a, b) => b.priceBlended - a.priceBlended);
  const topPerFamily = [];
  const seenFamilies = new Set();

  for (const point of byIntelligence) {
    if (seenFamilies.has(point.familyKey)) {
      continue;
    }

    seenFamilies.add(point.familyKey);
    topPerFamily.push(point);
  }

  if (search) {
    const matchingPoints = points.filter((point) =>
      `${point.name} ${point.creator}`.toLowerCase().includes(search),
    );
    addPointsUntil(selected, maxLabels, matchingPoints, Math.min(matchingPoints.length, 36), {
      selectedFamilies,
      uniqueByFamily: true,
    });
  }

  addPointsUntil(selected, maxLabels, topPerFamily, Math.min(topPerFamily.length, 36), {
    selectedFamilies,
    uniqueByFamily: true,
  });
  addPointsUntil(selected, maxLabels, byIntelligence, Math.ceil(maxLabels * 0.34), {
    selectedFamilies,
    uniqueByFamily: true,
  });
  addPointsUntil(selected, maxLabels, byPrice, Math.ceil(maxLabels * 0.16), {
    selectedFamilies,
    uniqueByFamily: true,
  });
  addPointsUntil(selected, maxLabels, byRecent, Math.ceil(maxLabels * 0.2), {
    selectedFamilies,
    uniqueByFamily: true,
  });

  const remaining = maxLabels - selected.size;
  if (remaining > 0) {
    const step = points.length / remaining;

    for (let index = 0; index < remaining; index += 1) {
      const point = points[Math.min(points.length - 1, Math.floor(index * step))];
      if (point && !selectedFamilies.has(point.familyKey)) {
        selected.add(point.pointIndex);
        selectedFamilies.add(point.familyKey);
      }
    }
  }

  return selected;
}

function buildTooltipMarkup(model, colors) {
  const rows = [
    ["Creator", model.creator || "—"],
    ["Release Date", formatTooltipMetric(model.releaseDate, "date")],
    ["AA Intelligence", formatTooltipMetric(model.intelligence)],
    ["Coding", formatTooltipMetric(model.coding, "percent")],
    ["Blended USD/1M", formatTooltipMetric(model.priceBlended, "money")],
    ["Input USD/1M", formatTooltipMetric(model.priceInput, "money")],
    ["Output USD/1M", formatTooltipMetric(model.priceOutput, "money")],
    ["Median Tokens/s", formatTooltipMetric(model.outputSpeed, null, " tok/s")],
    ["Latency", formatTooltipMetric(model.latency, null, " s")],
    ["First Answer", formatTooltipMetric(model.firstAnswerToken, null, " s")],
  ];

  return `
    <div class="timeline-tooltip-card" style="--tooltip-accent:${escapeHtml(colors.stroke)};">
      <div class="timeline-tooltip-header">
        <p class="timeline-tooltip-kicker">${escapeHtml(model.creator || "Unknown creator")}</p>
        <h3>${escapeHtml(model.name)}</h3>
      </div>
      <div class="timeline-tooltip-grid">
        ${rows
          .map(
            ([label, value]) => `
              <div class="timeline-tooltip-row">
                <span class="timeline-tooltip-key">${escapeHtml(label)}</span>
                <span class="timeline-tooltip-value">${escapeHtml(value)}</span>
              </div>
            `,
          )
          .join("")}
      </div>
    </div>
  `;
}

function setActivePoint(pointElement) {
  const points = elements.chart.querySelectorAll(".timeline-point");

  if (!pointElement) {
    for (const point of points) {
      point.classList.remove("is-active");
      const circle = point.querySelector("circle");
      const label = point.querySelector(".timeline-label");

      if (circle) {
        circle.style.opacity = "";
        circle.style.strokeWidth = "";
        circle.style.filter = "";
      }

      if (label) {
        label.style.opacity = "";
        label.style.fontWeight = "";
        label.style.strokeWidth = "";
        label.style.filter = "";
      }
    }

    elements.chart.classList.remove("has-active-point");
    return;
  }

  elements.chart.classList.add("has-active-point");

  for (const point of points) {
    const isActive = point === pointElement;
    point.classList.toggle("is-active", isActive);

    const circle = point.querySelector("circle");
    const label = point.querySelector(".timeline-label");

    if (circle) {
      circle.style.opacity = isActive ? "1" : "0.34";
      circle.style.strokeWidth = isActive ? "3.5" : "2";
      circle.style.filter = isActive
        ? "drop-shadow(0 0 0.75rem rgba(17, 59, 84, 0.22))"
        : "none";
    }

    if (label) {
      label.style.opacity = isActive ? "1" : "0.34";
      label.style.fontWeight = isActive ? "700" : "600";
      label.style.strokeWidth = isActive ? "4" : "3";
      label.style.filter = isActive
        ? "drop-shadow(0 0 0.45rem rgba(17, 59, 84, 0.24))"
        : "none";
    }
  }
}

function positionTooltip(clientX, clientY) {
  const tooltip = elements.tooltip;
  const gap = 18;
  const bounds = tooltip.getBoundingClientRect();
  let left = clientX + gap;
  let top = clientY + gap;

  if (left + bounds.width > window.innerWidth - 12) {
    left = clientX - bounds.width - gap;
  }

  if (top + bounds.height > window.innerHeight - 12) {
    top = clientY - bounds.height - gap;
  }

  left = Math.max(12, left);
  top = Math.max(12, top);

  tooltip.style.left = `${left}px`;
  tooltip.style.top = `${top}px`;
}

function showTooltip(pointElement, clientX, clientY) {
  const modelIndex = Number(pointElement.dataset.modelIndex);
  const model = state.visibleModels[modelIndex];
  if (!model) {
    return;
  }

  const colors = creatorColor(model.creator);
  setActivePoint(pointElement);
  elements.tooltip.innerHTML = buildTooltipMarkup(model, colors);
  elements.tooltip.hidden = false;
  elements.tooltip.setAttribute("aria-hidden", "false");
  elements.tooltip.style.left = "-9999px";
  elements.tooltip.style.top = "-9999px";
  positionTooltip(clientX, clientY);
}

function showTooltipFromFocus(pointElement) {
  const circle = pointElement.querySelector("circle");
  if (!circle) {
    return;
  }

  const rect = circle.getBoundingClientRect();
  showTooltip(pointElement, rect.right, rect.top + rect.height / 2);
}

function hideTooltip() {
  setActivePoint(null);
  elements.tooltip.hidden = true;
  elements.tooltip.setAttribute("aria-hidden", "true");
}

function findTimelinePoint(target) {
  return target instanceof Element ? target.closest(".timeline-point") : null;
}

function openModelDetails(pointElement) {
  const modelIndex = Number(pointElement.dataset.modelIndex);
  const model = state.visibleModels[modelIndex];
  if (!model?.detailsUrl) {
    return;
  }

  window.open(model.detailsUrl, "_blank", "noopener,noreferrer");
}

function renderChart() {
  const visible = state.visibleModels;
  hideTooltip();

  const plotWidth = chartConfig.width - chartConfig.marginLeft - chartConfig.marginRight;
  const plotHeight = chartConfig.height - chartConfig.marginTop - chartConfig.marginBottom;

  if (!visible.length) {
    const hasOtherMatches = state.rangeModels.length > 0;
    state.chartView = hasOtherMatches && state.timeWindow
      ? { displayDomain: getChartDomain(visible), plotWidth, plotHeight }
      : null;
    elements.chart.innerHTML = `
      <rect x="0" y="0" width="${chartConfig.width}" height="${chartConfig.height}" rx="28" fill="rgba(255,255,255,0.72)"></rect>
      <text x="${chartConfig.width / 2}" y="${chartConfig.height / 2}" text-anchor="middle" class="timeline-empty">
        ${hasOtherMatches ? "No models in the selected date range." : "No models match the current filters."}
      </text>
    `;
    return {
      labelledCount: 0,
      visibleCount: 0,
    };
  }

  const displayDomain = getChartDomain(visible);
  const zoomedVisible = visible.map((model, modelIndex) => ({ model, modelIndex }));

  const positivePrices = zoomedVisible
    .map(({ model }) => model.priceBlended)
    .filter((value) => value !== null && value !== undefined && !Number.isNaN(value) && value > 0);
  const maxPrice = positivePrices.length ? Math.max(...positivePrices) : 0;

  const xScale = createLinearScale(
    displayDomain.xMin,
    displayDomain.xMax,
    chartConfig.marginLeft,
    chartConfig.marginLeft + plotWidth,
  );
  const yScale = createLinearScale(
    displayDomain.yMin,
    displayDomain.yMax,
    chartConfig.marginTop + plotHeight,
    chartConfig.marginTop,
  );
  state.chartView = {
    displayDomain,
    plotWidth,
    plotHeight,
  };

  const points = zoomedVisible.map(({ model, modelIndex }, pointIndex) => {
    const cx = xScale(new Date(model.releaseDate).getTime());
    const cy = yScale(model.intelligence);
    const r = radiusScale(model.priceBlended, maxPrice);
    const colors = creatorColor(model.creator);
    const hasZeroOrMissingPrice =
      model.priceBlended === null ||
      model.priceBlended === undefined ||
      Number.isNaN(model.priceBlended) ||
      model.priceBlended <= 0;

    return {
      ...model,
      modelIndex,
      pointIndex,
      cx,
      cy,
      r,
      label: model.name,
      familyKey: modelFamilyKey(model),
      colors,
      hasZeroOrMissingPrice,
      patternId: patternIdForCreator(model.creator),
    };
  });

  const selectedLabelPointIndexes = selectLabelPointIndexes(points);
  const selectedLabelPoints = points.filter((point) => selectedLabelPointIndexes.has(point.pointIndex));
  const placedLabelPointIndexes = buildLabelPlacements(selectedLabelPoints);
  const missingPricePatterns = [...new Map(
    points
      .filter((point) => point.hasZeroOrMissingPrice)
      .map((point) => [point.patternId, point]),
  ).values()];

  // Ticks stay inside the selected dates, not in the padding around them.
  const dateTicks = createTimeTicks(
    state.timeWindow?.startMs ?? displayDomain.xMin,
    state.timeWindow?.endMs ?? displayDomain.xMax,
    CHART_MAX_X_TICKS,
  );
  const yTicks = Array.from(
    { length: 6 },
    (_, index) => displayDomain.yMin + ((displayDomain.yMax - displayDomain.yMin) / 5) * index,
  );

  elements.chart.innerHTML = `
    <defs>
      <linearGradient id="timeline-bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="rgba(31, 122, 140, 0.08)"></stop>
        <stop offset="100%" stop-color="rgba(223, 160, 94, 0.08)"></stop>
      </linearGradient>
      ${missingPricePatterns
        .map(
          (point) => `
            <pattern id="${point.patternId}" width="12" height="12" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
              <rect width="12" height="12" fill="${point.colors.patternBase}"></rect>
              <line x1="0" y1="0" x2="0" y2="12" stroke="${point.colors.patternStripe}" stroke-width="4"></line>
            </pattern>
          `,
        )
        .join("")}
    </defs>
    <rect x="0" y="0" width="${chartConfig.width}" height="${chartConfig.height}" rx="28" fill="url(#timeline-bg)"></rect>
    <g class="timeline-grid">
      ${yTicks
        .map((tick) => {
          const y = yScale(tick);
          return `
            <line x1="${chartConfig.marginLeft}" y1="${y}" x2="${chartConfig.marginLeft + plotWidth}" y2="${y}"></line>
            <text x="${chartConfig.marginLeft - 18}" y="${y + 5}" text-anchor="end">${numberFormat.format(
              tick,
            )}</text>
          `;
        })
        .join("")}
      ${dateTicks
        .map((tick) => {
          const x = xScale(tick.ms);
          return `
            <line x1="${x}" y1="${chartConfig.marginTop}" x2="${x}" y2="${chartConfig.marginTop + plotHeight}"></line>
            <text x="${x}" y="${chartConfig.marginTop + plotHeight + 36}" text-anchor="middle">${escapeHtml(
              tick.label,
            )}</text>
          `;
        })
        .join("")}
    </g>
    <g class="timeline-axis">
      <line x1="${chartConfig.marginLeft}" y1="${chartConfig.marginTop}" x2="${chartConfig.marginLeft}" y2="${
        chartConfig.marginTop + plotHeight
      }"></line>
      <line x1="${chartConfig.marginLeft}" y1="${chartConfig.marginTop + plotHeight}" x2="${
        chartConfig.marginLeft + plotWidth
      }" y2="${chartConfig.marginTop + plotHeight}"></line>
      <text x="${chartConfig.marginLeft + plotWidth / 2}" y="${chartConfig.height - 22}" text-anchor="middle">
        Release date
      </text>
      <text transform="translate(28 ${chartConfig.marginTop + plotHeight / 2}) rotate(-90)" text-anchor="middle">
        Artificial Analysis intelligence
      </text>
    </g>
    <g class="timeline-points">
      ${points
        .map(
          (point, index) => `
            <g class="timeline-point" role="link" tabindex="0" data-point-index="${index}" aria-label="${escapeHtml(
              `${point.name}, ${point.creator}, released ${formatDate(point.releaseDate)}, intelligence ${formatMetric(
                point.intelligence,
              )}. Open model page in Artificial Analysis.`,
            )}" data-model-index="${point.modelIndex}">
              <circle
                cx="${point.cx}"
                cy="${point.cy}"
                r="${point.r}"
                fill="${point.hasZeroOrMissingPrice ? `url(#${point.patternId})` : point.colors.fill}"
                stroke="${point.colors.stroke}"
                stroke-width="2"
              ></circle>
              ${placedLabelPointIndexes.has(point.pointIndex)
                ? `
                  <text
                    x="${point.labelX}"
                    y="${point.labelY}"
                    fill="${point.colors.label}"
                    class="timeline-label"
                  >${escapeHtml(point.label)}</text>
                `
                : ""}
            </g>
          `,
        )
        .join("")}
    </g>
  `;

  return {
    labelledCount: placedLabelPointIndexes.size,
    visibleCount: zoomedVisible.length,
  };
}

function renderTimeline() {
  const chartState = renderChart();
  const isNarrowed = isTimeWindowNarrowed();
  elements.chartWrap.classList.toggle("is-pan-enabled", isNarrowed);
  if (!isNarrowed) {
    elements.chartWrap.classList.remove("is-panning");
  }
  renderBrush();
  const timeRangeLabel = describeTimeRange(state.timeWindow);
  elements.caption.textContent = elements.showAllLabels.checked
    ? `${chartState.visibleCount} visible points · all labels shown · ${timeRangeLabel}`
    : `${chartState.visibleCount} visible points · ${chartState.labelledCount} labels shown · ${timeRangeLabel}`;
}

// The range bar shows every release date as a per-week (or per-day) histogram
// of the models that pass the other filters, with the selected dates on top.
function renderBrush() {
  const extent = getTimelineDataExtent();
  const range = state.timeWindow;

  if (!elements.rangePanel) {
    return;
  }

  elements.rangePanel.hidden = !extent || !range;
  if (!extent || !range) {
    return;
  }

  const domain = getBrushDomain(extent);
  const toPercent = (ms) => clamp(((ms - domain.min) / (domain.max - domain.min)) * 100, 0, 100);
  const spanMs = extent.max + 1 - extent.min;
  const binMs = spanMs > BRUSH_DAILY_BINS_MAX_SPAN_MS ? 7 * DAY_MS : DAY_MS;
  const binCount = Math.max(1, Math.ceil(spanMs / binMs));
  const counts = new Array(binCount).fill(0);

  for (const model of state.rangeModels) {
    const releaseTime = getReleaseTimestamp(model);
    if (releaseTime !== null && releaseTime >= extent.min && releaseTime <= extent.max) {
      counts[Math.min(binCount - 1, Math.floor((releaseTime - extent.min) / binMs))] += 1;
    }
  }

  const maxCount = Math.max(1, ...counts);
  const binWidth = (toPercent(extent.min + binMs) - toPercent(extent.min)) * 10;
  elements.brushBars.innerHTML = counts
    .map((count, index) => {
      if (!count) {
        return "";
      }
      const binStart = extent.min + index * binMs;
      const isSelected = binStart <= range.endMs && binStart + binMs - 1 >= range.startMs;
      const height = Math.max(6, Math.sqrt(count / maxCount) * 92);
      return `<rect class="${isSelected ? "is-selected" : ""}" x="${toPercent(binStart) * 10 + binWidth * 0.12}" y="${
        100 - height
      }" width="${binWidth * 0.76}" height="${height}"></rect>`;
    })
    .join("");

  const left = toPercent(range.startMs);
  const right = toPercent(range.endMs + 1);
  elements.brushWindow.style.left = `${left}%`;
  elements.brushWindow.style.width = `${right - left}%`;
  elements.brushStartMask.style.width = `${left}%`;
  elements.brushEndMask.style.left = `${right}%`;
  elements.brushStartHandle.style.left = `${left}%`;
  elements.brushEndHandle.style.left = `${right}%`;

  for (const [handle, value] of [
    [elements.brushStartHandle, range.startMs],
    [elements.brushEndHandle, range.endMs],
  ]) {
    handle.setAttribute("aria-valuemin", String(extent.min));
    handle.setAttribute("aria-valuemax", String(extent.max));
    handle.setAttribute("aria-valuenow", String(value));
    handle.setAttribute("aria-valuetext", formatDate(value));
  }
  elements.brushWindow.setAttribute(
    "aria-label",
    `Selected dates ${formatDate(range.startMs)} to ${formatDate(range.endMs)}. Use the arrow keys to move them.`,
  );

  const trackWidth = elements.brushTrack.clientWidth || 800;
  const maxTicks = Math.max(2, Math.floor(trackWidth / BRUSH_TICK_SPACING_PX));
  elements.brushAxis.innerHTML = createTimeTicks(extent.min, extent.max, maxTicks)
    .map((tick) => `<span style="left: ${toPercent(tick.ms)}%">${escapeHtml(tick.label)}</span>`)
    .join("");
}

function buildTimelineExportStyles() {
  const sampleGridLine = elements.chart.querySelector(".timeline-grid line");
  const sampleAxisLine = elements.chart.querySelector(".timeline-axis line");
  const sampleAxisText = elements.chart.querySelector(".timeline-axis text");
  const sampleLabel = elements.chart.querySelector(".timeline-label");
  const chartStyles = getComputedStyle(elements.chart);
  const gridLineStyles = sampleGridLine ? getComputedStyle(sampleGridLine) : null;
  const axisLineStyles = sampleAxisLine ? getComputedStyle(sampleAxisLine) : null;
  const axisTextStyles = sampleAxisText ? getComputedStyle(sampleAxisText) : chartStyles;
  const labelStyles = sampleLabel ? getComputedStyle(sampleLabel) : axisTextStyles;

  return `
    .timeline-grid line {
      stroke: ${gridLineStyles?.stroke || "rgba(128, 128, 128, 0.18)"};
      stroke-dasharray: 4 8;
    }
    .timeline-grid text,
    .timeline-axis text {
      fill: ${axisTextStyles.fill || "rgb(102, 102, 102)"};
      font-size: ${axisTextStyles.fontSize || "18px"};
      font-family: ${axisTextStyles.fontFamily || "ui-sans-serif, system-ui, sans-serif"};
    }
    .timeline-axis line {
      stroke: ${axisLineStyles?.stroke || "rgba(128, 128, 128, 0.3)"};
      stroke-width: ${axisLineStyles?.strokeWidth || "1.5px"};
    }
    .timeline-label {
      fill: ${labelStyles.fill || "rgb(102, 102, 102)"};
      font-size: ${labelStyles.fontSize || "13px"};
      font-family: ${labelStyles.fontFamily || "ui-sans-serif, system-ui, sans-serif"};
      font-weight: ${labelStyles.fontWeight || "600"};
    }
  `;
}

function buildTimelineExportSvgMarkup() {
  const clone = elements.chart.cloneNode(true);
  const style = document.createElementNS("http://www.w3.org/2000/svg", "style");

  clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
  clone.setAttribute("xmlns:xlink", "http://www.w3.org/1999/xlink");
  clone.setAttribute("width", String(chartConfig.width));
  clone.setAttribute("height", String(chartConfig.height));

  style.textContent = buildTimelineExportStyles();
  clone.insertBefore(style, clone.firstChild);

  return new XMLSerializer().serializeToString(clone);
}

function loadImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("Could not render the timeline SVG as an image."));
    image.src = url;
  });
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) {
        resolve(blob);
        return;
      }

      reject(new Error("Could not convert the exported timeline to PNG."));
    }, "image/png");
  });
}

async function downloadTimelineAsPng() {
  if (!elements.downloadPngButton) {
    return;
  }

  const button = elements.downloadPngButton;
  const previousLabel = button.getAttribute("aria-label");
  const previousTitle = button.title;

  button.disabled = true;
  button.setAttribute("aria-label", "Preparing timeline PNG");
  button.title = "Preparing timeline PNG";

  try {
    const svgMarkup = buildTimelineExportSvgMarkup();
    const svgUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(svgMarkup)}`;

    const image = await loadImage(svgUrl);
    const canvas = document.createElement("canvas");
    const context = canvas.getContext("2d");

    if (!context) {
      throw new Error("Canvas 2D context is not available.");
    }

    canvas.width = chartConfig.width * PNG_EXPORT_SCALE;
    canvas.height = chartConfig.height * PNG_EXPORT_SCALE;
    context.scale(PNG_EXPORT_SCALE, PNG_EXPORT_SCALE);
    context.drawImage(image, 0, 0, chartConfig.width, chartConfig.height);

    const pngBlob = await canvasToBlob(canvas);
    const pngUrl = URL.createObjectURL(pngBlob);

    try {
      const downloadLink = document.createElement("a");
      downloadLink.href = pngUrl;
      downloadLink.download = `artificial-analysis-intelligence-timeline-${new Date().toISOString().slice(0, 10)}.png`;
      document.body.append(downloadLink);
      downloadLink.click();
      downloadLink.remove();
    } finally {
      setTimeout(() => URL.revokeObjectURL(pngUrl), 1000);
    }
  } catch (error) {
    console.error("Could not export timeline PNG", error);
    window.alert("Could not export the timeline as PNG.");
  } finally {
    button.disabled = false;
    button.setAttribute("aria-label", previousLabel || "Download timeline as PNG");
    button.title = previousTitle || "Download timeline as PNG";
  }
}

// Re-render at most once per frame while dragging or zooming.
function scheduleRender() {
  if (state.renderFrame) {
    return;
  }

  state.renderFrame = requestAnimationFrame(() => {
    state.renderFrame = 0;
    applyFilters();
  });
}

// The wheel zooms the dates only; the Y axis refits to the visible points.
function zoomChartAtPointer(event) {
  if (!state.chartView || !state.timeWindow) {
    return;
  }

  const geometry = getChartPlotGeometry();

  if (!isPointerInsidePlot(event.clientX, event.clientY, geometry)) {
    return;
  }

  event.preventDefault();

  const { displayDomain } = state.chartView;
  const xRatio = (event.clientX - geometry.plotLeft) / (geometry.plotRight - geometry.plotLeft);
  const anchor = displayDomain.xMin + (displayDomain.xMax - displayDomain.xMin) * xRatio;
  const zoomFactor = event.deltaY < 0 ? 0.82 : 1.22;
  const { startMs, endMs } = state.timeWindow;

  setTimeWindow(anchor - (anchor - startMs) * zoomFactor, anchor + (endMs - anchor) * zoomFactor);
  scheduleRender();
}

function startChartPan(event) {
  if (event.button !== 0 || !state.chartView || !isTimeWindowNarrowed()) {
    return;
  }

  const geometry = getChartPlotGeometry();
  if (!isPointerInsidePlot(event.clientX, event.clientY, geometry)) {
    return;
  }

  const { displayDomain } = state.chartView;
  state.chartPan = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startWindow: { ...state.timeWindow },
    msPerPixel: (displayDomain.xMax - displayDomain.xMin) / (geometry.plotRight - geometry.plotLeft),
    moved: false,
  };
}

function moveChartPan(event) {
  if (!state.chartPan || event.pointerId !== state.chartPan.pointerId) {
    return;
  }

  const deltaX = event.clientX - state.chartPan.startClientX;
  const deltaY = event.clientY - state.chartPan.startClientY;

  if (!state.chartPan.moved && Math.hypot(deltaX, deltaY) < PAN_DRAG_THRESHOLD_PX) {
    return;
  }

  if (!state.chartPan.moved) {
    state.chartPan.moved = true;
    elements.chartWrap.setPointerCapture?.(event.pointerId);
    hideTooltip();
    elements.chartWrap.classList.add("is-panning");
  }

  shiftTimeWindow(state.chartPan.startWindow, -deltaX * state.chartPan.msPerPixel);
  scheduleRender();
}

function endChartPan(event) {
  if (!state.chartPan || event.pointerId !== state.chartPan.pointerId) {
    return;
  }

  if (state.chartPan.moved) {
    state.suppressChartClickUntil = performance.now() + 250;
    if (elements.chart.contains(document.activeElement)) {
      document.activeElement.blur();
    }
  }

  elements.chartWrap.releasePointerCapture?.(event.pointerId);
  elements.chartWrap.classList.remove("is-panning");
  state.chartPan = null;
}

function resetChartZoom() {
  if (!isTimeWindowNarrowed()) {
    return;
  }

  applyTimeRangePreset("max");
  applyFilters();
}

function getBrushTimeAt(clientX) {
  const domain = getBrushDomain(getTimelineDataExtent());
  const rect = elements.brushTrack.getBoundingClientRect();
  const ratio = clamp((clientX - rect.left) / rect.width, 0, 1);
  return domain.min + ratio * (domain.max - domain.min);
}

// Snaps a position on the range bar to the nearest day boundary.
function nearestDayBoundary(ms) {
  return Math.round(ms / DAY_MS) * DAY_MS;
}

function startBrushDrag(event) {
  if (event.button !== 0 || !state.timeWindow || !getTimelineDataExtent()) {
    return;
  }

  const kind =
    event.target === elements.brushStartHandle
      ? "start"
      : event.target === elements.brushEndHandle
        ? "end"
        : event.target === elements.brushWindow
          ? "move"
          : "create";

  event.preventDefault();
  event.target.focus?.({ preventScroll: true });
  elements.brushTrack.setPointerCapture?.(event.pointerId);
  elements.brushTrack.classList.add("is-dragging");
  hideTooltip();

  state.brushDrag = {
    pointerId: event.pointerId,
    kind,
    originX: event.clientX,
    originMs: getBrushTimeAt(event.clientX),
    startWindow: { ...state.timeWindow },
    moved: false,
  };
}

function moveBrushDrag(event) {
  const drag = state.brushDrag;
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  if (!drag.moved && Math.abs(event.clientX - drag.originX) < 3) {
    return;
  }
  drag.moved = true;

  const ms = getBrushTimeAt(event.clientX);
  const { startWindow } = drag;

  if (drag.kind === "move") {
    shiftTimeWindow(startWindow, ms - drag.originMs);
  } else if (drag.kind === "start") {
    setTimeWindow(Math.min(nearestDayBoundary(ms), startOfUtcDay(startWindow.endMs)), startWindow.endMs);
  } else if (drag.kind === "end") {
    setTimeWindow(startWindow.startMs, Math.max(nearestDayBoundary(ms) - 1, startWindow.startMs));
  } else {
    setTimeWindow(
      nearestDayBoundary(Math.min(drag.originMs, ms)),
      nearestDayBoundary(Math.max(drag.originMs, ms)) - 1,
    );
  }

  scheduleRender();
}

function endBrushDrag(event) {
  const drag = state.brushDrag;
  if (!drag || event.pointerId !== drag.pointerId) {
    return;
  }

  // A click outside the window centres the window on that date.
  if (drag.kind === "create" && !drag.moved) {
    const { startMs, endMs } = drag.startWindow;
    shiftTimeWindow(drag.startWindow, drag.originMs - (startMs + (endMs - startMs) / 2));
    scheduleRender();
  }

  elements.brushTrack.releasePointerCapture?.(event.pointerId);
  elements.brushTrack.classList.remove("is-dragging");
  state.brushDrag = null;
}

const BRUSH_KEY_STEPS_DAYS = {
  ArrowLeft: -1,
  ArrowDown: -1,
  ArrowRight: 1,
  ArrowUp: 1,
  PageDown: -30,
  PageUp: 30,
};

function handleBrushKeydown(event) {
  const extent = getTimelineDataExtent();
  const range = state.timeWindow;
  if (!extent || !range) {
    return;
  }

  let days = BRUSH_KEY_STEPS_DAYS[event.key];
  const isEdgeKey = event.key === "Home" || event.key === "End";
  if (days === undefined && !isEdgeKey) {
    return;
  }
  if (days !== undefined && event.shiftKey && Math.abs(days) === 1) {
    days *= 7;
  }

  event.preventDefault();
  const lastDayStart = startOfUtcDay(range.endMs);

  if (event.currentTarget === elements.brushStartHandle) {
    const start = isEdgeKey
      ? event.key === "Home" ? extent.min : lastDayStart
      : range.startMs + days * DAY_MS;
    setTimeWindow(Math.min(start, lastDayStart), range.endMs);
  } else if (event.currentTarget === elements.brushEndHandle) {
    const end = isEdgeKey
      ? event.key === "Home" ? range.startMs : extent.max
      : range.endMs + days * DAY_MS;
    setTimeWindow(range.startMs, Math.max(end, range.startMs));
  } else {
    const delta = isEdgeKey
      ? event.key === "Home" ? extent.min - range.startMs : extent.max - range.endMs
      : days * DAY_MS;
    shiftTimeWindow(range, delta);
  }

  scheduleRender();
}

function handleRangeInputChange(event) {
  const range = state.timeWindow;
  const value = fromDateInputValue(event.target.value);
  if (!range || value === null) {
    syncTimeRangeControls(getTimelineDataExtent());
    return;
  }

  // Keep the two dates in order by moving the other one when they cross.
  if (event.target === elements.rangeFromInput) {
    setTimeWindow(value, Math.max(range.endMs, value));
  } else {
    setTimeWindow(Math.min(range.startMs, value), value);
  }
  applyFilters();
}

function applyFilters() {
  const selectedCreators = getSelectedCreators();
  const minIntelligenceValue = Number(elements.minIntelligenceInput.value);
  const hasMinIntelligenceFilter =
    elements.minIntelligenceInput.value.trim() !== "" && !Number.isNaN(minIntelligenceValue);
  const search = elements.searchInput.value.trim().toLowerCase();
  const pricedOnly = elements.pricedOnly.checked;

  state.rangeModels = state.models
    .filter((model) => model.releaseDate && model.intelligence !== null)
    .filter((model) => selectedCreators.has(model.creator))
    .filter((model) => (hasMinIntelligenceFilter ? model.intelligence >= minIntelligenceValue : true))
    .filter((model) => (pricedOnly ? model.priceBlended !== null && model.priceBlended > 0 : true))
    .filter((model) =>
      search ? `${model.name} ${model.creator}`.toLowerCase().includes(search) : true,
    )
    .sort((a, b) => new Date(a.releaseDate) - new Date(b.releaseDate));
  state.visibleModels = state.rangeModels.filter((model) => isModelWithinTimeRange(model, state.timeWindow));

  renderTimeline();

  renderSummary();
}

function applyPayload(payload) {
  state.models = payload.models || [];
  state.refreshedAt = payload.refreshedAt;
  state.cache = payload.cache || null;
  state.apiStatus = payload.apiStatus || null;

  writeCachedPayload(payload);

  applyTimeRangePreset(elements.timeRangeSelect?.value || DEFAULT_TIME_RANGE_MODE);
  renderHeroMeta();
  renderHeroSpotlight();
  populateCreatorFilter();
  applyFilters();
}

function bindEvents() {
  elements.creatorFilter.addEventListener("change", () => {
    renderCreatorSummary();
    applyFilters();
  });
  elements.creatorsAllButton.addEventListener("click", () => {
    setCreatorSelection("all");
    applyFilters();
  });
  elements.creatorsNoneButton.addEventListener("click", () => {
    setCreatorSelection("none");
    applyFilters();
  });
  elements.timeRangeSelect.addEventListener("change", () => {
    applyTimeRangePreset(elements.timeRangeSelect.value);
    applyFilters();
  });
  elements.rangeFromInput?.addEventListener("change", handleRangeInputChange);
  elements.rangeToInput?.addEventListener("change", handleRangeInputChange);
  elements.rangeResetButton?.addEventListener("click", resetChartZoom);
  if (elements.brushTrack) {
    elements.brushTrack.addEventListener("pointerdown", startBrushDrag);
    elements.brushTrack.addEventListener("pointermove", moveBrushDrag);
    elements.brushTrack.addEventListener("pointerup", endBrushDrag);
    elements.brushTrack.addEventListener("pointercancel", endBrushDrag);
    for (const element of [elements.brushStartHandle, elements.brushEndHandle, elements.brushWindow]) {
      element.addEventListener("keydown", handleBrushKeydown);
    }
    new ResizeObserver(() => renderBrush()).observe(elements.brushTrack);
  }
  elements.creatorSearchInput.addEventListener("input", filterCreatorOptions);
  elements.creatorDropdown.addEventListener("toggle", () => {
    elements.creatorDropdown.classList.toggle("is-open", elements.creatorDropdown.open);
    if (elements.creatorDropdown.open) {
      elements.creatorSearchInput.focus();
      elements.creatorSearchInput.select();
    }
  });
  document.addEventListener("pointerdown", (event) => {
    if (!elements.creatorDropdown.open) {
      return;
    }

    if (!elements.creatorDropdown.contains(event.target)) {
      elements.creatorDropdown.open = false;
    }
  }, true);
  elements.chart.addEventListener("pointerover", (event) => {
    if (state.chartPan) {
      return;
    }

    const point = findTimelinePoint(event.target);
    if (point) {
      showTooltip(point, event.clientX, event.clientY);
    }
  });
  elements.chart.addEventListener("pointermove", (event) => {
    if (state.chartPan) {
      return;
    }

    const point = findTimelinePoint(event.target);
    if (!point) {
      return;
    }

    if (elements.tooltip.hidden) {
      showTooltip(point, event.clientX, event.clientY);
      return;
    }

    positionTooltip(event.clientX, event.clientY);
  });
  elements.chart.addEventListener("pointerout", (event) => {
    const point = findTimelinePoint(event.target);
    const relatedPoint = findTimelinePoint(event.relatedTarget);
    if (point && point !== relatedPoint) {
      hideTooltip();
    }
  });
  elements.chart.addEventListener("focusin", (event) => {
    const point = findTimelinePoint(event.target);
    if (point) {
      showTooltipFromFocus(point);
    }
  });
  elements.chart.addEventListener("focusout", (event) => {
    const point = findTimelinePoint(event.target);
    const relatedPoint = findTimelinePoint(event.relatedTarget);
    if (point && point !== relatedPoint) {
      hideTooltip();
    }
  });
  elements.chart.addEventListener("click", (event) => {
    if (performance.now() < state.suppressChartClickUntil) {
      state.suppressChartClickUntil = 0;
      event.preventDefault();
      return;
    }

    const point = findTimelinePoint(event.target);
    if (point) {
      openModelDetails(point);
    }
  });
  elements.chart.addEventListener("keydown", (event) => {
    const point = findTimelinePoint(event.target);
    if (!point || (event.key !== "Enter" && event.key !== " ")) {
      return;
    }

    event.preventDefault();
    openModelDetails(point);
  });
  elements.chartWrap.addEventListener("pointerdown", startChartPan);
  elements.chartWrap.addEventListener("pointermove", moveChartPan);
  elements.chartWrap.addEventListener("pointerup", endChartPan);
  elements.chartWrap.addEventListener("pointercancel", endChartPan);
  elements.chartWrap.addEventListener("wheel", zoomChartAtPointer, { passive: false });
  elements.chartWrap.addEventListener("dblclick", resetChartZoom);
  elements.downloadPngButton?.addEventListener("click", downloadTimelineAsPng);
  elements.minIntelligenceInput.addEventListener("input", applyFilters);
  elements.searchInput.addEventListener("input", applyFilters);
  elements.pricedOnly.addEventListener("change", applyFilters);
  elements.showAllLabels.addEventListener("change", applyFilters);
}

async function init() {
  bindEvents();

  const bootstrapPayload = readBootstrapPayload();
  const cachedPayload = readCachedPayload();

  if (bootstrapPayload) {
    applyPayload(bootstrapPayload);
    return;
  }

  if (cachedPayload) {
    applyPayload(cachedPayload);
    return;
  }

  elements.statusValue.textContent = "Error";
  elements.caption.textContent = "Could not load timeline data";
  elements.chart.innerHTML = `
    <rect x="0" y="0" width="${chartConfig.width}" height="${chartConfig.height}" rx="28" fill="rgba(255,255,255,0.72)"></rect>
    <text x="${chartConfig.width / 2}" y="${chartConfig.height / 2}" text-anchor="middle" class="timeline-empty">
      Could not load timeline data.
    </text>
  `;
  console.error("Missing bootstrapped models payload");
}

init();

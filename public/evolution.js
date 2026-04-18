const state = {
  models: [],
  visibleModels: [],
  refreshedAt: null,
  promptOptions: {},
  cache: null,
  apiStatus: null,
  zoomDomain: null,
  chartView: null,
  chartPan: null,
  suppressChartClickUntil: 0,
  activeTimeRange: null,
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
  minIntelligenceInput: document.querySelector("#timeline-min-intelligence"),
  searchInput: document.querySelector("#timeline-search-input"),
  pricedOnly: document.querySelector("#timeline-priced-only"),
  showAllLabels: document.querySelector("#timeline-show-all-labels"),
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
const MIN_X_ZOOM_SPAN_MS = 1000 * 60 * 60 * 24 * 45;
const MIN_Y_ZOOM_SPAN = 6;
const PAN_DRAG_THRESHOLD_PX = 6;
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
  max: {
    label: "Max",
    kind: "max",
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

function formatShare(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return `${numberFormat.format(value * 100)}%`;
}

function formatPercent(value) {
  if (value === null || value === undefined || Number.isNaN(value)) {
    return "—";
  }

  return `${numberFormat.format(value)}%`;
}

function formatMonth(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

function formatDate(dateString) {
  const date = dateString instanceof Date ? dateString : new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return "—";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
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

  if (formatter === "share") {
    return formatShare(value);
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

function getTimelineDataExtent() {
  const timestamps = getTimelineEligibleModels()
    .map(getReleaseTimestamp)
    .filter((timestamp) => timestamp !== null);

  if (!timestamps.length) {
    return null;
  }

  return {
    min: Math.min(...timestamps),
    max: Math.max(...timestamps),
  };
}

function getActiveTimeRangeMode() {
  return elements.timeRangeSelect?.value || DEFAULT_TIME_RANGE_MODE;
}

function getPresetTimeRange(mode) {
  const preset = TIME_RANGE_PRESETS[mode];
  const extent = getTimelineDataExtent();
  if (!preset || !extent) {
    return null;
  }

  const anchor = new Date(extent.max);
  anchor.setHours(23, 59, 59, 999);

  const start = new Date(anchor);
  start.setHours(0, 0, 0, 0);

  if (preset.kind === "max") {
    return {
      mode,
      label: preset.label,
      startMs: extent.min,
      endMs: anchor.getTime(),
    };
  }

  if (preset.kind === "days") {
    start.setDate(start.getDate() - (preset.amount - 1));
  }

  if (preset.kind === "months") {
    start.setMonth(start.getMonth() - preset.amount);
  }

  return {
    mode,
    label: preset.label,
    startMs: start.getTime(),
    endMs: anchor.getTime(),
  };
}

function setActiveTimeRange(mode) {
  const nextMode = TIME_RANGE_PRESETS[mode] ? mode : DEFAULT_TIME_RANGE_MODE;

  if (elements.timeRangeSelect) {
    elements.timeRangeSelect.value = nextMode;
  }
}

function getActiveTimeRange() {
  const mode = getActiveTimeRangeMode();

  return getPresetTimeRange(mode);
}

function describeTimeRange(range) {
  if (!range) {
    return "All release dates";
  }

  return `${range.label} · ${formatDate(range.startMs)} to ${formatDate(range.endMs)}`;
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

function createTicks(minDate, maxDate, count = 6) {
  const start = minDate.getTime();
  const end = maxDate.getTime();
  const step = (end - start) / Math.max(1, count - 1);
  return Array.from({ length: count }, (_, index) => new Date(start + index * step));
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

function getBaseChartDomain(models) {
  const dateValues = models.map((model) => new Date(model.releaseDate).getTime());
  const intelligenceValues = models.map((model) => model.intelligence);

  return {
    xMin: Math.min(...dateValues),
    xMax: Math.max(...dateValues),
    yMin: Math.max(0, Math.floor(Math.min(...intelligenceValues) - 3)),
    yMax: Math.ceil(Math.max(...intelligenceValues) + 2),
  };
}

function normalizeZoomDomain(baseDomain, zoomDomain) {
  if (!zoomDomain) {
    return baseDomain;
  }

  const baseXSpan = baseDomain.xMax - baseDomain.xMin;
  const baseYSpan = baseDomain.yMax - baseDomain.yMin;
  const minXSpan = Math.min(MIN_X_ZOOM_SPAN_MS, baseXSpan);
  const minYSpan = Math.min(MIN_Y_ZOOM_SPAN, baseYSpan);

  let xSpan = Math.min(baseXSpan, Math.max(minXSpan, zoomDomain.xMax - zoomDomain.xMin));
  let ySpan = Math.min(baseYSpan, Math.max(minYSpan, zoomDomain.yMax - zoomDomain.yMin));
  let xMin = zoomDomain.xMin;
  let yMin = zoomDomain.yMin;

  if (xMin < baseDomain.xMin) {
    xMin = baseDomain.xMin;
  }
  if (xMin + xSpan > baseDomain.xMax) {
    xMin = baseDomain.xMax - xSpan;
  }

  if (yMin < baseDomain.yMin) {
    yMin = baseDomain.yMin;
  }
  if (yMin + ySpan > baseDomain.yMax) {
    yMin = baseDomain.yMax - ySpan;
  }

  const normalized = {
    xMin,
    xMax: xMin + xSpan,
    yMin,
    yMax: yMin + ySpan,
  };

  const isFullX = Math.abs(normalized.xMin - baseDomain.xMin) < 1 && Math.abs(normalized.xMax - baseDomain.xMax) < 1;
  const isFullY =
    Math.abs(normalized.yMin - baseDomain.yMin) < 0.001 &&
    Math.abs(normalized.yMax - baseDomain.yMax) < 0.001;

  return isFullX && isFullY ? baseDomain : normalized;
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
    ["Math", formatTooltipMetric(model.math, "percent")],
    ["GPQA", formatTooltipMetric(model.gpqa, "share")],
    ["MMLU-Pro", formatTooltipMetric(model.mmluPro, "share")],
    ["LiveCodeBench", formatTooltipMetric(model.liveCodeBench, "share")],
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

  if (!visible.length) {
    state.chartView = null;
    elements.chart.innerHTML = `
      <rect x="0" y="0" width="${chartConfig.width}" height="${chartConfig.height}" rx="28" fill="rgba(255,255,255,0.72)"></rect>
      <text x="${chartConfig.width / 2}" y="${chartConfig.height / 2}" text-anchor="middle" class="timeline-empty">
        No models match the current filters.
      </text>
    `;
    return {
      labelledCount: 0,
      visibleCount: 0,
    };
  }

  const baseDomain = getBaseChartDomain(visible);
  const displayDomain = normalizeZoomDomain(baseDomain, state.zoomDomain);
  state.zoomDomain =
    displayDomain.xMin === baseDomain.xMin &&
    displayDomain.xMax === baseDomain.xMax &&
    displayDomain.yMin === baseDomain.yMin &&
    displayDomain.yMax === baseDomain.yMax
      ? null
      : displayDomain;

  const zoomedVisible = visible
    .map((model, modelIndex) => ({ model, modelIndex }))
    .filter(({ model }) => {
      const releaseTime = new Date(model.releaseDate).getTime();
      return (
        releaseTime >= displayDomain.xMin &&
        releaseTime <= displayDomain.xMax &&
        model.intelligence >= displayDomain.yMin &&
        model.intelligence <= displayDomain.yMax
      );
    });

  if (!zoomedVisible.length) {
    state.chartView = {
      baseDomain,
      displayDomain,
      plotWidth: chartConfig.width - chartConfig.marginLeft - chartConfig.marginRight,
      plotHeight: chartConfig.height - chartConfig.marginTop - chartConfig.marginBottom,
    };
    elements.chart.innerHTML = `
      <rect x="0" y="0" width="${chartConfig.width}" height="${chartConfig.height}" rx="28" fill="rgba(255,255,255,0.72)"></rect>
      <text x="${chartConfig.width / 2}" y="${chartConfig.height / 2}" text-anchor="middle" class="timeline-empty">
        No models in the current zoom window.
      </text>
    `;
    return {
      labelledCount: 0,
      visibleCount: 0,
    };
  }

  const positivePrices = zoomedVisible
    .map(({ model }) => model.priceBlended)
    .filter((value) => value !== null && value !== undefined && !Number.isNaN(value) && value > 0);
  const maxPrice = positivePrices.length ? Math.max(...positivePrices) : 0;

  const plotWidth = chartConfig.width - chartConfig.marginLeft - chartConfig.marginRight;
  const plotHeight = chartConfig.height - chartConfig.marginTop - chartConfig.marginBottom;
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
    baseDomain,
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

  const dateTicks = createTicks(new Date(displayDomain.xMin), new Date(displayDomain.xMax));
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
          const x = xScale(tick.getTime());
          return `
            <line x1="${x}" y1="${chartConfig.marginTop}" x2="${x}" y2="${chartConfig.marginTop + plotHeight}"></line>
            <text x="${x}" y="${chartConfig.marginTop + plotHeight + 36}" text-anchor="middle">${escapeHtml(
              formatMonth(tick),
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
  const isZoomed = Boolean(state.zoomDomain);
  elements.chartWrap.classList.toggle("is-pan-enabled", isZoomed);
  if (!isZoomed) {
    elements.chartWrap.classList.remove("is-panning");
  }
  const timeRangeLabel = describeTimeRange(state.activeTimeRange);
  elements.caption.textContent = elements.showAllLabels.checked
    ? `${chartState.visibleCount} visible points${isZoomed ? " in zoom" : ""} · all labels shown · ${timeRangeLabel}`
    : `${chartState.visibleCount} visible points${isZoomed ? " in zoom" : ""} · ${chartState.labelledCount} labels shown · ${timeRangeLabel}`;
}

function zoomChartAtPointer(event) {
  if (!state.chartView) {
    return;
  }

  const geometry = getChartPlotGeometry();

  if (!isPointerInsidePlot(event.clientX, event.clientY, geometry)) {
    return;
  }

  event.preventDefault();

  const { baseDomain, displayDomain } = state.chartView;
  const xRatio = (event.clientX - geometry.plotLeft) / (geometry.plotRight - geometry.plotLeft);
  const yRatio = (event.clientY - geometry.plotTop) / (geometry.plotBottom - geometry.plotTop);
  const currentXSpan = displayDomain.xMax - displayDomain.xMin;
  const currentYSpan = displayDomain.yMax - displayDomain.yMin;
  const zoomFactor = event.deltaY < 0 ? 0.82 : 1.22;
  const newXSpan = currentXSpan * zoomFactor;
  const newYSpan = currentYSpan * zoomFactor;
  const anchorX = displayDomain.xMin + currentXSpan * xRatio;
  const anchorY = displayDomain.yMax - currentYSpan * yRatio;
  const anchorYRatioFromMin = 1 - yRatio;
  const nextDomain = normalizeZoomDomain(baseDomain, {
    xMin: anchorX - newXSpan * xRatio,
    xMax: anchorX + newXSpan * (1 - xRatio),
    yMin: anchorY - newYSpan * anchorYRatioFromMin,
    yMax: anchorY + newYSpan * yRatio,
  });

  state.zoomDomain =
    nextDomain.xMin === baseDomain.xMin &&
    nextDomain.xMax === baseDomain.xMax &&
    nextDomain.yMin === baseDomain.yMin &&
    nextDomain.yMax === baseDomain.yMax
      ? null
      : nextDomain;

  renderTimeline();
}

function startChartPan(event) {
  if (event.button !== 0 || !state.zoomDomain || !state.chartView) {
    return;
  }

  const geometry = getChartPlotGeometry();
  if (!isPointerInsidePlot(event.clientX, event.clientY, geometry)) {
    return;
  }

  state.chartPan = {
    pointerId: event.pointerId,
    startClientX: event.clientX,
    startClientY: event.clientY,
    startDomain: { ...state.chartView.displayDomain },
    baseDomain: state.chartView.baseDomain,
    moved: false,
  };
}

function moveChartPan(event) {
  if (!state.chartPan || event.pointerId !== state.chartPan.pointerId) {
    return;
  }

  const geometry = getChartPlotGeometry();
  if (!geometry) {
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

  const xSpan = state.chartPan.startDomain.xMax - state.chartPan.startDomain.xMin;
  const ySpan = state.chartPan.startDomain.yMax - state.chartPan.startDomain.yMin;
  const xUnitsPerPixel = xSpan / (geometry.plotRight - geometry.plotLeft);
  const yUnitsPerPixel = ySpan / (geometry.plotBottom - geometry.plotTop);
  const nextDomain = normalizeZoomDomain(state.chartPan.baseDomain, {
    xMin: state.chartPan.startDomain.xMin - deltaX * xUnitsPerPixel,
    xMax: state.chartPan.startDomain.xMax - deltaX * xUnitsPerPixel,
    yMin: state.chartPan.startDomain.yMin + deltaY * yUnitsPerPixel,
    yMax: state.chartPan.startDomain.yMax + deltaY * yUnitsPerPixel,
  });

  state.zoomDomain =
    nextDomain.xMin === state.chartPan.baseDomain.xMin &&
    nextDomain.xMax === state.chartPan.baseDomain.xMax &&
    nextDomain.yMin === state.chartPan.baseDomain.yMin &&
    nextDomain.yMax === state.chartPan.baseDomain.yMax
      ? null
      : nextDomain;

  renderTimeline();
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
  if (!state.zoomDomain) {
    return;
  }

  state.zoomDomain = null;
  renderTimeline();
}

function applyFilters() {
  const selectedCreators = getSelectedCreators();
  const minIntelligenceValue = Number(elements.minIntelligenceInput.value);
  const hasMinIntelligenceFilter =
    elements.minIntelligenceInput.value.trim() !== "" && !Number.isNaN(minIntelligenceValue);
  const search = elements.searchInput.value.trim().toLowerCase();
  const pricedOnly = elements.pricedOnly.checked;
  const timeRange = getActiveTimeRange();

  state.activeTimeRange = timeRange;

  state.visibleModels = state.models
    .filter((model) => model.releaseDate && model.intelligence !== null)
    .filter((model) => isModelWithinTimeRange(model, timeRange))
    .filter((model) => selectedCreators.has(model.creator))
    .filter((model) => (hasMinIntelligenceFilter ? model.intelligence >= minIntelligenceValue : true))
    .filter((model) => (pricedOnly ? model.priceBlended !== null && model.priceBlended > 0 : true))
    .filter((model) =>
      search ? `${model.name} ${model.creator}`.toLowerCase().includes(search) : true,
    )
    .sort((a, b) => new Date(a.releaseDate) - new Date(b.releaseDate));

  renderTimeline();

  renderSummary();
}

function applyPayload(payload) {
  state.models = payload.models || [];
  state.refreshedAt = payload.refreshedAt;
  state.promptOptions = payload.promptOptions || {};
  state.cache = payload.cache || null;
  state.apiStatus = payload.apiStatus || null;

  writeCachedPayload(payload);

  setActiveTimeRange(getActiveTimeRangeMode());
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
    setActiveTimeRange(elements.timeRangeSelect.value);
    applyFilters();
  });
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

const state = {
  models: [],
  visibleModels: [],
  refreshedAt: null,
  promptOptions: {},
  cache: null,
  apiStatus: null,
};

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
  minIntelligenceInput: document.querySelector("#timeline-min-intelligence"),
  searchInput: document.querySelector("#timeline-search-input"),
  pricedOnly: document.querySelector("#timeline-priced-only"),
  showAllLabels: document.querySelector("#timeline-show-all-labels"),
  caption: document.querySelector("#timeline-caption"),
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

function formatMonth(date) {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    year: "2-digit",
  }).format(date);
}

function formatDate(dateString) {
  const date = new Date(dateString);
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

function formatTooltipMetric(value, formatter, suffix = "") {
  if (formatter === "money") {
    return formatMoney(value);
  }

  if (formatter === "date") {
    return formatDate(value);
  }

  return formatMetric(value, suffix);
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
  const creators = [...new Set(state.models.map((model) => model.creator))].sort();
  const previousSelection = getSelectedCreators();
  const shouldSelectAll = previousSelection.size === 0 && !elements.creatorFilter.children.length;

  elements.creatorFilter.innerHTML = creators
    .map((creator) => {
      const checked = shouldSelectAll || previousSelection.has(creator);
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
    `${state.models.length} API models`,
    state.cache?.persistent ? "Edge cache: active" : "Edge cache: inactive",
    formatUpdatedLabel(state.refreshedAt),
  ].filter(Boolean);

  elements.heroMeta.innerHTML = pills
    .map((pill) => `<span class="hero-meta-pill">${escapeHtml(pill)}</span>`)
    .join("");
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

function buildLabelPlacements(points) {
  const sorted = [...points].sort((a, b) => a.cy - b.cy);
  const active = [];

  for (const point of sorted) {
    const labelWidth = Math.min(220, point.label.length * 6.7 + 8);
    let x = point.cx + point.r + 8;
    let y = point.cy - point.r - 4;

    if (x + labelWidth > chartConfig.width - chartConfig.marginRight + 205) {
      x = point.cx - labelWidth - point.r - 8;
    }

    const minY = chartConfig.marginTop + 14;
    const maxY = chartConfig.height - chartConfig.marginBottom - 12;
    y = Math.max(minY, Math.min(maxY, y));

    for (const placed of active) {
      if (Math.abs(placed.x - x) < Math.max(110, labelWidth * 0.65) && Math.abs(placed.y - y) < 18) {
        y = Math.min(maxY, placed.y + 16);
      }
    }

    active.push({ x, y });
    point.labelX = x;
    point.labelY = y;
  }
}

function addPointsUntil(selected, maxLabels, list, perRunLimit = list.length) {
  let added = 0;

  for (const point of list) {
    if (selected.size >= maxLabels || added >= perRunLimit) {
      break;
    }

    if (!selected.has(point.pointIndex)) {
      selected.add(point.pointIndex);
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
  const topPerCreator = [];
  const seenCreators = new Set();

  for (const point of byIntelligence) {
    if (seenCreators.has(point.creator)) {
      continue;
    }

    seenCreators.add(point.creator);
    topPerCreator.push(point);
  }

  if (search) {
    const matchingPoints = points.filter((point) =>
      `${point.name} ${point.creator}`.toLowerCase().includes(search),
    );
    addPointsUntil(selected, maxLabels, matchingPoints, Math.min(matchingPoints.length, 36));
  }

  addPointsUntil(selected, maxLabels, topPerCreator, Math.min(topPerCreator.length, 24));
  addPointsUntil(selected, maxLabels, byIntelligence, Math.ceil(maxLabels * 0.34));
  addPointsUntil(selected, maxLabels, byPrice, Math.ceil(maxLabels * 0.16));
  addPointsUntil(selected, maxLabels, byRecent, Math.ceil(maxLabels * 0.2));

  const remaining = maxLabels - selected.size;
  if (remaining > 0) {
    const step = points.length / remaining;

    for (let index = 0; index < remaining; index += 1) {
      const point = points[Math.min(points.length - 1, Math.floor(index * step))];
      if (point) {
        selected.add(point.pointIndex);
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
    ["Coding", formatTooltipMetric(model.coding)],
    ["Math", formatTooltipMetric(model.math)],
    ["GPQA", formatTooltipMetric(model.gpqa)],
    ["MMLU-Pro", formatTooltipMetric(model.mmluPro)],
    ["LiveCodeBench", formatTooltipMetric(model.liveCodeBench)],
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
  const pointIndex = Number(pointElement.dataset.pointIndex);
  const model = state.visibleModels[pointIndex];
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

function renderChart() {
  const visible = state.visibleModels;
  hideTooltip();

  if (!visible.length) {
    elements.chart.innerHTML = `
      <rect x="0" y="0" width="${chartConfig.width}" height="${chartConfig.height}" rx="28" fill="rgba(255,255,255,0.72)"></rect>
      <text x="${chartConfig.width / 2}" y="${chartConfig.height / 2}" text-anchor="middle" class="timeline-empty">
        No models match the current filters.
      </text>
    `;
    return {
      labelledCount: 0,
    };
  }

  const dateValues = visible.map((model) => new Date(model.releaseDate).getTime());
  const intelligenceValues = visible.map((model) => model.intelligence);
  const positivePrices = visible
    .map((model) => model.priceBlended)
    .filter((value) => value !== null && value !== undefined && !Number.isNaN(value) && value > 0);
  const maxPrice = positivePrices.length ? Math.max(...positivePrices) : 0;

  const xMin = Math.min(...dateValues);
  const xMax = Math.max(...dateValues);
  const yMin = Math.max(0, Math.floor(Math.min(...intelligenceValues) - 3));
  const yMax = Math.ceil(Math.max(...intelligenceValues) + 2);

  const plotWidth = chartConfig.width - chartConfig.marginLeft - chartConfig.marginRight;
  const plotHeight = chartConfig.height - chartConfig.marginTop - chartConfig.marginBottom;
  const xScale = createLinearScale(xMin, xMax, chartConfig.marginLeft, chartConfig.marginLeft + plotWidth);
  const yScale = createLinearScale(yMin, yMax, chartConfig.marginTop + plotHeight, chartConfig.marginTop);

  const points = visible.map((model, pointIndex) => {
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
      pointIndex,
      cx,
      cy,
      r,
      label: model.name,
      colors,
      hasZeroOrMissingPrice,
      patternId: patternIdForCreator(model.creator),
    };
  });

  const labelledPointIndexes = selectLabelPointIndexes(points);
  const labelledPoints = points.filter((point) => labelledPointIndexes.has(point.pointIndex));
  buildLabelPlacements(labelledPoints);
  const missingPricePatterns = [...new Map(
    points
      .filter((point) => point.hasZeroOrMissingPrice)
      .map((point) => [point.patternId, point]),
  ).values()];

  const dateTicks = createTicks(new Date(xMin), new Date(xMax));
  const yTicks = Array.from({ length: 6 }, (_, index) => yMin + ((yMax - yMin) / 5) * index);

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
            <g class="timeline-point" role="img" tabindex="0" data-point-index="${index}" aria-label="${escapeHtml(
              `${point.name}, ${point.creator}, released ${formatDate(point.releaseDate)}, intelligence ${formatMetric(
                point.intelligence,
              )}`,
            )}">
              <circle
                cx="${point.cx}"
                cy="${point.cy}"
                r="${point.r}"
                fill="${point.hasZeroOrMissingPrice ? `url(#${point.patternId})` : point.colors.fill}"
                stroke="${point.colors.stroke}"
                stroke-width="2"
              ></circle>
              ${labelledPointIndexes.has(point.pointIndex)
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
    labelledCount: labelledPointIndexes.size,
  };
}

function applyFilters() {
  const selectedCreators = getSelectedCreators();
  const minIntelligenceValue = Number(elements.minIntelligenceInput.value);
  const hasMinIntelligenceFilter =
    elements.minIntelligenceInput.value.trim() !== "" && !Number.isNaN(minIntelligenceValue);
  const search = elements.searchInput.value.trim().toLowerCase();
  const pricedOnly = elements.pricedOnly.checked;

  state.visibleModels = state.models
    .filter((model) => model.releaseDate && model.intelligence !== null)
    .filter((model) => selectedCreators.has(model.creator))
    .filter((model) => (hasMinIntelligenceFilter ? model.intelligence >= minIntelligenceValue : true))
    .filter((model) => (pricedOnly ? model.priceBlended !== null && model.priceBlended > 0 : true))
    .filter((model) =>
      search ? `${model.name} ${model.creator}`.toLowerCase().includes(search) : true,
    )
    .sort((a, b) => new Date(a.releaseDate) - new Date(b.releaseDate));

  const chartState = renderChart();
  elements.caption.textContent = elements.showAllLabels.checked
    ? `${state.visibleModels.length} visible points · all labels shown`
    : `${state.visibleModels.length} visible points · ${chartState.labelledCount} labels shown`;
  const pricedVisible = state.visibleModels.filter(
    (model) =>
      model.priceBlended !== null &&
      model.priceBlended !== undefined &&
      !Number.isNaN(model.priceBlended) &&
      model.priceBlended > 0,
  );
  const maxPrice = pricedVisible.length
    ? Math.max(...pricedVisible.map((model) => model.priceBlended))
    : null;
  elements.statusValue.textContent = maxPrice !== null ? formatMoney(maxPrice) : "No price";

  renderSummary();
}

async function loadModels() {
  elements.statusValue.textContent = "Loading";

  const response = await fetch("/api/models");
  if (!response.ok) {
    throw new Error("Could not load timeline data");
  }

  const payload = await response.json();
  state.models = payload.models || [];
  state.refreshedAt = payload.refreshedAt;
  state.promptOptions = payload.promptOptions || {};
  state.cache = payload.cache || null;
  state.apiStatus = payload.apiStatus || null;

  renderHeroMeta();
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
    const point = findTimelinePoint(event.target);
    if (point) {
      showTooltip(point, event.clientX, event.clientY);
    }
  });
  elements.chart.addEventListener("pointermove", (event) => {
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
  elements.minIntelligenceInput.addEventListener("input", applyFilters);
  elements.searchInput.addEventListener("input", applyFilters);
  elements.pricedOnly.addEventListener("change", applyFilters);
  elements.showAllLabels.addEventListener("change", applyFilters);
}

async function init() {
  bindEvents();

  try {
    await loadModels();
  } catch (error) {
    console.error(error);
    elements.statusValue.textContent = "Error";
    elements.caption.textContent = "Could not load timeline data";
    elements.chart.innerHTML = `
      <rect x="0" y="0" width="${chartConfig.width}" height="${chartConfig.height}" rx="28" fill="rgba(255,255,255,0.72)"></rect>
      <text x="${chartConfig.width / 2}" y="${chartConfig.height / 2}" text-anchor="middle" class="timeline-empty">
        Could not load data from the API.
      </text>
    `;
  }
}

init();

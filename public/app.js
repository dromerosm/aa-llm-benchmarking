const state = {
  models: [],
  filtered: [],
  apiStatus: null,
  refreshedAt: null,
  promptOptions: {},
  cache: null,
  page: 1,
  pageSize: 20,
  expandedColumns: false,
};

const SESSION_CACHE_KEY = "aa-models-payload-v1";
const LOADING_INDICATOR_DELAY_MS = 180;

const elements = {
  pageShell: document.querySelector(".page-shell"),
  heroMeta: document.querySelector("#hero-meta"),
  statusValue: document.querySelector("#status-value"),
  summaryGrid: document.querySelector("#summary-grid"),
  searchInput: document.querySelector("#search-input"),
  priceFilter: document.querySelector("#price-filter"),
  creatorFilter: document.querySelector("#creator-filter"),
  sortSelect: document.querySelector("#sort-select"),
  pageSizeSelect: document.querySelector("#page-size-select"),
  scoredOnlyToggle: document.querySelector("#scored-only-toggle"),
  expandColumnsButton: document.querySelector("#expand-columns-button"),
  tableHead: document.querySelector("#table-head"),
  tableBody: document.querySelector("#table-body"),
  tableCaption: document.querySelector("#table-caption"),
  tableMetaRight: document.querySelector("#table-meta-right"),
  columnModePills: document.querySelector("#column-mode-pills"),
  paginationStatus: document.querySelector("#pagination-status"),
  prevPageButton: document.querySelector("#prev-page-button"),
  nextPageButton: document.querySelector("#next-page-button"),
  summaryCardTemplate: document.querySelector("#summary-card-template"),
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
  if (value === null || value === undefined || Number.isNaN(value) || value === 0) {
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

function formatDate(dateString) {
  if (!dateString) {
    return "—";
  }

  const date = new Date(dateString);
  if (Number.isNaN(date.getTime())) {
    return dateString;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
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

function createLoadingIndicator() {
  let timerId = null;

  return {
    schedule() {
      timerId = window.setTimeout(() => {
        elements.statusValue.textContent = "Loading";
      }, LOADING_INDICATOR_DELAY_MS);
    },
    clear() {
      if (timerId !== null) {
        window.clearTimeout(timerId);
        timerId = null;
      }
    },
  };
}

function rankByMetric(models, metric, direction) {
  return [...models]
    .filter((model) => model[metric] !== null && model[metric] !== undefined)
    .sort((a, b) =>
      direction === "desc" ? b[metric] - a[metric] : a[metric] - b[metric],
    )[0];
}

function lowestPositivePrice(models) {
  return [...models]
    .filter((model) => model.priceBlended !== null && model.priceBlended > 0)
    .sort((a, b) => a.priceBlended - b.priceBlended)[0];
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

function renderSummary() {
  const cards = [
    {
      label: "Top Intelligence",
      model: rankByMetric(state.models, "intelligence", "desc"),
      subtitle: "Artificial Analysis Intelligence Index",
      metric: (model) => formatMetric(model.intelligence),
    },
    {
      label: "Fastest Output",
      model: rankByMetric(state.models, "outputSpeed", "desc"),
      subtitle: "Median tokens per second",
      metric: (model) => formatMetric(model.outputSpeed, " tok/s"),
    },
    {
      label: "Lowest Latency",
      model: rankByMetric(state.models, "latency", "asc"),
      subtitle: "Time to first token",
      metric: (model) => formatMetric(model.latency, " s"),
    },
    {
      label: "Lowest Price",
      model: lowestPositivePrice(state.models),
      subtitle: "USD / 1M tokens blended 3:1",
      metric: (model) => formatMoney(model.priceBlended),
    },
  ];

  elements.summaryGrid.innerHTML = "";

  for (const card of cards) {
    const node = elements.summaryCardTemplate.content.cloneNode(true);
    node.querySelector(".summary-label").textContent = card.label;
    node.querySelector(".summary-title").textContent = card.model?.name || "N/A";
    node.querySelector(".summary-subtitle").textContent = card.model
      ? `${card.model.creator} · ${card.subtitle}`
      : "No data";
    node.querySelector(".summary-metric").textContent = card.model
      ? card.metric(card.model)
      : "—";
    elements.summaryGrid.appendChild(node);
  }
}

function populateCreatorFilter() {
  const creators = [...new Set(state.models.map((model) => model.creator))].sort();
  const currentValue = elements.creatorFilter.value || "all";
  const options = creators
    .map((creator) => `<option value="${escapeHtml(creator)}">${escapeHtml(creator)}</option>`)
    .join("");

  elements.creatorFilter.innerHTML = '<option value="all">All</option>';
  elements.creatorFilter.insertAdjacentHTML("beforeend", options);
  elements.creatorFilter.value = creators.includes(currentValue) ? currentValue : "all";
}

function compareValues(left, right, direction) {
  if (left === null || left === undefined) {
    return 1;
  }
  if (right === null || right === undefined) {
    return -1;
  }

  if (typeof left === "string" && typeof right === "string") {
    return direction === "asc"
      ? left.localeCompare(right)
      : right.localeCompare(left);
  }

  return direction === "asc" ? left - right : right - left;
}

function matchesPriceFilter(model, priceFilter) {
  if (priceFilter === "all") {
    return true;
  }

  if (model.priceBlended === null || model.priceBlended === undefined) {
    return false;
  }

  if (priceFilter === "low") {
    return model.priceBlended < 0.15;
  }

  if (priceFilter === "medium") {
    return model.priceBlended >= 0.15 && model.priceBlended <= 1;
  }

  return model.priceBlended > 1;
}

function getColumns() {
  const columns = [
    {
      key: "rank",
      label: "#",
      render: (model) => `<span class="rank-badge">${model.rank}</span>`,
    },
    {
      key: "name",
      label: "Model",
      render: (model) => `
        <a class="model-name" href="${escapeHtml(model.detailsUrl || "#")}" target="_blank" rel="noopener noreferrer">
          ${escapeHtml(model.name)}
        </a>
      `,
    },
    {
      key: "creator",
      label: "Creator",
      render: (model) => `<span class="creator-pill">${escapeHtml(model.creator)}</span>`,
    },
    {
      key: "intelligence",
      label: "AA Intelligence",
      render: (model) => metricCell(model.intelligence, (value) => formatMetric(value)),
    },
    {
      key: "priceBlended",
      label: "Blended USD/1M",
      render: (model) => metricCell(model.priceBlended, formatMoney),
    },
    {
      key: "outputSpeed",
      label: "Median Tokens/s",
      render: (model) =>
        metricCell(model.outputSpeed, (value) => formatMetric(value, " tok/s")),
    },
    {
      key: "latency",
      label: "TTFT (s)",
      render: (model) => metricCell(model.latency, (value) => formatMetric(value, " s")),
    },
    {
      key: "releaseDate",
      label: "Release",
      render: (model) => escapeHtml(formatDate(model.releaseDate)),
    },
  ];

  if (!state.expandedColumns) {
    return columns;
  }

  const expandedColumns = [
    {
      key: "coding",
      label: "Coding",
      render: (model) => metricCell(model.coding, (value) => formatMetric(value)),
    },
    {
      key: "math",
      label: "Math",
      render: (model) => metricCell(model.math, (value) => formatMetric(value)),
    },
    {
      key: "gpqa",
      label: "GPQA",
      render: (model) => metricCell(model.gpqa, formatShare),
    },
    {
      key: "mmluPro",
      label: "MMLU-Pro",
      render: (model) => metricCell(model.mmluPro, formatShare),
    },
    {
      key: "liveCodeBench",
      label: "LiveCodeBench",
      render: (model) => metricCell(model.liveCodeBench, formatShare),
    },
    {
      key: "priceInput",
      label: "Input Price",
      render: (model) => metricCell(model.priceInput, formatMoney),
    },
    {
      key: "priceOutput",
      label: "Output Price",
      render: (model) => metricCell(model.priceOutput, formatMoney),
    },
    {
      key: "firstAnswerToken",
      label: "First Answer (s)",
      render: (model) =>
        metricCell(model.firstAnswerToken, (value) => formatMetric(value, " s")),
    },
  ];

  const optionalColumns = [
    {
      key: "hle",
      label: "HLE",
      render: (model) => metricCell(model.hle, formatShare),
    },
    {
      key: "scicode",
      label: "SciCode",
      render: (model) => metricCell(model.scicode, formatShare),
    },
    {
      key: "math500",
      label: "Math-500",
      render: (model) => metricCell(model.math500, formatShare),
    },
    {
      key: "aime",
      label: "AIME",
      render: (model) => metricCell(model.aime, formatShare),
    },
  ];

  return [...columns, ...expandedColumns, ...optionalColumns];
}

function renderColumnMode() {
  elements.expandColumnsButton.textContent = state.expandedColumns
    ? "Collapse columns"
    : "Expand columns";

  elements.pageShell.classList.toggle("columns-expanded", state.expandedColumns);

  const pills = state.expandedColumns
    ? [
        "API columns: Intelligence",
        "API columns: Price",
        "API columns: Latency",
      ]
    : ["Base leaderboard view"];

  elements.columnModePills.innerHTML = pills
    .map((pill) => `<span class="table-pill">${escapeHtml(pill)}</span>`)
    .join("");
}

function applyFilters() {
  const search = elements.searchInput.value.trim().toLowerCase();
  const priceFilter = elements.priceFilter.value;
  const creator = elements.creatorFilter.value;
  const scoredOnly = elements.scoredOnlyToggle.checked;
  const [field, direction] = elements.sortSelect.value.split("-");

  const sortMap = {
    intelligence: "intelligence",
    price: "priceBlended",
    speed: "outputSpeed",
    latency: "latency",
    release: "releaseDate",
    name: "name",
  };

  const filtered = state.models
    .filter((model) => {
      if (creator !== "all" && model.creator !== creator) {
        return false;
      }

      if (!matchesPriceFilter(model, priceFilter)) {
        return false;
      }

      if (scoredOnly && model.intelligence === null) {
        return false;
      }

      if (!search) {
        return true;
      }

      const haystack = `${model.name} ${model.creator} ${model.slug}`.toLowerCase();
      return haystack.includes(search);
    })
    .sort((a, b) => compareValues(a[sortMap[field]], b[sortMap[field]], direction))
    .map((model, index) => ({ ...model, rank: index + 1 }));

  state.filtered = filtered;
  const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  renderTable();
}

function metricCell(value, formatter) {
  const formatted = formatter(value);
  if (formatted === "—") {
    return `<span class="metric-empty">${formatted}</span>`;
  }

  return escapeHtml(formatted);
}

function renderTable() {
  const columns = getColumns();
  const total = state.filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
  const startIndex = total === 0 ? 0 : (state.page - 1) * state.pageSize;
  const endIndex = Math.min(startIndex + state.pageSize, total);
  const visibleModels = state.filtered.slice(startIndex, endIndex);

  elements.tableHead.innerHTML = `
    <tr>
      ${columns
        .map((column) => `<th scope="col">${escapeHtml(column.label)}</th>`)
        .join("")}
    </tr>
  `;

  elements.tableCaption.textContent = `${total} models shown`;

  elements.tableMetaRight.textContent = "";

  elements.paginationStatus.textContent =
    total === 0
      ? "No matching models"
      : `Showing ${startIndex + 1}-${endIndex} of ${total} · Page ${state.page} of ${totalPages}`;
  elements.prevPageButton.disabled = state.page <= 1;
  elements.nextPageButton.disabled = state.page >= totalPages;

  renderColumnMode();

  if (visibleModels.length === 0) {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="${columns.length}">No models match the current filters.</td>
      </tr>
    `;
    return;
  }

  elements.tableBody.innerHTML = visibleModels
    .map(
      (model) => `
        <tr>
          ${columns.map((column) => `<td>${column.render(model)}</td>`).join("")}
        </tr>
      `,
    )
    .join("");
}

async function loadModels() {
  const loadingIndicator = createLoadingIndicator();
  loadingIndicator.schedule();

  try {
    const response = await fetch("/api/models");
    if (!response.ok) {
      throw new Error("Could not load the leaderboard");
    }

    applyPayload(await response.json());
  } finally {
    loadingIndicator.clear();
  }
}

function applyPayload(payload) {
  state.models = payload.models || [];
  state.apiStatus = payload.apiStatus ?? null;
  state.refreshedAt = payload.refreshedAt;
  state.promptOptions = payload.promptOptions || {};
  state.cache = payload.cache || null;

  writeCachedPayload(payload);

  renderHeroMeta();
  renderHeroSpotlight();
  renderSummary();
  populateCreatorFilter();
  applyFilters();
}

function bindEvents() {
  elements.searchInput.addEventListener("input", () => {
    state.page = 1;
    applyFilters();
  });
  elements.priceFilter.addEventListener("change", () => {
    state.page = 1;
    applyFilters();
  });
  elements.creatorFilter.addEventListener("change", () => {
    state.page = 1;
    applyFilters();
  });
  elements.sortSelect.addEventListener("change", () => {
    state.page = 1;
    applyFilters();
  });
  elements.pageSizeSelect.addEventListener("change", () => {
    state.pageSize = Number(elements.pageSizeSelect.value);
    state.page = 1;
    applyFilters();
  });
  elements.scoredOnlyToggle.addEventListener("change", () => {
    state.page = 1;
    applyFilters();
  });
  elements.expandColumnsButton.addEventListener("click", () => {
    state.expandedColumns = !state.expandedColumns;
    renderTable();
  });
  elements.prevPageButton.addEventListener("click", () => {
    if (state.page > 1) {
      state.page -= 1;
      renderTable();
    }
  });
  elements.nextPageButton.addEventListener("click", () => {
    const totalPages = Math.max(1, Math.ceil(state.filtered.length / state.pageSize));
    if (state.page < totalPages) {
      state.page += 1;
      renderTable();
    }
  });
}

async function init() {
  bindEvents();

  const cachedPayload = readCachedPayload();
  if (cachedPayload) {
    applyPayload(cachedPayload);
  }

  try {
    if (!cachedPayload) {
      await loadModels();
      return;
    }

    const response = await fetch("/api/models");
    if (!response.ok) {
      throw new Error("Could not load the leaderboard");
    }

    applyPayload(await response.json());
  } catch (error) {
    if (!cachedPayload) {
      elements.statusValue.textContent = "Error";
      elements.tableCaption.textContent = "Failed to load models";
      elements.tableHead.innerHTML = "";
      elements.tableBody.innerHTML =
        '<tr><td colspan="1">Could not load data from the API.</td></tr>';
      console.error(error);
      return;
    }

    console.warn("Background refresh failed", error);
  }
}

init();

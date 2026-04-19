const state = {
  entries: [],
  filtered: [],
  apiStatus: null,
  refreshedAt: null,
  endpoints: [],
  cache: null,
  page: 1,
  pageSize: 20,
  expandedColumns: false,
};

const SESSION_CACHE_KEY = "aa-media-payload-v1";
const BOOTSTRAP_PAYLOAD_ID = "aa-media-payload";

const elements = {
  pageShell: document.querySelector(".page-shell"),
  heroMeta: document.querySelector("#hero-meta"),
  statusValue: document.querySelector("#status-value"),
  summaryGrid: document.querySelector("#summary-grid"),
  searchInput: document.querySelector("#search-input"),
  endpointFilter: document.querySelector("#endpoint-filter"),
  creatorFilter: document.querySelector("#creator-filter"),
  sortSelect: document.querySelector("#sort-select"),
  pageSizeSelect: document.querySelector("#page-size-select"),
  categoriesOnlyToggle: document.querySelector("#categories-only-toggle"),
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

function parseReleaseTimestamp(value) {
  if (!value) {
    return null;
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return Date.parse(`${value}T00:00:00Z`);
  }

  if (/^\d{4}-\d{2}$/.test(value)) {
    return Date.parse(`${value}-01T00:00:00Z`);
  }

  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? null : parsed;
}

function formatDate(value) {
  if (!value) {
    return "—";
  }

  if (/^\d{4}-\d{2}$/.test(value)) {
    const parsed = parseReleaseTimestamp(value);
    if (parsed === null) {
      return value;
    }

    return new Intl.DateTimeFormat("en-US", {
      year: "numeric",
      month: "short",
    }).format(new Date(parsed));
  }

  if (/^[A-Za-z]{3} \d{4}$/.test(value)) {
    return value;
  }

  const parsed = parseReleaseTimestamp(value);
  if (parsed === null) {
    return value;
  }

  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
  }).format(new Date(parsed));
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

function getDetailsUrl(entry) {
  if (!entry?.slug) {
    return null;
  }

  const sectionByEndpoint = {
    "text-to-image": "image",
    "image-editing": "image",
    "text-to-speech": "text-to-speech",
    "text-to-video": "video",
    "image-to-video": "video",
  };

  const section = sectionByEndpoint[entry.endpointId];
  if (!section) {
    return null;
  }

  return `https://artificialanalysis.ai/${section}/models/${encodeURIComponent(entry.slug)}`;
}

function readCachedPayload() {
  try {
    const raw = sessionStorage.getItem(SESSION_CACHE_KEY);
    if (!raw) {
      return null;
    }

    const payload = JSON.parse(raw);
    if (!payload || !Array.isArray(payload.entries)) {
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
    if (!payload || !Array.isArray(payload.entries)) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
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

function rankByMetric(entries, metric, direction) {
  return [...entries]
    .filter((entry) => entry[metric] !== null && entry[metric] !== undefined)
    .sort((a, b) =>
      direction === "desc" ? b[metric] - a[metric] : a[metric] - b[metric],
    )[0];
}

function getLatestRelease(entries) {
  return [...entries]
    .filter((entry) => parseReleaseTimestamp(entry.releaseDate) !== null)
    .sort(
      (left, right) =>
        parseReleaseTimestamp(right.releaseDate) - parseReleaseTimestamp(left.releaseDate),
    )[0];
}

function getMostRepresentedCreator(entries) {
  const counts = new Map();

  for (const entry of entries) {
    counts.set(entry.creator, (counts.get(entry.creator) || 0) + 1);
  }

  return [...counts.entries()]
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))[0] || null;
}

function renderHeroMeta() {
  const endpointCount = state.endpoints.length || new Set(state.entries.map((entry) => entry.endpointId)).size;
  const pills = [
    `${state.entries.length} entries`,
    `${endpointCount} endpoints`,
    state.cache?.persistent ? "Edge cache: active" : "Edge cache: inactive",
    formatUpdatedLabel(state.refreshedAt),
  ].filter(Boolean);

  elements.heroMeta.innerHTML = pills
    .map((pill) => `<span class="hero-meta-pill">${escapeHtml(pill)}</span>`)
    .join("");
}

function renderHeroSpotlight() {
  const endpoints = state.endpoints.length
    ? state.endpoints
    : [...new Set(state.entries.map((entry) => entry.endpointLabel))].map((label) => ({
        label,
        count: state.entries.filter((entry) => entry.endpointLabel === label).length,
        modality: state.entries.find((entry) => entry.endpointLabel === label)?.modality || "",
      }));

  if (!endpoints.length) {
    elements.statusValue.textContent = "No data";
    return;
  }

  const sorted = [...endpoints].sort((left, right) => right.count - left.count);

  elements.statusValue.innerHTML = `
    <ol class="hero-panel-ranking">
      ${sorted
        .map(
          (endpoint, index) => `
            <li class="hero-panel-ranking-item">
              <span class="hero-panel-rank">${index + 1}</span>
              <span class="hero-panel-model">
                <span class="hero-panel-model-name">${escapeHtml(endpoint.label)}</span>
                <span class="hero-panel-model-meta">${escapeHtml(
                  `${endpoint.modality} · ${endpoint.count} entries`,
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
  const highestElo = rankByMetric(state.entries, "elo", "desc");
  const mostEvaluated = rankByMetric(state.entries, "appearances", "desc");
  const latestRelease = getLatestRelease(state.entries);
  const topCreator = getMostRepresentedCreator(state.entries);

  const cards = [
    {
      label: "Highest ELO",
      title: highestElo?.name || "N/A",
      subtitle: highestElo ? `${highestElo.creator} · ${highestElo.endpointLabel}` : "No data",
      metric: highestElo ? formatMetric(highestElo.elo) : "—",
    },
    {
      label: "Most Appearances",
      title: mostEvaluated?.name || "N/A",
      subtitle: mostEvaluated ? `${mostEvaluated.creator} · ${mostEvaluated.endpointLabel}` : "No data",
      metric: mostEvaluated ? formatMetric(mostEvaluated.appearances) : "—",
    },
    {
      label: "Latest Release",
      title: latestRelease?.name || "N/A",
      subtitle: latestRelease ? `${latestRelease.creator} · ${latestRelease.endpointLabel}` : "No data",
      metric: latestRelease ? formatDate(latestRelease.releaseDate) : "—",
    },
    {
      label: "Most Represented Creator",
      title: topCreator?.[0] || "N/A",
      subtitle: topCreator ? "Entries across all remaining endpoints" : "No data",
      metric: topCreator ? formatMetric(topCreator[1]) : "—",
    },
  ];

  elements.summaryGrid.innerHTML = "";

  for (const card of cards) {
    const node = elements.summaryCardTemplate.content.cloneNode(true);
    node.querySelector(".summary-label").textContent = card.label;
    node.querySelector(".summary-title").textContent = card.title;
    node.querySelector(".summary-subtitle").textContent = card.subtitle;
    node.querySelector(".summary-metric").textContent = card.metric;
    elements.summaryGrid.appendChild(node);
  }
}

function populateEndpointFilter() {
  const currentValue = elements.endpointFilter.value || "all";
  const endpoints = state.endpoints.length
    ? state.endpoints.map((endpoint) => endpoint.label)
    : [...new Set(state.entries.map((entry) => entry.endpointLabel))];
  const sorted = [...endpoints].sort((left, right) => left.localeCompare(right));

  elements.endpointFilter.innerHTML = '<option value="all">All</option>';
  elements.endpointFilter.insertAdjacentHTML(
    "beforeend",
    sorted
      .map((endpoint) => `<option value="${escapeHtml(endpoint)}">${escapeHtml(endpoint)}</option>`)
      .join(""),
  );
  elements.endpointFilter.value = sorted.includes(currentValue) ? currentValue : "all";
}

function populateCreatorFilter() {
  const creators = [...new Set(state.entries.map((entry) => entry.creator))].sort();
  const currentValue = elements.creatorFilter.value || "all";

  elements.creatorFilter.innerHTML = '<option value="all">All</option>';
  elements.creatorFilter.insertAdjacentHTML(
    "beforeend",
    creators
      .map((creator) => `<option value="${escapeHtml(creator)}">${escapeHtml(creator)}</option>`)
      .join(""),
  );
  elements.creatorFilter.value = creators.includes(currentValue) ? currentValue : "all";
}

function metricCell(value, formatter) {
  const formatted = formatter(value);
  if (formatted === "—") {
    return `<span class="metric-empty">${formatted}</span>`;
  }

  return escapeHtml(formatted);
}

function categoryPreview(entry) {
  if (!entry.categoryCount) {
    return `<span class="metric-empty">—</span>`;
  }

  const firstCategory = entry.categories[0] || {};
  const preview = [
    firstCategory.style_category,
    firstCategory.subject_matter_category,
    firstCategory.format_category,
  ]
    .filter(Boolean)
    .join(" · ");

  return `
    <span>${escapeHtml(preview || "Category breakdown available")}</span>
    <small>${escapeHtml(`${entry.categoryCount} category rows`)}</small>
  `;
}

function getColumns() {
  const columns = [
    {
      key: "rank",
      label: "Rank",
      render: (entry) => metricCell(entry.rank, (value) => formatMetric(value)),
    },
    {
      key: "name",
      label: "Model",
      render: (entry) => {
        const detailsUrl = getDetailsUrl(entry);

        if (!detailsUrl) {
          return `<span class="model-name">${escapeHtml(entry.name)}</span>`;
        }

        return `
          <a class="model-name" href="${escapeHtml(detailsUrl)}" target="_blank" rel="noopener noreferrer">
            ${escapeHtml(entry.name)}
          </a>
        `;
      },
    },
    {
      key: "endpointLabel",
      label: "Endpoint",
      render: (entry) => escapeHtml(entry.endpointLabel),
    },
    {
      key: "creator",
      label: "Creator",
      render: (entry) => `<span class="creator-pill">${escapeHtml(entry.creator)}</span>`,
    },
    {
      key: "elo",
      label: "AA ELO",
      render: (entry) => metricCell(entry.elo, (value) => formatMetric(value)),
    },
    {
      key: "appearances",
      label: "Appearances",
      render: (entry) => metricCell(entry.appearances, (value) => formatMetric(value)),
    },
    {
      key: "releaseDate",
      label: "Release",
      render: (entry) => escapeHtml(formatDate(entry.releaseDate)),
    },
  ];

  if (!state.expandedColumns) {
    return columns;
  }

  return [
    ...columns,
    {
      key: "modality",
      label: "Modality",
      render: (entry) => escapeHtml(entry.modality),
    },
    {
      key: "ci95",
      label: "CI95",
      render: (entry) => escapeHtml(entry.ci95 || "—"),
    },
    {
      key: "categoryCount",
      label: "Category Rows",
      render: (entry) => metricCell(entry.categoryCount, (value) => formatMetric(value)),
    },
    {
      key: "categories",
      label: "Category Preview",
      render: (entry) => categoryPreview(entry),
    },
  ];
}

function renderColumnMode() {
  elements.expandColumnsButton.textContent = state.expandedColumns
    ? "Collapse columns"
    : "Expand columns";

  elements.pageShell.classList.toggle("columns-expanded", state.expandedColumns);

  const pills = state.expandedColumns
    ? ["Includes CI95", "Includes category rows", "Includes category preview"]
    : ["Base media leaderboard view"];

  elements.columnModePills.innerHTML = pills
    .map((pill) => `<span class="table-pill">${escapeHtml(pill)}</span>`)
    .join("");
}

function applyFilters() {
  const search = elements.searchInput.value.trim().toLowerCase();
  const endpoint = elements.endpointFilter.value;
  const creator = elements.creatorFilter.value;
  const categoriesOnly = elements.categoriesOnlyToggle.checked;
  const [field, direction] = elements.sortSelect.value.split("-");

  const sortMap = {
    elo: "elo",
    appearances: "appearances",
    release: "releaseTimestamp",
    rank: "rank",
    name: "name",
  };

  const filtered = state.entries
    .map((entry) => ({
      ...entry,
      releaseTimestamp: parseReleaseTimestamp(entry.releaseDate),
    }))
    .filter((entry) => {
      if (endpoint !== "all" && entry.endpointLabel !== endpoint) {
        return false;
      }

      if (creator !== "all" && entry.creator !== creator) {
        return false;
      }

      if (categoriesOnly && entry.categoryCount === 0) {
        return false;
      }

      if (!search) {
        return true;
      }

      const haystack = [
        entry.name,
        entry.creator,
        entry.slug || "",
        entry.endpointLabel,
        entry.modality,
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(search);
    })
    .sort((left, right) => compareValues(left[sortMap[field]], right[sortMap[field]], direction));

  state.filtered = filtered;
  const totalPages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
  state.page = Math.min(state.page, totalPages);
  renderTable();
}

function renderTable() {
  const columns = getColumns();
  const total = state.filtered.length;
  const totalPages = Math.max(1, Math.ceil(total / state.pageSize));
  const startIndex = total === 0 ? 0 : (state.page - 1) * state.pageSize;
  const endIndex = Math.min(startIndex + state.pageSize, total);
  const visibleEntries = state.filtered.slice(startIndex, endIndex);
  const visibleCategoryRows = state.filtered.reduce(
    (sum, entry) => sum + (entry.categoryCount || 0),
    0,
  );

  elements.tableHead.innerHTML = `
    <tr>
      ${columns
        .map((column) => `<th scope="col">${escapeHtml(column.label)}</th>`)
        .join("")}
    </tr>
  `;

  elements.tableCaption.textContent = `${total} entries shown`;
  elements.tableMetaRight.textContent = `${visibleCategoryRows} category rows in current result set`;
  elements.paginationStatus.textContent =
    total === 0
      ? "No matching entries"
      : `Showing ${startIndex + 1}-${endIndex} of ${total} · Page ${state.page} of ${totalPages}`;
  elements.prevPageButton.disabled = state.page <= 1;
  elements.nextPageButton.disabled = state.page >= totalPages;

  renderColumnMode();

  if (visibleEntries.length === 0) {
    elements.tableBody.innerHTML = `
      <tr>
        <td colspan="${columns.length}">No entries match the current filters.</td>
      </tr>
    `;
    return;
  }

  elements.tableBody.innerHTML = visibleEntries
    .map(
      (entry) => `
        <tr>
          ${columns.map((column) => `<td>${column.render(entry)}</td>`).join("")}
        </tr>
      `,
    )
    .join("");
}

function applyPayload(payload) {
  state.entries = payload.entries || [];
  state.apiStatus = payload.apiStatus ?? null;
  state.refreshedAt = payload.refreshedAt || null;
  state.endpoints = payload.endpoints || [];
  state.cache = payload.cache || null;

  writeCachedPayload(payload);

  renderHeroMeta();
  renderHeroSpotlight();
  renderSummary();
  populateEndpointFilter();
  populateCreatorFilter();
  applyFilters();
}

function bindEvents() {
  elements.searchInput.addEventListener("input", () => {
    state.page = 1;
    applyFilters();
  });
  elements.endpointFilter.addEventListener("change", () => {
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
  elements.categoriesOnlyToggle.addEventListener("change", () => {
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
  elements.tableCaption.textContent = "Failed to load entries";
  elements.tableHead.innerHTML = "";
  elements.tableBody.innerHTML =
    '<tr><td colspan="1">Could not load data for the media endpoints.</td></tr>';
  console.error("Missing bootstrapped media payload");
}

init();

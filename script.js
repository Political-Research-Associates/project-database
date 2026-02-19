/**
 * Project Database — script.js
 *
 * Security notes:
 *  - All CSV data rendered via textContent only (never innerHTML for data)
 *  - URL params sanitized before use, never injected into DOM as HTML
 *  - CSS.escape() used for attribute selectors built from tag data
 *  - No eval, no dynamic script injection
 */

"use strict";

/* ─── Constants ─────────────────────────────── */
const PAGE_SIZE     = 9;
const MAX_PARAM_LEN = 300;
const SIM_TICKS     = 180;

const FIELD_LABELS = {
  "Who": "Name",
  "Individual/Org": "Type",
  "Main affiliation as it relates to Project Esther (e.g. Heritage/NTFCA, White House, evangelical/Christian Zionist movement, etc)": "Main Affiliation",
  "Role in/ties to Project Esther/NTFCA": "Role / Ties",
  "Key bio points (other and prior organizational and government affiliations)": "Key Bio Points",
  "Key quotes": "Key Quotes",
  "Ties to Trumpworld": "Ties to Trumpworld",
  "Ties to other people in this database": "Ties to Others in Database",
  "Any other important info": "Other Info",
  "Tags": "Tags"
};

const PALETTE = [
  "#EE3CA6","#CDA5FF","#6EEDC5","#FFBD80","#98A4FA"
];
/* All palette colors confirmed accessible with black text by user. */
const PALETTE_TEXT = "#000000";

/* ─── State ─────────────────────────────────── */
let rawData      = [];
let filteredData = [];
let tagColorMap  = {};
let activeTags   = new Set();
let currentPage  = 1;
let currentSort  = "name-asc";
let viewMode     = "grid";

/* Network state */
let netNodes     = [];
let netEdges     = [];
let netTransform = { x: 0, y: 0, scale: 1 };
let netDragState = null;   // panning the canvas
let netNodeDrag  = null;   // dragging a specific node
let netFocusNode = null;   // node pinned as focus center
let netRAF       = null;
let netHovered   = null;
let netSimTick   = 0;
let netHandlers  = {};

/* ─── DOM refs ──────────────────────────────── */
const searchInput      = document.getElementById("searchInput");
const typeFilter       = document.getElementById("typeFilter");
const sortSelect       = document.getElementById("sortSelect");
const tagFiltersEl     = document.getElementById("tagFilters");
const paginationEl     = document.getElementById("pagination");
const cardsContainer   = document.getElementById("cardsContainer");
const resultsCount     = document.getElementById("resultsCount");
const clearFiltersBtn  = document.getElementById("clearFilters");
const btnGrid          = document.getElementById("btnGrid");
const btnNetwork       = document.getElementById("btnNetwork");
const networkContainer = document.getElementById("networkContainer");
const networkCanvas    = document.getElementById("networkCanvas");
const networkTooltip   = document.getElementById("networkTooltip");
const networkHintEl    = document.querySelector(".network-hint");
const modalOverlay     = document.getElementById("modalOverlay");
const modalContent     = document.getElementById("modalContent");
const modalClose       = document.getElementById("modalClose");

/* ─── Helpers ───────────────────────────────── */

function sanitize(str) {
  if (str === null || str === undefined) return "";
  return String(str).trim();
}

function normalize(str) {
  return sanitize(str).toLowerCase();
}

/* Returns the display label for a type value */
function displayType(val) {
  return sanitize(val);
}

function el(tag, className) {
  const e = document.createElement(tag);
  if (className) e.className = className;
  return e;
}

function txt(node, text) {
  node.textContent = sanitize(text);
  return node;
}

function showError(heading, body) {
  cardsContainer.innerHTML = "";
  const wrap = el("div", "empty-state");
  const h = el("h3"); h.textContent = heading;
  const p = el("p");  p.textContent = body;
  wrap.appendChild(h);
  wrap.appendChild(p);
  cardsContainer.appendChild(wrap);
}

/* ─── Data load ─────────────────────────────── */

if (typeof Papa === "undefined") {
  showError(
    "PapaParse failed to load",
    "Check your internet connection and that the CDN script loaded in the browser console."
  );
} else {
  Papa.parse("data.csv", {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(results) {
      try {
        rawData = results.data;
        generateTagColors();
        buildTagFilters();
        applyFilters();
        handleInitialDeepLink();
      } catch(e) {
        console.error("Error in complete callback:", e);
        showError("Error rendering data", e.message + " — check the browser console for details.");
      }
    },
    error: function(err) {
      console.error("PapaParse error:", err);
      showError(
        "Could not load data.csv",
        "Make sure data.csv is in the same folder as index.html and you are using a local server (not opening the file directly)."
      );
    }
  });
}

/* ─── Tag colors ────────────────────────────── */

function generateTagColors() {
  const tags = new Set();
  rawData.forEach(function(row) {
    var tagVal = row["Tags"];
    if (tagVal) {
      tagVal.split(",").forEach(function(t) {
        var trimmed = sanitize(t);
        if (trimmed) tags.add(trimmed);
      });
    }
  });
  var i = 0;
  tags.forEach(function(tag) {
    tagColorMap[tag] = PALETTE[i % PALETTE.length];
    i++;
  });
}

/* Count how many items in a given dataset carry a specific tag */
function countTag(dataset, tag) {
  var count = 0;
  dataset.forEach(function(row) {
    if (row["Tags"]) {
      var tags = row["Tags"].split(",").map(function(t){ return sanitize(t); });
      if (tags.indexOf(tag) !== -1) count++;
    }
  });
  return count;
}

/* Update all badge counts to reflect the current filteredData */
function updateTagCounts() {
  var pills = tagFiltersEl.querySelectorAll(".tag-filter");
  pills.forEach(function(pill) {
    var tag   = pill.getAttribute("data-tag");
    var badge = pill.querySelector(".tag-count");
    if (tag && badge) {
      badge.textContent = countTag(filteredData, tag);
    }
  });
}

/* ─── Tag filter bar ────────────────────────── */

function buildTagFilters() {
  tagFiltersEl.innerHTML = "";
  var tagList = Object.keys(tagColorMap);
  tagList.forEach(function(tag, idx) {
    var pill = el("span", "tag-filter");
    pill.style.backgroundColor = tagColorMap[tag];
    pill.style.color = PALETTE_TEXT;
    pill.style.animationDelay  = (idx * 35) + "ms";
    pill.setAttribute("tabindex", "0");
    pill.setAttribute("role", "checkbox");
    pill.setAttribute("aria-checked", "false");
    pill.setAttribute("data-tag", tag);

    var label = el("span");
    label.textContent = tag;
    pill.appendChild(label);

    var badge = el("span", "tag-count");
    badge.textContent = countTag(rawData, tag);
    pill.appendChild(badge);

    pill.addEventListener("click", function(){ toggleTag(tag, pill); });
    pill.addEventListener("keydown", function(e){
      if (e.key === "Enter" || e.key === " ") { e.preventDefault(); toggleTag(tag, pill); }
    });

    tagFiltersEl.appendChild(pill);
  });
}

function toggleTag(tag, pillEl) {
  if (activeTags.has(tag)) {
    activeTags.delete(tag);
    pillEl.classList.remove("active");
    pillEl.setAttribute("aria-checked", "false");
  } else {
    activeTags.add(tag);
    pillEl.classList.add("active");
    pillEl.setAttribute("aria-checked", "true");
  }
  applyFilters();
}

function getPillByTag(tag) {
  return tagFiltersEl.querySelector('.tag-filter[data-tag="' + CSS.escape(tag) + '"]');
}

/* ─── Controls ──────────────────────────────── */

/* Live search — triggers on every keystroke */
searchInput.addEventListener("input", applyFilters);
typeFilter.addEventListener("change", applyFilters);
sortSelect.addEventListener("change", function(){ currentSort = sortSelect.value; applyFilters(); });

clearFiltersBtn.addEventListener("click", function() {
  searchInput.value = "";
  typeFilter.value  = "";
  activeTags.clear();
  var pills = tagFiltersEl.querySelectorAll(".tag-filter");
  pills.forEach(function(p){
    p.classList.remove("active");
    p.setAttribute("aria-checked", "false");
  });
  applyFilters();
});

btnGrid.addEventListener("click",    function(){ setViewMode("grid"); });
btnNetwork.addEventListener("click", function(){ setViewMode("network"); });

function setViewMode(mode) {
  viewMode = mode;
  var isGrid = mode === "grid";
  btnGrid.classList.toggle("active", isGrid);
  btnGrid.setAttribute("aria-pressed", String(isGrid));
  btnNetwork.classList.toggle("active", !isGrid);
  btnNetwork.setAttribute("aria-pressed", String(!isGrid));
  cardsContainer.classList.toggle("hidden", !isGrid);
  paginationEl.classList.toggle("hidden", !isGrid);
  networkContainer.classList.toggle("hidden", isGrid);
  if (!isGrid) renderNetwork();
}

/* ─── Filtering & sorting ───────────────────── */

function applyFilters() {
  var term = normalize(searchInput.value || "");
  var type = typeFilter.value || "";

  filteredData = rawData.filter(function(row) {
    var matchesSearch =
      !term ||
      normalize(row["Who"] || "").indexOf(term) !== -1 ||
      normalize(row["Main affiliation as it relates to Project Esther (e.g. Heritage/NTFCA, White House, evangelical/Christian Zionist movement, etc)"] || "").indexOf(term) !== -1;

    var matchesType = !type || (row["Individual/Org"] || "") === type;

    var matchesTags = true;
    if (activeTags.size > 0) {
      var rowTags = row["Tags"] ? row["Tags"].split(",").map(function(t){ return sanitize(t); }) : [];
      matchesTags = true;
      activeTags.forEach(function(tag){
        if (rowTags.indexOf(tag) === -1) matchesTags = false;
      });
    }

    return matchesSearch && matchesType && matchesTags;
  });

  filteredData = sortData(filteredData, currentSort);
  sortSelect.value = currentSort;

  var hasFilters = term || type || activeTags.size > 0;
  clearFiltersBtn.classList.toggle("hidden", !hasFilters);

  currentPage = 1;

  /* Update count here so it reflects reality in both grid and network mode */
  resultsCount.textContent = filteredData.length + " result" + (filteredData.length !== 1 ? "s" : "");

  if (viewMode === "network") {
    renderNetwork();
  } else {
    renderPage();
  }

  updateTagCounts();
}

function sortData(data, key) {
  var s = data.slice();
  if (key === "name-asc")  return s.sort(function(a,b){ return normalize(a["Who"]).localeCompare(normalize(b["Who"])); });
  if (key === "name-desc") return s.sort(function(a,b){ return normalize(b["Who"]).localeCompare(normalize(a["Who"])); });
  if (key === "type-asc")  return s.sort(function(a,b){ return normalize(a["Individual/Org"]).localeCompare(normalize(b["Individual/Org"])); });
  return s;
}

/* ─── Pagination ────────────────────────────── */

function renderPage() {
  var start    = (currentPage - 1) * PAGE_SIZE;
  var pageData = filteredData.slice(start, start + PAGE_SIZE);
  renderCards(pageData);
  renderPagination();
}

function renderPagination() {
  paginationEl.innerHTML = "";
  var total = Math.ceil(filteredData.length / PAGE_SIZE);
  if (total <= 1) return;
  for (var i = 1; i <= total; i++) {
    (function(page){
      var btn = el("button");
      btn.textContent = page;
      btn.setAttribute("aria-label", "Page " + page);
      if (page === currentPage) {
        btn.disabled = true;
        btn.setAttribute("aria-current", "page");
      }
      btn.addEventListener("click", function(){
        currentPage = page;
        renderPage();
        window.scrollTo({ top: 0, behavior: "smooth" });
      });
      paginationEl.appendChild(btn);
    })(i);
  }
}

/* ─── Cards ─────────────────────────────────── */

function renderCards(data) {
  cardsContainer.innerHTML = "";
  resultsCount.textContent = filteredData.length + " result" + (filteredData.length !== 1 ? "s" : "");

  if (data.length === 0) {
    var wrap = el("div", "empty-state");
    var h = el("h3"); h.textContent = "No results found";
    var p = el("p");  p.textContent = "Try adjusting your search or filters.";
    wrap.appendChild(h); wrap.appendChild(p);
    cardsContainer.appendChild(wrap);
    return;
  }

  data.forEach(function(row, i) {
    cardsContainer.appendChild(buildCard(row, i));
  });
}

function buildCard(row, animIdx) {
  var card = el("div", "card");
  card.setAttribute("role", "listitem");
  card.setAttribute("tabindex", "0");
  card.style.animationDelay = (animIdx * 40) + "ms";

  var title = el("h2");
  title.textContent = sanitize(row["Who"]);
  card.appendChild(title);

  if (row["Individual/Org"]) {
    var typeEl = el("div", "card-type");
    typeEl.textContent = displayType(row["Individual/Org"]);
    card.appendChild(typeEl);
  }

  card.appendChild(el("div", "divider"));

  var aff = row["Main affiliation as it relates to Project Esther (e.g. Heritage/NTFCA, White House, evangelical/Christian Zionist movement, etc)"];
  if (aff) card.appendChild(buildSection("Main Affiliation", aff));

  var role = row["Role in/ties to Project Esther/NTFCA"];
  if (role) card.appendChild(buildSection("Role / Ties", role));

  if (row["Tags"]) {
    var tagWrap = el("div", "tags");
    row["Tags"].split(",").forEach(function(tag) {
      var trimmed = sanitize(tag);
      if (!trimmed) return;
      var pill = el("span", "tag-pill");
      pill.textContent = trimmed;
      pill.style.backgroundColor = tagColorMap[trimmed] || "#999";
      pill.style.color = PALETTE_TEXT;
      pill.addEventListener("click", function(e) {
        e.stopPropagation();
        var fp = getPillByTag(trimmed);
        if (fp) toggleTag(trimmed, fp);
      });
      tagWrap.appendChild(pill);
    });
    card.appendChild(tagWrap);
  }

  card.addEventListener("click",   function(){ openModal(row); });
  card.addEventListener("keydown", function(e){ if (e.key === "Enter") openModal(row); });
  return card;
}

function buildSection(label, value) {
  var sec = el("div", "section");
  var lbl = el("strong"); lbl.textContent = label;
  var val = el("span");   val.textContent = sanitize(value);
  sec.appendChild(lbl);
  sec.appendChild(val);
  return sec;
}

/* ─── Modal ─────────────────────────────────── */

function openModal(row) {
  modalContent.innerHTML = "";

  var title = el("h2");
  title.id = "modalTitle";
  title.textContent = sanitize(row["Who"]);
  modalContent.appendChild(title);

  if (row["Individual/Org"]) {
    var typeEl = el("div", "card-type");
    typeEl.textContent = displayType(row["Individual/Org"]);
    modalContent.appendChild(typeEl);
  }

  modalContent.appendChild(el("div", "divider"));

  Object.keys(FIELD_LABELS).forEach(function(key) {
    if (key === "Who" || key === "Individual/Org" || key === "Tags") return;
    var val = sanitize(row[key]);
    if (!val) return;
    modalContent.appendChild(buildSection(FIELD_LABELS[key], val));
  });

  if (row["Tags"]) {
    var tagWrap = el("div", "tags");
    row["Tags"].split(",").forEach(function(tag) {
      var trimmed = sanitize(tag);
      if (!trimmed) return;
      var pill = el("span", "tag-pill");
      pill.textContent = trimmed;
      pill.style.backgroundColor = tagColorMap[trimmed] || "#999";
      pill.style.color = PALETTE_TEXT;
      pill.setAttribute("tabindex", "0");
      pill.setAttribute("title", "Filter by: " + trimmed);
      pill.style.cursor = "pointer";
      (function(tagName) {
        pill.addEventListener("click", function() {
          closeModal();
          /* Stay in whichever view is currently active */
          setViewMode(viewMode);
          var fp = getPillByTag(tagName);
          if (fp && !activeTags.has(tagName)) {
            toggleTag(tagName, fp);
          } else if (!fp) {
            /* Tag pill exists in filter bar — just run filters */
            activeTags.add(tagName);
            applyFilters();
          }
        });
        pill.addEventListener("keydown", function(e) {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            pill.click();
          }
        });
      })(trimmed);
      tagWrap.appendChild(pill);
    });
    modalContent.appendChild(tagWrap);
  }

  /* Deep-link share button */
  var shareBtn = el("button", "modal-share");
  shareBtn.textContent = "🔗 Copy link to this entry";
  shareBtn.addEventListener("click", function() {
    var url = buildDeepLinkURL(row["Who"]);
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url).then(function() {
        shareBtn.classList.add("copied");
        shareBtn.textContent = "✓ Copied!";
        setTimeout(function() {
          shareBtn.classList.remove("copied");
          shareBtn.textContent = "🔗 Copy link to this entry";
        }, 2000);
      }).catch(function(){ window.prompt("Copy this link:", url); });
    } else {
      window.prompt("Copy this link:", url);
    }
  });
  modalContent.appendChild(shareBtn);

  pushDeepLink(row["Who"]);
  modalOverlay.classList.remove("hidden");
  modalOverlay.setAttribute("aria-hidden", "false");
  modalClose.focus();
}

function closeModal() {
  modalOverlay.classList.add("hidden");
  modalOverlay.setAttribute("aria-hidden", "true");
  /* Remove ?entry= from URL */
  var params = new URLSearchParams(window.location.search);
  params.delete("entry");
  var qs = params.toString();
  history.replaceState(null, "", window.location.pathname + (qs ? "?" + qs : ""));
}

modalClose.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", function(e){ if (e.target === modalOverlay) closeModal(); });
document.addEventListener("keydown", function(e){
  if (e.key === "Escape" && !modalOverlay.classList.contains("hidden")) closeModal();
});

/* ─── Deep linking ──────────────────────────── */

function buildDeepLinkURL(name) {
  var params = new URLSearchParams(window.location.search);
  params.set("entry", sanitize(name).substring(0, MAX_PARAM_LEN));
  return window.location.origin + window.location.pathname + "?" + params.toString();
}

function pushDeepLink(name) {
  var params = new URLSearchParams(window.location.search);
  params.set("entry", sanitize(name).substring(0, MAX_PARAM_LEN));
  history.replaceState(null, "", window.location.pathname + "?" + params.toString());
}

function handleInitialDeepLink() {
  var params    = new URLSearchParams(window.location.search);
  var raw       = params.get("entry");
  if (!raw) return;
  var entryName = sanitize(raw).substring(0, MAX_PARAM_LEN);
  var match     = null;
  rawData.forEach(function(row) {
    if (normalize(row["Who"]) === normalize(entryName)) match = row;
  });
  if (match) openModal(match);
}

/* ─── Network graph ─────────────────────────── */

/* Type-based colors — clear, distinct, accessible */
var NET_COLOR_ORG  = "#AE71F9"; // purple → Organization
var NET_COLOR_IND  = "#4E61F3"; // Main Blue → Individual (better contrast on light canvas)
var NET_COLOR_UNK  = "#7f8c8d"; // grey fallback

var NET_MIN_R = 8;   // smallest node radius (px)
var NET_MAX_R = 22;  // largest node radius (px)
var NET_LABEL_MAX = 22; // max chars before label is truncated

function getNodeColor(row) {
  var type = sanitize(row["Individual/Org"]);
  if (type === "Organization") return NET_COLOR_ORG;
  if (type === "Individual")   return NET_COLOR_IND;
  return NET_COLOR_UNK;
}

function truncateLabel(str, max) {
  if (str.length <= max) return str;
  return str.substring(0, max - 1) + "\u2026";
}

function renderNetwork() {
  if (netRAF !== null) { cancelAnimationFrame(netRAF); netRAF = null; }
  removeNetworkListeners();

  var dpr  = Math.min(window.devicePixelRatio || 1, 2);
  var rect = networkContainer.getBoundingClientRect();
  var W    = rect.width  || 800;
  var H    = rect.height || 600;

  networkCanvas.width        = W * dpr;
  networkCanvas.height       = H * dpr;
  networkCanvas.style.width  = W + "px";
  networkCanvas.style.height = H + "px";

  buildNetworkData();
  layoutNetwork(W, H);
  netSimTick   = 0;
  netFocusNode = null; // reset focus when graph is rebuilt
  if (networkHintEl) networkHintEl.textContent = "Click a node to open details · Drag a node to focus it · Drag canvas to pan · Scroll to zoom";
  startNetworkLoop(dpr, W, H);
  addNetworkListeners();
}

function buildNetworkData() {
  /* Build nodes first without radii */
  netNodes = filteredData.map(function(row) {
    return {
      id:    sanitize(row["Who"]),
      label: sanitize(row["Who"]),
      row:   row,
      x: 0, y: 0, vx: 0, vy: 0,
      color: getNodeColor(row),
      r: NET_MIN_R,
      degree: 0   /* filled below */
    };
  });

  /* Build edge index */
  netEdges = [];
  var idx = {};
  netNodes.forEach(function(n, i) { idx[normalize(n.id)] = i; });

  filteredData.forEach(function(row, i) {
    var ties = sanitize(row["Ties to other people in this database"]);
    if (!ties) return;
    ties.split(",").forEach(function(name) {
      var key = normalize(name);
      if (key && idx[key] !== undefined && idx[key] !== i) {
        netEdges.push({ source: i, target: idx[key] });
      }
    });
  });

  /* Count degree (connections in both directions, deduplicated) */
  netEdges.forEach(function(e) {
    netNodes[e.source].degree++;
    netNodes[e.target].degree++;
  });

  /* Scale radii: min→max based on degree */
  var maxDeg = 1;
  netNodes.forEach(function(n) { if (n.degree > maxDeg) maxDeg = n.degree; });

  netNodes.forEach(function(n) {
    var t = maxDeg > 0 ? n.degree / maxDeg : 0;  /* 0..1 */
    /* sqrt scaling so mid-range nodes aren't too small */
    n.r = NET_MIN_R + Math.sqrt(t) * (NET_MAX_R - NET_MIN_R);
  });
}

function layoutNetwork(W, H) {
  netNodes.forEach(function(n) {
    n.x  = W / 2 + (Math.random() - 0.5) * W * 0.5;
    n.y  = H / 2 + (Math.random() - 0.5) * H * 0.5;
    n.vx = 0; n.vy = 0;
  });
  netTransform = { x: 0, y: 0, scale: 1 };
}

/* Set of node indices connected to the focus node (both directions) */
function focusNeighborSet() {
  var set = {};
  if (!netFocusNode) return set;
  var fi = netNodes.indexOf(netFocusNode);
  netEdges.forEach(function(e) {
    if (e.source === fi) set[e.target] = true;
    if (e.target === fi) set[e.source] = true;
  });
  return set;
}

function tickForce(W, H) {
  /* Physics constants */
  var repulsion    = 60;
  var springNormal = 0.02;
  var springFocus  = 0.08;   /* stronger pull for focus-connected edges */
  var gravityNorm  = 0.003;
  var gravityFocus = 0.025;  /* focus node snaps harder to center */
  var damping      = 0.82;

  var n  = netNodes.length;
  var fi = netFocusNode ? netNodes.indexOf(netFocusNode) : -1;
  var i, j, dx, dy, dist, f, e, s, t;

  /* Node-node repulsion */
  for (i = 0; i < n; i++) {
    for (j = i + 1; j < n; j++) {
      dx   = netNodes[i].x - netNodes[j].x;
      dy   = netNodes[i].y - netNodes[j].y;
      dist = Math.sqrt(dx * dx + dy * dy) || 1;
      /* Scale repulsion by average radius so big nodes push further */
      var avgR = (netNodes[i].r + netNodes[j].r) * 0.5;
      f = ((repulsion + avgR) * (repulsion + avgR)) / dist * 0.01;
      netNodes[i].vx += (dx / dist) * f;
      netNodes[i].vy += (dy / dist) * f;
      netNodes[j].vx -= (dx / dist) * f;
      netNodes[j].vy -= (dy / dist) * f;
    }
  }

  /* Edge spring forces */
  for (i = 0; i < netEdges.length; i++) {
    e = netEdges[i]; s = netNodes[e.source]; t = netNodes[e.target];
    dx = t.x - s.x; dy = t.y - s.y;
    /* Stronger spring if either endpoint is the focus node */
    var k = (fi >= 0 && (e.source === fi || e.target === fi)) ? springFocus : springNormal;
    s.vx += dx * k; s.vy += dy * k;
    t.vx -= dx * k; t.vy -= dy * k;
  }

  /* Gravity toward canvas center */
  for (i = 0; i < n; i++) {
    /* If this is the focus node, being dragged, skip physics entirely */
    if (netNodeDrag && netNodeDrag.node === netNodes[i]) continue;

    var g = (fi >= 0 && i === fi) ? gravityFocus : gravityNorm;
    netNodes[i].vx += (W / 2 - netNodes[i].x) * g;
    netNodes[i].vy += (H / 2 - netNodes[i].y) * g;
    netNodes[i].vx *= damping;
    netNodes[i].vy *= damping;
    netNodes[i].x  += netNodes[i].vx;
    netNodes[i].y  += netNodes[i].vy;
  }
}

function drawNetwork(ctx, dpr, W, H) {
  var fi        = netFocusNode ? netNodes.indexOf(netFocusNode) : -1;
  var neighbors = focusNeighborSet();
  var hasFocus  = fi >= 0;

  ctx.save();
  ctx.clearRect(0, 0, W * dpr, H * dpr);
  ctx.scale(dpr, dpr);
  ctx.translate(netTransform.x, netTransform.y);
  ctx.scale(netTransform.scale, netTransform.scale);

  /* ── Edges ── */
  netEdges.forEach(function(e) {
    var s          = netNodes[e.source];
    var t          = netNodes[e.target];
    var isFocusEdge = hasFocus && (e.source === fi || e.target === fi);

    ctx.beginPath();
    ctx.moveTo(s.x, s.y);
    ctx.lineTo(t.x, t.y);

    if (isFocusEdge) {
      ctx.strokeStyle = "rgba(36,53,185,.50)";  /* Main Blue focus edge */
      ctx.lineWidth   = 2;
    } else {
      ctx.strokeStyle = hasFocus ? "rgba(78,97,243,.08)" : "rgba(78,97,243,.20)";
      ctx.lineWidth   = 1;
    }
    ctx.stroke();
  });

  /* ── Nodes + labels ── */
  netNodes.forEach(function(n, i) {
    var isHovered = n === netHovered;
    var isFocus   = i === fi;
    var isNeighbor = neighbors[i];
    var isDimmed  = hasFocus && !isFocus && !isNeighbor;

    var alpha = isDimmed ? 0.3 : 1.0;
    var r     = isHovered ? n.r + 3 : n.r;

    /* Node circle */
    ctx.globalAlpha = alpha;
    ctx.beginPath();
    ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
    ctx.fillStyle = n.color;
    ctx.fill();

    /* Ring for focus node */
    if (isFocus) {
      ctx.lineWidth   = 3;
      ctx.strokeStyle = "#1d1340";
      ctx.stroke();
    } else if (isHovered) {
      ctx.lineWidth   = 2;
      ctx.strokeStyle = "rgba(0,0,0,.5)";
      ctx.stroke();
    }

    /* ── Label ── */
    var fontSize   = Math.max(9, Math.min(13, n.r * 0.85));
    var labelAlpha = isDimmed ? 0.25 : 1.0;
    var label      = truncateLabel(n.label, NET_LABEL_MAX);

    ctx.globalAlpha = labelAlpha;
    ctx.font        = (isFocus ? "600 " : "") + fontSize + "px 'proxima-nova', 'Proxima Nova', 'Nunito', sans-serif";

    var textX = n.x + r + 5;
    var textY = n.y + fontSize * 0.35;  /* vertically centred on node */
    var textW = ctx.measureText(label).width;

    /* Pill background for readability */
    var padH = 2, padV = 1;
    ctx.fillStyle   = "rgba(249,245,255,0.92)";  /* near-white pill on tinted canvas */
    ctx.beginPath();
    var rx = textX - padH;
    var ry = textY - fontSize + padV;
    var rw = textW + padH * 2;
    var rh = fontSize + padV * 2;
    /* Simple rounded rect (ctx.roundRect not in all browsers) */
    var rad = 3;
    ctx.moveTo(rx + rad, ry);
    ctx.lineTo(rx + rw - rad, ry);
    ctx.quadraticCurveTo(rx + rw, ry, rx + rw, ry + rad);
    ctx.lineTo(rx + rw, ry + rh - rad);
    ctx.quadraticCurveTo(rx + rw, ry + rh, rx + rw - rad, ry + rh);
    ctx.lineTo(rx + rad, ry + rh);
    ctx.quadraticCurveTo(rx, ry + rh, rx, ry + rh - rad);
    ctx.lineTo(rx, ry + rad);
    ctx.quadraticCurveTo(rx, ry, rx + rad, ry);
    ctx.closePath();
    ctx.fill();

    /* Label text */
    ctx.fillStyle = isFocus ? "#2435B9" : "#3d2b6e";
    ctx.fillText(label, textX, textY);

    ctx.globalAlpha = 1.0;
  });

  ctx.restore();
}

function startNetworkLoop(dpr, W, H) {
  var ctx = networkCanvas.getContext("2d");
  function loop() {
    if (netSimTick < SIM_TICKS) { tickForce(W, H); netSimTick++; }
    drawNetwork(ctx, dpr, W, H);
    netRAF = requestAnimationFrame(loop);
  }
  netRAF = requestAnimationFrame(loop);
}

function canvasToWorld(e) {
  var cr = networkCanvas.getBoundingClientRect();
  return {
    x: (e.clientX - cr.left - netTransform.x) / netTransform.scale,
    y: (e.clientY - cr.top  - netTransform.y) / netTransform.scale
  };
}

function hitTest(pos) {
  /* Iterate in reverse so top-drawn (last) nodes win */
  for (var i = netNodes.length - 1; i >= 0; i--) {
    var n = netNodes[i];
    var dx = n.x - pos.x, dy = n.y - pos.y;
    if (Math.sqrt(dx * dx + dy * dy) <= n.r + 4) return n;
  }
  return null;
}

function addNetworkListeners() {
  var canvas = networkCanvas;

  netHandlers.mousemove = function(e) {
    /* Update hovered node */
    var pos = canvasToWorld(e);
    netHovered = hitTest(pos);

    /* Cursor */
    if (netNodeDrag) {
      canvas.style.cursor = "grabbing";
    } else if (netHovered) {
      canvas.style.cursor = "pointer";
    } else if (netDragState) {
      canvas.style.cursor = "grabbing";
    } else {
      canvas.style.cursor = "grab";
    }

    /* Move dragged node */
    if (netNodeDrag) {
      netNodeDrag.node.x  = pos.x;
      netNodeDrag.node.y  = pos.y;
      netNodeDrag.node.vx = 0;
      netNodeDrag.node.vy = 0;
      /* Keep sim warm while user drags */
      if (netSimTick >= SIM_TICKS) netSimTick = SIM_TICKS - 30;
      return; /* don't update tooltip or pan while dragging a node */
    }

    /* Pan canvas */
    if (netDragState) {
      netTransform.x = netDragState.origX + (e.clientX - netDragState.startX);
      netTransform.y = netDragState.origY + (e.clientY - netDragState.startY);
    }

    /* Tooltip (type only — name is already on label) */
    if (netHovered) {
      networkTooltip.classList.remove("hidden");
      networkTooltip.textContent = displayType(netHovered.row["Individual/Org"]);
      var cr = networkContainer.getBoundingClientRect();
      networkTooltip.style.left = (e.clientX - cr.left + 12) + "px";
      networkTooltip.style.top  = (e.clientY - cr.top  - 10) + "px";
    } else {
      networkTooltip.classList.add("hidden");
    }
  };

  netHandlers.mouseleave = function() {
    netHovered = null;
    networkTooltip.classList.add("hidden");
    netDragState = null;
    netNodeDrag  = null;
  };

  netHandlers.mousedown = function(e) {
    var pos = canvasToWorld(e);
    var hit = hitTest(pos);
    if (hit) {
      /* Drag a specific node */
      netNodeDrag = { node: hit, startX: e.clientX, startY: e.clientY };
    } else {
      /* Pan the canvas */
      netDragState = { startX: e.clientX, startY: e.clientY, origX: netTransform.x, origY: netTransform.y };
    }
  };

  netHandlers.mouseup = function(e) {
    if (netNodeDrag) {
      var moved = Math.abs(e.clientX - netNodeDrag.startX) + Math.abs(e.clientY - netNodeDrag.startY);

      if (moved < 6) {
        /* Tap/click on node with no movement → open modal */
        openModal(netNodeDrag.node.row);
      } else {
        /* Node was dragged → make it the focus node */
        netFocusNode = netNodeDrag.node;
        /* Full sim restart so connected nodes rush toward it */
        netSimTick = 0;
        if (networkHintEl) networkHintEl.textContent = "Click empty space to reset focus · Click a node to open details · Scroll to zoom";
      }
      netNodeDrag = null;
    } else if (netDragState) {
      /* Check if this was a click (not a drag) on empty space */
      var panMoved = Math.abs(e.clientX - netDragState.startX) + Math.abs(e.clientY - netDragState.startY);
      if (panMoved < 6) {
        /* Click on empty space → always clear focus. Filters/search are NOT touched. */
        netFocusNode = null;
        netSimTick   = 0; /* full restart so nodes visibly rearrange */
        if (networkHintEl) networkHintEl.textContent = "Click a node to open details · Drag a node to focus it · Drag canvas to pan · Scroll to zoom";
      }
      netDragState = null;
    }
  };

  netHandlers.wheel = function(e) {
    e.preventDefault();
    var factor = e.deltaY < 0 ? 1.1 : 0.9;
    var cr     = canvas.getBoundingClientRect();
    var cx     = e.clientX - cr.left;
    var cy     = e.clientY - cr.top;
    netTransform.x     = cx - factor * (cx - netTransform.x);
    netTransform.y     = cy - factor * (cy - netTransform.y);
    netTransform.scale *= factor;
  };

  var lastTouch = null;
  netHandlers.touchstart = function(e) {
    if (e.touches.length === 1) {
      lastTouch = e.touches[0];
      var pos = { x: (e.touches[0].clientX - networkCanvas.getBoundingClientRect().left - netTransform.x) / netTransform.scale,
                  y: (e.touches[0].clientY - networkCanvas.getBoundingClientRect().top  - netTransform.y) / netTransform.scale };
      var hit = hitTest(pos);
      if (hit) netNodeDrag = { node: hit, startX: e.touches[0].clientX, startY: e.touches[0].clientY };
    }
  };
  netHandlers.touchmove = function(e) {
    if (e.touches.length === 1 && lastTouch) {
      if (netNodeDrag) {
        var pos = { x: (e.touches[0].clientX - networkCanvas.getBoundingClientRect().left - netTransform.x) / netTransform.scale,
                    y: (e.touches[0].clientY - networkCanvas.getBoundingClientRect().top  - netTransform.y) / netTransform.scale };
        netNodeDrag.node.x  = pos.x;
        netNodeDrag.node.y  = pos.y;
        netNodeDrag.node.vx = 0;
        netNodeDrag.node.vy = 0;
        if (netSimTick >= SIM_TICKS) netSimTick = SIM_TICKS - 30;
      } else {
        netTransform.x += e.touches[0].clientX - lastTouch.clientX;
        netTransform.y += e.touches[0].clientY - lastTouch.clientY;
      }
      lastTouch = e.touches[0];
    }
  };
  netHandlers.touchend = function() {
    if (netNodeDrag) { netFocusNode = netNodeDrag.node; netNodeDrag = null; }
    lastTouch = null;
  };

  canvas.addEventListener("mousemove",  netHandlers.mousemove);
  canvas.addEventListener("mouseleave", netHandlers.mouseleave);
  canvas.addEventListener("mousedown",  netHandlers.mousedown);
  canvas.addEventListener("mouseup",    netHandlers.mouseup);
  canvas.addEventListener("wheel",      netHandlers.wheel, { passive: false });
  canvas.addEventListener("touchstart", netHandlers.touchstart, { passive: true });
  canvas.addEventListener("touchmove",  netHandlers.touchmove,  { passive: true });
  canvas.addEventListener("touchend",   netHandlers.touchend,   { passive: true });
}

function removeNetworkListeners() {
  if (!netHandlers.mousemove) return;
  var c = networkCanvas;
  c.removeEventListener("mousemove",  netHandlers.mousemove);
  c.removeEventListener("mouseleave", netHandlers.mouseleave);
  c.removeEventListener("mousedown",  netHandlers.mousedown);
  c.removeEventListener("mouseup",    netHandlers.mouseup);
  c.removeEventListener("wheel",      netHandlers.wheel);
  c.removeEventListener("touchstart", netHandlers.touchstart);
  c.removeEventListener("touchmove",  netHandlers.touchmove);
  c.removeEventListener("touchend",   netHandlers.touchend);
  netHandlers = {};
}

window.addEventListener("resize", function() {
  if (viewMode === "network") renderNetwork();
});

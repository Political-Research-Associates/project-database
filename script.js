let rawData = [];
let filteredData = [];
let tagColorMap = {};
let activeTags = new Set();
let currentPage = 1;
const pageSize = 9;

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const typeFilter = document.getElementById("typeFilter");
const tagFilters = document.getElementById("tagFilters");
const pagination = document.getElementById("pagination");

Papa.parse("data.csv", {
  download: true,
  header: true,
  skipEmptyLines: true,
  complete: function(results) {
    rawData = results.data;
    generateTagColors();
    buildTagFilters();
    applyFilters();
  }
});

function normalize(str) {
  return str ? String(str).toLowerCase() : "";
}

function createEl(tag, text, className) {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
}

/* ---------- Tag Colors ---------- */

function generateTagColors() {
  const tags = new Set();
  rawData.forEach(row => {
    if (row["Tags"]) {
      row["Tags"].split(",").forEach(t => tags.add(t.trim()));
    }
  });

  const palette = [
    "#1f77b4","#ff7f0e","#2ca02c","#d62728",
    "#9467bd","#8c564b","#e377c2","#7f7f7f",
    "#bcbd22","#17becf"
  ];

  let i = 0;
  tags.forEach(tag => {
    tagColorMap[tag] = palette[i % palette.length];
    i++;
  });
}

/* ---------- Tag Filter Bar ---------- */

function buildTagFilters() {
  tagFilters.innerHTML = "";
  Object.keys(tagColorMap).forEach(tag => {
    const pill = createEl("span", tag, "tag-filter");
    pill.style.backgroundColor = tagColorMap[tag];
    pill.setAttribute("tabindex", "0");

    pill.addEventListener("click", () => toggleTag(tag, pill));
    pill.addEventListener("keydown", e => {
      if (e.key === "Enter") toggleTag(tag, pill);
    });

    tagFilters.appendChild(pill);
  });
}

function toggleTag(tag, el) {
  if (activeTags.has(tag)) {
    activeTags.delete(tag);
    el.classList.remove("active");
  } else {
    activeTags.add(tag);
    el.classList.add("active");
  }
  applyFilters();
}

/* ---------- Search ---------- */

searchBtn.addEventListener("click", applyFilters);
searchInput.addEventListener("keydown", e => {
  if (e.key === "Enter") applyFilters();
});
typeFilter.addEventListener("change", applyFilters);

/* ---------- Filtering ---------- */

function applyFilters() {

  const term = normalize(searchInput.value.trim());
  const type = typeFilter.value;

  filteredData = rawData.filter(row => {

    const matchesSearch =
      !term ||
      normalize(row["Who"]).includes(term) ||
      normalize(row["Main affiliation as it relates to Project Esther (e.g. Heritage/NTFCA, White House, evangelical/Christian Zionist movement, etc)"])
        .includes(term);

    const matchesType =
      !type || row["Individual/Org"] === type;

    const matchesTags =
      activeTags.size === 0 ||
      (row["Tags"] &&
        [...activeTags].every(tag =>
          row["Tags"].includes(tag)
        ));

    return matchesSearch && matchesType && matchesTags;
  });

  currentPage = 1;
  renderPage();
}

/* ---------- Pagination ---------- */

function renderPage() {
  const start = (currentPage - 1) * pageSize;
  const pageData = filteredData.slice(start, start + pageSize);
  renderCards(pageData);
  renderPagination();
}

function renderPagination() {
  pagination.innerHTML = "";
  const totalPages = Math.ceil(filteredData.length / pageSize);

  for (let i = 1; i <= totalPages; i++) {
    const btn = createEl("button", i);
    if (i === currentPage) btn.disabled = true;

    btn.addEventListener("click", () => {
      currentPage = i;
      renderPage();
    });

    pagination.appendChild(btn);
  }
}

/* ---------- Cards ---------- */

function renderCards(data) {
  const container = document.getElementById("cardsContainer");
  const count = document.getElementById("resultsCount");

  container.innerHTML = "";
  count.textContent = `${filteredData.length} results`;

  data.forEach(row => {

    const card = createEl("div", null, "card");
    card.setAttribute("role", "listitem");
    card.setAttribute("tabindex", "0");

    const title = createEl("h2", row["Who"]);
    card.appendChild(title);

    const sections = [
      row["Main affiliation as it relates to Project Esther (e.g. Heritage/NTFCA, White House, evangelical/Christian Zionist movement, etc)"],
      row["Role in/ties to Project Esther/NTFCA"],
      row["Key bio points (other and prior organizational and government affiliations)"]
    ];

    sections.forEach(text => {
      if (text) card.appendChild(createEl("div", text, "section"));
    });

    if (row["Tags"]) {
      const tagContainer = createEl("div", null, "tags");
      row["Tags"].split(",").forEach(tag => {
        const trimmed = tag.trim();
        const pill = createEl("span", trimmed, "tag-pill");
        pill.style.backgroundColor = tagColorMap[trimmed];
        pill.addEventListener("click", e => {
          e.stopPropagation();
          toggleTag(trimmed, document.querySelector(`.tag-filter[style*="${tagColorMap[trimmed]}"]`));
        });
        tagContainer.appendChild(pill);
      });
      card.appendChild(tagContainer);
    }

    card.addEventListener("click", () => openModal(row));
    card.addEventListener("keydown", e => {
      if (e.key === "Enter") openModal(row);
    });

    container.appendChild(card);
  });
}

/* ---------- Modal ---------- */

const modalOverlay = document.getElementById("modalOverlay");
const modalContent = document.getElementById("modalContent");
const modalClose = document.getElementById("modalClose");

function openModal(row) {
  modalContent.innerHTML = "";
  Object.values(row).forEach(value => {
    if (value) {
      modalContent.appendChild(createEl("div", value, "section"));
    }
  });

  modalOverlay.classList.remove("hidden");
  modalOverlay.setAttribute("aria-hidden", "false");
  modalClose.focus();
}

function closeModal() {
  modalOverlay.classList.add("hidden");
  modalOverlay.setAttribute("aria-hidden", "true");
}

modalClose.addEventListener("click", closeModal);
modalOverlay.addEventListener("click", e => {
  if (e.target === modalOverlay) closeModal();
});
document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeModal();
});

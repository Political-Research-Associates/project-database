let allData = [];
let filteredData = [];
let activeTags = new Set();
let currentPage = 1;
const cardsPerPage = 6;

const tagColors = {};
const colorPalette = [
  "#1f77b4","#ff7f0e","#2ca02c","#d62728",
  "#9467bd","#8c564b","#e377c2","#7f7f7f",
  "#bcbd22","#17becf"
];

function safe(value) {
  return value ? value.toString() : "";
}

function normalize(value) {
  return safe(value).toLowerCase();
}

function getTagColor(tag) {
  if (!tagColors[tag]) {
    const index = Object.keys(tagColors).length % colorPalette.length;
    tagColors[tag] = colorPalette[index];
  }
  return tagColors[tag];
}

function extractTags(data) {
  const tags = new Set();
  data.forEach(row => {
    if (row.Tags) {
      row.Tags.split(",").forEach(tag => {
        const clean = tag.trim();
        if (clean) tags.add(clean);
      });
    }
  });
  return Array.from(tags).sort();
}

function renderTagFilters(tags) {
  const container = document.getElementById("tagFilters");
  container.innerHTML = "";

  tags.forEach(tag => {
    const pill = document.createElement("span");
    pill.className = "tag";
    pill.textContent = tag;
    pill.style.backgroundColor = getTagColor(tag);
    pill.setAttribute("role", "button");
    pill.setAttribute("tabindex", "0");

    pill.addEventListener("click", () => toggleTag(tag, pill));
    pill.addEventListener("keydown", e => {
      if (e.key === "Enter") toggleTag(tag, pill);
    });

    container.appendChild(pill);
  });
}

function toggleTag(tag, element) {
  if (activeTags.has(tag)) {
    activeTags.delete(tag);
    element.classList.remove("active");
  } else {
    activeTags.add(tag);
    element.classList.add("active");
  }
  currentPage = 1;
  applyFilters();
}

function applyFilters() {
  const searchTerm = normalize(
    document.getElementById("searchInput").value
  );

  filteredData = allData.filter(row => {
    const combinedText = Object.values(row)
      .map(val => normalize(val))
      .join(" ");

    const matchesSearch = combinedText.includes(searchTerm);

    const matchesTags =
      activeTags.size === 0 ||
      (row.Tags &&
        row.Tags.split(",").some(tag =>
          activeTags.has(tag.trim())
        ));

    return matchesSearch && matchesTags;
  });

  renderCards();
  renderPagination();
}

function renderCards() {
  const container = document.getElementById("cardContainer");
  container.innerHTML = "";

  if (filteredData.length === 0) {
    container.innerHTML = "<p>No results found.</p>";
    return;
  }

  const start = (currentPage - 1) * cardsPerPage;
  const pageItems = filteredData.slice(start, start + cardsPerPage);

  pageItems.forEach(row => {
    const card = document.createElement("div");
    card.className = "card";
    card.setAttribute("tabindex", "0");
    card.setAttribute("role", "button");

    const title = safe(row.Who);

    const tagsHTML = safe(row.Tags)
      .split(",")
      .map(tag => tag.trim())
      .filter(Boolean)
      .map(tag =>
        `<span class="tag" style="background:${getTagColor(tag)}">${tag}</span>`
      )
      .join("");

    card.innerHTML = `
      <h3>${title}</h3>
      <div class="card-tags">${tagsHTML}</div>
    `;

    card.addEventListener("click", () => openModal(row));
    card.addEventListener("keydown", e => {
      if (e.key === "Enter") openModal(row);
    });

    container.appendChild(card);
  });
}

function renderPagination() {
  const container = document.getElementById("pagination");
  container.innerHTML = "";

  const totalPages = Math.ceil(filteredData.length / cardsPerPage);
  if (totalPages <= 1) return;

  for (let i = 1; i <= totalPages; i++) {
    const btn = document.createElement("button");
    btn.textContent = i;
    btn.disabled = i === currentPage;

    btn.addEventListener("click", () => {
      currentPage = i;
      renderCards();
      renderPagination();
    });

    container.appendChild(btn);
  }
}

function openModal(row) {
  const modal = document.getElementById("modal");
  const body = document.getElementById("modalBody");

  const content = Object.entries(row)
    .map(([key, value]) => {
      if (!value) return "";
      return `<p><strong>${key}:</strong> ${safe(value)}</p>`;
    })
    .join("");

  body.innerHTML = content;

  modal.classList.add("show");
  modal.setAttribute("aria-hidden", "false");
  document.querySelector(".modal-content").focus();
}

function closeModal() {
  const modal = document.getElementById("modal");
  modal.classList.remove("show");
  modal.setAttribute("aria-hidden", "true");
}

document.getElementById("modalClose")
  .addEventListener("click", closeModal);

document.addEventListener("keydown", e => {
  if (e.key === "Escape") closeModal();
});

document.getElementById("searchInput")
  .addEventListener("input", () => {
    currentPage = 1;
    applyFilters();
  });

Papa.parse("data.csv", {
  download: true,
  header: true,
  skipEmptyLines: true,
  complete: function(results) {
    allData = results.data.

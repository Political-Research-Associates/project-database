let rawData = [];
let tagColorMap = {};

const searchInput = document.getElementById("searchInput");
const searchBtn = document.getElementById("searchBtn");
const typeFilter = document.getElementById("typeFilter");
const sortSelect = document.getElementById("sortSelect");

Papa.parse("data.csv", {
  download: true,
  header: true,
  skipEmptyLines: true,
  complete: function(results) {
    rawData = results.data;
    generateTagColors();
    applyFilters();
  }
});

/* ---------- Utilities ---------- */

function normalize(str) {
  return str ? str.toLowerCase() : "";
}

function createEl(tag, text, className) {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
}

/* ---------- Search (Columns A and C only) ---------- */

searchBtn.addEventListener("click", applyFilters);

searchInput.addEventListener("keydown", function(e) {
  if (e.key === "Enter") {
    applyFilters();
  }
});

/* ---------- Tag Color System ---------- */

function generateTagColors() {
  const tagSet = new Set();

  rawData.forEach(row => {
    if (row.Tags) {
      row.Tags.split(",").forEach(tag => {
        tagSet.add(tag.trim());
      });
    }
  });

  const colors = [
    "#1f77b4", "#ff7f0e", "#2ca02c",
    "#d62728", "#9467bd", "#8c564b",
    "#e377c2", "#7f7f7f", "#bcbd22",
    "#17becf"
  ];

  let index = 0;
  tagSet.forEach(tag => {
    tagColorMap[tag] = colors[index % colors.length];
    index++;
  });
}

/* ---------- Filtering ---------- */

typeFilter.addEventListener("change", applyFilters);
sortSelect.addEventListener("change", applyFilters);

function applyFilters() {

  const searchTerm = normalize(searchInput.value);
  const typeValue = typeFilter.value;

  let filtered = rawData.filter(row => {

    const matchesSearch =
      normalize(row.Who).includes(searchTerm) ||
      normalize(row["Main affiliation as it relates to Project Esther (e.g. Heritage/NTFCA, White House, evangelical/Christian Zionist movement, etc)"])
        .includes(searchTerm);

    const matchesType =
      !typeValue || row["Individual/Org"] === typeValue;

    return matchesSearch && matchesType;
  });

  filtered.sort((a, b) => {
    const nameA = normalize(a.Who);
    const nameB = normalize(b.Who);
    return sortSelect.value === "za"
      ? nameB.localeCompare(nameA)
      : nameA.localeCompare(nameB);
  });

  renderCards(filtered);
}

/* ---------- Card Rendering ---------- */

function renderCards(data) {
  const container = document.getElementById("cardsContainer");
  const count = document.getElementById("resultsCount");

  container.innerHTML = "";
  count.textContent = `${data.length} results`;

  data.forEach(row => {

    const card = createEl("div", null, "card");

    const title = createEl("h2", row.Who);
    card.appendChild(title);

    const meta = createEl("div", row["Individual/Org"], "meta");
    card.appendChild(meta);

    const sections = [
      row["Main affiliation as it relates to Project Esther (e.g. Heritage/NTFCA, White House, evangelical/Christian Zionist movement, etc)"],
      row["Role in/ties to Project Esther/NTFCA"],
      row["Key bio points (other and prior organizational and government affiliations)"],
      row["Key quotes"],
      row["Ties to Trumpworld"],
      row["Ties to other people in this database"],
      row["Any other important info"]
    ];

    sections.forEach(text => {
      if (text) {
        const section = createEl("div", text, "section");
        card.appendChild(section);
      }
    });

    /* ----- Tags as visual pills ----- */

    if (row.Tags) {
      const tagContainer = createEl("div", null, "tags");

      row.Tags.split(",").forEach(tag => {
        const trimmed = tag.trim();
        const pill = createEl("span", trimmed, "tag-pill");
        pill.style.backgroundColor = tagColorMap[trimmed] || "#444";
        tagContainer.appendChild(pill);
      });

      card.appendChild(tagContainer);
    }

    container.appendChild(card);
  });
}

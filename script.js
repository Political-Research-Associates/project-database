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

function getPrimaryField(row) {
  // Use first non-empty column as title
  for (const key in row) {
    if (row[key] && key !== "Tags") {
      return row[key];
    }
  }
  return "Untitled";
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

    pill.

let rawData = [];
let activeTags = new Set();

const searchInput = document.getElementById("searchInput");
const typeFilter = document.getElementById("typeFilter");
const sortSelect = document.getElementById("sortSelect");

Papa.parse("data.csv", {
  download: true,
  header: true,
  skipEmptyLines: true,
  complete: function(results) {
    rawData = results.data;
    initializeTags();
    applyFilters();
  }
});

/* ---------- Utilities ---------- */

function safeText(value) {
  return value ? String(value) : "";
}

function createElement(tag, text, className) {
  const el = document.createElement(tag);
  if (text) el.textContent = text;
  if (className) el.className = className;
  return el;
}

function normalize(str) {
  return str ? str.toLowerCase() : "";
}

/* ---------- Tag System (Multi-select) ---------- */

function initializeTags() {
  const container = document.getElementById("tagFilters");
  const tagSet = new Set();

  rawData.forEach(row => {
    if (row.Tags) {
      row.Tags.split(",").forEach(tag => {
        tagSet.add(tag.trim().toLowerCase());
      });
    }
  });

  tagSet.forEach(tag => {
    const tagEl = createElement("span", tag, "tag");
    tagEl.addEventListener("click", () => toggleTag(tag, tagEl));
    container.appendChild(tagEl);
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

/* ---------- Filtering + Sorting ---------- */

searchInput.addEventListener("input", applyFilters);
typeFilter.addEventListener("change", applyFilters);
sortSelect.addEventListener("change", applyFilters);

function applyFilters() {
  const searchTerm = normalize(searchInput.value);
  const typeValue = typeFilter.value;

  let filtered = rawData.filter(row => {

    const matchesSearch =
      normalize(Object.values(row).join(" "))
        .includes(searchTerm);

    const matchesType =
      !typeValue || row["Individual/Org"] === typeValue;

    const matchesTags =
      activeTags.size === 0 ||
      (row.Tags &&
        [...activeTags].every(tag =>
          normalize(row.Tags).includes(tag)
        ));

    return matchesSearch && matchesType && matchesTags;
  });

  // Sorting
  filtered.sort((a, b) => {
    const nameA = normalize(a.Who);
    const nameB = normalize(b.Who);
    return sortSelect.value === "za"
      ? nameB.localeCompare(nameA)
      : nameA.localeCompare(nameB);
  });

  renderCards(filtered);
}

/* ---------- Relationship Linking ---------- */

function createRelationshipLinks(text) {
  const container = document.createElement("span");
  if (!text) return container;

  text.split(",").forEach(name => {
    const trimmed = name.trim();
    const link = createElement("span", trimmed, "relationship");
    link.addEventListener("click", () => {
      searchInput.value = trimmed;
      applyFilters();
      window.scrollTo({ top: 0, behavior: "smooth" });
    });
    container.appendChild(link);
    container.appendChild(document.createTextNode(" "));
  });

  return container;
}

/* ---------- Card Rendering ---------- */

function renderCards(data) {
  const container = document.getElementById("cardsContainer");
  const count = document.getElementById("resultsCount");

  container.innerHTML = "";
  count.textContent = `${data.length} results`;

  data.forEach(row => {
    const card = createElement("div", null, "card");

    const title = createElement("h2", safeText(row.Who));
    card.appendChild(title);

    const meta = createElement("div",
      safeText(row["Individual/Org"]),
      "meta"
    );
    card.appendChild(meta);

    const affiliation = createElement("div", null, "section");
    affiliation.appendChild(
      createElement("strong", "Main Affiliation: ")
    );
    affiliation.appendChild(
      document.createTextNode(
        safeText(row["Main affiliation as it relates to Project Esther (e.g. Heritage/NTFCA, White House, evangelical/Christian Zionist movement, etc)"])
      )
    );
    card.appendChild(affiliation);

    const extra = createElement("div", null, "section hidden");

    const fields = [
      ["Role: ", row["Role in/ties to Project Esther/NTFCA"]],
      ["Bio: ", row["Key bio points (other and prior organizational and government affiliations)"]],
      ["Quotes: ", row["Key quotes"]],
      ["Ties to Trumpworld: ", row["Ties to Trumpworld"]],
      ["Other info: ", row["Any other important info"]]
    ];

    fields.forEach(([label, value]) => {
      if (value) {
        const div = createElement("div");
        div.appendChild(createElement("strong", label));
        div.appendChild(document.createTextNode(safeText(value)));
        extra.appendChild(div);
      }
    });

    // Relationship special handling
    if (row["Ties to other people in this database"]) {
      const relDiv = createElement("div");
      relDiv.appendChild(createElement("strong", "Related: "));
      relDiv.appendChild(
        createRelationshipLinks(
          row["Ties to other people in this database"]
        )
      );
      extra.appendChild(relDiv);
    }

    card.appendChild(extra);

    const btn = createElement("div", "Show more", "expand-btn");
    btn.addEventListener("click", () => {
      extra.classList.toggle("hidden");
      btn.textContent =
        extra.classList.contains("hidden")
          ? "Show more"
          : "Show less";
    });

    card.appendChild(btn);
    container.appendChild(card);
  });
}

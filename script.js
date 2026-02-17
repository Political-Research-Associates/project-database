document.addEventListener("DOMContentLoaded", function () {

  const cardContainer = document.getElementById("cardContainer");
  const tagFilters = document.getElementById("tagFilters");
  const searchInput = document.getElementById("searchInput");
  const pagination = document.getElementById("pagination");
  const modal = document.getElementById("modal");
  const modalBody = document.getElementById("modalBody");
  const modalClose = document.getElementById("modalClose");

  if (!window.Papa) {
    cardContainer.innerHTML = "<p>PapaParse failed to load.</p>";
    return;
  }

  let allData = [];
  let filteredData = [];
  let activeTags = new Set();
  let currentPage = 1;
  const cardsPerPage = 6;

  const tagColors = {};
  const colors = [
    "#1f77b4","#ff7f0e","#2ca02c","#d62728",
    "#9467bd","#8c564b","#e377c2","#7f7f7f",
    "#bcbd22","#17becf"
  ];

  function getTagColor(tag) {
    if (!tagColors[tag]) {
      const index = Object.keys(tagColors).length % colors.length;
      tagColors[tag] = colors[index];
    }
    return tagColors[tag];
  }

  function extractTags(data) {
    const tags = new Set();
    data.forEach(row => {
      if (row.Tags) {
        row.Tags.split(",").forEach(t => {
          const clean = t.trim();
          if (clean) tags.add(clean);
        });
      }
    });
    return Array.from(tags).sort();
  }

  function renderTags(tags) {
    tagFilters.innerHTML = "";
    tags.forEach(tag => {
      const el = document.createElement("span");
      el.className = "tag";
      el.textContent = tag;
      el.style.backgroundColor = getTagColor(tag);

      el.addEventListener("click", () => {
        if (activeTags.has(tag)) {
          activeTags.delete(tag);
          el.classList.remove("active");
        } else {
          activeTags.add(tag);
          el.classList.add("active");
        }
        currentPage = 1;
        applyFilters();
      });

      tagFilters.appendChild(el);
    });
  }

  function applyFilters() {
    const term = searchInput.value.toLowerCase();

    filteredData = allData.filter(row => {
      const text = Object.values(row).join(" ").toLowerCase();
      const searchMatch = text.includes(term);

      const tagMatch =
        activeTags.size === 0 ||
        (row.Tags &&
          row.Tags.split(",").some(t =>
            activeTags.has(t.trim())
          ));

      return searchMatch && tagMatch;
    });

    renderCards();
    renderPagination();
  }

  function renderCards() {
    cardContainer.innerHTML = "";

    if (filteredData.length === 0) {
      cardContainer.innerHTML = "<p>No data found.</p>";
      return;
    }

    const start = (currentPage - 1) * cardsPerPage;
    const items = filteredData.slice(start, start + cardsPerPage);

    items.forEach(row => {
      const card = document.createElement("div");
      card.className = "card";

      const title = Object.values(row)[0] || "Untitled";

      const tagsHTML = (row.Tags || "")
        .split(",")
        .map(t => t.trim())
        .filter(Boolean)
        .map(t =>
          `<span class="tag" style="background:${getTagColor(t)}">${t}</span>`
        )
        .join("");

      card.innerHTML = `
        <h3>${title}</h3>
        <div>${tagsHTML}</div>
      `;

      card.addEventListener("click", () => openModal(row));
      cardContainer.appendChild(card);
    });
  }

  function renderPagination() {
    pagination.innerHTML = "";
    const total = Math.ceil(filteredData.length / cardsPerPage);
    if (total <= 1) return;

    for (let i = 1; i <= total; i++) {
      const btn = document.createElement("button");
      btn.textContent = i;
      btn.disabled = i === currentPage;

      btn.addEventListener("click", () => {
        currentPage = i;
        renderCards();
        renderPagination();
      });

      pagination.appendChild(btn);
    }
  }

  function openModal(row) {
    modalBody.innerHTML = Object.entries(row)
      .map(([k,v]) => `<p><strong>${k}:</strong> ${v}</p>`)
      .join("");

    modal.classList.add("show");
  }

  modalClose.addEventListener("click", () => {
    modal.classList.remove("show");
  });

  Papa.parse("data.csv", {
    download: true,
    header: true,
    skipEmptyLines: true,
    complete: function(results) {

      if (!results.data || results.data.length === 0) {
        cardContainer.innerHTML = "<p>CSV loaded but empty.</p>";
        return;
      }

      allData = results.data;
      filteredData = [...allData];

      const tags = extractTags(allData);
      renderTags(tags);
      renderCards();
      renderPagination();
    },
    error: function(err) {
      cardContainer.innerHTML = "<p>Failed to load data.csv</p>";
      console.error(err);
    }
  });

});

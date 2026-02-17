document.addEventListener("DOMContentLoaded", async function () {

  const container = document.getElementById("cardContainer");

  try {
    const response = await fetch("data.csv", { cache: "no-store" });
    const text = await response.text();

    Papa.parse(text, {
      header: true,
      skipEmptyLines: true,
      complete: function(results) {

        console.log("HEADERS:", results.meta.fields);
        console.log("FIRST ROW:", results.data[0]);
        console.log("ALL DATA:", results.data);

        if (!results.data || results.data.length === 0) {
          container.innerHTML = "<p>CSV loaded but no rows found.</p>";
          return;
        }

        container.innerHTML = `
          <pre>
Headers:
${JSON.stringify(results.meta.fields, null, 2)}

First Row:
${JSON.stringify(results.data[0], null, 2)}
          </pre>
        `;

      },
      error: function(err) {
        container.innerHTML = "<p>PapaParse error.</p>";
        console.error(err);
      }
    });

  } catch (err) {
    container.innerHTML = "<p>Fetch failed.</p>";
    console.error(err);
  }

});

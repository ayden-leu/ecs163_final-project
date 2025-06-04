let style = {};

const citiesJSON = "data/CA_CITIES.json";
const countiesJSON = "data/FILTERED_COUNTY_LINES.json";
const firesJSON = "data/FILTERED_BIG_FIRES.json";

const countiesCSV = "data/CA_counties.csv";

let countyPriceData = {};
let selectedCountyName = null;

///////////////////////////////////////////////////////////////////////////
// main map visualization
///////////////////////////////////////////////////////////////////////////
function isValidGeometry(feature) {
  const geom = feature.geometry;
  return (
    geom &&
    geom.coordinates &&
    geom.coordinates.length > 0 &&
    (geom.type === "Polygon" || geom.type === "MultiPolygon")
  );
}

// Resizable sidebar

const sidebar = document.getElementById("sidebar");
const dragHandle = document.getElementById("dragHandle");

let isResizing = false;

dragHandle.addEventListener("mousedown", function (e) {
  isResizing = true;
  document.body.style.cursor = "ew-resize";
  e.preventDefault();
});

document.addEventListener("mousemove", function (e) {
  if (!isResizing) return;

  const newWidth = window.innerWidth - e.clientX;
  const clampedWidth = Math.max(200, Math.min(newWidth, 700)); // optional bounds
  sidebar.style.width = clampedWidth + "px";

  // Optional: dynamically re-render chart based on new width
  const countyNameHeader = sidebar.querySelector("h2")?.textContent;
  if (countyNameHeader && countyPriceData[countyNameHeader]) {
    const rawRow = countyPriceData[countyNameHeader];
    const rawData = Object.entries(rawRow).map(([key, value]) => ({
      key,
      value,
    }));
    drawLineChart(rawData, countyNameHeader);
  }
});

document.addEventListener("mouseup", function () {
  if (isResizing) {
    isResizing = false;
    document.body.style.cursor = "default";
  }
});

let allFires = [];
const yearSlider = document.getElementById("yearSlider");
const yearLabel = document.getElementById("yearLabel");

//
let cityLayer, countyLayer; // Layers to toggle between
let showingCounties = true; // Views counties by default

Promise.all([
  d3.json(citiesJSON),
  d3.json(countiesJSON),
  d3.json(firesJSON),
  d3.csv(countiesCSV, d3.autoType),
]).then(([cityGeo, countyGeo, fireGeo, countyCSV]) => {
  searchInput.addEventListener("input", () => {
    const query = searchInput.value.trim().toLowerCase();
    if (!query) {
      searchSuggestions.style.display = "none";
      searchSuggestions.innerHTML = "";
      return;
    }

    const allNames = [
      ...validCounties.map((d) => ({
        name: d.properties.NAME,
        type: "county",
        feature: d,
      })),
      ...validCities.map((d) => ({
        name: d.properties.NAME,
        type: "city",
        feature: d,
      })),
    ];

    const matches = allNames
      .filter((d) => d.name && d.name.toLowerCase().includes(query))
      .slice(0, 3);

    if (matches.length === 0) {
      searchSuggestions.style.display = "none";
      searchSuggestions.innerHTML = "";
      return;
    }

    // Show dropdown
    searchSuggestions.style.display = "block";
    searchSuggestions.innerHTML = matches
      .map(
        (d) => `
        <div class="suggestion-item">
            ${d.name} <span style="color: #888; font-size: 12px;">(${d.type})</span>
        </div>
    `
      )
      .join("");

    // Add click handlers
    Array.from(searchSuggestions.children).forEach((child, i) => {
      child.addEventListener("click", () => {
        const selected = matches[i];
        searchInput.value = selected.name;
        searchSuggestions.style.display = "none";

        if (selected.type === "county") {
          handleCountyClick(null, selected.feature);
        } else {
          // TODO: load in county data later
          const bounds = path.bounds(selected.feature);
          const dx = bounds[1][0] - bounds[0][0];
          const dy = bounds[1][1] - bounds[0][1];
          const x = (bounds[0][0] + bounds[1][0]) / 2;
          const y = (bounds[0][1] + bounds[1][1]) / 2;
          const scale = Math.max(
            1,
            Math.min(8, 0.9 / Math.max(dx / width, dy / height))
          );

          const sidebarOffset = 300;
          const translate = [
            (width - sidebarOffset) / 2 - scale * x,
            height / 2 - scale * y,
          ];

          svg
            .transition()
            .duration(750)
            .call(
              zoom.transform,
              d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
            );
        }
      });
    });
  });

  // You now have access to housingCSV as an array of objects
  console.log("Housing data loaded:", countyCSV);

  // Process housing data and assign it to a global or scoped variable
  const countyPriceData = {};

  countyCSV.forEach((row) => {
    const cleanedCounty = row.RegionName.replace(" County", "");
    const prices = [];

    for (const key in row) {
      if (key.startsWith("X")) {
        prices.push({
          date: key.slice(1), // e.g., "2000.01.31"
          price: +row[key] || null,
        });
      }
    }

    countyPriceData[cleanedCounty] = prices;
  });

  const svg = d3.select("#map");

  const containerRect = svg.node().getBoundingClientRect();
  const width = +containerRect.width;
  const height = +containerRect.height;

  const sideBar = document.getElementById("sidebar"); // Sidebar DOM element

  const validCities = cityGeo.features.filter(isValidGeometry);
  const validCounties = countyGeo.features.filter(isValidGeometry);
  const validFires = fireGeo.features.filter(isValidGeometry);

  allFires = validFires;

  const combined = {
    type: "FeatureCollection",
    features: validCities.concat(validCounties),
  };

  const projection = d3
    .geoConicConformal()
    .parallels([34, 40.5])
    .rotate([120])
    .fitSize([width, height], combined);

  const path = d3.geoPath().projection(projection);

  const zoomGroup = svg.append("g").attr("class", "zoom-layer");

  // Correct order:
  const countyLayer = zoomGroup.append("g").attr("class", "counties");
  const cityLayer = zoomGroup.append("g").attr("class", "cities");
  const fireLayer = zoomGroup.append("g").attr("class", "fire-layer");

  const countyLabelLayer = zoomGroup.append("g").attr("class", "county-labels");
  const cityLabelLayer = zoomGroup.append("g").attr("class", "city-labels");

  const zoom = d3
    .zoom()
    .scaleExtent([1, 20])
    .on("zoom", (event) => {
      zoomGroup.attr("transform", event.transform);

      const currentZoom = event.transform.k;

      const countyOpacity =
        currentZoom < 4 ? 1 : Math.max(0, 1 - (currentZoom - 4));
      const cityOpacity =
        currentZoom > 3 ? Math.min(1, (currentZoom - 3) / 2) : 0;

      countyLabelLayer
        .selectAll("text")
        .attr("opacity", countyOpacity)
        .attr(
          "font-size",
          (d) => `${Math.max(8, 12 - (currentZoom - 1) * 1.5)}px`
        );

      cityLabelLayer.selectAll("text").attr("opacity", cityOpacity);
    });

  svg.call(zoom);
  // svg.call(
  //     d3.zoom()
  //         .scaleExtent([1, 20])
  //         .on("zoom", (event) => {
  //             zoomGroup.attr("transform", event.transform);
  //         })
  // );

  // Counties (underneath)
  countyLayer
    .selectAll("path.county")
    .data(validCounties)
    .join("path")
    .attr("class", "county")
    .attr("d", path)
    .on("click", handleCountyClick);

  // Cities (middle layer)
  cityLayer
    .selectAll("path.city")
    .data(validCities)
    .join("path")
    .attr("class", "city")
    .attr("d", path);

  // Names / labels
  countyLabelLayer
    .selectAll("text")
    .data(validCounties)
    .join("text")
    .attr("class", "county-label")
    .attr("transform", (d) => {
      const centroid = path.centroid(d);
      return `translate(${centroid[0]}, ${centroid[1]})`;
    })
    .text((d) => d.properties.NAME)
    .attr("opacity", 1);

  cityLabelLayer
    .selectAll("text")
    .data(validCities)
    .join("text")
    .attr("class", "city-label")
    .attr("transform", (d) => {
      const centroid = path.centroid(d);
      return `translate(${centroid[0]}, ${centroid[1]})`;
    })
    .text((d) => d.properties.NAME)
    .attr("opacity", 0);

  // Sets up the tooltips for the fires, appends the tooltip div to the body and styles it
  const tooltip = d3
    .select("body")
    .append("div")
    .attr("class", "fire-tooltip")
    .style("position", "absolute")
    .style("padding", "8px")
    .style("background", "rgba(0, 0, 0, 0.8)")
    .style("color", "#fff")
    .style("border-radius", "4px")
    .style("font-size", "12px")
    .style("pointer-events", "none")
    .style("opacity", 0);

  function drawFiresByYear(year) {
    const filtered = allFires.filter((f) => f.properties.YEAR_ === year);

    const firePaths = fireLayer
      .selectAll("path.fire")
      .data(
        filtered,
        (d) => d.properties.IRWINID || JSON.stringify(d.geometry)
      );

    firePaths.join(
      (enter) =>
        enter
          .append("path")
          .attr("class", "fire")
          .attr("d", path)
          .attr("fill", "orange")
          .attr("opacity", 0.5)
          .attr("stroke", "#ff8800")
          .attr("stroke-width", 0.2)

          // Tooltip events below; When mouse goes over a fire, show the tooltip with fire details (name, year, and acreage)
          .on("mouseover", (event, d) => {
            const props = d.properties;
            tooltip
              .style("opacity", 1)
              .html(
                `
                            <strong>${
                              props.FIRE_NAME || "Unknown Fire"
                            }</strong><br/>
                            <strong>Year:</strong> ${props.YEAR_ || "N/A"}<br/>
                            <strong>Acres:</strong> ${
                              props.GIS_ACRES?.toLocaleString() || "N/A"
                            }
                        `
              )
              .style("left", event.pageX + 10 + "px")
              .style("top", event.pageY - 28 + "px");
          })
          .on("mousemove", (event) => {
            tooltip
              .style("left", event.pageX + 10 + "px")
              .style("top", event.pageY - 28 + "px");
          })
          .on("mouseout", () => {
            tooltip.style("opacity", 0);
          }),

      (update) => update,
      (exit) => exit.remove()
    );
  }

  function drawLineChart(data, countyName) {
    console.log("Drawing line chart for", countyName, "with data:", data);

    // Clean and filter data
    const cleanData = data
      .map((d) => {
        const dateStr = d.value?.date;
        const rawPrice = d.value?.price;
        if (!dateStr || rawPrice == null || isNaN(+rawPrice)) return null;
        return {
          date: new Date(dateStr.replace(/\./g, "-")),
          price: +rawPrice,
        };
      })
      .filter((d) => d !== null);

    if (cleanData.length === 0) {
      console.warn("No valid data to draw for", countyName);
      return;
    }

    const container = document.getElementById("priceChart");
    container.innerHTML = ""; // Clear previous SVG

    const containerWidth = container.clientWidth || 300;
    const containerHeight = container.clientHeight || 250;

    const margin = { top: 20, right: 30, bottom: 40, left: 60 },
      width = containerWidth - margin.left - margin.right,
      height = containerHeight - margin.top - margin.bottom;

    const svg = d3
      .select("#priceChart")
      .append("svg")
      .attr("width", width + margin.left + margin.right)
      .attr("height", height + margin.top + margin.bottom)
      .append("g")
      .attr("transform", `translate(${margin.left},${margin.top})`);

    const x = d3
      .scaleTime()
      .domain(d3.extent(cleanData, (d) => d.date))
      .range([0, width]);

    const y = d3
      .scaleLinear()
      .domain([0, d3.max(cleanData, (d) => d.price)])
      .nice()
      .range([height, 0]);

    svg
      .append("g")
      .attr("transform", `translate(0, ${height})`)
      .call(d3.axisBottom(x).tickFormat(d3.timeFormat("%Y")));

    svg
      .append("g")
      .call(d3.axisLeft(y).ticks(6).tickFormat(d3.format("$,.0f")));

    const line = d3
      .line()
      .x((d) => x(d.date))
      .y((d) => y(d.price));

    svg
      .append("path")
      .datum(cleanData)
      .attr("fill", "none")
      .attr("stroke", "#0077cc")
      .attr("stroke-width", 2)
      .attr("d", line);

    svg
      .append("text")
      .attr("x", width / 2)
      .attr("y", -8)
      .attr("text-anchor", "middle")
      .attr("font-size", "14px")
      .attr("font-weight", "bold")
      .text(`Median Home Prices: ${countyName}`);
  }

  function handleCountyClick(event, d) {
    const bounds = path.bounds(d);
    const dx = bounds[1][0] - bounds[0][0];
    const dy = bounds[1][1] - bounds[0][1];
    const x = (bounds[0][0] + bounds[1][0]) / 2;
    const y = (bounds[0][1] + bounds[1][1]) / 2;
    const scale = Math.max(
      1,
      Math.min(8, 0.9 / Math.max(dx / width, dy / height))
    );

    const sidebarOffset = 300;
    const translate = [
      (width - sidebarOffset) / 2 - scale * x,
      height / 2 - scale * y,
    ];

    svg
      .transition()
      .duration(750)
      .call(
        zoom.transform,
        d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
      );

    const props = d.properties;
    // Set sidebar content
    const sidebar = document.getElementById("sidebar");
    const sidebarContent = document.getElementById("sidebarContent");
    const mainContent = document.getElementById("mainContent");

    sidebarContent.innerHTML = `
  <h2>${d.properties.NAME || "Unknown County"}</h2>
  <div id="priceChart" style="width: 100%; height: 250px;"></div>
  `;
    sidebar.classList.add("visible");
    mainContent.classList.add("with-sidebar");

    // Close logic
    const closeBtn = document.getElementById("closeSidebarButton");
    closeBtn.onclick = () => {
      sidebar.classList.remove("visible");
      mainContent.classList.remove("with-sidebar");
      sidebarContent.innerHTML = "";
      selectedCountyName = null;
    };

    const countyName = d.properties.NAME;
    selectedCountyName = countyName;

    // Draw the chart (pass raw row object from countyPriceData)
    if (countyPriceData && countyPriceData[countyName]) {
      const rawRow = countyPriceData[countyName];
      const rawData = Object.entries(rawRow).map(([key, value]) => ({
        key,
        value,
      }));
      drawLineChart(rawData, countyName);
    } else {
      console.log("⚠️ No price data found for", countyName);
    }
  }

  // Slider logic
  yearSlider.addEventListener("input", () => {
    const year = +yearSlider.value;
    yearLabel.textContent = year;
    drawFiresByYear(year);
  });

  // Initial render
  drawFiresByYear(+yearSlider.value);
});

///////////////////////////////////////////////////////////////////////////
// price graph visualization
///////////////////////////////////////////////////////////////////////////
const zillowDataset = "./data/ZILLOW_DATA_CITIES.csv";
const debugStyle = ""; //"outline: 1px solid black"

function processGraphData(rawData) {
  // RegionID,SizeRank,RegionName,RegionType,StateName,State,Metro,CountyName,
  // 2000-01-31,2000-02-29,2000-03-31,2000-04-30,2000-05-31,2000-06-30,2000-07-31,2000-08-31,2000-09-30,2000-10-31,
  // 2000-11-30,2000-12-31,2001-01-31,2001-02-28,2001-03-31,2001-04-30,2001-05-31,2001-06-30,2001-07-31,2001-08-31,
  // 2001-09-30,2001-10-31,2001-11-30,2001-12-31,2002-01-31,2002-02-28,2002-03-31,2002-04-30,2002-05-31,2002-06-30,
  // 2002-07-31,2002-08-31,2002-09-30,2002-10-31,2002-11-30,2002-12-31,2003-01-31,2003-02-28,2003-03-31,2003-04-30,
  // 2003-05-31,2003-06-30,2003-07-31,2003-08-31,2003-09-30,2003-10-31,2003-11-30,2003-12-31,2004-01-31,2004-02-29,
  // 2004-03-31,2004-04-30,2004-05-31,2004-06-30,2004-07-31,2004-08-31,2004-09-30,2004-10-31,2004-11-30,2004-12-31,
  // 2005-01-31,2005-02-28,2005-03-31,2005-04-30,2005-05-31,2005-06-30,2005-07-31,2005-08-31,2005-09-30,2005-10-31,
  // 2005-11-30,2005-12-31,2006-01-31,2006-02-28,2006-03-31,2006-04-30,2006-05-31,2006-06-30,2006-07-31,2006-08-31,
  // 2006-09-30,2006-10-31,2006-11-30,2006-12-31,2007-01-31,2007-02-28,2007-03-31,2007-04-30,2007-05-31,2007-06-30,
  // 2007-07-31,2007-08-31,2007-09-30,2007-10-31,2007-11-30,2007-12-31,2008-01-31,2008-02-29,2008-03-31,2008-04-30,
  // 2008-05-31,2008-06-30,2008-07-31,2008-08-31,2008-09-30,2008-10-31,2008-11-30,2008-12-31,2009-01-31,2009-02-28,
  // 2009-03-31,2009-04-30,2009-05-31,2009-06-30,2009-07-31,2009-08-31,2009-09-30,2009-10-31,2009-11-30,2009-12-31,
  // 2010-01-31,2010-02-28,2010-03-31,2010-04-30,2010-05-31,2010-06-30,2010-07-31,2010-08-31,2010-09-30,2010-10-31,
  // 2010-11-30,2010-12-31,2011-01-31,2011-02-28,2011-03-31,2011-04-30,2011-05-31,2011-06-30,2011-07-31,2011-08-31,
  // 2011-09-30,2011-10-31,2011-11-30,2011-12-31,2012-01-31,2012-02-29,2012-03-31,2012-04-30,2012-05-31,2012-06-30,
  // 2012-07-31,2012-08-31,2012-09-30,2012-10-31,2012-11-30,2012-12-31,2013-01-31,2013-02-28,2013-03-31,2013-04-30,
  // 2013-05-31,2013-06-30,2013-07-31,2013-08-31,2013-09-30,2013-10-31,2013-11-30,2013-12-31,2014-01-31,2014-02-28,
  // 2014-03-31,2014-04-30,2014-05-31,2014-06-30,2014-07-31,2014-08-31,2014-09-30,2014-10-31,2014-11-30,2014-12-31,
  // 2015-01-31,2015-02-28,2015-03-31,2015-04-30,2015-05-31,2015-06-30,2015-07-31,2015-08-31,2015-09-30,2015-10-31,
  // 2015-11-30,2015-12-31,2016-01-31,2016-02-29,2016-03-31,2016-04-30,2016-05-31,2016-06-30,2016-07-31,2016-08-31,
  // 2016-09-30,2016-10-31,2016-11-30,2016-12-31,2017-01-31,2017-02-28,2017-03-31,2017-04-30,2017-05-31,2017-06-30,
  // 2017-07-31,2017-08-31,2017-09-30,2017-10-31,2017-11-30,2017-12-31,2018-01-31,2018-02-28,2018-03-31,2018-04-30,
  // 2018-05-31,2018-06-30,2018-07-31,2018-08-31,2018-09-30,2018-10-31,2018-11-30,2018-12-31,2019-01-31,2019-02-28,
  // 2019-03-31,2019-04-30,2019-05-31,2019-06-30,2019-07-31,2019-08-31,2019-09-30,2019-10-31,2019-11-30,2019-12-31,
  // 2020-01-31,2020-02-29,2020-03-31,2020-04-30,2020-05-31,2020-06-30,2020-07-31,2020-08-31,2020-09-30,2020-10-31,
  // 2020-11-30,2020-12-31,2021-01-31,2021-02-28,2021-03-31,2021-04-30,2021-05-31,2021-06-30,2021-07-31,2021-08-31,
  // 2021-09-30,2021-10-31,2021-11-30,2021-12-31,2022-01-31,2022-02-28,2022-03-31,2022-04-30,2022-05-31,2022-06-30,
  // 2022-07-31,2022-08-31,2022-09-30,2022-10-31,2022-11-30,2022-12-31,2023-01-31,2023-02-28,2023-03-31,2023-04-30,
  // 2023-05-31,2023-06-30,2023-07-31,2023-08-31,2023-09-30,2023-10-31,2023-11-30,2023-12-31,2024-01-31,2024-02-29,
  // 2024-03-31,2024-04-30,2024-05-31,2024-06-30,2024-07-31,2024-08-31,2024-09-30,2024-10-31,2024-11-30,2024-12-31,
  // 2025-01-31,2025-02-28,2025-03-31,2025-04-30

  return rawData.map((entry) => {
    return {
      id: Number(entry.RegionID),
      rank: entry.SizeRank,
      name: entry.RegionName,
      metro: entry.Metro,
      county: entry.CountyName,
      prices: [
        {
          date: d3.timeParse("%Y-%m-%d")("2000-01-31"),
          value: entry["2000-01-31"] === "NA" ? 0 : entry["2000-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2000-02-29"),
          value: entry["2000-02-29"] === "NA" ? 0 : entry["2000-02-29"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2000-03-31"),
          value: entry["2000-03-31"] === "NA" ? 0 : entry["2000-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2000-04-30"),
          value: entry["2000-04-30"] === "NA" ? 0 : entry["2000-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2000-05-31"),
          value: entry["2000-05-31"] === "NA" ? 0 : entry["2000-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2000-06-30"),
          value: entry["2000-06-30"] === "NA" ? 0 : entry["2000-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2000-07-31"),
          value: entry["2000-07-31"] === "NA" ? 0 : entry["2000-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2000-08-31"),
          value: entry["2000-08-31"] === "NA" ? 0 : entry["2000-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2000-09-30"),
          value: entry["2000-09-30"] === "NA" ? 0 : entry["2000-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2000-10-31"),
          value: entry["2000-10-31"] === "NA" ? 0 : entry["2000-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2000-11-30"),
          value: entry["2000-11-30"] === "NA" ? 0 : entry["2000-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2000-12-31"),
          value: entry["2000-12-31"] === "NA" ? 0 : entry["2000-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2001-01-31"),
          value: entry["2001-01-31"] === "NA" ? 0 : entry["2001-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2001-02-28"),
          value: entry["2001-02-28"] === "NA" ? 0 : entry["2001-02-28"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2001-03-31"),
          value: entry["2001-03-31"] === "NA" ? 0 : entry["2001-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2001-04-30"),
          value: entry["2001-04-30"] === "NA" ? 0 : entry["2001-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2001-05-31"),
          value: entry["2001-05-31"] === "NA" ? 0 : entry["2001-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2001-06-30"),
          value: entry["2001-06-30"] === "NA" ? 0 : entry["2001-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2001-07-31"),
          value: entry["2001-07-31"] === "NA" ? 0 : entry["2001-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2001-08-31"),
          value: entry["2001-08-31"] === "NA" ? 0 : entry["2001-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2001-09-30"),
          value: entry["2001-09-30"] === "NA" ? 0 : entry["2001-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2001-10-31"),
          value: entry["2001-10-31"] === "NA" ? 0 : entry["2001-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2001-11-30"),
          value: entry["2001-11-30"] === "NA" ? 0 : entry["2001-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2001-12-31"),
          value: entry["2001-12-31"] === "NA" ? 0 : entry["2001-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2002-01-31"),
          value: entry["2002-01-31"] === "NA" ? 0 : entry["2002-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2002-02-28"),
          value: entry["2002-02-28"] === "NA" ? 0 : entry["2002-02-28"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2002-03-31"),
          value: entry["2002-03-31"] === "NA" ? 0 : entry["2002-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2002-04-30"),
          value: entry["2002-04-30"] === "NA" ? 0 : entry["2002-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2002-05-31"),
          value: entry["2002-05-31"] === "NA" ? 0 : entry["2002-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2002-06-30"),
          value: entry["2002-06-30"] === "NA" ? 0 : entry["2002-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2002-07-31"),
          value: entry["2002-07-31"] === "NA" ? 0 : entry["2002-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2002-08-31"),
          value: entry["2002-08-31"] === "NA" ? 0 : entry["2002-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2002-09-30"),
          value: entry["2002-09-30"] === "NA" ? 0 : entry["2002-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2002-10-31"),
          value: entry["2002-10-31"] === "NA" ? 0 : entry["2002-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2002-11-30"),
          value: entry["2002-11-30"] === "NA" ? 0 : entry["2002-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2002-12-31"),
          value: entry["2002-12-31"] === "NA" ? 0 : entry["2002-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2003-01-31"),
          value: entry["2003-01-31"] === "NA" ? 0 : entry["2003-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2003-02-28"),
          value: entry["2003-02-28"] === "NA" ? 0 : entry["2003-02-28"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2003-03-31"),
          value: entry["2003-03-31"] === "NA" ? 0 : entry["2003-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2003-04-30"),
          value: entry["2003-04-30"] === "NA" ? 0 : entry["2003-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2003-05-31"),
          value: entry["2003-05-31"] === "NA" ? 0 : entry["2003-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2003-06-30"),
          value: entry["2003-06-30"] === "NA" ? 0 : entry["2003-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2003-07-31"),
          value: entry["2003-07-31"] === "NA" ? 0 : entry["2003-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2003-08-31"),
          value: entry["2003-08-31"] === "NA" ? 0 : entry["2003-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2003-09-30"),
          value: entry["2003-09-30"] === "NA" ? 0 : entry["2003-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2003-10-31"),
          value: entry["2003-10-31"] === "NA" ? 0 : entry["2003-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2003-11-30"),
          value: entry["2003-11-30"] === "NA" ? 0 : entry["2003-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2003-12-31"),
          value: entry["2003-12-31"] === "NA" ? 0 : entry["2003-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2004-01-31"),
          value: entry["2004-01-31"] === "NA" ? 0 : entry["2004-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2004-02-29"),
          value: entry["2004-02-29"] === "NA" ? 0 : entry["2004-02-29"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2004-03-31"),
          value: entry["2004-03-31"] === "NA" ? 0 : entry["2004-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2004-04-30"),
          value: entry["2004-04-30"] === "NA" ? 0 : entry["2004-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2004-05-31"),
          value: entry["2004-05-31"] === "NA" ? 0 : entry["2004-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2004-06-30"),
          value: entry["2004-06-30"] === "NA" ? 0 : entry["2004-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2004-07-31"),
          value: entry["2004-07-31"] === "NA" ? 0 : entry["2004-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2004-08-31"),
          value: entry["2004-08-31"] === "NA" ? 0 : entry["2004-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2004-09-30"),
          value: entry["2004-09-30"] === "NA" ? 0 : entry["2004-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2004-10-31"),
          value: entry["2004-10-31"] === "NA" ? 0 : entry["2004-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2004-11-30"),
          value: entry["2004-11-30"] === "NA" ? 0 : entry["2004-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2004-12-31"),
          value: entry["2004-12-31"] === "NA" ? 0 : entry["2004-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2005-01-31"),
          value: entry["2005-01-31"] === "NA" ? 0 : entry["2005-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2005-02-28"),
          value: entry["2005-02-28"] === "NA" ? 0 : entry["2005-02-28"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2005-03-31"),
          value: entry["2005-03-31"] === "NA" ? 0 : entry["2005-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2005-04-30"),
          value: entry["2005-04-30"] === "NA" ? 0 : entry["2005-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2005-05-31"),
          value: entry["2005-05-31"] === "NA" ? 0 : entry["2005-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2005-06-30"),
          value: entry["2005-06-30"] === "NA" ? 0 : entry["2005-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2005-07-31"),
          value: entry["2005-07-31"] === "NA" ? 0 : entry["2005-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2005-08-31"),
          value: entry["2005-08-31"] === "NA" ? 0 : entry["2005-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2005-09-30"),
          value: entry["2005-09-30"] === "NA" ? 0 : entry["2005-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2005-10-31"),
          value: entry["2005-10-31"] === "NA" ? 0 : entry["2005-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2005-11-30"),
          value: entry["2005-11-30"] === "NA" ? 0 : entry["2005-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2005-12-31"),
          value: entry["2005-12-31"] === "NA" ? 0 : entry["2005-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2006-01-31"),
          value: entry["2006-01-31"] === "NA" ? 0 : entry["2006-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2006-02-28"),
          value: entry["2006-02-28"] === "NA" ? 0 : entry["2006-02-28"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2006-03-31"),
          value: entry["2006-03-31"] === "NA" ? 0 : entry["2006-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2006-04-30"),
          value: entry["2006-04-30"] === "NA" ? 0 : entry["2006-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2006-05-31"),
          value: entry["2006-05-31"] === "NA" ? 0 : entry["2006-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2006-06-30"),
          value: entry["2006-06-30"] === "NA" ? 0 : entry["2006-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2006-07-31"),
          value: entry["2006-07-31"] === "NA" ? 0 : entry["2006-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2006-08-31"),
          value: entry["2006-08-31"] === "NA" ? 0 : entry["2006-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2006-09-30"),
          value: entry["2006-09-30"] === "NA" ? 0 : entry["2006-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2006-10-31"),
          value: entry["2006-10-31"] === "NA" ? 0 : entry["2006-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2006-11-30"),
          value: entry["2006-11-30"] === "NA" ? 0 : entry["2006-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2006-12-31"),
          value: entry["2006-12-31"] === "NA" ? 0 : entry["2006-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2007-01-31"),
          value: entry["2007-01-31"] === "NA" ? 0 : entry["2007-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2007-02-28"),
          value: entry["2007-02-28"] === "NA" ? 0 : entry["2007-02-28"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2007-03-31"),
          value: entry["2007-03-31"] === "NA" ? 0 : entry["2007-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2007-04-30"),
          value: entry["2007-04-30"] === "NA" ? 0 : entry["2007-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2007-05-31"),
          value: entry["2007-05-31"] === "NA" ? 0 : entry["2007-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2007-06-30"),
          value: entry["2007-06-30"] === "NA" ? 0 : entry["2007-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2007-07-31"),
          value: entry["2007-07-31"] === "NA" ? 0 : entry["2007-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2007-08-31"),
          value: entry["2007-08-31"] === "NA" ? 0 : entry["2007-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2007-09-30"),
          value: entry["2007-09-30"] === "NA" ? 0 : entry["2007-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2007-10-31"),
          value: entry["2007-10-31"] === "NA" ? 0 : entry["2007-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2007-11-30"),
          value: entry["2007-11-30"] === "NA" ? 0 : entry["2007-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2007-12-31"),
          value: entry["2007-12-31"] === "NA" ? 0 : entry["2007-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2008-01-31"),
          value: entry["2008-01-31"] === "NA" ? 0 : entry["2008-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2008-02-29"),
          value: entry["2008-02-29"] === "NA" ? 0 : entry["2008-02-29"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2008-03-31"),
          value: entry["2008-03-31"] === "NA" ? 0 : entry["2008-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2008-04-30"),
          value: entry["2008-04-30"] === "NA" ? 0 : entry["2008-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2008-05-31"),
          value: entry["2008-05-31"] === "NA" ? 0 : entry["2008-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2008-06-30"),
          value: entry["2008-06-30"] === "NA" ? 0 : entry["2008-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2008-07-31"),
          value: entry["2008-07-31"] === "NA" ? 0 : entry["2008-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2008-08-31"),
          value: entry["2008-08-31"] === "NA" ? 0 : entry["2008-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2008-09-30"),
          value: entry["2008-09-30"] === "NA" ? 0 : entry["2008-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2008-10-31"),
          value: entry["2008-10-31"] === "NA" ? 0 : entry["2008-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2008-11-30"),
          value: entry["2008-11-30"] === "NA" ? 0 : entry["2008-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2008-12-31"),
          value: entry["2008-12-31"] === "NA" ? 0 : entry["2008-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2009-01-31"),
          value: entry["2009-01-31"] === "NA" ? 0 : entry["2009-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2009-02-28"),
          value: entry["2009-02-28"] === "NA" ? 0 : entry["2009-02-28"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2009-03-31"),
          value: entry["2009-03-31"] === "NA" ? 0 : entry["2009-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2009-04-30"),
          value: entry["2009-04-30"] === "NA" ? 0 : entry["2009-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2009-05-31"),
          value: entry["2009-05-31"] === "NA" ? 0 : entry["2009-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2009-06-30"),
          value: entry["2009-06-30"] === "NA" ? 0 : entry["2009-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2009-07-31"),
          value: entry["2009-07-31"] === "NA" ? 0 : entry["2009-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2009-08-31"),
          value: entry["2009-08-31"] === "NA" ? 0 : entry["2009-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2009-09-30"),
          value: entry["2009-09-30"] === "NA" ? 0 : entry["2009-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2009-10-31"),
          value: entry["2009-10-31"] === "NA" ? 0 : entry["2009-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2009-11-30"),
          value: entry["2009-11-30"] === "NA" ? 0 : entry["2009-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2009-12-31"),
          value: entry["2009-12-31"] === "NA" ? 0 : entry["2009-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2010-01-31"),
          value: entry["2010-01-31"] === "NA" ? 0 : entry["2010-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2010-02-28"),
          value: entry["2010-02-28"] === "NA" ? 0 : entry["2010-02-28"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2010-03-31"),
          value: entry["2010-03-31"] === "NA" ? 0 : entry["2010-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2010-04-30"),
          value: entry["2010-04-30"] === "NA" ? 0 : entry["2010-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2010-05-31"),
          value: entry["2010-05-31"] === "NA" ? 0 : entry["2010-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2010-06-30"),
          value: entry["2010-06-30"] === "NA" ? 0 : entry["2010-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2010-07-31"),
          value: entry["2010-07-31"] === "NA" ? 0 : entry["2010-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2010-08-31"),
          value: entry["2010-08-31"] === "NA" ? 0 : entry["2010-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2010-09-30"),
          value: entry["2010-09-30"] === "NA" ? 0 : entry["2010-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2010-10-31"),
          value: entry["2010-10-31"] === "NA" ? 0 : entry["2010-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2010-11-30"),
          value: entry["2010-11-30"] === "NA" ? 0 : entry["2010-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2010-12-31"),
          value: entry["2010-12-31"] === "NA" ? 0 : entry["2010-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2011-01-31"),
          value: entry["2011-01-31"] === "NA" ? 0 : entry["2011-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2011-02-28"),
          value: entry["2011-02-28"] === "NA" ? 0 : entry["2011-02-28"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2011-03-31"),
          value: entry["2011-03-31"] === "NA" ? 0 : entry["2011-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2011-04-30"),
          value: entry["2011-04-30"] === "NA" ? 0 : entry["2011-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2011-05-31"),
          value: entry["2011-05-31"] === "NA" ? 0 : entry["2011-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2011-06-30"),
          value: entry["2011-06-30"] === "NA" ? 0 : entry["2011-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2011-07-31"),
          value: entry["2011-07-31"] === "NA" ? 0 : entry["2011-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2011-08-31"),
          value: entry["2011-08-31"] === "NA" ? 0 : entry["2011-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2011-09-30"),
          value: entry["2011-09-30"] === "NA" ? 0 : entry["2011-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2011-10-31"),
          value: entry["2011-10-31"] === "NA" ? 0 : entry["2011-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2011-11-30"),
          value: entry["2011-11-30"] === "NA" ? 0 : entry["2011-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2011-12-31"),
          value: entry["2011-12-31"] === "NA" ? 0 : entry["2011-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2012-01-31"),
          value: entry["2012-01-31"] === "NA" ? 0 : entry["2012-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2012-02-29"),
          value: entry["2012-02-29"] === "NA" ? 0 : entry["2012-02-29"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2012-03-31"),
          value: entry["2012-03-31"] === "NA" ? 0 : entry["2012-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2012-04-30"),
          value: entry["2012-04-30"] === "NA" ? 0 : entry["2012-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2012-05-31"),
          value: entry["2012-05-31"] === "NA" ? 0 : entry["2012-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2012-06-30"),
          value: entry["2012-06-30"] === "NA" ? 0 : entry["2012-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2012-07-31"),
          value: entry["2012-07-31"] === "NA" ? 0 : entry["2012-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2012-08-31"),
          value: entry["2012-08-31"] === "NA" ? 0 : entry["2012-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2012-09-30"),
          value: entry["2012-09-30"] === "NA" ? 0 : entry["2012-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2012-10-31"),
          value: entry["2012-10-31"] === "NA" ? 0 : entry["2012-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2012-11-30"),
          value: entry["2012-11-30"] === "NA" ? 0 : entry["2012-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2012-12-31"),
          value: entry["2012-12-31"] === "NA" ? 0 : entry["2012-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2013-01-31"),
          value: entry["2013-01-31"] === "NA" ? 0 : entry["2013-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2013-02-28"),
          value: entry["2013-02-28"] === "NA" ? 0 : entry["2013-02-28"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2013-03-31"),
          value: entry["2013-03-31"] === "NA" ? 0 : entry["2013-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2013-04-30"),
          value: entry["2013-04-30"] === "NA" ? 0 : entry["2013-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2013-05-31"),
          value: entry["2013-05-31"] === "NA" ? 0 : entry["2013-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2013-06-30"),
          value: entry["2013-06-30"] === "NA" ? 0 : entry["2013-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2013-07-31"),
          value: entry["2013-07-31"] === "NA" ? 0 : entry["2013-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2013-08-31"),
          value: entry["2013-08-31"] === "NA" ? 0 : entry["2013-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2013-09-30"),
          value: entry["2013-09-30"] === "NA" ? 0 : entry["2013-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2013-10-31"),
          value: entry["2013-10-31"] === "NA" ? 0 : entry["2013-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2013-11-30"),
          value: entry["2013-11-30"] === "NA" ? 0 : entry["2013-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2013-12-31"),
          value: entry["2013-12-31"] === "NA" ? 0 : entry["2013-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2014-01-31"),
          value: entry["2014-01-31"] === "NA" ? 0 : entry["2014-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2014-02-28"),
          value: entry["2014-02-28"] === "NA" ? 0 : entry["2014-02-28"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2014-03-31"),
          value: entry["2014-03-31"] === "NA" ? 0 : entry["2014-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2014-04-30"),
          value: entry["2014-04-30"] === "NA" ? 0 : entry["2014-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2014-05-31"),
          value: entry["2014-05-31"] === "NA" ? 0 : entry["2014-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2014-06-30"),
          value: entry["2014-06-30"] === "NA" ? 0 : entry["2014-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2014-07-31"),
          value: entry["2014-07-31"] === "NA" ? 0 : entry["2014-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2014-08-31"),
          value: entry["2014-08-31"] === "NA" ? 0 : entry["2014-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2014-09-30"),
          value: entry["2014-09-30"] === "NA" ? 0 : entry["2014-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2014-10-31"),
          value: entry["2014-10-31"] === "NA" ? 0 : entry["2014-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2014-11-30"),
          value: entry["2014-11-30"] === "NA" ? 0 : entry["2014-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2014-12-31"),
          value: entry["2014-12-31"] === "NA" ? 0 : entry["2014-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2015-01-31"),
          value: entry["2015-01-31"] === "NA" ? 0 : entry["2015-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2015-02-28"),
          value: entry["2015-02-28"] === "NA" ? 0 : entry["2015-02-28"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2015-03-31"),
          value: entry["2015-03-31"] === "NA" ? 0 : entry["2015-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2015-04-30"),
          value: entry["2015-04-30"] === "NA" ? 0 : entry["2015-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2015-05-31"),
          value: entry["2015-05-31"] === "NA" ? 0 : entry["2015-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2015-06-30"),
          value: entry["2015-06-30"] === "NA" ? 0 : entry["2015-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2015-07-31"),
          value: entry["2015-07-31"] === "NA" ? 0 : entry["2015-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2015-08-31"),
          value: entry["2015-08-31"] === "NA" ? 0 : entry["2015-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2015-09-30"),
          value: entry["2015-09-30"] === "NA" ? 0 : entry["2015-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2015-10-31"),
          value: entry["2015-10-31"] === "NA" ? 0 : entry["2015-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2015-11-30"),
          value: entry["2015-11-30"] === "NA" ? 0 : entry["2015-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2015-12-31"),
          value: entry["2015-12-31"] === "NA" ? 0 : entry["2015-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2016-01-31"),
          value: entry["2016-01-31"] === "NA" ? 0 : entry["2016-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2016-02-29"),
          value: entry["2016-02-29"] === "NA" ? 0 : entry["2016-02-29"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2016-03-31"),
          value: entry["2016-03-31"] === "NA" ? 0 : entry["2016-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2016-04-30"),
          value: entry["2016-04-30"] === "NA" ? 0 : entry["2016-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2016-05-31"),
          value: entry["2016-05-31"] === "NA" ? 0 : entry["2016-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2016-06-30"),
          value: entry["2016-06-30"] === "NA" ? 0 : entry["2016-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2016-07-31"),
          value: entry["2016-07-31"] === "NA" ? 0 : entry["2016-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2016-08-31"),
          value: entry["2016-08-31"] === "NA" ? 0 : entry["2016-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2016-09-30"),
          value: entry["2016-09-30"] === "NA" ? 0 : entry["2016-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2016-10-31"),
          value: entry["2016-10-31"] === "NA" ? 0 : entry["2016-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2016-11-30"),
          value: entry["2016-11-30"] === "NA" ? 0 : entry["2016-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2016-12-31"),
          value: entry["2016-12-31"] === "NA" ? 0 : entry["2016-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2017-01-31"),
          value: entry["2017-01-31"] === "NA" ? 0 : entry["2017-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2017-02-28"),
          value: entry["2017-02-28"] === "NA" ? 0 : entry["2017-02-28"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2017-03-31"),
          value: entry["2017-03-31"] === "NA" ? 0 : entry["2017-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2017-04-30"),
          value: entry["2017-04-30"] === "NA" ? 0 : entry["2017-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2017-05-31"),
          value: entry["2017-05-31"] === "NA" ? 0 : entry["2017-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2017-06-30"),
          value: entry["2017-06-30"] === "NA" ? 0 : entry["2017-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2017-07-31"),
          value: entry["2017-07-31"] === "NA" ? 0 : entry["2017-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2017-08-31"),
          value: entry["2017-08-31"] === "NA" ? 0 : entry["2017-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2017-09-30"),
          value: entry["2017-09-30"] === "NA" ? 0 : entry["2017-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2017-10-31"),
          value: entry["2017-10-31"] === "NA" ? 0 : entry["2017-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2017-11-30"),
          value: entry["2017-11-30"] === "NA" ? 0 : entry["2017-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2017-12-31"),
          value: entry["2017-12-31"] === "NA" ? 0 : entry["2017-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2018-01-31"),
          value: entry["2018-01-31"] === "NA" ? 0 : entry["2018-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2018-02-28"),
          value: entry["2018-02-28"] === "NA" ? 0 : entry["2018-02-28"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2018-03-31"),
          value: entry["2018-03-31"] === "NA" ? 0 : entry["2018-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2018-04-30"),
          value: entry["2018-04-30"] === "NA" ? 0 : entry["2018-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2018-05-31"),
          value: entry["2018-05-31"] === "NA" ? 0 : entry["2018-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2018-06-30"),
          value: entry["2018-06-30"] === "NA" ? 0 : entry["2018-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2018-07-31"),
          value: entry["2018-07-31"] === "NA" ? 0 : entry["2018-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2018-08-31"),
          value: entry["2018-08-31"] === "NA" ? 0 : entry["2018-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2018-09-30"),
          value: entry["2018-09-30"] === "NA" ? 0 : entry["2018-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2018-10-31"),
          value: entry["2018-10-31"] === "NA" ? 0 : entry["2018-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2018-11-30"),
          value: entry["2018-11-30"] === "NA" ? 0 : entry["2018-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2018-12-31"),
          value: entry["2018-12-31"] === "NA" ? 0 : entry["2018-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2019-01-31"),
          value: entry["2019-01-31"] === "NA" ? 0 : entry["2019-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2019-02-28"),
          value: entry["2019-02-28"] === "NA" ? 0 : entry["2019-02-28"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2019-03-31"),
          value: entry["2019-03-31"] === "NA" ? 0 : entry["2019-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2019-04-30"),
          value: entry["2019-04-30"] === "NA" ? 0 : entry["2019-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2019-05-31"),
          value: entry["2019-05-31"] === "NA" ? 0 : entry["2019-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2019-06-30"),
          value: entry["2019-06-30"] === "NA" ? 0 : entry["2019-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2019-07-31"),
          value: entry["2019-07-31"] === "NA" ? 0 : entry["2019-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2019-08-31"),
          value: entry["2019-08-31"] === "NA" ? 0 : entry["2019-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2019-09-30"),
          value: entry["2019-09-30"] === "NA" ? 0 : entry["2019-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2019-10-31"),
          value: entry["2019-10-31"] === "NA" ? 0 : entry["2019-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2019-11-30"),
          value: entry["2019-11-30"] === "NA" ? 0 : entry["2019-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2019-12-31"),
          value: entry["2019-12-31"] === "NA" ? 0 : entry["2019-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2020-01-31"),
          value: entry["2020-01-31"] === "NA" ? 0 : entry["2020-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2020-02-29"),
          value: entry["2020-02-29"] === "NA" ? 0 : entry["2020-02-29"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2020-03-31"),
          value: entry["2020-03-31"] === "NA" ? 0 : entry["2020-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2020-04-30"),
          value: entry["2020-04-30"] === "NA" ? 0 : entry["2020-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2020-05-31"),
          value: entry["2020-05-31"] === "NA" ? 0 : entry["2020-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2020-06-30"),
          value: entry["2020-06-30"] === "NA" ? 0 : entry["2020-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2020-07-31"),
          value: entry["2020-07-31"] === "NA" ? 0 : entry["2020-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2020-08-31"),
          value: entry["2020-08-31"] === "NA" ? 0 : entry["2020-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2020-09-30"),
          value: entry["2020-09-30"] === "NA" ? 0 : entry["2020-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2020-10-31"),
          value: entry["2020-10-31"] === "NA" ? 0 : entry["2020-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2020-11-30"),
          value: entry["2020-11-30"] === "NA" ? 0 : entry["2020-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2020-12-31"),
          value: entry["2020-12-31"] === "NA" ? 0 : entry["2020-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2021-01-31"),
          value: entry["2021-01-31"] === "NA" ? 0 : entry["2021-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2021-02-28"),
          value: entry["2021-02-28"] === "NA" ? 0 : entry["2021-02-28"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2021-03-31"),
          value: entry["2021-03-31"] === "NA" ? 0 : entry["2021-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2021-04-30"),
          value: entry["2021-04-30"] === "NA" ? 0 : entry["2021-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2021-05-31"),
          value: entry["2021-05-31"] === "NA" ? 0 : entry["2021-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2021-06-30"),
          value: entry["2021-06-30"] === "NA" ? 0 : entry["2021-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2021-07-31"),
          value: entry["2021-07-31"] === "NA" ? 0 : entry["2021-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2021-08-31"),
          value: entry["2021-08-31"] === "NA" ? 0 : entry["2021-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2021-09-30"),
          value: entry["2021-09-30"] === "NA" ? 0 : entry["2021-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2021-10-31"),
          value: entry["2021-10-31"] === "NA" ? 0 : entry["2021-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2021-11-30"),
          value: entry["2021-11-30"] === "NA" ? 0 : entry["2021-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2021-12-31"),
          value: entry["2021-12-31"] === "NA" ? 0 : entry["2021-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2022-01-31"),
          value: entry["2022-01-31"] === "NA" ? 0 : entry["2022-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2022-02-28"),
          value: entry["2022-02-28"] === "NA" ? 0 : entry["2022-02-28"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2022-03-31"),
          value: entry["2022-03-31"] === "NA" ? 0 : entry["2022-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2022-04-30"),
          value: entry["2022-04-30"] === "NA" ? 0 : entry["2022-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2022-05-31"),
          value: entry["2022-05-31"] === "NA" ? 0 : entry["2022-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2022-06-30"),
          value: entry["2022-06-30"] === "NA" ? 0 : entry["2022-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2022-07-31"),
          value: entry["2022-07-31"] === "NA" ? 0 : entry["2022-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2022-08-31"),
          value: entry["2022-08-31"] === "NA" ? 0 : entry["2022-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2022-09-30"),
          value: entry["2022-09-30"] === "NA" ? 0 : entry["2022-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2022-10-31"),
          value: entry["2022-10-31"] === "NA" ? 0 : entry["2022-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2022-11-30"),
          value: entry["2022-11-30"] === "NA" ? 0 : entry["2022-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2022-12-31"),
          value: entry["2022-12-31"] === "NA" ? 0 : entry["2022-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2023-01-31"),
          value: entry["2023-01-31"] === "NA" ? 0 : entry["2023-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2023-02-28"),
          value: entry["2023-02-28"] === "NA" ? 0 : entry["2023-02-28"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2023-03-31"),
          value: entry["2023-03-31"] === "NA" ? 0 : entry["2023-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2023-04-30"),
          value: entry["2023-04-30"] === "NA" ? 0 : entry["2023-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2023-05-31"),
          value: entry["2023-05-31"] === "NA" ? 0 : entry["2023-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2023-06-30"),
          value: entry["2023-06-30"] === "NA" ? 0 : entry["2023-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2023-07-31"),
          value: entry["2023-07-31"] === "NA" ? 0 : entry["2023-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2023-08-31"),
          value: entry["2023-08-31"] === "NA" ? 0 : entry["2023-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2023-09-30"),
          value: entry["2023-09-30"] === "NA" ? 0 : entry["2023-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2023-10-31"),
          value: entry["2023-10-31"] === "NA" ? 0 : entry["2023-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2023-11-30"),
          value: entry["2023-11-30"] === "NA" ? 0 : entry["2023-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2023-12-31"),
          value: entry["2023-12-31"] === "NA" ? 0 : entry["2023-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2024-01-31"),
          value: entry["2024-01-31"] === "NA" ? 0 : entry["2024-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2024-02-29"),
          value: entry["2024-02-29"] === "NA" ? 0 : entry["2024-02-29"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2024-03-31"),
          value: entry["2024-03-31"] === "NA" ? 0 : entry["2024-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2024-04-30"),
          value: entry["2024-04-30"] === "NA" ? 0 : entry["2024-04-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2024-05-31"),
          value: entry["2024-05-31"] === "NA" ? 0 : entry["2024-05-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2024-06-30"),
          value: entry["2024-06-30"] === "NA" ? 0 : entry["2024-06-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2024-07-31"),
          value: entry["2024-07-31"] === "NA" ? 0 : entry["2024-07-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2024-08-31"),
          value: entry["2024-08-31"] === "NA" ? 0 : entry["2024-08-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2024-09-30"),
          value: entry["2024-09-30"] === "NA" ? 0 : entry["2024-09-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2024-10-31"),
          value: entry["2024-10-31"] === "NA" ? 0 : entry["2024-10-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2024-11-30"),
          value: entry["2024-11-30"] === "NA" ? 0 : entry["2024-11-30"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2024-12-31"),
          value: entry["2024-12-31"] === "NA" ? 0 : entry["2024-12-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2025-01-31"),
          value: entry["2025-01-31"] === "NA" ? 0 : entry["2025-01-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2025-02-28"),
          value: entry["2025-02-28"] === "NA" ? 0 : entry["2025-02-28"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2025-03-31"),
          value: entry["2025-03-31"] === "NA" ? 0 : entry["2025-03-31"],
        },
        {
          date: d3.timeParse("%Y-%m-%d")("2025-04-30"),
          value: entry["2025-04-30"] === "NA" ? 0 : entry["2025-04-30"],
        },
      ],
    };
  });
}

// const sidebar = document.getElementById("sidebar");

const resizeObserver = new ResizeObserver(() => {
  if (selectedCountyName && countyPriceData[selectedCountyName]) {
    const rawRow = countyPriceData[selectedCountyName];
    const rawData = Object.entries(rawRow).map(([key, value]) => ({
      key,
      value,
    }));
    drawLineChart(rawData, selectedCountyName);
  }
});

resizeObserver.observe(sidebar);

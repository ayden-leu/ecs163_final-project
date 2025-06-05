let style = {};

const citiesJSON = "data/CA_CITIES.json";
const countiesJSON = "data/FILTERED_COUNTY_LINES.json";
const firesJSON = "data/FILTERED_BIG_FIRES.json";

const countiesCSV = "data/CA_counties.csv";
const citiesCSV = "data/ZILLOW_DATA_CITIES.csv";

let countyPriceData = {};
let cityPriceData = {};
let selectedCountyName = null;
let selectedCityName = null;


let lineGraphPriceData = null;
let lineGraphPriceDataDates = [];
let lineGraphObj = null;
let countyGraphPriceData = [];
let cityGraphPriceData = [];
let cityGraphPriceDataDates = [];
let countyGraphPriceDataDates = [];

// credit for delay function:
// https://stackoverflow.com/questions/14226803/wait-5-seconds-before-executing-next-line
const delay = ms => new Promise(res => setTimeout(res, ms));

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
console.log("📦 Sidebar element:", sidebar);
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
  }
  // May not need below/may not work
  else if(countyNameHeader && cityPriceData[countyNameHeader]) {
    const rawRow = cityPriceData[countyNameHeader];
    const rawData = Object.entries(rawRow).map(([key, value]) => ({
      key,
      value,
    }));
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
  d3.csv(citiesCSV, d3.autoType),
]).then(([cityGeo, countyGeo, fireGeo, countyCSV, cityCSV]) => {
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
        name: d.properties.CITY,
        type: "city",
        feature: d,
      })),
    ];

    const matches = allNames
      .filter((d) => d.name && d.name.toLowerCase().includes(query))
      .slice(0, 5);

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
  //console.log("Housing data loaded:", countyCSV);

  // Process housing data and assign it to a global or scoped variable
  const countyPriceData = {};
  const cityPriceData = {};

    countyCSV.forEach(row => {
        const cleanedCounty = row.RegionName.replace(" County", "");
        const prices = [];

        for (const key in row) {
            if (key.startsWith("X")) {
                prices.push({
                    date: key.slice(1), // e.g., "2000.01.31"
                    price: +row[key] || null
                });
            }
        }

    countyPriceData[cleanedCounty] = prices;
  });

  cityCSV.forEach((row) => {
    const cleanedCity = row.RegionName;
    const prices = [];
    for (const key in row) {
      if (key.startsWith("2")) {
        prices.push({
          date: key, // e.g., "2000-01-31"
          price: +row[key] || null,
        });
      }
    }
    cityPriceData[cleanedCity] = prices;
  });

  initGraphStyling();
  countyGraphPriceData = processCountyData(countyCSV);
  cityGraphPriceData = processCityData(cityCSV);

  countyGraphPriceDataDates = countyGraphPriceData[0].prices.map(p => p.date);
  cityGraphPriceDataDates = cityGraphPriceData[0].prices.map(p => p.date);

  lineGraphPriceData = countyGraphPriceData;
  lineGraphPriceDataDates = countyGraphPriceDataDates;

  // ✅ Initialize the graph once
  lineGraphObj = createLineGraph();

  // ✅ Add slider event listeners
  yearSlider.addEventListener("input", yearSliderEventWrapper);
  yearSlider.addEventListener("click", yearSliderEventWrapper);

  // ✅ (Optional) render initial line graph
  //updateLineGraph("Los Angeles County"); 


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

    const zoom = d3.zoom()
        .scaleExtent([1, 20])
        .on("zoom", (event) => {
            zoomGroup.attr("transform", event.transform);
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
    zoomGroup
        .append("g")
        .selectAll("path.county")
        .data(validCounties)
        .join("path")
        .attr("class", "county")
        .attr("d", path)
        .attr("fill", "#f0f0f0")
        .attr("stroke", "#aaa")
        .attr("stroke-width", 0.2)
        .attr("shape-rendering", "crispEdges")
        .on("click", handleCountyClick);

  // Cities (middle layer)
  cityLayer
    .selectAll("path.city")
    .data(validCities)
    .join("path")
    .attr("class", "city")
    .attr("d", path)
    .on("click", handleCityClick);

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
    .attr("opacity", 0);

  cityLabelLayer
    .selectAll("text")
    .data(validCities)
    .join("text")
    .attr("class", "city-label")
    .attr("transform", (d) => {
      const centroid = path.centroid(d);
      return `translate(${centroid[0]}, ${centroid[1]})`;
    })
    .text((d) => d.properties.CITY)
    .attr("opacity", 0);

    // Sets up the tooltips for the fires, appends the tooltip div to the body and styles it
    const tooltip = d3.select("body")
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

    function drawFiresByYear(year) 
    {
        const filtered = allFires.filter(f => f.properties.YEAR_ === year);

        const firePaths = fireLayer.selectAll("path.fire")
            .data(filtered, d => d.properties.IRWINID || JSON.stringify(d.geometry));

        firePaths.join(
            enter => enter.append("path")
                .attr("class", "fire")
                .attr("d", path)
                .attr("fill", "orange")
                .attr("opacity", 0.5)
                .attr("stroke", "#ff8800")
                .attr("stroke-width", 0.2)

                // Tooltip events below; When mouse goes over a fire, show the tooltip with fire details (name, year, and acreage)
                .on("mouseover", (event, d) => {
                    const props = d.properties;
                    tooltip.style("opacity", 1)
                        .html(`
                            <strong>${props.FIRE_NAME || "Unknown Fire"}</strong><br/>
                            <strong>Year:</strong> ${props.YEAR_ || "N/A"}<br/>
                            <strong>Acres:</strong> ${props.GIS_ACRES?.toLocaleString() || "N/A"}
                        `)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 28) + "px");
                })
                .on("mousemove", (event) => {
                    tooltip.style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 28) + "px");
                })
                .on("mouseout", () => {
                    tooltip.style("opacity", 0);
                }),

            update => update,
            exit => exit.remove()
        );
    }

function handleCountyClick(event, d) {
  
  lineGraphPriceData = countyGraphPriceData;
  lineGraphPriceDataDates = countyGraphPriceDataDates;
  //console.log("Available:", lineGraphPriceData);
  const countyName = d.properties.NAME; // Adjust this if your GeoJSON uses a different field
  selectedCountyName = countyName;
  selectedCityName = null;
  console.log("Clicked county:", countyName);
  d3.selectAll(".county").classed("highlighted", false);

  // Highlight the clicked county
  d3.select(this).classed("highlighted", true);
    const bounds = path.bounds(d);
    const dx = bounds[1][0] - bounds[0][0];
    const dy = bounds[1][1] - bounds[0][1];
    const x = (bounds[0][0] + bounds[1][0]) / 2;
    const y = (bounds[0][1] + bounds[1][1]) / 2;
    const scale = Math.max(1, Math.min(8, 0.9 / Math.max(dx / width, dy / height)));

    const sidebarOffset = 300;
    const translate = [(width - sidebarOffset) / 2 - scale * x, height / 2 - scale * y];

        svg.transition()
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
    const mapContainer = document.getElementById("mapContainer");

    console.log("➡️ Sidebar class list before:", sidebar.classList);

    sidebarContent.style.display = "block";
    document.getElementById("sidebarHeader").innerHTML = d.properties.NAME;

    sidebar.classList.add("visible");
    console.log("✅ Sidebar made visible:", sidebar.classList);
    mainContent.classList.add("with-sidebar");
    //mapContainer.classList.add("with-sidebar");

    // Close logic
    const closeBtn = document.getElementById("closeSidebarButton");
    closeBtn.onclick = () => {
        sidebar.classList.remove("visible");
        mainContent.classList.remove("with-sidebar");
        sidebarContent.style.display = "none";
        mapContainer.classList.remove("with-sidebar");
        selectedCountyName = null;
    };

    //const countyName = d.properties.NAME;
    //selectedCountyName = countyName;

    // Draw the chart (pass raw row object from countyPriceData)
    // if (countyPriceData && countyPriceData[countyName]) {
    //     const rawRow = countyPriceData[countyName];
    //     const rawData = Object.entries(rawRow).map(([key, value]) => ({
    //         key,
    //         value
    //     }));
    //     // drawLineChart(
    //     //     rawData,
    //     //     countyName
    //     // );

    // } else {
    //     console.log("⚠️ No price data found for", countyName);
    // }


    // update main line graph
    //updateLineGraphDomainToAll(props.NAME);
    updateLineGraphDomainToAll(countyName + " County");
}

function handleCityClick(event, d) {
  lineGraphPriceData = cityGraphPriceData;
  lineGraphPriceDataDates = cityGraphPriceDataDates;
  //console.log("Available:", lineGraphPriceData);
  const cityName = d.properties.CITY; // Adjust this if your GeoJSON uses a different field
  selectedCountyName = null;
  selectedCityName = cityName;
  d3.selectAll(".city").classed("highlighted", false);

  // Highlight the clicked county
  d3.select(this).classed("highlighted", true);
  console.log("Clicked county:", cityName);
    const bounds = path.bounds(d);
    const dx = bounds[1][0] - bounds[0][0];
    const dy = bounds[1][1] - bounds[0][1];
    const x = (bounds[0][0] + bounds[1][0]) / 2;
    const y = (bounds[0][1] + bounds[1][1]) / 2;
    const scale = Math.max(1, Math.min(20, 1.5 / Math.max(dx / width, dy / height)));

  const sidebarOffset = 300;
  const translate = [(width - sidebarOffset) / 2 - scale * x, height / 2 - scale * y];

  svg.transition()
    .duration(750)
    .call(
      zoom.transform,
      d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
    );

    const props = d.properties;
    console.log("Clicked city:", props.CITY, "Props: ", props);
    // Set sidebar content
    const sidebar = document.getElementById("sidebar");
    const sidebarContent = document.getElementById("sidebarContent");
    const mainContent = document.getElementById("mainContent");

    sidebarContent.style.display = "block";
    document.getElementById("sidebarHeader").innerHTML = d.properties.CITY;

    sidebar.classList.add("visible");
    console.log("✅ Sidebar made visible:", sidebar.classList);
    mainContent.classList.add("with-sidebar");

    // Close logic
    const closeBtn = document.getElementById("closeSidebarButton");
    closeBtn.onclick = () => {
        sidebar.classList.remove("visible");
        mainContent.classList.remove("with-sidebar");
        sidebarContent.style.display = "none";
        selectedCityName = null;
    };

    //const countyName = d.properties.NAME;
    //selectedCountyName = cityName;

    // Draw the chart (pass raw row object from countyPriceData)
    // if (countyPriceData && countyPriceData[countyName]) {
    //     const rawRow = countyPriceData[countyName];
    //     const rawData = Object.entries(rawRow).map(([key, value]) => ({
    //         key,
    //         value
    //     }));
    //     // drawLineChart(
    //     //     rawData,
    //     //     countyName
    //     // );

    // } else {
    //     console.log("⚠️ No price data found for", countyName);
    // }


    // update main line graph
    //updateLineGraphDomainToAll(props.NAME);
    updateLineGraphDomainToAll(cityName);
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
const debugStyle = "" //"outline: 1px solid black"

function processCountyData(rawData){
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

    return rawData.map(entry => {
        return {
            id: Number(entry.RegionID),
            rank: entry.SizeRank,
            name: entry.RegionName,
            // metro: entry.Metro,
            //county: entry.CountyName,
            prices: [
                {date: d3.timeParse("%Y-%m-%d")("2000-01-31"), value: entry["2000-01-31"] === "NA"? 0 : entry["2000-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2000-02-29"), value: entry["2000-02-29"] === "NA"? 0 : entry["2000-02-29"]},
                {date: d3.timeParse("%Y-%m-%d")("2000-03-31"), value: entry["2000-03-31"] === "NA"? 0 : entry["2000-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2000-04-30"), value: entry["2000-04-30"] === "NA"? 0 : entry["2000-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2000-05-31"), value: entry["2000-05-31"] === "NA"? 0 : entry["2000-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2000-06-30"), value: entry["2000-06-30"] === "NA"? 0 : entry["2000-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2000-07-31"), value: entry["2000-07-31"] === "NA"? 0 : entry["2000-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2000-08-31"), value: entry["2000-08-31"] === "NA"? 0 : entry["2000-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2000-09-30"), value: entry["2000-09-30"] === "NA"? 0 : entry["2000-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2000-10-31"), value: entry["2000-10-31"] === "NA"? 0 : entry["2000-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2000-11-30"), value: entry["2000-11-30"] === "NA"? 0 : entry["2000-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2000-12-31"), value: entry["2000-12-31"] === "NA"? 0 : entry["2000-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2001-01-31"), value: entry["2001-01-31"] === "NA"? 0 : entry["2001-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2001-02-28"), value: entry["2001-02-28"] === "NA"? 0 : entry["2001-02-28"]},
                {date: d3.timeParse("%Y-%m-%d")("2001-03-31"), value: entry["2001-03-31"] === "NA"? 0 : entry["2001-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2001-04-30"), value: entry["2001-04-30"] === "NA"? 0 : entry["2001-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2001-05-31"), value: entry["2001-05-31"] === "NA"? 0 : entry["2001-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2001-06-30"), value: entry["2001-06-30"] === "NA"? 0 : entry["2001-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2001-07-31"), value: entry["2001-07-31"] === "NA"? 0 : entry["2001-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2001-08-31"), value: entry["2001-08-31"] === "NA"? 0 : entry["2001-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2001-09-30"), value: entry["2001-09-30"] === "NA"? 0 : entry["2001-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2001-10-31"), value: entry["2001-10-31"] === "NA"? 0 : entry["2001-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2001-11-30"), value: entry["2001-11-30"] === "NA"? 0 : entry["2001-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2001-12-31"), value: entry["2001-12-31"] === "NA"? 0 : entry["2001-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2002-01-31"), value: entry["2002-01-31"] === "NA"? 0 : entry["2002-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2002-02-28"), value: entry["2002-02-28"] === "NA"? 0 : entry["2002-02-28"]},
                {date: d3.timeParse("%Y-%m-%d")("2002-03-31"), value: entry["2002-03-31"] === "NA"? 0 : entry["2002-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2002-04-30"), value: entry["2002-04-30"] === "NA"? 0 : entry["2002-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2002-05-31"), value: entry["2002-05-31"] === "NA"? 0 : entry["2002-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2002-06-30"), value: entry["2002-06-30"] === "NA"? 0 : entry["2002-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2002-07-31"), value: entry["2002-07-31"] === "NA"? 0 : entry["2002-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2002-08-31"), value: entry["2002-08-31"] === "NA"? 0 : entry["2002-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2002-09-30"), value: entry["2002-09-30"] === "NA"? 0 : entry["2002-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2002-10-31"), value: entry["2002-10-31"] === "NA"? 0 : entry["2002-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2002-11-30"), value: entry["2002-11-30"] === "NA"? 0 : entry["2002-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2002-12-31"), value: entry["2002-12-31"] === "NA"? 0 : entry["2002-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2003-01-31"), value: entry["2003-01-31"] === "NA"? 0 : entry["2003-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2003-02-28"), value: entry["2003-02-28"] === "NA"? 0 : entry["2003-02-28"]},
                {date: d3.timeParse("%Y-%m-%d")("2003-03-31"), value: entry["2003-03-31"] === "NA"? 0 : entry["2003-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2003-04-30"), value: entry["2003-04-30"] === "NA"? 0 : entry["2003-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2003-05-31"), value: entry["2003-05-31"] === "NA"? 0 : entry["2003-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2003-06-30"), value: entry["2003-06-30"] === "NA"? 0 : entry["2003-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2003-07-31"), value: entry["2003-07-31"] === "NA"? 0 : entry["2003-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2003-08-31"), value: entry["2003-08-31"] === "NA"? 0 : entry["2003-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2003-09-30"), value: entry["2003-09-30"] === "NA"? 0 : entry["2003-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2003-10-31"), value: entry["2003-10-31"] === "NA"? 0 : entry["2003-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2003-11-30"), value: entry["2003-11-30"] === "NA"? 0 : entry["2003-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2003-12-31"), value: entry["2003-12-31"] === "NA"? 0 : entry["2003-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2004-01-31"), value: entry["2004-01-31"] === "NA"? 0 : entry["2004-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2004-02-29"), value: entry["2004-02-29"] === "NA"? 0 : entry["2004-02-29"]},
                {date: d3.timeParse("%Y-%m-%d")("2004-03-31"), value: entry["2004-03-31"] === "NA"? 0 : entry["2004-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2004-04-30"), value: entry["2004-04-30"] === "NA"? 0 : entry["2004-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2004-05-31"), value: entry["2004-05-31"] === "NA"? 0 : entry["2004-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2004-06-30"), value: entry["2004-06-30"] === "NA"? 0 : entry["2004-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2004-07-31"), value: entry["2004-07-31"] === "NA"? 0 : entry["2004-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2004-08-31"), value: entry["2004-08-31"] === "NA"? 0 : entry["2004-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2004-09-30"), value: entry["2004-09-30"] === "NA"? 0 : entry["2004-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2004-10-31"), value: entry["2004-10-31"] === "NA"? 0 : entry["2004-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2004-11-30"), value: entry["2004-11-30"] === "NA"? 0 : entry["2004-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2004-12-31"), value: entry["2004-12-31"] === "NA"? 0 : entry["2004-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2005-01-31"), value: entry["2005-01-31"] === "NA"? 0 : entry["2005-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2005-02-28"), value: entry["2005-02-28"] === "NA"? 0 : entry["2005-02-28"]},
                {date: d3.timeParse("%Y-%m-%d")("2005-03-31"), value: entry["2005-03-31"] === "NA"? 0 : entry["2005-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2005-04-30"), value: entry["2005-04-30"] === "NA"? 0 : entry["2005-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2005-05-31"), value: entry["2005-05-31"] === "NA"? 0 : entry["2005-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2005-06-30"), value: entry["2005-06-30"] === "NA"? 0 : entry["2005-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2005-07-31"), value: entry["2005-07-31"] === "NA"? 0 : entry["2005-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2005-08-31"), value: entry["2005-08-31"] === "NA"? 0 : entry["2005-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2005-09-30"), value: entry["2005-09-30"] === "NA"? 0 : entry["2005-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2005-10-31"), value: entry["2005-10-31"] === "NA"? 0 : entry["2005-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2005-11-30"), value: entry["2005-11-30"] === "NA"? 0 : entry["2005-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2005-12-31"), value: entry["2005-12-31"] === "NA"? 0 : entry["2005-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2006-01-31"), value: entry["2006-01-31"] === "NA"? 0 : entry["2006-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2006-02-28"), value: entry["2006-02-28"] === "NA"? 0 : entry["2006-02-28"]},
                {date: d3.timeParse("%Y-%m-%d")("2006-03-31"), value: entry["2006-03-31"] === "NA"? 0 : entry["2006-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2006-04-30"), value: entry["2006-04-30"] === "NA"? 0 : entry["2006-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2006-05-31"), value: entry["2006-05-31"] === "NA"? 0 : entry["2006-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2006-06-30"), value: entry["2006-06-30"] === "NA"? 0 : entry["2006-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2006-07-31"), value: entry["2006-07-31"] === "NA"? 0 : entry["2006-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2006-08-31"), value: entry["2006-08-31"] === "NA"? 0 : entry["2006-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2006-09-30"), value: entry["2006-09-30"] === "NA"? 0 : entry["2006-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2006-10-31"), value: entry["2006-10-31"] === "NA"? 0 : entry["2006-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2006-11-30"), value: entry["2006-11-30"] === "NA"? 0 : entry["2006-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2006-12-31"), value: entry["2006-12-31"] === "NA"? 0 : entry["2006-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2007-01-31"), value: entry["2007-01-31"] === "NA"? 0 : entry["2007-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2007-02-28"), value: entry["2007-02-28"] === "NA"? 0 : entry["2007-02-28"]},
                {date: d3.timeParse("%Y-%m-%d")("2007-03-31"), value: entry["2007-03-31"] === "NA"? 0 : entry["2007-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2007-04-30"), value: entry["2007-04-30"] === "NA"? 0 : entry["2007-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2007-05-31"), value: entry["2007-05-31"] === "NA"? 0 : entry["2007-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2007-06-30"), value: entry["2007-06-30"] === "NA"? 0 : entry["2007-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2007-07-31"), value: entry["2007-07-31"] === "NA"? 0 : entry["2007-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2007-08-31"), value: entry["2007-08-31"] === "NA"? 0 : entry["2007-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2007-09-30"), value: entry["2007-09-30"] === "NA"? 0 : entry["2007-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2007-10-31"), value: entry["2007-10-31"] === "NA"? 0 : entry["2007-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2007-11-30"), value: entry["2007-11-30"] === "NA"? 0 : entry["2007-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2007-12-31"), value: entry["2007-12-31"] === "NA"? 0 : entry["2007-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2008-01-31"), value: entry["2008-01-31"] === "NA"? 0 : entry["2008-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2008-02-29"), value: entry["2008-02-29"] === "NA"? 0 : entry["2008-02-29"]},
                {date: d3.timeParse("%Y-%m-%d")("2008-03-31"), value: entry["2008-03-31"] === "NA"? 0 : entry["2008-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2008-04-30"), value: entry["2008-04-30"] === "NA"? 0 : entry["2008-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2008-05-31"), value: entry["2008-05-31"] === "NA"? 0 : entry["2008-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2008-06-30"), value: entry["2008-06-30"] === "NA"? 0 : entry["2008-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2008-07-31"), value: entry["2008-07-31"] === "NA"? 0 : entry["2008-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2008-08-31"), value: entry["2008-08-31"] === "NA"? 0 : entry["2008-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2008-09-30"), value: entry["2008-09-30"] === "NA"? 0 : entry["2008-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2008-10-31"), value: entry["2008-10-31"] === "NA"? 0 : entry["2008-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2008-11-30"), value: entry["2008-11-30"] === "NA"? 0 : entry["2008-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2008-12-31"), value: entry["2008-12-31"] === "NA"? 0 : entry["2008-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2009-01-31"), value: entry["2009-01-31"] === "NA"? 0 : entry["2009-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2009-02-28"), value: entry["2009-02-28"] === "NA"? 0 : entry["2009-02-28"]},
                {date: d3.timeParse("%Y-%m-%d")("2009-03-31"), value: entry["2009-03-31"] === "NA"? 0 : entry["2009-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2009-04-30"), value: entry["2009-04-30"] === "NA"? 0 : entry["2009-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2009-05-31"), value: entry["2009-05-31"] === "NA"? 0 : entry["2009-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2009-06-30"), value: entry["2009-06-30"] === "NA"? 0 : entry["2009-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2009-07-31"), value: entry["2009-07-31"] === "NA"? 0 : entry["2009-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2009-08-31"), value: entry["2009-08-31"] === "NA"? 0 : entry["2009-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2009-09-30"), value: entry["2009-09-30"] === "NA"? 0 : entry["2009-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2009-10-31"), value: entry["2009-10-31"] === "NA"? 0 : entry["2009-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2009-11-30"), value: entry["2009-11-30"] === "NA"? 0 : entry["2009-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2009-12-31"), value: entry["2009-12-31"] === "NA"? 0 : entry["2009-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2010-01-31"), value: entry["2010-01-31"] === "NA"? 0 : entry["2010-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2010-02-28"), value: entry["2010-02-28"] === "NA"? 0 : entry["2010-02-28"]},
                {date: d3.timeParse("%Y-%m-%d")("2010-03-31"), value: entry["2010-03-31"] === "NA"? 0 : entry["2010-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2010-04-30"), value: entry["2010-04-30"] === "NA"? 0 : entry["2010-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2010-05-31"), value: entry["2010-05-31"] === "NA"? 0 : entry["2010-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2010-06-30"), value: entry["2010-06-30"] === "NA"? 0 : entry["2010-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2010-07-31"), value: entry["2010-07-31"] === "NA"? 0 : entry["2010-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2010-08-31"), value: entry["2010-08-31"] === "NA"? 0 : entry["2010-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2010-09-30"), value: entry["2010-09-30"] === "NA"? 0 : entry["2010-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2010-10-31"), value: entry["2010-10-31"] === "NA"? 0 : entry["2010-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2010-11-30"), value: entry["2010-11-30"] === "NA"? 0 : entry["2010-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2010-12-31"), value: entry["2010-12-31"] === "NA"? 0 : entry["2010-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2011-01-31"), value: entry["2011-01-31"] === "NA"? 0 : entry["2011-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2011-02-28"), value: entry["2011-02-28"] === "NA"? 0 : entry["2011-02-28"]},
                {date: d3.timeParse("%Y-%m-%d")("2011-03-31"), value: entry["2011-03-31"] === "NA"? 0 : entry["2011-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2011-04-30"), value: entry["2011-04-30"] === "NA"? 0 : entry["2011-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2011-05-31"), value: entry["2011-05-31"] === "NA"? 0 : entry["2011-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2011-06-30"), value: entry["2011-06-30"] === "NA"? 0 : entry["2011-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2011-07-31"), value: entry["2011-07-31"] === "NA"? 0 : entry["2011-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2011-08-31"), value: entry["2011-08-31"] === "NA"? 0 : entry["2011-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2011-09-30"), value: entry["2011-09-30"] === "NA"? 0 : entry["2011-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2011-10-31"), value: entry["2011-10-31"] === "NA"? 0 : entry["2011-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2011-11-30"), value: entry["2011-11-30"] === "NA"? 0 : entry["2011-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2011-12-31"), value: entry["2011-12-31"] === "NA"? 0 : entry["2011-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2012-01-31"), value: entry["2012-01-31"] === "NA"? 0 : entry["2012-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2012-02-29"), value: entry["2012-02-29"] === "NA"? 0 : entry["2012-02-29"]},
                {date: d3.timeParse("%Y-%m-%d")("2012-03-31"), value: entry["2012-03-31"] === "NA"? 0 : entry["2012-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2012-04-30"), value: entry["2012-04-30"] === "NA"? 0 : entry["2012-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2012-05-31"), value: entry["2012-05-31"] === "NA"? 0 : entry["2012-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2012-06-30"), value: entry["2012-06-30"] === "NA"? 0 : entry["2012-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2012-07-31"), value: entry["2012-07-31"] === "NA"? 0 : entry["2012-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2012-08-31"), value: entry["2012-08-31"] === "NA"? 0 : entry["2012-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2012-09-30"), value: entry["2012-09-30"] === "NA"? 0 : entry["2012-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2012-10-31"), value: entry["2012-10-31"] === "NA"? 0 : entry["2012-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2012-11-30"), value: entry["2012-11-30"] === "NA"? 0 : entry["2012-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2012-12-31"), value: entry["2012-12-31"] === "NA"? 0 : entry["2012-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2013-01-31"), value: entry["2013-01-31"] === "NA"? 0 : entry["2013-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2013-02-28"), value: entry["2013-02-28"] === "NA"? 0 : entry["2013-02-28"]},
                {date: d3.timeParse("%Y-%m-%d")("2013-03-31"), value: entry["2013-03-31"] === "NA"? 0 : entry["2013-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2013-04-30"), value: entry["2013-04-30"] === "NA"? 0 : entry["2013-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2013-05-31"), value: entry["2013-05-31"] === "NA"? 0 : entry["2013-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2013-06-30"), value: entry["2013-06-30"] === "NA"? 0 : entry["2013-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2013-07-31"), value: entry["2013-07-31"] === "NA"? 0 : entry["2013-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2013-08-31"), value: entry["2013-08-31"] === "NA"? 0 : entry["2013-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2013-09-30"), value: entry["2013-09-30"] === "NA"? 0 : entry["2013-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2013-10-31"), value: entry["2013-10-31"] === "NA"? 0 : entry["2013-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2013-11-30"), value: entry["2013-11-30"] === "NA"? 0 : entry["2013-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2013-12-31"), value: entry["2013-12-31"] === "NA"? 0 : entry["2013-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2014-01-31"), value: entry["2014-01-31"] === "NA"? 0 : entry["2014-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2014-02-28"), value: entry["2014-02-28"] === "NA"? 0 : entry["2014-02-28"]},
                {date: d3.timeParse("%Y-%m-%d")("2014-03-31"), value: entry["2014-03-31"] === "NA"? 0 : entry["2014-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2014-04-30"), value: entry["2014-04-30"] === "NA"? 0 : entry["2014-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2014-05-31"), value: entry["2014-05-31"] === "NA"? 0 : entry["2014-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2014-06-30"), value: entry["2014-06-30"] === "NA"? 0 : entry["2014-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2014-07-31"), value: entry["2014-07-31"] === "NA"? 0 : entry["2014-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2014-08-31"), value: entry["2014-08-31"] === "NA"? 0 : entry["2014-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2014-09-30"), value: entry["2014-09-30"] === "NA"? 0 : entry["2014-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2014-10-31"), value: entry["2014-10-31"] === "NA"? 0 : entry["2014-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2014-11-30"), value: entry["2014-11-30"] === "NA"? 0 : entry["2014-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2014-12-31"), value: entry["2014-12-31"] === "NA"? 0 : entry["2014-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2015-01-31"), value: entry["2015-01-31"] === "NA"? 0 : entry["2015-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2015-02-28"), value: entry["2015-02-28"] === "NA"? 0 : entry["2015-02-28"]},
                {date: d3.timeParse("%Y-%m-%d")("2015-03-31"), value: entry["2015-03-31"] === "NA"? 0 : entry["2015-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2015-04-30"), value: entry["2015-04-30"] === "NA"? 0 : entry["2015-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2015-05-31"), value: entry["2015-05-31"] === "NA"? 0 : entry["2015-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2015-06-30"), value: entry["2015-06-30"] === "NA"? 0 : entry["2015-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2015-07-31"), value: entry["2015-07-31"] === "NA"? 0 : entry["2015-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2015-08-31"), value: entry["2015-08-31"] === "NA"? 0 : entry["2015-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2015-09-30"), value: entry["2015-09-30"] === "NA"? 0 : entry["2015-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2015-10-31"), value: entry["2015-10-31"] === "NA"? 0 : entry["2015-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2015-11-30"), value: entry["2015-11-30"] === "NA"? 0 : entry["2015-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2015-12-31"), value: entry["2015-12-31"] === "NA"? 0 : entry["2015-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2016-01-31"), value: entry["2016-01-31"] === "NA"? 0 : entry["2016-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2016-02-29"), value: entry["2016-02-29"] === "NA"? 0 : entry["2016-02-29"]},
                {date: d3.timeParse("%Y-%m-%d")("2016-03-31"), value: entry["2016-03-31"] === "NA"? 0 : entry["2016-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2016-04-30"), value: entry["2016-04-30"] === "NA"? 0 : entry["2016-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2016-05-31"), value: entry["2016-05-31"] === "NA"? 0 : entry["2016-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2016-06-30"), value: entry["2016-06-30"] === "NA"? 0 : entry["2016-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2016-07-31"), value: entry["2016-07-31"] === "NA"? 0 : entry["2016-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2016-08-31"), value: entry["2016-08-31"] === "NA"? 0 : entry["2016-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2016-09-30"), value: entry["2016-09-30"] === "NA"? 0 : entry["2016-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2016-10-31"), value: entry["2016-10-31"] === "NA"? 0 : entry["2016-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2016-11-30"), value: entry["2016-11-30"] === "NA"? 0 : entry["2016-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2016-12-31"), value: entry["2016-12-31"] === "NA"? 0 : entry["2016-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2017-01-31"), value: entry["2017-01-31"] === "NA"? 0 : entry["2017-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2017-02-28"), value: entry["2017-02-28"] === "NA"? 0 : entry["2017-02-28"]},
                {date: d3.timeParse("%Y-%m-%d")("2017-03-31"), value: entry["2017-03-31"] === "NA"? 0 : entry["2017-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2017-04-30"), value: entry["2017-04-30"] === "NA"? 0 : entry["2017-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2017-05-31"), value: entry["2017-05-31"] === "NA"? 0 : entry["2017-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2017-06-30"), value: entry["2017-06-30"] === "NA"? 0 : entry["2017-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2017-07-31"), value: entry["2017-07-31"] === "NA"? 0 : entry["2017-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2017-08-31"), value: entry["2017-08-31"] === "NA"? 0 : entry["2017-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2017-09-30"), value: entry["2017-09-30"] === "NA"? 0 : entry["2017-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2017-10-31"), value: entry["2017-10-31"] === "NA"? 0 : entry["2017-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2017-11-30"), value: entry["2017-11-30"] === "NA"? 0 : entry["2017-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2017-12-31"), value: entry["2017-12-31"] === "NA"? 0 : entry["2017-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2018-01-31"), value: entry["2018-01-31"] === "NA"? 0 : entry["2018-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2018-02-28"), value: entry["2018-02-28"] === "NA"? 0 : entry["2018-02-28"]},
                {date: d3.timeParse("%Y-%m-%d")("2018-03-31"), value: entry["2018-03-31"] === "NA"? 0 : entry["2018-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2018-04-30"), value: entry["2018-04-30"] === "NA"? 0 : entry["2018-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2018-05-31"), value: entry["2018-05-31"] === "NA"? 0 : entry["2018-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2018-06-30"), value: entry["2018-06-30"] === "NA"? 0 : entry["2018-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2018-07-31"), value: entry["2018-07-31"] === "NA"? 0 : entry["2018-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2018-08-31"), value: entry["2018-08-31"] === "NA"? 0 : entry["2018-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2018-09-30"), value: entry["2018-09-30"] === "NA"? 0 : entry["2018-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2018-10-31"), value: entry["2018-10-31"] === "NA"? 0 : entry["2018-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2018-11-30"), value: entry["2018-11-30"] === "NA"? 0 : entry["2018-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2018-12-31"), value: entry["2018-12-31"] === "NA"? 0 : entry["2018-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2019-01-31"), value: entry["2019-01-31"] === "NA"? 0 : entry["2019-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2019-02-28"), value: entry["2019-02-28"] === "NA"? 0 : entry["2019-02-28"]},
                {date: d3.timeParse("%Y-%m-%d")("2019-03-31"), value: entry["2019-03-31"] === "NA"? 0 : entry["2019-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2019-04-30"), value: entry["2019-04-30"] === "NA"? 0 : entry["2019-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2019-05-31"), value: entry["2019-05-31"] === "NA"? 0 : entry["2019-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2019-06-30"), value: entry["2019-06-30"] === "NA"? 0 : entry["2019-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2019-07-31"), value: entry["2019-07-31"] === "NA"? 0 : entry["2019-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2019-08-31"), value: entry["2019-08-31"] === "NA"? 0 : entry["2019-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2019-09-30"), value: entry["2019-09-30"] === "NA"? 0 : entry["2019-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2019-10-31"), value: entry["2019-10-31"] === "NA"? 0 : entry["2019-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2019-11-30"), value: entry["2019-11-30"] === "NA"? 0 : entry["2019-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2019-12-31"), value: entry["2019-12-31"] === "NA"? 0 : entry["2019-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2020-01-31"), value: entry["2020-01-31"] === "NA"? 0 : entry["2020-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2020-02-29"), value: entry["2020-02-29"] === "NA"? 0 : entry["2020-02-29"]},
                {date: d3.timeParse("%Y-%m-%d")("2020-03-31"), value: entry["2020-03-31"] === "NA"? 0 : entry["2020-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2020-04-30"), value: entry["2020-04-30"] === "NA"? 0 : entry["2020-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2020-05-31"), value: entry["2020-05-31"] === "NA"? 0 : entry["2020-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2020-06-30"), value: entry["2020-06-30"] === "NA"? 0 : entry["2020-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2020-07-31"), value: entry["2020-07-31"] === "NA"? 0 : entry["2020-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2020-08-31"), value: entry["2020-08-31"] === "NA"? 0 : entry["2020-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2020-09-30"), value: entry["2020-09-30"] === "NA"? 0 : entry["2020-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2020-10-31"), value: entry["2020-10-31"] === "NA"? 0 : entry["2020-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2020-11-30"), value: entry["2020-11-30"] === "NA"? 0 : entry["2020-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2020-12-31"), value: entry["2020-12-31"] === "NA"? 0 : entry["2020-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2021-01-31"), value: entry["2021-01-31"] === "NA"? 0 : entry["2021-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2021-02-28"), value: entry["2021-02-28"] === "NA"? 0 : entry["2021-02-28"]},
                {date: d3.timeParse("%Y-%m-%d")("2021-03-31"), value: entry["2021-03-31"] === "NA"? 0 : entry["2021-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2021-04-30"), value: entry["2021-04-30"] === "NA"? 0 : entry["2021-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2021-05-31"), value: entry["2021-05-31"] === "NA"? 0 : entry["2021-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2021-06-30"), value: entry["2021-06-30"] === "NA"? 0 : entry["2021-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2021-07-31"), value: entry["2021-07-31"] === "NA"? 0 : entry["2021-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2021-08-31"), value: entry["2021-08-31"] === "NA"? 0 : entry["2021-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2021-09-30"), value: entry["2021-09-30"] === "NA"? 0 : entry["2021-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2021-10-31"), value: entry["2021-10-31"] === "NA"? 0 : entry["2021-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2021-11-30"), value: entry["2021-11-30"] === "NA"? 0 : entry["2021-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2021-12-31"), value: entry["2021-12-31"] === "NA"? 0 : entry["2021-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2022-01-31"), value: entry["2022-01-31"] === "NA"? 0 : entry["2022-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2022-02-28"), value: entry["2022-02-28"] === "NA"? 0 : entry["2022-02-28"]},
                {date: d3.timeParse("%Y-%m-%d")("2022-03-31"), value: entry["2022-03-31"] === "NA"? 0 : entry["2022-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2022-04-30"), value: entry["2022-04-30"] === "NA"? 0 : entry["2022-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2022-05-31"), value: entry["2022-05-31"] === "NA"? 0 : entry["2022-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2022-06-30"), value: entry["2022-06-30"] === "NA"? 0 : entry["2022-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2022-07-31"), value: entry["2022-07-31"] === "NA"? 0 : entry["2022-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2022-08-31"), value: entry["2022-08-31"] === "NA"? 0 : entry["2022-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2022-09-30"), value: entry["2022-09-30"] === "NA"? 0 : entry["2022-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2022-10-31"), value: entry["2022-10-31"] === "NA"? 0 : entry["2022-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2022-11-30"), value: entry["2022-11-30"] === "NA"? 0 : entry["2022-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2022-12-31"), value: entry["2022-12-31"] === "NA"? 0 : entry["2022-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2023-01-31"), value: entry["2023-01-31"] === "NA"? 0 : entry["2023-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2023-02-28"), value: entry["2023-02-28"] === "NA"? 0 : entry["2023-02-28"]},
                {date: d3.timeParse("%Y-%m-%d")("2023-03-31"), value: entry["2023-03-31"] === "NA"? 0 : entry["2023-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2023-04-30"), value: entry["2023-04-30"] === "NA"? 0 : entry["2023-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2023-05-31"), value: entry["2023-05-31"] === "NA"? 0 : entry["2023-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2023-06-30"), value: entry["2023-06-30"] === "NA"? 0 : entry["2023-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2023-07-31"), value: entry["2023-07-31"] === "NA"? 0 : entry["2023-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2023-08-31"), value: entry["2023-08-31"] === "NA"? 0 : entry["2023-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2023-09-30"), value: entry["2023-09-30"] === "NA"? 0 : entry["2023-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2023-10-31"), value: entry["2023-10-31"] === "NA"? 0 : entry["2023-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2023-11-30"), value: entry["2023-11-30"] === "NA"? 0 : entry["2023-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2023-12-31"), value: entry["2023-12-31"] === "NA"? 0 : entry["2023-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2024-01-31"), value: entry["2024-01-31"] === "NA"? 0 : entry["2024-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2024-02-29"), value: entry["2024-02-29"] === "NA"? 0 : entry["2024-02-29"]},
                {date: d3.timeParse("%Y-%m-%d")("2024-03-31"), value: entry["2024-03-31"] === "NA"? 0 : entry["2024-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2024-04-30"), value: entry["2024-04-30"] === "NA"? 0 : entry["2024-04-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2024-05-31"), value: entry["2024-05-31"] === "NA"? 0 : entry["2024-05-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2024-06-30"), value: entry["2024-06-30"] === "NA"? 0 : entry["2024-06-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2024-07-31"), value: entry["2024-07-31"] === "NA"? 0 : entry["2024-07-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2024-08-31"), value: entry["2024-08-31"] === "NA"? 0 : entry["2024-08-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2024-09-30"), value: entry["2024-09-30"] === "NA"? 0 : entry["2024-09-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2024-10-31"), value: entry["2024-10-31"] === "NA"? 0 : entry["2024-10-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2024-11-30"), value: entry["2024-11-30"] === "NA"? 0 : entry["2024-11-30"]},
                {date: d3.timeParse("%Y-%m-%d")("2024-12-31"), value: entry["2024-12-31"] === "NA"? 0 : entry["2024-12-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2025-01-31"), value: entry["2025-01-31"] === "NA"? 0 : entry["2025-01-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2025-02-28"), value: entry["2025-02-28"] === "NA"? 0 : entry["2025-02-28"]},
                {date: d3.timeParse("%Y-%m-%d")("2025-03-31"), value: entry["2025-03-31"] === "NA"? 0 : entry["2025-03-31"]},
                {date: d3.timeParse("%Y-%m-%d")("2025-04-30"), value: entry["2025-04-30"] === "NA"? 0 : entry["2025-04-30"]}
            ]
        };
    });
}

function processCityData(rawData) {
  return rawData.map(row => ({
    name: row.RegionName,
    county: row.CountyName,
    prices: Object.entries(row)
      .filter(([key, val]) => key.match(/^2\d{3}-\d{2}-\d{2}$/)) // Filter date keys
      .map(([date, val]) => ({
        date: new Date(date),
        value: +val || null
      }))
      .filter(entry => entry.value !== null) // Remove null prices
  }));
}

// main stuff
const graphContent = d3.select("#graph");
// const tooltip = d3.select("body").append("div")
//     .style("display", "none")
//     .style("position", "absolute")
//     .style("background-color", "white")
//     .style("border", "2px solid black")
//     .style("border-radius", "10px")
//     .style("padding", "10px")
//     .style("padding-bottom", "0")
//     .style("pointer-events", "none")
//     .style("font-family", "sans-serif")
//     .html("you shouldn't see this")
// ;

function initGraphStyling(){
    console.log("containerRect", graphContent);
    const containerRect = graphContent.node().getBoundingClientRect();
    
    style.transitionTime = 500;

    style.lineGraph = {};
    style.lineGraph.content = {
        offset: {x: 76, y: 0}
    }
    style.lineGraph.width = containerRect.width*6/8;
    style.lineGraph.height = style.lineGraph.width / 1.5;
    style.lineGraph.offset = {
        x: containerRect.width/2 - style.lineGraph.width/2 - style.lineGraph.content.offset.x/2,
        y: containerRect.height/2 - style.lineGraph.height/2
    };
    style.lineGraph.labels = {
        x: {
            text: "Date",
            offset: {x: 0 + style.lineGraph.width/2, y: 40 + style.lineGraph.height}
        },
        y: {
            text: "Average Value of Homes",
            offset: {x: -80, y: -style.lineGraph.height/2}
        },
        size: 20
    };
    style.lineGraph.ticks = {
        x: {
            amount: 25
        },
        y: {
            amount: 20
        },
        size: 15
    };
    style.lineGraph.line = {
        width: 3,
        color: {
            default: "blue",
            highlighted: "gold"
        }
    };
    style.lineGraph.focusCircle = {
        radius: 8,
        width: 3,
        color: "black"
    }
    style.lineGraph.highlighter = {
        color: "white",
        opacity: 0.2
    }
}

function getEntryByAspect(dataset, aspect, value){
    for(let index in dataset){
        if(dataset[index][aspect] === value){
            return dataset[index];
        }
    }
}

function updateLineGraphDomainToAll(regionName){

    console.log("updateLineGraphDomainToAll", regionName);
    // const selectedCity = getEntryByAspect(lineGraphPriceData, "name", countyProps.NAME + " County");
    lineGraphObj.x.tickFormat = function(date){
        return d3.timeFormat("'%y")(date);
    }
    lineGraphObj.x.domain = d3.extent(lineGraphPriceDataDates);

    if(lineGraphObj.currentRegionData !== null){
        lineGraphObj.y.domain = [  // round down as the precision caused errors in the min max evaluations
            d3.min(lineGraphObj.currentRegionData.prices, entry => Math.floor(entry.value)),
            d3.max(lineGraphObj.currentRegionData.prices, entry => Math.floor(entry.value))
        ];
    }
    console.log("calling updateLineGraph with regionName", regionName);
    updateLineGraph(regionName);
    console.log("updateLineGraphDomainToAll - done");
}

// let lineGraphPriceData = null;
// let lineGraphPriceDataDates = [];
// let lineGraphObj = null;
// let countyGraphPriceData = [];
// let cityGraphPriceData = [];
// let cityGraphPriceDataDates = [];
// let countyGraphPriceDataDates = [];

// // get and process dataset
// d3.csv(countyPrices).then(rawData =>{
//     console.log("rawData", rawData);

//     initGraphStyling();

//     // process raw data
//     countyGraphPriceData = processCountyData(rawData);
//     console.log("countyGraphPriceData - COUNTY", countyGraphPriceData);

//     // get date range
//     for(let index in countyGraphPriceData[0].prices){
//         countyGraphPriceDataDates.push(countyGraphPriceData[0].prices[index].date);
//     }
//     console.log("countyGraphPriceData - COUNTY", countyGraphPriceDataDates);
    
//     // create line graph
//     lineGraphObj = createLineGraph();

//     // add another event listener to yearSlider
//     yearSlider.addEventListener("input", yearSliderEventWrapper);
//     yearSlider.addEventListener("click", yearSliderEventWrapper);

//     }).catch(function(error){
//     console.log(error);
// });

// // get and process dataset
// d3.csv(cityPrices).then(rawData =>{
//     console.log("rawData", rawData);

//     initGraphStyling();

//     // process raw data
//     cityGraphPriceData = processCityData(rawData);
//     console.log("cityGraphPriceData - CITY", cityGraphPriceData);

//     // get date range
//     for(let index in cityGraphPriceData[0].prices){
//         cityGraphPriceDataDates.push(cityGraphPriceData[0].prices[index].date);
//     }
//     console.log("cityGraphPriceDataDates - CITY", cityGraphPriceDataDates);
    
//     // create line graph
//     //lineGraphObj = createLineGraph();

//     // add another event listener to yearSlider
//     yearSlider.addEventListener("input", yearSliderEventWrapper);
//     yearSlider.addEventListener("click", yearSliderEventWrapper);

//     }).catch(function(error){
//     console.log(error);
// });

function yearSliderEventWrapper(){
    updateLineGraphDomainToAll(null);
}

function createLineGraph(){
    // create lineGraph elements
    const lineGraph = graphContent.append("g")
        .attr("width", style.lineGraph.width)
        .attr("height", style.lineGraph.height)
        .attr("transform", `translate(${style.lineGraph.offset.x}, ${style.lineGraph.offset.y})`)
        .attr("style", debugStyle)
    ;

    // x range
    const lineGraphRangeX = d3.scaleTime()
        .range([0, style.lineGraph.width])
    ;
    // x axis visual
    const lineGraphX = lineGraph.append("g")
        .attr("transform", `translate(${style.lineGraph.content.offset.x}, ${style.lineGraph.height + style.lineGraph.content.offset.y})`)
        .attr("font-size", `${style.lineGraph.ticks.size}px`)
    ;
    
    // y axis range
    const lineGraphRangeY = d3.scaleLinear()
        .range([style.lineGraph.height, 0])
        .nice();

    // y axis visual
    const lineGraphTickFormatY = function(tick){
        return tick.toLocaleString("en-US", {style: "currency", currency: "USD"});
    }
    const lineGraphY = lineGraph.append("g")
        .attr("transform", `translate(${style.lineGraph.content.offset.x - 2}, ${style.lineGraph.content.offset.y})`)
        .attr("font-size", `${style.lineGraph.ticks.size}px`)
    ;

    // x label
    const lineGraphLabelX = lineGraph.append("text")
        .attr("x", style.lineGraph.labels.x.offset.x + style.lineGraph.content.offset.x)
        .attr("y", style.lineGraph.labels.x.offset.y + style.lineGraph.content.offset.y)
        .attr("font-size", `${style.lineGraph.labels.size}px`)
        .attr("text-anchor", "middle")
    ;

    // y label
    // lineGraph.append("text")
    //     .attr("transform", "rotate(-90)")
    //     .attr("x", style.lineGraph.labels.y.offset.y - style.lineGraph.content.offset.y)
    //     .attr("y", style.lineGraph.labels.y.offset.x + style.lineGraph.content.offset.x)
    //     .attr("font-size", `${style.lineGraph.labels.size}px`)
    //     .attr("text-anchor", "middle")
    //     .text(style.lineGraph.labels.y.text)
    // ;

    // line
    const lineGraphLine = lineGraph.append("path")
        .attr("id", "lineGraphLine")
        .attr("transform", `translate(${style.lineGraph.content.offset.x}, ${style.lineGraph.content.offset.y})`)
        .attr("fill", "none")
        .attr("stroke", style.lineGraph.line.color.default)
        .attr("stroke-width", style.lineGraph.line.width)
        .on("mouseover", function(entry){
            const line = d3.select(this);
        })
        // .on("mouseover", function(entry){
        //     // tooltip stuff
        //     tooltip
        //         .style("display", "block")
        //         .html(`
        //             <h3>Age: ${entry.age}</h3>
        //             <ul>
        //                 <li><p>
        //                     <strong>Service:</strong> ${entry.primary_streaming_service}
        //                 </p></li>
        //                 <li><p>
        //                     <strong>Hours Listened per Day:</strong> ${entry.hours_per_day}
        //                 </p></li>
        //                 <li><p>
        //                     <strong>Favorite Genre:</strong> ${entry.fav_genre}
        //                 </p></li>
        //             </ul>
        //         `)
        //         .selectAll("ul")
        //             .style("padding-inline-start", "13px")
        //             .style("margin", `${style.lineGraph.tooltip.ul.margin.all}px`)
        //     ;
        //     tooltip.select("h3")
        //         .style("margin", `${style.lineGraph.tooltip.h3.margin.all}px`)
        //     ;
        //     tooltip.selectAll("li").select("p")
        //         .style("margin", `${style.lineGraph.tooltip.p.margin.all}px`)
        //     ;
        //     tooltip.select("li:last-child").select("p")
        //         .style("margin-bottom", `${style.lineGraph.tooltip.p.margin.bottom}px`)
        //     ;
        // })
        // .on("mousemove", function(){  // update tooltip position
        //     tooltip
        //         .style('left', (d3.event.pageX + style.lineGraph.tooltip.offset.x) + 'px')
        //         .style('top', (d3.event.pageY + style.lineGraph.tooltip.offset.y) + 'px');
        // })
        // .on('mouseout', function(){  // make tooltip disappear
        //     tooltip
        //         .style('display', 'none');
        // })
    ;

    // rectangle for emphasizing the current time period on the slider
    const sectionHighlighter = lineGraph.append("rect")
        .attr("transform", `translate(${style.lineGraph.content.offset.x}, ${style.lineGraph.content.offset.y})`)
        .style("fill", style.lineGraph.highlighter.color)
        .attr("height", style.lineGraph.height)
        .style("opacity", 0)
        .attr("id", "lineGraphSectionHighlighter")
    ;

    // clip line to within graph area
    lineGraph.append("clipPath")
        .attr("id", "lineClipPath")
        .append("rect")
            .attr("x", 0)
            .attr("y", 0)
            .attr("width", style.lineGraph.width)
            .attr("height", style.lineGraph.height)
    ;
    lineGraphLine.attr("clip-path", "url(#lineClipPath)");

    // highlighted section of line
    const lineGraphLineHighlighted = lineGraph.append("path")
        .attr("id", "lineGraphLineHighlighted")
        .attr("transform", `translate(${style.lineGraph.content.offset.x}, ${style.lineGraph.content.offset.y})`)
        .attr("fill", "none")
        .style("opacity", 0)
        .attr("stroke", style.lineGraph.line.color.highlighted)
        .attr("stroke-width", style.lineGraph.line.width + 1)
    ;
    const lineHighlightedClipPath = lineGraph.append("clipPath")
        .attr("id", "lineHighlightedClipPath")
    ;
    const lineHighlightedClipArea = lineHighlightedClipPath.append("rect")
        .attr("height", style.lineGraph.height)
    ;
    lineGraphLineHighlighted.attr("clip-path", "url(#lineHighlightedClipPath)");
    
    // link slider to highlighters
    async function updateHighlightedSection(){
        await delay(10);

        const startDate = new Date(yearSlider.value, 0, 1); // January 1st of the selected year
        const endDate = new Date(yearSlider.value, 11, 31); // December 31st of the selected year

        const startX = lineGraphRangeX(startDate);
        const endX = lineGraphRangeX(endDate);

        // d3.select("#lineGraphLineHighlighted").style("opacity", 1);

        sectionHighlighter
            .attr("x", startX)
            .attr("width", endX - startX)
            .transition().duration(style.transitionTime)
            .style("opacity", style.lineGraph.highlighter.opacity)
        ;
        lineHighlightedClipArea
            .attr("x", startX)
            .attr("width", endX - startX)
        ;
        lineGraphLineHighlighted
            .transition("updateHighlight").duration(style.transitionTime)
            .style("opacity", 1)
        ;
    }
    yearSlider.addEventListener("input", updateHighlightedSection);
    yearSlider.addEventListener("click", updateHighlightedSection);

    // tooltip + circle
    const focusCircle = lineGraph.append("circle")
        .style("fill", "none")
        .attr("stroke", style.lineGraph.focusCircle.color)
        .attr("stroke-width", style.lineGraph.focusCircle.width)
        .attr('r', style.lineGraph.focusCircle.radius)
        .style("opacity", 0)
    
    const mouseDetectionArea = lineGraph.append("rect")
        .attr("transform", `translate(${style.lineGraph.content.offset.x}, ${style.lineGraph.content.offset.y})`)
        .attr("fill", "none")
        .attr("pointer-events", "all")
        .attr("width", style.lineGraph.width)
        .attr("height", style.lineGraph.height)
    ;

    return {
        graph: lineGraph,
        currentRegionData: null,
        line: {
            main: lineGraphLine,
            highlighted: lineGraphLineHighlighted
        },
        sectionHighlighter: sectionHighlighter,
        hoverCircle: focusCircle,
        detectionArea: mouseDetectionArea,
        x: {
            visual: lineGraphX,
            scale: lineGraphRangeX,
            tickFormat: null,
            label: lineGraphLabelX,
            domain: null
        },
        y: {
            visual: lineGraphY,
            scale: lineGraphRangeY,
            tickFormat: lineGraphTickFormatY,
            label: null,
            domain: null
        }
    };

    // hover circle source (content is outdated though, d3.mouse doesnt exist)
    // https://d3-graph-gallery.com/graph/line_cursor.html
}

function updateLineGraph(regionName = null){

    // if data is null, then don't update the data used in the graph
    if(regionName !== null){
      console.log("🔄 [updateLineGraph] Looking up region in lineGraphPriceData...");
        console.log("📋 [updateLineGraph] Available region names:", lineGraphPriceData.map(d => d.name));
      console.log("regionName", regionName);
        lineGraphObj.currentRegionData = getEntryByAspect(lineGraphPriceData, "name", regionName);
                if (!lineGraphObj.currentRegionData) {
            console.error("❌ No region found with name:", regionName);
            return;
        }
        lineGraphObj.y.domain = [  // round down as the precision caused errors in the min max evaluations
            d3.min(lineGraphObj.currentRegionData.prices, entry => Math.floor(entry.value)),
            d3.max(lineGraphObj.currentRegionData.prices, entry => Math.floor(entry.value))
        ];
        console.log("📊 [updateLineGraph] X domain set to:", lineGraphObj.x.domain);
        console.log("📊 [updateLineGraph] Y domain set to:", lineGraphObj.y.domain);
    }

    const data = lineGraphObj.currentRegionData;
    if (!data) {
        console.warn("⚠️ [updateLineGraph] No currentRegionData available, skipping graph update.");
        return;
    }
    //console.log("egg", data);

    // update graph ranges
    lineGraphObj.x.scale.domain(lineGraphObj.x.domain);
    lineGraphObj.x.ticks = d3.axisBottom(lineGraphObj.x.scale)
        .ticks(style.lineGraph.ticks.x.amount)
        .tickFormat(lineGraphObj.x.tickFormat)
    ;
    lineGraphObj.x.visual
        .transition().duration(style.transitionTime)
        .call(lineGraphObj.x.ticks)
    ;

    lineGraphObj.x.label.text(data.name);

    lineGraphObj.y.scale.domain(lineGraphObj.y.domain);
    lineGraphObj.y.ticks = d3.axisLeft(lineGraphObj.y.scale)
        .ticks(style.lineGraph.ticks.y.amount)
        .tickFormat(lineGraphObj.y.tickFormat)
    ;
    lineGraphObj.y.visual
        .transition().duration(style.transitionTime)
        .call(lineGraphObj.y.ticks)
    ;

    // update line
    console.log("🧬 [updateLineGraph] Drawing main line...");
    lineGraphObj.line.main
        .datum(data.prices)
        .transition().duration(style.transitionTime)
        .attr("d", d3.line()
            .x(entry => lineGraphObj.x.scale(entry.date))
            .y(entry => lineGraphObj.y.scale(entry.value))
        )
    ;
    lineGraphObj.line.highlighted
        .datum(data.prices)
        .transition("updateLine").duration(style.transitionTime)
        .attr("d", d3.line()
            .x(entry => lineGraphObj.x.scale(entry.date))
            .y(entry => lineGraphObj.y.scale(entry.value))
        )
    ;
    
    // update range the hover circle reads from
    const getClosestXFromPos = d3.bisector(data => data.date).left;

    lineGraphObj.detectionArea
        .on("mouseover", function() {
            lineGraphObj.hoverCircle.style("opacity", 1);
        })
        .on("mousemove", function(event){
            const mousePosition = d3.pointer(event, this);
            const mousePositionOnGraph = lineGraphObj.x.scale.invert(mousePosition[0]);
            const closestIndex = getClosestXFromPos(data.prices, mousePositionOnGraph);
            const closestEntry = data.prices[closestIndex];

            lineGraphObj.hoverCircle
                .attr("transform", `translate(${style.lineGraph.content.offset.x}, ${style.lineGraph.content.offset.y})`)
                .attr("cx", lineGraphObj.x.scale(closestEntry.date))
                .attr("cy", lineGraphObj.y.scale(closestEntry.value))
            ;
        })
        .on("mouseout", function() {
            lineGraphObj.hoverCircle.style("opacity", 0);
        })
    ;
    console.log("✅ [updateLineGraph] Graph update complete for:", data.name);
}

function updateLineGraphDomainToYear(year = null){
    // console.log("lineGraphObj.x.domain", lineGraphObj.x.domain);
    // console.log("data", data);

    d3.select("#lineGraphSectionHighlighter").style("opacity", 0);
    d3.select("#lineGraphLineHighlighted").style("opacity", 0);

    lineGraphObj.x.domain = [new Date(year-1, 11, 1), new Date(year+1, 0, 31)];
    lineGraphObj.x.tickFormat = function(date){
        return d3.timeFormat("%b  '%y")(date);
    }

    // restricts values to be within the new domain range
    function getValueInDateRange(entry, gettingMin){
        if(entry.date >= lineGraphObj.x.domain[0] && entry.date <= lineGraphObj.x.domain[1]){
            return entry.value;
        }
        return gettingMin? Infinity : 0;
    }
    lineGraphObj.y.domain = [
        d3.min(lineGraphObj.currentRegionData.prices, entry => getValueInDateRange(entry, true)),
        d3.max(lineGraphObj.currentRegionData.prices, entry => getValueInDateRange(entry, false))
    ];

    updateLineGraph();
}


//sidebar = document.getElementById("sidebar");

const resizeObserver = new ResizeObserver(() => {
  if (selectedCountyName && countyPriceData[selectedCountyName]) {
    const rawRow = countyPriceData[selectedCountyName];
    const rawData = Object.entries(rawRow).map(([key, value]) => ({
      key,
      value,
    }));
  }
});

resizeObserver.observe(sidebar);

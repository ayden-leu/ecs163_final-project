let style = {};
const printDebug = true;
const debugStyle = "outline: 1px solid black";

// credit for delay function:
// https://stackoverflow.com/questions/14226803/wait-5-seconds-before-executing-next-line
const delay = (ms) => new Promise((res) => setTimeout(res, ms));

// credit for the line graph hover circle source
// (content is outdated though, d3.mouse doesnt exist)
// https://d3-graph-gallery.com/graph/line_cursor.html

// external datasets
// =================
const cityBoundaries = "data/FILTERED_CITY_LINES.json";
const countyBoundaries = "data/FILTERED_COUNTY_LINES.json";
const fireBoundaries = "data/FILTERED_BIG_FIRES.json";
const countyPricesFile = "data/ZILLOW_DATA_COUNTIES.csv";
const cityPricesFile = "data/ZILLOW_DATA_CITIES.csv";

let isCity = false;

let currentFireAlarmDate = null;
let currentFireContainmentDate = null;

// workaround for sidebar height
const headerHeight = document.querySelector("header").offsetHeight;
document.getElementById("sidebar").style.height = `
	calc(100% - ${headerHeight}px)
`;

///////////////////////////////////////////////////////////////////////////
// main map visualization
///////////////////////////////////////////////////////////////////////////
function getValidGeometry(feature) {
  const geom = feature.geometry;
  return (
    geom &&
    geom.coordinates &&
    geom.coordinates.length > 0 &&
    (geom.type === "Polygon" || geom.type === "MultiPolygon")
  );
}

// map border layers
let showingCounties = true; // Views counties by default

// layers
let mapObj = {
  width: null,
  height: null,
  layer: {
    city: null,
    county: null,
    fire: null,
  },
  feature: {
    city: null,
    county: null,
    fire: null,
  },
  path: null,
  zoom: null,
};

const startYear = yearSlider.value;

// load datasets for map visualization
Promise.all([
  d3.json(cityBoundaries),
  d3.json(countyBoundaries),
  d3.json(fireBoundaries),
  d3.csv(countyPricesFile, d3.autoType),
  d3.csv(cityPricesFile, d3.autoType),
]).then(([cityGeo, countyGeo, fireGeo, countyPricesData, cityPricesData]) => {
  mapObj.feature.city = cityGeo.features.filter(getValidGeometry);
  mapObj.feature.county = countyGeo.features.filter(getValidGeometry);
  mapObj.feature.fire = fireGeo.features.filter(getValidGeometry);

  initSearchInput();

  const countyPrices = processPriceData(countyPricesData, "X%Y.%m.%d");
  const cityPrices = processPriceData(cityPricesData, "%Y-%m-%d");
  // console.log("countyPrices", countyPrices);
  // console.log("cityPrices", cityPrices);

  lineGraphObj.prices.county = countyPrices;
  lineGraphObj.prices.city = cityPrices;

  const allUniqueCountyDates = extractUniqueDates(countyPrices);
  const allUniqueCityDates = extractUniqueDates(cityPrices);
  // console.log("allUniqueCountyDates", allUniqueCountyDates);
  // console.log("allUniqueCityDates", allUniqueCityDates);

  lineGraphObj.dates.county = allUniqueCountyDates;
  lineGraphObj.dates.city = allUniqueCityDates;

  // console.log("lineGraphObj.dates.county", lineGraphObj.dates.county);
  // console.log("lineGraphObj.dates.city", lineGraphObj.dates.city);

  createMapVisual();
  createFireTooltip();
  createFires(startYear);

  initYearSlider();
  initSidebar();

  // choose county or city price data
  initGraphStyling();
  createLineGraph();
});

function zoomToFeature(d) {
  const bounds = mapObj.path.bounds(d);
  const dx = bounds[1][0] - bounds[0][0];
  const dy = bounds[1][1] - bounds[0][1];
  const x = (bounds[0][0] + bounds[1][0]) / 2;
  const y = (bounds[0][1] + bounds[1][1]) / 2;
  var scale = Math.max(1, Math.min(7, 0.7 / Math.max(dx / mapObj.width, dy / mapObj.height)));
  if(isCity)
  {
    scale = Math.max(1, Math.min(12, 0.7 / Math.max(dx / mapObj.width, dy / mapObj.height)));
  }
  const translate = [
    mapObj.width * (11 / 30) - scale * x,
    mapObj.height / 2 - scale * y,
  ];

  d3.select("#map")
    .transition()
    .duration(750)
    .call(
      mapObj.zoom.transform,
      d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
    );
}

function initSearchInput() {
  function hideSearchSuggestions() {
    searchSuggestions.style.display = "none";
    searchSuggestions.innerHTML = "";
  }

  function getMatchingLocations() {
    const userQuery = searchInput.value.trim().toLowerCase();
    // console.log("userQuery", userQuery);

    // if there's nothing in the search bar, hide suggestions
    if (!userQuery) {
      // console.log("no query");
      hideSearchSuggestions();
      return null;
    }

    const allLocationNames = [
      ...mapObj.feature.county.map((data) => ({
        name: data.properties.NAME,
        type: "county",
        feature: data,
      })),
      ...mapObj.feature.city.map((data) => ({
        name: data.properties.CITY,
        type: "city",
        feature: data,
      })),
    ];
    // expected format:
    // 		an array of many objects
    // 		each object has a:
    // 				name (string),
    //		 		type ("county" or "city"),
    //		 		feature (a "Feature" geometry object)
    // console.log("allLocationNames", allLocationNames);

    const matchingLocations = allLocationNames
      .filter(
        (data) => data.name && data.name.toLowerCase().includes(userQuery)
      )
      .slice(0, 5);
    // expected format:
    // 		same as allLocationNames,
    // 		but only the first 5 entries with the string that the user typed in
    // console.log("matchingLocations", matchingLocations);

    if (matchingLocations.length === 0) {
      hideSearchSuggestions();
      return null;
    }

    return matchingLocations;
  }

  function showSuggestions(matchingLocations) {
    searchSuggestions.style.display = "block";
    searchSuggestions.innerHTML = matchingLocations
      .map(
        (entry) => `
                <div class="suggestion-item">
                    ${entry.name} <span style="color: #888; font-size: 12px;">(${entry.type})</span>
                </div>
            `
      )
      .join("");
  }

  function onDropdownEntryClicked(selectedLocation) {
    console.log("Selected location:", selectedLocation);
    searchInput.value = selectedLocation.name;
    searchSuggestions.style.display = "none";

    if(selectedLocation.type === "city")
    {
      isCity = true;
    }
    else
    {
      isCity = false;
    }
    // Zoom the map
    zoomToFeature(selectedLocation.feature);

    // Select the path (add .selected class)
    if (selectedLocation.type === "county") {
      console.log("zoom into this county: ", selectedLocation.name);

      d3.selectAll("path.county").classed("selected", false);
      d3.selectAll("path.city").classed("selected", false);
      d3.selectAll("path.fire").classed("selected", false);

      d3.selectAll("path.county")
        .filter((d) => d === selectedLocation.feature)
        .classed("selected", true);

      // Open sidebar & update graph
      onRegionClicked(selectedLocation.feature);

      return;
    } else if (selectedLocation.type === "city") {
      console.log("zoom into this city: ", selectedLocation.name);

      d3.selectAll("path.county").classed("selected", false);
      d3.selectAll("path.city").classed("selected", false);
      d3.selectAll("path.fire").classed("selected", false);

      d3.selectAll("path.city")
        .filter((d) => d === selectedLocation.feature)
        .classed("selected", true);

      // Open sidebar & update graph
      onRegionClicked(selectedLocation.feature);

      return;
    }
  }

  function attachEventListeners(matchingLocations) {
    Array.from(searchSuggestions.children).forEach((child, i) => {
      child.addEventListener("click", () => {
        onDropdownEntryClicked(matchingLocations[i]);
      });
    });
  }

  searchInput.addEventListener("input", () => {
    // expected output:
    // 		an array of at most 5 objects
    //		each object has a:
    // 			name (string),
    //		 	type ("county" or "city"),
    //		 	feature (a "Feature" geometry object)
    const matchingLocations = getMatchingLocations();

    showSuggestions(matchingLocations);
    attachEventListeners(matchingLocations);
  });
}

// result:
// 		an object whose keys are the region names
//		each key has an array of objects, which have a:
//			date (Date object),
//			value (number)
function processPriceData(priceData, dateFormat) {
  // example date format:
  //      city dataset: 2000-01-31 (%Y-%m-%d)
  //      county dataset: X2000.01.31 (X%Y.%m.%d)
  // each entry is the end of each month from 2000 to April 2025
  const numToRemove = 8;

  // result:
  //		an array of objects
  //		each object has a:
  //			date (Date object),
  //			value (number)
  let dates = null;
  function getPrices(entry) {
    const prices = [];

    // get all date entries
    if (dates === null) {
      dates = Object.keys(entry);
      dates = dates.slice(numToRemove + 1);
    }

    // for (let date of dates) {
    //   prices.push({
    //     date: d3.timeParse(dateFormat)(date),
    //     value: entry[date] === "NA" ? 0 : entry[date],
    //   });
    // }
    for (let date of dates) {
    const rawValue = entry[date];
    if (rawValue !== "NA" && rawValue != null && !isNaN(rawValue)) {
      prices.push({
        date: d3.timeParse(dateFormat)(date),
        value: +rawValue,
      });
    }
  }
    return prices;
  }

  const allPrices = {};
  priceData.forEach((entry) => {
    // console.log("entry", entry);
    const regionName = entry.RegionName.replace(" County", "");
    allPrices[regionName] = getPrices(entry);
  });

  return allPrices;
}

// result:
//		an array of Date objects
function extractUniqueDates(priceObject) {
  const uniqueDates = new Set();

  const dummyRegionName = Object.keys(priceObject)[0];
  priceObject[dummyRegionName].forEach((price) => {
    uniqueDates.add(price.date);
  });

  return Array.from(uniqueDates);
}

function createMapVisual() {
  const map = d3.select("#map");

  const container = map.node().getBoundingClientRect();
  const width = container.width;
  const height = container.height;
  // console.log("width", width);
  // console.log("height", height);

  mapObj.width = width;
  mapObj.height = height;

  const combined = {
    type: "FeatureCollection",
    features: mapObj.feature.city.concat(mapObj.feature.county),
  };

  // define projection of map
  const projection = d3
    .geoConicConformal()
    .parallels([34, 40.5])
    .rotate([120])
    .fitSize([width, height], combined);
  mapObj.path = d3.geoPath().projection(projection);

  // define layers
  const layerGroup = map.append("g").attr("class", "zoom-layer");
  mapObj.layer.county = layerGroup.append("g").attr("class", "counties");
  mapObj.layer.city = layerGroup.append("g").attr("class", "cities");
  mapObj.layer.fire = layerGroup.append("g").attr("class", "fire-layer");
  const countyLabelLayer = layerGroup
    .append("g")
    .attr("class", "county-labels");
  const cityLabelLayer = layerGroup.append("g").attr("class", "city-labels");

  function updateStrokeWidths(currentZoom) {
    // Counties
    mapObj.layer.county
      .selectAll("path.county")
      .attr("stroke-width", function () {
        const isSelected = d3.select(this).classed("selected");
        const baseWidth = 1;
        const selectedMultiplier = 2;
        const width = isSelected
          ? (baseWidth * selectedMultiplier) / currentZoom
          : baseWidth / currentZoom;
        return `${width}px`;
      });

    // Cities
    mapObj.layer.city.selectAll("path.city").attr("stroke-width", function () {
      const isSelected = d3.select(this).classed("selected");
      const baseWidth = 0.3;
      const selectedMultiplier = 3.5;
      const width = isSelected
        ? (baseWidth * selectedMultiplier) / currentZoom
        : baseWidth / currentZoom;
      return `${width}px`;
    });

    // Fires
    mapObj.layer.fire.selectAll("path.fire").attr("stroke-width", function () {
      const isSelected = d3.select(this).classed("selected");
      const baseWidth = 0.2;
      const selectedMultiplier = 3.5;
      const width = isSelected
        ? (baseWidth * selectedMultiplier) / currentZoom
        : baseWidth / currentZoom;
      return `${width}px`;
    });
  }

  // add zoom functionality to map
  function zoomMap(event) {
    layerGroup.attr("transform", event.transform);
    const currentZoom = event.transform.k;

    // ----- existing county label scaling -----
    function getCountyLabelOpacity() {
      if (currentZoom < 1.5) {
        return 0;
      } else if (currentZoom < 2.5) {
        return (currentZoom - 1.5) / (2.5 - 1.5);
      } else if (currentZoom <= 5) {
        return 1;
      } else if (currentZoom < 9) {
        return 1 - (currentZoom - 5) / (9 - 5);
      } else {
        return 0;
      }
    }
    const countyOpacity = getCountyLabelOpacity();

    countyLabelLayer
      .selectAll("text")
      .attr("opacity", countyOpacity)
      .attr("font-size", () => {
        const size = Math.max(6, 10 - (currentZoom - 1) * 1.5);
        return `${size}px`;
      });

    // ----- existing city label scaling -----
    function getCityLabelOpacity() {
      if (currentZoom >= 10) {
        return 1;
      } else if (currentZoom < 4) {
        return 0;
      } else if (currentZoom < 10) {
        return (currentZoom - 5) / (10 - 5);
      }
    }
    const cityOpacity = getCityLabelOpacity();

    cityLabelLayer
      .selectAll("text")
      .attr("opacity", cityOpacity)
      .attr("font-size", () => {
        const minSize = 0.7;
        const maxSize = 20;
        const size = Math.max(minSize, maxSize / currentZoom);
        return `${size}px`;
      });

    // ----- NEW: scale stroke-width for counties -----
    updateStrokeWidths(currentZoom);
  }
  const zoom = d3
    .zoom()
    .scaleExtent([1, 25])
    .on("zoom", (event) => {
      zoomMap(event);
    });
  map.call(zoom);
  mapObj.zoom = zoom;

  const initialZoom = d3.zoomTransform(d3.select("#map").node()).k;
  updateStrokeWidths(initialZoom);

  // create layers
  // Counties (underneath)
  mapObj.layer.county
    .selectAll("path.county")
    .data(mapObj.feature.county)
    .join("path")
    .attr("class", "county")
    .attr("d", mapObj.path)
    .on("click", function (_event, data) {
      isCity = false;
      // Remove "selected" from all county and city paths
      d3.selectAll("path.county").classed("selected", false);
      d3.selectAll("path.city").classed("selected", false);
      d3.selectAll("path.fire").classed("selected", false);

      zoomToFeature(data, 4);

      // Add "selected" to this clicked path
      d3.select(this).classed("selected", true);
      const currentZoom = d3.zoomTransform(d3.select("#map").node()).k;

      updateStrokeWidths(currentZoom);

      onRegionClicked(data);
    });

  // Cities (middle layer)
  mapObj.layer.city
    .selectAll("path.city")
    .data(mapObj.feature.city)
    .join("path")
    .attr("class", "city")
    .attr("d", mapObj.path)
    .on("click", function (_event, data) {
      isCity = true;
      // Remove "selected" from all county and city paths
      d3.selectAll("path.county").classed("selected", false);
      d3.selectAll("path.city").classed("selected", false);
      d3.selectAll("path.fire").classed("selected", false);

      // Add "selected" to this clicked path
      d3.select(this).classed("selected", true);

      zoomToFeature(data, 6);

      const currentZoom = d3.zoomTransform(d3.select("#map").node()).k;
      updateStrokeWidths(currentZoom);

      onRegionClicked(data);
    });
  // Names / labels
  countyLabelLayer
    .selectAll("text")
    .data(mapObj.feature.county)
    .join("text")
    .attr("class", "county-label")
    .attr("transform", (data) => {
      const centroid = mapObj.path.centroid(data);
      return `translate(${centroid[0]}, ${centroid[1]})`;
    })
    .text((entry) => entry.properties.NAME)
    .attr("opacity", 0);

  cityLabelLayer
    .selectAll("text")
    .data(mapObj.feature.city)
    .join("text")
    .attr("class", "city-label")
    .attr("transform", (data) => {
      const centroid = mapObj.path.centroid(data);
      return `translate(${centroid[0]}, ${centroid[1]})`;
    })
    .text((entry) => entry.properties.CITY)
    .attr("opacity", 0);
}

function createFireTooltip() {
  d3.select("body").append("div").attr("id", "fire-tooltip");
}

function createFires(year) {
  const filteredFires = mapObj.feature.fire.filter(
    (f) => f.properties.YEAR_ === year
  );

  const firePaths = mapObj.layer.fire
    .selectAll("path.fire")
    .data(
      filteredFires,
      (data) => data.properties.IRWINID || JSON.stringify(data.geometry)
    );

  function showFireTooltip(event, d) {
    const props = d.properties;
    const fireName = props.FIRE_NAME || "Unknown";
    const alarmDate = props.ALARM_DATE ? new Date(props.ALARM_DATE) : null;
    const containmentDate = props.CONT_DATE ? new Date(props.CONT_DATE) : null;
    currentFireAlarmDate = alarmDate;
    currentFireContainmentDate = containmentDate;
    const acreage = props.GIS_ACRES?.toLocaleString() || "N/A";

    const formatDate = (date) =>
    date
      ? `${(date.getMonth() + 1).toString().padStart(2, "0")}/${date
          .getDate()
          .toString()
          .padStart(2, "0")}/${date.getFullYear()}`
      : "N/A";
    

    d3
      .select("#fire-tooltip")
      .classed("visible", true)
      .style("left", event.pageX + 10 + "px")
      .style("top", event.pageY - 28 + "px").html(`
				<strong>${fireName}</strong><br/>
        <strong>Start:</strong> ${formatDate(alarmDate)}<br/>
        <strong>End:</strong> ${formatDate(containmentDate)}<br/>
				<strong>Acres:</strong> ${acreage}<br/>
			`);
  }
  function moveFireTooltip(event) {
    d3.select("#fire-tooltip")
      .style("left", event.pageX + 10 + "px")
      .style("top", event.pageY - 28 + "px");
  }
  function hideFireTooltip() {
    d3.select("#fire-tooltip").classed("visible", false);
  }

  firePaths.join(
    (enter) =>
      enter
        .append("path")
        .attr("class", "fire")
        .attr("d", mapObj.path)

        // Tooltip events below; When mouse goes over a fire, show the tooltip with fire details (name, year, and acreage)
        .on("mouseover", (event, d) => {
          showFireTooltip(event, d);
        })
        .on("mousemove", (event) => {
          moveFireTooltip(event);
        })
        .on("mouseout", () => {
          hideFireTooltip();
        })

        .on("click", function (event, data) 
        {
          console.log("Clicked fire:", data.properties.FIRE_NAME);
          currentFireAlarmDate = data.properties.ALARM_DATE;
          currentFireContainmentDate = data.properties.CONT_DATE;
          console.log("Alarm Date:", currentFireAlarmDate);
          console.log("Containment Date:", currentFireContainmentDate);
          d3.selectAll("path.fire").classed("selected", false);
          d3.select(this).classed("selected", true);
          
          updateLineGraphDomainStartEnd(currentFireAlarmDate, currentFireContainmentDate);
          
        }),
    (update) => update,
    (exit) => exit.remove()
  );
  mapObj.layer.fire.raise();
}

function updateYearSlider(year) {
  yearSlider.value = year;
  yearLabel.textContent = year;

  createFires(Number(year));
}

function initYearSlider() {
  updateYearSlider(yearSlider.value);

  yearSlider.addEventListener("input", () => {
    updateYearSlider(yearSlider.value);
  });
}

function openSidebar(regionName) {
  sidebar.style.zIndex = 10;
  sidebar.style.width = "30%";
  sidebarHeader.innerHTML = `${regionName}`;
}

function closeSidebar() {
  sidebar.style.width = 0;
  isCity = false;

  // Unselect county and city
  d3.selectAll("path.county").classed("selected", false);
  d3.selectAll("path.city").classed("selected", false);

  // Unselect fires
  d3.selectAll("path.fire").classed("selected", false);
}

function initSidebar() {
  sidebar.style.width = 0;
  closeSidebarButton.onclick = () => {
    closeSidebar();
  };
}

let lineGraphObj = {
  graph: null,
  width: null,
  height: null,
  prices: {
    county: null,
    city: null,
  },
  dates: {
    county: null,
    city: null,
  },
  currentRegionData: null,
  line: {
    main: null,
    highlighted: null,
  },
  sectionHighlighter: null,
  hoverCircle: null,
  detectionArea: null,
  x: {
    visual: null,
    scale: null,
    tickFormat: null,
    label: null,
    domain: null,
  },
  y: {
    visual: null,
    scale: null,
    tickFormat: null,
    label: null,
    domain: null,
  },
};

function getEntryByAspect(dataset, aspect, value) {
  // console.log("dataset", dataset);
  // console.log("aspect", aspect);
  // console.log("value", value);

  for (let index in dataset) {
    if (dataset[index][aspect] === value) {
      return dataset[index];
    }
  }
}

function initGraphStyling() {
  const containerRect = d3.select("#graph").node().getBoundingClientRect();
  const width = containerRect.width;
  const height = containerRect.height;

  style.transitionTime = 500;

  style.lineGraph = {};
  style.lineGraph.padding = {
    left: 84,
    top: 30,
    right: 10,
    bottom: 40,
  };

  style.lineGraph.ticks = {
    x: {
      amount: 25,
    },
    y: {
      amount: 20,
    },
  };
  style.lineGraph.highlighter = {
    opacityVisible: 0.2,
  };
}

function createLineGraph() {
  const container = d3.select("#graph").node().getBoundingClientRect();
  lineGraphObj.width = container.width;
  lineGraphObj.height = lineGraphObj.width;
  // console.log("lineGraphObj.width", lineGraphObj.width);
  // console.log("lineGraphObj.height", lineGraphObj.height);

  // create lineGraph elements
  const lineGraph = d3.select("#graph").attr("height", lineGraphObj.height);
  lineGraphObj.graph = lineGraph;

  // Add chart title
lineGraph
  .append("text")
  .attr("class", "chart-title")
  .attr("x", lineGraphObj.width / 2)
  .attr("y", style.lineGraph.padding.top / 2)
  .attr("text-anchor", "middle")
  .text("Median Housing Prices Over Time");

  // x range
  const lineGraphRangeX = d3
    .scaleTime()
    .range([
      0,
      lineGraphObj.width -
        style.lineGraph.padding.left -
        style.lineGraph.padding.right,
    ]);
  // x axis visual
  const lineGraphX = lineGraph
    .append("g")
    .attr(
      "transform",
      `translate(
			${style.lineGraph.padding.left},
			${lineGraphObj.height - style.lineGraph.padding.bottom}
		)`
    )
    .classed("graphAxis", true);
  
    lineGraph
  .append("text")
  .attr("class", "x-axis-label")
  .attr("x", lineGraphObj.width / 2)
  .attr("y", lineGraphObj.height - 5) // adjust as needed
  .attr("text-anchor", "middle")
  .text("Date");

  // y axis range
  const lineGraphRangeY = d3
    .scaleLinear()
    .range([
      lineGraphObj.height -
        style.lineGraph.padding.top -
        style.lineGraph.padding.bottom,
      0,
    ])
    .nice();

  // y axis visual
  const lineGraphTickFormatY = function (tick) {
    return "$" + tick.toLocaleString(Math.round("en-US", { style: "currency", currency: "USD" }));
  };
  const lineGraphY = lineGraph
    .append("g")
    .attr(
      "transform",
      `translate(
			${style.lineGraph.padding.left},
			${style.lineGraph.padding.top}
		)`
    )
    .classed("graphAxis", true);
  
    // Add Y-axis label
lineGraph
  .append("text")
  .attr("class", "y-axis-label")
  .attr("text-anchor", "middle")
  .attr(
    "transform",
    `rotate(-90)`
  )
  .attr("x", -lineGraphObj.height / 2)
  .attr("y", 15) // adjust spacing from left edge
  .text("Median Home Value (in USD)");

  // line
  const lineGraphLine = lineGraph
    .append("path")
    .classed("lineGraphLine", true)
    .attr(
      "transform",
      `translate(
			${style.lineGraph.padding.left},
			${style.lineGraph.padding.top}
		)`
    )
    .on("mouseover", function (entry) {
      const line = d3.select(this);
    });
  // rectangle for emphasizing the current time period on the slider
  const sectionHighlighter = lineGraph
    .append("rect")
    .attr("id", "lineGraphSectionHighlighter")
    .attr(
      "transform",
      `translate(
			${style.lineGraph.padding.left},
			${style.lineGraph.padding.top}
		)`
    )
    .attr(
      "height",
      lineGraphObj.height -
        style.lineGraph.padding.top -
        style.lineGraph.padding.bottom
    );
  // clip line to within graph area
  lineGraph
    .append("clipPath")
    .attr("id", "lineClipPath")
    .append("rect")
    .attr("x", 0)
    .attr("y", 0)
    .attr(
      "width",
      lineGraphObj.width -
        style.lineGraph.padding.left -
        style.lineGraph.padding.right
    )
    .attr(
      "height",
      lineGraphObj.height -
        style.lineGraph.padding.top -
        style.lineGraph.padding.bottom
    )
    .attr("fill", "black");
  lineGraphLine.attr("clip-path", "url(#lineClipPath)");

  // highlighted section of line
  const lineGraphLineHighlighted = lineGraph
    .append("path")
    .classed("lineGraphLine", true)
    .classed("highlighted", true)
    .attr(
      "transform",
      `translate(
			${style.lineGraph.padding.left},
			${style.lineGraph.padding.top}
		)`
    );
  const lineHighlightedClipPath = lineGraph
    .append("clipPath")
    .attr("id", "lineHighlightedClipPath");
  const lineHighlightedClipArea = lineHighlightedClipPath
    .append("rect")
    .attr("height", lineGraphObj.height);
  lineGraphLineHighlighted.attr("clip-path", "url(#lineHighlightedClipPath)");

  // link slider to highlighters
  async function updateHighlightedSection() {
    // when zooming out to full view, the proper area to highlight isnt updated yet
    // quick fix:  simply wait a small bit
    await delay(10);

    const startDate = new Date(yearSlider.value, 0, 1); // January 1st of the selectedLocation year
    const endDate = new Date(yearSlider.value, 11, 31); // December 31st of the selectedLocation year

    const startX = lineGraphRangeX(startDate);
    const endX = lineGraphRangeX(endDate);

    sectionHighlighter
      .attr("x", startX)
      .attr("width", endX - startX)
      // .transition().duration(style.transitionTime)
      //.style("opacity", style.lineGraph.highlighter.opacityVisible);
    lineHighlightedClipArea.attr("x", startX).attr("width", endX - startX);
    lineGraphLineHighlighted
      // .transition("updateHighlight").duration(style.transitionTime)
      .style("opacity", 0);
  }
  yearSlider.addEventListener("input", updateHighlightedSection);
  yearSlider.addEventListener("click", updateHighlightedSection);

  // tooltip + circle
  const focusCircle = lineGraph
    .append("circle")
    .attr("id", "lineGraphFocusCircle");
  const mouseDetectionArea = lineGraph
    .append("rect")
    .attr(
      "transform",
      `translate(
			${style.lineGraph.padding.left},
			${style.lineGraph.padding.top}
		)`
    )
    .attr("fill", "none")
    .attr("pointer-events", "all")
    .attr(
      "width",
      lineGraphObj.width -
        style.lineGraph.padding.left -
        style.lineGraph.padding.right
    )
    .attr(
      "height",
      lineGraphObj.height -
        style.lineGraph.padding.top -
        style.lineGraph.padding.bottom
    );
  lineGraphObj.graph = lineGraph;
  lineGraphObj.line.main = lineGraphLine;
  lineGraphObj.line.highlighted = lineGraphLineHighlighted;
  lineGraphObj.sectionHighlighter = sectionHighlighter;
  lineGraphObj.hoverCircle = focusCircle;
  lineGraphObj.detectionArea = mouseDetectionArea;
  lineGraphObj.x.visual = lineGraphX;
  lineGraphObj.x.scale = lineGraphRangeX;
  lineGraphObj.y.visual = lineGraphY;
  lineGraphObj.y.scale = lineGraphRangeY;
  lineGraphObj.y.tickFormat = lineGraphTickFormatY;
}

function updateLineGraph(regionData = null) {
  // console.log("regionData", regionData);
  d3.select("#lineGraphSectionHighlighter")
    .style("opacity", 0)
    .attr("width", 0);

  d3.select(".lineGraphLine.highlighted").style("opacity", 1);

  // if regionName is null, then don't update the data used in the graph
  if (regionData !== null) {
    const lsad = regionData.LSAD;

    lineGraphObj.currentRegionData =
      lsad === undefined
        ? lineGraphObj.prices.city[regionData.CITY]
        : lineGraphObj.prices.county[regionData.NAME];

    lineGraphObj.y.domain = [
      // round down as the precision caused errors in the min max evaluations
      d3.min(lineGraphObj.currentRegionData, (entry) =>
        Math.floor(entry.value)
      ),
      d3.max(lineGraphObj.currentRegionData, (entry) =>
        Math.floor(entry.value)
      ),
    ];
  }
  const data = lineGraphObj.currentRegionData;
  // console.log("data", data);

  // update graph domains
  //updates x domain (visually)
  
  lineGraphObj.x.scale.domain(lineGraphObj.x.domain);

  lineGraphObj.x.ticks = d3
    .axisBottom(lineGraphObj.x.scale)
    .ticks(style.lineGraph.ticks.x.amount)
    .tickFormat(lineGraphObj.x.tickFormat);
  lineGraphObj.x.visual
    .transition()
    .duration(style.transitionTime)
    .call(lineGraphObj.x.ticks)
      .selection()
  .selectAll("text")
  .attr("transform", "rotate(45)")
  .style("text-anchor", "end")
  .attr("dx", "0.5em")
  .attr("dy", "1.5em")
    ;


// yxaxis
  lineGraphObj.y.scale.domain(lineGraphObj.y.domain);
  lineGraphObj.y.ticks = d3
    .axisLeft(lineGraphObj.y.scale)
    .ticks(style.lineGraph.ticks.y.amount)
    .tickFormat(lineGraphObj.y.tickFormat);
  lineGraphObj.y.visual
    .transition()
    .duration(style.transitionTime)
    .call(lineGraphObj.y.ticks)
    ;

  // update lines
  lineGraphObj.line.main
    .datum(data)
    .transition()
    .duration(style.transitionTime)
    .attr(
      "d",
      d3
        .line()
        .x((entry) => lineGraphObj.x.scale(entry.date))
        .y((entry) => lineGraphObj.y.scale(entry.value))
    );
  lineGraphObj.line.highlighted
    .datum(data)
    .transition("updateLine")
    .duration(style.transitionTime)
    .attr(
      "d",
      d3
        .line()
        .x((entry) => lineGraphObj.x.scale(entry.date))
        .y((entry) => lineGraphObj.y.scale(entry.value))
    );

  // update range the hover circle reads from
  const getClosestXFromPos = d3.bisector((data) => data.date).left;

  lineGraphObj.detectionArea
    .on("mouseover", function () {
      lineGraphObj.hoverCircle.style("opacity", 1);
    })
    .on("mousemove", function (event) {
      const mousePosition = d3.pointer(event, this);
      const mousePositionOnGraph = lineGraphObj.x.scale.invert(
        mousePosition[0]
      );
      const closestIndex = getClosestXFromPos(data, mousePositionOnGraph);
      const closestEntry = data[closestIndex];

      const circleRadius = Number(
        d3.select("#lineGraphFocusCircle").style("r").replace("px", "")
      );

      lineGraphObj.hoverCircle
        .attr("cx", lineGraphObj.x.scale(closestEntry.date) + style.lineGraph.padding.left)
        .attr("cy", lineGraphObj.y.scale(closestEntry.value) + style.lineGraph.padding.top);
    })
    .on("mouseout", function () {
      lineGraphObj.hoverCircle.style("opacity", 0);
    });
}
function updateLineGraphDomainToAll(regionData) {
  d3.select("#lineGraphSectionHighlighter").style(
    "opacity",
    style.lineGraph.highlighter.opacityVisible
  );
  d3.select(".lineGraphLine.highlighted").style("opacity", 1);

  const lsad = regionData.LSAD;

  //console.log("LineGraph", lineGraphObj.x.domain);

  lineGraphObj.x.tickFormat = function (date) {
    return d3.timeFormat("'%y")(date);
  };

  //console.log("isCity", isCity);
  var regionName = "";
  if(!isCity)
  {
    regionName = regionData.NAME.replace(" County", "");
  }
  else
  {
    regionName = regionData.CITY;
  }
  console.log("regionName", regionName);
  const regionPrices = lineGraphObj.prices[lsad === undefined ? "city" : "county"][regionName];
  lineGraphObj.x.domain = d3.extent(regionPrices, (entry) => entry.date);


  if (lineGraphObj.currentRegionData !== null) {
    lineGraphObj.y.domain = [
      // round down as the precision caused errors in the min max evaluations
      d3.min(lineGraphObj.currentRegionData, (entry) =>
        Math.floor(entry.value)
      ),
      d3.max(lineGraphObj.currentRegionData, (entry) =>
        Math.floor(entry.value)
      ),
    ];
  }

  updateLineGraph(regionData);
}
function updateLineGraphDomainToYear(year = null) {
  d3.select("#lineGraphSectionHighlighter").style("opacity", 0);
  d3.select(".lineGraphLine.highlighted").style("opacity", 0);

  lineGraphObj.x.domain = [
    new Date(year - 1, 11, 1),
    new Date(year + 1, 0, 31),
  ];
  lineGraphObj.x.tickFormat = function (date) {
    return d3.timeFormat("%b  '%y")(date);
  };

  // restricts values to be within the new domain range
  function getValueInDateRange(entry, gettingMin) {
    if (
      entry.date >= lineGraphObj.x.domain[0] &&
      entry.date <= lineGraphObj.x.domain[1]
    ) {
      return entry.value;
    }
    return gettingMin ? Infinity : 0;
  }
  lineGraphObj.y.domain = [
    d3.min(lineGraphObj.currentRegionData, (entry) =>
      getValueInDateRange(entry, true)
    ),
    d3.max(lineGraphObj.currentRegionData, (entry) =>
      getValueInDateRange(entry, false)
    ),
  ];

  updateLineGraph();
}

function updateLineGraphDomainStartEnd(startDate, endDate) 
{
  
  d3.select("#lineGraphSectionHighlighter").style("opacity", 0);
  d3.select(".lineGraphLine.highlighted").style("opacity", 0);

  const formattedStartDate = new Date(startDate);
  const formattedEndDate = new Date(endDate);

    // Add a 6-month buffer before and after
  const bufferedStart = new Date(startDate);
  bufferedStart.setMonth(bufferedStart.getMonth() - 6);

  const bufferedEnd = new Date(endDate);
  bufferedEnd.setMonth(bufferedEnd.getMonth() + 6);
  
  //lineGraphObj.x.scale.domain = [formattedStartDate, formattedEndDate];


  // Set the new x-axis domain
  lineGraphObj.x.domain = [bufferedStart, bufferedEnd];

  lineGraphObj.x.tickFormat = function (date) {
    return d3.timeFormat("%b  '%y")(date);
  };

  // restricts values to be within the new domain range
  function getValueInDateRange(entry, gettingMin) {
    if (
      entry.date >= lineGraphObj.x.domain[0] &&
      entry.date <= lineGraphObj.x.domain[1]
    ) {
      return entry.value;
    }
    return gettingMin ? Infinity : 0;
  }
  lineGraphObj.y.domain = [
    d3.min(lineGraphObj.currentRegionData, (entry) =>
      getValueInDateRange(entry, true)
    ),
    d3.max(lineGraphObj.currentRegionData, (entry) =>
      getValueInDateRange(entry, false)
    ),
  ];

  updateLineGraph();

  // Highlight the fire period on top of the graph
  // const xScale = lineGraphObj.xScale;
  // const yScale = lineGraphObj.yScale;

  const highlightStart = lineGraphObj.x.scale(new Date(startDate));
  const highlightEnd = lineGraphObj.x.scale(new Date(endDate));
  // console.log("startDate", startDate);
  // console.log("endDate", endDate);
  // console.log("highlightStart", highlightStart);
  // console.log("highlightEnd", highlightEnd);

  // const height = d3.select("#lineGraphSVG").node().getBoundingClientRect().height;
  const height =
  lineGraphObj.height -
  style.lineGraph.padding.top -
  style.lineGraph.padding.bottom;

  d3.select("#lineGraphSectionHighlighter")
    .attr("x", highlightStart)
    .attr("y", 0)
    .attr("width", highlightEnd - highlightStart)
    .attr("height", height)
    .style("transition", `opacity ${style.transitionTime}ms ease`)
    .style("fill" , "rgba(170, 66, 3, 1)")
    .style("opacity", 0.3)
    ;
}


function onRegionClicked(regionData) {
  // console.log("region", regionData.properties);
  console.log("onRegionClicked", regionData);

  const lsad = regionData.properties.LSAD;
  const regionName =
    lsad === undefined
      ? regionData.properties.CITY + " (City)"
      : regionData.properties.NAME + " (County)";
  openSidebar(regionName);
  updateLineGraphDomainToAll(regionData.properties);
  // zoomToRegion(regionData);
}


// sidebar resizing functionality
// let sidebarIsResizing = false;

// dragHandle.addEventListener("mousedown", function (event) {
//     sidebarIsResizing = true;
//     document.body.style.cursor = "ew-resize";
//     event.preventDefault();
// });

// document.addEventListener("mousemove", function (event) {
//     if (!sidebarIsResizing) return;

//     const newWidth = window.innerWidth - event.clientX;
//     // const clampedWidth = Math.max(200, Math.min(newWidth, 700)); // optional bounds
//     sidebar.style.width = newWidth + "px";
// });

// document.addEventListener("mouseup", function () {
//     if (sidebarIsResizing) {
//         sidebarIsResizing = false;
//         document.body.style.cursor = "default";
//     }
// });

function initialize() {
  // initSearchInput();
}
initialize();

const citiesJSON = "data/CA_CITIES.json";
const countiesJSON = "data/FILTERED_COUNTY_LINES.json";
const firesJSON = "data/FILTERED_BIG_FIRES.json";

function isValidGeometry(feature) {
  const geom = feature.geometry;
  return (
    geom &&
    geom.coordinates &&
    geom.coordinates.length > 0 &&
    (geom.type === "Polygon" || geom.type === "MultiPolygon")
  );
}

let allFires = [];

Promise.all([
  d3.json(citiesJSON),
  d3.json(countiesJSON),
  d3.json(firesJSON),
]).then(([cityGeo, countyGeo, fireGeo]) => {
  const svg = d3.select("svg");

  let width = svg.attr("width");
  let height = svg.attr("height");

  if (!width || !height) {
    width = 960;
    height = 600;
    svg.attr("width", width).attr("height", height);
  } else {
    width = +width;
    height = +height;
  }

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

  svg.call(
    d3.zoom()
      .scaleExtent([1, 20])
      .on("zoom", (event) => {
        zoomGroup.attr("transform", event.transform);
      })
  );

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
    .attr("shape-rendering", "crispEdges");

  // Cities (middle layer)
  zoomGroup
    .append("g")
    .selectAll("path.city")
    .data(validCities)
    .join("path")
    .attr("class", "city")
    .attr("d", path)
    .attr("fill", "#555")
    .attr("stroke", "#888")
    .attr("stroke-width", 0.1)
    .attr("stroke-opacity", 0.6)
    .attr("shape-rendering", "crispEdges");

  // Fires (top layer)
  const fireLayer = zoomGroup.append("g").attr("class", "fire-layer");

  function drawFiresByYear(year) {
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
        .attr("stroke-width", 0.2),
      update => update,
      exit => exit.remove()
    );
  }

  // Slider logic
  const yearSlider = document.getElementById("yearSlider");
  const yearLabel = document.getElementById("yearLabel");

  yearSlider.addEventListener("input", () => {
    const year = +yearSlider.value;
    yearLabel.textContent = year;
    drawFiresByYear(year);
  });

  // Initial render
  drawFiresByYear(+yearSlider.value);
});

let style = {};

const citiesJSON = "data/CA_CITIES.json";
const countiesJSON = "data/FILTERED_COUNTY_LINES.json";
const firesJSON = "data/FILTERED_BIG_FIRES.json";

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

let allFires = [];

//
let cityLayer, countyLayer; // Layers to toggle between
let showingCounties = true; // Views counties by default

Promise.all([
    d3.json(citiesJSON),
    d3.json(countiesJSON),
    d3.json(firesJSON),
]).then(([cityGeo, countyGeo, fireGeo]) => {
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
        const bounds = path.bounds(d);
  const dx = bounds[1][0] - bounds[0][0];
  const dy = bounds[1][1] - bounds[0][1];
  const x = (bounds[0][0] + bounds[1][0]) / 2;
  const y = (bounds[0][1] + bounds[1][1]) / 2;
  const scale = Math.max(1, Math.min(8, 0.9 / Math.max(dx / width, dy / height)));
//   const translate = [width / 2 - scale * x, height / 2 - scale * y];
const sidebarOffset = 250;  // Match the sidebar width in CSS
const translate = [(width - sidebarOffset) / 2 - scale * x, height / 2 - scale * y];

  svg.transition()
    .duration(750)
    .call(
      zoom.transform,
      d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
    );

  // Fill the sidebar
  const props = d.properties;
  const sidebar = document.getElementById("sidebar");
  const sidebarContent = document.getElementById("sidebarContent");

  sidebar.innerHTML = `
    <button id="closeSidebarBtn" style="float:right;">X</button>
    <h2>${props.NAME || "Unknown County"}</h2>
    <p><strong>Population:</strong> ${props.POP || "N/A"}</p>
    <p><strong>Area:</strong> ${props.AREA || "N/A"} sq mi</p>
  `;
  //sidebar.style.display = "block";
    sidebar.classList.add("visible");
  //document.getElementById("mapContainer").classList.add("with-sidebar");

  // Set up close button
  document.getElementById("closeSidebarBtn").addEventListener("click", () => {
    //sidebar.style.display = "none";
    //document.getElementById("mapContainer").classList.remove("with-sidebar");
    sidebar.classList.remove("visible");
    sidebarContent.innerHTML = "";
  });
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

///////////////////////////////////////////////////////////////////////////
// price graph visualization
///////////////////////////////////////////////////////////////////////////
const zillowDataset = "./data/ZILLOW_DATA_CITIES.csv";
const debugStyle = "outline: 1px solid black"

function processGraphData(rawData){
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
            metro: entry.Metro,
            county: entry.CountyName,
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
    const containerRect = graphContent.node().getBoundingClientRect();
    const transitionTime = 100;

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
            amount: 5
        },
        y: {
            amount: 20
        },
        size: 15
    };
    style.lineGraph.line = {
        width: 1.5
    };

    
}


// get and process dataset
d3.csv(zillowDataset).then(rawData =>{
    console.log("rawData", rawData);

    initGraphStyling();

    // const keys = Object.keys(rawData[0]);
    // console.log("keys", keys);

    // for(let index in keys){
    //     const date = keys[index];
    //     console.log('{date: d3.timeParse("%Y-%m-%d")("' + date + '"), value: entry["' + date + '"] === "NA"? 0 : entry["' + date + '"]},', "\n");
    // }

    // process raw data
    const processedData = processGraphData(rawData);
    console.log("processedData", processedData);

    // create line graph
    createLineGraph(processedData[0]);

    }).catch(function(error){
    console.log(error);
});

function createLineGraph(dataset){
    // get date entries
    console.log("dataset", dataset);
    let dateEntries = [];
    for(let index in dataset.prices){
        dateEntries.push(dataset.prices[index].date);
    }
    console.log("dateEntries", dateEntries);

    // create lineGraph container
    const lineGraph = graphContent.append("g")
        .attr("width", style.lineGraph.width)
        .attr("height", style.lineGraph.height)
        .attr("transform", `translate(${style.lineGraph.offset.x}, ${style.lineGraph.offset.y})`)
        .attr("style", debugStyle)
    ;

    // x range
    const lineGraphX = d3.scaleTime()
        .domain(d3.extent(dateEntries))
        .range([0, style.lineGraph.width])
    ;

    // x axis visual
    const lineGraphTicksX = d3.axisBottom(lineGraphX)
        .ticks(style.lineGraph.ticks.x.amount)
    ;
    lineGraph.append("g")
        .attr("transform", `translate(${style.lineGraph.content.offset.x}, ${style.lineGraph.height + style.lineGraph.content.offset.y})`)
        .call(lineGraphTicksX)
        .attr("font-size", `${style.lineGraph.ticks.size}px`)
    ;
    
    // y range
    const lineGraphY = d3.scaleLinear()
        .domain([  // round down as the precision caused errors in the min max evaluations
            d3.min(dataset.prices, entry => Math.floor(entry.value)),
            d3.max(dataset.prices, entry => Math.floor(entry.value))
        ])
        .range([style.lineGraph.height, 0])
        .nice();

    // y axis visual
    const lineGraphTicksY = d3.axisLeft(lineGraphY)
        .ticks(style.lineGraph.ticks.y.amount)
        .tickFormat(function(tick){
            return tick.toLocaleString("en-US", {style: "currency", currency: "USD"});
        })
    ;
    lineGraph.append("g")
        .attr("transform", `translate(${style.lineGraph.content.offset.x}, ${style.lineGraph.content.offset.y})`)
        .call(lineGraphTicksY)
        .attr("font-size", `${style.lineGraph.ticks.size}px`)
    ;
    // x label
    lineGraph.append("text")
        .attr("x", style.lineGraph.labels.x.offset.x + style.lineGraph.content.offset.x)
        .attr("y", style.lineGraph.labels.x.offset.y + style.lineGraph.content.offset.y)
        .attr("font-size", `${style.lineGraph.labels.size}px`)
        .attr("text-anchor", "middle")
        .text(dataset.name);

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
    lineGraph.append("path")
        .attr("transform", `translate(${style.lineGraph.content.offset.x}, ${style.lineGraph.content.offset.y})`)
        .datum(dataset.prices)
        .attr("fill", "none")
        .attr("stroke", "blue")
        .attr("stroke-width", style.lineGraph.line.width)
        .attr("d", d3.line()
            .x(entry => lineGraphX(entry.date))
            .y(entry => lineGraphY(entry.value))
        )
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
}
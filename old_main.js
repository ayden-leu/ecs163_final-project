let style = {};

// credit for delay function:
// https://stackoverflow.com/questions/14226803/wait-5-seconds-before-executing-next-line
const delay = ms => new Promise(res => setTimeout(res, ms));

// credit for the line graph hover circle source
// (content is outdated though, d3.mouse doesnt exist)
// https://d3-graph-gallery.com/graph/line_cursor.html

// external datasets
// =================
const cityBoundaries = "data/CA_CITIES.json";
const countyBoundaries = "data/FILTERED_COUNTY_LINES.json";
const fireBoundaries = "data/FILTERED_BIG_FIRES.json";
const countyPricesData = "./data/CA_counties.csv";
const cityPricesData = "./data/ZILLOW_DATA_CITIES.csv";

let countyPriceData = {};
let cityPriceData = {};
let selectedCountyName = null;
let selectedCityName = null;

let lineGraphPriceData = null;
let lineGraphPriceDataDates = [];
let lineGraphObj = null;
let countyGraphPriceData = null;
let countyGraphPriceDataDates = [];
let cityGraphPriceData = null;
let cityGraphPriceDataDates = [];

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

// sidebar
let sidebarIsResizing = false;

dragHandle.addEventListener("mousedown", function (event) {
    sidebarIsResizing = true;
    document.body.style.cursor = "ew-resize";
    event.preventDefault();
});

document.addEventListener("mousemove", function (event) {
    if (!sidebarIsResizing) return;

    const newWidth = window.innerWidth - event.clientX;
    const clampedWidth = Math.max(200, Math.min(newWidth, 700)); // optional bounds
    sidebar.style.width = clampedWidth + "px";

    // Optional: dynamically re-render chart based on new width
    // const countyNameHeader = sidebar.querySelector("h2")?.textContent + " County";
    // if (countyNameHeader && countyPriceData[countyNameHeader]) {
    //     const rawRow = countyPriceData[countyNameHeader];
    //     const rawData = Object.entries(rawRow).map(([key, value]) => ({
    //         key,
    //         value,
    //     }));

    //     // drawLineChart(rawData, countyNameHeader);
    // }
});

document.addEventListener("mouseup", function () {
    if (sidebarIsResizing) {
        sidebarIsResizing = false;
        document.body.style.cursor = "default";
    }
});

// load data
let cityLayer, countyLayer; // Layers to toggle between
let showingCounties = true; // Views counties by default

Promise.all([
    d3.json(cityBoundaries),
    d3.json(countyBoundaries),
    d3.json(fireBoundaries),
    d3.csv(countyPricesData, d3.autoType),
    d3.csv(cityPricesData, d3.autoType),
]).then(([cityGeo, countyGeo, fireGeo, countyPrices, cityPrices]) => {
    const validCities = cityGeo.features.filter(getValidGeometry);
    const validCounties = countyGeo.features.filter(getValidGeometry);
    const validFires = fireGeo.features.filter(getValidGeometry);
    // console.log("validCities[0].properties",validCities[0].properties);

    const mapContainer = d3.select("#map");

    // search bar
    searchInput.addEventListener("input", () => {
        const query = searchInput.value.trim().toLowerCase();

        // if there's nothing in the search bar, hide suggestions
        if (!query) {
            searchSuggestions.style.display = "none";
            searchSuggestions.innerHTML = "";
            return;
        }

        const allLocationNames = [
            ...validCounties.map((data) => ({
                name: data.properties.NAME,
                type: "county",
                feature: data,
            })),
            ...validCities.map((data) => ({
                name: data.properties.CITY,
                type: "city",
                feature: data,
            })),
        ];

        const matchingLocations = allLocationNames
            .filter((data) => data.name && data.name.toLowerCase().includes(query))
            .slice(0, 5);

        if (matchingLocations.length === 0) {
            searchSuggestions.style.display = "none";
            searchSuggestions.innerHTML = "";
            return;
        }

        // Show dropdown
        searchSuggestions.style.display = "block";
        searchSuggestions.innerHTML = matchingLocations
            .map((d) => `
                <div class="suggestion-item">
                    ${d.name} <span style="color: #888; font-size: 12px;">(${d.type})</span>
                </div>
            `)
            .join("");

        // Add click handlers
        Array.from(searchSuggestions.children).forEach((child, i) => {
            child.addEventListener("click", () => {
            const selectedLocation = matchingLocations[i];
            searchInput.value = selectedLocation.name;
            searchSuggestions.style.display = "none";

            if (selectedLocation.type === "county") {
                handleCountyClick(null, selectedLocation.feature);
            } else {
                // TODO: load in county data later
                const bounds = path.bounds(selectedLocation.feature);
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

                mapContainer
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

    // console.log("Housing data loaded:", countyPricesData);

    // Process housing data and assign it to a global or scoped variable
    countyPriceData = {};
    countyPrices.forEach((row) => {
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

    const cityPriceData = {};

    cityPrices.forEach((row) => {
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
    //console.log("City price data loaded:", cityPriceData);

    countyGraphPriceData = processPriceData(countyPrices, "X%Y.%m.%d");
    cityGraphPriceData = processPriceData(cityPrices, "%Y-%m-%d");
    //console.log("County graph price data loaded:", cityGraphPriceData);

    if (countyGraphPriceData.length > 0) {
        countyGraphPriceDataDates = countyGraphPriceData[0].prices.map(p => p.date);
    }

    if (cityGraphPriceData.length > 0) {
        cityGraphPriceDataDates = cityGraphPriceData[0].prices.map(p => p.date);
    }

    // Default to county data
    lineGraphPriceData = countyGraphPriceData;
    lineGraphPriceDataDates = countyGraphPriceDataDates;

    initGraphStyling();
    lineGraphObj = createLineGraph();



    const svg = d3.select("#map");

    const containerRect = svg.node().getBoundingClientRect();
    const width = +containerRect.width;
    const height = +containerRect.height;

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
    const zoomGroup = mapContainer.append("g").attr("class", "zoom-layer");

    // create map layers
    const countyLayer = zoomGroup.append("g").attr("class", "counties");
    const cityLayer = zoomGroup.append("g").attr("class", "cities");
    const fireLayer = zoomGroup.append("g").attr("class", "fire-layer");
    const countyLabelLayer = zoomGroup.append("g").attr("class", "county-labels");
    const cityLabelLayer = zoomGroup.append("g").attr("class", "city-labels");

    // zoom functionality for map
    const zoom = d3
        .zoom()
        .scaleExtent([1, 25])
        .on("zoom", (event) => {
            zoomGroup.attr("transform", event.transform);
            const currentZoom = event.transform.k;

            // change opacity of labels based on zoom amount
            let countyOpacity = 0;
            if (currentZoom >= 1.5 && currentZoom < 2.5) {
                countyOpacity = (currentZoom - 1.5) / (2.5 - 1.5);
            } else if (currentZoom >= 2.5 && currentZoom <= 5) {
                countyOpacity = 1;
            } else if (currentZoom > 5 && currentZoom < 9) {
                countyOpacity = 1 - (currentZoom - 5) / (9 - 5);
            } else {
                countyOpacity = 0;
            }

            // City label opacity: fade in from zoom 5 → 10
            const cityOpacity =
                (currentZoom >= 5 && currentZoom < 10)?
                    (currentZoom - 5) / (10 - 5) :
                    (currentZoom >= 10)?
                        1 : 0
            ;

            // County label font size
            countyLabelLayer
                .selectAll("text")
                .attr("opacity", countyOpacity)
                .attr(
                    "font-size",
                    () => `${Math.max(6, 10 - (currentZoom - 1) * 1.5)}px`
                );

            // City label font size: starts smaller, scales very gently
            cityLabelLayer
                .selectAll("text")
                .attr("opacity", cityOpacity)
                .attr(
                    "font-size",
                    () => {
                        const minSize = 0.7;  // at zoom 20
                        const maxSize = 20;  // at zoom 5-6
                        const size = Math.max(minSize, maxSize / currentZoom);
                        return `${size}px`;
                    }
                );
        }
    );
    mapContainer.call(zoom);

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
        .attr("d", path)
        .on("click", handleCityClick);
    ;

    // Names / labels
    countyLabelLayer
        .selectAll("text")
        .data(validCounties)
        .join("text")
        .attr("class", "county-label")
        .attr("transform", (data) => {
            const centroid = path.centroid(data);
            return `translate(${centroid[0]}, ${centroid[1]})`;
        })
        .text((data) => data.properties.NAME)
        .attr("opacity", 0);

    cityLabelLayer
        .selectAll("text")
        .data(validCities)
        .join("text")
        .attr("class", "city-label")
        .attr("transform", (data) => {
            const centroid = path.centroid(data);
            return `translate(${centroid[0]}, ${centroid[1]})`;
        })
        .text((data) => data.properties.CITY)
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

    function drawFiresByYear(year){
        const filtered = validFires.filter(f => f.properties.YEAR_ === year);

        const firePaths = fireLayer
            .selectAll("path.fire")
            .data(
                filtered,
                (data) => data.properties.IRWINID || JSON.stringify(data.geometry)
            );

        firePaths.join(
            (enter) => enter
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
                        .html(`
                            <strong>${
                                props.FIRE_NAME || "Unknown Fire"
                            }</strong><br/>
                            <strong>Year:</strong> ${props.YEAR_ || "N/A"}<br/>
                            <strong>Acres:</strong> ${props.GIS_ACRES?.toLocaleString() || "N/A"}
                        `)
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 28) + "px");
                })
                .on("mousemove", (event) => {
                    tooltip
                        .style("left", (event.pageX + 10) + "px")
                        .style("top", (event.pageY - 28) + "px");
                })
                .on("mouseout", () => {
                    tooltip.style("opacity", 0);
                })
                
                .on("click", (event, data) => updateLineGraphDomainToYear(data.properties.YEAR_)),

            (update) => update,
            (exit) => exit.remove()
        );
    }

// function drawLineChart(data, countyName) {
//     console.log("Drawing line chart for", countyName, "with data:", data);

//     // Clean and filter data
//     const cleanData = data
//         .map(d => {
//             const dateStr = d.value?.date;
//             const rawPrice = d.value?.price;
//             if (!dateStr || rawPrice == null || isNaN(+rawPrice)) return null;
//             return {
//                 date: new Date(dateStr.replace(/\./g, "-")),
//                 price: +rawPrice
//             };
//         })
//         .filter(d => d !== null);

//     if (cleanData.length === 0) {
//         console.warn("No valid data to draw for", countyName);
//         return;
//     }

//      const container = document.getElementById("priceChart");
//     container.innerHTML = ""; // Clear previous SVG

//     const containerWidth = container.clientWidth || 300;
//     const containerHeight = container.clientHeight || 250;

//     const margin = { top: 20, right: 30, bottom: 40, left: 60 },
//         width = containerWidth - margin.left - margin.right,
//         height = containerHeight - margin.top - margin.bottom;

//     const svg = d3.select("#priceChart")
//         .append("svg")
//         .attr("width", width + margin.left + margin.right)
//         .attr("height", height + margin.top + margin.bottom)
//         .append("g")
//         .attr("transform", `translate(${margin.left},${margin.top})`);

//     const x = d3.scaleTime()
//         .domain(d3.extent(cleanData, d => d.date))
//         .range([0, width]);

//     const y = d3.scaleLinear()
//         .domain([0, d3.max(cleanData, d => d.price)]).nice()
//         .range([height, 0]);

//     svg.append("g")
//         .attr("transform", `translate(0, ${height})`)
//         .call(d3.axisBottom(x).tickFormat(d3.timeFormat("%Y")));

//     svg.append("g")
//         .call(d3.axisLeft(y).ticks(6).tickFormat(d3.format("$,.0f")));

//     const line = d3.line()
//         .x(d => x(d.date))
//         .y(d => y(d.price));

//     svg.append("path")
//         .datum(cleanData)
//         .attr("fill", "none")
//         .attr("stroke", "#0077cc")
//         .attr("stroke-width", 2)
//         .attr("d", line);

//     svg.append("text")
//         .attr("x", width / 2)
//         .attr("y", -8)
//         .attr("text-anchor", "middle")
//         .attr("font-size", "14px")
//         .attr("font-weight", "bold")
//         .text(`Median Home Prices: ${countyName}`);
// }

    function handleCountyClick(event, d) {
        const bounds = path.bounds(d);
        const dx = bounds[1][0] - bounds[0][0];
        const dy = bounds[1][1] - bounds[0][1];
        const x = (bounds[0][0] + bounds[1][0]) / 2;
        const y = (bounds[0][1] + bounds[1][1]) / 2;
        const scale = Math.max(1, Math.min(8, 0.9 / Math.max(dx / width, dy / height)));

        const sidebarOffset = 300;
        const translate = [(width - sidebarOffset) / 2 - scale * x, height / 2 - scale * y];

        mapContainer.transition()
            .duration(750)
            .call(
                zoom.transform,
                d3.zoomIdentity.translate(translate[0], translate[1]).scale(scale)
            );
            
        // update sidebar content
        const props = d.properties;

        sidebarContent.style.display = "block";
        sidebarHeader.innerHTML = `${d.properties.CITY} (City)`;

        sidebar.classList.add("visible");
        mainContent.classList.add("with-sidebar");

        // Close logic
        const closeBtn = document.getElementById("closeSidebarButton");
        closeBtn.onclick = () => {
            sidebar.classList.remove("visible");
            mainContent.classList.remove("with-sidebar");
            sidebarContent.style.display = "none";
            selectedCityName = null;
            d3.selectAll(".highlighted").classed("highlighted", false);
        };

        const cityName = d.properties.CITY;
        selectedCityName = cityName;
        selectedCountyName = null;

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
        console.log("Updating line graph for city:", cityName);
        updateLineGraphDomainToAll(cityName);
    }

    function handleCityClick(event, d) {
        // Clear existing highlights
        d3.selectAll(".highlighted").classed("highlighted", false);

        // Highlight the clicked city
        d3.select(this).classed("highlighted", true);
        lineGraphPriceData = cityGraphPriceData;
        //console.log("cityGraphPriceData", lineGraphPriceData);
        lineGraphPriceDataDates = cityGraphPriceDataDates;
        //console.log("lineGraphPriceDataDates", lineGraphPriceDataDates);

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

        sidebarContent.style.display = "block";
        sidebarHeader.innerHTML = `${d.properties.CITY} (City)`;

        sidebar.classList.add("visible");
        mainContent.classList.add("with-sidebar");

        // Close logic
        const closeBtn = document.getElementById("closeSidebarButton");
        closeBtn.onclick = () => {
            sidebar.classList.remove("visible");
            mainContent.classList.remove("with-sidebar");
            sidebarContent.style.display = "none";
            selectedCityName = null;
            d3.selectAll(".highlighted").classed("highlighted", false);
        };

        const cityName = d.properties.CITY;
        selectedCityName = cityName;
        selectedCountyName = null;

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
        console.log("Updating line graph for city:", cityName);
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
const debugStyle = "" //"outline: 1px solid black"

function processPriceData(rawData, dateFormat){
    // RegionID,SizeRank,RegionName,RegionType,StateName,State,Metro,CountyName,
    // example date format:
    //      city dataset: 2000-01-31
    //      county dataset: X2000.01.31
    // each entry is the end of each month from 2000 to April 2025
    const numToRemove = 8;

    let dates = null;
    function getPrices(entry){
        const prices = [];

        // get all date entries
        if(dates === null){
            dates = Object.keys(entry);
            dates = dates.slice(numToRemove+1);
        }

        for(let date of dates){
            prices.push({
                date: d3.timeParse(dateFormat)(date),
                value: entry[date] === "NA"? 0 : entry[date]
            });
        }
        return prices;
    }
    
    return rawData.map(entry => {
        return {
            // id: Number(entry.RegionID),
            // rank: entry.SizeRank,
            name: entry.RegionName,
            // metro: entry.Metro,
            county: entry.CountyName,
            prices: getPrices(entry)
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
    // const selectedCity = getEntryByAspect(lineGraphPriceData, "name", countyProps.NAME + " County");
const match = getEntryByAspect(lineGraphPriceData, "name", regionName);
console.log("Data object:", match);
    console.log(lineGraphObj.x);
    lineGraphObj.x.tickFormat = function(date){
        return d3.timeFormat("'%y")(date);
    }
    lineGraphObj.x.domain = d3.extent(lineGraphPriceDataDates);
    console.log("DEBUG");
    if(lineGraphObj.currentRegionData !== null){
        lineGraphObj.y.domain = [  // round down as the precision caused errors in the min max evaluations
            d3.min(lineGraphObj.currentRegionData.prices, entry => Math.floor(entry.value)),
            d3.max(lineGraphObj.currentRegionData.prices, entry => Math.floor(entry.value))
        ];
        console.log("lineGraphObj.y.domain", lineGraphPriceData);
    }
    else
    {
        console.log("PROBLEM");
    }
    //console.log("lineGraphObj.y.domain", lineGraphObj.y.domain);
    updateLineGraph(regionName);
}

// get and process dataset
// d3.csv(countyPricesData).then(rawData =>{
//     //console.log("rawData", rawData);

//     initGraphStyling();

//     // process raw data
//     lineGraphPriceData = processCountyData(rawData);
//     //console.log("lineGraphPriceData", lineGraphPriceData);

//     // get date range
//     for(let index in lineGraphPriceData[0].prices){
//         lineGraphPriceDataDates.push(lineGraphPriceData[0].prices[index].date);
//     }
//     //console.log("lineGraphPriceDataDates", lineGraphPriceDataDates);
    
//     // create line graph
//     lineGraphObj = createLineGraph();

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
    console.log("Checking data for region:", regionName);
    console.log("Data object:", lineGraphObj.currentRegionData);
    // if data is null, then don't update the data used in the graph
    if(regionName !== null){
        lineGraphObj.currentRegionData = getEntryByAspect(lineGraphPriceData, "name", regionName);
        lineGraphObj.y.domain = [  // round down as the precision caused errors in the min max evaluations
            d3.min(lineGraphObj.currentRegionData.prices, entry => Math.floor(entry.value)),
            d3.max(lineGraphObj.currentRegionData.prices, entry => Math.floor(entry.value))
        ];
    }

    const data = lineGraphObj.currentRegionData;
    console.log("egg", data);

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

    console.log("label object:", lineGraphObj.x.label);
    console.log("typeof label:", typeof lineGraphObj.x.label);
    console.log("Setting label to:", data.name);
    //lineGraphObj.x.label.text(data.name);
    lineGraphObj.x.label.text(data.name);
    console.log("Label element after setting:", lineGraphObj.x.label.node().outerHTML);
    
    setTimeout(() => {
        console.log("Final label:", lineGraphObj.x.label.text());
    }, 1000);

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


// const sidebar = document.getElementById("sidebar");

// const resizeObserver = new ResizeObserver(() => {
//   if (selectedCountyName && countyPriceData[selectedCountyName]) {
//     const rawRow = countyPriceData[selectedCountyName];
//     const rawData = Object.entries(rawRow).map(([key, value]) => ({
//       key,
//       value,
//     }));

//     console.log("countn may", selectedCountyName);

//     // drawLineChart(rawData, selectedCountyName);
//   }
// });

// resizeObserver.observe(sidebar);

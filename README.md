# California Wildfire and Housing Visualization
This project visualizes California wildfire data alongside housing price trends at the city and county level.
It uses D3.js to display interactive geographic visualizations in the browser.

## Motivations and Goals
California’s wildfires are growing more frequent and severe, with major economic impacts that go far beyond immediate destruction. In particular, wildfires reshape housing markets by damaging community reputation, increasing risk, and affecting affordability. Yet it’s difficult for homeowners, buyers, and policymakers to understand these long-term effects.

Our project builds an interactive visualization that lets users explore how wildfires from 2000 to 2023 have affected California housing markets. Using a combination of wildfire perimeter data and Zillow housing prices, the tool helps users visualize trends and analyze how specific fires impacted different cities and counties over time.

## Overview
The goal of this project is to explore relationships between wildfire events and housing price trends across California.
It loads geospatial and temporal datasets for interactive web-based analysis. The interface is designed with a “Martini Glass” storytelling approach — starting broad and guiding users into more detailed exploration.

We chose a map-based design because it gives users a clear sense of scale and geographic impact, and combined it with temporal data to reveal price trends before and after wildfire events.

The visual interface allows users to view:

- Historic wildfire activity (2000–2023)

- Housing price trends by city and county

## Data & Processing
We integrated two core datasets:

- Zillow Home Value Index (ZHVI): City and county level housing prices, monthly from 2000 to 2023.

- California Fire Perimeters: Fire boundaries, dates, and sizes from the California Natural Resources Agency.

To keep the interface performing fast, we filtered the wildfire data to fires over 1000 acres and optimized all geographic files with R, Python, and Mapshaper. We also aligned temporal data so that housing and fire timelines match up cleanly.

## File Structure
```
  data/
  │   FILTERED_BIG_FIRES.json <-- json data for fires
  │   FILTERED_CITY_LINES.json <-- json data for cities
  │   FILTERED_COUNTY_LINES.json <-- json data for counties
  │   FIRE_DB_1000PLUS_ACRES.csv
  │   ZILLOW_DATA_CITIES.csv <-- zillow data for cities
  │   ZILLOW_DATA_COUNTIES.csv <-- zillow data for counties
  │
  extra/ <-- all old files used to help filter data
  │   CountyLineParser.py
  │   FireParser.py
  │   fires.R
  │   housingpricedata.R 
  │
  .gitignore
  index.html <-- main webpage html
  main.js <-- all code here
  README.md
  style.css <-- stylesheet
```

## Installation
Installation
To install and set up the project:

1. Clone the repository to your local machine:

2. Open the project folder in Visual Studio Code.

3. (Recommended) Install the Live Server extension in VS Code.

## Execution
The recommended way to run the project is to use Live Server in VS Code:

1. Right-click on *index.html* in the file explorer.

2. Select “Open with Live Server.”
- The project will launch in your browser.
- All data loads locally — no additional server or dependencies are required.

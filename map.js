// Step 1.1: Import Mapbox GL JS and D3
import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

// Step 1.3: Initialize the map
mapboxgl.accessToken = 'pk.eyJ1IjoiamFkZW52b28iLCJhIjoiY21oeWE1cXo2MDl6YTJyb3F4anVrZHJwdCJ9.NMjZMTzea173kqR8kw4H_g';

const map = new mapboxgl.Map({
  container: 'map', // ID of the div where the map will render
  style: 'mapbox://styles/mapbox/streets-v12', // Map style
  center: [-71.09415, 42.36027], // [longitude, latitude]
  zoom: 12, // Initial zoom level
  minZoom: 5, // Minimum allowed zoom
  maxZoom: 18, // Maximum allowed zoom
});

// Step 3.2: Append SVG inside #map (exactly as instructions)
const svg = d3.select('#map').select('svg');

console.log('Mapbox GL JS Loaded:', mapboxgl);

// Helper function to convert station coordinates to pixel coordinates
function getCoords(station) {
  const point = new mapboxgl.LngLat(+station.lon, +station.lat); // Convert lon/lat to Mapbox LngLat
  const { x, y } = map.project(point); // Project to pixel coordinates
  return { cx: x, cy: y }; // Return as object for use in SVG attributes
}

// Wait for map to load
map.on('load', async () => {

  // Step 2.1: Add Boston bike lanes
  map.addSource('boston_route', {
    type: 'geojson',
    data: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson',
  });
  map.addLayer({
    id: 'bike-lanes-boston',
    type: 'line',
    source: 'boston_route',
    paint: { 'line-color': 'blue', 'line-width': 3, 'line-opacity': 0.4 },
  });

  // Step 2.3: Add Cambridge bike lanes
  try {
    const cambridgeLanes = await d3.json(
      'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson'
    );
    map.addSource('cambridge_route', { type: 'geojson', data: cambridgeLanes });
    map.addLayer({
      id: 'bike-lanes-cambridge',
      type: 'line',
      source: 'cambridge_route',
      paint: { 'line-color': 'blue', 'line-width': 3, 'line-opacity': 0.4 },
    });
  } catch (error) {
    console.error('Error loading Cambridge bike lanes:', error);
  }

  // Step 3.1: Load Bluebikes stations
  let stations = [];
  try {
    const jsonUrl = 'https://dsc106.com/labs/lab07/data/bluebikes-stations.json';
    const jsonData = await d3.json(jsonUrl);
    console.log('Loaded JSON Data:', jsonData);
    stations = jsonData.data.stations; // use all stations
    console.log('Stations Array:', stations);
  } catch (error) {
    console.error('Error loading stations:', error);
  }

  // Step 4.1: Load traffic data
  let trips = [];
  try {
    trips = await d3.csv(
      'https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv',
      (d) => {
        d.started_at = new Date(d.started_at);
        d.ended_at = new Date(d.ended_at);
        return d;
      }
    );
    console.log('Trips loaded:', trips.length);
  } catch (error) {
    console.error('Error loading trips:', error);
  }

  // Step 4.2: Compute traffic
  const departures = d3.rollup(trips, v => v.length, d => d.start_station_id);
  const arrivals = d3.rollup(trips, v => v.length, d => d.end_station_id);

  stations = stations.map(station => {
    const id = station.short_name;
    station.departures = departures.get(id) ?? 0;
    station.arrivals = arrivals.get(id) ?? 0;
    station.totalTraffic = station.departures + station.arrivals;
    return station;
  });

  console.log('Stations with traffic:', stations);


  // Step 4.3: Circle radius scale
  const radiusScale = d3.scaleSqrt()
    .domain([0, d3.max(stations, d => d.totalTraffic)])
    .range([0, 25]);

  // Step 3.3 / 4.3: Append circles
  const circles = svg.selectAll('circle')
    .data(stations)
    .enter()
    .append('circle')
    .attr('r', d => radiusScale(d.totalTraffic))
    .attr('fill', 'red')   // visible red
    .attr('stroke', 'black')
    .attr('stroke-width', 0.5)
    .attr('opacity', 0.5)
    .each(function (d) {
      // Add <title> for browser tooltips
      d3.select(this)
        .append('title')
        .text(
          `${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`,
        );
    });

  // Add tooltips without breaking selection
  circles.each(function (d) {
    d3.select(this)
      .append('title')
      .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
  });

  // Step 3.3: Update positions
  function updatePositions() {
    circles
      .attr('cx', (d) => getCoords(d).cx) // Set the x-position using projected coordinates
      .attr('cy', (d) => getCoords(d).cy); // Set the y-position using projected coordinates
  }

  // Initial position update when map loads
  updatePositions();

  // Reposition on map interaction
  map.on('move', updatePositions);
  map.on('zoom', updatePositions);
  map.on('resize', updatePositions);
  map.on('moveend', updatePositions);
});

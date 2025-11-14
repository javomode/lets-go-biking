import mapboxgl from 'https://cdn.jsdelivr.net/npm/mapbox-gl@2.15.0/+esm';
import * as d3 from 'https://cdn.jsdelivr.net/npm/d3@7.9.0/+esm';

mapboxgl.accessToken = 'pk.eyJ1IjoiamFkZW52b28iLCJhIjoiY21oeWE1cXo2MDl6YTJyb3F4anVrZHJwdCJ9.NMjZMTzea173kqR8kw4H_g';

const map = new mapboxgl.Map({
  container: 'map',
  style: 'mapbox://styles/mapbox/streets-v12',
  center: [-71.09415, 42.36027],
  zoom: 12,
});

const svg = d3.select('#map').select('svg');
let circles;
let stations = [];
let trips = [];
let stationFlow = d3.scaleQuantize().domain([0, 1]).range([0, 0.5, 1]);

// Helper functions
function getCoords(station) {
  const lat = Number(station.lat ?? station.Latitude);
  const lon = Number(station.lon ?? station.Longitude);

  if (isNaN(lat) || isNaN(lon)) {
    console.warn("Invalid coordinates for station:", station);
    return { cx: -1000, cy: -1000 };
  }

  const point = new mapboxgl.LngLat(lon, lat);
  return map.project(point);
}

function minutesSinceMidnight(date) {
  return date.getHours() * 60 + date.getMinutes();
}

function formatTime(minutes) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}:${m.toString().padStart(2, '0')}`;
}

function computeStationTraffic(stations, trips) {
  const departures = d3.rollup(trips, v => v.length, d => d.start_station_id);
  const arrivals = d3.rollup(trips, v => v.length, d => d.end_station_id);

  return stations.map(station => {
    const id = station.short_name;
    station.departures = departures.get(id) ?? 0;
    station.arrivals = arrivals.get(id) ?? 0;
    station.totalTraffic = station.departures + station.arrivals;
    return station;
  });
}

function filterTripsByTime(trips, timeFilter) {
  if (timeFilter === -1) return trips;
  return trips.filter(d => {
    const start = minutesSinceMidnight(d.started_at);
    const end = minutesSinceMidnight(d.ended_at);
    return Math.abs(start - timeFilter) <= 60 || Math.abs(end - timeFilter) <= 60;
  });
}

map.on('load', async () => {
  // Add Boston & Cambridge bike lanes
  const sources = [
    { id: 'boston_route', url: 'https://bostonopendata-boston.opendata.arcgis.com/datasets/boston::existing-bike-network-2022.geojson' },
    { id: 'cambridge_route', url: 'https://raw.githubusercontent.com/cambridgegis/cambridgegis_data/main/Recreation/Bike_Facilities/RECREATION_BikeFacilities.geojson' }
  ];

  sources.forEach(src => {
    map.addSource(src.id, { type: 'geojson', data: src.url });
    map.addLayer({
      id: `bike-lanes-${src.id}`,
      type: 'line',
      source: src.id,
      paint: { 'line-color': 'blue', 'line-width': 3, 'line-opacity': 0.6 }
    });
  });

  // Load data
  const stationsJson = await d3.json('https://dsc106.com/labs/lab07/data/bluebikes-stations.json');
  stations = stationsJson.data.stations;

  trips = await d3.csv('https://dsc106.com/labs/lab07/data/bluebikes-traffic-2024-03.csv', d => {
    d.started_at = new Date(d.started_at);
    d.ended_at = new Date(d.ended_at);
    return d;
  });

  stations = computeStationTraffic(stations, trips);

  const radiusScale = d3.scaleSqrt()
    .domain([0, d3.max(stations, d => d.totalTraffic)])
    .range([1, 40]);

  // Add circles
  circles = svg.selectAll('circle')
    .data(stations)
    .enter()
    .append('circle')
    .attr('r', d => radiusScale(d.totalTraffic))
    .attr('stroke', 'red')
    .attr('stroke-width', 0.5)
    .attr('opacity', 0.7)
    .each(function (d) {
      d3.select(this)
        .append('title')
        .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);

      d3.select(this)
        .style('--departure-ratio', !d.totalTraffic ? '50%' : (d.departures / d.totalTraffic * 100) + '%');
    });

  function updatePositions() {
    circles
      .attr('cx', d => getCoords(d).x)
      .attr('cy', d => getCoords(d).y);
  }

  function updateScatterPlot(timeFilter) {
    const filteredTrips = filterTripsByTime(trips, timeFilter);
    const filteredStations = computeStationTraffic(stations, filteredTrips);

    circles.data(filteredStations)
      .attr('r', d => radiusScale(d.totalTraffic))
      .each(function (d) {
        d3.select(this).select('title')
          .text(`${d.totalTraffic} trips (${d.departures} departures, ${d.arrivals} arrivals)`);
        d3.select(this)
          .style('--departure-ratio', !d.totalTraffic ? '50%' : (d.departures / d.totalTraffic * 100) + '%');
      });

    updatePositions();
  }

  // Initial render
  updateScatterPlot(-1);

  // Slider
  const slider = document.getElementById('time-slider');
  const selectedTime = document.getElementById('selected-time');
  const anyTimeLabel = document.getElementById('any-time');

  slider.addEventListener('input', () => {
    const t = Number(slider.value);
    if (t === -1) {
      selectedTime.textContent = '';
      anyTimeLabel.style.display = 'inline';
    } else {
      selectedTime.textContent = formatTime(t);
      anyTimeLabel.style.display = 'none';
    }
    updateScatterPlot(t);
  });

  // Update positions on map movements
  map.on('move', updatePositions);
  map.on('zoom', updatePositions);
  map.on('resize', updatePositions);
});

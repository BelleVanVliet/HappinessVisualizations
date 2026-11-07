// Draws and recolors the map. main.js owns the country selection and year.
export async function createMap(initialData, onCountryClick) {
  const width = 960;
  const height = 510;
  let dataByCountry = new Map();

// Match World Atlas country names to names in our CSV.
const aliases = {
  "United States of America": "United States",
  "Russia": "Russian Federation",
  "South Korea": "Republic of Korea",
  "Vietnam": "Viet Nam",
  "Turkey": "Türkiye",
  "Laos": "Lao PDR",
  "Moldova": "Republic of Moldova",
  "Dem. Rep. Congo": "DR Congo",
  "Côte d'Ivoire": "Côte d’Ivoire",
  "Macedonia": "North Macedonia",
  "Palestine": "State of Palestine",
  "Taiwan": "Taiwan Province of China"
};

  function getCountryData(feature) {
    const name = feature.properties.name;
    return dataByCountry.get(aliases[name] ?? name);
  }

  const atlasUrl = "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json";
  const world = await d3.json(atlasUrl);
  const countries = topojson.feature(world, world.objects.countries).features;
  // "ill-advised angry rainbow scale" - official D3.js documentation
  const color = d3.scaleSequential(d3.interpolateOranges).domain([0, 10]);
  const projection = d3.geoNaturalEarth1()
    .fitExtent([[12, 12], [width - 12, height - 12]], { type: "Sphere" });
  const path = d3.geoPath(projection);

  const svg = d3.select("#map").append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr("aria-label", "Interactive world happiness choropleth map");
  const mapLayer = svg.append("g");
  const tooltip = d3.select("body")
  .append("div")
  .attr("class", "map-tooltip")
  .style("opacity", 0);
  const countryPaths = mapLayer.selectAll(".country")
    .data(countries).join("path")
    .attr("class", "country")
    .attr("d", path)
    .on("click", (event, feature) => {
      const row = getCountryData(feature);
      if (row) onCountryClick(row.Country);
    })
    .on("mouseenter", function(event, feature) {
      //TODO change border color
      // raise country to avoid funky outline issue
      // before countries that overlapped made the border seem thinner in places
      d3.select(this).raise(); 
      const row = getCountryData(feature);

      tooltip
        .style("opacity", 1)
        .html(row
          ? `<strong>${row.Country}</strong><br>
            Region: ${row.Region}<br>
            Happiness Score: ${row["Happiness Score"]}`
          : `${feature.properties.name}<br>No data`);
    })
    .on("mousemove", function(event) {
      tooltip
        .style("left", `${event.pageX + 12}px`)
        .style("top", `${event.pageY + 12}px`);
    })
    .on("mouseleave", function() {
      tooltip.style("opacity", 0);
    });


  const zoom = d3.zoom()
    .scaleExtent([1, 8])
    .translateExtent([[0, 0], [width, height]])
    .extent([[0, 0], [width, height]])
    .clickDistance(5)
    .on("zoom", event => mapLayer.attr("transform", event.transform));
  svg.call(zoom);
  svg.on("dblclick.zoom", null);

  function updateData(rows) {
    dataByCountry = new Map(rows.map(row => [row.Country, row]));
    countryPaths
      .attr("fill", feature => {
        const row = getCountryData(feature);
        return row && Number.isFinite(row["Happiness Score"])
          ? color(row["Happiness Score"])
          : "#d6d9df";
      })
      .classed("no-data", feature => !getCountryData(feature));
  }

  function updateSelection(selectedCountries) {
    const hasSelection = selectedCountries.size > 0;
    countryPaths.classed("unselected", feature => {
      const row = getCountryData(feature);
      return hasSelection && (!row || !selectedCountries.has(row.Country));
    });
  }

  function resetZoom() {
    svg.transition().duration(300).call(zoom.transform, d3.zoomIdentity);
  }

  updateData(initialData);
  return { updateData, updateSelection, resetZoom };
}

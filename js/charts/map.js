
export async function createMap(
  initialRows,
  onCountryClick,
  rankDomain
) {
  const width = 960;
  const height = 510;

  let dataByCountry = new Map();
  let selectedCountries = new Set();

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

  const world = await d3.json(
    "https://cdn.jsdelivr.net/npm/world-atlas@2/countries-50m.json"
  );

  const countries = topojson.feature(
    world,
    world.objects.countries
  ).features;

  // Rank 1 is the happiest country.
  // Reverse the color scale domain so lower
  // numerical ranks get darker colors.

  const [minRank, maxRank] = rankDomain;

  const rankRange = [maxRank, minRank];

  // Selected countries: orange.
  const orange = d3.scaleSequential()
    .domain(rankRange)
    .interpolator(t => d3.interpolateOranges(0.2 + t * 0.65));

  // Unselected countries:
  // light sequential grayscale.
  const gray = d3.scaleSequential()
    .domain(rankRange)
    .interpolator(
      d3.interpolateRgb("#f2f3f5", "#bcc1c9")
    );

  const noDataColor = "#e1e4e9";

  const projection = d3.geoNaturalEarth1()
    .fitExtent(
      [[12, 12], [width - 12, height - 12]],
      { type: "Sphere" }
    );

  const path = d3.geoPath(projection);

  const svg = d3.select("#map")
    .append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr(
      "aria-label",
      "Interactive happiness ranking world map"
    );

  const mapLayer = svg.append("g");

  const tooltip = d3.select("body")
    .append("div")
    .attr("class", "map-tooltip")
    .style("opacity", 0);

  function rowFor(feature) {
    const atlasName = feature.properties.name;

    return dataByCountry.get(
      aliases[atlasName] ?? atlasName
    );
  }

  const countryPaths = mapLayer
    .selectAll(".country")
    .data(countries)
    .join("path")
    .attr("class", "country")
    .attr("d", path)

    .on("click", (event, feature) => {
      const row = rowFor(feature);

      if (row) {
        onCountryClick(row.Country);
      }
    })

    .on("mouseenter", (event, feature) => {
      const row = rowFor(feature);

      const title =
        row?.Country ?? feature.properties.name;

      const rank = Number(
        row?.["Happiness Rank"]
      );

      const rankText =
        Number.isFinite(rank) && rank > 0
          ? rank
          : "No data";

      tooltip
        .style("opacity", 1)
        .text(
          `${title} | Happiness Rank: ${rankText}`
        );
    })

    .on("mousemove", event => {
      tooltip
        .style("left", `${event.pageX + 12}px`)
        .style("top", `${event.pageY + 12}px`);
    })

    .on("mouseleave", () => {
      tooltip.style("opacity", 0);
    });

  // -----------------------------------
  // Map zoom and pan
  // -----------------------------------

  const zoom = d3.zoom()
    .filter(event =>
      event.type !== "wheel" ||
      event.ctrlKey ||
      event.metaKey
    )
    .scaleExtent([1, 8])
    .translateExtent([
      [0, 0],
      [width, height]
    ])
    .extent([
      [0, 0],
      [width, height]
    ])
    .clickDistance(5)
    .on("zoom", event => {
      mapLayer.attr(
        "transform",
        event.transform
      );
    });

  svg.call(zoom);
  svg.on("dblclick.zoom", null);

  // -----------------------------------
  // Recolor countries by rank
  // -----------------------------------

  function repaint() {
    const hasSelection =
      selectedCountries.size > 0;

    countryPaths.attr("fill", feature => {
      const row = rowFor(feature);

      const rank = Number(
        row?.["Happiness Rank"]
      );

      if (
        !row ||
        !Number.isFinite(rank) ||
        rank < 1
      ) {
        return noDataColor;
      }

      const isSelected =
        selectedCountries.has(row.Country);

      // If any countries are selected,
      // unselected countries become gray,
      // but continue encoding rank.
      if (hasSelection && !isSelected) {
        return gray(rank);
      }

      return orange(rank);
    });

    countryPaths.classed(
      "no-data",
      feature => !rowFor(feature)
    );
  }

  function updateData(rows) {
    dataByCountry = new Map(
      rows.map(row => [
        row.Country,
        row
      ])
    );

    repaint();
  }

  function updateSelection(nextCountries) {
    selectedCountries = new Set(nextCountries);
    repaint();
  }

  function resetZoom() {
    svg.transition()
      .duration(350)
      .call(
        zoom.transform,
        d3.zoomIdentity
      );
  }

  updateData(initialRows);

  return {
    updateData,
    updateSelection,
    resetZoom
  };
}

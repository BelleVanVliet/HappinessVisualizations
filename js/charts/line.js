
export function createLineChart(allRows, years) {
  const W = 520;
  const H = 252;

  const margin = {
    top: 30,
    right: 17,
    bottom: 32,
    left: 17
  };

  const orange = "#f65d0a";
  const gray = "#a5a8b0";

  const x = d3.scaleLinear()
    .domain(d3.extent(years))
    .range([
      margin.left + 12,
      W - margin.right - 12
    ]);

  // Fixed y-scale based on the ENTIRE dataset.
  // Selecting countries never changes the scale.
  const maxScore = d3.max(
    allRows,
    row => row["Happiness Score"]
  );

  const y = d3.scaleLinear()
    .domain([0, maxScore])
    .range([
      H - margin.bottom,
      margin.top
    ]);

  const seriesLine = d3.line()
    .defined(d => Number.isFinite(d.value))
    .x(d => x(d.year))
    .y(d => y(d.value));

  const svg = d3.select("#line-chart")
    .append("svg")
    .attr("viewBox", `0 0 ${W} ${H}`)
    .attr("role", "img")
    .attr(
      "aria-label",
      "Happiness score over time for selected countries versus global average"
    );

  // Only show the x-axis years.
  // No y-axis labels.
  const axis = svg.append("g")
    .attr("class", "x-axis")
    .attr(
      "transform",
      `translate(0,${H - margin.bottom})`
    );

  axis.call(
    d3.axisBottom(x)
      .tickValues(years)
      .tickFormat(d3.format("d"))
      .tickSize(0)
  );

  axis.select(".domain")
    .attr("stroke", "#c1c9d5");

  axis.selectAll("text")
    .attr("dy", "1.55em");

  // Lines and ordinary data points.
  const grayPath = svg.append("path")
    .attr("class", "line-global");

  const orangePath = svg.append("path")
    .attr("class", "line-selected");

  const grayPoints = svg.append("g")
    .attr("class", "global-points");

  const orangePoints = svg.append("g")
    .attr("class", "selected-points");

  // Vertical hover guide.
  const guide = svg.append("line")
    .attr("class", "chart-guide")
    .attr("y1", margin.top - 6)
    .attr("y2", H - margin.bottom)
    .style("display", "none");

  const focusDots = svg.append("g")
    .style("pointer-events", "none");

  // Transparent hover area.
  const hitArea = svg.append("rect")
    .attr("x", margin.left)
    .attr("y", 0)
    .attr(
      "width",
      W - margin.left - margin.right
    )
    .attr(
      "height",
      H - margin.bottom + 7
    )
    .attr("fill", "transparent")
    .style("cursor", "crosshair");

  const tooltip = d3.select("#chart-tooltip");
  const key = d3.select("#chart-key");

  let chartSelection = [];
  let selectedSeries = [];
  let globalSeries = [];

  let visibleYear = years.at(-1);
  let hoveredYear = null;

  const number = value =>
    Number.isFinite(value)
      ? value.toFixed(2)
      : "No data";

  function displayName() {
    if (chartSelection.length === 1) {
      return chartSelection[0];
    }

    if (chartSelection.length === 2) {
      return chartSelection.join(" and ");
    }

    return "Selected countries (average)";
  }

  function hideFocus() {
    hoveredYear = null;

    guide.style("display", "none");

    focusDots
      .selectAll("circle")
      .remove();

    tooltip.property("hidden", true);
  }

  // Highlight the nearest visible year.
  function showFocus(year) {
    if (year > visibleYear) {
      return hideFocus();
    }

    hoveredYear = year;

    const primary = selectedSeries.find(
      d => d.year === year
    );

    const baseline = globalSeries.find(
      d => d.year === year
    );

    if (
      !primary ||
      !Number.isFinite(primary.value)
    ) {
      return hideFocus();
    }

    guide
      .style("display", null)
      .attr("x1", x(year))
      .attr("x2", x(year));

    const focusValues = [
      {
        series: "selected",
        value: primary.value,
        color: orange
      }
    ];

    // Only show the gray point when countries are selected.
    if (
      chartSelection.length &&
      Number.isFinite(baseline?.value)
    ) {
      focusValues.push({
        series: "global",
        value: baseline.value,
        color: gray
      });
    }

    // Slightly enlarged solid points.
    // No white centers.
    focusDots
      .selectAll("circle")
      .data(focusValues, d => d.series)
      .join("circle")
      .attr("cx", x(year))
      .attr("cy", d => y(d.value))
      .attr(
        "r",
        d => d.series === "selected" ? 7 : 5.4
      )
      .attr("fill", d => d.color);

    // Build the tooltip safely.
    tooltip.html("");
    tooltip.append("strong").text(year);

    function makeValue(color, label, value) {
      const row = tooltip.append("div")
        .attr("class", "tooltip-row");

      row.append("span")
        .attr("class", "tooltip-dot")
        .style("background", color);

      row.append("span")
        .text(
          `${label}: ${number(value)}`
        );
    }

    makeValue(
      orange,
      chartSelection.length
        ? displayName()
        : "Global average",
      primary.value
    );

    if (chartSelection.length) {
      makeValue(
        gray,
        "Global average",
        baseline?.value
      );
    }

    tooltip.property("hidden", false);

    // Convert SVG coordinates to displayed CSS pixels.
    const width = document
      .getElementById("line-chart")
      .getBoundingClientRect()
      .width;

    const px = x(year) * width / W;
    const tipWidth = tooltip.node().offsetWidth;

    const left = Math.max(
      4,
      Math.min(
        width - tipWidth - 4,
        px - tipWidth / 2
      )
    );

    tooltip
      .style("left", `${left}px`)
      .style("top", "-4px");
  }

  // Snap the hover interaction to exactly one year.
  hitArea
    .on("pointermove", event => {
      const [pointerX] = d3.pointer(
        event,
        svg.node()
      );

      const shownYears = years.filter(
        year => year <= visibleYear
      );

      const nearest = d3.least(
        shownYears,
        year => Math.abs(
          x(year) - pointerX
        )
      );

      if (nearest !== undefined) {
        showFocus(nearest);
      }
    })
    .on("pointerleave", hideFocus);

  // Draw a single line series and its data points.
  function drawSeries(
    group,
    pathNode,
    data,
    cssClass,
    radius
  ) {
    pathNode
      .datum(data)
      .attr("d", seriesLine);

    group
      .selectAll("circle")
      .data(
        data.filter(d => Number.isFinite(d.value)),
        d => d.year
      )
      .join(
        enter => enter
          .append("circle")
          .attr("class", cssClass)
          .attr("r", 0)
          .attr("cx", d => x(d.year))
          .attr("cy", d => y(d.value))
          .call(enter =>
            enter
              .transition()
              .duration(220)
              .attr("r", radius)
          ),

        update => update
          .attr("cx", d => x(d.year))
          .attr("cy", d => y(d.value))
          .attr("r", radius),

        exit => exit.remove()
      );
  }

  // Render the graph through a particular animation year.
  function render(
    rowsByYear,
    selectedCountries,
    throughYear
  ) {
    chartSelection = [...selectedCountries].sort();
    visibleYear = throughYear;

    // Average of ALL countries for each year.
    globalSeries = years.map(year => ({
      year,
      value: d3.mean(
        rowsByYear.get(year) ?? [],
        d => d["Happiness Score"]
      )
    }));

    // Average of only selected countries for each year.
    // When none are selected, use the global average.
    selectedSeries = years.map(year => ({
      year,
      value: chartSelection.length
        ? d3.mean(
            (rowsByYear.get(year) ?? [])
              .filter(d =>
                selectedCountries.has(d.Country)
              ),
            d => d["Happiness Score"]
          )
        : globalSeries.find(
            d => d.year === year
          ).value
    }));

    // Reveal only the years reached by playback.
    const visibleGlobal = globalSeries.filter(
      d => d.year <= visibleYear
    );

    const visibleSelected = selectedSeries.filter(
      d => d.year <= visibleYear
    );

    // Hide the gray global-average line when all
    // countries are represented by the orange line.
    grayPath.style(
      "display",
      chartSelection.length ? null : "none"
    );

    grayPoints.style(
      "display",
      chartSelection.length ? null : "none"
    );

    if (chartSelection.length) {
      drawSeries(
        grayPoints,
        grayPath,
        visibleGlobal,
        "point-global",
        3.25
      );
    }

    drawSeries(
      orangePoints,
      orangePath,
      visibleSelected,
      "point-selected",
      4.3
    );

    // Update chart legend.
    key.html("");

    function addKey(label, color, isPrimary) {
      const item = key.append("div")
        .attr("class", "key-item");

      item.append("span")
        .attr(
          "class",
          `key-line ${
            isPrimary ? "key-primary" : "key-global"
          }`
        )
        .style("background", color);

      item.append("span")
        .text(label);
    }

    addKey(
      chartSelection.length
        ? displayName()
        : "Global average",
      orange,
      true
    );

    if (chartSelection.length) {
      addKey("Global average", gray, false);
    }

    // Update or hide the tooltip when the animation changes.
    if (hoveredYear !== null) {
      if (hoveredYear <= visibleYear) {
        showFocus(hoveredYear);
      } else {
        hideFocus();
      }
    }
  }

  return {
    render,
    hideFocus
  };
}

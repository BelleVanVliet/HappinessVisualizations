
import { createMap } from "./charts/map.js";
import { createLineChart } from "./charts/line.js";

async function main() {
  if (
    typeof d3 === "undefined" ||
    typeof topojson === "undefined"
  ) {
    throw new Error("D3 or TopoJSON failed to load.");
  }

  // -----------------------------------
  // Load data
  // -----------------------------------

  const csvPath = "./data/world_happiness.csv";

  const response = await fetch(csvPath);

  if (!response.ok) {
    throw new Error(
      `Could not load ${csvPath} (HTTP ${response.status}).`
    );
  }

  const allRows = d3.csvParse(
    await response.text(),
    d3.autoType
  ).filter(d =>
    Number.isFinite(d.Year) &&
    Number.isFinite(d["Happiness Score"])
  );

  if (!allRows.length) {
    throw new Error(
      "No usable happiness scores found."
    );
  }

  // Fixed rank scale across the entire dataset.
  const ranks = allRows
    .map(d => Number(d["Happiness Rank"]))
    .filter(n =>
      Number.isFinite(n) && n > 0
    );

  if (!ranks.length) {
    throw new Error(
      "No Happiness Rank column found in the CSV."
    );
  }

  const rankDomain = d3.extent(ranks);

  const years = [
    ...new Set(allRows.map(d => d.Year))
  ].sort((a, b) => a - b);

  const firstYear = years[0];
  const lastYear = years.at(-1);

  const rowsByYear = d3.group(
    allRows,
    d => d.Year
  );

  const selectedCountries = new Set();

  let year = lastYear;
  let playbackState = "idle";
  let playbackTimer = null;

  // -----------------------------------
  // Initialize components
  // -----------------------------------

  const slider = d3.select("#year-slider")
    .attr("min", firstYear)
    .attr("max", lastYear)
    .property("value", firstYear);

  const sliderLabel = d3.select("#year-label");
  const timeline = d3.select("#timeline");
  const playButton = d3.select("#playback-button");
  const playIcon = d3.select("#playback-icon");
  const subtitle = d3.select("#chart-subtitle");

  const lineChart = createLineChart(
    allRows,
    years
  );

  const map = await createMap(
    rowsByYear.get(year) ?? [],
    onCountryClick,
    rankDomain
  );

  // -----------------------------------
  // Country selection
  // -----------------------------------

  function selectionTitle() {
    const names = [...selectedCountries].sort();

    if (!names.length) {
      return "All countries (average)";
    }

    if (names.length === 1) {
      return `${names[0]} vs. global average`;
    }

    if (names.length === 2) {
      return `${names[0]} and ${names[1]} vs. global average`;
    }

    return `${names.join(", ")} vs. global average`;
  }

  function updateSelectionLabels() {
    const names = [...selectedCountries].sort();
    const label = selectionTitle();

    subtitle
      .text(label)
      .attr("title", label);

    const length = label.length;

    subtitle.style(
      "font-size",
      length > 125 ? "11px"
        : length > 85 ? "12px"
        : length > 55 ? "14px"
        : null
    );

    subtitle.classed(
      "many-countries",
      names.length > 2
    );
  }

  // -----------------------------------
  // Refresh map and chart
  // -----------------------------------

  function refresh() {
    const yearRows =
      rowsByYear.get(year) ?? [];

    const filtered = selectedCountries.size
      ? yearRows.filter(d =>
          selectedCountries.has(d.Country)
        )
      : yearRows;

    const averageRank = d3.mean(
      filtered,
      d => {
        const rank = Number(
          d["Happiness Rank"]
        );

        return Number.isFinite(rank) && rank > 0
          ? rank
          : undefined;
      }
    );

    const scope = selectedCountries.size
      ? [...selectedCountries].sort().join(", ")
      : "All countries";

    d3.select("#map-year").text(year);

    d3.select("#selection-info")
      .text(
        `${scope} | Average happiness rank (${year}): ${
          averageRank === undefined
            ? "N/A"
            : averageRank.toFixed(1)
        }`
      )
      .style(
        "font-size",
        scope.length > 105 ? "10px"
          : scope.length > 60 ? "11px"
          : null
      );

    // Do not recreate the map SVG.
    map.updateData(yearRows);
    map.updateSelection(selectedCountries);

    updateSelectionLabels();

    // Full chart while idle.
    // Progressive reveal during animation.
    lineChart.render(
      rowsByYear,
      selectedCountries,
      playbackState === "idle"
        ? lastYear
        : year
    );
  }

  function onCountryClick(name) {
    if (selectedCountries.has(name)) {
      selectedCountries.delete(name);
    } else {
      selectedCountries.add(name);
    }

    refresh();
  }

  // -----------------------------------
  // Playback
  // -----------------------------------

  function stopTimer() {
    if (playbackTimer !== null) {
      clearInterval(playbackTimer);
    }

    playbackTimer = null;
  }

  function paintSlider() {
    const progress =
      (year - firstYear) /
      Math.max(1, lastYear - firstYear);

    slider
      .property("value", year)
      .style(
        "--slider-progress",
        `${progress * 100}%`
      );

    sliderLabel.text(year);
  }

  function syncControls() {
    timeline.property(
      "hidden",
      playbackState === "idle"
    );

    const playing =
      playbackState === "playing";

    playIcon.attr(
      "src",
      playing
        ? "./images/pause.svg"
        : "./images/play.svg"
    );

    const label = playing
      ? "Pause animation"
      : "Play animation";

    playButton
      .attr("aria-label", label)
      .attr("title", label);

    paintSlider();
  }

  function setYear(nextYear) {
    year = Math.max(
      firstYear,
      Math.min(
        lastYear,
        Number(nextYear)
      )
    );

    paintSlider();
    refresh();
  }

  function finish() {
    stopTimer();

    playbackState = "finished";

    syncControls();
    refresh();
  }

  function startTimer() {
    stopTimer();

    playbackTimer = setInterval(() => {
      const index = years.indexOf(year);

      if (index >= years.length - 1) {
        return finish();
      }

      setYear(years[index + 1]);

      if (year === lastYear) {
        finish();
      }
    }, 1100);
  }

  playButton.on("click", () => {
    if (playbackState === "playing") {
      stopTimer();
      playbackState = "paused";
    } else {
      if (
        playbackState === "idle" ||
        playbackState === "finished" ||
        year === lastYear
      ) {
        year = firstYear;
      }

      playbackState = "playing";
    }

    syncControls();
    refresh();

    if (playbackState === "playing") {
      startTimer();
    }
  });

  // Reset ONLY animation.
  d3.select("#reset-timeline").on("click", () => {
    stopTimer();

    playbackState = "idle";
    year = lastYear;

    lineChart.hideFocus();

    syncControls();
    refresh();
  });

  // Reset map selection and zoom independently.
  d3.select("#reset-map").on("click", () => {
    selectedCountries.clear();
    map.resetZoom();

    refresh();
  });

  // Manual slider.
  slider.on("input", function () {
    stopTimer();

    year = Number(this.value);

    playbackState =
      year === lastYear
        ? "finished"
        : "paused";

    syncControls();
    refresh();
  });

  // -----------------------------------
  // Scroll positioning
  // -----------------------------------

  const scene = document.querySelector(".scroll-scene");
  const stage = document.querySelector(".visual-stage");
  const mapPanel = document.querySelector(".map-panel");
  const mapTitle = document.querySelector(".map-title");
  const chartPanel = document.querySelector(".chart-panel");

  let rafPending = false;

  function applyScroll() {
    rafPending = false;

    // Narrow layout uses stacked elements.
    if (
      window.matchMedia("(max-width: 900px)").matches
    ) {
      stage.style.setProperty(
        "--scroll-progress",
        "1"
      );

      stage.style.setProperty(
        "--map-title-alpha",
        "1"
      );

      stage.style.setProperty(
        "--map-title-offset",
        "0px"
      );

      return;
    }

    const bounds = scene.getBoundingClientRect();

    const travel = Math.max(
      1,
      scene.offsetHeight - window.innerHeight
    );

    const p = Math.max(
      0,
      Math.min(1, -bounds.top / travel)
    );

    const stageWidth = stage.clientWidth;
    const stageHeight = stage.clientHeight;

    const chartHeight = chartPanel.offsetHeight;

    // Keep the original map aspect ratio.
    const mapLeft = 16 * (1 - p);
    const mapWidth = 68 - 3 * p;

    // Measure the map SVG and the surrounding
    // toolbar, legend, and summary text.
    const oldMapSvgHeight = mapPanel
      .querySelector("#map")
      .getBoundingClientRect()
      .height;

    const panelChromeHeight =
      mapPanel.offsetHeight - oldMapSvgHeight;

    const mapSvgHeight =
      stageWidth *
      (mapWidth / 100) *
      (510 / 960);

    const mapPanelHeight =
      mapSvgHeight + panelChromeHeight;

    const titleHeight =
      mapTitle.offsetHeight + 12;

    // Center the map in the viewport,
    // accounting for the new title.
    const heroMapTop = Math.max(
      135,
      (stageHeight - mapPanelHeight) / 2 + 55
    );

    const centeredMapTop =
      (stageHeight - mapPanelHeight + titleHeight) / 2;

    const mapTop =
      heroMapTop * (1 - p) +
      centeredMapTop * p;

    // Center the entire chart panel independently.
    // This works even if the slider appears.
    const centeredChartTop =
      (stageHeight - chartHeight) / 2;

    const offscreenChartTop =
      stageHeight + 35;

    const chartTop =
      offscreenChartTop * (1 - p) +
      centeredChartTop * p;

    // Fade the map title in after the
    // original page title has disappeared.
    const titleProgress = Math.max(
      0,
      Math.min(
        1,
        (p - 0.48) / 0.32
      )
    );

    stage.style.setProperty(
      "--scroll-progress",
      p.toFixed(4)
    );

    stage.style.setProperty(
      "--map-left",
      `${mapLeft}%`
    );

    stage.style.setProperty(
      "--map-width",
      `${mapWidth}%`
    );

    stage.style.setProperty(
      "--map-top",
      `${mapTop}px`
    );

    stage.style.setProperty(
      "--chart-top",
      `${chartTop}px`
    );

    stage.style.setProperty(
      "--header-offset",
      `${-230 * p}px`
    );

    stage.style.setProperty(
      "--header-alpha",
      Math.max(
        0,
        1 - 2.1 * p
      ).toFixed(3)
    );

    stage.style.setProperty(
      "--chart-alpha",
      Math.max(
        0,
        Math.min(1, (p - 0.07) / 0.40)
      ).toFixed(3)
    );

    stage.style.setProperty(
      "--map-title-alpha",
      titleProgress.toFixed(3)
    );

    stage.style.setProperty(
      "--map-title-offset",
      `${12 * (1 - titleProgress)}px`
    );
  }

  function requestScrollUpdate() {
    if (rafPending) return;

    rafPending = true;

    requestAnimationFrame(applyScroll);
  }

  window.addEventListener(
    "scroll",
    requestScrollUpdate,
    { passive: true }
  );

  window.addEventListener(
    "resize",
    requestScrollUpdate
  );

  // Recenter when text wraps or the slider appears.
  new ResizeObserver(requestScrollUpdate)
    .observe(chartPanel);

  new ResizeObserver(requestScrollUpdate)
    .observe(mapPanel);

  // -----------------------------------
  // Initial render
  // -----------------------------------

  syncControls();
  refresh();
  applyScroll();
}

main().catch(error => {
  console.error(
    "Failed to initialize visualizations:",
    error
  );

  const map = document.getElementById("map");

  if (map) {
    map.textContent =
      `Could not load the map: ${error.message}`;
  }
});

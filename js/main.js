
import { createMap } from "./charts/map.js";

async function main() {
  if (typeof d3 === "undefined" || typeof topojson === "undefined") {
    throw new Error("D3 or TopoJSON failed to load. Check your internet connection and script URLs.");
  }

  // Match the file path in your project. Keep this path when replacing the CSV.
  const csvPath = "./data/world_happiness.csv";
  const response = await fetch(csvPath);
  if (!response.ok) {
    throw new Error(`Could not load ${csvPath} (HTTP ${response.status}). Check that Live Server is serving the project root.`);
  }
  const allData = d3.csvParse(await response.text(), d3.autoType);
  if (!allData.length) throw new Error("The happiness CSV has no rows.");

  // Single source of truth for linked charts later.
  const selectedCountries = new Set();

  const yearSlider = d3.select("#year-slider");
  const yearLabel = d3.select("#year-label");

  const availableYears = [...new Set(allData.map(row => row.Year))].sort((a, b) => a - b);
  const firstYear = availableYears[0];
  const lastYear = availableYears.at(-1);

  let selectedYear = lastYear;

  yearSlider
    .attr("min", firstYear)
    .attr("max", lastYear)
    .property("value", selectedYear);

  function getYearData() {
    return allData.filter(row => row.Year === selectedYear);
  }

  function getFilteredData() {
    const data = getYearData();

    return selectedCountries.size === 0
      ? data
      : data.filter(row => selectedCountries.has(row.Country));
  }

  const map = await createMap(getYearData(), onCountryClick);

  function updateVisualizations() {
    const data = getFilteredData();
    const average = d3.mean(data, row => row["Happiness Score"]);

    const nameText = selectedCountries.size === 0
      ? "All countries"
      : `Selected: ${[...selectedCountries].sort().join(", ")}`;

    const averageText = average == null
      ? "N/A"
      : average.toFixed(2);

    yearLabel.text(selectedYear);

    d3.select("#selection-info")
      .text(`${nameText} | Average happiness (${selectedYear}): ${averageText}`);

    map.updateSelection(selectedCountries);

    // Future summary charts use data.
    // Future comparison bar chart is hidden if selectedCountries.size === 0.
  }

  function onCountryClick(countryName) {
    if (selectedCountries.has(countryName)) {
      selectedCountries.delete(countryName);
    } else {
      selectedCountries.add(countryName);
    }

    updateVisualizations();
  }

  // ==============================
  // Animation controls
  // ==============================

  const timeline = d3.select("#timeline");
  const playbackButton = d3.select("#playback-button");
  const playbackIcon = d3.select("#playback-icon");
  const playbackMessage = d3.select("#playback-message");

  // Possible states: idle, playing, paused, finished
  let playbackState = "idle";
  let playbackTimer = null;

  function stopTimer() {
    if (playbackTimer !== null) {
      clearInterval(playbackTimer);
      playbackTimer = null;
    }
  }

  // Update the selected year and map
  function setYear(year) {
    selectedYear = year;
    const yearData = getYearData();

    // Keep selected countries even if they have no data in this year.
    // This ensures that resetting the animation never changes country selection.

    yearSlider.property("value", selectedYear);

    map.updateData(yearData); // Recolor without rebuilding the SVG (preserves zoom).
    updateVisualizations();
  }

  // Update button icon, message, and timeline visibility
  function updatePlaybackControls() {
    timeline.property("hidden", playbackState === "idle");

    const icons = {
      idle: "./images/play.svg",
      playing: "./images/pause.svg",
      paused: "./images/play.svg",
      finished: "./images/reset.svg"
    };

    const labels = {
      idle: "Play animation",
      playing: "Pause animation",
      paused: "Resume animation",
      finished: "Reset animation"
    };

    const messages = {
      idle: "Click play to view changes from 2019–2025.",
      playing: "Playing 2019–2025. Click to pause.",
      paused: "Paused. Click play to resume.",
      finished: "Animation complete. Click reset to start over."
    };

    playbackIcon.attr("src", icons[playbackState]);

    playbackButton
      .attr("aria-label", labels[playbackState])
      .attr("title", labels[playbackState]);

    playbackMessage.text(messages[playbackState]);
  }

  // Stop animation when the last year is reached
  function finishPlayback() {
    stopTimer();
    playbackState = "finished";
    updatePlaybackControls();
  }

  // Automatically advance one year every second
  function startTimer() {
    stopTimer();

    playbackTimer = setInterval(() => {
      if (selectedYear >= lastYear) {
        finishPlayback();
        return;
      }

      setYear(selectedYear + 1);

      if (selectedYear >= lastYear) {
        finishPlayback();
      }
    }, 1000);
  }

  // Play, pause, resume, and reset
  playbackButton.on("click", () => {

    if (playbackState === "idle") {
      setYear(firstYear);
      playbackState = "playing";
      updatePlaybackControls();
      startTimer();

    } else if (playbackState === "playing") {
      stopTimer();
      playbackState = "paused";
      updatePlaybackControls();

    } else if (playbackState === "paused") {
      if (selectedYear >= lastYear) {
        finishPlayback();
      } else {
        playbackState = "playing";
        updatePlaybackControls();
        startTimer();
      }

    } else if (playbackState === "finished") {
      stopTimer();

      // Reset animation only: do not alter selected countries or map position.
      setYear(lastYear);

      playbackState = "idle";
      updatePlaybackControls();
    }
  });

  // Reset country selections and map position at any time
  d3.select("#reset-map").on("click", () => {
    selectedCountries.clear();
    updateVisualizations();
    map.resetZoom();
  });

  // Allow manual year selection using the timeline
  yearSlider.on("input", function () {
    setYear(Number(this.value));

    if (selectedYear >= lastYear && playbackState !== "idle") {
      finishPlayback();
    }
  });

  // Initial state: show 2025 without the timeline
  setYear(lastYear);
  updatePlaybackControls();
}

main().catch(error => {
  console.error("Failed to initialize visualizations:", error);

  d3.select("#map")
    .text(`Map failed to load: ${error.message}`);

  d3.select("#selection-info")
    .text("Check the browser Console and Network tabs.");
});

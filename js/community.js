
import {
  getHappinessSummary,
  submitHappiness
} from "./community-api.js";

// -----------------------------------
// Mock data — happiness ratings only
// -----------------------------------

// Counts correspond to ratings 1 through 10.
// No countries or World Happiness CSV data.
const mockRatingCounts = [
  6, 12, 25, 39, 80,
  128, 176, 154, 100, 45
];

const mockRows = mockRatingCounts.flatMap(
  (count, index) =>
    Array.from({ length: count }, () => ({
      happiness_score: index + 1,
      is_mock: true
    }))
);

const scores = d3.range(1, 11);

// -----------------------------------
// DOM elements
// -----------------------------------

const form = document.querySelector("#happiness-form");

const submitButton = document.querySelector(
  "#submit-happiness"
);

const message = document.querySelector(
  "#submission-message"
);

const countLabel = document.querySelector(
  "#community-count"
);

const countryInput = document.querySelector(
  "#happiness-country"
);

let realSummary = null;

function setMessage(text, state = "") {
  message.textContent = text;
  message.dataset.state = state;
}

// -----------------------------------
// Combine mock and real ratings
// -----------------------------------

function mergeRatings(summary) {
  const histogram = new Map(
    scores.map(score => [score, 0])
  );

  // Add mock ratings.
  for (const row of mockRows) {
    histogram.set(
      row.happiness_score,
      histogram.get(row.happiness_score) + 1
    );
  }

  // Add actual visitor responses from Neon.
  for (const row of summary?.histogram || []) {
    const score = Number(row.score);

    if (histogram.has(score)) {
      histogram.set(
        score,
        histogram.get(score) + Number(row.count)
      );
    }
  }

  return {
    histogram: scores.map(score => ({
      score,
      count: histogram.get(score)
    })),

    mockCount: mockRows.length,
    realCount: Number(summary?.total || 0)
  };
}

// -----------------------------------
// Draw audience happiness histogram
// -----------------------------------

function drawHistogram(data) {
  const target = d3.select("#community-chart");

  target.selectAll("*").remove();

  const width = 680;
  const height = 330;

  const margin = {
    top: 20,
    right: 20,
    bottom: 60,
    left: 55
  };

  const innerWidth =
    width - margin.left - margin.right;

  const innerHeight =
    height - margin.top - margin.bottom;

  const x = d3.scaleBand()
    .domain(scores)
    .range([0, innerWidth])
    .padding(0.2);

  const y = d3.scaleLinear()
    .domain([
      0,
      Math.max(1, d3.max(data, d => d.count))
    ])
    .nice()
    .range([innerHeight, 0]);

  const svg = target.append("svg")
    .attr("viewBox", `0 0 ${width} ${height}`)
    .attr("role", "img")
    .attr(
      "aria-label",
      "Distribution of audience happiness ratings from 1 to 10"
    );

  const chart = svg.append("g")
    .attr(
      "transform",
      `translate(${margin.left},${margin.top})`
    );

  // Horizontal gridlines and count labels.
  chart.append("g")
    .call(
      d3.axisLeft(y)
        .ticks(5)
        .tickSize(-innerWidth)
        .tickFormat(d3.format("d"))
    )
    .call(axis => axis.select(".domain").remove());

  // Happiness rating labels.
  chart.append("g")
    .attr(
      "transform",
      `translate(0,${innerHeight})`
    )
    .call(
      d3.axisBottom(x)
        .tickSize(0)
        .tickSizeOuter(0)
    )
    .call(axis =>
      axis.selectAll("text")
        .attr("dy", "1.3em")
    );

  // Orange bars.
  chart.selectAll(".hist-bar")
    .data(data)
    .join("rect")
    .attr("class", "hist-bar")
    .attr("x", d => x(d.score))
    .attr("y", d => y(d.count))
    .attr("width", x.bandwidth())
    .attr(
      "height",
      d => innerHeight - y(d.count)
    )
    .attr("rx", 4)
    .append("title")
    .text(
      d => `Rating ${d.score}: ${d.count} responses (mock + real)`
    );

  // X-axis title.
  svg.append("text")
    .attr(
      "x",
      margin.left + innerWidth / 2
    )
    .attr("y", height - 5)
    .attr("text-anchor", "middle")
    .text("Happiness Rating");

  // Y-axis title.
  svg.append("text")
    .attr("text-anchor", "middle")
    .attr(
      "transform",
      `translate(15,${margin.top + innerHeight / 2}) rotate(-90)`
    )
    .text("Number of Responses");
}

// -----------------------------------
// Refresh the community visualization
// -----------------------------------

function redraw() {
  const combined = mergeRatings(realSummary);

  drawHistogram(combined.histogram);

  countLabel.textContent =
    `${combined.mockCount.toLocaleString()} simulated responses + ` +
    `${combined.realCount.toLocaleString()} actual visitor responses`;
}

async function refreshCommunity() {
  try {
    realSummary = await getHappinessSummary();

    if (message.dataset.state === "offline") {
      setMessage("");
    }
  } catch (error) {
    console.warn(
      "Unable to load community submissions:",
      error.message
    );

    realSummary = null;

    setMessage(
      "Showing mock data only. Real submissions are currently unavailable.",
      "offline"
    );
  }

  redraw();
}

// -----------------------------------
// Submit actual user ratings
// -----------------------------------

form.addEventListener("submit", async event => {
  event.preventDefault();

  const chosen = form.querySelector(
    'input[name="happiness-score"]:checked'
  );

  if (!chosen) {
    setMessage(
      "Please choose a happiness rating.",
      "error"
    );
    return;
  }

  submitButton.disabled = true;
  setMessage("Saving your rating...");

  try {
    await submitHappiness(
      Number(chosen.value),
      countryInput?.value.trim() || null
    );

    await refreshCommunity();

    setMessage(
      "Thanks! Your rating was saved.",
      "success"
    );

  } catch (error) {
    setMessage(error.message, "error");
  } finally {
    submitButton.disabled = false;
  }
});

// -----------------------------------
// Initialize
// -----------------------------------

refreshCommunity();

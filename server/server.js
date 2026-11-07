
const path = require("path");

require("dotenv").config({
  path: path.join(__dirname, "..", ".env")
});

const express = require("express");
const { Pool } = require("pg");

const app = express();
const PORT = Number(process.env.PORT || 3000);

const root = path.join(__dirname, "..");

if (!process.env.DATABASE_URL) {
  throw new Error(
    "DATABASE_URL is missing from the project root .env"
  );
}

// Existing Neon database.
const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
  max: 5,
  connectionTimeoutMillis: 15000
});

app.disable("x-powered-by");
app.use(express.json({ limit: "3kb" }));

// -----------------------------------
// Allow VS Code Live Server locally
// -----------------------------------

app.use((req, res, next) => {
  const origin = req.get("Origin");

  if (
    origin &&
    /^http:\/\/(localhost|127\.0\.0\.1):(5500|5501|5502)$/.test(origin)
  ) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Vary", "Origin");

    res.set(
      "Access-Control-Allow-Methods",
      "GET, POST, OPTIONS"
    );

    res.set(
      "Access-Control-Allow-Headers",
      "Content-Type"
    );

    if (req.method === "OPTIONS") {
      return res.sendStatus(204);
    }
  }

  next();
});

// -----------------------------------
// Basic submission rate limiting
// -----------------------------------

const attempts = new Map();

function submissionLimit(req, res, next) {
  const now = Date.now();
  const key = req.ip;

  const recent = (
    attempts.get(key) || []
  ).filter(
    t => now - t < 15 * 60 * 1000
  );

  if (recent.length >= 5) {
    return res.status(429).json({
      error: "Too many submissions. Please try again later."
    });
  }

  recent.push(now);
  attempts.set(key, recent);

  next();
}

// -----------------------------------
// Serve the website
// -----------------------------------

app.get("/", (req, res) => {
  res.sendFile(
    path.join(root, "index.html")
  );
});

app.get("/style.css", (req, res) => {
  res.sendFile(
    path.join(root, "style.css")
  );
});

app.get("/community.css", (req, res) => {
  res.sendFile(
    path.join(root, "community.css")
  );
});

app.use(
  "/js",
  express.static(path.join(root, "js"))
);

app.use(
  "/data",
  express.static(path.join(root, "data"))
);

app.use(
  "/images",
  express.static(path.join(root, "images"))
);

// -----------------------------------
// Test Neon connection
// -----------------------------------

app.get("/api/health", async (req, res) => {
  try {
    await pool.query("SELECT 1");

    res.json({
      status: "ok",
      database: "connected"
    });
  } catch {
    res.status(503).json({
      error: "Database unavailable"
    });
  }
});

// -----------------------------------
// Existing real submissions endpoint
// -----------------------------------

// Preserve this route for compatibility.

app.get("/api/happiness", async (req, res) => {
  try {
    const { rows } = await pool.query(`
      SELECT
        id,
        happiness_score,
        country,
        submitted_at

      FROM user_happiness

      ORDER BY
        submitted_at DESC,
        id DESC

      LIMIT 1000
    `);

    res.set("Cache-Control", "no-store");
    res.json(rows);
  } catch (error) {
    console.error(error);

    res.status(503).json({
      error: "Unable to retrieve happiness responses"
    });
  }
});

// -----------------------------------
// Aggregated data for community graphs
// -----------------------------------

// This endpoint returns only real submissions.
// Mock data is generated separately in community.js.

app.get("/api/happiness/summary", async (req, res) => {
  try {
    const [
      totals,
      histogram,
      countries
    ] = await Promise.all([

      // Total real submissions
      pool.query(`
        SELECT COUNT(*)::int AS total
        FROM user_happiness
      `),

      // Count by happiness score
      pool.query(`
        SELECT
          happiness_score::int AS score,
          COUNT(*)::int AS count

        FROM user_happiness

        GROUP BY happiness_score
        ORDER BY happiness_score
      `),

      // Average components by country
      pool.query(`
        SELECT
          country,
          COUNT(*)::int AS count,
          SUM(happiness_score)::int AS total_score

        FROM user_happiness

        WHERE
          country IS NOT NULL
          AND TRIM(country) <> ''

        GROUP BY country
        ORDER BY country
      `)
    ]);

    res.set("Cache-Control", "no-store");

    res.json({
      source: "real-only",
      total: totals.rows[0].total,
      histogram: histogram.rows,
      countries: countries.rows
    });

  } catch (error) {
    console.error(error);

    res.status(503).json({
      error: "Unable to retrieve community summary"
    });
  }
});

// -----------------------------------
// Submit a new real happiness rating
// -----------------------------------

app.post(
  "/api/happiness",
  submissionLimit,
  async (req, res) => {
    const {
      happiness_score,
      country
    } = req.body || {};

    // Preserve original 1–10 range.
    if (
      !Number.isInteger(happiness_score) ||
      happiness_score < 1 ||
      happiness_score > 10
    ) {
      return res.status(400).json({
        error:
          "Happiness score must be a whole number from 1 to 10."
      });
    }

    if (
      country != null &&
      (
        typeof country !== "string" ||
        country.length > 100
      )
    ) {
      return res.status(400).json({
        error:
          "Country must be at most 100 characters."
      });
    }

    const cleanedCountry =
      typeof country === "string"
        ? country.trim().replace(/\s+/g, " ") || null
        : null;

    try {
      const { rows } = await pool.query(
        `
          INSERT INTO user_happiness (
            happiness_score,
            country
          )

          VALUES ($1, $2)

          RETURNING
            id,
            happiness_score,
            country,
            submitted_at
        `,
        [
          happiness_score,
          cleanedCountry
        ]
      );

      res.status(201).json(rows[0]);

    } catch (error) {
      console.error(error);

      res.status(503).json({
        error: "Unable to save your rating."
      });
    }
  }
);

// -----------------------------------
// Start the server
// -----------------------------------

app.listen(PORT, "0.0.0.0", () => {
  console.log(
    `Happiness website: http://localhost:${PORT}`
  );
});

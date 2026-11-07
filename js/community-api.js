
 // Use the same Express API on port 3000.
 // Also supports VS Code Live Server during local development.

const onLocalhost = [
  "localhost",
  "127.0.0.1"
].includes(location.hostname);

const apiBase =
  onLocalhost && location.port !== "3000"
    ? `http://${location.hostname}:3000`
    : "";

const apiPrefix =
  location.hostname === "belle.rocks"
    ? "/happiness"
    : "";

async function apiRequest(path, options = {}) {
  let response;

  try {
    response = await fetch(`${apiBase}${apiPrefix}${path}`, {
      cache: "no-store",
      ...options
    });
  } catch {
    throw new Error(
      "Cannot connect to the API. Run npm start, then open localhost:3000."
    );
  }

  const body = await response.json().catch(() => ({}));

  if (!response.ok) {
    throw new Error(
      body.error || `API error ${response.status}`
    );
  }

  return body;
}

// Aggregated real responses from Neon.
export const getHappinessSummary = () =>
  apiRequest("/api/happiness/summary");

// Submit an actual response to Neon.
export const submitHappiness = (happiness_score, country) =>
  apiRequest("/api/happiness", {
    method: "POST",
    headers: {
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      happiness_score,
      country
    })
  });

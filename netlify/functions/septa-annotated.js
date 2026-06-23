/**
 * ============================================================
 * SEPTA API Proxy — Netlify Serverless Function
 * File: netlify/functions/septa.js
 * ============================================================
 *
 * WHY THIS EXISTS:
 *   SEPTA's public API does not send CORS headers, which means
 *   a browser cannot call it directly. This function runs on
 *   Netlify's servers (not in the browser) and acts as a
 *   middleman: the browser calls /api/septa, this function
 *   calls SEPTA, and returns the result with CORS headers added.
 *
 * HOW IT'S CALLED:
 *   From the frontend, all requests go to:
 *     /api/septa?type=<type>&<params>
 *
 *   The netlify.toml redirect rule maps /api/* to this function:
 *     [[redirects]]
 *       from = "/api/*"
 *       to   = "/.netlify/functions/:splat"
 *
 * SUPPORTED ENDPOINTS:
 *
 *   type=buses&route=21
 *     → SEPTA TransitView: live GPS positions for all buses on route 21
 *     → Returns: { bus: [ { lat, lng, heading, Direction, destination,
 *                           label, VehicleID, next_stop_name, ... } ] }
 *
 *   type=stops&route=21
 *     → SEPTA Stops API: all stop locations along route 21
 *     → Returns: [ { stopid, stopname, lat, lng }, ... ]
 *
 *   type=schedule&stop_id=12345
 *     → SEPTA BusSchedules: next scheduled arrivals at a specific stop
 *     → Returns: { "21": [ { date: "3:42 pm", direction: "Westbound" }, ... ], ... }
 *     ⚠️  NOTE: Returns scheduled times, not real-time GPS predictions.
 *         Buses running late will not be reflected in this data.
 *
 * ADDING A NEW ENDPOINT:
 *   Add another `else if (type === "yourtype")` block that sets
 *   the `url` variable to the appropriate SEPTA API URL.
 *   The rest of the function (fetch, error handling, CORS headers)
 *   is shared and requires no changes.
 *
 * SEPTA API REFERENCE:
 *   TransitView:   http://www3.septa.org/api/TransitView/index.php?route=<route>
 *   Stops:         http://www3.septa.org/api/Stops/index.php?req1=<route>
 *   BusSchedules:  http://www3.septa.org/hackathon/BusSchedules/?req1=<stop_id>
 *   Full docs:     https://www3.septa.org  (sometimes unavailable)
 *   OpenDataPhilly: https://opendataphilly.org/organizations/septa/
 * ============================================================
 */

exports.handler = async function (event) {

  // All query parameters are extracted here.
  // Not all params are used by every endpoint type:
  //   - `route`   is used by type=buses and type=stops
  //   - `stop_id` is used by type=schedule
  const { type, route, stop_id } = event.queryStringParameters || {};

  // ── ROUTE REQUESTS TO SEPTA ENDPOINTS ───────────────────
  // Build the target SEPTA URL based on the `type` parameter.
  // If `type` is missing or unrecognized, return a 400 error.
  let url;

  if (type === "buses") {
    // Live bus positions for a route.
    // Replace route number in the query string: ?route=21, ?route=42, etc.
    url = `http://www3.septa.org/api/TransitView/index.php?route=${route}`;

  } else if (type === "stops") {
    // All stop locations along a route, in stop-sequence order.
    // Used to: render stop markers on the map, find nearest stop to user.
    url = `http://www3.septa.org/api/Stops/index.php?req1=${route}`;

  } else if (type === "schedule") {
    // Scheduled arrival times at a specific stop, across all routes
    // that serve that stop. Uses the stop's numeric ID (e.g. 12345),
    // which comes from the Stops API response above.
    url = `http://www3.septa.org/hackathon/BusSchedules/?req1=${stop_id}`;

  } else {
    // Unknown or missing type — return a client error
    return {
      statusCode: 400,
      body: JSON.stringify({ error: `Unknown type: "${type}". Valid types: buses, stops, schedule.` }),
    };
  }

  // ── PROXY THE REQUEST ────────────────────────────────────
  // Fetch from SEPTA and forward the response to the browser.
  // Errors from SEPTA (non-2xx responses) are caught and returned
  // as 502 Bad Gateway so the frontend can handle them gracefully.
  try {
    const res = await fetch(url);

    if (!res.ok) {
      throw new Error(`SEPTA API returned HTTP ${res.status} for URL: ${url}`);
    }

    const data = await res.json();

    return {
      statusCode: 200,
      headers: {
        // Required: tells the browser to allow this cross-origin response
        "Access-Control-Allow-Origin": "*",

        // Required: tells the browser this is JSON
        "Content-Type": "application/json",

        // Prevent caching so bus positions are always fresh.
        // For stop data (which rarely changes) you could use a longer
        // cache duration like "public, max-age=3600" to reduce API calls.
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(data),
    };

  } catch (err) {
    // Return 502 (Bad Gateway) when SEPTA's API fails or is unreachable.
    // The frontend displays a graceful failure rather than crashing.
    return {
      statusCode: 502,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

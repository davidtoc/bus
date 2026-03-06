exports.handler = async function (event) {
  const { type, route } = event.queryStringParameters || {};

  let url;
  if (type === "stops") {
    url = `http://www3.septa.org/api/Stops/index.php?req1=${route}`;
  } else if (type === "buses") {
    url = `http://www3.septa.org/api/TransitView/index.php?route=${route}`;
  } else {
    return { statusCode: 400, body: "Missing type param" };
  }

  try {
    const res = await fetch(url);
    if (!res.ok) throw new Error(`SEPTA API returned ${res.status}`);
    const data = await res.json();
    return {
      statusCode: 200,
      headers: {
        "Content-Type": "application/json",
        "Access-Control-Allow-Origin": "*",
        "Cache-Control": "no-cache",
      },
      body: JSON.stringify(data),
    };
  } catch (err) {
    return {
      statusCode: 502,
      body: JSON.stringify({ error: err.message }),
    };
  }
};

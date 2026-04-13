const express = require("express");
const path = require("node:path");

const { analyzeMarketplace } = require("./lib/extractor");

const app = express();
const port = Number(process.env.PORT || 3000);

app.use(express.json({ limit: "1mb" }));
app.use(express.static(path.join(__dirname, "public")));

app.post("/api/extract", async (req, res) => {
  const url = String(req.body?.url || "").trim();

  if (!url) {
    return res.status(400).json({ error: "Enter a marketplace homepage URL." });
  }

  try {
    const result = await analyzeMarketplace(url);
    return res.json(result);
  } catch (error) {
    const status = Number(error.statusCode) || 500;
    return res.status(status).json({
      error: error.userMessage || error.message || "Unable to inspect that site.",
    });
  }
});

app.listen(port, () => {
  console.log(`Banner template generator running at http://localhost:${port}`);
});

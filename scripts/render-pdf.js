const { chromium } = require("playwright");
const fs = require("fs");

async function run() {
  const payload = process.argv[2];
  if (!payload) {
    console.error("No payload provided");
    process.exit(1);
  }

  const {
    examHtml,
    correctionHtml,
    examPath,
    corrPath
  } = JSON.parse(payload);

  const browser = await chromium.launch({
    headless: true,
    args: [
      "--no-sandbox",
      "--disable-setuid-sandbox",
      "--disable-gpu",
      "--disable-dev-shm-usage"
    ]
  });

  const page = await browser.newPage();

  await page.setContent(examHtml, { waitUntil: "load" });
  await page.pdf({
    path: examPath,
    format: "A4",
    printBackground: true
  });

  await page.setContent(correctionHtml, { waitUntil: "load" });
  await page.pdf({
    path: corrPath,
    format: "A4",
    printBackground: true
  });

  await browser.close();
}

run().catch(err => {
  console.error("❌ render-pdf ERROR:", err);
  process.exit(1);
});

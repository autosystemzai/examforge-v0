const path = require("path");
const { parsePdfFromPath } = require("./parsepdf");

(async () => {
  try {
    // ⚠️ mets ici le chemin vers UN PDF DE TEST
    const pdfPath = path.join(__dirname, "test.pdf");

    const result = await parsePdfFromPath(pdfPath);
    console.log("✅ PDF PARSED OK");
    console.log(result);
  } catch (err) {
    console.error("❌ PDF PARSE FAILED");
    console.error(err);
  }
})();

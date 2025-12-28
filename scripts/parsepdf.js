const fs = require("fs");
const pdfParse = require("pdf-parse");

async function run() {
  const filePath = process.argv[2];

  if (!filePath || !fs.existsSync(filePath)) {
    process.stdout.write(
      JSON.stringify({ error: "INVALID_PATH" })
    );
    process.exit(0);
  }

  const buffer = fs.readFileSync(filePath);
  const data = await pdfParse(buffer);

  process.stdout.write(
    JSON.stringify({
      pages: data.numpages,
      textLength: data.text.length,
      text: data.text
    })
  );
}

run().catch(() => {
  process.stdout.write(
    JSON.stringify({ error: "PARSE_FAILED" })
  );
});





export function cleanText(raw: string): string {
  if (!raw) return "";

  let text = raw;

  text = text.replace(/\r/g, "");
  text = text.replace(/[ \t]+/g, " ");

  text = text.replace(/^\s*\d+\s*$/gm, "");

  text = text
    .split("\n")
    .filter(line => line.trim().length > 25)
    .join("\n");

  const seen = new Set<string>();
  text = text
    .split("\n")
    .filter(line => {
      const key = line.trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n");

  text = text.replace(/\n{3,}/g, "\n\n").trim();

  const MAX_CHARS = 12000;
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS);
  }

  return text;
}


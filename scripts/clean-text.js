function cleanText(raw) {
  if (!raw) return "";

  let text = raw;

  // 1) Normalisation basique
  text = text.replace(/\r/g, "");
  text = text.replace(/[ \t]+/g, " ");

  // 2) Supprimer numéros de page isolés
  text = text.replace(/^\s*\d+\s*$/gm, "");

  // 3) Supprimer lignes trop courtes (bruit)
  text = text
    .split("\n")
    .filter(line => line.trim().length > 25)
    .join("\n");

  // 4) Supprimer répétitions évidentes
  const seen = new Set();
  text = text
    .split("\n")
    .filter(line => {
      const key = line.trim();
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .join("\n");

  // 5) Nettoyage final
  text = text.replace(/\n{3,}/g, "\n\n").trim();

  // 6) Limite V0 (sécurité coût)
  const MAX_CHARS = 12000;
  if (text.length > MAX_CHARS) {
    text = text.slice(0, MAX_CHARS);
  }

  return text;
}

module.exports = { cleanText };

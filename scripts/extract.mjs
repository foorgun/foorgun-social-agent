// Liest source/canvas-en.json (Export der englischen Seiten aus dem Canvas)
// und schreibt content/posts.json: ein Eintrag pro Post mit Thema, Format,
// Plattformen, Captions, Hashtags und den zugehörigen Slide-Dateien.
import { readFileSync, writeFileSync } from "node:fs";

const canvas = JSON.parse(readFileSync(new URL("../source/canvas-en.json", import.meta.url)));

const topics = {};
for (const p of canvas.pages) {
  // "EN · A · Understanding AI" -> A: "Understanding AI"
  const [, letter, name] = p.name.split(" · ");
  topics[letter] = name;
}

// Slides je Post sammeln: en/a1-01.dc.html -> A1 / carousel, en/a3-ig.dc.html -> A3 / ig
const slides = {};
for (const file of Object.keys(canvas.boards)) {
  const m = file.match(/^en\/([a-g]\d+)-(\d+|ig|li)\.dc\.html$/);
  if (!m) continue;
  const id = m[1].toUpperCase();
  slides[id] ??= { carousel: [], ig: null, li: null };
  const name = file.replace(/^en\//, "");
  if (m[2] === "ig") slides[id].ig = name;
  else if (m[2] === "li") slides[id].li = name;
  else slides[id].carousel.push(name);
}

function section(text, header) {
  const re = new RegExp(`${header}\\n([\\s\\S]*?)(?=\\n(?:INSTAGRAM CAPTION|LINKEDIN CAPTION|CTA:)|$)`);
  const m = text.match(re);
  return m ? m[1].trim() : null;
}
function line(text, key) {
  const m = text.match(new RegExp(`^${key}:\\s*(.*)$`, "m"));
  return m ? m[1].trim() : null;
}

const posts = [];
for (const [key, note] of Object.entries(canvas.notes)) {
  if (!key.startsWith("en_s_")) continue;
  const text = note.text;
  const head = text.split("\n")[0]; // "A1 · Carousel · both · Audience: Business owners"
  const [id, format, platform] = head.split(" · ");
  const titleNote = canvas.notes[`en_t_${id}`];
  const title = titleNote ? titleNote.text.split(" — ").slice(1).join(" — ") : id;
  const s = slides[id];
  if (!s) throw new Error(`Keine Slides für ${id}`);
  s.carousel.sort();

  const platforms = platform === "both" ? ["instagram", "linkedin"] : [platform.toLowerCase()];
  const hashtags = (line(text, "Hashtags") || "").split(/\s+/).filter((h) => h.startsWith("#"));
  const isCarousel = s.carousel.length > 0;

  posts.push({
    id,
    topic: id[0],
    topicName: topics[id[0]],
    title,
    format: isCarousel ? "carousel" : "single",
    formatLabel: format,
    platforms,
    audience: (head.match(/Audience: (.*)$/) || [])[1] || null,
    hashtags,
    cta: line(text, "CTA"),
    instagram: platforms.includes("instagram")
      ? { caption: section(text, "INSTAGRAM CAPTION"), slides: isCarousel ? s.carousel : [s.ig] }
      : null,
    linkedin: platforms.includes("linkedin")
      ? { caption: section(text, "LINKEDIN CAPTION"), slides: isCarousel ? s.carousel : [s.li || s.ig] }
      : null,
  });
}

posts.sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }));

for (const p of posts) {
  for (const pf of p.platforms) {
    if (!p[pf].caption) throw new Error(`${p.id}: Caption für ${pf} fehlt`);
    if (p[pf].slides.some((x) => !x)) throw new Error(`${p.id}: Slide für ${pf} fehlt`);
  }
}

writeFileSync(
  new URL("../content/posts.json", import.meta.url),
  JSON.stringify({ topics, posts }, null, 2) + "\n",
);
console.log(`${posts.length} Posts extrahiert (${Object.keys(topics).length} Themen).`);
for (const p of posts) console.log(`  ${p.id.padEnd(3)} ${p.format.padEnd(8)} ${p.platforms.join("+").padEnd(18)} ${p.title}`);

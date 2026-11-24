// Rendert die Slides aus source/slides/*.dc.html zu fertigen Dateien:
//   media/<ID>/instagram-01.jpg …   (Instagram verlangt JPEG)
//   media/<ID>/linkedin-01.jpg       (LinkedIn-Einzelbild)
//   media/<ID>/linkedin.pdf          (LinkedIn-Carousel als Dokument-Post)
// Läuft lokal einmalig nach jeder Inhaltsänderung; die Ergebnisse werden committet.
import { readFileSync, mkdirSync, rmSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const root = new URL("../", import.meta.url);
const { posts } = JSON.parse(readFileSync(new URL("content/posts.json", root)));

// Die .dc.html-Dateien sind statisches Markup in einer Editor-Hülle:
// <helmet> -> <head>, Inhalt von <x-dc> -> <body>, Skripte entfernen.
function toPlainHtml(file) {
  const src = readFileSync(new URL(`source/slides/${file}`, root), "utf8");
  const helmet = (src.match(/<helmet>([\s\S]*?)<\/helmet>/) || [, ""])[1];
  const body = (src.match(/<x-dc>[\s\S]*?<\/helmet>([\s\S]*?)<\/x-dc>/) || [, ""])[1];
  const size = JSON.parse((src.match(/data-props='([^']*)'/) || [, "{}"])[1]).$preview || { width: 1080, height: 1350 };
  return { size, head: helmet, body };
}

function page({ head, body }, extraCss = "") {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8">${head}<style>${extraCss}</style></head><body>${body}</body></html>`;
}

const browser = await chromium.launch();
let count = 0;
try {
  for (const post of posts) {
    const dir = new URL(`media/${post.id}/`, root);
    rmSync(dir, { recursive: true, force: true });
    mkdirSync(dir, { recursive: true });

    for (const platform of post.platforms) {
      const files = post[platform].slides;
      const slides = files.map(toPlainHtml);
      const { width, height } = slides[0].size;
      const ctx = await browser.newContext({ viewport: { width, height }, deviceScaleFactor: 1 });
      const tab = await ctx.newPage();

      // LinkedIn-Carousels brauchen nur das PDF, keine Einzelbilder.
      const needImages = !(platform === "linkedin" && post.format === "carousel");
      for (const [i, slide] of needImages ? slides.entries() : []) {
        await tab.setContent(page(slide), { waitUntil: "networkidle" });
        await tab.evaluate(() => document.fonts.ready);
        const name = `${platform}-${String(i + 1).padStart(2, "0")}.jpg`;
        await tab.screenshot({ path: fileURLToPath(new URL(name, dir)), type: "jpeg", quality: 92 });
        count++;
      }

      // LinkedIn-Carousels werden als PDF-Dokument gepostet (eine Seite pro Slide).
      if (platform === "linkedin" && post.format === "carousel") {
        const css = `@page{size:${width}px ${height}px;margin:0} body{margin:0} .s{width:${width}px;height:${height}px;overflow:hidden;break-after:page}`;
        const combined = {
          head: slides[0].head,
          body: slides.map((s) => `<div class="s">${s.body}</div>`).join(""),
        };
        await tab.setContent(page(combined, css), { waitUntil: "networkidle" });
        await tab.evaluate(() => document.fonts.ready);
        await tab.pdf({ path: fileURLToPath(new URL("linkedin.pdf", dir)), width: `${width}px`, height: `${height}px`, printBackground: true });
      }
      await ctx.close();
    }
    process.stdout.write(`${post.id} `);
  }
} finally {
  await browser.close();
}
console.log(`\n${count} Bilder gerendert.`);

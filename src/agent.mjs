// foorgun.ai Social Agent
// Pro Lauf: je Plattform (Instagram, LinkedIn) den nächsten englischen Post wählen
// (immer ein anderes Thema als der letzte Post dort), veröffentlichen und in
// state/history.json festhalten, damit nichts doppelt erscheint.
//
//   node src/agent.mjs              veröffentlichen
//   node src/agent.mjs --dry-run    zeigen, was jetzt gepostet würde (keine API-Aufrufe)
//   node src/agent.mjs --plan       komplette Reihenfolge ab jetzt anzeigen
//   --only=instagram | --only=linkedin   nur eine Plattform
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { pickNext, simulate } from "./scheduler.mjs";
import { publishToInstagram, checkInstagram, instagramCaption, instagramImageUrls } from "./instagram.mjs";
import { publishToLinkedIn, linkedinCommentary } from "./linkedin.mjs";

const root = new URL("../", import.meta.url);
const historyFile = fileURLToPath(new URL("state/history.json", root));
const mediaDir = fileURLToPath(new URL("media", root));
const { posts, topics } = JSON.parse(readFileSync(new URL("content/posts.json", root)));

const args = process.argv.slice(2);
const dryRun = args.includes("--dry-run");
const planOnly = args.includes("--plan");
const checkOnly = args.includes("--check");
const only = (args.find((a) => a.startsWith("--only=")) || "").split("=")[1];
const env = process.env;

const PLATFORMS = {
  instagram: {
    label: "Instagram",
    required: ["IG_USER_ID", "IG_ACCESS_TOKEN", "MEDIA_BASE_URL"],
    publish: (post) => publishToInstagram(post, env),
    preview: (post) =>
      `${instagramCaption(post)}\n\nBilder:\n${instagramImageUrls(post, env.MEDIA_BASE_URL || "<MEDIA_BASE_URL>").join("\n")}`,
  },
  linkedin: {
    label: "LinkedIn",
    required: ["LINKEDIN_ORG_ID"],
    publish: (post) => publishToLinkedIn(post, env, mediaDir),
    preview: (post) =>
      `${linkedinCommentary(post)}\n\nMedium: media/${post.id}/${post.format === "carousel" ? "linkedin.pdf" : "linkedin-01.jpg"}`,
  },
};

const enabled = Object.keys(PLATFORMS).filter(
  (p) => (!only || only === p) && env[`${p.toUpperCase()}_ENABLED`] !== "false",
);

const history = existsSync(historyFile)
  ? JSON.parse(readFileSync(historyFile, "utf8"))
  : { instagram: [], linkedin: [] };
const save = () => writeFileSync(historyFile, JSON.stringify(history, null, 2) + "\n");

if (planOnly) {
  for (const p of enabled) {
    const order = simulate(posts, p, history[p]);
    console.log(`\n${PLATFORMS[p].label}: ${history[p].length} veröffentlicht, ${order.length} geplant`);
    order.forEach((post, i) => console.log(`  ${String(i + 1).padStart(2)}. ${post.id.padEnd(3)} [${post.topic}] ${topics[post.topic]} — ${post.title}`));
  }
  process.exit(0);
}

let failed = false;
for (const p of enabled) {
  const platform = PLATFORMS[p];
  const next = pickNext(posts, p, history[p]);
  if (!next) {
    console.log(`${platform.label}: alle Posts sind veröffentlicht. Nichts zu tun.`);
    continue;
  }
  if (next.blocked) {
    console.log(`${platform.label}: nur noch Posts aus Thema ${next.topic} übrig, das zuletzt dran war. Übersprungen.`);
    continue;
  }
  const { post } = next;
  console.log(`\n=== ${platform.label}: ${post.id} [${post.topic} · ${topics[post.topic]}] ${post.title}`);

  if (dryRun) {
    console.log(platform.preview(post));
    continue;
  }

  if (checkOnly) {
    if (p !== "instagram") {
      console.log(`${platform.label}: Verbindungstest gibt es nur für Instagram, übersprungen.`);
      continue;
    }
    try {
      const r = await checkInstagram(post, env);
      const ok = r.containerStatus === "FINISHED";
      console.log(`Konto: @${r.username}\nBild: ${r.imageUrl}\nTest-Container: ${r.containerStatus} (wird nicht veröffentlicht)`);
      console.log(ok ? "Instagram-Verbindung OK." : "Instagram konnte das Bild nicht verarbeiten.");
      if (!ok) failed = true;
    } catch (err) {
      failed = true;
      console.error(`Instagram-Verbindungstest fehlgeschlagen: ${err.message}`);
    }
    continue;
  }

  const missing = platform.required.filter((k) => !env[k]);
  if (missing.length) {
    console.error(`${platform.label}: übersprungen, fehlende Einstellungen: ${missing.join(", ")}`);
    failed = true;
    continue;
  }

  try {
    const result = await platform.publish(post);
    history[p].push({ id: post.id, topic: post.topic, at: new Date().toISOString(), postId: result.id, url: result.url });
    save();
    console.log(`${platform.label}: veröffentlicht ${result.url || result.id}`);
  } catch (err) {
    failed = true;
    console.error(`${platform.label}: Fehler bei ${post.id}: ${err.message}`);
  }
}

process.exit(failed ? 1 : 0);

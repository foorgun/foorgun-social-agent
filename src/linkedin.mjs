// LinkedIn Community Management API: Posts im Namen einer Unternehmensseite.
// Doku: https://learn.microsoft.com/linkedin/marketing/community-management/shares/posts-api
// Einzelbild -> Images API, Carousel -> Documents API (PDF, wird als blätterbares Carousel angezeigt).
import { readFile } from "node:fs/promises";

// LinkedIn-"little text": diese Zeichen müssen escaped werden, sonst wird der Text abgeschnitten.
const RESERVED = /[\\|{}@\[\]()<>#*_~]/g;
const escapeText = (s) => s.replace(RESERVED, (c) => `\\${c}`);
const hashtag = (h) => `{hashtag|\\#|${h.replace(/^#/, "")}}`;

export function linkedinCommentary(post) {
  const body = escapeText(post.linkedin.caption);
  const tags = post.hashtags.map(hashtag).join(" ");
  return tags ? `${body}\n\n${tags}` : body;
}

// API-Versionen sind monatlich (YYYYMM) und laufen nach ca. einem Jahr aus.
// Standard: der Monat vor zwei Monaten, damit die Version sicher schon live ist.
export function defaultLinkedinVersion(now = new Date()) {
  const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() - 2, 1));
  return `${d.getUTCFullYear()}${String(d.getUTCMonth() + 1).padStart(2, "0")}`;
}

async function accessToken(env) {
  if (env.LINKEDIN_REFRESH_TOKEN && env.LINKEDIN_CLIENT_ID && env.LINKEDIN_CLIENT_SECRET) {
    const res = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        grant_type: "refresh_token",
        refresh_token: env.LINKEDIN_REFRESH_TOKEN,
        client_id: env.LINKEDIN_CLIENT_ID,
        client_secret: env.LINKEDIN_CLIENT_SECRET,
      }),
    });
    const json = await res.json();
    if (!res.ok) throw new Error(`LinkedIn-Token-Refresh: ${res.status} ${JSON.stringify(json)}`);
    return json.access_token;
  }
  if (!env.LINKEDIN_ACCESS_TOKEN) throw new Error("LINKEDIN_ACCESS_TOKEN fehlt");
  return env.LINKEDIN_ACCESS_TOKEN;
}

export async function publishToLinkedIn(post, env, mediaDir) {
  const token = await accessToken(env);
  const owner = `urn:li:organization:${env.LINKEDIN_ORG_ID}`;
  const headers = {
    Authorization: `Bearer ${token}`,
    "LinkedIn-Version": env.LINKEDIN_VERSION || defaultLinkedinVersion(),
    "X-Restli-Protocol-Version": "2.0.0",
    "Content-Type": "application/json",
  };

  async function api(path, body) {
    const res = await fetch(`https://api.linkedin.com/rest/${path}`, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
    });
    const text = await res.text();
    if (!res.ok) throw new Error(`LinkedIn POST ${path}: ${res.status} ${text}`);
    return { json: text ? JSON.parse(text) : {}, res };
  }

  async function upload(kind, file, contentType) {
    const { json } = await api(`${kind}?action=initializeUpload`, { initializeUploadRequest: { owner } });
    const { uploadUrl } = json.value;
    const urn = json.value.image || json.value.document;
    const put = await fetch(uploadUrl, {
      method: "PUT",
      headers: { Authorization: `Bearer ${token}`, "Content-Type": contentType },
      body: await readFile(file),
    });
    if (!put.ok) throw new Error(`LinkedIn-Upload ${kind}: ${put.status} ${await put.text()}`);
    return urn;
  }

  let media;
  if (post.format === "carousel") {
    const urn = await upload("documents", `${mediaDir}/${post.id}/linkedin.pdf`, "application/pdf");
    media = { id: urn, title: post.title };
  } else {
    const urn = await upload("images", `${mediaDir}/${post.id}/linkedin-01.jpg`, "image/jpeg");
    media = { id: urn, altText: post.title };
  }

  const { res } = await api("posts", {
    author: owner,
    commentary: linkedinCommentary(post),
    visibility: "PUBLIC",
    distribution: { feedDistribution: "MAIN_FEED", targetEntities: [], thirdPartyDistributionChannels: [] },
    content: { media },
    lifecycleState: "PUBLISHED",
    isReshareDisabledByAuthor: false,
  });
  const id = res.headers.get("x-restli-id");
  return { id, url: id ? `https://www.linkedin.com/feed/update/${id}/` : null };
}

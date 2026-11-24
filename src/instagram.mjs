// Instagram Graph API (Content Publishing) für ein Instagram-Business-/Creator-Konto.
// Doku: https://developers.facebook.com/docs/instagram-platform/content-publishing
// Instagram lädt die Bilder selbst von einer öffentlichen URL (MEDIA_BASE_URL).

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export function instagramCaption(post) {
  return [post.instagram.caption, post.hashtags.join(" ")].filter(Boolean).join("\n\n");
}

export function instagramImageUrls(post, mediaBaseUrl) {
  return post.instagram.slides.map(
    (_, i) => `${mediaBaseUrl.replace(/\/$/, "")}/${post.id}/instagram-${String(i + 1).padStart(2, "0")}.jpg`,
  );
}

export async function publishToInstagram(post, env) {
  const host = env.IG_GRAPH_HOST || "graph.facebook.com";
  const version = env.META_GRAPH_VERSION || "v23.0";
  const base = `https://${host}/${version}`;
  const userId = env.IG_USER_ID;
  const token = env.IG_ACCESS_TOKEN;

  async function call(method, path, params = {}) {
    const body = new URLSearchParams({ ...params, access_token: token });
    const url = method === "GET" ? `${base}/${path}?${body}` : `${base}/${path}`;
    const res = await fetch(url, method === "GET" ? {} : { method, body });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.error) {
      throw new Error(`Instagram ${method} ${path}: ${res.status} ${JSON.stringify(json.error || json)}`);
    }
    return json;
  }

  async function waitUntilReady(containerId) {
    for (let i = 0; i < 30; i++) {
      const { status_code } = await call("GET", containerId, { fields: "status_code" });
      if (status_code === "FINISHED") return;
      if (status_code === "ERROR" || status_code === "EXPIRED") {
        throw new Error(`Instagram-Container ${containerId}: ${status_code}`);
      }
      await sleep(4000);
    }
    throw new Error(`Instagram-Container ${containerId} wurde nicht rechtzeitig fertig`);
  }

  const urls = instagramImageUrls(post, env.MEDIA_BASE_URL);
  const caption = instagramCaption(post);
  let creationId;

  if (urls.length === 1) {
    ({ id: creationId } = await call("POST", `${userId}/media`, { image_url: urls[0], caption }));
  } else {
    const children = [];
    for (const image_url of urls) {
      const { id } = await call("POST", `${userId}/media`, { image_url, is_carousel_item: "true" });
      children.push(id);
    }
    for (const id of children) await waitUntilReady(id);
    ({ id: creationId } = await call("POST", `${userId}/media`, {
      media_type: "CAROUSEL",
      children: children.join(","),
      caption,
    }));
  }

  await waitUntilReady(creationId);
  const { id: mediaId } = await call("POST", `${userId}/media_publish`, { creation_id: creationId });
  const { permalink } = await call("GET", mediaId, { fields: "permalink" }).catch(() => ({}));
  return { id: mediaId, url: permalink || null };
}

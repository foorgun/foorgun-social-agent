// Themen-Rotation: wählt den nächsten Post für eine Plattform so, dass er nie
// dasselbe Thema hat wie der zuletzt veröffentlichte Post auf dieser Plattform.
//
// Regel: Unter den Themen, die sich vom letzten Thema unterscheiden, gewinnt das
// mit den meisten noch offenen Posts (bei Gleichstand: das am längsten nicht
// gespielte, dann alphabetisch). Innerhalb eines Themas geht es in Reihenfolge
// (A1 vor A2 …). So bleiben die großen Themen bis zum Schluss mischbar und es
// entstehen nie zwei Posts desselben Themas hintereinander.

export function pickNext(posts, platform, history) {
  const done = new Set(history.map((h) => h.id));
  const open = posts.filter((p) => p.platforms.includes(platform) && !done.has(p.id));
  if (open.length === 0) return null;

  const lastTopic = history.at(-1)?.topic ?? null;
  const byTopic = new Map();
  for (const p of open) {
    if (!byTopic.has(p.topic)) byTopic.set(p.topic, []);
    byTopic.get(p.topic).push(p);
  }

  const lastSeen = (topic) => {
    for (let i = history.length - 1; i >= 0; i--) if (history[i].topic === topic) return i;
    return -1;
  };

  const candidates = [...byTopic.keys()].filter((t) => t !== lastTopic);
  if (candidates.length === 0) return { blocked: true, topic: lastTopic };

  candidates.sort(
    (a, b) =>
      byTopic.get(b).length - byTopic.get(a).length ||
      lastSeen(a) - lastSeen(b) ||
      a.localeCompare(b),
  );
  const topic = candidates[0];
  const post = byTopic.get(topic).sort((a, b) => a.id.localeCompare(b.id, "en", { numeric: true }))[0];
  return { post };
}

// Simuliert die komplette Reihenfolge ab dem aktuellen Stand (für --plan).
export function simulate(posts, platform, history) {
  const h = [...history];
  const order = [];
  for (;;) {
    const next = pickNext(posts, platform, h);
    if (!next || next.blocked) break;
    order.push(next.post);
    h.push({ id: next.post.id, topic: next.post.topic });
  }
  return order;
}

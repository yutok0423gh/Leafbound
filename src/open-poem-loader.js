const shardPromiseCache = new Map();
const hydratedPoemCache = new Map();
const dataRoot = new URL("../data/open-poems/", import.meta.url);

function validShardId(value) {
  const id = String(value || "").toLowerCase();
  if (!/^[0-9a-f]{2}$/u.test(id)) throw new Error("古典正文索引包含無效分片");
  return id;
}

function shardUrl(id) {
  const url = new URL(`shards/${validShardId(id)}.json`, dataRoot);
  if (dataRoot.protocol !== "file:" && url.origin !== dataRoot.origin) {
    throw new Error("古典正文分片必須與 Leafbound 同源");
  }
  return url;
}

async function loadShard(id) {
  const key = validShardId(id);
  if (!shardPromiseCache.has(key)) {
    const request = globalThis.fetch(shardUrl(key).href, {
      cache: "force-cache",
      headers: { Accept: "application/json" }
    }).then(async (response) => {
      if (!response.ok) throw new Error(`古典正文載入失敗（${response.status}）`);
      const payload = await response.json();
      if (Number(payload?.schemaVersion) !== 1 || payload?.shard !== key || !Array.isArray(payload?.records)) {
        throw new Error("古典正文分片格式無效");
      }
      return payload.records;
    }).catch((error) => {
      shardPromiseCache.delete(key);
      throw error;
    });
    shardPromiseCache.set(key, request);
  }
  return shardPromiseCache.get(key);
}

function expandLines(lines) {
  if (!Array.isArray(lines)) throw new Error("古典正文缺少行段");
  return lines.map((line) => typeof line === "string"
    ? { text: line, jyutping: "" }
    : { text: String(line?.[0] || ""), jyutping: String(line?.[1] || "") });
}

export async function loadOpenPoemContent(poem) {
  const id = String(poem?.id || "");
  if (!id || !poem?.contentShard) return poem;
  if (hydratedPoemCache.has(id)) return hydratedPoemCache.get(id);

  const records = await loadShard(poem.contentShard);
  // Concurrent readers of the same work share the shard promise. The first
  // continuation hydrates and freezes the work; later continuations reuse it
  // instead of manufacturing duplicate objects after the same fetch resolves.
  if (hydratedPoemCache.has(id)) return hydratedPoemCache.get(id);
  const compact = records.find((record) => Array.isArray(record) && record[0] === id);
  if (!compact || compact.length < 6) throw new Error("古典正文分片尚未收錄這篇作品");
  const hydrated = Object.freeze({
    ...poem,
    lines: Object.freeze(expandLines(compact[1]).map(Object.freeze)),
    annotation: String(compact[2] || ""),
    translation: String(compact[3] || ""),
    appreciation: String(compact[4] || ""),
    allusion: String(compact[5] || ""),
    contentLoaded: true
  });
  hydratedPoemCache.set(id, hydrated);
  return hydrated;
}

export function getHydratedOpenPoem(id) {
  return hydratedPoemCache.get(String(id || "")) || null;
}

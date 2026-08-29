export const cantoneseLearningBands = Object.freeze([
  Object.freeze({
    id: "全部",
    label: "全部",
    stepLabel: "全部故事",
    sourceRange: "HBL L1–7",
    levels: null,
    mark: "全"
  }),
  Object.freeze({
    id: "start",
    label: "起步",
    stepLabel: "路徑 01",
    sourceRange: "HBL L1–2",
    levels: Object.freeze([1, 2]),
    mark: "起"
  }),
  Object.freeze({
    id: "daily",
    label: "日常",
    stepLabel: "路徑 02",
    sourceRange: "HBL L3–4",
    levels: Object.freeze([3, 4]),
    mark: "常"
  }),
  Object.freeze({
    id: "advance",
    label: "進階",
    stepLabel: "路徑 03",
    sourceRange: "HBL L5–7",
    levels: Object.freeze([5, 6, 7]),
    mark: "進"
  })
]);

export const cantoneseGradingNote = "原站 HBL L1–7 依詞頻與用法分級；Leafbound 導覽合併為起步 L1–2、日常 L3–4、進階 L5–7，不等同 CEFR。";

export function getCantoneseLearningBand(level) {
  const numericLevel = Number(level);
  if (!Number.isInteger(numericLevel)) return null;
  return cantoneseLearningBands.slice(1).find((band) => band.levels.includes(numericLevel)) || null;
}

export function cantoneseEpisodeSourceLabel(episode) {
  if (episode?.sourceId !== "hbl") return [episode?.source, episode?.episode].filter(Boolean).join(" · ");
  const band = getCantoneseLearningBand(episode.level);
  return [episode.source, `原站 HBL L${episode.level}`, band ? `Leafbound ${band.label}` : ""].filter(Boolean).join(" · ");
}

export function cantoneseEpisodeDescription(episode) {
  const description = String(episode?.description || "");
  if (episode?.sourceId !== "hbl") return description;
  return description
    .split(" · ")
    .filter((part) => !/^粵文分級\s*[1-7]/u.test(part))
    .join(" · ");
}

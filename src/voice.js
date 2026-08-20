export function isCantoneseVoice(voice) {
  if (!voice || typeof voice !== "object") return false;
  const language = String(voice.lang || "").trim().replaceAll("_", "-").toLocaleLowerCase();
  const name = String(voice.name || "").toLocaleLowerCase();
  return language === "yue"
    || language.startsWith("yue-")
    || language === "zh-hk"
    || language.startsWith("zh-hk-")
    || language === "zh-mo"
    || language.startsWith("zh-mo-")
    || /cantonese|hong kong|hongkong|\btracy\b|\bdanny\b|粵語|粤语/.test(name);
}

export function findCantoneseVoice(voices = []) {
  return Array.from(voices).find(isCantoneseVoice) || null;
}

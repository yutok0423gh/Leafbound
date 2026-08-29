const REVIEW_STATUS_META = Object.freeze({
  "machine-draft": Object.freeze({ id: "machine-draft", label: "機器初譯", tone: "draft", publicReady: false }),
  "pending-review": Object.freeze({ id: "pending-review", label: "待校對", tone: "pending", publicReady: false }),
  reviewed: Object.freeze({ id: "reviewed", label: "人工已校", tone: "reviewed", publicReady: true }),
  rejected: Object.freeze({ id: "rejected", label: "已退回", tone: "rejected", publicReady: false })
});
const INITIALLY_USABLE_META = Object.freeze({
  id: "pending-review",
  label: "初步可用",
  tone: "pending",
  publicReady: false
});

function cleanText(value) {
  return String(value || "").trim();
}

export function classicalTranslationReviewMeta(translation, { inline = false } = {}) {
  if (!translation) return Object.freeze({
    id: "missing",
    label: "今譯未收錄",
    tone: "missing",
    publicReady: false
  });

  if (inline) return REVIEW_STATUS_META.reviewed;
  const source = translation.source || {};
  const declared = cleanText(source.reviewStatus || translation.reviewStatus).toLowerCase();
  if (declared === "pending-review" && cleanText(source.editorialTriage) === "initially-usable") {
    return INITIALLY_USABLE_META;
  }
  if (REVIEW_STATUS_META[declared]) return REVIEW_STATUS_META[declared];

  const legacy = cleanText(source.status);
  if (/退回|rejected/iu.test(legacy)) return REVIEW_STATUS_META.rejected;
  if (/AI|機器|machine/iu.test(legacy)) return REVIEW_STATUS_META["machine-draft"];
  if (/未經.*人工|待校|草稿|draft/iu.test(legacy)) return REVIEW_STATUS_META["pending-review"];
  if (/人工已校|人工校訂|reviewed/iu.test(legacy)) return REVIEW_STATUS_META.reviewed;
  if (/編輯稿/iu.test(legacy)) return REVIEW_STATUS_META.reviewed;
  return REVIEW_STATUS_META["pending-review"];
}

export function classicalTranslationParagraphs(translation) {
  if (!translation) return [];
  const values = Array.isArray(translation.paragraphs)
    ? translation.paragraphs
    : [translation];
  return values.map(cleanText).filter(Boolean);
}

function sourceLines(lines) {
  return (Array.isArray(lines) ? lines : [])
    .map((line, index) => ({
      ...line,
      text: cleanText(line?.text),
      sourceIndex: index
    }))
    .filter((line) => line.text);
}

function groupedRange(items, groupIndex, groupCount) {
  const start = Math.floor((groupIndex * items.length) / groupCount);
  const end = Math.floor(((groupIndex + 1) * items.length) / groupCount);
  return items.slice(start, Math.max(start + 1, end));
}

/**
 * Keeps translations physically beside their source without inventing semantic
 * sentence alignment. Equal paragraph counts are exact; unequal counts are
 * grouped proportionally and explicitly marked as structural/approximate.
 */
export function alignClassicalReadingUnits(lines, translation) {
  const sources = sourceLines(lines);
  const translations = classicalTranslationParagraphs(translation);
  if (!sources.length) return [];
  if (!translations.length) {
    return sources.map((line, index) => ({
      id: index,
      sourceLines: [line],
      translations: [],
      alignment: "source-only"
    }));
  }

  if (sources.length === translations.length) {
    return sources.map((line, index) => ({
      id: index,
      sourceLines: [line],
      translations: [translations[index]],
      alignment: "exact"
    }));
  }

  const groupCount = Math.min(sources.length, translations.length);
  if (groupCount === 1) {
    return [{
      id: 0,
      sourceLines: sources,
      translations,
      alignment: "whole-work"
    }];
  }

  return Array.from({ length: groupCount }, (_, index) => ({
    id: index,
    sourceLines: groupedRange(sources, index, groupCount),
    translations: groupedRange(translations, index, groupCount),
    alignment: "structural"
  }));
}

export const classicalReadingModes = Object.freeze([
  Object.freeze({ id: "original", label: "原文" }),
  Object.freeze({ id: "parallel", label: "對照" }),
  Object.freeze({ id: "translation", label: "今譯" })
]);

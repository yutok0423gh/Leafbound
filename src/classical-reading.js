import { isTranslationPlaceholder, sourceSegmentId, validateClassicalAlignment } from "./classical-alignment.js";

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

  if (translation.source?.semanticBlocked) return Object.freeze({id:"pending-review",label:"今譯待修復",tone:"pending",publicReady:false});
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
  return values.map(cleanText).filter(Boolean).map((text) => (
    isTranslationPlaceholder(text) ? "此段今譯待修復。" : text
  ));
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

/**
 * Only explicit, complete mappings against the current source may be paired.
 * Legacy arrays (including equal-sized ones) carry no semantic alignment proof.
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

  const alignment = translation?.alignment;
  if (validateClassicalAlignment(lines, translation?.paragraphs, alignment, { requireSemantic: true }).valid) {
    const byId = new Map(sources.map((line) => [sourceSegmentId(line.sourceIndex), line]));
    return alignment.groups.map((group, index) => ({
      id: index,
      sourceLines: group.sourceIds.map((id) => byId.get(id)).filter(Boolean),
      translations: group.translationIndexes.map((position) => translations[position]),
      alignment: "semantic-groups"
    }));
  }
  return [{ id: 0, sourceLines: sources, translations, alignment: "whole-work" }];
}

export const classicalReadingModes = Object.freeze([
  Object.freeze({ id: "original", label: "原文" }),
  Object.freeze({ id: "parallel", label: "對照" }),
  Object.freeze({ id: "translation", label: "今譯" })
]);

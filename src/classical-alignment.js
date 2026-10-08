// IDs are scoped to this exact source snapshot. Editing the source invalidates
// the mapping instead of silently attaching an old translation to new text.
export function sourceSegmentId(index) {
  return `s${String(index + 1).padStart(5, "0")}`;
}

export function sourceSegmentText(line) {
  return String(typeof line === "string" ? line : line?.text || "")
    .normalize("NFC").replace(/\r\n?/gu, "\n").replace(/[\t\f\v ]+/gu, " ").trim();
}

export function isTranslationPlaceholder(text) {
  return /^(?:專名或提示|表示此句意思|按語境表示上述情節)[。.!！]?$/u.test(String(text || "").trim());
}

export function hasUnsupportedEllipsis(source, translation) {
  return /(?:\.{3,}|…)/u.test(translation) && !/(?:\.{3,}|…)/u.test(source);
}

export function validateClassicalAlignment(lines, paragraphs, alignment, { requireSemantic = false } = {}) {
  const fail = (reason) => ({ valid: false, reason });
  const semantic = alignment?.version === 2 && alignment.method === "semantic-groups";
  if (!semantic && (requireSemantic || alignment?.version !== 1 || alignment.method !== "model-checked")) return fail("missing-semantic-alignment");
  const texts = lines.map(sourceSegmentText);
  if (!texts.length || texts.some((text) => !text)) return fail("invalid-source");
  if (/[�●□\uE000-\uF8FF]/u.test(texts.join(""))) return fail("source-needs-verification");
  if (!Array.isArray(alignment.sourceTexts) || alignment.sourceTexts.length !== texts.length
    || alignment.sourceTexts.some((text, index) => text !== texts[index])) return fail("source-changed");
  if (!Array.isArray(paragraphs) || !paragraphs.length
    || paragraphs.some((text) => typeof text !== "string" || !text.trim() || isTranslationPlaceholder(text))) return fail("invalid-translation");
  if (semantic) {
    if (!Array.isArray(alignment.translationTexts) || alignment.translationTexts.length !== paragraphs.length
      || alignment.translationTexts.some((text, index) => text !== sourceSegmentText(paragraphs[index]))) return fail("translation-changed");
    const verification = alignment.verification;
    if (verification?.method !== "independent-semantic-audit" || verification.verdict !== "pass"
      || !Array.isArray(verification.promptSha256s) || verification.promptSha256s.length < 2
      || verification.promptSha256s.some((hash) => !/^[a-f0-9]{64}$/u.test(hash))
      || typeof verification.model !== "string" || !verification.model.trim()
      || typeof verification.modelRevision !== "string" || !verification.modelRevision.trim()
      || !Number.isFinite(Date.parse(verification.completedAt))) return fail("missing-semantic-verification");
  }
  if (!Array.isArray(alignment.groups) || !alignment.groups.length) return fail("missing-groups");
  const sourceIds = [];
  const translationIndexes = [];
  for (const group of alignment.groups) {
    if (!Array.isArray(group?.sourceIds) || !group.sourceIds.length
      || !Array.isArray(group.translationIndexes) || !group.translationIndexes.length) return fail("invalid-group");
    sourceIds.push(...group.sourceIds);
    translationIndexes.push(...group.translationIndexes);
  }
  if (sourceIds.length !== texts.length || sourceIds.some((id, index) => id !== sourceSegmentId(index))) return fail("source-coverage");
  const coveredTranslations = semantic ? [...translationIndexes].sort((a, b) => a - b) : translationIndexes;
  if (translationIndexes.length !== paragraphs.length
    || coveredTranslations.some((value, index) => value !== index)) return fail("translation-coverage");
  for (const group of alignment.groups) {
    const source = group.sourceIds.map((id) => texts[Number(id.slice(1)) - 1]).join("");
    if (group.translationIndexes.some((index) => hasUnsupportedEllipsis(source, paragraphs[index]))) return fail("unsupported-ellipsis");
  }
  return { valid: true, reason: null };
}

export function createSemanticAlignment(lines, paragraphs, groups, verification) {
  return { version: 2, method: "semantic-groups", sourceTexts: lines.map(sourceSegmentText),
    translationTexts: paragraphs.map(sourceSegmentText), groups, verification };
}

export function createClassicalAlignment(lines, groups = lines.map((_, index) => ({
  sourceIds: [sourceSegmentId(index)], translationIndexes: [index]
}))) {
  return {
    version: 1,
    method: "model-checked",
    sourceTexts: lines.map(sourceSegmentText),
    groups
  };
}

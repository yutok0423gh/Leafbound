const baseFacetDefinitions = Object.freeze([
  Object.freeze({ id: "dynasty", label: "朝代" }),
  Object.freeze({ id: "poet", label: "作者" })
]);

const closingFacetDefinition = Object.freeze({ id: "theme", label: "主題" });

const kindFacetDefinitions = Object.freeze({
  詩: Object.freeze({ id: "form", label: "詩體" }),
  詞: Object.freeze({ id: "tune", label: "詞牌" }),
  古文: Object.freeze({ id: "form", label: "文體" })
});

const fallbackFacetLabels = Object.freeze({
  dynasty: "朝代",
  poet: "作者",
  form: "體裁",
  tune: "詞牌",
  theme: "主題"
});

export function poetryFacetDefinitions(kind = "全部") {
  const kindFacet = kindFacetDefinitions[kind];
  return kindFacet
    ? [...baseFacetDefinitions, kindFacet, closingFacetDefinition]
    : [...baseFacetDefinitions, closingFacetDefinition];
}

export function poetryFacetLabel(facet, kind = "全部") {
  return poetryFacetDefinitions(kind).find((definition) => definition.id === facet)?.label
    || fallbackFacetLabels[facet]
    || facet;
}

export function poetryFacetValue(poem, facet) {
  if (!poem) return null;
  if (facet === "theme") return Array.isArray(poem.themes) ? poem.themes : [];
  if (facet === "tune") {
    const tune = poem.kind === "詞" ? String(poem.form || "").trim() : "";
    return tune && tune !== "詞" ? tune : null;
  }
  if (facet === "form") {
    return ["詞", "曲"].includes(poem.kind) ? null : poem.form || null;
  }
  return poem[facet] || null;
}

export function poetryMatchesFacet(poem, facet, expectedValue) {
  if (!expectedValue) return true;
  const actualValue = poetryFacetValue(poem, facet);
  return Array.isArray(actualValue)
    ? actualValue.includes(expectedValue)
    : actualValue === expectedValue;
}

export function poetryFacetValues(items, facet, activeValue = null) {
  const values = items.flatMap((poem) => {
    const value = poetryFacetValue(poem, facet);
    return Array.isArray(value) ? value : [value];
  }).filter(Boolean);
  const counts = new Map();
  values.forEach((value) => counts.set(value, (counts.get(value) || 0) + 1));

  let uniqueValues = [...counts.keys()];
  if (["poet", "form", "tune"].includes(facet)) {
    uniqueValues = uniqueValues.sort((a, b) => (
      (counts.get(b) || 0) - (counts.get(a) || 0)
      || a.localeCompare(b, "zh-Hant")
    ));
  }

  if (facet === "poet" && uniqueValues.length > 24) {
    uniqueValues = uniqueValues.slice(0, 24);
    if (activeValue && !uniqueValues.includes(activeValue)) uniqueValues.push(activeValue);
  }

  return ["全部", ...uniqueValues];
}

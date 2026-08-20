import test from "node:test";
import assert from "node:assert/strict";

import { findCantoneseVoice, isCantoneseVoice } from "../src/voice.js";

test("Mandarin voices never qualify as Cantonese", () => {
  assert.equal(isCantoneseVoice({ name: "Microsoft Huihui Desktop", lang: "zh-CN" }), false);
  assert.equal(isCantoneseVoice({ name: "Microsoft Xiaoxiao", lang: "zh-CN" }), false);
});

test("Cantonese locale and voice names are accepted", () => {
  assert.equal(isCantoneseVoice({ name: "Microsoft HiuMaan", lang: "zh-HK" }), true);
  assert.equal(isCantoneseVoice({ name: "Cantonese voice", lang: "yue-HK" }), true);
  assert.equal(isCantoneseVoice({ name: "Hong Kong Cantonese", lang: "" }), true);
  assert.equal(isCantoneseVoice({ name: "Microsoft Tracy Desktop", lang: "" }), true);
  assert.equal(isCantoneseVoice({ name: "Microsoft Danny Desktop", lang: "" }), true);
});

test("voice selection fails closed when only Mandarin is available", () => {
  const voices = [
    { name: "Microsoft Huihui Desktop", lang: "zh-CN" },
    { name: "Microsoft Zira Desktop", lang: "en-US" }
  ];
  assert.equal(findCantoneseVoice(voices), null);
});

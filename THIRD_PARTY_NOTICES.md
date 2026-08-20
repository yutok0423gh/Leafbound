# Third-party data notices

## 粵典 words.hk word list

- Used file: word list and pronunciation candidates only
- Source: https://words.hk/faiman/analysis/
- Upstream JSON: https://words.hk/faiman/analysis/wordslist.json
- License: Public domain
- Credit: words.hk

The app does not copy full words.hk dictionary definitions. Those entries may carry a separate Non-Commercial Open Data License, so complete definitions remain on the official words.hk website and are opened through an external link.

## Rime Cantonese character dictionary

- Used file: `jyut6ping3.chars.dict.yaml` single-character Jyutping candidates
- Source repository: https://github.com/rime/rime-cantonese
- Pinned revision: `259f0e48bba840c3a2e0d117539e96937f3d89bc`
- Source version: `2026.08.10`
- License: Creative Commons Attribution 4.0 International (CC BY 4.0)
- Credit: Cantonese Computational Linguistics Infrastructure Development Workgroup (CanCLID)
- License text: https://github.com/rime/rime-cantonese/blob/259f0e48bba840c3a2e0d117539e96937f3d89bc/LICENSE-CC-BY

The build-time importer normalizes the upstream single-character Rime dictionary to local JSON and lists unweighted readings before weighted alternatives. The app uses these entries only when the words.hk word list does not contain a character, primarily to complete automatic Jyutping annotation for classical prose. Automatic annotation displays the first candidate and clearly identifies that classical context and polyphonic characters may require a different reading.

## chinese-poetry / 古典文庫

- Source repository: https://github.com/chinese-poetry/chinese-poetry
- Imported files:
  - `全唐诗/唐诗三百首.json` — 362 works
  - `宋词/宋词三百首.json` — 279 works after removing one duplicate of the curated collection
  - `蒙学/guwenguanzhi.json` — 222 works
- Pinned revision: `b8594f81a89752241442f2ce267d6f66f96704ee`
- License: MIT

The MIT License (MIT)

Copyright (c) 2016 JackeyGao

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in
all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
THE SOFTWARE.

## OpenCC JS

- Package: `opencc-js` 1.4.1
- Source: https://github.com/nk2028/opencc-js
- License: MIT AND Apache-2.0
- Use: import-time conversion of the simplified-Chinese Song ci source to Hong Kong Traditional Chinese (`cn` → `hk`)

OpenCC JS is a development-only import dependency. The browser app reads the generated local corpus and does not load OpenCC at runtime.

## Cheerio

- Package: `cheerio` 1.1.2
- Source: https://github.com/cheeriojs/cheerio
- License: MIT
- Use: import-time HTML parsing and removal of navigation, scripts, media, and other non-article elements from approved English sources

Cheerio is a development-only import dependency. The browser app reads generated plain-text content and does not load Cheerio or source-page HTML at runtime.

## iconv-lite

- Package: `iconv-lite` 0.6.3
- Source: https://github.com/ashtuchkin/iconv-lite
- License: MIT
- Use: import-time decoding of the official HKCanCor Big5-HKSCS sample transcripts

The decoded text is stored as UTF-8 in the generated local corpus. The package is not loaded by the browser.

## Hong Kong Cantonese Corpus (HKCanCor)

- Source: https://github.com/fcbond/hkcancor
- Imported material: the five official sample recordings (`m`, `d1`, `d2`, `r1`, `r2`) and their tagged transcripts
- License: Creative Commons Attribution 4.0 International (CC BY 4.0)
- License: https://creativecommons.org/licenses/by/4.0/
- Credit: Hong Kong Cantonese Corpus, created by Luke Kang Kwong
- Requested citation: K. K. Luke and May L. Y. Wong (2015), “The Hong Kong Cantonese Corpus: Design and Uses,” Journal of Chinese Linguistics

The app copies the five sample MP3 files and corresponding tagged transcripts distributed by the official repository. It converts Big5-HKSCS text to UTF-8, retains the corpus Jyutping, and adds editorial titles plus approximate sentence timings. Those changes are identified in the in-app source record. The remaining full corpus is not bundled.

## 冚唪唥粵文讀本 / Hambaanglaang Cantonese Graded Readers

- Source catalog: https://hambaanglaang.hk/all-levels/
- Imported material: 28 Cantonese story texts, four from each of Levels 1–7
- Current imported licenses: CC BY 4.0, verified from each story’s public text document
- Site license statement: https://hambaanglaang.hk/
- Audio: official SoundCloud track is loaded only after the user asks for it; audio files, illustrations, PDFs, videos, and translations are not copied

The importer only accepts a story when its page exposes a complete public Cantonese text document, an authentic audio track, and document-level CC BY attribution. Each generated story keeps its canonical page, text-document URL, exact attribution text, license, PDF reference, and SoundCloud track. The complete per-work attribution list is available under「我的 → 關於 → 香港口語與分級故事」. Underlying source works can have different attribution histories, so the importer never substitutes one global credit for the per-work notice.

## VOA Learning English source feeds

- Source hub: https://learningenglish.voanews.com/rssfeeds
- Connected feeds: Science & Technology, Arts & Culture, Everyday Grammar, and American Stories
- Reuse statement: https://learningenglish.voanews.com/p/6861.html
- Local use: feed metadata plus the cleaned plain-text body of VOA-produced Learning English articles

VOA states that Learning English texts, MP3s, photos, and videos produced by VOA are in the public domain with credit. VOA pages may also contain AP, Reuters, AFP, or other third-party material. The importer rejects any candidate body that names those wire services, then stores only cleaned text from accepted VOA-produced pages. Audio, images, embeds, navigation, scripts, and rejected bodies are not copied.

## NASA Technology feed

- Feed: https://www.nasa.gov/technology/feed/
- Feed directory: https://www.nasa.gov/rss-feeds/
- Media usage guidance: https://www.nasa.gov/nasa-brand-center/images-and-media/
- Local use: feed metadata plus cleaned plain-text article bodies

NASA material is generally not subject to copyright in the United States, but NASA pages can contain clearly marked third-party material and protected identifiers. This app stores cleaned official article text with NASA credit. It excludes figures, captions, image downloads, embeds, scripts, NASA identifiers, and paragraphs marked as copyrighted or courtesy material.

## Standard Ebooks New Releases feed

- Feed: https://standardebooks.org/feeds/atom/new-releases
- Feed directory: https://standardebooks.org/feeds
- Rights note: https://standardebooks.org/help
- Local use: feed metadata plus the cleaned plain text of each selected book's opening chapter

Standard Ebooks notes that its original site content is dedicated to the public domain through CC0, while the ebooks are public domain in the United States and users elsewhere must check local law. The app stores the opening chapter for focused in-app reading, credits the edition and author, and keeps the official single-page book URL as the full-version source.

## Content boundary

No text, annotation, translation, or commentary has been copied from 古詩文網. The open-corpus entries in this app contain classical text from the pinned chinese-poetry dataset only. The six curated sample works and their modern explanatory text remain the app's existing hand-authored content. Cantonese character readings are generated by `scripts/import-cantonese-pronunciation.mjs` from the pinned Rime Cantonese source. English metadata and approved plain-text bodies are generated by `scripts/import-english-sources.mjs`; every imported item keeps its canonical source URL, attribution, scope, and rights note.

Hong Kong Education Bureau and commercial textbook pages are not treated as open corpora. No textbook has been copied into the app. Future textbook support must be limited to material with explicit redistribution permission or to private files the user is authorized to import.

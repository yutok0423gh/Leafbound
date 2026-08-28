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
  - `全唐诗/poet.tang.{0..57000}.json` — 2,592 selected works from 20 representative poets after pronunciation validation
  - `蒙学/qianjiashi.json` — 212 works
  - `宋词/宋词三百首.json` — 279 works after removing one duplicate of the curated collection
  - `宋词/ci.song.{0..21000}.json` — 1,912 selected works from 16 representative lyricists
  - `蒙学/guwenguanzhi.json` — 222 works
  - `诗经/shijing.json` — 305 works
  - `楚辞/chuci.json` — 65 works
  - `元曲/yuanqu.json` — 10,906 unique works
  - `曹操诗集/caocao.json` — 26 works
  - `纳兰性德/纳兰性德诗集.json` — 257 unique works
  - `论语/lunyu.json` and `四书五经/{daxue,zhongyong,mengzi}.json` — 36 Four Books chapters
  - `幽梦影/youmengying.json` — 219 aphorisms grouped into 19 local reading units
  - `蒙学/{youxueqionglin,shenglvqimeng,dizigui,zengguangxianwen,wenzimengqiu}.json` — 175 local primer reading units after pronunciation validation
- Pinned revision: `b8594f81a89752241442f2ce267d6f66f96704ee`
- License: MIT

Simplified-Chinese source files are converted to Hong Kong Traditional Chinese with OpenCC during the build. For complete per-character pronunciation, CJK iteration marks are expanded; two contextual Yuan-qu source typos, `埯女` and `埯哥哥`, are narrowly corrected to `俺女` and `俺哥哥`. Expanded Tang and specialist primer units containing Han characters without a reliable candidate in the pinned local pronunciation dictionaries are excluded rather than assigned a guessed reading. The generated browser module stores repeated source and license fields in a shared table, while each reading unit retains its collection, canonical file URL, pinned revision, and source-only boundary. The app adds no scraped modern translation, annotation, or commentary.

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
- Use: import-time conversion of relevant simplified-Chinese classical and dictionary sources to Hong Kong Traditional Chinese (`cn` → `hk`)

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
- Imported material: 149 Cantonese story texts; 20 from Level 1, 24 from each of Levels 2–5, 20 from Level 6, and 13 from Level 7
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

## Global Voices English stories feed

- Feed: https://globalvoices.org/feed/?cat=-28
- Feed directory: https://globalvoices.org/feeds/
- Republishing guidelines: https://globalvoices.org/about/global-voices-attribution-policy/
- License: Creative Commons Attribution 3.0 (CC BY 3.0) for Global Voices-created content unless otherwise stated
- Local use: cleaned plain text from 12 current original English stories, with the credited author and canonical story URL retained on every item

Global Voices permits sharing and adaptation of its own stories with author credit, an original-story link, a license link, and an indication of changes, while warning that photos, video, and audio from other creators may have different rights. The importer therefore requires both a Global Voices original-publication marker and a Global Voices author profile in the feed item. It rejects any item that declares a content-sharing agreement, external republication, or non-Global-Voices original publication. Images, captions, embeds, audio, video, long block quotations, navigation, scripts, donation copy, and parenthetical non-English source spellings are removed before the text is stored. Each item identifies Leafbound's plain-text adaptation in its attribution.

## English news desk directory

Leafbound links to the public article entrances of AP News, Reuters, The Guardian, CNN, RFI, and The Economist. These cards are a directory only: no article body, image, logo, subscriber content, or commercial-feed payload from these publishers is copied into the app. Free access, regional availability, and subscription limits remain controlled by each publisher.

- AP News content and licensing: https://www.ap.org/content/
- Reuters homepage and licensed-content products: https://www.reuters.com/ and https://reutersagency.com/en/products/reuters-connect/
- The Guardian Open Platform: https://open-platform.theguardian.com/access/
- The Guardian Open Platform terms: https://www.theguardian.com/open-platform/terms-and-conditions
- CNN RSS and public reading help: https://www.cnn.com/help/rss.html
- RFI copyright notice: https://www1.rfi.fr/actuen/articles/110/article_2829.asp
- The Economist terms of use: https://www.economistgroup.com/terms-of-use

The same directory also links to Open Newswire as a discovery route for openly licensed reporting. Open Newswire exposes a license tag per result and asks reusers to check the originating outlet's exact conditions. Leafbound does not treat the aggregator label as a substitute for per-article verification.

- Open Newswire about and license guidance: https://www.opennewswire.org/about/

## Princeton WordNet 3.0 and Chinese Open Wordnet 2.0

- Distribution: Open Multilingual Wordnet 2.0 — https://github.com/omwn/omw-data/releases/tag/v2.0
- English package: OMW English Wordnet based on WordNet 3.0 (`omw-en-2.0`)
- Chinese package: Chinese Open Wordnet (`omw-cmn-2.0`)
- English license: https://wordnet.princeton.edu/license-and-commercial-use
- Chinese project: https://bond-lab.github.io/cow/
- Bundled license copies: `data/licenses/wordnet-3.0.txt` and `data/licenses/chinese-open-wordnet.txt`

The generated local dictionary contains only word forms found in the English articles currently bundled with Leafbound. `scripts/import-english-dictionary.mjs` aligns Princeton WordNet definitions and examples with Chinese Open Wordnet lemmas through their shared WordNet 3.0 synset identifiers, converts Simplified Chinese lemmas to Hong Kong Traditional Chinese with OpenCC, and writes the compact browser module in `src/open-english-dictionary.js`. The compact module keeps a WordNet example only when the clicked surface form or selected lemma occurs in that example; examples remain labelled separately from Leafbound's hand-edited common-use phrases.

Both upstream licenses permit copying, modification, and distribution without a fee or royalty when their copyright notice and disclaimer are preserved. The dictionary module loads from the same Leafbound site only when an English reader is opened. It does not send the clicked word, article text, reading history, or API credentials to a third-party dictionary service.

## FreeDict English–Chinese dictionary

- Dictionary: English-中文 FreeDict+WikDict (`eng-zho`)
- Version: `2025.11.23` — 26,660 headwords
- Maintainer and publisher: Karl Bartel
- Official download: https://download.freedict.org/dictionaries/eng-zho/2025.11.23/
- Imported source archive: `freedict-eng-zho-2025.11.23.src.tar.xz`
- Source SHA-512: `25aed0f1d7de68919aa9da1ba92d67f566ae4ea81660f42071c81fc21e56d4b210d61df379315678648c45ca7e52c4a0ba2eec009fbaab7c72e7472489e1fc4c`
- License: Creative Commons Attribution-ShareAlike 3.0 Unported (CC BY-SA 3.0)
- License text: https://creativecommons.org/licenses/by-sa/3.0/legalcode
- Bundled notice: `data/licenses/freedict-eng-zho.txt`

FreeDict identifies this dictionary as an automatic WikDict build based on Wiktionary data obtained through DBnary. Leafbound uses it only when a selected WordNet entry has no Chinese Open Wordnet meaning. The importer extracts the matching article vocabulary, converts Simplified Chinese to Hong Kong Traditional Chinese, and marks every fallback entry with `translationSource: "freedict"` so its provenance remains machine-readable. The FreeDict-derived translations remain available under CC BY-SA 3.0, including its attribution and share-alike requirements.

## Content boundary

No text, annotation, translation, or commentary has been copied from 古詩文網. The open-corpus entries in this app contain classical text from the pinned chinese-poetry dataset only. The six curated sample works and their modern explanatory text remain the app's existing hand-authored content. Cantonese character readings are generated by `scripts/import-cantonese-pronunciation.mjs` from the pinned Rime Cantonese source. English metadata and approved plain-text bodies are generated by `scripts/import-english-sources.mjs`; every imported item keeps its canonical source URL, attribution, scope, and rights note.

Hong Kong Education Bureau and commercial textbook pages are not treated as open corpora. No textbook has been copied into the app. Future textbook support must be limited to material with explicit redistribution permission or to private files the user is authorized to import.

Oxford, Cambridge, Collins, Longman, and other commercial dictionary entries are not downloaded, scraped, copied, or republished by this project. A future commercial-dictionary option would require the user's own licensed API plan and a server-side proxy so that credentials are never exposed in this static site.

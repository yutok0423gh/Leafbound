import { existsSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  readGeneratedExport,
  stableSnapshot,
  writeTextIfChanged
} from "./generated-content-utils.mjs";

const projectRoot = dirname(dirname(fileURLToPath(import.meta.url)));
const cacheRoot = resolve(projectRoot, ".tmp-data", "cantonese-sources", "spice");
const outputUrl = new URL("../src/cantonese-interviews.js", import.meta.url);
const audioRoot = resolve(projectRoot, "assets", "audio", "cantonese");
const datasetPersistentId = "doi:10.5683/SP2/MJOXP3";
const datasetUrl = "https://doi.org/10.5683/SP2/MJOXP3";
const datasetFilesUrl = `https://borealisdata.ca/api/datasets/:persistentId/versions/:latest/files?persistentId=${encodeURIComponent(datasetPersistentId)}`;
const dataFileUrl = (id) => `https://borealisdata.ca/api/access/datafile/${id}`;
const licenseUrl = "https://creativecommons.org/licenses/by/4.0/";
const targetSampleRate = 22_050;
const speechGain = 2;

const interviewSelections = Object.freeze([
  {
    participant: "VF19B",
    file: "VF19B_Cantonese_I2_20190213.TextGrid",
    title: "打中文、英文同 Chinglish",
    topic: "文字訊息與語言",
    description: "受訪者談打中文的速度、英文句子與 Chinglish，以及文字訊息裏自然出現的語言轉換。",
    keywords: ["打中文", "中文", "英文", "grammar", "chinglish", "text message", "character"],
    fallbackRatio: 0.08
  },
  {
    participant: "VF20A",
    file: "VF20A_Cantonese_I1_20181119.TextGrid",
    title: "新年點解要食髮菜？",
    topic: "節慶食物與家庭",
    description: "由生日壽桃、新年髮菜和食齋說起，談屋企沿用的節慶飲食習慣。",
    keywords: ["食齋", "髮菜", "新年", "生日", "煮", "紅豆", "屋企"],
    fallbackRatio: 0.24
  },
  {
    participant: "VF21A",
    file: "VF21A_Cantonese_I2_20190130.TextGrid",
    title: "手寫筆記定用電腦？",
    topic: "手寫筆記與溫書",
    description: "受訪者分享上堂、溫書、考試與選科的經驗，也談甚麼學習方式最適合自己。",
    keywords: ["手寫", "notes", "溫書", "上堂", "教授", "記", "電腦"],
    fallbackRatio: 0.44
  },
  {
    participant: "VF23B",
    file: "VF23B_Cantonese_I2_20190121.TextGrid",
    title: "點樣同人解釋語言科學？",
    topic: "語言科學與朋友",
    description: "受訪者分享向朋友解釋語言科學時遇到的問題，以及一個話題如何慢慢打開。",
    keywords: ["語言科學", "解釋", "朋友", "對方", "問", "話題"],
    fallbackRatio: 0.6
  },
  {
    participant: "VF26A",
    file: "VF26A_Cantonese_I1_20190303.TextGrid",
    title: "第一份兼職學到乜？",
    topic: "兼職與同事",
    description: "受訪者回想夜晚和星期六上班的兼職，也談工作時間、同事和留下來的原因。",
    keywords: ["part time", "返", "同事", "份工", "工作", "夜晚", "禮拜六"],
    fallbackRatio: 0.73
  },
  {
    participant: "VF32A",
    file: "VF32A_Cantonese_I1_20190213.TextGrid",
    title: "旅行要唔要排到好仔細？",
    topic: "旅行與行程",
    description: "受訪者談第一次去一個地方時如何安排名勝、食物與行程，以及重遊時為何可以隨意一點。",
    keywords: ["旅行", "名勝", "計劃", "好食", "再去", "地方"],
    fallbackRatio: 0.86
  },
  {
    participant: "VM19A",
    file: "VM19A_Cantonese_I2_20191031.TextGrid",
    title: "父母嘅英文同口音",
    topic: "家庭英文",
    description: "受訪者比較父母的英文程度、口音與文字訊息，也談彼此溝通時遇到的有趣細節。",
    keywords: ["媽咪", "爹哋", "英文", "accent", "grammar", "text message"],
    fallbackRatio: 0.12
  },
  {
    participant: "VM20B",
    file: "VM20B_Cantonese_I2_20181126.TextGrid",
    title: "父母點樣練返英文？",
    topic: "父母與學校經驗",
    description: "受訪者由父母的英文說到小學、中學和練習機會，回看一代人的語言學習經驗。",
    keywords: ["阿媽", "阿爸", "英文", "中學", "小學", "練習"],
    fallbackRatio: 0.57
  },
  {
    participant: "VM21A",
    file: "VM21A_Cantonese_I2_20181206.TextGrid",
    title: "大堂定細班？",
    topic: "大學課堂",
    description: "受訪者比較大班講課、小班互動和選修課，也坦白甚麼時候容易在課堂分心。",
    keywords: ["lecture", "course", "上堂", "打機", "大啲", "細啲"],
    fallbackRatio: 0.48
  },
  {
    participant: "VM22A",
    file: "VM22A_Cantonese_I1_20181210.TextGrid",
    title: "第一次去台灣有乜唔同？",
    topic: "台灣旅行",
    description: "受訪者比較台灣與日常生活環境，談物價、地方大小和街上的熱鬧感。",
    keywords: ["台灣", "去過", "貴", "熱鬧", "唔同", "地方"],
    fallbackRatio: 0.76
  },
  {
    participant: "VM24A",
    file: "VM24A_Cantonese_I2_20181209.TextGrid",
    title: "對貓狗敏感點算？",
    topic: "寵物與過敏",
    description: "受訪者談對貓狗與花粉過敏，去探望養貓的家人之前要怎樣準備。",
    keywords: ["寵物", "狗", "貓", "養", "照顧", "屋企", "動物"],
    fallbackRatio: 0.96,
    windowSeconds: 48,
    minCharacters: 35,
    minimumStart: 1768
  }
]);

const curatedLocalEpisode = Object.freeze({
  id: "spice-vf19a-family-language",
  title: "屋企入面點樣轉換語言",
  source: "SpiCE 開放訪談",
  sourceId: "spice",
  collection: "研究訪談口述",
  episode: "受訪者 VF19A · 家庭語言",
  contentForm: "口述節錄",
  transcriptScope: "participant-only",
  speakers: Object.freeze({
    VF19A: Object.freeze({ role: "受訪者", name: "VF19A", side: "answer" })
  }),
  level: null,
  publishedAt: "",
  recordedPeriod: "2018",
  duration: 132.168,
  description: "一名在加拿大長大的早期粵英雙語者，談父母使用英文、互相糾音，以及屋企日常怎樣轉換語言。本節錄只顯示資料集已對齊的受訪者文字。",
  transcriptAvailable: true,
  isDemoNarration: false,
  hasAuthenticAudio: true,
  audioKind: "local",
  audioFile: "assets/audio/cantonese/spice-vf19a-family-language.wav",
  sourceUrl: datasetUrl,
  sourceLicense: "CC BY 4.0",
  licenseUrl,
  attribution: "Khia A. Johnson (2021), SpiCE: Speech in Cantonese and English, Scholars Portal Dataverse, V1, doi:10.5683/SP2/MJOXP3. Leafbound selected the participant-aligned utterances, extracted the participant channel, punctuated the text, and clearly labels this as a participant-only excerpt.",
  editorialChanges: "Leafbound 選段、加標點並整理分段；未補寫訪者問句。",
  timing: "aligned",
  transcript: Object.freeze([
    Object.freeze({ at: 0, label: "父母英文", speaker: "VF19A", text: "我媽咪嘅英文比我爸爸稍為好少少。", terms: [] }),
    Object.freeze({ at: 6.419, label: "工作語境", speaker: "VF19A", text: "因為我爸爸喺廚房做嘢，通常講英文嘅機會唔多。", terms: ["喺"] }),
    Object.freeze({ at: 11.432, label: "英文課", speaker: "VF19A", text: "我媽咪幫我同妹妹報名活動，講英文嘅機會多啲。我肯定佢嚟到呢度嗰陣有讀過英文課；我爸爸就冇聽佢講過有冇讀過。", terms: ["嗰陣"] }),
    Object.freeze({ at: 44.008, label: "發音語法", speaker: "VF19A", text: "有時佢啲音講得唔啱，特別係 grammar，好多時都唔正確。", terms: [] }),
    Object.freeze({ at: 60.568, label: "互相糾音", speaker: "VF19A", text: "我大部分時候都會試吓糾正，不過佢有時講極都唔啱。", terms: [] }),
    Object.freeze({ at: 81.624, label: "屋企用語", speaker: "VF19A", text: "一般用英文；有時講笑，會同我媽咪講普通話。", terms: [] }),
    Object.freeze({ at: 110.127, label: "兩地飲食", speaker: "VF19A", text: "我覺得冇乜嘢係嗰邊食過、呢邊冇機會食。我去香港時，佢哋帶我食壽司，不過我覺得都唔夠我哋呢邊好。燒鴨呢啲，呢邊都有得食。", terms: [] })
  ])
});

async function fetchResponse(url, { headers = {}, timeout = 60_000 } = {}) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(url, {
        headers: {
          accept: "application/json,text/plain,application/octet-stream,*/*;q=0.5",
          "user-agent": "Leafbound open Cantonese interview importer/0.2",
          ...headers
        },
        redirect: "follow",
        signal: AbortSignal.timeout(timeout)
      });
      if (response.ok || response.status === 206) return response;
      lastError = new Error(`${url} returned ${response.status}`);
      if (response.status < 500 && response.status !== 429) throw lastError;
    } catch (error) {
      lastError = error;
    }
    if (attempt < 3) await new Promise((resolvePromise) => setTimeout(resolvePromise, attempt * 750));
  }
  throw lastError || new Error(`${url} could not be fetched`);
}

function decodeTextBuffer(buffer) {
  if (buffer[0] === 0xfe && buffer[1] === 0xff) {
    const payload = buffer.subarray(2);
    const swapped = Buffer.alloc(payload.length - (payload.length % 2));
    for (let index = 0; index < swapped.length; index += 2) {
      swapped[index] = payload[index + 1];
      swapped[index + 1] = payload[index];
    }
    return swapped.toString("utf16le");
  }
  if (buffer[0] === 0xff && buffer[1] === 0xfe) return buffer.subarray(2).toString("utf16le");
  return buffer.toString("utf8");
}

async function cachedText(url, path) {
  if (existsSync(path)) {
    const cached = decodeTextBuffer(await readFile(path));
    const validTextGrid = !path.endsWith(".TextGrid") || cached.includes('Object class = "TextGrid"');
    if (cached.trim().length > 0 && validTextGrid) return cached;
  }
  const buffer = Buffer.from(await (await fetchResponse(url)).arrayBuffer());
  const text = decodeTextBuffer(buffer);
  if (!text.trim()) throw new Error(`${url} returned an empty text file`);
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, buffer);
  return text;
}

async function fetchRange(url, start, end) {
  const response = await fetchResponse(url, {
    headers: { Range: `bytes=${start}-${end}` },
    timeout: 90_000
  });
  if (response.status !== 206) {
    throw new Error(`SpiCE audio server returned ${response.status}; byte-range support is required`);
  }
  const bytes = Buffer.from(await response.arrayBuffer());
  const expected = end - start + 1;
  if (bytes.length !== expected) {
    throw new Error(`SpiCE audio range was ${bytes.length} bytes; expected ${expected}`);
  }
  return bytes;
}

function parseWaveHeader(buffer) {
  if (buffer.toString("ascii", 0, 4) !== "RIFF" || buffer.toString("ascii", 8, 12) !== "WAVE") {
    throw new Error("SpiCE source is not a RIFF/WAVE file");
  }
  let format = null;
  let dataOffset = null;
  let dataSize = null;
  for (let offset = 12; offset + 8 <= buffer.length;) {
    const id = buffer.toString("ascii", offset, offset + 4);
    const size = buffer.readUInt32LE(offset + 4);
    const payloadOffset = offset + 8;
    if (id === "fmt ") {
      format = {
        audioFormat: buffer.readUInt16LE(payloadOffset),
        channels: buffer.readUInt16LE(payloadOffset + 2),
        sampleRate: buffer.readUInt32LE(payloadOffset + 4),
        blockAlign: buffer.readUInt16LE(payloadOffset + 12),
        bitsPerSample: buffer.readUInt16LE(payloadOffset + 14)
      };
    }
    if (id === "data") {
      dataOffset = payloadOffset;
      dataSize = size;
      break;
    }
    offset = payloadOffset + size + (size % 2);
  }
  if (!format || dataOffset == null || dataSize == null) throw new Error("SpiCE WAV header is incomplete");
  if (format.audioFormat !== 1 || format.channels !== 2 || format.sampleRate !== 44_100 || format.bitsPerSample !== 16) {
    throw new Error(`Unexpected SpiCE WAV format: ${JSON.stringify(format)}`);
  }
  return { ...format, dataOffset, dataSize };
}

function extractParticipantAndDownsample(source, format) {
  const sourceFrameCount = Math.floor(source.length / format.blockAlign);
  const targetFrameCount = Math.floor(sourceFrameCount / 2);
  const output = Buffer.alloc(targetFrameCount * 2);
  for (let targetFrame = 0; targetFrame < targetFrameCount; targetFrame += 1) {
    const firstOffset = targetFrame * format.blockAlign * 2;
    const secondOffset = firstOffset + format.blockAlign;
    const sum = source.readInt16LE(firstOffset) + source.readInt16LE(secondOffset);
    const sample = Math.round((sum / 2) * speechGain);
    output.writeInt16LE(Math.max(-32_768, Math.min(32_767, sample)), targetFrame * 2);
  }
  return output;
}

function makePcmWave(pcm) {
  const header = Buffer.alloc(44);
  header.write("RIFF", 0, "ascii");
  header.writeUInt32LE(36 + pcm.length, 4);
  header.write("WAVE", 8, "ascii");
  header.write("fmt ", 12, "ascii");
  header.writeUInt32LE(16, 16);
  header.writeUInt16LE(1, 20);
  header.writeUInt16LE(1, 22);
  header.writeUInt32LE(targetSampleRate, 24);
  header.writeUInt32LE(targetSampleRate * 2, 28);
  header.writeUInt16LE(2, 32);
  header.writeUInt16LE(16, 34);
  header.write("data", 36, "ascii");
  header.writeUInt32LE(pcm.length, 40);
  return Buffer.concat([header, pcm]);
}

function tierBlock(textGrid, name) {
  const itemPattern = /\n\s*item \[\d+\]:\s*([\s\S]*?)(?=\n\s*item \[\d+\]:|\s*$)/g;
  for (const match of textGrid.matchAll(itemPattern)) {
    if (match[1].match(/\n\s*name = "([^"]+)"/)?.[1] === name) return match[1];
  }
  throw new Error(`TextGrid tier “${name}” was not found`);
}

function parseIntervals(block) {
  const intervals = [];
  const pattern = /intervals \[\d+\]:\s*\r?\n\s*xmin = ([\d.]+)\s*\r?\n\s*xmax = ([\d.]+)\s*\r?\n\s*text = "((?:[^"]|"")*)"/g;
  for (const match of block.matchAll(pattern)) {
    intervals.push({
      start: Number(match[1]),
      end: Number(match[2]),
      text: match[3].replaceAll('""', '"').trim()
    });
  }
  return intervals;
}

function cleanTranscriptText(value) {
  return String(value)
    .replace(/[【】]/gu, "")
    .replace(/&[a-z]+\b/giu, "")
    .replace(/\btsk\b/giu, "")
    .replace(/\bxxx\b/giu, "（聽不清）")
    .replace(/\bching\s+lish\b/giu, "Chinglish")
    .replace(/\bs\s+light\b/giu, "slight")
    .replace(/\bret\s+ent\s+io\s+n\b/giu, "retention")
    .replace(/\bel\s+ec\s+ti\s+ve\b/giu, "elective")
    .replace(/\bl\s+otter\s+y\b/giu, "lottery")
    .replace(/\bac\s+comp\s+lished\b/giu, "accomplished")
    .replace(/\bching\s+li\s+sh\b/giu, "Chinglish")
    .replace(/\bcl\s+ar\s+it\s+in\b/giu, "Claritin")
    .replace(/\b([a-z]{1,5})\d\b/giu, "")
    .replace(/㖡/gu, "呃")
    .replace(/士頭/gu, "壽桃")
    .replace(/\s+/g, " ")
    .replace(/([\p{Script=Han}])\s+(?=[\p{Script=Han}])/gu, "$1")
    .replace(/([\p{Script=Han}])\s+([，。！？；：、])/gu, "$1$2")
    .replace(/([（「『])\s+/gu, "$1")
    .replace(/\s+([）」』])/gu, "$1")
    .trim();
}

function hanLength(value) {
  return [...String(value)].filter((character) => /\p{Script=Han}/u.test(character)).length;
}

function selectInterviewWindow(textGrid, selection) {
  const interviewTask = parseIntervals(tierBlock(textGrid, "task")).find((interval) => interval.text.toLowerCase() === "interview");
  if (!interviewTask) throw new Error(`${selection.file} does not contain an interview task`);
  const utterances = parseIntervals(tierBlock(textGrid, "utterance"))
    .filter((interval) => interval.text && interval.start >= interviewTask.start && interval.end <= interviewTask.end)
    .map((interval) => ({ ...interval, text: cleanTranscriptText(interval.text) }))
    .filter((interval) => hanLength(interval.text) >= 2);
  if (utterances.length < 12) throw new Error(`${selection.file} has too few participant utterances`);

  const targetDuration = selection.windowSeconds || 105;
  const minimumCharacters = selection.minCharacters || 120;
  const preferred = interviewTask.start + ((interviewTask.end - interviewTask.start) * selection.fallbackRatio);
  let best = null;
  for (let startIndex = 0; startIndex < utterances.length; startIndex += 1) {
    const start = utterances[startIndex].start;
    if (selection.minimumStart && start < selection.minimumStart) continue;
    const window = [];
    for (let index = startIndex; index < utterances.length; index += 1) {
      if (utterances[index].start - start > targetDuration) break;
      window.push(utterances[index]);
    }
    const text = window.map((item) => item.text).join("");
    const characters = hanLength(text);
    if (characters < minimumCharacters) continue;
    const keywordHits = selection.keywords.reduce((sum, keyword) => sum + (text.toLowerCase().includes(keyword.toLowerCase()) ? 1 : 0), 0);
    const distancePenalty = Math.abs(start - preferred) / Math.max(1, interviewTask.end - interviewTask.start);
    const score = (keywordHits * 20) + Math.min(18, characters / 18) - (distancePenalty * 5);
    if (!best || score > best.score) best = { score, utterances: window };
  }
  if (!best) throw new Error(`${selection.file} has no readable interview window`);

  const start = best.utterances[0].start;
  const end = best.utterances.at(-1).end;
  const transcript = [];
  let group = null;
  for (const utterance of best.utterances) {
    const gap = group ? utterance.start - group.end : Infinity;
    if (!group || hanLength(group.text) >= 52 || gap > 2.5) {
      if (group) transcript.push(group);
      group = { start: utterance.start, end: utterance.end, text: utterance.text };
    } else {
      group.text = `${group.text}${/[。！？]$/u.test(group.text) ? "" : "，"}${utterance.text}`;
      group.end = utterance.end;
    }
  }
  if (group) transcript.push(group);

  transcript.forEach((segment) => {
    if (!/[。！？…]$/u.test(segment.text)) segment.text = `${segment.text}。`;
  });

  return {
    sourceStart: start,
    sourceEnd: end,
    transcript: transcript.map((segment, index) => ({
      at: Number((segment.start - start).toFixed(3)),
      label: String(index + 1).padStart(2, "0"),
      speaker: selection.participant,
      text: segment.text,
      terms: []
    }))
  };
}

async function datasetFiles() {
  const cachePath = join(cacheRoot, "dataset-files.json");
  const raw = await cachedText(datasetFilesUrl, cachePath);
  const payload = JSON.parse(raw);
  if (payload.status !== "OK" || !Array.isArray(payload.data)) throw new Error("SpiCE dataset file list is invalid");
  return payload.data.map((entry) => ({
    id: entry.dataFile?.id,
    label: entry.label,
    directory: entry.directoryLabel,
    restricted: entry.restricted,
    size: entry.dataFile?.filesize
  })).filter((entry) => entry.id && !entry.restricted);
}

async function ensureLocalAudio(files) {
  const outputPath = resolve(audioRoot, "spice-vf19a-family-language.wav");
  if (existsSync(outputPath)) return { changed: false, outputPath };
  const wav = files.find((entry) => entry.label === "VF19A_Cantonese_I2_20181114.wav");
  if (!wav) throw new Error("VF19A SpiCE WAV was not found");
  const sourceUrl = dataFileUrl(wav.id);
  const clipStart = 477.624;
  const clipEnd = 609.792;
  const headerBytes = await fetchRange(sourceUrl, 0, 65_535);
  const format = parseWaveHeader(headerBytes);
  const startFrame = Math.floor(clipStart * format.sampleRate);
  const endFrame = Math.ceil(clipEnd * format.sampleRate);
  const startByte = format.dataOffset + startFrame * format.blockAlign;
  const endByte = Math.min(format.dataOffset + format.dataSize - 1, format.dataOffset + endFrame * format.blockAlign - 1);
  const sourcePcm = await fetchRange(sourceUrl, startByte, endByte);
  const localPcm = extractParticipantAndDownsample(sourcePcm, format);
  const output = makePcmWave(localPcm);
  await mkdir(audioRoot, { recursive: true });
  await writeFile(outputPath, output);
  return { changed: true, outputPath };
}

async function importTranscriptEpisode(files, selection) {
  const file = files.find((entry) => entry.label === selection.file && entry.directory === "cantonese");
  if (!file) throw new Error(`${selection.file} was not found in the SpiCE release`);
  const textGridPath = join(cacheRoot, selection.file);
  const textGrid = await cachedText(dataFileUrl(file.id), textGridPath);
  const selected = selectInterviewWindow(textGrid, selection);
  const recordedYear = selection.file.match(/_(\d{4})\d{4}\.TextGrid$/)?.[1] || "2018–2020";
  const slugByTopic = {
    文字訊息與語言: "written-code-switching",
    節慶食物與家庭: "festival-food",
    手寫筆記與溫書: "study-notes",
    語言科學與朋友: "explaining-linguistics",
    兼職與同事: "part-time-work",
    旅行與行程: "travel-planning",
    家庭英文: "parents-english",
    父母與學校經驗: "family-schooling",
    大學課堂: "lecture-size",
    台灣旅行: "taiwan-trip",
    寵物與過敏: "pet-allergy"
  };
  return {
    id: `spice-${selection.participant.toLowerCase()}-${slugByTopic[selection.topic]}`,
    title: selection.title,
    source: "SpiCE 開放訪談",
    sourceId: "spice",
    collection: "研究訪談口述",
    episode: `受訪者 ${selection.participant} · ${selection.topic}`,
    contentForm: "口述節錄",
    transcriptScope: "participant-only",
    speakers: {
      [selection.participant]: { role: "受訪者", name: selection.participant, side: "answer" }
    },
    level: null,
    publishedAt: "",
    recordedPeriod: recordedYear,
    duration: Number((selected.sourceEnd - selected.sourceStart).toFixed(3)),
    description: `${selection.description} 本節錄只顯示資料集已對齊的受訪者文字。`,
    transcriptAvailable: true,
    isDemoNarration: false,
    hasAuthenticAudio: false,
    audioKind: "source-reference",
    sourceRecordingAvailable: true,
    sourceRecordingFile: selection.file.replace(/\.TextGrid$/i, ".wav"),
    sourceUrl: datasetUrl,
    sourceLicense: "CC BY 4.0",
    licenseUrl,
    attribution: "Khia A. Johnson (2021), SpiCE: Speech in Cantonese and English, Scholars Portal Dataverse, V1, doi:10.5683/SP2/MJOXP3. Leafbound selected a participant-aligned excerpt and lightly joined adjacent fragments for reading.",
    editorialChanges: "Leafbound 選段、移除詞間切分空格並合併相鄰短句；未補寫訪者問句，亦未把時間標記冒充人工校對。",
    timing: "source-aligned",
    sourceClipStart: Number(selected.sourceStart.toFixed(3)),
    sourceClipEnd: Number(selected.sourceEnd.toFixed(3)),
    transcript: selected.transcript
  };
}

function serialize(name, value) {
  return `export const ${name} = Object.freeze(${JSON.stringify(value, null, 2)});`;
}

await mkdir(cacheRoot, { recursive: true });
const files = await datasetFiles();
const audio = await ensureLocalAudio(files);
const importedEpisodes = [];
for (const selection of interviewSelections) importedEpisodes.push(await importTranscriptEpisode(files, selection));
const episodes = [curatedLocalEpisode, ...importedEpisodes];
const source = {
  id: "spice",
  shortName: "口述訪談",
  mark: "訪",
  mode: "研究訪談 · 多位受訪者",
  description: `${episodes.length} 段 CC BY 4.0 訪談文稿；${episodes.filter((episode) => episode.audioKind === "local").length} 段附本機受訪者聲道，其餘保留官方資料庫引用。全部只顯示已對齊的受訪者話輪。`,
  homepage: datasetUrl,
  license: "CC BY 4.0"
};
const previousSnapshot = await readGeneratedExport(outputUrl, "cantoneseInterviewSnapshot");
const snapshot = stableSnapshot(previousSnapshot, {
  datasetUrl,
  participantCount: episodes.length,
  episodeCount: episodes.length,
  localAudioCount: episodes.filter((episode) => episode.audioKind === "local").length,
  referencedRecordingCount: episodes.filter((episode) => episode.audioKind === "source-reference").length,
  transcriptScope: "participant-only"
}, { source, episodes });
const output = `// Generated by scripts/import-spice-interview-audio.mjs. Do not edit by hand.\n\n${serialize("cantoneseInterviewSnapshot", snapshot)}\n\n${serialize("cantoneseInterviewSource", source)}\n\n${serialize("cantoneseInterviewEpisodes", episodes)}\n`;
const changed = await writeTextIfChanged(outputUrl, output);

console.log(JSON.stringify({
  output: fileURLToPath(outputUrl),
  changed,
  audioChanged: audio.changed,
  episodeCount: episodes.length,
  localAudioCount: snapshot.localAudioCount,
  referencedRecordingCount: snapshot.referencedRecordingCount,
  selections: importedEpisodes.map((episode) => ({
    id: episode.id,
    title: episode.title,
    participant: Object.keys(episode.speakers)[0],
    clip: [episode.sourceClipStart, episode.sourceClipEnd],
    segments: episode.transcript.length,
    characters: episode.transcript.reduce((sum, segment) => sum + hanLength(segment.text), 0),
    preview: episode.transcript.slice(0, 2).map((segment) => segment.text).join(" ")
  }))
}, null, 2));

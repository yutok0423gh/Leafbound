import { openPoemIndex } from "./open-poems-index.js";
import { getHydratedOpenPoem, loadOpenPoemContent } from "./open-poem-loader.js";
import { openCantoneseEpisodes } from "./open-cantonese.js";
import { cantoneseInterviewEpisodes } from "./cantonese-interviews.js";

const annotatedOpenCantoneseEpisodes = openCantoneseEpisodes.map((episode) => {
  if (episode.id !== "hkcancor-d1") return episode;
  return Object.freeze({
    ...episode,
    episode: "真人錄音 · 訪談式對話",
    contentForm: "訪談式對話",
    transcriptScope: "two-party",
    speakers: Object.freeze({
      H: Object.freeze({ role: "提問者", name: "H", side: "question" }),
      L: Object.freeze({ role: "受訪者", name: "L", side: "answer" })
    }),
    roleAttribution: "Leafbound 依這段語料的提問與回答話輪加上功能標記；H／L 仍保留語料原說話者代號。"
  });
});

const curatedPoems = [
  {
    id: "mountain-autumn",
    title: "山居秋暝",
    poet: "王維",
    dynasty: "唐",
    form: "五言律詩",
    themes: ["山水", "田園"],
    featuredQuote: "明月松間照，清泉石上流",
    source: "公版古典文本",
    jyutpingStatus: "示例校正版",
    lines: [
      { text: "空山新雨後", jyutping: "hung1 saan1 san1 jyu5 hau6" },
      { text: "天氣晚來秋", jyutping: "tin1 hei3 maan5 loi4 cau1" },
      { text: "明月松間照", jyutping: "ming4 jyut6 sung1 gaan1 ziu3" },
      { text: "清泉石上流", jyutping: "cing1 cyun4 sek6 soeng6 lau4" },
      { text: "竹喧歸浣女", jyutping: "zuk1 hyun1 gwai1 wun5 neoi5" },
      { text: "蓮動下漁舟", jyutping: "lin4 dung6 haa6 jyu4 zau1" },
      { text: "隨意春芳歇", jyutping: "ceoi4 ji3 ceon1 fong1 hit3" },
      { text: "王孫自可留", jyutping: "wong4 syun1 zi6 ho2 lau4" }
    ],
    annotation: "暝，日落後天色將暗之時。浣女，洗衣歸來的女子。王孫，此處借指隱居之人。",
    translation: "空山經過新雨，傍晚的天氣已帶秋意。明月照在松林間，清泉從石上流過。竹林喧響，原來是洗衣女子歸來；蓮葉搖動，漁舟正順流而下。任憑春花歇去，秋日山居自可久留。",
    appreciation: "全詩以雨後秋山為軸，聲音與光影交替出現。前半寫自然清景，後半才讓人物進入，山居的安靜因此不是空寂，而是有生活氣息的清幽。",
    allusion: "「王孫」沿用古典文學中對遊子或隱者的稱呼，在結句中轉成詩人的自我選擇。"
  },
  {
    id: "spring-dawn",
    title: "春曉",
    poet: "孟浩然",
    dynasty: "唐",
    form: "五言絕句",
    themes: ["春日", "惜時"],
    featuredQuote: "夜來風雨聲，花落知多少",
    source: "公版古典文本",
    jyutpingStatus: "示例校正版",
    lines: [
      { text: "春眠不覺曉", jyutping: "ceon1 min4 bat1 gok3 hiu2" },
      { text: "處處聞啼鳥", jyutping: "cyu3 cyu3 man4 tai4 niu5" },
      { text: "夜來風雨聲", jyutping: "je6 loi4 fung1 jyu5 sing1" },
      { text: "花落知多少", jyutping: "faa1 lok6 zi1 do1 siu2" }
    ],
    annotation: "曉，天亮。聞，此處指聽見。",
    translation: "春日熟睡，不知不覺已到天亮；醒來四處都是鳥鳴。昨夜聽見風雨，不知道花落了多少。",
    appreciation: "詩沒有直接描畫繁花，只從睡醒、鳥聲與夜雨留下的想像落筆。末句的疑問，使明亮春晨帶上一點惜春之情。",
    allusion: "無特定典故；重點在日常感受被壓縮成四句後形成的餘韻。"
  },
  {
    id: "quiet-night",
    title: "靜夜思",
    poet: "李白",
    dynasty: "唐",
    form: "五言絕句",
    themes: ["羈旅", "思鄉"],
    featuredQuote: "舉頭望明月，低頭思故鄉",
    source: "公版古典文本",
    jyutpingStatus: "示例校正版",
    lines: [
      { text: "床前明月光", jyutping: "cong4 cin4 ming4 jyut6 gwong1" },
      { text: "疑是地上霜", jyutping: "ji4 si6 dei6 soeng6 soeng1" },
      { text: "舉頭望明月", jyutping: "geoi2 tau4 mong6 ming4 jyut6" },
      { text: "低頭思故鄉", jyutping: "dai1 tau4 si1 gu3 hoeng1" }
    ],
    annotation: "疑，彷彿、好像。故鄉，久別的家鄉。",
    translation: "月光落在床前，像地上的白霜。抬頭望月，低頭便想起故鄉。",
    appreciation: "動作只有「舉頭」與「低頭」，卻把眼前月光和遠方故鄉連在一起。語言平易，情感因此更直接。",
    allusion: "月亮在古典詩歌中常連結團聚與遠思，本詩把這個傳統意象寫得極為簡潔。"
  },
  {
    id: "river-snow",
    title: "江雪",
    poet: "柳宗元",
    dynasty: "唐",
    form: "五言絕句",
    themes: ["山水", "孤寂"],
    featuredQuote: "孤舟蓑笠翁，獨釣寒江雪",
    source: "公版古典文本",
    jyutpingStatus: "示例校正版",
    lines: [
      { text: "千山鳥飛絕", jyutping: "cin1 saan1 niu5 fei1 zyut6" },
      { text: "萬徑人蹤滅", jyutping: "maan6 ging3 jan4 zung1 mit6" },
      { text: "孤舟蓑笠翁", jyutping: "gu1 zau1 so1 lap1 jung1" },
      { text: "獨釣寒江雪", jyutping: "duk6 diu3 hon4 gong1 syut3" }
    ],
    annotation: "絕，沒有、斷絕。蓑笠，以蓑衣和斗笠遮雪。",
    translation: "群山看不見飛鳥，所有道路也沒有人跡。只有一位披蓑戴笠的老人，獨自在寒江雪中垂釣。",
    appreciation: "前兩句把天地寫到近乎全然靜止，後兩句才將孤舟與漁翁放入畫面。極大的空白，使「獨」字格外有重量。",
    allusion: "常被視為貶謫處境中的精神自況；閱讀時也可先停留在雪景本身，不急於把它化成單一寓意。"
  },
  {
    id: "lake-rain",
    title: "飲湖上初晴後雨",
    poet: "蘇軾",
    dynasty: "宋",
    form: "七言絕句",
    themes: ["山水", "西湖"],
    featuredQuote: "欲把西湖比西子，淡妝濃抹總相宜",
    source: "公版古典文本",
    jyutpingStatus: "示例校正版",
    lines: [
      { text: "水光瀲灩晴方好", jyutping: "seoi2 gwong1 lim6 jim6 cing4 fong1 hou2" },
      { text: "山色空濛雨亦奇", jyutping: "saan1 sik1 hung1 mung4 jyu5 jik6 kei4" },
      { text: "欲把西湖比西子", jyutping: "juk6 baa2 sai1 wu4 bei2 sai1 zi2" },
      { text: "淡妝濃抹總相宜", jyutping: "daam6 zong1 nung4 mut3 zung2 soeng1 ji4" }
    ],
    annotation: "瀲灩，水波閃動。空濛，煙雨迷濛。西子，即西施。",
    translation: "晴天時水面波光正好，雨中山色迷濛也很奇妙。若把西湖比作西施，淡妝濃抹都各自相宜。",
    appreciation: "晴與雨不是互相排斥的兩種景象，而是同一湖面的兩種神情。比喻落在末兩句，替前面的視覺經驗找到一個有生命的形象。",
    allusion: "西子即春秋時期的西施；詩中取其天然風姿，說明西湖不受單一天色限制。"
  },
  {
    id: "plum",
    title: "卜算子 · 詠梅",
    poet: "陸游",
    dynasty: "宋",
    form: "詞",
    themes: ["詠物", "孤高"],
    featuredQuote: "零落成泥碾作塵，只有香如故",
    source: "公版古典文本",
    jyutpingStatus: "示例校正版",
    lines: [
      { text: "驛外斷橋邊", jyutping: "jik6 ngoi6 tyun5 kiu4 bin1" },
      { text: "寂寞開無主", jyutping: "zik6 mok6 hoi1 mou4 zyu2" },
      { text: "已是黃昏獨自愁", jyutping: "ji5 si6 wong4 fan1 duk6 zi6 sau4" },
      { text: "更著風和雨", jyutping: "gang3 zoek6 fung1 wo4 jyu5" },
      { text: "無意苦爭春", jyutping: "mou4 ji3 fu2 zang1 ceon1" },
      { text: "一任群芳妒", jyutping: "jat1 jam6 kwan4 fong1 dou3" },
      { text: "零落成泥碾作塵", jyutping: "ling4 lok6 sing4 nai4 zin2 zok3 can4" },
      { text: "只有香如故", jyutping: "zi2 jau5 hoeng1 jyu4 gu3" }
    ],
    annotation: "驛，古代傳遞公文者途中休息換馬的處所。一任，完全任憑。",
    translation: "驛站外斷橋邊，梅花寂寞盛開，無人作主。黃昏已添愁意，又遇風雨。它無意爭春，任群花嫉妒；即使凋落成泥、碾作塵土，香氣仍如從前。",
    appreciation: "上片把梅放在被忽略的角落，下片由外在境遇轉入自我選擇。最終留下的不是花形，而是不可奪去的香氣。",
    allusion: "詠物同時寄託人格，是宋詞常見手法；詞中的梅既是自然之物，也承載作者的精神自況。"
  }
];

const curatedWorks = curatedPoems.map((poem) => ({
  ...poem,
  kind: poem.form === "詞" ? "詞" : "詩"
}));

export const poems = [...curatedWorks, ...openPoemIndex];

export const cantoneseTerms = {
  "嗰陣": {
    text: "嗰陣",
    jyutping: "go2 zan6",
    mandarin: "那時候；當時",
    english: "at that time; then",
    type: "Cantonese phrase"
  },
  "喺度": {
    text: "喺度",
    jyutping: "hai2 dou6",
    mandarin: "正在；在這裡／那裡（視語境）",
    english: "be doing; be here / there",
    type: "Cantonese phrase"
  },
  "收檔": {
    text: "收檔",
    jyutping: "sau1 dong3",
    mandarin: "收攤；結束當天營業",
    english: "close up for the day",
    type: "Cantonese word"
  },
  "街坊": {
    text: "街坊",
    jyutping: "gaai1 fong1",
    mandarin: "鄰居；附近居民",
    english: "neighbours; local community",
    type: "Cantonese word"
  },
  "唔爭在": {
    text: "唔爭在",
    jyutping: "m4 zaang1 zoi6",
    mandarin: "不差這一點；不必急在一時",
    english: "a little more will not matter",
    type: "Cantonese phrase"
  }
};

const curatedEpisodes = [
  {
    id: "city-rain",
    title: "一座城市點樣記住雨",
    source: "聲音散步",
    episode: "示範集 · 01",
    publishedAt: "2026-08-12",
    duration: 178,
    description: "由騎樓、電車到夜色，練習在城市聲音裡辨認語氣和節奏。",
    transcriptAvailable: true,
    isDemoNarration: true,
    transcript: [
      { at: 0, text: "落雨嗰陣，我最鍾意沿住皇后大道慢慢行。", terms: ["嗰陣"] },
      { at: 19, text: "啲簷篷將雨聲拉得好近，好似成條街都喺度講嘢。", terms: ["喺度"] },
      { at: 39, text: "電車轉彎嗰一下，路軌會響起一陣好短嘅金屬聲。", terms: ["嗰陣"] },
      { at: 60, text: "舊舖頭收檔之前，老闆總會將門口嘅紙皮搬入去。", terms: ["收檔"] },
      { at: 84, text: "有人企喺簷下等雨細啲，亦有人唔爭在，照樣慢慢行。", terms: ["喺度", "唔爭在"] },
      { at: 108, text: "街坊講天氣，往往唔係要一個答案，只係想同你傾兩句。", terms: ["街坊"] },
      { at: 133, text: "等到霓虹燈映落水窪，熟悉嘅街道又好似換咗一個樣。", terms: [] },
      { at: 156, text: "城市記住雨，大概就係記住每個人點樣行過同一條路。", terms: [] }
    ]
  },
  {
    id: "tea-afternoon",
    title: "茶記的一個下晝",
    source: "街角耳朵",
    episode: "城市口述 · 08",
    publishedAt: "2026-08-05",
    duration: 246,
    description: "從落單到搭枱，聽一段自然語速的茶餐廳日常。",
    transcriptAvailable: true,
    isDemoNarration: true,
    transcript: [
      { at: 0, text: "下晝三點，茶記終於靜返少少。", terms: [] },
      { at: 32, text: "熟客坐低唔使睇餐牌，伙記已經知佢想飲乜。", terms: [] },
      { at: 71, text: "隔籬枱兩個街坊由球賽講到樓下新開嗰間舖。", terms: ["街坊"] },
      { at: 116, text: "大家講得快，但句尾總會留一點空位畀對方接落去。", terms: [] },
      { at: 165, text: "聽真啲，日常對話嘅節奏其實比每一個字更重要。", terms: [] },
      { at: 211, text: "到伙記開始收檔，呢個下晝先算慢慢完。", terms: ["收檔"] }
    ]
  },
  {
    id: "ferry-wind",
    title: "渡輪上的風",
    source: "海港聲景",
    episode: "沿岸筆記 · 03",
    publishedAt: "2026-07-28",
    duration: 321,
    description: "一段慢速訪談節錄：人為甚麼仍然選擇坐渡輪過海。",
    transcriptAvailable: true,
    isDemoNarration: true,
    transcript: [
      { at: 0, text: "趕時間梗係搭鐵路，不過唔趕嗰陣，我多數會揀渡輪。", terms: ["嗰陣"] },
      { at: 58, text: "上到甲板，風一吹過嚟，個人就自然慢落嚟。", terms: [] },
      { at: 117, text: "兩岸啲樓望落好近，但水面會畀你一種距離感。", terms: [] },
      { at: 177, text: "有時唔爭在嗰幾分鐘，反而可以好好整理一日嘅心情。", terms: ["唔爭在"] },
      { at: 244, text: "船泊岸之前，大家先一齊企起身，重新行返入城市。", terms: [] },
      { at: 296, text: "呢段短短嘅航程，好似幫一日加咗個逗號。", terms: [] }
    ]
  }
];

export const episodes = [
  ...cantoneseInterviewEpisodes,
  ...annotatedOpenCantoneseEpisodes,
  ...curatedEpisodes.map((episode) => ({
    ...episode,
    sourceId: "local",
    collection: "本地示範",
    level: null,
    hasAuthenticAudio: false,
    audioKind: "speech",
    timing: "estimated"
  }))
];

export const articles = [
  {
    id: "quiet-noticing",
    title: "The quiet work of noticing",
    deck: "Attention becomes a practice when we give ordinary things a second look.",
    source: "Leafbound 編輯選文",
    sourceId: "local",
    category: "文化",
    topic: "Culture & attention",
    minutes: 8,
    publishedAt: "2026-08-10",
    paragraphs: [
      "Most days do not announce themselves. They arrive without a headline: light gathering on a kitchen table, the brief pause before a train door closes, or a familiar tree changing almost imperceptibly between one week and the next. These details are easy to overlook because they make no demand on us. Yet they are often the material from which memory is made.",
      "Noticing is sometimes mistaken for passive observation. In practice, it is an active form of attention. To notice something is to decide, however briefly, that it deserves to remain in view. The decision may last only a few seconds, but it interrupts the habit of moving through the world on automatic pilot.",
      "A useful practice is to describe one ordinary scene without reaching for judgement. Instead of calling a street beautiful or dull, record what is actually there: three wet umbrellas outside a bakery, a delivery bicycle leaning against a blue door, the smell of citrus when someone peels an orange on the bus. Specific language resists the blur of general impressions.",
      "This kind of attention also changes the way we read. A sentence that first appears simple may reveal its structure when read again. We begin to hear where the writer slows down, where an image carries an argument, and where a familiar phrase has been placed in an unfamiliar setting. Re-reading is not repetition; it is a change of distance.",
      "The same principle applies to listening. When learning a language, it is tempting to measure success by the number of words recognised. But meaning also lives in rhythm, hesitation, emphasis, and the small sounds that hold a conversation together. These features become audible only after the pressure to understand everything has eased.",
      "A notebook can help, provided it does not become another obligation. One line is enough: a phrase worth keeping, a sound that was difficult to distinguish, a question raised by a poem. The aim is not to produce a complete record. It is to leave a path back to the moment when attention sharpened.",
      "Over time, these small records form a private map. They show not only what we have read or heard, but what repeatedly calls us back. A sustainable practice grows from that return. We continue because the world has become slightly more legible, and because there is always something ordinary waiting for a second look."
    ],
    phrases: [
      { text: "make no demand on us", type: "phrase", meaning: "不向我們提出任何要求；不強求注意", pronunciation: "/meɪk noʊ dɪˈmænd ɑːn ʌs/" },
      { text: "automatic pilot", type: "collocation", meaning: "不經思考的慣性狀態", pronunciation: "/ˌɔːtəˈmætɪk ˈpaɪlət/" },
      { text: "resists the blur", type: "phrase", meaning: "抵抗模糊、籠統化", pronunciation: "/rɪˈzɪsts ðə blɜːr/" },
      { text: "a change of distance", type: "phrase", meaning: "觀看距離或視角的改變", pronunciation: "/ə tʃeɪndʒ əv ˈdɪstəns/" },
      { text: "leave a path back", type: "phrase", meaning: "留下回到某個時刻的路徑", pronunciation: "/liːv ə pæθ bæk/" }
    ]
  },
  {
    id: "phrases-carry",
    title: "Why phrases carry more than words",
    deck: "Vocabulary becomes usable when we remember the company a word keeps.",
    source: "Leafbound 編輯選文",
    sourceId: "local",
    category: "語言",
    topic: "Language learning",
    minutes: 6,
    publishedAt: "2026-08-03",
    paragraphs: [
      "A dictionary gives a word an address, but a phrase shows how that word lives. Consider the difference between remembering skepticism and remembering be met with skepticism. The second form already contains movement: an idea enters the world and encounters doubt. Grammar, tone, and likely context arrive together.",
      "This is why fluent speakers often reach for groups of words rather than assembling every sentence from separate pieces. Common partnerships reduce the number of decisions required in real time. They also make language sound more precise, because each word appears in company it naturally keeps.",
      "Collecting phrases does not mean copying every sentence that looks unfamiliar. A useful item has a clear reason for being kept. Perhaps it expresses a relationship you often need, such as in contrast to. Perhaps its rhythm makes it memorable. Or perhaps you understood every individual word but would never have produced the phrase yourself.",
      "Context should travel with the phrase. Save the original sentence, the source, and a short personal note. A translation can help, but the note is often more valuable: formal but not stiff, useful when disagreeing politely, or heard in an interview about design. These observations make retrieval easier later.",
      "Review can then begin with meaning rather than spelling. Hide the phrase and look at its original situation. What wording would fit? If your answer is different but natural, compare the two. The purpose is not to reproduce a single approved string; it is to enlarge the set of expressions available when you need them.",
      "Words remain important. But phrases give them direction. They turn vocabulary from a list of possessions into a set of paths through which thought can move."
    ],
    phrases: [
      { text: "be met with skepticism", type: "collocation", meaning: "遭到質疑／懷疑", pronunciation: "/bi met wɪð ˈskeptɪsɪzəm/" },
      { text: "the company a word keeps", type: "phrase", meaning: "一個詞慣常搭配的其他詞", pronunciation: "/ðə ˈkʌmpəni ə wɜːrd kiːps/" },
      { text: "reach for", type: "phrasal verb", meaning: "自然地選用、想到", pronunciation: "/riːtʃ fɔːr/" },
      { text: "in contrast to", type: "collocation", meaning: "與……形成對比", pronunciation: "/ɪn ˈkɑːntræst tuː/" }
    ]
  },
  {
    id: "upper-deck",
    title: "A city heard from the upper deck",
    deck: "The top floor of a bus offers a moving lesson in distance, rhythm, and place.",
    source: "Leafbound 編輯選文",
    sourceId: "local",
    category: "生活",
    topic: "City life",
    minutes: 5,
    publishedAt: "2026-07-26",
    paragraphs: [
      "From the upper deck, a familiar route becomes a sequence of temporary rooms. Tree branches pass close to the windows. Neon signs that feel distant from the pavement suddenly meet the eye. At each stop, a new set of conversations enters and another disappears down the stairs.",
      "The engine provides a low, continuous note, but every neighbourhood changes the arrangement above it. There are school bells, market trolleys, pedestrian signals, and the soft electronic chime that precedes an announcement. Heard together, these sounds form a practical geography.",
      "Language changes along the route as well. A phone call becomes more animated; two friends switch briefly into English to quote someone; an elderly passenger gives directions using the former name of a building. None of these moments is a lesson, yet each reveals how speech belongs to place.",
      "Recording everything would miss the point. The pleasure comes from allowing one detail to remain after the journey ends. It may be a sentence, a view into a second-floor café, or the way rain changes the pitch of the tyres. One detail is enough to reopen the route later.",
      "The upper deck does not remove us from the city. It changes the scale at which we meet it. For half an hour, the ordinary route becomes an observatory, and looking out of the window becomes a form of reading."
    ],
    phrases: [
      { text: "a sequence of temporary rooms", type: "phrase", meaning: "一連串短暫出現的房間／空間", pronunciation: "/ə ˈsiːkwəns əv ˈtempəreri ruːmz/" },
      { text: "practical geography", type: "collocation", meaning: "由日常經驗形成的地理感", pronunciation: "/ˈpræktɪkəl dʒiˈɑːɡrəfi/" },
      { text: "reopen the route", type: "phrase", meaning: "重新喚起那段路程", pronunciation: "/ˌriːˈoʊpən ðə ruːt/" }
    ]
  }
];

export const poetryFacets = {
  dynasty: ["全部", ...new Set(poems.map((poem) => poem.dynasty))],
  poet: ["全部", ...new Set(poems.map((poem) => poem.poet))],
  form: ["全部", ...new Set(poems.map((poem) => poem.form))],
  theme: ["全部", ...new Set(poems.flatMap((poem) => poem.themes))]
};

export const poetryKinds = ["全部", "詩", "詞", "曲", "古文"];

export const navItems = [
  { id: "today", label: "今日", icon: "sun" },
  { id: "poetry", label: "詩詞", icon: "book" },
  { id: "language", label: "Language", icon: "language" },
  { id: "library", label: "我的", icon: "bookmark" }
];

export function getLocalDayKey(date = new Date()) {
  const value = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date();
  const year = value.getFullYear();
  const month = String(value.getMonth() + 1).padStart(2, "0");
  const day = String(value.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getDailyIndex(length, date = new Date(), offset = 0) {
  const count = Math.max(0, Math.floor(Number(length) || 0));
  if (!count) return -1;
  const value = date instanceof Date && Number.isFinite(date.getTime()) ? date : new Date();
  const localDayNumber = Math.floor(Date.UTC(value.getFullYear(), value.getMonth(), value.getDate()) / 86_400_000);
  const index = (localDayNumber + Math.trunc(Number(offset) || 0)) % count;
  return index < 0 ? index + count : index;
}

export function pickDailyItem(items, options = {}) {
  const candidates = Array.isArray(items) ? items.filter((item) => item?.id) : [];
  if (!candidates.length) return { item: null, reread: false };

  const recentIds = Array.isArray(options.recentIds)
    ? [...new Set(options.recentIds.map((id) => String(id || "")).filter(Boolean))]
    : [];
  const recentSet = new Set(recentIds);
  const withoutRecent = (pool) => {
    const fresh = pool.filter((item) => !recentSet.has(String(item.id)));
    if (fresh.length) return fresh;
    const previousId = recentIds[0];
    if (previousId && pool.length > 1) {
      const withoutPrevious = pool.filter((item) => String(item.id) !== previousId);
      if (withoutPrevious.length) return withoutPrevious;
    }
    return pool;
  };
  const isSeen = typeof options.isSeen === "function" ? options.isSeen : () => false;
  const unread = candidates.filter((item) => !isSeen(item));

  if (unread.length) {
    const pool = withoutRecent(unread);
    const preferredId = String(options.preferred?.id || options.preferred || "");
    const preferred = preferredId && pool.find((item) => String(item.id) === preferredId);
    return {
      item: preferred || pool[getDailyIndex(pool.length, options.date, options.offset)] || pool[0],
      reread: false
    };
  }

  const pool = withoutRecent(candidates);
  const seenAt = typeof options.seenAt === "function" ? options.seenAt : () => Number.NaN;
  const dated = pool
    .map((item) => ({ item, seenAt: Number(seenAt(item)) }))
    .filter((entry) => Number.isFinite(entry.seenAt))
    .sort((a, b) => a.seenAt - b.seenAt);
  return {
    item: dated[0]?.item || pool[getDailyIndex(pool.length, options.date, options.offset)] || pool[0],
    reread: true
  };
}

export function getTodayPoem(date = new Date()) {
  return curatedWorks[getDailyIndex(curatedWorks.length, date)];
}

export function findPoem(id) {
  return getHydratedOpenPoem(id) || poems.find((poem) => poem.id === id) || poems[0];
}

export async function loadPoem(id) {
  const poem = findPoem(id);
  return poem?.contentShard ? loadOpenPoemContent(poem) : poem;
}

export function findEpisode(id) {
  return episodes.find((episode) => episode.id === id) || episodes[0];
}

export function findArticle(id) {
  return articles.find((article) => article.id === id) || articles[0];
}

import { englishDictionarySnapshot } from "./open-english-dictionary-meta.js";

let openEnglishDictionary = Object.freeze({});
let englishDictionaryPromise = null;

export { englishDictionarySnapshot };

export const englishDictionaryState = {
  status: "idle",
  entryCount: 0,
  error: null
};

export function loadEnglishDictionary() {
  if (englishDictionaryState.status === "ready") return Promise.resolve(openEnglishDictionary);
  if (englishDictionaryPromise) return englishDictionaryPromise;

  englishDictionaryState.status = "loading";
  englishDictionaryState.error = null;
  englishDictionaryPromise = import("./open-english-dictionary.js")
    .then((module) => {
      openEnglishDictionary = module.openEnglishDictionary || Object.freeze({});
      englishDictionaryState.status = "ready";
      englishDictionaryState.entryCount = Object.keys(openEnglishDictionary).length;
      return openEnglishDictionary;
    })
    .catch((error) => {
      englishDictionaryState.status = "error";
      englishDictionaryState.error = error;
      englishDictionaryPromise = null;
      throw error;
    });
  return englishDictionaryPromise;
}

const QUIET_NOTICING_GLOSSES = parseGlosses(`
a	一個；一種
active	主動的；積極的
actually	實際上；真正地
after	在……之後
again	再次
against	靠著；反對
aim	目的；目標
almost	幾乎
also	也；亦
always	總是
an	一個；一種
and	和；以及
announce	宣布；宣告
another	另一個
appears	顯得；出現
applies	適用於
are	是；處於
argument	論點；主張
arrive	到來
attention	注意力；關注
audible	聽得見的
automatic	自動的；不經思考的
back	回到；返回
bakery	麵包店
beautiful	美麗的
because	因為
become	變成
been	曾經；已經
before	在……之前
begin	開始
between	在……之間
bicycle	單車；自行車
blue	藍色的
blur	模糊；混沌
brief	短暫的
briefly	短暫地；簡要地
bus	巴士
but	但是
by	由；藉由
calling	稱作；把……叫做
calls	呼喚；吸引
can	可以
carries	承載；帶有
change	改變；變化
changes	改變
changing	逐漸改變
citrus	柑橘；柑橘氣味
closes	關上；關閉
complete	完整的
continue	繼續
conversation	對話
days	日子
decide	決定
decision	決定
delivery	送貨的
demand	要求
describe	描述
deserves	值得
details	細節
difficult	困難的
distance	距離
distinguish	分辨；區分
do	做；助動詞
does	做；助動詞
door	門
down	放慢；向下
dull	乏味的；暗淡的
eased	減輕；緩和
easy	容易的
emphasis	強調；重音
enough	足夠
everything	一切
familiar	熟悉的
features	特徵；要素
few	少數的；幾個
first	最初；第一次
for	為了；對於
form	形式
from	從；來自
gathering	聚集；漸漸匯聚
general	籠統的；一般的
grows	生長；逐漸形成
habit	習慣
has	有；已經
have	有；已經
headline	標題
hear	聽見；聽出
heard	聽到
help	幫助
hesitation	猶豫；停頓
hold	維繫；托住
however	然而；無論多麼
image	意象；畫面
imperceptibly	難以察覺地
impressions	印象
in	在……之中
instead	反而；代替
interrupts	打斷；中止
is	是
it	它；這件事
its	它的
judgement	評價；判斷
keeping	保留下來
kind	種類；這種
kitchen	廚房
language	語言
last	持續
leaning	倚靠著
learning	學習
leave	留下
legible	清晰可理解的；可讀的
light	光線
line	一行文字
listening	聆聽
lives	存在於；活在
look	看；再看
made	製成；構成
make	使；做
map	地圖
material	材料；素材
may	可能
meaning	意義
measure	衡量
memory	記憶
mistaken	被誤認為
moment	時刻
more	更；更多
most	大多數
moving	移動
next	下一個；接下來
no	沒有；不
not	不
notebook	筆記本
notice	留意；察覺
noticing	留意；觀察
number	數量
obligation	負擔；義務
observation	觀察
of	……的
often	常常
on	在……上；繼續
one	一個
only	只；僅
or	或者
orange	橙；橙子
ordinary	平凡的；日常的
outside	在……外面
over	隨著；在……之上
overlook	忽略
passive	被動的
path	路徑
pause	停頓
peels	剝去果皮
phrase	片語；短語
pilot	駕駛；自動模式
placed	被放置
poem	詩
practice	練習；實踐
pressure	壓力
principle	原則
private	私人的
produce	產生；製作
provided	前提是；假如
question	問題
raised	引發；提出
re-reading	重讀
reaching	伸手尋找；試圖採用
read	閱讀；讀過
recognised	辨認出的
record	記錄
records	記錄（複數）
remain	留下；保持
repeatedly	反覆地
repetition	重複
resists	抵抗；避免被……
return	回返；回歸
reveal	顯露；揭示
rhythm	節奏
same	相同的
scene	場景
second	第二次；第二個
seconds	秒
sentence	句子
setting	語境；背景
sharpened	變得敏銳
show	顯示；表明
simple	簡單的
slightly	稍微
slows	放慢
small	細微的；小的
smell	氣味
someone	某人
something	某件事
sometimes	有時
sound	聲音
sounds	聲音（複數）
specific	具體的
street	街道
structure	結構
success	成功
sustainable	可持續的
table	桌子
tempting	很容易令人想要的；誘人的
that	那個；連接從句
the	這個；該（定冠詞）
themselves	它們自己；自身
there	那裡；存在
these	這些
they	它們；他們
this	這個
three	三個
through	穿過；經歷
time	時間
to	到；去；用來
together	一起
train	火車
tree	樹
umbrellas	雨傘
understand	理解
unfamiliar	陌生的；不熟悉的
us	我們（受詞）
useful	有用的
view	視野；觀看
waiting	等待
was	是；曾是
way	方式
we	我們
week	星期；一週
wet	濕的
what	甚麼；所……的
when	當……時
where	在哪裡；……之處
which	哪一個；關係代詞
without	沒有；不帶
words	詞語
world	世界
worth	值得
writer	作者
yet	然而；仍然
`);

const GENERAL_ENGLISH_GLOSSES = parseGlosses(`
can't	不能；無法
cannot	不能；無法
carefully	小心地；仔細地
could	可以；可能；能夠（can 的過去式或較委婉說法）
couldn't	不能；無法
deployment	部署；調配
didn't	沒有；並未
died	去世；死亡
doesn't	不；沒有
energy-efficient	節能的；能源效率高的
flexibility	彈性；靈活性
fluent	流利的；流暢的
haven't	尚未；沒有
high-altitude	高海拔的；高空的
i'll	我會；我將會
i'm	我是；我正……
i've	我已經；我曾經
isn't	不是；並非
life-saving	救命的；挽救生命的
ongoing	持續進行中的
particularly	尤其；特別
seismic	地震的；由地震引起的
sustained	持續的；維持的
wasn't	不是；當時沒有
we'll	我們會；我們將會
we're	我們是；我們正……
we've	我們已經；我們曾經
weren't	不是；當時沒有
women	女性；婦女（woman 的複數）
won't	不會；將不會
`);

const RICH_ENTRIES = Object.freeze({
  attention: { lemma: "attention", partOfSpeech: "noun", pronunciation: "/əˈtenʃən/", definition: "the act of deliberately noticing or concentrating", usage: "這裡不是短暫看見，而是把注意力主動留在某件事上。" },
  audible: { lemma: "audible", partOfSpeech: "adjective", pronunciation: "/ˈɔːdəbəl/", definition: "clear enough to be heard" },
  blur: { lemma: "blur", partOfSpeech: "noun", pronunciation: "/blɜːr/", definition: "a state in which details lose their sharpness", usage: "文中指籠統印象令細節變得模糊。" },
  brief: { lemma: "brief", partOfSpeech: "adjective", pronunciation: "/briːf/", definition: "lasting only a short time" },
  could: { lemma: "could", partOfSpeech: "modal verb", pronunciation: "/kʊd/", definition: "used for past ability, possibility, or a polite request", dictionarySenses: [], dictionaryExamples: [] },
  demand: { lemma: "demand", partOfSpeech: "noun", pronunciation: "/dɪˈmænd/", definition: "a forceful request or need", usage: "make no demand on us 表示不強求我們注意。" },
  died: { lemma: "die", partOfSpeech: "verb", pronunciation: "/daɪd/", definition: "stopped living; passed away", dictionarySenses: [{ partOfSpeech: "verb", meaning: "去世；死亡", definition: "to stop living", example: "" }] },
  encounters: { lemma: "encounter", partOfSpeech: "verb", pronunciation: "/ɪnˈkaʊntərz/", definition: "to meet or experience something, especially an unexpected or difficult situation" },
  distinguish: { lemma: "distinguish", partOfSpeech: "verb", pronunciation: "/dɪˈstɪŋɡwɪʃ/", definition: "to recognise the difference between things" },
  emphasis: { lemma: "emphasis", partOfSpeech: "noun", pronunciation: "/ˈemfəsɪs/", definition: "extra force given to a sound, word, or idea" },
  fluent: { lemma: "fluent", partOfSpeech: "adjective", pronunciation: "/ˈfluːənt/", definition: "able to speak or write smoothly and easily" },
  hesitation: { lemma: "hesitation", partOfSpeech: "noun", pronunciation: "/ˌhezɪˈteɪʃən/", definition: "a pause caused by uncertainty" },
  headline: { lemma: "headline", partOfSpeech: "noun", pronunciation: "/ˈhedlaɪn/", definition: "the title printed above a news story" },
  imperceptibly: { lemma: "imperceptible", partOfSpeech: "adverb", pronunciation: "/ˌɪmpərˈseptəbli/", definition: "so slightly that the change is almost impossible to notice", usage: "修飾 changing，強調變化細微到幾乎察覺不到。" },
  impressions: { lemma: "impression", partOfSpeech: "noun", pronunciation: "/ɪmˈpreʃənz/", definition: "ideas or feelings formed from what you notice" },
  interrupts: { lemma: "interrupt", partOfSpeech: "verb", pronunciation: "/ˌɪntəˈrʌpts/", definition: "stops a process or habit for a moment" },
  judgement: { lemma: "judgement", partOfSpeech: "noun", pronunciation: "/ˈdʒʌdʒmənt/", definition: "an opinion or evaluation about something" },
  legible: { lemma: "legible", partOfSpeech: "adjective", pronunciation: "/ˈledʒəbəl/", definition: "clear enough to read or understand", usage: "此處把世界比作文字，意為世界變得更可理解。" },
  material: { lemma: "material", partOfSpeech: "noun", pronunciation: "/məˈtɪəriəl/", definition: "the substance or source from which something is made" },
  mistaken: { lemma: "mistake", partOfSpeech: "verb", pronunciation: "/mɪˈsteɪkən/", definition: "incorrectly understood as something else" },
  noticing: { lemma: "notice", partOfSpeech: "noun", pronunciation: "/ˈnoʊtɪsɪŋ/", definition: "the practice of giving deliberate attention to what is present", usage: "全文的核心詞：主動留意日常細節。" },
  obligation: { lemma: "obligation", partOfSpeech: "noun", pronunciation: "/ˌɑːblɪˈɡeɪʃən/", definition: "a duty or burden that you feel required to fulfil" },
  observation: { lemma: "observation", partOfSpeech: "noun", pronunciation: "/ˌɑːbzərˈveɪʃən/", definition: "the act of watching or noticing carefully" },
  ordinary: { lemma: "ordinary", partOfSpeech: "adjective", pronunciation: "/ˈɔːrdəneri/", definition: "normal and part of everyday life" },
  overlook: { lemma: "overlook", partOfSpeech: "verb", pronunciation: "/ˌoʊvərˈlʊk/", definition: "to fail to notice something" },
  passive: { lemma: "passive", partOfSpeech: "adjective", pronunciation: "/ˈpæsɪv/", definition: "not actively taking part or making a choice" },
  principle: { lemma: "principle", partOfSpeech: "noun", pronunciation: "/ˈprɪnsəpəl/", definition: "a basic idea that guides an action or way of thinking" },
  repeatedly: { lemma: "repeat", partOfSpeech: "adverb", pronunciation: "/rɪˈpiːtɪdli/", definition: "again and again" },
  repetition: { lemma: "repetition", partOfSpeech: "noun", pronunciation: "/ˌrepəˈtɪʃən/", definition: "the act of doing or saying something again" },
  resists: { lemma: "resist", partOfSpeech: "verb", pronunciation: "/rɪˈzɪsts/", definition: "pushes back against or prevents an effect" },
  rhythm: { lemma: "rhythm", partOfSpeech: "noun", pronunciation: "/ˈrɪðəm/", definition: "a pattern of stressed and unstressed sounds" },
  sharpened: { lemma: "sharpen", partOfSpeech: "verb", pronunciation: "/ˈʃɑːrpənd/", definition: "became clearer, stronger, or more sensitive" },
  sustainable: { lemma: "sustainable", partOfSpeech: "adjective", pronunciation: "/səˈsteɪnəbəl/", definition: "able to continue over a long period" },
  tempting: { lemma: "tempt", partOfSpeech: "adjective", pronunciation: "/ˈtemptɪŋ/", definition: "making you want to do something" },
  unfamiliar: { lemma: "unfamiliar", partOfSpeech: "adjective", pronunciation: "/ˌʌnfəˈmɪliər/", definition: "not known or recognised from previous experience" },
  women: { lemma: "woman", partOfSpeech: "plural noun", pronunciation: "/ˈwɪmɪn/", definition: "adult female people" }
});

const COMMON_USES = parseCommonUses(`
attention	pay attention to::留意；注意…… | attract attention::引起注意 | attention to detail::對細節的重視
audible	barely audible::幾乎聽不見 | clearly audible::清楚可聞 | an audible sigh::聽得見的嘆息
blur	a blur of activity::一片忙亂的景象 | blur the line between::模糊……之間的界線 | become a blur::變得模糊不清
brief	a brief pause::短暫停頓 | in brief::簡而言之 | keep it brief::說得簡短些
carefully	read carefully::仔細閱讀 | consider carefully::慎重考慮 | carefully designed::精心設計的
could	could be possible::有可能 | could you…?::你可以……嗎？（禮貌請求） | could have + past participle::本來可能；本可以……
demand	in high demand::需求很大 | meet the demand::滿足需求 | demand for something::對某物的需求
deployment	software deployment::軟件部署 | deployment to a location::調派到某地 | rapid deployment::快速部署
die	die of an illness::因病去世 | die from injuries::傷重不治 | die at the age of…::在……歲去世
encounter	encounter a problem::遇到問題 | encounter difficulties::遭遇困難 | encounter resistance::遇到阻力
distinguish	distinguish between A and B::區分 A 與 B | distinguish A from B::把 A 與 B 分辨開 | a distinguishing feature::顯著特徵
emphasis	place emphasis on::著重於…… | with emphasis::加重語氣地 | shift the emphasis::轉移重點
flexibility	greater flexibility::更大彈性 | flexibility to do something::做某事的靈活空間 | improve flexibility::提升靈活性
fluent	fluent in English::英語流利 | speak fluent English::說流利英語 | a fluent speaker::說話流暢的人
headline	headline news::頭條新聞 | make the headlines::成為新聞焦點 | grab the headlines::搶佔頭條
hesitation	without hesitation::毫不猶豫地 | a moment's hesitation::片刻猶豫 | show hesitation::表現出遲疑
imperceptibly	almost imperceptibly::幾乎難以察覺地 | change imperceptibly::不知不覺地改變 | move imperceptibly::極輕微地移動
impression	make an impression on::給……留下印象 | first impression::第一印象 | under the impression that::以為；誤以為……
interrupt	interrupt someone::打斷某人說話 | be interrupted by::被……打斷 | interrupt the flow::打亂進程
judgement	use your judgement::自行判斷 | pass judgement on::對……妄下判斷 | an error of judgement::判斷失誤
legible	clearly legible::清晰可辨 | legible handwriting::易辨認的字跡 | make the text more legible::讓文字更易讀
material	source material::原始素材 | raw materials::原材料 | reading material::閱讀材料
mistake	mistake A for B::把 A 誤認為 B | be mistaken about::對……有所誤解 | by mistake::錯誤地；無意中
notice	notice a change::察覺變化 | take notice of::注意到；重視 | at short notice::在很短的通知時間內
obligation	have an obligation to::有義務…… | be under an obligation::負有義務 | fulfil an obligation::履行義務
ongoing	an ongoing project::持續進行的項目 | an ongoing discussion::仍在進行的討論 | ongoing support::持續支援
observation	make an observation::提出觀察所得 | careful observation::仔細觀察 | under observation::在觀察中
ordinary	ordinary life::日常生活 | out of the ordinary::不尋常 | nothing ordinary about::一點也不平凡
overlook	easily overlooked::容易被忽略 | overlook a detail::忽略細節 | a room overlooking the sea::一間俯瞰海景的房間
passive	a passive role::被動角色 | the passive voice::被動語態 | remain passive::保持被動
principle	a basic principle::基本原則 | in principle::原則上 | a matter of principle::原則問題
particularly	particularly important::尤其重要 | particularly useful::特別有用 | not particularly…::不怎麼……；不特別……
repeatedly	repeatedly ask::反覆詢問 | repeatedly fail::屢次失敗 | happen repeatedly::反覆發生
repetition	learn through repetition::透過重複學習 | avoid repetition::避免重複 | a repetition of::……的再次發生
resist	resist temptation::抵抗誘惑 | resist change::抗拒改變 | hard to resist::難以抗拒
rhythm	a sense of rhythm::節奏感 | natural rhythm::自然節奏 | the rhythm of daily life::日常生活的節奏
seismic	seismic activity::地震活動 | seismic waves::地震波 | seismic data::地震數據
sharpen	sharpen your skills::磨練技能 | sharpen the focus::使焦點更清晰 | sharpen a pencil::削鉛筆
sustained	sustained effort::持續努力 | sustained growth::持續增長 | sustained attention::持續專注
sustainable	sustainable development::可持續發展 | sustainable growth::可持續增長 | environmentally sustainable::環境上可持續的
tempting	a tempting offer::誘人的提議 | it is tempting to::很容易令人想要…… | too tempting to resist::誘人得難以抗拒
unfamiliar	be unfamiliar with::不熟悉…… | unfamiliar territory::陌生領域 | look unfamiliar::看起來陌生
`);

const LEMMA_OVERRIDES = Object.freeze({
  appears: "appear", applies: "apply", are: "be", been: "be", becomes: "become", calling: "call", calls: "call",
  carries: "carry", changes: "change", changing: "change", closes: "close", deserves: "deserve", does: "do",
  eased: "ease", features: "feature", grows: "grow", has: "have", heard: "hear", interrupts: "interrupt",
  keeping: "keep", leaning: "lean", learning: "learn", lives: "live", made: "make", mistaken: "mistake",
  moving: "move", peels: "peel", placed: "place", provided: "provide", raised: "raise", reaching: "reach",
  recognised: "recognise", records: "record", repeatedly: "repeat", resists: "resist", sharpened: "sharpen",
  slows: "slow", sounds: "sound", umbrellas: "umbrella", waiting: "wait", words: "word", was: "be"
});

const QUIET_SENTENCE_TRANSLATIONS = Object.freeze([
  [
    "大多數日子並不會宣告自己的到來。",
    "它們沒有標題地到來：光線聚在廚房桌上，火車門關上前短暫的停頓，或一棵熟悉的樹在一週又一週之間幾乎難以察覺地改變。",
    "這些細節很容易被忽略，因為它們並不要求我們注意。",
    "然而，它們往往正是構成記憶的材料。"
  ],
  [
    "留意有時被誤認為被動的觀察。",
    "在實踐中，它是一種主動的注意。",
    "留意某件事，就是哪怕只在短短一刻，也決定它值得留在視野之中。",
    "這個決定或許只持續幾秒，卻會打斷我們憑慣性穿行世界的習慣。"
  ],
  [
    "一個有用的練習，是描述一個普通場景而不急於評價。",
    "不要把一條街稱作美麗或乏味，而是記下真正存在的事物：麵包店外的三把濕雨傘、靠在藍門旁的送貨單車，以及有人在巴士上剝橙時散出的柑橘氣味。",
    "具體的語言能抵抗籠統印象帶來的模糊。"
  ],
  [
    "這種注意也會改變我們閱讀的方式。",
    "一個起初看似簡單的句子，重讀時或許會顯露其結構。",
    "我們開始聽見作者在何處放慢，意象在何處承載論點，熟悉的片語又在何處被放進陌生語境。",
    "重讀不是重複，而是觀看距離的改變。"
  ],
  [
    "同一原則也適用於聆聽。",
    "學習語言時，我們很容易用辨認出的單字數量衡量成功。",
    "但意義也存在於節奏、停頓、重音，以及那些維繫對話的細小聲音之中。",
    "只有當理解一切的壓力減輕後，這些特徵才會變得可聽見。"
  ],
  [
    "筆記本可以幫忙，前提是它不要成為另一項負擔。",
    "一行就夠了：一個值得保存的片語、一個難以分辨的聲音，或一首詩引發的問題。",
    "目的不是做出完整記錄。",
    "而是留下一條路，帶你回到注意力變得敏銳的那一刻。"
  ],
  [
    "久而久之，這些小記錄會形成一張私人地圖。",
    "它們不只顯示我們讀過或聽過甚麼，也顯示甚麼一次又一次召喚我們回來。",
    "可持續的練習從這種回返中生長。",
    "我們繼續，是因為世界變得稍微更可理解，也因為總有某件平凡事物等待我們再看一眼。"
  ]
]);

function parseGlosses(table) {
  return Object.freeze(Object.fromEntries(table.trim().split("\n").map((line) => {
    const separator = line.indexOf("\t");
    return [line.slice(0, separator), line.slice(separator + 1)];
  })));
}

function parseCommonUses(table) {
  const entries = {};
  table.trim().split("\n").forEach((line) => {
    const separator = line.indexOf("\t");
    const key = line.slice(0, separator).trim();
    const uses = line.slice(separator + 1).split(" | ").map((entry) => {
      const meaningSeparator = entry.indexOf("::");
      return Object.freeze({
        pattern: entry.slice(0, meaningSeparator).trim(),
        meaning: entry.slice(meaningSeparator + 2).trim()
      });
    });
    entries[key] = Object.freeze(uses);
  });
  return Object.freeze(entries);
}

export function normalizeEnglishWord(value = "") {
  return String(value)
    .trim()
    .replaceAll("’", "'")
    .toLocaleLowerCase()
    .replace(/^[^a-z]+|[^a-z]+$/g, "");
}

export function englishItemId(value = "") {
  const slug = String(value)
    .trim()
    .replaceAll("’", "'")
    .toLocaleLowerCase()
    .replace(/[^a-z0-9'-]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
  return `english:${slug}`;
}

export function findEnglishSentence(text = "", offset = 0) {
  const safeText = String(text);
  const safeOffset = Math.max(0, Math.min(safeText.length, Number(offset) || 0));
  const sentences = Array.from(safeText.matchAll(/[^.!?]+(?:[.!?]+|$)/g));
  const matchIndex = Math.max(0, sentences.findIndex((match) => safeOffset >= match.index && safeOffset < match.index + match[0].length));
  const match = sentences[matchIndex] || [safeText];
  return { text: String(match[0] || safeText).trim(), index: matchIndex };
}

export function getEnglishContext({ articleId, paragraph = "", paragraphIndex = 0, offset = 0 } = {}) {
  const sentence = findEnglishSentence(paragraph, offset);
  const translation = articleId === "quiet-noticing"
    ? QUIET_SENTENCE_TRANSLATIONS[paragraphIndex]?.[sentence.index] || ""
    : "";
  return { context: sentence.text, contextMeaning: translation, sentenceIndex: sentence.index };
}

export function lookupEnglishWord({ word, articleId, paragraph, paragraphIndex, offset } = {}) {
  const normalized = normalizeEnglishWord(word);
  const openEntry = openEnglishDictionary[normalized] || {};
  const details = RICH_ENTRIES[normalized] || {};
  const lemma = details.lemma || openEntry.lemma || LEMMA_OVERRIDES[normalized] || normalized;
  const lemmaEntry = openEnglishDictionary[lemma] || openEntry;
  const meaning = QUIET_NOTICING_GLOSSES[normalized]
    || QUIET_NOTICING_GLOSSES[lemma]
    || GENERAL_ENGLISH_GLOSSES[normalized]
    || GENERAL_ENGLISH_GLOSSES[lemma]
    || lemmaEntry.meaning
    || "";
  const dictionarySenses = Array.isArray(details.dictionarySenses)
    ? details.dictionarySenses
    : Array.isArray(lemmaEntry.senses) ? lemmaEntry.senses : [];
  const dictionaryExamples = Array.isArray(details.dictionaryExamples)
    ? details.dictionaryExamples
    : Array.isArray(lemmaEntry.examples) ? lemmaEntry.examples : [];
  const context = getEnglishContext({ articleId, paragraph, paragraphIndex, offset });
  return {
    text: String(word || "").trim(),
    normalized,
    lemma,
    type: "word",
    meaning,
    pronunciation: details.pronunciation || lemmaEntry.pronunciation || "",
    partOfSpeech: details.partOfSpeech || lemmaEntry.partOfSpeech || "",
    definition: details.definition || lemmaEntry.definition || "",
    usage: details.usage || "",
    commonUses: COMMON_USES[normalized] || COMMON_USES[lemma] || [],
    dictionarySenses,
    dictionaryExamples,
    dictionarySource: Object.keys(lemmaEntry).length
      ? lemmaEntry.translationSource === "freedict" ? "wordnet-freedict" : "open-wordnet"
      : "",
    dictionaryStatus: englishDictionaryState.status,
    ...context,
    lookupKey: `${articleId}:${paragraphIndex}:${Number(offset) || 0}`
  };
}

export function hasLocalEnglishMeaning(word) {
  const normalized = normalizeEnglishWord(word);
  const lemma = openEnglishDictionary[normalized]?.lemma || LEMMA_OVERRIDES[normalized] || normalized;
  return Boolean(
    QUIET_NOTICING_GLOSSES[normalized]
    || QUIET_NOTICING_GLOSSES[lemma]
    || GENERAL_ENGLISH_GLOSSES[normalized]
    || GENERAL_ENGLISH_GLOSSES[lemma]
    || openEnglishDictionary[normalized]?.meaning
    || openEnglishDictionary[lemma]?.meaning
  );
}

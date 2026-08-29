import {
  openClassicalTranslations,
  openClassicalTranslationSnapshot
} from "./open-classical-translations.js";

const dynamicTranslationCache = new Map();
const shardPromiseCache = new Map();
const translationManifestUrl = new URL("../data/classical-translations/manifest.json", import.meta.url);
const aiTranslationStatus = "AI 今譯 · 未經人工校訂";
let manifestPromise = null;

export const classicalTranslationErrorCodes = Object.freeze({
  catalogUnavailable: "CLASSICAL_TRANSLATION_CATALOG_UNAVAILABLE",
  notIncluded: "CLASSICAL_TRANSLATION_NOT_INCLUDED"
});

export function isClassicalTranslationUnavailableError(error) {
  return error?.code === classicalTranslationErrorCodes.catalogUnavailable
    || error?.code === classicalTranslationErrorCodes.notIncluded;
}

function classicalTranslationError(code, message, cause = null) {
  const error = new Error(message);
  error.name = "ClassicalTranslationError";
  error.code = code;
  if (cause) error.cause = cause;
  return error;
}

function catalogUnavailableError(message, cause = null) {
  return classicalTranslationError(classicalTranslationErrorCodes.catalogUnavailable, message, cause);
}

const editorialSource = Object.freeze({
  label: "Leafbound 今譯",
  status: "現代中文重述 · 編輯稿",
  license: "Leafbound 原創整理"
});

const zhaNiziTranslations = Object.freeze({
  "open-yuanqu-09c1ef68a923411b4f20": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "我活了半輩子，從不曾讓長輩為我操心。女子雖然塗脂抹粉，和男子相比也不過少裹一方頭巾；我最恨那些不知自重、行事不像樣的女人。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-94a25e7d597cece17e04": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "男子若不守本分，一番斥責便能使兩家一拍兩散；再強硬的人，也會被罵得耳根發燙。天下男子即使先動了心，女子也應守住自己，不能失去分寸。兩家若都無意，怎能單方面硬要成親？若明知對方無心，就該及早抽身。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-ff3cfdf022c6c912bee4": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "他連水熱都等不及，一會兒要面盆；面盆才遞上，又要手巾；手巾剛送到，便叫人替他解衣扣。這樣百般差遣，弄得服侍的人一刻也不得安穩。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-35194ac0f39bf474d0f5": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "既然進了房門，又怎能輕易回身？這間單身男子住的房子狹窄簡陋，也沒有什麼像樣的陳設。我燕燕沒有什麼可以奉承他的，只是拗不過他那般殷勤。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-9493c1fa7adc30eea82a": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "你躺着讀經史，坐着彷彿與聖人相對；研讀《詩經》的〈國風〉、〈雅〉、〈頌〉和歷代訓詁，誦讀《尚書》的典、謨、訓、誥，滿口都是堯舜與溫良恭儉、忠信之道。可燕燕我性情直爽，只懂那些據險爭戰、滅國攻城的大道理，哪裏懂得兒女婚聘、締結秦晉之好？"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-2dc34856dd2a8bf5af22": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "這間書房容得下車馬，也接待得了賓客。月光照着翠竹，枝影如龍蛇游動；夜色落在碧色軒窗，燈火與書香相伴；細雨打着綠窗，更顯琴書清潤。每天席上都有賓客相聚，勝過十年寒窗無人過問的冷清。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-cf26203a43626e75da0b": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "常說一家有女，百家來求；可才剛說自己貞烈，轉眼便動了心。他的話說得周到圓熟，言辭雖硬，性情卻有些粗直，並不是尋常人物。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-cd48e05958ce0ade7077": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "沒有心上人時，我獨自承受寂寞與煩悶；有了心上人，又連夢裏也為他勞神，百般牽掛。明知有情人還不曾正式前來求問，我卻已經盼着與他結成姻緣。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-e8330a7193d2881aed2f": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "自己衡量婚事，自己開口說親，倒像是新婦反過來責怪媒人。從前我冰清玉潔，旁人難以親近；偏偏因為和他熟識，連說話也變得親密。我本想惱他，卻又不忍聽見疏遠的話。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-81e7ac3f1ecf29e50e91": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "我並非不願回報你一夜的情意，只因彼此太熟、太知根知底，又是門當戶對的親上加親。看他的相貌和身分都這樣出眾，我怎肯錯過這位好郎君？"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-f9de2cdc31bf618a9c0e": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "人若不懂珍惜眼前的好姻緣，恐怕要困頓一世；可真成就了這段感情，又怕辜負彼此。從前我的性情像烈火般剛強，一旦付出真心，若他此後不再過問，豈不是白白耗去一生的情意？"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-46fcd459e27e735f70be": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "男人一個個背棄舊情、忘恩負義，從來不見書信往來。我反覆思量，仍不知道他當初的話是真是假，只怕這場所謂的新婚，從頭到尾都糊裏糊塗。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-b55d274998ceb2c685be": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "他忽然掀起簾子，猛地回頭相問，我心裏也不由得親近起來。你應把同枕成婚的日子明白定下，不要只讓我夜夜與你私下相會。你曾答應給我包髻、團衫和繡手巾，我便專等着成為你這位世襲千戶正式承認的小夫人；可不要許下承諾又不守信。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-5775d60a21936ab4474d": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "每年寒食節，鄰家姑娘都相約出遊。去年沒有人管束我，我打鞦韆、鬥百草，一直玩到天昏地黑；今年卻不敢回來得太晚，因為家裏多了一個性情還沒收斂的丈夫。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-f82a2a440343d9200c93": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "你為什麼咬緊潔白的牙齒、斜倚着小巧的雙足？臉上一時生氣、一時歡喜，叫我滿心都是你。可你又若即若離、三心兩意，清早起來仍各自打着各自的算盤。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-7d456f2d2068c543c9d0": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "難道你在郊外撞見了什麼邪祟？你既不瘋也不癡，卻面無表情、呆呆地像一堆冷灰。這番煩惱究竟因誰而起，莫非落在我的身上？我得打聽清楚其中的是非。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-2b74561c7fd777c43782": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "你看我微微喘息、說話恍惚、腳步踉蹌；胸前的衣帶鬆了又繫，裙腰空閒時也不住往上提，連髮髻都偏斜了。這些異樣，全是心事在身上留下的痕跡。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-6b8aa0d5f18c5196a2a4": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "一直折騰到天昏地黑，連衣裳也不肯更換；身上的繫帶和紐扣都解開了，外襖鬆鬆敞着，手帕也被隨手丟在地上。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-1883247f111156acc93b": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "我看見那人手忙腳亂地收拾，便搶先把那方手帕藏進薄羅衣袖。好哥哥，現在我們當面把話說清楚：這樁爭執總能商量，可你丟下的手帕，究竟是誰的？"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-ddca60c1c0285e93d2a8": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "老夫人派我來服侍你，你卻污了我的清白；如今又另有別人，把我看得像奴婢一樣低賤。燕燕到底有哪一點對不起你？"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-8101ed4e3f1d1d2bfe05": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "我真敢把這只玳瑁盒摔得粉碎，把手帕剪來做靴邊、染來做鞋面，或撕作鋪墊。從前我萬分珍重地待你，如今一旦到了刀下，也能把它割得零零碎碎。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-c65501f8811fc1dcbc5f": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "你還說她是從好人家請來的，既把她看得不輕、看得值錢，又百般尊重。你們兩邊暗中牽連、費盡心思，竟把這段關係看得像精細刺繡般珍貴。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-53cba066136770afaebb": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "並不是哪個女人強迫你，是你自己甘心答應，還曾在神前立誓。上天的報應從不偏差，不過早晚有別；善惡都瞞不過天意，正所謂人間的私語，在天上聽來也如雷響。早晨還說得好好的，今天便變卦；到了晚上，更叫人徹底寒心。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-a48c040993386668e013": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "別人才皺一皺眉，我便能從開頭猜到結尾；你這種糖一樣甜的話，我不知聽過多少。你又不是殘花釀成的蜂蜜，也不是細雨調成的燕泥。我笑自己行事癡狂：從前受盡沒有男人相伴的煩惱，如今才知道有了丈夫又是另一種滋味。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-302d8c8276136e0d2e07": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "想爭又能怎樣爭，想後悔又能怎樣後悔？我受過的委屈和身心損傷，已經無法補回。原先答應給我的包髻和團衫，如今竟要拿去成全別人。她若留在我們家裏，我便只能與你分道揚鑣，各走各路。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-2fecf0be4a4d23f6b85b": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "明天我還得照樣給她衣服穿、給她茶飯吃，晚上又送她進被窩與你同睡。她在暖帳裏做着三更好夢，我卻守着寒爐，撥盡一夜冷灰。我只把一句話牢記心頭：只願那些辜恩負德的人，個個都享受這種所謂封妻的福分。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-e99636b642ddbd56c0ec": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "走出門時我腳步一高一低，連鞋底踏到地上都沒有知覺。這種痛除了他，我還能向誰傾訴？怒氣快把肚子撐破，卻又不敢對旁人提起。只能獨自在明月下，像孤雁守着自己的影子，不知這場折磨何時才到盡頭。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-4af9cf0327c463da38e8": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "傻子啊傻子，不要再怨天；我這個可憐人，只能回頭責罵自己。本來盼着穿上深色腰裙、梳起藍色包髻，正式成家；如今攀附高門，落得的卻只有這番羞辱。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-6c8549d77cb808765340": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "我長吁短嘆，千聲萬聲地捶牀搗枕，一直熬到三更四更。這段姻緣像望梅止渴、畫餅充飢，只能空想。為什麼短短片刻的歡情，竟把我傷成這樣？一個人舒心快活，另一個人卻只能自討沒趣。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-d1d1b773fa1a56de7034": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "我的命這樣輕薄，姻緣來得熾熱，恩情卻短得可憐。看那飛蛾一次次撲向烈焰，正撞上銀燈送掉性命，我們兩個也正可相比：我為了一個名分失去清白，你則為了一點燈火般的誘惑葬送自己。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-a428191cdb90a6da2878": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "我指着這盞銀燈：牽走我們兩個魂魄的，都是那一點虛名。任你再伶俐、再能應付，也擺脫不了自己的影子。這件事本來就名不正言不順，又怎能任憑他大張旗鼓地安排，公開給別人一個小夫人的名分？"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-366cc17c11c32bc41ce3": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "這回真叫我在平地上摔了一跤。不過我不再與你爭，還勞你屈尊前來。若你肯答應我一件事，我便願意跟隨你；若要我饒過你，就再對着星月立一次誓。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-f92f06547a4709453c34": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "你指着遙遠的天空、淡月和疏星，再發一次海誓山盟，我便收住火爆脾氣，給你留些情面，忍氣吞聲地饒過你這個負心人。等把你哄出門去，我立刻關緊窗門，吹滅殘燈。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-ab6c74e2d45038edd656": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "燕燕替人傳話也算見過世面，可哪裏真正懂得兒女婚聘的規矩，什麼許婚、下聘都不熟。洛陽城裏能言善道的官媒多的是，我怎敢冒名代替？不過若真讓我作主，這件事便能像熱火融化冬冰一樣迅速辦成。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-a191bf26f4cbdd3177f2": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "這個沒出息的短命人，輕視別人，最後也只會被人輕視；嘴裏還一味編排是非。老夫人偏又輕信他，認定我能憑一張快嘴把婚事說成，真叫人氣得連他的祖宗也想責罵。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-5d87c247227ea0bbdbf1": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "就算兩家願意相迎，也該先把情況打聽清楚，再到雙方門上走一趟。若到了那家，發現姑娘的話並不實在，這場所謂風月便成了勉強撮合。燕燕於是分別去問雙方長輩是否答應這門親事，得到允許後再回來覆命。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-8d016cfbd6c6cd16e600": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "先前他掩蓋了我們幾夜的情分，如今我到了這裏，又被人罵得渾身痠痛，像翻牆的賊被當場捉住，又像忽然遭蠍子蜇了一下。我的一番用心全都落空，只因那位小夫人已把他的魂牽走。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-527839dc307318af8904": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "我命裏恐怕終究沒有婚姻，指望這段感情，就像指着天上的雁說要拿來做羹一樣虛妄。眼下他還口口聲聲、戰戰兢兢地對人溫柔殷勤；總有一天，留下的卻會是孤單冷清、哽咽哭泣，以及一個負心薄倖的男人。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-55fd5317be226a3f1374": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "常說主人有福，媒人也能沾光；我這個替人調風月的媒人卻只能躲在廳後。好話全用來撮合他們在枕上甜甜蜜蜜，留下我獨自在薄薄的被窩裏受冷。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-69c96875f8a21b884a8e": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "她的父親是尚書，女婿又是世襲千戶，家中有成群佩着金勒的駿馬和一輛輛彩車。媒人把他們說得像魚水般相得，卻把我丟成一個孤苦無依的人；這哪裏是為人撮合、替人安身的道理？"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-7615f6548dd2b301d24d": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "官人騎着名駒，腰間佩滿潔白無瑕的玉飾；夫人們按着禮序，穿全套精細刺繡的衣服，包髻上綴着大珍珠，額前戴着玲瓏美玉。樂聲悠揚，眾人像雁行般整齊舉手起舞。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-5a85ceb4f65ef2b2cc3d": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "姐姐骨肉勻淨，像畫中、塑像中的美人，肌膚白嫩得如同凝脂。她從小便由丫鬟和乳母悉心照料；若拿來相比，不知燕燕如今的梳妝打扮又算得怎樣？"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-dadd0496ca0348357960": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "你扯住我的衣領，又抓着腰間、掐到胯骨；這樣拉扯看似不算什麼，受痛受屈的卻是我。你本不該先發怒；若不是你先說出那些話，我又怎敢這樣看待你？既然自稱一家之主，就該有主人的擔當。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-3858a03c20dbf9257273": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "我們的千戶騎着駿馬，正配得上香車中的佳人。願他們結下同心結，長久相依在合歡樹下，如鳳凰雛鳥、連理枝和比目魚般成雙，千年相聚；此後不受風雨摧折，一直到白頭都彼此相守。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-f636d9ef73d6f99986a0": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "合婚推算起來，兩人的年歲正合；出嫁以後也有衣食福分。若是招女婿便迎進家門，若是把女兒嫁出去，就備好財禮讓對方娶走。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-0d5925e93d83db2942ad": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "算命的惡言把人說成敗壞家業的鐵掃帚，說她不能旺夫，還會斷絕子嗣、妨礙公婆、克害丈夫。臉上淚痕重重，又說今年凶星聚集，晦暗的日子還要持續大半年。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-f329924caf7e1259686c": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "只憑出生年月和推算出的歲數，便斷言她不是守義節的好妻子，休想生得兒女雙全，甚至詛咒她將來斷子絕孫、全家敗亡。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-97130e7f15a8af31a247": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "燕燕在書房服侍他的時候，他明明答應讓我做第二位夫人。我也是有血有肉、有面貌、會說話的人，怎能把我當成沒有感受的物件？"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-677e29b5a1e716951341": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "到了如今，從頭到尾的承諾全是虛話。燕燕不是石頭刻的，也不是鐵打的；這場打擊逼得我幾乎活不下去，身體癱軟、心中痛苦。兩邊都容不下我，叫我怎樣站得住，又能往哪裏去？"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-8545dfa72f8f1974aaf9": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "酒杯裏斟滿碧綠清酒。我原本命裏只是做婢女、做奴僕，多謝相公和夫人的抬舉，哪敢妄想與正妻平起平坐？只要能與丈夫在一處並肩起舞，燕燕眼前便像一路開滿鮮花。"
    ]),
    source: editorialSource
  })
});

const editorialTranslations = Object.freeze({
  ...zhaNiziTranslations,
  "open-guwen-87c7a29cd59b3c40239e": Object.freeze({
    kind: "古文",
    paragraphs: Object.freeze([
      "秋季七月，魯莊公會同齊侯、鄭伯討伐許國。庚辰日，大軍逼近許都。潁考叔拿着鄭伯的蝥弧旗率先登城，子都從下面向他放箭，潁考叔墜落。瑕叔盈又拿起蝥弧旗登城，向四周揮旗高喊：「國君已經登城了！」鄭軍於是全部登上城牆。壬午日，聯軍攻入許都，許莊公逃往衞國。齊侯想把許國讓給魯莊公。魯莊公說：「您認為許國不盡職守，所以我才跟從您討伐。如今許國已經服罪，即使您有命令，我也不敢參與接管。」齊侯便把許國交給鄭國處置。",
      "鄭伯命許國大夫百里輔佐許叔，讓他住在許都東部。鄭伯說：「上天把災禍降給許國，鬼神不滿許國國君，才借我的手懲罰他。我連自己的父兄都未能和睦相處，哪敢把攻下許國當作功勞？我有一個弟弟，不能與他和睦，竟讓他流落四方謀生，又怎能長久佔有許國？您應當侍奉許叔，安撫這裏的百姓；我會派公孫獲協助您。如果我得以壽終，上天或許會依禮收回降給許國的災禍。到那時，最好讓許國國君重新奉守社稷；鄭國若有所請，也希望許國能像從前的婚姻親族一樣，委屈自己而彼此相從。不要讓別的族姓逼近並佔據這裏，與鄭國爭奪土地。我的子孫將來恐怕連自救都來不及，又怎能長久替許國祭祀？我讓您留在這裏，不只為了許國，也姑且用來鞏固鄭國邊境。」",
      "鄭伯又讓公孫獲住在許都西部，告誡他說：「你的器物財貨都不要留在許國。我死後，你要趕快離開！我們的先君剛在這裏建立都邑；如今周王室已經衰微，周朝子孫也日漸失去原有的秩序。許國是四岳的後裔；如果上天已經厭棄周人的德運，我們又怎能與許國相爭呢？」",
      "君子評論鄭莊公在這件事上合乎禮。禮，是治理國家、安定社稷、使人民有秩序並讓後代受益的準則。許國不守法度，所以出兵討伐；許國服罪後便放過它。鄭莊公衡量德行再作安排，估量力量再採取行動，觀察時勢而後行事，又不把禍患留給後人，因此可以說是懂得禮。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-d41385a16ad94a6be834": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "枯藤纏着老樹，黃昏的烏鴉停在枝頭；小橋下流水潺潺，旁邊有人家。荒涼古道上，西風吹着一匹瘦馬。夕陽漸漸西沉，漂泊天涯的旅人愁腸欲斷。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-09d6a8ac8f0b4e413072": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "自從送別以後，心裏始終難以割捨；這一點相思，不知何時才會停止。我倚着欄杆，衣袖拂過像雪一樣飛舞的楊花。溪流曲折，山巒又遮住視線，那個人已經遠去了。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-f5ce4f70b266526ace01": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "離別容易，再相見卻很難；不知道那人的雕鞍如今停在哪裏。春天將要過去，人仍沒有回來。這些日子，只苦了我緊皺的眉頭和流淚的雙眼。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-687581f422fe01fc49f1": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "清晨雨停，橫在眼前的山色格外秀麗，野外的水漲滿了沙洲。我倚遍欄杆，仍只是徒然回望；走下高樓時，滿眼暮色秋景更添傷感。"
    ]),
    source: editorialSource
  }),
  "open-yuanqu-3c07027decd94dc38a21": Object.freeze({
    kind: "曲",
    paragraphs: Object.freeze([
      "四季都像春天般富足，萬物在酒意中顯得風流；水色澄澈如藍，花朵鮮明如錦繡。",
      "在花邊停下駿馬，在柳樹外繫住輕舟；湖中畫船交錯，湖岸良馬奔馳。",
      "鳥在花影裏鳴叫，人立在粉牆牆頭；春意像兩縷情絲牽連，明亮的雙眼如秋水流轉。",
      "金鴨香爐裏燃着香，悠閒地倚在小紅樓旁；月亮升到柳梢，有情人相約在黃昏之後。"
    ]),
    source: editorialSource
  })
});

const editorialByKind = Object.freeze(Object.values(editorialTranslations).reduce((counts, item) => {
  counts[item.kind] = (counts[item.kind] || 0) + 1;
  return counts;
}, {}));

function translationId(poemOrId) {
  return String(typeof poemOrId === "string" ? poemOrId : poemOrId?.id || "").trim();
}

async function translationShardId(id) {
  const subtle = globalThis.crypto?.subtle;
  if (!subtle) throw new Error("此瀏覽器不支援今譯分片所需的 SHA-256");
  const digest = new Uint8Array(await subtle.digest("SHA-256", new TextEncoder().encode(id)));
  return digest[0].toString(16).padStart(2, "0");
}

async function fetchTranslationJson(url, label, { unavailableWhenMissing = false, unavailableWhenInvalid = false } = {}) {
  const response = await globalThis.fetch(url.href, {
    cache: "force-cache",
    headers: { Accept: "application/json" }
  });
  if (!response.ok) {
    if (unavailableWhenMissing && response.status === 404) {
      throw catalogUnavailableError(`${label}尚未發布（404）`);
    }
    throw new Error(`${label}載入失敗（${response.status}）`);
  }
  try {
    return await response.json();
  } catch (error) {
    if (unavailableWhenInvalid) throw catalogUnavailableError(`${label}不是有效的 JSON 目錄`, error);
    throw error;
  }
}

function validateTranslationManifest(value) {
  const strategy = value?.shardStrategy;
  if (strategy?.algorithm !== "sha256-id-prefix" || Number(strategy?.prefixLength) !== 2) {
    throw catalogUnavailableError("今譯索引需要兩位 SHA-256 ID 前綴");
  }
  if (!Array.isArray(value?.shards)) throw catalogUnavailableError("今譯索引缺少分片清單");

  const shardsById = new Map();
  for (const descriptor of value.shards) {
    const id = String(descriptor?.id || "").toLowerCase();
    if (!/^[0-9a-f]{2}$/u.test(id)) throw catalogUnavailableError("今譯索引包含無效的分片 ID");
    if (shardsById.has(id)) throw catalogUnavailableError(`今譯索引包含重複分片 ${id}`);
    const declaredPath = descriptor?.path ?? descriptor?.url;
    if (declaredPath !== undefined) {
      const normalizedPath = String(declaredPath).replace(/^\.\//u, "");
      if (normalizedPath !== `shards/${id}.json`) {
        throw catalogUnavailableError(`今譯分片 ${id} 的路徑與 ID 不一致`);
      }
    }
    shardsById.set(id, descriptor);
  }
  return Object.freeze({
    shardsById,
    quality: value.quality && typeof value.quality === "object" ? value.quality : null
  });
}

function loadTranslationManifest() {
  if (!manifestPromise) {
    manifestPromise = fetchTranslationJson(translationManifestUrl, "今譯索引", {
      unavailableWhenMissing: true,
      unavailableWhenInvalid: true
    })
      .then(validateTranslationManifest)
      .catch((error) => {
        manifestPromise = null;
        throw error;
      });
  }
  return manifestPromise;
}

async function translationShardDescriptor(manifest, id) {
  const shardId = await translationShardId(id);
  const descriptor = manifest.shardsById.get(shardId);
  if (!descriptor) {
    throw classicalTranslationError(
      classicalTranslationErrorCodes.notIncluded,
      "今譯目錄尚未收錄這篇作品"
    );
  }
  return { descriptor, shardId };
}

function translationShardUrl(descriptor, shardId) {
  if (String(descriptor?.id || "").toLowerCase() !== shardId) {
    throw catalogUnavailableError("今譯索引的分片 ID 不一致");
  }
  const path = descriptor.path || descriptor.url || `shards/${shardId}.json`;
  const url = new URL(String(path), translationManifestUrl);
  if (translationManifestUrl.protocol !== "file:" && url.origin !== translationManifestUrl.origin) {
    throw catalogUnavailableError("今譯分片必須與 Leafbound 同源");
  }
  return url;
}

function loadTranslationShard(url) {
  const key = url.href;
  if (!shardPromiseCache.has(key)) {
    const request = fetchTranslationJson(url, "今譯分片").catch((error) => {
      shardPromiseCache.delete(key);
      throw error;
    });
    shardPromiseCache.set(key, request);
  }
  return shardPromiseCache.get(key);
}

function translationRecord(payload, id) {
  if (Number(payload?.schemaVersion) !== 1 || !Array.isArray(payload?.records)) {
    throw new Error("今譯分片格式無效");
  }
  const compact = payload.records.find((record) => Array.isArray(record) && record[0] === id);
  if (!compact) return null;
  if (compact.length < 5 || !compact[4] || typeof compact[4] !== "object" || Array.isArray(compact[4])) {
    throw new Error("今譯分片中的紀錄格式無效");
  }
  return {
    id: compact[0],
    kind: compact[1],
    paragraphs: compact[2],
    sourceHash: compact[3],
    metadata: compact[4]
  };
}

function normalizeAiTranslation(record, fallbackKind) {
  const content = record?.paragraphs;
  const paragraphs = (Array.isArray(content) ? content : [content])
    .filter((paragraph) => typeof paragraph === "string")
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);
  if (!paragraphs.length) throw new Error("今譯分片中的譯文格式無效");

  const metadata = record.metadata;
  const source = Object.freeze({
    label: String(metadata.sourceLabel || "Leafbound 今譯草稿"),
    status: aiTranslationStatus,
    ...(metadata.model ? { model: String(metadata.model) } : {}),
    ...(metadata.modelRevision ? { modelRevision: String(metadata.modelRevision) } : {}),
    ...(metadata.promptVersion ? { promptVersion: String(metadata.promptVersion) } : {}),
    ...(metadata.generatedAt ? { generatedAt: String(metadata.generatedAt) } : {}),
    ...(Array.isArray(metadata.warnings) ? { warnings: Object.freeze([...metadata.warnings]) } : {})
  });
  const kind = record.kind ? String(record.kind) : fallbackKind || "";
  return Object.freeze({
    ...(kind ? { kind } : {}),
    paragraphs: Object.freeze(paragraphs),
    source,
    ...(record.sourceHash ? { sourceHash: String(record.sourceHash) } : {})
  });
}

export function getClassicalTranslation(poemOrId) {
  const id = translationId(poemOrId);
  return editorialTranslations[id] || openClassicalTranslations[id] || dynamicTranslationCache.get(id) || null;
}

export async function loadClassicalTranslation(poemOrId) {
  const id = translationId(poemOrId);
  if (!id) throw new TypeError("今譯載入需要作品 ID");
  const available = getClassicalTranslation(id);
  if (available) return available;

  const manifest = await loadTranslationManifest();
  const { descriptor, shardId } = await translationShardDescriptor(manifest, id);
  const shardUrl = translationShardUrl(descriptor, shardId);

  try {
    const payload = await loadTranslationShard(shardUrl);
    const record = translationRecord(payload, id);
    if (!record) throw new Error("今譯分片尚未收錄這篇作品");
    const translation = normalizeAiTranslation(record, typeof poemOrId === "object" ? poemOrId?.kind : "");
    dynamicTranslationCache.set(id, translation);
    return translation;
  } catch (error) {
    shardPromiseCache.delete(shardUrl.href);
    throw error;
  }
}

export const classicalTranslationSnapshot = Object.freeze({
  count: Object.keys(editorialTranslations).length + openClassicalTranslationSnapshot.count,
  editorialCount: Object.keys(editorialTranslations).length,
  openCount: openClassicalTranslationSnapshot.count,
  byKind: Object.freeze(Object.keys({ ...openClassicalTranslationSnapshot.byKind, ...editorialByKind })
    .reduce((counts, kind) => {
      counts[kind] = (openClassicalTranslationSnapshot.byKind[kind] || 0) + (editorialByKind[kind] || 0);
      return counts;
    }, {})),
  openSource: openClassicalTranslationSnapshot.source,
  editorialSource
});

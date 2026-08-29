# Leafbound · 拾頁

Leafbound 是依照提供的 Product Requirements Document 建立的個人語言書房，中文名為「拾頁」。這是一個無需帳戶、無需後端的 local-first 瀏覽器 App；輕量閱讀偏好保存在目前瀏覽器的 `localStorage`，收藏、筆記、詞庫、最近閱讀／收聽記錄、閱讀／播放進度與每日選擇保存在 IndexedDB，並在 IndexedDB 不可用時安全回退到完整 `localStorage`。App 不使用 Cookie 保存狀態，也不接入帳戶同步、分析 SDK 或遠端使用者資料庫。

## 啟動

需要 Node.js 18 或以上版本：

```powershell
npm start
```

然後開啟 <http://127.0.0.1:4173>。

## 部署

推送到 `main` 後，內建的 GitHub Actions 工作流程會把純靜態站點部署到 GitHub Pages。部署內容只包括應用頁面、必要資料、音訊與第三方授權說明，不包括依賴目錄、匯入快取或測試截圖。

內容更新也已自動化：English 書架每天 02:17 UTC（上海／香港時間 10:17）檢查一次，粵語書架每週一 02:43 UTC（10:43）檢查一次；亦可在 GitHub Actions 的 **Refresh Leafbound content** 頁面手動選擇 `all`、`english` 或 `cantonese`。匯入後會重建 English 本地點詞詞庫並執行完整單元測試；任何抓取、授權、數量或測試檢查失敗時，產生檔與本機音訊會回復原狀，不會提交半套內容。只有內容摘要真正改變時才更新時間戳與建立提交，成功後會接續觸發 GitHub Pages 部署。

## 已實作範圍

- 今日：今日一詩、繼續閱讀、繼續收聽
- 詩詞：以「詩／詞／曲／古文」分館呈現 17,373 篇本地古典內容（3,566 首詩、2,449 首詞、10,906 首曲、452 篇古文）。列表只載入輕量索引，打開作品時才讀取其 SHA-256 分片正文；支援名句導覽、搜尋與可組合分類、繁體原文、按批載入、逐字粵拼、點詞查看粵拼候選與繁體中文釋義，以及「原文／對照／今譯」三種模式。對照模式把粵拼放在字上方、今譯放在相鄰句段下方，點擊或按 Enter 可聚焦一組；粵拼字號、顏色、濃淡和上下距可獨立調整。今譯明確區分機器初譯、待校對、人工已校與已退回
- 粵語：169 個站內條目，包括 5 段 HKCanCor 真人粵語原聲、12 段來自不同匿名受訪者的 SpiCE 對齊口述、149 篇橫跨原站 HBL L1–7 的冚唪唥完整粵文故事及 3 篇本地練習；前台按同一難度維度整理為起步（L1–2）、日常（L3–4）、進階（L5–7）三組，原站等級仍保留為來源資訊。HKCanCor 的 1997–1998 問答片段以「提問者／受訪者」明確分開；SpiCE 因公開對齊稿只含受訪者話輪，介面如實標為單方口述，不臆補訪者問句。12 段訪談涵蓋文字訊息與語言轉換、節慶食物、溫書、語言科學、兼職、旅行、家庭英文、大學課堂與寵物過敏等主題。支援逐字稿點詞查音、直接標在對應字詞上方的語料原注／自動粵拼與獨立開關、原聲／朗讀狀態、播放進度、速度、前後 10 秒、AB Repeat、三種 Transcript 模式與詞語收藏。另有 62,274 個粵典候選讀音、26,983 個 Rime Cantonese 單字候選，以及按需載入的 38,450 個教育部辭典繁體中文釋義
- English：3 篇本地精讀稿，加上 58 篇由 VOA Learning English、NASA、Standard Ebooks、Global Voices 官方 feed 生成的站內正文或章節；VOA／NASA／Global Voices 收錄經授權邊界清洗的正文，Standard Ebooks 收錄首章。另設 AP、Reuters、The Guardian、CNN、RFI、The Economist 與 Open Newswire 新聞台，清楚區分站內正文、公開原站、API 與授權邊界。支援按來源／語言／文化／科學／文學／生活分類、文章閱讀、字級與行距、夜間閱讀、閱讀進度、逐詞點擊、英文發音、word / phrase / sentence 語境收藏與文章筆記。首次打開 English 正文時會按需載入依目前文章自動重建的本地開放詞庫，提供中文詞義、詞性、原形、英文定義、詞典例句及人工整理的常見用法
- 我的：跨模組 Library、五類內容篩選、收藏與筆記；「設定」與「關於 Leafbound」使用獨立選單行與按需展開面板。設定集中管理古典／English 字體與行距、粵拼、逐字稿模式、夜讀及播放速度；支援版本化 JSON 匯入／匯出，舊版備份仍可恢復
- 共用：全域搜尋、English／粵語列表每次顯示 24 篇並保留篩選、展開數量與滾動位置、三段式響應版面、鍵盤操作、reduced-motion 支援。手機使用安全區貼底導覽，Pad 直向保留浮動書籤列，Pad 橫向與電腦改用不遮擋正文的左側「書脊」導覽。已補齊 Web App Manifest、192／512 圖標與 Service Worker，可安裝並離線打開已快取的同源內容；跨域與音訊請求不會進入快取

HKCanCor 的 5 段真人錄音與標注文本，以及 SpiCE 的 1 段受訪者聲道學習片段，均隨本站部署，不依賴被引用電台；另外 11 段 SpiCE 訪談只保存受訪者對齊文稿，完整研究錄音保留在官方資料庫並以來源連結引用，不把每份約數百 MB 的雙聲道檔案複製進網站。PWA 為控制裝置容量及媒體邊界，不會把音訊預存進 Service Worker 快取。冚唪唥故事正文在建置時轉為本地資料，真人原聲只會在使用者按下「載入原聲」後透過 SoundCloud 連線。本地示範播放器只有在瀏覽器明確提供 `zh-HK`／`yue` 粵語聲線時才開放合成朗讀；若裝置只有普通話聲線，播放會停用，絕不回退成普通話。Microsoft Edge 可提供 HiuGaai / HiuMaan / WanLung 線上粵語自然聲線；離線時可在 Windows「時間與語言 → 語言與地區」加入「中文（繁體，香港特別行政區）」並安裝「文字轉語音」Tracy / Danny。SoundCloud、SpiCE 來源頁與線上語音只在使用者明確操作後才會連接第三方，可能按各自政策處理網路請求，但 Leafbound 不會把收藏、筆記、詞庫、歷史、進度或設定交給它們。

## 開放資料

- 古典文庫保留原有 6 篇人工精修內容，另從固定版本的 chinese-poetry 匯入 17,367 個開放閱讀單元。除《唐詩三百首》362 首與《宋詞三百首》279 首外，新增 20 位代表詩人的《全唐詩選》2,592 首、16 位代表詞人的《全宋詞選》1,912 首及《千家詩》212 首；古文館另包括《古文觀止》222 篇、《詩經》305 篇、《楚辭》65 篇、四書 36 篇、《幽夢影》19 組，以及《幼學瓊林》《聲律啓蒙》《弟子規》《增廣賢文》《文字蒙求》共 175 個蒙學閱讀單元。其餘收錄為元曲 10,906 首、曹操詩 26 首與納蘭詞 257 首。簡體來源在匯入時轉為香港繁體；目前收錄 184 篇人工或既有開放今譯，另保留首批 100 篇本機 Qwen 舊機器草稿（詩、詞、曲、古文各 25 篇）。這 100 篇沒有冒充新二審結果：44 篇存在阻斷警告，0 篇被標為 production-ready。新生成流程會先加入教育部古漢語詞典術語約束，再執行第二輪批判校驗；輸出最多進入「待校對」，只有無阻斷項且經人工設為 `reviewed` 的記錄才算成品。沒有完整精確匹配的作品不以同題作品或來源不明的網頁譯文補位。生成檔與正文均按 SHA-256 ID 前綴分片，閱讀頁只載入目前作品需要的分片。少量含有本地粵拼詞表無法可靠標註的罕見古字單元會在建置時排除，不臆造讀音。
- 粵語查音優先使用粵典 words.hk 公有領域詞表；古文單字缺漏由固定版本的 Rime Cantonese `jyut6ping3.chars`（CC BY 4.0）補充。古文上方注音顯示首個候選，點詞可查看全部候選。中文釋義來自教育部《重編國語辭典修訂本》`2015_20260625` 的 38,450 個精確匹配詞目，依 CC BY-ND 3.0 TW 原樣保留繁體內容並在首次點詞時按需載入；詞條卡不顯示英譯，也不複製粵典的完整釋義。
- 粵語內容匯入器讀取冚唪唥 208 篇公開分級目錄，每級最多選入 24 篇同時具有完整文本、逐篇 CC BY 署名與真人原聲入口的故事；目前共 149 篇（Level 1 為 20 篇、Level 2–5 各 24 篇、Level 6 為 20 篇、Level 7 為 13 篇）。HBL 原級依詞頻與用法分級；Leafbound 只在界面合併為起步 44 篇、日常 48 篇、進階 57 篇，不聲稱對應 CEFR，也不把高級錯標成「長篇」。正文粵拼由本地詞表優先整詞匹配、再以單字表補齊，預設顯示首個候選並清楚標示為自動標註。另收錄 HKCanCor 官方提供的 5 段 CC BY 4.0 真人錄音樣本，以及 SpiCE 12 位匿名受訪者的 CC BY 4.0 粵語研究訪談選段；`npm run import:cantonese-interviews` 會讀取官方資料目錄與 TextGrid，保留匿名代號、來源時間和授權，其中 1 段按位元組區間擷取原聲並從左側受訪者聲道產生 22.05kHz 單聲道本地片段，其餘 11 段只生成本地文稿與官方錄音引用。HKCanCor 句段時間按文字長度估算，不冒充人工對軸；SpiCE 公開 TextGrid 只對齊受訪者，因此本站不將其標成雙方文稿，也不臆造訪者台詞。
- 香港教育局與出版社教材沒有被整套抓取或複製。這些資料的權利邊界不等同開放語料；若日後加入，只能採用官方明確許可的項目或使用者有權使用的個人匯入檔案。
- English 來源書架在建置時讀取 VOA Learning English 四個分類 RSS、NASA Technology RSS、Standard Ebooks New Releases Atom feed 與 Global Voices 英文長文 RSS，再清洗獲准保存的正文。目前生成 23 篇 VOA 全文、10 篇 NASA 全文、12 本 Standard Ebooks 首章與 13 篇 Global Voices CC BY 3.0 原創文章；VOA 通訊社署名材料會被排除，NASA 只保留正文文字，Standard Ebooks 只取首章，Global Voices 只接受附作者與原站標記的原創稿並排除內容共享文章、圖片、圖說、影音、長篇引文和括號內非英文原文拼寫，改動會在逐篇署名中標示。
- English 點詞資料以 Open Multilingual Wordnet 2.0 為骨架：Princeton WordNet 3.0 提供英文定義／例句，Chinese Open Wordnet 2.0 按共享 synset 對齊中文詞義；缺少中文對齊時，再以 FreeDict `eng-zho` 2025.11.23 補充。簡體詞義以 OpenCC 轉為香港繁體，常見歧義詞另由 Leafbound 編輯校正。每次內容更新只抽取當前站內文章實際出現的詞形，詞典模組按需從本站載入，不會把點詞、文章或閱讀記錄送往第三方。牛津、劍橋等商業詞典內容沒有被下載、抓取或轉載。
- 開放資料都在建置時轉成本機檔案，正常閱讀不會抓取第三方網站；原站連結只用於出處與完整版本。詳細來源、固定版本與授權見 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

如需重新產生資料檔：

```powershell
npm run import:data
npm run import:classical-translations
npm run import:cantonese
npm run import:cantonese-content
npm run import:cantonese-interviews
npm run import:english
npm run import:english-dictionary
python scripts/import-moe-definitions.py path\to\dict_revised_2015_20260625.xlsx
```

教育部辭典匯入器必須使用[官方公眾授權頁](https://language.moe.gov.tw/001/Upload/Files/site_content/M0001/respub/index.html)所列的原始 XLSX；生成檔會保留版本、SHA-256、授權與署名資訊。個別詞目及釋義不改寫、不轉簡體，完整使用說明保存在 `data/licenses/moe-revised-dictionary-usage.txt`。

古典今譯匯入器會下載 Mobvoi 680,000 餘首「古詩今譯」資料的鏡像，先核對官方公佈的 MD5，再只輸出與本地古典原文完整精確匹配的詞條；上游壓縮檔與解壓內容只留在 `.tmp-data`，不會部署。完整修改與授權說明保存在 `data/licenses/mobvoi-seq-monkey-apache-2.0.txt`。

全量機器今譯採用可恢復的離線批次流程，模型只在建置時運行；GitHub Pages 與閱讀裝置只取得通過驗證的靜態 JSON。先檢視缺口，再由本機 `llama-server` 或其他 OpenAI-compatible endpoint 生成草稿，最後驗證及建置分片：

```powershell
npm run classical-translations:plan -- --kinds 詞,曲,古文 --dry-run
npm run classical-translations:generate -- --kinds 詞,曲,古文 --limit 100 --resume
npm run classical-translations:verify -- --kinds 詞,曲,古文 --drafts .tmp-data/classical-translations/drafts.jsonl
npm run classical-translations:build -- --drafts .tmp-data/classical-translations/drafts.jsonl
```

生成器固定讀取 `LEAFBOUND_OPENAI_BASE_URL`、`LEAFBOUND_OPENAI_MODEL`、`LEAFBOUND_OPENAI_MODEL_REVISION` 與 `LEAFBOUND_PROMPT_VERSION`；遠端端點另需 `LEAFBOUND_OPENAI_API_KEY`，本機 `http://127.0.0.1:.../v1` 可按端點設定密鑰。對 Qwen 這類預設輸出思考內容的 OpenAI-compatible 服務，可設 `LEAFBOUND_OPENAI_DISABLE_THINKING=true`，生成器會加入 `chat_template_kwargs.enable_thinking=false`，確保回應內容保留給嚴格 JSON 今譯。第一輪會選取教育部辭典詞義作術語約束，第二輪使用獨立批判提示逐段檢查並修正或退回；回傳內容再統一轉成香港繁體，接受繁體、漏譯、照抄、異常長度、拒答、重複、英文內容與段落結構檢查。記錄會保存模型修訂版、提示詞與詞典摘要 SHA-256、採樣參數、警告和二審結果，但密鑰、請求標頭與模型原始回應不會寫入草稿、分片或日誌。草稿預設留在已忽略的 `.tmp-data`；建置後的記錄仍按 `machine-draft → pending-review → reviewed / rejected` 管理，不能以通過機器檢查替代人工校對。現有人工稿與 Mobvoi 精確匹配始終優先，不會被 AI 草稿覆蓋。

日常建議直接使用帶驗證及失敗回復的統一命令：

```powershell
npm run content:update
npm run content:update:english
npm run content:update:cantonese
```

`prepare:english-dictionary` 會從 [Open Multilingual Wordnet 2.0](https://github.com/omwn/omw-data/releases/tag/v2.0) 下載並解壓 `omw-en-2.0`、`omw-cmn-2.0`，再從 [FreeDict `eng-zho` 2025.11.23](https://download.freedict.org/dictionaries/eng-zho/2025.11.23/) 取得 TEI 原始檔；三個固定版本均會先核對官方校驗值。統一更新命令會按需自動執行這一步。上游 XML／TEI 只作本機或 GitHub Actions 建置快取，不會部署；倉庫只保存文章詞彙子集與對應授權／署名文件。

## 驗證

```powershell
npm test
```

測試涵蓋詩／詞／古文數量與來源完整性、正文分片快取／失敗重試、翻譯狀態與二輪校驗、宋詞繁體轉換、古文分段與全庫漢字粵拼覆蓋、粵典最長詞匹配、Rime Cantonese 罕見字回退、教育部辭典版本／校驗值／繁體中文原義、HKCanCor 本機音訊與粵拼完整性、冚唪唥七級數量與逐篇授權、English 公開正文的清洗與授權邊界、開放詞典覆蓋、IndexedDB 遷移／回退、版本化備份與進度計算；完整瀏覽器驗收另涵蓋「原文／對照／今譯」切換與持久化、鍵盤聚焦、逐字 ruby 對齊、列表分頁與滾動恢復、PWA 控制、音訊不快取，以及 320px 手機、手機橫屏、820px Pad 直向、1024px Pad 橫向及 1440px 電腦版面。

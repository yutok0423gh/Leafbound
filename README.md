# Leafbound · 拾頁

Leafbound 是依照提供的 Product Requirements Document 建立的個人語言書房，中文名為「拾頁」。這是一個無需帳戶、無需後端的 local-first 瀏覽器 App；收藏、筆記與進度保存在目前瀏覽器的 `localStorage`，非敏感閱讀偏好另由本站專用 Cookie 記住一年。

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
- 詩詞：以「詩／詞／曲／古文」分館呈現 17,373 篇本地古典內容（3,566 首詩、2,449 首詞、10,906 首曲、452 篇古文），支援名句導覽、搜尋與可組合分類、繁體原文、按批載入、詩詞曲古文逐字粵拼、點詞查音、詩脈／詞脈／曲脈／文脈、原句或段落收藏、筆記及沉浸閱讀
- 粵語：157 個站內條目，包括 5 段 HKCanCor 真人粵語原聲、149 篇橫跨 Level 1–7 的冚唪唥完整粵文故事及 3 篇本地練習；支援內容書架與等級篩選、逐字稿點詞查音、直接標在對應字詞上方的語料原注／自動粵拼與獨立開關、原聲／朗讀狀態、播放進度、速度、前後 10 秒、AB Repeat、三種 Transcript 模式與詞語收藏。另有 62,274 個粵典候選讀音，以及 26,983 個 Rime Cantonese 單字候選用於罕見字補充
- English：3 篇本地精讀稿，加上 57 篇由 VOA Learning English、NASA、Standard Ebooks、Global Voices 官方 feed 生成的站內正文或章節；VOA／NASA／Global Voices 收錄經授權邊界清洗的正文，Standard Ebooks 收錄首章。另設 AP、Reuters、The Guardian、CNN、RFI、The Economist 與 Open Newswire 新聞台，清楚區分站內正文、公開原站、API 與授權邊界。支援按來源／語言／文化／科學／文學／生活分類、文章閱讀、字級與行距、夜間閱讀、閱讀進度、逐詞點擊、英文發音、word / phrase / sentence 語境收藏與文章筆記。首次打開 English 正文時會按需載入依目前文章自動重建的本地開放詞庫，提供中文詞義、詞性、原形、英文定義、詞典例句及人工整理的常見用法
- 我的：跨模組 Library、五類內容篩選、收藏與筆記；「設定」與「關於 Leafbound」使用獨立選單行與按需展開面板。設定集中管理古典／English 字體與行距、粵拼、逐字稿模式、夜讀及播放速度，並以本站 Cookie 記住偏好
- 共用：全域搜尋、三段式響應版面、鍵盤操作、reduced-motion 支援。手機使用安全區貼底導覽，Pad 直向保留浮動書籤列，Pad 橫向與電腦改用不遮擋正文的左側「書脊」導覽

HKCanCor 的 5 段真人錄音與標注文本保存在本機，可離線播放；冚唪唥故事正文也在建置時轉為本地資料，真人原聲只會在使用者按下「載入原聲」後透過 SoundCloud 連線。本地示範播放器只有在瀏覽器明確提供 `zh-HK`／`yue` 粵語聲線時才開放合成朗讀；若裝置只有普通話聲線，播放會停用，絕不回退成普通話。Microsoft Edge 可提供 HiuGaai / HiuMaan / WanLung 線上粵語自然聲線；離線時可在 Windows「時間與語言 → 語言與地區」加入「中文（繁體，香港特別行政區）」並安裝「文字轉語音」Tracy / Danny。

## 開放資料

- 古典文庫保留原有 6 篇人工精修內容，另從固定版本的 chinese-poetry 匯入 17,367 個開放閱讀單元。除《唐詩三百首》362 首與《宋詞三百首》279 首外，新增 20 位代表詩人的《全唐詩選》2,592 首、16 位代表詞人的《全宋詞選》1,912 首及《千家詩》212 首；古文館另包括《古文觀止》222 篇、《詩經》305 篇、《楚辭》65 篇、四書 36 篇、《幽夢影》19 組，以及《幼學瓊林》《聲律啓蒙》《弟子規》《增廣賢文》《文字蒙求》共 175 個蒙學閱讀單元。其餘收錄為元曲 10,906 首、曹操詩 26 首與納蘭詞 257 首。簡體來源在匯入時轉為香港繁體；開放條目只呈現古典原文，不自動附加來源不明的現代譯註。生成模組以共享來源目錄和緊湊記錄保存，避免 17,000 多篇內容重複攜帶相同授權欄位。少量含有本地粵拼詞表無法可靠標註的罕見古字單元會在建置時排除，不臆造讀音。
- 粵語查音優先使用粵典 words.hk 公有領域詞表；古文單字缺漏由固定版本的 Rime Cantonese `jyut6ping3.chars`（CC BY 4.0）補充。古文上方注音顯示首個候選，點詞可查看全部候選；完整粵典釋義不複製進來。
- 粵語內容匯入器讀取冚唪唥 208 篇公開分級目錄，每級最多選入 24 篇同時具有完整文本、逐篇 CC BY 署名與真人原聲入口的故事；目前共 149 篇（Level 1 為 20 篇、Level 2–5 各 24 篇、Level 6 為 20 篇、Level 7 為 13 篇）。正文粵拼由本地詞表優先整詞匹配、再以單字表補齊，預設顯示首個候選並清楚標示為自動標註。另收錄 HKCanCor 官方提供的 5 段 CC BY 4.0 真人錄音樣本、說話者逐字稿及語料原有粵拼。HKCanCor 句段時間是按文字長度估算，不冒充人工對軸。
- 香港教育局與出版社教材沒有被整套抓取或複製。這些資料的權利邊界不等同開放語料；若日後加入，只能採用官方明確許可的項目或使用者有權使用的個人匯入檔案。
- English 來源書架在建置時讀取 VOA Learning English 四個分類 RSS、NASA Technology RSS、Standard Ebooks New Releases Atom feed 與 Global Voices 英文長文 RSS，再清洗獲准保存的正文。目前生成 23 篇 VOA 全文、10 篇 NASA 全文、12 本 Standard Ebooks 首章與 12 篇 Global Voices CC BY 3.0 原創文章；VOA 通訊社署名材料會被排除，NASA 只保留正文文字，Standard Ebooks 只取首章，Global Voices 只接受附作者與原站標記的原創稿並排除內容共享文章、圖片、圖說、影音、長篇引文和括號內非英文原文拼寫，改動會在逐篇署名中標示。
- English 點詞資料以 Open Multilingual Wordnet 2.0 為骨架：Princeton WordNet 3.0 提供英文定義／例句，Chinese Open Wordnet 2.0 按共享 synset 對齊中文詞義；缺少中文對齊時，再以 FreeDict `eng-zho` 2025.11.23 補充。簡體詞義以 OpenCC 轉為香港繁體，常見歧義詞另由 Leafbound 編輯校正。每次內容更新只抽取當前站內文章實際出現的詞形，詞典模組按需從本站載入，不會把點詞、文章或閱讀記錄送往第三方。牛津、劍橋等商業詞典內容沒有被下載、抓取或轉載。
- 開放資料都在建置時轉成本機檔案，正常閱讀不會抓取第三方網站；原站連結只用於出處與完整版本。詳細來源、固定版本與授權見 [THIRD_PARTY_NOTICES.md](./THIRD_PARTY_NOTICES.md)。

如需重新產生資料檔：

```powershell
npm run import:data
npm run import:cantonese
npm run import:cantonese-content
npm run import:english
npm run import:english-dictionary
```

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

測試涵蓋詩／詞／古文數量與來源完整性、宋詞繁體轉換、古文分段與全庫漢字粵拼覆蓋、粵典最長詞匹配、Rime Cantonese 罕見字回退、HKCanCor 本機音訊與粵拼完整性、冚唪唥七級數量與逐篇授權、English 公開正文的清洗與授權邊界、開放詞典覆蓋及 local persistence、收藏切換、去重收藏與進度計算；完整瀏覽器驗收另涵蓋真人粵語播放、內容書架／等級篩選、古文粵拼開關與沉浸閱讀、公開英文正文站內閱讀、開放詞典懶載入與 `encounters` 中英詞義、粵語／古典原文點詞、詞彙收藏標記、組合篩選、詩脈／文脈，並逐頁檢查 320px 手機、手機橫屏、820px Pad 直向、1024px Pad 橫向及 1440px 電腦版面。

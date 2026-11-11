# CLAUDE.md — japan-sakura-season（日本櫻花季地圖）

`taiwan-bird-atlas`（台灣賞鳥地圖）的姊妹專案（2026-11-12 建立），UI 框架沿用、畫面全換：3D 日本列島（Natural Earth 海岸線＋手寫山脈脊線＋富士山），時間軸從「月份」改成「日期」（1/10～5/31），陸地 shader 依各地開花日染櫻花色、畫櫻前線、積雪隨日期北退；48 個名所各有程式自繪地標（城／五重塔／鳥居／橋／星形五稜郭／御城石牆…）＋一圈隨花況變色的櫻樹，見頃時花瓣飄落；15 種品種實景照片圖鑑；賞櫻須知＋小辭典。和紙／朱紅印章風格（不是賞鳥地圖的粗框漫畫風）。無框架、無建置。

## 資料（重要）
- `data.js` 的 `SK.BASE` 是**日本氣象廳開花日・滿開日平年值（1991–2020）54 站，2026-11 逐站查證過**（sakura003_07／sakura004_07 頁）。北海道部分站是蝦夷山櫻（`'e'`）、沖繩奄美是寒緋櫻（`'h'`）。
- `SK.SPOTS` 名所 `o/f`（開花／滿開 'M/D'）是依附近測站與常見花期整理的**一般性參考**；`v` 第一個是主品種，其他品種用 `SK.VARIETIES[].off`（與染井吉野的花期差）推估，`SK.window(spot, vid)`／`SK.stageAt` 是唯一花況入口。名所文字全部自寫，不寫無法查證的株數。
- `geo.js` 由 `python tools/build_geo.py <ne_10m_admin_0_countries.geojson>` 產生（Natural Earth 公有領域，31 島）。
- `photos.js` 由 `python tools/fetch_photos.py` 產生：`PIN` 指定檔名 → 英文維基代表圖 → Commons 搜尋；只收 CC0／PD／CC BY／CC BY-SA 且**有作者欄**的圖（`Hikanzakura.JPG` 因沒作者被拒）。**產生後要人工看縮圖**（第一輪抓到夜景、解說牌、人群照都換掉了）。Wikimedia 縮圖只接受標準寬度（330、960…，240 會 400），API 會 429，腳本已加重試。
- 改資料或照片後重產手冊：`node tools/build_manual.js . tools/manual_tpl.html`（**manual.html 是產出檔**）。

## 程式
- `scene.js`（`window.SakuraScene`）：投影 `P(lon,lat)` 1 單位≈25 km、`KM=.3`；`buildField` 掃描線判陸地＋線段分桶算離岸距離（上限 6）；陸地是整片格點網格（RES .2），頂點屬性 `aBloom`＝IDW（測站＋名所換算海平面）＋海拔 `LAPSE=25` 天/km；`bloomPatch` shader 用 `uDay` 畫粉紅、葉櫻、積雪線、櫻前線（前線用扣掉海拔的 `o0`，否則山區會變等高線條紋）。名所群聚（<.75 單位，例：東京 5 處、京都 4 處）會在圓周上分開並推回陸地。`S.stats()` 可驗證。
- `app.js`：測試 hook `window.__sakura`（`state/setDay/selectSpot/selectRegion/setMode/openVar/closeVar/frontNow/scene`）。
- 手機（≤760px）清單預設收合（`setSheet`），選名所自動展開；收合狀態會改 `setViewOffset`，切換後要呼叫 `SakuraScene.resize()`。overview 在窄螢幕距離 ×2，`controls.maxDistance` 要 ≥ 320 否則被夾住拉不遠。

## 配套
- ✅ 跑馬燈（必備、不可關）、manual（含資料來源與照片授權表、完整創作者）、使用警語（頁面底部＋首訪自動跳，`sakuraSeasonSeenWarning`）、⚙常用設定收合式（`sakuraSeasonSettings`；展開狀態 `sakuraSeasonSetOpen`）、偏好 `sakuraSeasonPrefs`、PWA（改 js 記得 `service-worker.js` 的 `CACHE_NAME` +1）、訪客計數器 `page_id=m255525.japansakuraseason`、RWD（375px 無橫向捲動）。
- ❌ 序號授權（不需要）
- GitHub Pages：**2026-11-12 已上線** https://m255525.github.io/japan-sakura-season/ （`master` 分支＋`.github/workflows/deploy-pages.yml`；repo 由使用者自己 `gh repo create`）。

## Port／測試
- port **8868**（`.claude/launch.json` 的 `japan-sakura-season`）。
- 驗證：`__sakura.setDay(SK.doy('4/5'))` 西日本與關東應為粉紅、「🌸 櫻前線」標籤在福島・金澤一帶；`setDay(25)` 只有沖繩見頃；`selectSpot('hirosaki'); setDay(117)` 為滿開、`scene.stats().petals>0`；`openVar('kanhi')` 照片與授權標示正常；console 無錯誤；375px `scrollWidth===clientWidth`。

# 歌詞寳 (Lyric Treasure)

一個靜態網頁工具：輸入歌曲名稱，自動從網易雲音樂提取歌詞，並可一鍵生成包含封面、可點擊目錄與歌詞的 Word 文件。

🔗 **線上體驗**: [spw0103.github.io/lyric-creater](https://spw0103.github.io/lyric-creater)

---

## 功能特色

- 🎤 **單首搜尋** — 輸入歌名（可選歌手），自動從網易雲音樂提取歌詞
- 📋 **批量輸入** — 一次貼上多首歌，支援多種格式：
  ```
  歌名
  1. 歌名
  歌名 - 歌手
  ```
- 🧠 **智慧過濾** — 自動跳過 (RAP版)、(Live版)、(Remix) 等版本；自動清除批次貼上時的不可見字元
- ▶️ **YouTube 備援** — 若網易雲歌詞過短或為空，自動改用 YouTube 影片描述
- 🖱️ **拖曳排序** — 拖拽調整歌曲順序
- 📄 **生成 Word** — 輸出 .docx，包含：
  - 封面頁
  - 可點擊目錄（頁碼）
  - 歌詞（自動移除時間戳，段落間距優化）
  - YouTube 聆聽連結
- 🔤 **繁/簡切換** — 生成 Word 時可選擇繁體或簡體，全文件（含歌詞）自動轉換
- 💾 **本地儲存** — 歌曲列表保存在瀏覽器 localStorage
- 🏷️ **來源標記** — 每首歌顯示「網易雲」或「YouTube」來源標籤

---

## 使用方式

1. 開啟 [線上體驗](https://spw0103.github.io/lyric-creater) 或直接下載本 repo 在瀏覽器打開 `index.html`
2. 輸入歌曲名稱（可選歌手）→ 點擊「➕ 添加」或按 Enter
3. 等待搜尋完成（自動提取歌詞）
4. 拖曳調整歌曲順序
5. 選擇文件字體（繁體/簡體）→ 點擊「📄 生成 Word 文件」
6. 輸入封面標題 → 下載 .docx 檔案

---

## 技術說明

| 項目 | 說明 |
|------|------|
| 前端 | 原生 HTML / CSS / JavaScript（無框架） |
| 歌詞來源 | 網易雲音樂公開 API（`neteasecloudmusicapi-main-api.vercel.app` 代理） |
| 備援來源 | YouTube Data API v3 |
| Word 生成 | [docx](https://www.npmjs.com/package/docx) + [FileSaver.js](https://www.npmjs.com/package/file-saver)（CDN） |
| 繁/簡轉換 | [OpenCC.js](https://github.com/nk2028/opencc-js)（已本地化，無需外部 CDN） |
| 儲存 | localStorage |
| 部署 | GitHub Pages |

---

## 注意事項

- 網易雲 API 為第三方代理，偶爾可能不穩定，此時會自動改用 YouTube 歌詞
- YouTube API 有每日配額限制（每首歌搜尋約消耗 101 配額）
- 所有資料僅存於瀏覽器本地，不會上傳任何伺服器

---

## License

© 2026 Shi Powai. All rights reserved.

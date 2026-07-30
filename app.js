const NETEASE_API = 'https://neteasecloudmusicapi-main-api.vercel.app';
const YT_SEARCH = 'https://www.googleapis.com/youtube/v3/search';
const YT_VIDEO = 'https://www.googleapis.com/youtube/v3/videos';
const STORAGE_KEY = 'lyric_compiler_netease_songs';
const YOUTUBE_API_KEY = (function(){try{return atob('QUl6YVN5QXVrVFZtY0MwOWZ5Sm1ZVUJHUk5IQkhkLWxWU2lpdlBj');}catch(e){return '';}})();

let songs = [];

function genId() {
    return Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
}

function loadData() {
    try { const s = localStorage.getItem(STORAGE_KEY); if (s) songs = JSON.parse(s); } catch (e) {}
}
function saveData() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(songs.map(s => ({
        id: s.id, title: s.title, artist: s.artist,
        lyrics: s.lyrics, listenUrl: s.listenUrl, status: s.status, source: s.source
    }))));
}

loadData();

document.addEventListener('DOMContentLoaded', () => {
    renderSongs();
    updateVisibility();
    document.getElementById('song-title').addEventListener('keydown', e => { if (e.key === 'Enter') addSong(); });
    document.getElementById('artist').addEventListener('keydown', e => { if (e.key === 'Enter') addSong(); });
});

function setStatus(msg, type) {
    const el = document.getElementById('add-status');
    el.style.color = type === 'error' ? '#c62828' : type === 'success' ? '#2e7d32' : '#f57f17';
    el.textContent = msg;
    if (type !== 'loading') setTimeout(() => { if (el.textContent === msg) el.textContent = ''; }, 4000);
}

function toggleBatch(toggleEl) {
    const section = document.getElementById('batch-section');
    const isShow = section.style.display !== 'block';
    section.style.display = isShow ? 'block' : 'none';
    toggleEl.textContent = isShow ? '▲ 收起批量輸入' : '▼ 批量輸入多首歌曲';
}

// ---- NetEase Cloud Music API ----
async function searchSongOnNetease(query) {
    const url = `${NETEASE_API}/search?keywords=${encodeURIComponent(query)}&limit=10`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('搜尋失敗');
    const data = await resp.json();
    if (!data.result || !data.result.songs || data.result.songs.length === 0) throw new Error('找不到相關歌曲');
    return data.result.songs;
}

async function getLyrics(songId) {
    const url = `${NETEASE_API}/lyric?id=${songId}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('無法獲取歌詞');
    const data = await resp.json();
    return (data.lrc && data.lrc.lyric) || (data.tlyric && data.tlyric.lyric) || '';
}

// ---- YouTube API (fallback) ----
async function getVideoDetails(videoId) {
    const url = `${YT_VIDEO}?part=snippet,contentDetails&id=${videoId}&key=${YOUTUBE_API_KEY}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('無法獲取影片詳細資訊');
    const data = await resp.json();
    if (!data.items || data.items.length === 0) throw new Error('找不到影片資訊');
    return data.items[0];
}

function parseDuration(iso) {
    const m = iso.match(/PT(?:(\d+)H)?(?:(\d+)M)?(?:(\d+)S)?/);
    const h = parseInt(m[1] || '0'), min = parseInt(m[2] || '0'), s = parseInt(m[3] || '0');
    return h * 60 + min + s / 60;
}

function hasLyricIndicators(text) {
    return /作[詞词]|[詞词][：:]|作曲|曲[：:]|[Ll]yrics|歌[詞词]/.test(text);
}

function descriptionOk(desc, durationMin) {
    return (desc || '').length >= Math.max(80, Math.round(durationMin * 100));
}

function scoreVideo(snippet, contentDetails) {
    const dur = contentDetails ? parseDuration(contentDetails.duration) : 3;
    const desc = (snippet.description || '');
    const linkCount = (desc.match(/https?:\/\//g) || []).length;
    return (descriptionOk(desc, dur) ? 2 : 0) + (hasLyricIndicators(desc) ? 1 : 0) + (linkCount > 2 ? -2 : 0);
}

async function searchSongOnYouTube(query) {
    if (!YOUTUBE_API_KEY) throw new Error('YouTube API 金鑰未配置');
    const url = `${YT_SEARCH}?part=snippet&q=${encodeURIComponent(query)}&type=video&maxResults=10&key=${YOUTUBE_API_KEY}`;
    const resp = await fetch(url);
    if (!resp.ok) throw new Error('YouTube 搜尋失敗');
    const data = await resp.json();
    if (!data.items || data.items.length === 0) throw new Error('找不到相關影片');

    let best = data.items[0], bestScore = -999;
    for (const item of data.items) {
        if (!item.id.videoId) continue;
        const score = scoreVideo(item.snippet, null);
        if (score > bestScore) { bestScore = score; best = item; }
    }

    let snippet = best.snippet;
    try {
        const detail = await getVideoDetails(best.id.videoId);
        snippet = detail.snippet;
    } catch (_) {}

    return {
        title: snippet.title || query,
        artist: snippet.channelTitle || '',
        lyrics: snippet.description || '',
        youtubeUrl: `https://www.youtube.com/watch?v=${best.id.videoId}`,
    };
}

// ---- Hybrid fetch: NetEase first, YouTube fallback ----
async function fetchSongData(query) {
    const songsList = await searchSongOnNetease(query);
    const best = songsList.find(s => !/\(RAP版\)|\(R&B版\)|\(Rap版\)|\(Live版\)|\(Live\)|\(Remix\)|\(Instrumental\)/i.test(s.name)) || songsList[0];
    const songId = best.id;
    const title = best.name;
    const artist = best.artists ? best.artists.map(a => a.name).join(', ') : (best.ar ? best.ar.map(a => a.name).join(', ') : '');
    const durationMs = best.duration || 0;
    const durationMin = durationMs / 60000;

    let lyrics = '';
    let listenUrl = '';
    let source = 'netease';

    try { lyrics = await getLyrics(songId); } catch (_) {}

    const clean = (lyrics || '').replace(/\[\d{2}:\d{2}(\.\d{2,3})?\]/g, '').trim();
    if (!descriptionOk(clean, durationMin)) {
        try {
            const yt = await searchSongOnYouTube(query);
            if (yt.lyrics && yt.lyrics.length > 0) {
                lyrics = yt.lyrics;
                listenUrl = yt.youtubeUrl;
                source = 'youtube';
            }
        } catch (_) {}
    }

    if (!listenUrl) {
        listenUrl = `https://www.youtube.com/results?search_query=${encodeURIComponent(title)}`;
    }

    return { title, artist, lyrics, listenUrl, source };
}

// ---- Single song ----
async function addSong() {
    const titleInput = document.getElementById('song-title');
    const artistInput = document.getElementById('artist');
    const title = titleInput.value.trim();
    const artist = artistInput.value.trim();
    if (!title) { setStatus('請輸入歌曲名稱', 'error'); return; }

    const query = artist ? `${artist} ${title}` : title;
    const dup = songs.find(s => s.title.toLowerCase() === title.toLowerCase() && (!artist || s.artist.toLowerCase() === artist.toLowerCase()));
    if (dup) { setStatus('此歌曲已存在列表中', 'error'); return; }

    const song = {
        id: genId(), title, artist: artist || '搜尋中...',
        lyrics: '', listenUrl: '', status: 'loading', source: '',
    };
    songs.push(song);
    commitAndRender();
    titleInput.value = ''; artistInput.value = ''; titleInput.focus();
    setStatus(`🎵 正在搜尋「${title}」...`, 'loading');

    try {
        const r = await fetchSongData(query);
        const s = songs.find(x => x.id === song.id);
        if (s) { s.artist = r.artist; s.lyrics = r.lyrics; s.listenUrl = r.listenUrl; s.source = r.source; s.status = 'success'; }
        commitAndRender();
        setStatus(`✅ 「${s ? s.title : title}」已添加完成`, 'success');
    } catch (err) {
        const s = songs.find(x => x.id === song.id);
        if (s) { s.status = 'error'; s.lyrics = `（${err.message}）`; }
        commitAndRender();
        setStatus(`❌ ${err.message}`, 'error');
    }
}

// ---- Batch input ----
function parseBatchInput(text) {
    const invisible = /[\u200B-\u200F\u2028-\u202F\u2060-\u2069\ufeff]/g;
    return text.split('\n').map(l => l.trim()).filter(l => l).map(line => {
        let cleaned = line.replace(/^\d+[\.\、\s\)]*\s*/, '').replace(invisible, '');
        const sep = cleaned.match(/^(.+?)\s*[-–—]\s*(.+)$/);
        if (sep) return { title: sep[2].trim(), artist: sep[1].trim() };
        return { title: cleaned, artist: '' };
    });
}

async function addBatchSongs() {
    const textarea = document.getElementById('batch-input');
    const text = textarea.value.trim();
    if (!text) { setStatus('請輸入歌曲', 'error'); return; }

    const parsed = parseBatchInput(text);
    if (parsed.length === 0) { setStatus('無法解析歌曲，請檢查格式', 'error'); return; }

    const newSongs = parsed.map(p => ({
        id: genId(), title: p.title, artist: p.artist || '搜尋中...',
        lyrics: '', listenUrl: '', status: 'loading', source: '',
    }));

    songs.push(...newSongs);
    commitAndRender();
    textarea.value = '';

    for (const ns of newSongs) {
        const s = songs.find(x => x.id === ns.id);
        if (!s) continue;
        const query = (s.artist && s.artist !== '搜尋中...') ? `${s.artist} ${s.title}` : s.title;
        setStatus(`⏳ 正在處理「${s.title}」...`, 'loading');
        try {
            const r = await fetchSongData(query);
            s.artist = r.artist; s.lyrics = r.lyrics;
            s.listenUrl = r.listenUrl; s.source = r.source; s.status = 'success';
        } catch (err) {
            s.status = 'error'; s.lyrics = `（${err.message}）`;
        }
        commitAndRender();
    }
    setStatus(`✅ ${newSongs.length} 首歌曲全部處理完成`, 'success');
}

function commitAndRender() {
    saveData();
    renderSongs();
    updateVisibility();
}

function removeSong(id) {
    const el = document.querySelector(`[data-song-id="${id}"]`);
    if (el) el.classList.add('removing');
    setTimeout(() => {
        songs = songs.filter(s => s.id !== id);
        commitAndRender();
    }, 300);
}

// ---- Drag & Drop ----
let dragSrcEl = null;

function onDragStart(e) {
    dragSrcEl = this;
    this.classList.add('dragging');
    e.dataTransfer.effectAllowed = 'move';
}

function onDragEnd(e) {
    this.classList.remove('dragging');
    document.querySelectorAll('.song-item.drag-over').forEach(el => el.classList.remove('drag-over'));
    dragSrcEl = null;
}

function onDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const t = e.currentTarget;
    if (t !== dragSrcEl) {
        document.querySelectorAll('.song-item.drag-over').forEach(el => el.classList.remove('drag-over'));
        t.classList.add('drag-over');
    }
}

function onDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function onDrop(e) {
    e.preventDefault();
    this.classList.remove('drag-over');
    if (!dragSrcEl || dragSrcEl === this) return;

    const list = document.getElementById('songs-list');
    const fromId = dragSrcEl.dataset.songId;
    const toId = this.dataset.songId;
    const fromIdx = songs.findIndex(s => s.id === fromId);
    const toIdx = songs.findIndex(s => s.id === toId);
    if (fromIdx === -1 || toIdx === -1) return;

    if (fromIdx < toIdx) {
        list.insertBefore(dragSrcEl, this.nextSibling);
    } else {
        list.insertBefore(dragSrcEl, this);
    }

    const [moved] = songs.splice(fromIdx, 1);
    songs.splice(toIdx, 0, moved);
    saveData();
    updateNumbers();
}

function updateNumbers() {
    document.querySelectorAll('.song-item').forEach((el, i) => {
        const titleEl = el.querySelector('.song-title');
        titleEl.textContent = `${i + 1}. ${titleEl.textContent.replace(/^\d+\.\s*/, '')}`;
    });
    document.getElementById('song-count').textContent = songs.length;
}

function deleteAllSongs() {
    if (songs.length === 0) return;
    if (!confirm('確定要刪除全部歌曲嗎？')) return;
    songs = [];
    commitAndRender();
}

function toggleLyrics(id) {
    const c = document.querySelector(`[data-lyrics-id="${id}"]`);
    const t = document.querySelector(`[data-toggle-id="${id}"]`);
    if (!c) return;
    const show = c.classList.toggle('show');
    if (t) t.textContent = show ? '▲ 收起' : '▼ 展開歌詞';
}

// ---- Render ----
function renderSongs() {
    const list = document.getElementById('songs-list');
    const count = document.getElementById('song-count');
    count.textContent = songs.length;

    if (songs.length === 0) {
        list.innerHTML = '<p style="color:#999;text-align:center;padding:20px;">尚未添加歌曲，快來添加第一首歌吧！</p>';
        return;
    }

    list.innerHTML = songs.map((song, i) => {
        const statusLabel = song.status === 'success' ? '✅ 已完成' :
                           song.status === 'error' ? '❌ 失敗' : '⏳ 處理中';

        const badgeText = song.source === 'youtube' ? 'YouTube' : '網易雲';
        const badgeColor = song.source === 'youtube' ? '#ff0000' : '#d52b1e';
        const sourceBadge = `<span style="color:#fff;background:${badgeColor};padding:2px 8px;border-radius:10px;font-size:11px;margin-left:8px;">${badgeText}</span>`;

        const listenLink = song.status === 'success' && song.listenUrl
            ? `<a href="${song.listenUrl}" target="_blank" class="listen-link">▶️ 在 YouTube 上聆聽</a>` : '';

        const lineCount = song.lyrics ? song.lyrics.split('\n').length : 0;

        return `
            <div class="song-item" draggable="true" data-song-id="${song.id}">
                <div class="drag-handle">⠿</div>
                <div class="song-body">
                    <div class="song-header">
                        <div class="song-info">
                            <div class="song-title">${i + 1}. ${escapeHtml(song.title)}</div>
                            <div class="song-artist">${escapeHtml(song.artist)}${song.status === 'success' ? sourceBadge : ''}</div>
                            <div class="song-status">
                                <span class="status-badge ${song.status === 'success' ? 'success' : song.status === 'error' ? 'error' : 'loading'}">${statusLabel}</span>
                            </div>
                            ${song.status === 'success' && song.lyrics ? `<span class="lyrics-toggle" data-toggle-id="${song.id}" onclick="toggleLyrics('${song.id}')">▼ 展開歌詞</span>` : ''}
                            <div class="lyrics-content" data-lyrics-id="${song.id}">${escapeHtml(song.lyrics || '')}</div>
                            ${listenLink}
                        </div>
                        <div class="song-actions">
                            <button class="btn btn-danger btn-small" onclick="removeSong('${song.id}')">✕ 移除</button>
                        </div>
                    </div>
                </div>
            </div>
        `;
    }).join('');

    list.querySelectorAll('.song-item').forEach(el => {
        el.addEventListener('dragstart', onDragStart);
        el.addEventListener('dragend', onDragEnd);
        el.addEventListener('dragover', onDragOver);
        el.addEventListener('dragleave', onDragLeave);
        el.addEventListener('drop', onDrop);
    });
}

function updateVisibility() {
    const has = songs.length > 0;
    document.getElementById('songs-card').style.display = has ? '' : 'none';
    document.getElementById('generate-card').style.display = has ? '' : 'none';
    const btn = document.getElementById('delete-all-btn');
    if (btn) btn.style.display = has ? '' : 'none';
}

function escapeHtml(t) {
    const d = document.createElement('div');
    d.textContent = t;
    return d.innerHTML;
}

// ---- Word generation ----
async function generateWord() {
    if (songs.length === 0) { alert('請先添加歌曲！'); return; }
    if (!window.docx || !window.saveAs) { alert('文檔生成庫尚未載入，請檢查網絡連接後刷新頁面。'); return; }

    const coverName = prompt('請輸入封面標題：', '歌曲歌詞合集');
    if (coverName === null) return;
    const title = coverName.trim() || '歌曲歌詞合集';

    document.getElementById('loading-overlay').style.display = 'flex';

    try {
        const {
            Document, Packer, Paragraph, TextRun, Bookmark, InternalHyperlink, ExternalHyperlink,
            PageBreak, AlignmentType, UnderlineType
        } = docx;

        const TabStopType = docx.TabStopType || { RIGHT: 2 };
        const TabStopLeader = docx.TabStopLeader || { DOT: 'dot' };

        const children = [];

        children.push(new Paragraph({ spacing: { before: 3600 }, alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: '♪', size: 72, color: '6c63ff' }),
        ]}));
        children.push(new Paragraph({ spacing: { before: 500 }, alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: title, bold: true, size: 50, color: '333333' }),
        ]}));
        children.push(new Paragraph({ spacing: { before: 300 }, alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: 'Lyrics Collection', size: 28, color: '888888', italics: true }),
        ]}));
        children.push(new Paragraph({ spacing: { before: 1000 }, alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: `共收錄 ${songs.length} 首歌曲`, size: 24, color: '666666' }),
        ]}));

        children.push(new Paragraph({ children: [new PageBreak()] }));
        children.push(new Paragraph({ spacing: { after: 400 }, alignment: AlignmentType.CENTER, children: [
            new TextRun({ text: '目  錄', bold: true, size: 36, color: '333333' }),
        ]}));

        songs.forEach((song, i) => {
            children.push(new Paragraph({
                spacing: { before: 120 },
                tabStops: [{ type: TabStopType.RIGHT, position: 9072, leader: TabStopLeader.DOT }],
                children: [
                    new InternalHyperlink({
                        anchor: `song-${i}`,
                        children: [new TextRun({ text: `${i + 1}. ${song.title} — ${song.artist}`, size: 22, color: '1a73e8', underline: { type: UnderlineType.SINGLE } })],
                    }),
                    new TextRun({ children: [new TextRun({ text: '\t' })] }),
                    new TextRun({ text: `${2 + i}`, size: 22, color: '333333' }),
                ],
            }));
        });

        songs.forEach((song, i) => {
            children.push(new Paragraph({ children: [new PageBreak()] }));
            children.push(new Paragraph({ spacing: { before: 400 }, children: [
                new Bookmark({ id: `song-${i}`, children: [new TextRun({ text: `${i + 1}. ${song.title}`, bold: true, size: 36, color: '1a1a2e' })] }),
            ]}));
            children.push(new Paragraph({ spacing: { after: 300 }, children: [
                new TextRun({ text: `歌手：${song.artist}`, size: 24, color: '555555' }),
            ]}));

            let prevEmpty = true;
            (song.lyrics || '（無歌詞）').split('\n').forEach(line => {
                const raw = line.trim();
                if (!raw) { prevEmpty = true; return; }
                const clean = raw.replace(/\[\d{2}:\d{2}(\.\d{2,3})?\]/g, '').trim();
                if (!clean) { prevEmpty = true; return; }
                children.push(new Paragraph({
                    spacing: { before: prevEmpty ? 200 : 40, after: 0 },
                    children: [new TextRun({ text: clean, size: 30, color: '444444' })],
                }));
                prevEmpty = false;
            });

            if (song.listenUrl) {
                children.push(new Paragraph({ spacing: { before: 500 }, children: [
                    new TextRun({ text: '▶ 聆聽歌曲：', size: 22, color: '666666', bold: true }),
                    new ExternalHyperlink({
                        children: [new TextRun({ text: song.listenUrl, size: 20, color: '1a73e8', underline: { type: UnderlineType.SINGLE } })],
                        link: song.listenUrl,
                    }),
                ]}));
            } else {
                children.push(new Paragraph({ spacing: { before: 500 }, children: [
                    new TextRun({ text: '（無法取得聆聽連結）', size: 20, color: 'aaaaaa', italics: true }),
                ]}));
            }
        });

        const blob = await Packer.toBlob(new Document({
            title: title,
            description: `共收錄 ${songs.length} 首歌曲`,
            creator: '歌曲歌詞編譯器',
            styles: { default: { document: { run: { font: 'Microsoft JhengHei', size: 22 }, paragraph: { spacing: { after: 120 } } } } },
            sections: [{ children }],
        }));
        saveAs(blob, `${title}_${new Date().toISOString().slice(0, 10)}.docx`);

    } catch (err) {
        console.error(err);
        alert('生成 Word 文件時發生錯誤：' + err.message);
    } finally {
        document.getElementById('loading-overlay').style.display = 'none';
    }
}

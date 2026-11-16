"use strict";
async function loadData() {
  const res = await fetch("./data.json");
  if (!res.ok) throw new Error("data " + res.status);
  return res.json();
}
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("./sw.js").then(() => {
      document.documentElement.dataset.sw = "registered";
    }).catch(() => {});
  });
}
// 安裝提示
let deferredPrompt = null;
const isStandalone = () => window.matchMedia("(display-mode: standalone)").matches || navigator.standalone;
function showInstall(html) {
  const el = document.getElementById("install");
  if (!el || isStandalone() || localStorage.getItem("ted-koubei-install-dismissed")) return;
  el.innerHTML = html + ' <button type="button" id="dismissInstall" style="background:var(--chip);color:var(--ink)">知道了</button>';
  el.style.display = "block";
  document.getElementById("dismissInstall").onclick = () => { localStorage.setItem("ted-koubei-install-dismissed", "1"); el.style.display = "none"; };
  const b = document.getElementById("doInstall");
  if (b) b.onclick = async () => { if (!deferredPrompt) return; deferredPrompt.prompt(); await deferredPrompt.userChoice; deferredPrompt = null; el.style.display = "none"; };
}
window.addEventListener("beforeinstallprompt", (e) => {
  e.preventDefault(); deferredPrompt = e;
  showInstall('可以把「口碑 TED 精選」加到主畫面，離線也能用。<br><button type="button" id="doInstall">加到主畫面</button>');
});
window.addEventListener("DOMContentLoaded", () => {
  if (/iphone|ipad|ipod/i.test(navigator.userAgent) && !isStandalone()) {
    showInstall("iPhone／iPad：在 Safari 按「分享」→「加入主畫面」，之後離線也能用。");
  }
});
(async () => {
  try {

    const DATA = await loadData();
    const STORE = "ted-koubei-sample-marks-v1";
    const PAGE = 40;

    const SORTS = [
      ["views", "依 YouTube 觀看數"],
      ["koubei", "依口碑人數"],
      ["combined", "依綜合分數"],
      ["sleeping", "沉睡好片"],
      ["yearly", "依年代校正"]
    ];
    const DURS = [
      ["all", "全部長度"],
      ["short", "≤10 分"],
      ["mid", "10–20 分"],
      ["long", ">20 分"]
    ];

    const $ = (id) => document.getElementById(id);
    const loadMarks = () => {
      try { return JSON.parse(localStorage.getItem(STORE) || "{}"); }
      catch { return {}; }
    };
    const saveMarks = (m) => localStorage.setItem(STORE, JSON.stringify(m));
    const esc = (s) => String(s)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");

    const byId = Object.create(null);
    for (const v of DATA.videos) byId[v.id] = v;

    function fmtInt(n) {
      return Number(n).toLocaleString("zh-Hant");
    }
    function fmtViews(n) {
      if (n == null || n === "") return "未取得";
      const x = Number(n);
      if (!Number.isFinite(x)) return "未取得";
      if (x >= 1e8) {
        const yi = x / 1e8;
        return (yi >= 10 ? yi.toFixed(1) : yi.toFixed(2)).replace(/\.0+$/, "") + " 億";
      }
      if (x >= 1e4) {
        const w = x / 1e4;
        const d = w >= 100 ? 0 : 1;
        return w.toLocaleString("zh-Hant", { maximumFractionDigits: d, minimumFractionDigits: 0 }).replace(/\.0$/, "") + " 萬";
      }
      return fmtInt(x);
    }
    function fmtDur(sec) {
      if (sec == null) return "未取得";
      const m = Math.floor(sec / 60), s = Math.floor(sec % 60);
      return m + ":" + String(s).padStart(2, "0");
    }
    function fmtPct(x) {
      return (x * 100).toLocaleString("zh-Hant", { maximumFractionDigits: 2, minimumFractionDigits: 1 }) + "%";
    }
    function ytUrl(id, fallback) {
      if (id && /^[A-Za-z0-9_-]{11}$/.test(id)) return "https://www.youtube.com/watch?v=" + id;
      if (typeof fallback === "string" && /^https:\/\/www\.youtube\.com\/watch\?v=[A-Za-z0-9_-]{11}$/.test(fallback)) return fallback;
      return "";
    }
    function topicPills(v) {
      const seen = new Set();
      const out = [];
      const skip = (n) => {
        const low = n.toLowerCase();
        if (n === v.s || low === (v.s || "").toLowerCase()) return true;
        if (/ted\s*talk/.test(low) || low === "ted" || low === "tedtalks" || low === "tedtalk") return true;
        if (n.length > 22) return true;
        return false;
      };
      for (const g of (v.g || [])) {
        if (!g || !g.n || skip(g.n) || seen.has(g.n)) continue;
        seen.add(g.n);
        out.push(g);
        if (out.length >= 6) break;
      }
      return out;
    }

    let sortBy = "views";
    let dur = "all";
    let topic = "all";
    let extra = "all";
    let query = "";
    let shown = PAGE;
    let marks = loadMarks();

    $("banner").innerHTML = `這是方向樣品，不是完整版。主軸是 TED 官方 YouTube 頻道的熱門影片，不是只列網友提到的。觀看、按讚、留言與長度取自 YouTube Data API，資料取得：${esc(DATA.fetched_at)}（台北時間）。目錄共 ${fmtInt(DATA.catalog_size)} 支；此頁列出觀看數 ≥ 10 萬者，並加上口碑樣品中已對到的影片，共 ${fmtInt(DATA.included)} 支。此次用量 ${fmtInt(DATA.quota_units_used)} 單位。依 TED 使用條款，沒有再自動抓 ted.com。PTT 口碑只當「網友推薦」徽章與綜合分數加分。綜合分數 = log<sub>10</sub>(YouTube 觀看數) + 1.5 × 口碑人數，權重為示意。沒有查 TEDx 頻道。中文字幕標記此次沒做：captions.list 每支要 50 單位，光是前 200 名就會用掉約 10,000 單位，等於一天額度上限。`;
    $("foot").textContent = "沒有外部追蹤、也沒有把資料傳出去。想看／看過只寫在你的瀏覽器。未部署、不對外發布。";
    $("top20note").textContent = `前 20 名裡，有 PTT 口碑的 ${DATA.top20_with_koubei} 場；沒有的標 0。觀看數為官方 TED 頻道的 YouTube 數字，不是 ted.com 彙整總觀看。`;

    $("top20").innerHTML = (DATA.top20_ids || []).map((id, i) => {
      const v = byId[id];
      if (!v) return "";
      const href = ytUrl(v.id, v.u);
      const rec = v.k > 0
        ? `<span class="kbadge">網友推薦 · ${esc(String(v.k))} 人</span>`
        : `<span class="kzero">口碑 0</span>`;
      const title = href
        ? `<a href="${esc(href)}" target="_blank" rel="noopener noreferrer">${esc(v.t)}</a>`
        : esc(v.t);
      return `<li>${title}<br><span class="v">${esc(v.s)} · ${fmtViews(v.v)} 次觀看</span> ${rec}</li>`;
    }).join("");

    function btnRow(el, items, current, onPick) {
      el.innerHTML = items.map(([id, label]) =>
        `<button type="button" data-id="${esc(id)}" class="${id === current ? "active" : ""}">${esc(label)}</button>`
      ).join("");
      el.onclick = (ev) => {
        const b = ev.target.closest("button");
        if (!b) return;
        onPick(b.getAttribute("data-id"));
      };
    }
    function renderControls() {
      btnRow($("sorts"), SORTS, sortBy, (id) => { sortBy = id; shown = PAGE; render(); });
      btnRow($("durs"), DURS, dur, (id) => { dur = id; shown = PAGE; render(); });
      const topicItems = [["all", "全部主題"]].concat((DATA.filter_topics || []).map((t) => [t, t]));
      btnRow($("topics"), topicItems, topic, (id) => { topic = id; shown = PAGE; render(); });
      btnRow($("extras"), [
        ["all", "不限"],
        ["rec", "網友推薦"],
        ["want", "想看"],
        ["seen", "看過"]
      ], extra, (id) => { extra = id; shown = PAGE; render(); });
    }

    function setMark(id, value) {
      if (marks[id] === value) delete marks[id];
      else marks[id] = value;
      saveMarks(marks);
  
    // ---- 匯出／匯入標記（只在本機） ----
    $("exportMarks").onclick = () => {
      const blob = new Blob([JSON.stringify({ app: "ted-koubei", version: 1, exported_at: new Date().toISOString(), marks }, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "ted-koubei-marks.json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $("importFile").onchange = async (ev) => {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      try {
        const obj = JSON.parse(await f.text());
        const m = obj && obj.marks ? obj.marks : obj;
        let n = 0;
        for (const [k, v] of Object.entries(m || {})) {
          if ((v === "want" || v === "seen") && byId[k]) { marks[k] = v; n++; }
        }
        saveMarks(marks); render();
        alert(`已匯入 ${n} 筆標記（只存在這台裝置）。`);
      } catch { alert("檔案格式不對，沒有匯入。"); }
      ev.target.value = "";
    };
    render();
    }

    function matchesQuery(v, q) {
      if (!q) return true;
      const parts = [v.t, v.ft, v.s].concat((v.g || []).map((g) => g.n));
      const blob = parts.join(" ").toLowerCase();
      return q.split(/\s+/).filter(Boolean).every((w) => blob.includes(w));
    }
    function matchesDur(v) {
      const d = v.d;
      if (dur === "all") return true;
      if (d == null) return false;
      if (dur === "short") return d <= 600;
      if (dur === "mid") return d > 600 && d <= 1200;
      if (dur === "long") return d > 1200;
      return true;
    }
    function matchesTopic(v) {
      if (topic === "all") return true;
      return (v.g || []).some((g) => g.n === topic);
    }
    function matchesExtra(v) {
      if (extra === "all") return true;
      if (extra === "rec") return (v.k || 0) > 0;
      if (extra === "want") return marks[v.id] === "want";
      if (extra === "seen") return marks[v.id] === "seen";
      return true;
    }

    function filtered() {
      const q = query.trim().toLowerCase();
      const out = [];
      for (const v of DATA.videos) {
        if (sortBy === "sleeping" && (v.e == null || (v.v || 0) < 100000)) continue;
        if (!matchesDur(v) || !matchesTopic(v) || !matchesExtra(v) || !matchesQuery(v, q)) continue;
        out.push(v);
      }
      out.sort((a, b) => {
        const tie = () => (b.v - a.v) || String(a.t).localeCompare(String(b.t), "zh-Hant");
        if (sortBy === "views") return tie();
        if (sortBy === "koubei") return (b.k - a.k) || tie();
        if (sortBy === "combined") {
          const av = a.z, bv = b.z;
          if (av == null && bv == null) return (b.k - a.k) || tie();
          if (av == null) return 1;
          if (bv == null) return -1;
          return (bv - av) || tie();
        }
        if (sortBy === "sleeping") return ((b.e || 0) - (a.e || 0)) || tie();
        if (sortBy === "yearly") return ((b.y || 0) - (a.y || 0)) || tie();
        return tie();
      });
      return out;
    }

    function hintText() {
      if (sortBy === "sleeping") return "沉睡好片：只看觀看數至少 10 萬的影片，依（按讚數＋留言數）／觀看數排序。按讚或留言缺值當 0。";
      if (sortBy === "yearly") return "依年代校正：按每年平均觀看數排序（觀看數 ÷ 上架年數；不足一個月以一個月計）。新上架影片的每年平均會偏高。";
      if (sortBy === "combined") return "綜合分數 = log10(YouTube 觀看數) + 1.5 × 口碑人數。權重為示意，不是官方排名。";
      if (sortBy === "koubei") return "依 PTT 樣品口碑人數排序。多數頻道熱門影片在這份小樣品裡口碑為 0，會排在後面。";
      return "預設依 YouTube 官方頻道觀看數由高到低。這不是 ted.com 的彙整總觀看。";
    }

    function cardHTML(v, rank) {
      const mark = marks[v.id];
      const href = ytUrl(v.id, v.u);
      const rec = (v.k || 0) > 0
        ? `<span class="tag rec">網友推薦 · ${esc(String(v.k))} 人</span>`
        : "";
      const pills = topicPills(v).map((g) =>
        `<span class="tag ${g.src === "推導" ? "derived" : "topic"}">${esc(g.n)}${g.src === "推導" ? " · 推導" : ""}</span>`
      ).join("");
      let metric = "";
      if (sortBy === "sleeping" && v.e != null) {
        metric = `<p class="metric">互動率 <b>${esc(fmtPct(v.e))}</b>（讚 ${fmtInt(v.l || 0)} ＋ 留言 ${fmtInt(v.c || 0)}）</p>`;
      } else if (sortBy === "yearly" && v.y != null) {
        metric = `<p class="metric">每年平均觀看 <b>${fmtViews(Math.round(v.y))}</b></p>`;
      } else if (sortBy === "combined" && v.z != null) {
        metric = `<p class="metric">綜合分數 <b>${esc(Number(v.z).toLocaleString("zh-Hant", { maximumFractionDigits: 3 }))}</b></p>`;
      } else if ((v.l || 0) || (v.c || 0)) {
        metric = `<p class="metric">按讚 ${fmtInt(v.l || 0)} · 留言 ${fmtInt(v.c || 0)}</p>`;
      }
      const wantOn = mark === "want" ? " on-want" : "";
      const seenOn = mark === "seen" ? " on-seen" : "";
      const yt = href
        ? `<a class="yt" href="${esc(href)}" target="_blank" rel="noopener noreferrer">YouTube</a>`
        : `<span class="yt" style="background:var(--chip);color:var(--muted);border-radius:12px;padding:10px 8px;text-align:center;font-size:13px;font-weight:700;">未取得連結</span>`;
      return `<article class="card${mark === "want" ? " want" : ""}${mark === "seen" ? " seen" : ""}" data-id="${esc(v.id)}">
        <div class="flags">
          <span class="rank">#${rank}</span>
          ${rec}
        </div>
        <h2 class="title">${esc(v.t)}</h2>
        <p class="speaker">${esc(v.s || "講者未標")} <span>· ${esc(fmtDur(v.d))} · ${esc((v.p || "").slice(0, 10) || "上架日未取得")}</span></p>
        <p class="views-line">YouTube 觀看 <b>${fmtViews(v.v)}</b>
          <span class="when">資料取得：${esc(DATA.fetched_at)}（台北時間）</span>
        </p>
        ${metric}
        ${pills ? `<div class="topics">${pills}</div>` : ""}
        <div class="actions">
          <button type="button" data-act="want" class="${wantOn.trim()}">想看</button>
          <button type="button" data-act="seen" class="${seenOn.trim()}">看過</button>
          ${yt}
        </div>
      </article>`;
    }

    function render() {
      renderControls();
      $("hint").textContent = hintText();
      const list = filtered();
      if (shown > list.length) shown = list.length || 0;
      if (shown < PAGE && list.length) shown = Math.min(PAGE, list.length);
      const slice = list.slice(0, shown || 0);
      $("stats").textContent = list.length
        ? `顯示 ${fmtInt(slice.length ? 1 : 0)}–${fmtInt(slice.length)}／篩出 ${fmtInt(list.length)} 支（目錄 ${fmtInt(DATA.catalog_size)} 支）`
        : `沒有符合條件的影片。目錄共 ${fmtInt(DATA.catalog_size)} 支。`;
      if (!slice.length) {
        $("list").innerHTML = `<p class="empty">沒有符合的影片。試試清掉搜尋或換篩選。</p>`;
        $("morewrap").innerHTML = "";
        return;
      }
      $("list").innerHTML = slice.map((v, i) => cardHTML(v, i + 1)).join("");
      let more = "";
      if (shown < list.length) {
        const next = Math.min(list.length, shown + PAGE);
        more += `<button type="button" class="more" id="loadmore">載入更多（至 ${fmtInt(next)}／${fmtInt(list.length)}）</button>`;
        if (shown < 200 && list.length > shown) {
          const to200 = Math.min(200, list.length);
          if (to200 > shown) more += `<button type="button" class="more ghost" id="load200">顯示前 ${fmtInt(to200)} 名</button>`;
        }
      }
      $("morewrap").innerHTML = more;
      const lm = $("loadmore");
      if (lm) lm.onclick = () => { shown = Math.min(list.length, shown + PAGE); render(); };
      const l2 = $("load200");
      if (l2) l2.onclick = () => { shown = Math.min(200, list.length); render(); };
    }

    $("list").addEventListener("click", (ev) => {
      const b = ev.target.closest("button[data-act]");
      if (!b) return;
      const card = b.closest(".card");
      if (!card) return;
      setMark(card.getAttribute("data-id"), b.getAttribute("data-act"));
    });

    let t = null;
    $("q").addEventListener("input", (ev) => {
      clearTimeout(t);
      t = setTimeout(() => {
        query = ev.target.value || "";
        shown = PAGE;
    
    // ---- 匯出／匯入標記（只在本機） ----
    $("exportMarks").onclick = () => {
      const blob = new Blob([JSON.stringify({ app: "ted-koubei", version: 1, exported_at: new Date().toISOString(), marks }, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "ted-koubei-marks.json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $("importFile").onchange = async (ev) => {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      try {
        const obj = JSON.parse(await f.text());
        const m = obj && obj.marks ? obj.marks : obj;
        let n = 0;
        for (const [k, v] of Object.entries(m || {})) {
          if ((v === "want" || v === "seen") && byId[k]) { marks[k] = v; n++; }
        }
        saveMarks(marks); render();
        alert(`已匯入 ${n} 筆標記（只存在這台裝置）。`);
      } catch { alert("檔案格式不對，沒有匯入。"); }
      ev.target.value = "";
    };
    render();
      }, 120);
    });


    // ---- 匯出／匯入標記（只在本機） ----
    $("exportMarks").onclick = () => {
      const blob = new Blob([JSON.stringify({ app: "ted-koubei", version: 1, exported_at: new Date().toISOString(), marks }, null, 2)], { type: "application/json" });
      const a = document.createElement("a");
      a.href = URL.createObjectURL(blob);
      a.download = "ted-koubei-marks.json";
      document.body.appendChild(a); a.click(); a.remove();
      setTimeout(() => URL.revokeObjectURL(a.href), 1000);
    };
    $("importFile").onchange = async (ev) => {
      const f = ev.target.files && ev.target.files[0];
      if (!f) return;
      try {
        const obj = JSON.parse(await f.text());
        const m = obj && obj.marks ? obj.marks : obj;
        let n = 0;
        for (const [k, v] of Object.entries(m || {})) {
          if ((v === "want" || v === "seen") && byId[k]) { marks[k] = v; n++; }
        }
        saveMarks(marks); render();
        alert(`已匯入 ${n} 筆標記（只存在這台裝置）。`);
      } catch { alert("檔案格式不對，沒有匯入。"); }
      ev.target.value = "";
    };
    render();
  
  } catch (err) {
    document.getElementById("list").innerHTML = '<p class="empty">資料載入失敗。請連線後重新整理一次，之後就能離線使用。</p>';
  }
})();

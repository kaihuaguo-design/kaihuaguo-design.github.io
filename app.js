(() => {
  'use strict';
  // ---------- 配置 ----------
  // 素材：神凰一镜到底视频（1920×1080，24fps，14.875 秒），调色 + 自适应锐化后拆成 WebP 序列帧 frames/{hd,sd}/0000–0357.webp。
  // 0–7.4 秒展翅滑翔落地并走向镜头，7.4–10.2 秒近景威严凝视镜头，10.3–11.9 秒向左侧首转身，11.9–14.875 秒走出左画框，留下修长凤尾与流光星尘。
  const FPS = 24, LAST_FRAME = 357, DURATION = LAST_FRAME / FPS;
  // 画质分档：默认 1080p 超清（hd）。开了省流模式、2G 网络、内存 ≤ 2GB 的设备直接用 720p（sd）；
  // 其余情况先拉前 12 帧实测网速，补齐开场帧预计要超过 9 秒才自动降到 720p（浏览器自报的网速常常不准，所以以实测为准）
  const conn = navigator.connection || {};
  let tier = conn.saveData || /2g$/.test(conn.effectiveType || '') || (navigator.deviceMemory && navigator.deviceMemory <= 2) ? 'sd' : 'hd';
  const tierLocked = tier === 'sd';         // 省流 / 低内存设备：始终 720p，不在后台升级
  const TIER_PROBE = 12, TIER_BUDGET = 9;
  const SRC_W = 1920, SRC_H = 1080;        // 画面的逻辑尺寸（16:9），两档素材都按它铺满；绘制时用图片自身像素尺寸
  // 神凰前景抠像只做标题可见的前段：masks/NNN.webp 上下两格依次是第 2N、2N+1 帧（960×540，按 1080p 原帧引导滤波精修边缘），透明度即前景神凰与鎏金绶带。
  const MASK_LAST = 241, MASK_W = 960, MASK_H = 540;
  // 开场：页面打开后，神凰从远空云雾滑翔落地走到近景（0 → INTRO_T 秒），近景就是首页的默认位置
  const INTRO_T = 7.4, INTRO_DELAY = 400;
  // 吸附点（视频秒数）。cam：这一幕的机位 [放大倍数, 锚点x, 锚点y]（比例坐标），幕与幕之间镜头平滑推移过去；
  // zoom：停在这一幕时，镜头再极慢地往锚点推近的幅度
  const STAGES = [
    { t: INTRO_T, cam: [1, 0.5, 0.30], zoom: 0.045 },     // 01 首页：近景凝视镜头，标题分开，EXPLORE 引导
    { t: DURATION, cam: [1, 0.16, 0.80], zoom: 0.04 },    // 02 关于我：神凰转身走出左画面，凤尾留在左下，肖像卡与文字入场
    { t: DURATION, cam: [1.07, 0.9, 0.42], zoom: 0.02 },  // 03 目录：镜头向右推，凤尾退到画外，卡片升起
    { t: DURATION, cam: [1.13, 0.62, 0.6], zoom: 0.03 },  // 04 结束：再推近到云海地平线，THANK YOU 立在上面
  ];
  const ABOUT_STAGE = 1, CONTENTS_STAGE = 2, END_STAGE = 3;
  const SWAP_W = 0.9;                      // 关于我 → 目录 → 结束 每次切换的时长（秒）：视频已播完，镜头推移 + 换文字
  const ABOUT_T = 13.2;                    // 神凰走到这一秒（身体大半出画）时「关于我」开始入场
  // 姓名和联系方式：填上就会显示在结尾页，点击可复制；留空则不显示
  const CONTACT = { name: '郭凯华', email: '', wechat: '' };
  // 访问量和下载量：GoatCounter（免费、无 Cookie）。不加载任何统计脚本，只发一个 1 像素的计数请求；
  // 本机预览（localhost / 双击打开）不计数。到 https://www.goatcounter.com 注册时站点代码填 kaihuaguo-design 即可生效，留空则关闭
  const STATS = 'https://kaihuaguo-design.goatcounter.com/count';
  // 播放速度（相对原速）。点击后为了让目录早点出来：凝视段 2 倍速带过；转身段 1.35 倍；走出画面段 0.95 倍
  const rate = t => lerp(1.15, 0.92, smoothstep(10.8, 12.0, t)) * (1 + smoothstep(7.4, 7.7, t) * lerp(1, 0.38, smoothstep(9.0, 9.8, t)) * (1 - smoothstep(10.4, 11.4, t)));
  const LAST_SLOT = LAST_FRAME * 2;
  const hasSlot = s => s >= 0 && s <= LAST_SLOT && (s & 1) === 0;
  const HOLD_SECS = 7;                     // 定格推近的时长
  const FAST_MS = 1000;                    // 快进时剩下的动作最多播多久
  const CARD_E = 0.5;                      // 切到目录的过程走过一半时，四张卡片开始依次升起
  const CARD_GAP = 130;                    // 快进或从结尾页回来时几张会同时到点：按这个间隔（毫秒）排队
  const READY_FRAME = 178;                 // 开场（远空 → 近景凝视）用到的最后一帧
  const READY_STRIDE = 6;                  // 快速起播：先隔 6 帧拉一遍开场骨架帧（约 2.3 MB + 遮罩 1.3 MB），再回头补齐中间帧

  const film = document.getElementById('film'), fctx = film.getContext('2d');
  const front = document.getElementById('front'), tctx = front.getContext('2d');
  const root = document.documentElement;
  const navButtons = [...document.querySelectorAll('[data-nav]')];
  const explore = document.querySelector('.explore'), contents = document.querySelector('.contents'), endEl = document.querySelector('.end'), aboutEl = document.querySelector('.about');
  const cardItems = [...document.querySelectorAll('.cards li')], cardOn = cardItems.map(() => false);
  let cardFree = 0;
  const reduced = matchMedia('(prefers-reduced-motion: reduce)');

  // 箭头流动：把箭头换成同一格里叠着的两支，鼠标移上去（或键盘聚焦）时整组顺着箭头方向移动一格；播完才接受下一次
  const AF_DIR = { '↗': [1, -1], '→': [1, 0], '↓': [0, 1], '↑': [0, -1] };
  const afHTML = (glyph, [dx, dy], cls = '') => `<span class="af${cls && ' ' + cls}" style="--dx:${dx};--dy:${dy}" aria-hidden="true"><span class="af-in"><span>${glyph}</span><span>${glyph}</span></span></span>`;
  function arrowFlow(host, trigger = host, dir) {
    if (!host) return null;
    const glyph = host.innerHTML.trim();
    const d = dir || AF_DIR[glyph] || [0, 1];
    host.innerHTML = afHTML(glyph, d, d[0] && d[1] ? 'diag' : '');
    const af = host.firstElementChild;
    const play = () => { if (!reduced.matches) af.classList.add('go'); };
    af.addEventListener('animationend', () => af.classList.remove('go'));
    trigger.addEventListener('pointerenter', play);
    trigger.addEventListener('focus', play);
    return af;
  }
  const LAST = STAGES.length - 1;

  const clamp = (v, a, b) => Math.min(b, Math.max(a, v));
  const lerp = (a, b, t) => a + (b - a) * t;
  const smoothstep = (a, b, v) => { const t = clamp((v - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
  const frameAt = t => clamp(Math.round(t * FPS), 0, LAST_FRAME) * 2;

  // ---------- 时间换算：W(t) 为按 rate 播到 t 需要的秒数 ----------
  const WSTEP = 0.01, WT = [0];
  for (let i = 1; i * WSTEP <= DURATION + 1e-9; i++) WT.push(WT[i - 1] + WSTEP / rate((i - 0.5) * WSTEP));
  function wallAt(t) {
    const x = clamp(t, 0, DURATION) / WSTEP, i = Math.min(Math.floor(x), WT.length - 2);
    return lerp(WT[i], WT[i + 1], x - i);
  }
  function timeAtWall(w) {
    let lo = 0, hi = WT.length - 1;
    if (w <= 0) return 0;
    if (w >= WT[hi]) return DURATION;
    while (hi - lo > 1) { const m = (lo + hi) >> 1; if (WT[m] <= w) lo = m; else hi = m; }
    return (lo + (w - WT[lo]) / (WT[hi] - WT[lo])) * WSTEP;
  }

  // ---------- 序列帧与抠像加载：按时间顺序，前段优先（完美兼容 file:// 双击直开与 http:// 服务器） ----------
  const frames = [], masks = [];
  let loadedFrames = 0, loadedBytes = 0, started = false;
  const pad = (n, w) => String(n).padStart(w, '0');
  let useImg = location.protocol === 'file:', blobOk = false;
  // 双击 index.html（file://）打开时，浏览器把本地图片当成“别的网站”的图：画进画布后画布就被锁住，WebGL 读不到画面，
  // 鼠标的流体玻璃没法折射。所以本地打开时改从 local/ 里的脚本包加载同一批图（data: 地址不会锁画布），效果和线上一致。
  // local/ 由 tools/build-local.py 生成、只在本机使用（.gitignore 已排除，线上走正常的图片请求）。缺包时自动退回普通图片。
  const PACK = 8, packs = {}, packWait = {};
  let packed = false;   // 本地包加载成功：图片可以像线上一样提前解码成位图，播放更顺
  window.__phxPack = (name, urls) => { if (packWait[name]) packWait[name](urls); };
  const pack = name => packs[name] || (packs[name] = new Promise(res => {
    packWait[name] = res;
    const sc = document.createElement('script');
    sc.src = `local/${name}.js`;
    sc.onload = () => sc.remove();
    sc.onerror = () => { sc.remove(); res(null); };
    document.head.append(sc);
  }));
  const packRef = src => {
    let m = src.match(/^frames\/hd\/(\d{4})\.webp$/);
    if (m) { const n = +m[1]; return ['f' + pad(Math.floor(n / PACK), 2), n % PACK]; }
    m = src.match(/^frames\/still\/(\d{4})\.webp$/);
    if (m) return ['s' + m[1], 0];
    m = src.match(/^masks\/(\d{3})\.webp$/);
    if (m) { const n = +m[1]; return ['m' + pad(Math.floor(n / PACK), 2), n % PACK]; }
    return null;
  };
  const loadImage = (src, into, i, tries = 3) => new Promise(done => {
    const retry = () => tries > 1 ? setTimeout(() => loadImage(src, into, i, tries - 1).then(done), 400) : done();
    if (!useImg) {
      fetch(src).then(r => r.ok ? r.blob() : Promise.reject(r.status))
        .then(b => { into[i] = b; blobOk = true; if (into === frames) loadedBytes += b.size; done(); })
        .catch(() => {
          if (!blobOk) { useImg = true; loadImage(src, into, i, 1).then(done); } else retry();
        });
      return;
    }
    const img = new Image();
    img.decoding = 'async';
    img.onload = () => { into[i] = img; done(); };
    img.onerror = retry;
    const ref = packRef(src);
    if (ref) pack(ref[0]).then(urls => { const u = urls && urls[ref[1]]; if (u) packed = true; img.src = u || src; });
    else img.src = src;
  });

  // 加载顺序：首帧 → 开场骨架帧（每 4 帧一张）→ 按时间补齐其余帧。抠像图跟着它的第一帧一起排队。
  // 从作品链接直接打开时反过来：先加载目录那一帧。
  let loadT0 = 0;
  async function loadAll() {
    const order = [], seen = new Set();
    const add = i => { if (i >= 0 && i <= LAST_FRAME && !seen.has(i)) { seen.add(i); order.push(i); } };
    if (deepWork >= 0) for (let i = LAST_FRAME; i >= 0; i--) add(i);
    else {
      add(0);
      for (let i = 0; i <= READY_FRAME; i += READY_STRIDE) add(i);
      add(READY_FRAME);
      for (let i = 0; i <= LAST_FRAME; i++) add(i);
    }
    const jobs = [];
    for (const i of order) {
      jobs.push(() => loadImage(`frames/${tier}/${pad(i, 4)}.webp`, frames, i * 2).then(() => { loadedFrames++; probeTier(); progressLoad(); }));
      if (i % 2 === 0 && i <= MASK_LAST && !(deepWork >= 0)) jobs.push(() => loadImage(`masks/${pad(i / 2, 3)}.webp`, masks, i / 2));
    }
    if (deepWork >= 0) for (let k = 0; k <= MASK_LAST >> 1; k++) jobs.push(() => loadImage(`masks/${pad(k, 3)}.webp`, masks, k));
    let next = 0;
    const worker = async () => { while (next < jobs.length) await jobs[next++](); };
    loadT0 = performance.now();
    await Promise.all(Array.from({ length: 8 }, worker));
    progressLoad(true);
    loadStills();
    if (tier === 'sd' && !tierLocked && !useImg) upgradeHD();
  }

  // 网速慢时先用 720p 起播；720p 全部到齐后，在后台从当前画面往两边把序列帧换成 1080p（4 路并发，不抢别的请求），
  // 换好一帧就重新解码替换，画面在不知不觉中变清楚
  async function upgradeHD() {
    const cur = clamp(lastFrame >> 1, 0, LAST_FRAME), order = [];
    for (let d = 0; d <= LAST_FRAME; d++) for (const i of d ? [cur + d, cur - d] : [cur]) if (i >= 0 && i <= LAST_FRAME) order.push(i);
    let next = 0;
    const worker = async () => {
      while (next < order.length) {
        const i = order[next++], got = [];
        await loadImage(`frames/hd/${pad(i, 4)}.webp`, got, 0, 2);
        if (!got[0]) continue;
        frames[i * 2] = got[0];
        const key = slotKey(i * 2);
        if (decoded.get(key)) createImageBitmap(got[0]).then(bmp => {
          const old = decoded.get(key);
          if (old) { decoded.set(key, bmp); old.close(); dirty = true; } else bmp.close();
        }).catch(() => {});
      }
    };
    await Promise.all(Array.from({ length: 4 }, worker));
    tier = 'hd';
  }

  // 超清静帧：首页定格那一帧、关于我 / 目录 / 结束共用的末帧，是停下来盯着看的画面，另备 2880 宽的版本。
  // 序列帧都到齐后再加载（720p 起播时也加载，停下来看的画面始终是超清）；屏幕本身不够大（物理像素宽不到 2000）或省流设备不加载
  const STILLS = [READY_FRAME, LAST_FRAME], stills = new Map();
  async function loadStills() {
    if (tierLocked || Math.max(innerWidth, innerHeight) * Math.min(devicePixelRatio || 1, 2) < 2000) return;
    const got = [];
    await Promise.all(STILLS.map(n => loadImage(`frames/still/${pad(n, 4)}.webp`, got, n, 2)));
    for (const n of STILLS) {
      const src = got[n];
      if (!src) continue;
      let bmp = src;
      if (!isImg(src)) { try { bmp = await createImageBitmap(src); } catch { continue; } }
      stills.set(n * 2, bmp);
    }
    dirty = true;
  }

  function probeTier() {
    if (tier !== 'hd' || loadedFrames !== TIER_PROBE || !loadedBytes) return;
    const secs = (performance.now() - loadT0) / 1000, bps = loadedBytes / Math.max(.05, secs);
    const need = (READY_FRAME + 1 - TIER_PROBE) * (loadedBytes / TIER_PROBE);
    if (need / bps > TIER_BUDGET) tier = 'sd';
  }

  // 何时进入页面：开场骨架帧齐了，并且按当前网速估算，剩下的开场帧能在开场动画播到之前补齐（或者已经全部到位）
  function introReady() {
    let skel = 0, skelN = 0, got = 0;
    for (let i = 0; i <= READY_FRAME; i++) {
      const has = !!frames[i * 2];
      if (has) got++;
      if (i % READY_STRIDE === 0) { skelN++; if (has) skel++; }
    }
    const total = READY_FRAME + 1;
    const ratio = (skel / skelN) * .5 + (got / total) * .5;
    if (skel < skelN || !frames[READY_FRAME * 2]) return [false, ratio];
    if (got >= total) return [true, 1];
    const spent = (performance.now() - loadT0) / 1000, perFrame = spent / Math.max(1, loadedFrames);
    const left = (total - got) * perFrame;   // 估算补齐剩余开场帧还要多少秒
    return [left < W0 * .7, ratio];
  }

  function progressLoad(all) {
    const [introOk, ratio] = deepWork >= 0 ? [false, loadedFrames / (LAST_FRAME + 1)] : introReady();
    document.getElementById('loaderBar').style.width = `${Math.round(Math.min(1, ratio) * 100)}%`;
    if (!started && (all || introOk || (deepWork >= 0 && frames[LAST_SLOT]))) {
      started = true; document.body.classList.add('ready'); dirty = true;
      afterStart();
      keepDecoded(deepWork >= 0 ? LAST_SLOT : Math.max(0, lastFrame), dir);
      if (deepWork < 0) {
        if (reduced.matches) w = 0;
        else { const now = performance.now(); tween = { from: w, to: 0, stage: 0, start: now + INTRO_DELAY, dur: W0 * 1000 }; tweenLast = now; }
      }
    }
    if (deepWork >= 0) { if (loadedFrames <= 48) { keepDecoded(LAST_SLOT, 1); dirty = true; } }
    else if (loadedFrames === 1) { keepDecoded(0, 1); dirty = true; }
  }

  // ---------- 预解码：当前位置前后一段帧提前解码成位图，播放时不占主线程 ----------
  const decoded = new Map();
  const maskKey = s => (s & 1) === 0 && (s >> 1) <= MASK_LAST ? 'm' + (s >> 2) : null;
  const slotKey = s => 'f' + s;
  const isImg = x => x instanceof HTMLImageElement;

  function keepDecoded(center, dir) {
    if (useImg && !packed) return; // 普通本地图片画进位图会锁画布，直接用 HTMLImageElement
    // 预解码窗口（槽位，2 槽 = 1 帧）：1080p 位图每张约 8MB，手机上收窄窗口控制内存
    const small = innerWidth < 800;
    const ahead = tier === 'hd' ? (small ? 36 : 60) : (small ? 48 : 80), behind = small ? 12 : 16;
    const lo = center - (dir < 0 ? ahead : behind), hi = center + (dir < 0 ? behind : ahead);
    const want = new Set();
    for (let s = Math.max(0, lo); s <= Math.min(LAST_SLOT, hi); s++) {
      if (!hasSlot(s)) continue;
      want.add(slotKey(s));
      const m = maskKey(s);
      if (m) want.add(m);
    }
    for (const [key, bmp] of decoded) if (!want.has(key)) { if (bmp) bmp.close(); decoded.delete(key); }
    const num = key => key[0] === 'f' ? +key.slice(1) : +key.slice(1) * 4;
    const order = [...want].sort((a, b) => Math.abs(num(a) - center) - Math.abs(num(b) - center));
    for (const key of order) {
      if (decoded.has(key)) continue;
      const n = +key.slice(1);
      const img = key[0] === 'm' ? masks[n] : frames[n];
      if (!img) continue;
      decoded.set(key, null);
      createImageBitmap(img).then(bmp => {
        if (decoded.has(key) && decoded.get(key) === null) { decoded.set(key, bmp); dirty = true; } else bmp.close();
      }).catch(() => decoded.delete(key));
    }
  }

  function nearDecoded(i, r) {
    if (useImg && !packed) {
      for (let d = 0; d <= r; d += 2) for (const j of [i + d * dir, i - d * dir]) {
        if (hasSlot(j) && isImg(frames[j])) return j;
      }
      return i;
    }
    for (let d = 0; d <= r; d += 2) for (const j of [i + d * dir, i - d * dir]) {
      if (!hasSlot(j) || !decoded.get(slotKey(j))) continue;
      const m = maskKey(j);
      if (m && !decoded.get(m)) continue;
      return j;
    }
    return i;
  }

  function frameSource(i) {
    if (!useImg || packed) {
      for (let d = 0; d <= 120; d += 2) for (const j of [i + d * dir, i - d * dir]) {
        const bmp = hasSlot(j) && decoded.get(slotKey(j));
        if (bmp) return bmp;
      }
    }
    for (let d = 0; d <= LAST_SLOT; d += 2) {
      if (isImg(frames[i - d])) return frames[i - d];
      if (isImg(frames[i + d])) return frames[i + d];
    }
    return null;
  }

  // 开场画面能播了以后，才去拉不急的图（目录卡片封面、关于我的肖像），不和开场序列帧抢网速；同时记一次访问
  let afterDone = false;
  function afterStart() {
    if (afterDone) return;
    afterDone = true;
    setTimeout(() => {
      loadCovers();
      document.querySelectorAll('img[data-srcset]').forEach(img => { img.srcset = img.dataset.srcset; img.src = img.dataset.src; img.removeAttribute('data-srcset'); });
      stat(location.pathname, document.title);
    }, 0);
  }
  function stat(path, title) {
    if (!STATS || location.protocol === 'file:' || /^(localhost|127\.|\[::1\]|0\.0\.0\.0)/.test(location.hostname) || navigator.webdriver) return;
    const event = path !== location.pathname;
    const q = new URLSearchParams({ p: path, t: title, s: `${screen.width},${screen.height},${devicePixelRatio || 1}`, rnd: Math.random().toString(36).slice(2) });
    if (event) q.set('e', 'true'); else if (document.referrer) q.set('r', document.referrer);
    try { new Image().src = `${STATS}?${q}`; } catch {}
  }

  // ---------- 位置与布局 ----------
  let vw, vh, dpr, scale, ox, oy, portrait, splitMax = 0;
  const TITLE_NEAR = .58, TITLE_PORTRAIT = .88;
  const W0 = wallAt(INTRO_T);
  const stageW = STAGES.map(s => wallAt(s.t) - W0);
  stageW[CONTENTS_STAGE] = stageW[ABOUT_STAGE] + SWAP_W;
  stageW[END_STAGE] = stageW[CONTENTS_STAGE] + SWAP_W;
  const W_MAX = stageW[END_STAGE];
  const timeAtW = w => timeAtWall(W0 + w);
  const stageAt = w => stageW.reduce((best, s, i) => Math.abs(s - w) < Math.abs(stageW[best] - w) ? i : best, 0);

  function layout() {
    dpr = Math.min(devicePixelRatio || 1, 2);
    vw = Math.max(1, innerWidth); vh = Math.max(1, innerHeight); portrait = vw / vh < .8;
    for (const c of [film, front]) { c.width = Math.round(vw * dpr); c.height = Math.round(vh * dpr); }
    scale = Math.max(vw / SRC_W, vh / SRC_H);
    ox = (vw - SRC_W * scale) / 2;
    oy = (vh - SRC_H * scale) / 2;
    const titleW = document.querySelector('.title .l').offsetWidth + document.querySelector('.title .r').offsetWidth;
    splitMax = (vw / 2 - titleW * TITLE_NEAR / 2 - vw * .03) / TITLE_NEAR;
    dirty = true;
  }

  // ---------- 绘制：底层画整帧，上层用 2D Canvas source-in 画抠出的神凰，让神凰挡在标题前面 ----------
  let zoom = 1, anchor = [0.5, 0.5];
  function placement() {
    const w = SRC_W * scale * zoom, h = SRC_H * scale * zoom;
    const ax = ox + anchor[0] * SRC_W * scale, ay = oy + anchor[1] * SRC_H * scale;
    return [ax - anchor[0] * w, ay - anchor[1] * h, w, h];
  }
  function drawFilm(i) {
    const src = stills.get(i) || frameSource(i);
    if (src) fctx.drawImage(src, 0, 0, src.naturalWidth || src.width, src.naturalHeight || src.height, ...placement());
  }
  function drawFront(i, titleVisible) {
    tctx.setTransform(1, 0, 0, 1, 0, 0);
    tctx.clearRect(0, 0, front.width, front.height);
    const pick = (key, raw) => decoded.get(key) || (isImg(raw) ? raw : null);
    const m = maskKey(i);
    if (!titleVisible || !m) return;
    const sheet = pick(m, masks[i >> 2]), img = stills.get(i) || pick('f' + i, frames[i]);
    if (!sheet || !img) return;
    const box = placement();
    tctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    tctx.imageSmoothingQuality = 'high';
    tctx.drawImage(sheet, 0, ((i >> 1) & 1) * MASK_H, MASK_W, MASK_H, ...box);
    tctx.globalCompositeOperation = 'source-in';
    tctx.drawImage(img, 0, 0, img.naturalWidth || img.width, img.naturalHeight || img.height, ...box);
    tctx.globalCompositeOperation = 'source-over';
  }

  // 文字跟着镜头：标题在神凰走近时向两边分开、微缩，转身走出时目录从上下浮现
  let lastScene = '', navScene = '0';
  // 导航高亮跟随当前场景
  function syncNav() {
    navButtons.forEach(b => b.setAttribute('aria-current', String(b.dataset.nav === navScene)));
  }
  // 入场排队：给「关于我」「结束」两页里的正文元素编上序号（--i），CSS 按序号错开时间
  [[aboutEl, '.ab-role,.ab-say>span,.ab-time>li,.ab-note', 4], [endEl, '.end-say>strong,.end-say>span,.end-contact,.dl,.dl-info,.again', 5]].forEach(([el, sel, from]) =>
    el.querySelectorAll(sel).forEach((x, k) => { x.classList.add('rv'); x.style.setProperty('--i', from + k); }));
  const setState = (el, st) => { if (el.dataset.st !== st) { el.dataset.st = st; el.classList.toggle('in', st === 'in'); el.classList.toggle('out', st === 'out'); } };
  function updateText(t) {
    const css = (k, v) => root.style.setProperty(k, v);
    const u = smoothstep(2.4, 7.0, t);
    css('--split', `${(portrait ? 0 : u * splitMax).toFixed(1)}px`);
    css('--tk', (portrait ? TITLE_PORTRAIT : 1 - u * (1 - TITLE_NEAR)).toFixed(4));
    css('--ty', `${(portrait ? 0 : -u * vh * .035).toFixed(1)}px`);
    const titleO = 1 - smoothstep(8.2, 9.6, t);
    css('--title-o', titleO.toFixed(3));
    css('--intro-o', (1 - smoothstep(INTRO_T + 0.15, INTRO_T + 1.5, t)).toFixed(3));
    const ex = smoothstep(6.0, 7.1, t) * (1 - smoothstep(7.8, 8.6, t));
    css('--explore-o', ex.toFixed(3));
    explore.classList.toggle('on', ex > .5);
    const leaving = !!tween && tween.stage !== 0 && tween.to > w;
    explore.classList.toggle('pulse', ex > .6 && !leaving);
    explore.classList.toggle('go', leaving && ex > .02);
    // e1：关于我 → 目录 走了多少（0–1）；e2：目录 → 结束 走了多少
    const e1 = clamp((w - stageW[ABOUT_STAGE]) / SWAP_W, 0, 1), e2 = clamp((w - stageW[CONTENTS_STAGE]) / SWAP_W, 0, 1);
    setState(aboutEl, e1 > .14 ? 'out' : t > ABOUT_T ? 'in' : '');
    const co = smoothstep(.3, .85, e1);
    css('--contents-o', (co * (1 - smoothstep(0, .55, e2))).toFixed(3));
    css('--head-y', `${((1 - co) * 30 - e2 * 26).toFixed(1)}px`);
    contents.classList.toggle('on', co > .6 && e2 < .5);
    const nowMs = performance.now();
    cardItems.forEach((li, k) => {
      const on = e1 > CARD_E && e2 < .22;
      if (on === cardOn[k]) return;
      cardOn[k] = on;
      const wait = on ? Math.max(0, cardFree - nowMs) : 0;
      if (on) cardFree = nowMs + wait + CARD_GAP;
      li.style.transitionDelay = wait ? `${Math.round(wait)}ms` : '';
      li.style.setProperty('--d', `${Math.round(wait)}ms`);
      li.classList.toggle('show', on);
    });
    setState(endEl, e2 > .5 ? 'in' : '');
    css('--progress', ((W0 + w) / (W0 + W_MAX)).toFixed(4));
    const scene = e2 > .5 ? 'end' : e1 > .5 ? 'contents' : t > 11.6 ? 'about' : 'portfolio';
    if (scene !== lastScene) {
      lastScene = scene;
      const down = '继续下滑' + afHTML('↓', AF_DIR['↓'], 'loop');
      const info = {
        portfolio: ['01', 'PORTFOLIO', '0', ''],
        about: ['02', 'ABOUT ME', '1', down],
        contents: ['03', 'CONTENTS', '2', down],
        end: ['04', 'THANK YOU', '3', '向上回到目录' + afHTML('↑', AF_DIR['↑'], 'loop')]
      }[scene];
      document.getElementById('sceneNo').textContent = info[0];
      document.getElementById('sceneName').textContent = info[1];
      navScene = info[2];
      syncNav();
      document.getElementById('hint').innerHTML = info[3];
    }
    return titleO > .01;
  }

  // 机位：视频播放期间不动（倍数 1）；播完后在 关于我 → 目录 → 结束 之间平滑推移
  function camAt(w) {
    if (w <= stageW[ABOUT_STAGE]) return STAGES[stageAt(w)].cam;
    const k = w < stageW[CONTENTS_STAGE] ? ABOUT_STAGE : CONTENTS_STAGE;
    const f = smoothstep(0, 1, (w - stageW[k]) / SWAP_W), a = STAGES[k].cam, b = STAGES[k + 1].cam;
    return a.map((v, n) => lerp(v, b[n], f));
  }

  let w = -W0, dirty = true, hold = 0, dir = 1, lastFrame = -1, sceneVer = 0, titleShown = true;
  function draw() {
    fctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    fctx.imageSmoothingQuality = 'high';
    const t = timeAtW(w);
    const i = nearDecoded(frameAt(t), tween && tween.fast ? 16 : 4);
    const st = STAGES[stageAt(w)], cam = camAt(w);
    anchor = [cam[1], cam[2]];
    zoom = cam[0] * (1 + (st.zoom || 0) * hold * hold * (3 - 2 * hold));
    drawFilm(i);
    titleShown = updateText(t);
    drawFront(i, titleShown);
    sceneVer++;
    if (i !== lastFrame) { keepDecoded(i, dir); lastFrame = i; }
  }

  // ---------- 主循环 ----------
  let last = performance.now();
  function tick(now) {
    const dt = Math.min(0.05, (now - last) / 1000) || 0.016;
    last = now;
    const moving = !!tween;
    if (tween) stepTween(now);
    const n = stageAt(w);
    const resting = !tween && !dragging && Math.abs(w - stageW[n]) < 0.01 && !reduced.matches;
    const h = resting ? Math.min(1, hold + dt / HOLD_SECS) : Math.max(0, hold - dt * 2.5);
    const holdChanged = h !== hold;
    hold = h;
    if (moving || holdChanged || dirty) { draw(now); dirty = false; }
    pointerFrame(dt);
    if (glass) glass.frame(now);
    requestAnimationFrame(tick);
  }

  // ---------- 播放到停点 ----------
  let settled = 0, tween = null, dragging = false, wVel = 0, tweenLast = 0;
  function goTo(i, fast) {
    i = clamp(i, 0, LAST);
    const to = stageW[i];
    if (tween && tween.stage === i && (!fast || tween.fast)) return;
    if (Math.abs(to - w) < 0.005) { tween = null; w = to; settled = i; dirty = true; return; }
    if (reduced.matches) { tween = null; w = to; settled = i; dirty = true; return; }
    dir = Math.sign(to - w);
    const dist = Math.abs(to - w), now = performance.now();
    if (fast) {
      const dur = clamp(dist * 1000, 300, FAST_MS);
      const v0 = tween && Math.sign(wVel) === dir ? Math.abs(wVel) : 0;
      tween = { from: w, to, stage: i, start: now, dur, fast: true, m0: clamp(v0 * dur / dist, 0, 2.5) };
    } else {
      tween = { from: w, to, stage: i, start: now, dur: clamp(dist * 1000, 450, 20000) };
    }
    tweenLast = now;
    keepDecoded(Math.max(0, lastFrame), dir);
  }
  function stepTween(now) {
    const t = clamp((now - tween.start) / tween.dur, 0, 1);
    let e;
    if (tween.fast) {
      e = t * (1 - t) * (1 - t) * tween.m0 + t * t * (3 - 2 * t);
    } else {
      const a = Math.min(0.12, 600 / tween.dur), v = 1 / (1 - a);
      e = t < a ? v * t * t / (2 * a) : t > 1 - a ? 1 - v * (1 - t) * (1 - t) / (2 * a) : v * (t - a / 2);
    }
    const nw = lerp(tween.from, tween.to, e);
    if (now > tweenLast) wVel = (nw - w) / (now - tweenLast);
    tweenLast = now;
    w = nw;
    if (t === 1) { w = tween.to; settled = tween.stage; tween = null; wVel = 0; dirty = true; }
  }
  function step(d) {
    if (tween && Math.sign(tween.to - w) === d) { goTo(tween.stage, true); return; }
    const ahead = stageW.map((s, i) => i).filter(i => d > 0 ? stageW[i] > w + 0.005 : stageW[i] < w - 0.005);
    if (!ahead.length) return;
    goTo(d > 0 ? ahead[0] : ahead[ahead.length - 1]);
  }

  // 滚轮：一次滑动只触发一次
  let wheelLast = 0, wheelAcc = 0, wheelArmed = true;
  addEventListener('wheel', e => {
    if (openIdx >= 0) {
      if (zoomer.hidden && e.target.closest && e.target.closest('.header')) { e.preventDefault(); reader.scrollBy(0, e.deltaY * (e.deltaMode === 1 ? 16 : 1)); }
      return;
    }
    e.preventDefault();
    const now = performance.now();
    const dy = e.deltaY * (e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? vh : 1), a = Math.abs(dy);
    if (now - wheelLast > 220 || (!wheelArmed && a > 12 && Math.sign(dy) !== Math.sign(wheelAcc))) { wheelArmed = true; wheelAcc = 0; }
    wheelLast = now;
    if (!wheelArmed || dragging) return;
    wheelAcc += dy;
    if (Math.abs(wheelAcc) > 24) { wheelArmed = false; step(Math.sign(wheelAcc)); }
  }, { passive: false });

  // 手指滑动
  let touchY = null;
  addEventListener('touchstart', e => { touchY = openIdx >= 0 || e.target.closest('.bar') ? null : e.touches[0].clientY; }, { passive: true });
  addEventListener('touchmove', e => { if (touchY !== null) e.preventDefault(); }, { passive: false });
  addEventListener('touchend', e => {
    if (touchY === null) return;
    const dy = touchY - e.changedTouches[0].clientY;
    touchY = null;
    if (Math.abs(dy) > 36) step(Math.sign(dy));
  }, { passive: true });

  addEventListener('keydown', e => {
    if (openIdx >= 0) {
      if (e.key === 'Escape') { e.preventDefault(); if (!zoomer.hidden) closeZoom(); else closeWork(); }
      return;
    }
    if ((e.key === ' ' || e.key === 'Enter') && e.target.closest('button, a')) return;
    const down = ['ArrowDown', 'PageDown'].includes(e.key) || (e.key === ' ' && !e.shiftKey);
    const up = ['ArrowUp', 'PageUp'].includes(e.key) || (e.key === ' ' && e.shiftKey);
    if (down || up) { e.preventDefault(); step(down ? 1 : -1); }
    else if (e.key === 'Home') { e.preventDefault(); goTo(0); }
    else if (e.key === 'End') { e.preventDefault(); goTo(LAST, true); }
  });

  // 顶部导航：快进直达
  document.querySelectorAll('[data-go]').forEach(el => el.addEventListener('click', e => {
    e.preventDefault();
    const n = Number(el.dataset.go);
    if (openIdx < 0) { goTo(n, true); return; }
    if (busy) return;
    if (n !== CONTENTS_STAGE) afterClose = () => goTo(n, true);
    closeWork();
  }));

  // EXPLORE：神凰转身走出画面，随后「关于我」入场
  explore.addEventListener('click', () => goTo(ABOUT_STAGE));
  arrowFlow(explore.querySelector('i'), explore, [0, 1]);
  arrowFlow(document.querySelector('.dl-btn i'), document.querySelector('.dl'), [0, 1]);
  document.querySelectorAll('[data-work]').forEach(card => arrowFlow(card.querySelector('.top i'), card));

  // 鼠标：EXPLORE 的磁吸，「关于我」「结束」两页的视差（肖像卡跟着鼠标微微转动，文字反向轻移）。
  // 都在主循环里做弹性跟随，不用 CSS 过渡：跟手、不发涩，离开范围时也是慢慢松开而不是突然弹回
  const ptr = { x: .5, y: .5, sx: .5, sy: .5, tx: 0, ty: 0, mx: 0, my: 0, shown: '' };
  if (matchMedia('(hover: hover) and (pointer: fine)').matches) {
    const RANGE = 190, MAX = 16;
    addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      ptr.x = e.clientX / vw; ptr.y = e.clientY / vh;
      ptr.tx = ptr.ty = 0;
      if (!explore.classList.contains('on')) return;
      const dx = e.clientX - (explore.offsetLeft + explore.offsetWidth / 2), dy = e.clientY - (explore.offsetTop + explore.offsetHeight / 2), d = Math.hypot(dx, dy);
      const pull = Math.min(d * .32, MAX) * (1 - smoothstep(RANGE * .4, RANGE, d)) / Math.max(d, 1);
      ptr.tx = dx * pull; ptr.ty = dy * pull;
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', () => { ptr.tx = ptr.ty = 0; ptr.x = ptr.y = .5; });
  }
  function pointerFrame(dt) {
    if (!explore.classList.contains('on')) ptr.tx = ptr.ty = 0;
    const k = 1 - Math.exp(-dt * 9);
    if (Math.abs(ptr.tx - ptr.mx) + Math.abs(ptr.ty - ptr.my) > .02) {
      ptr.mx += (ptr.tx - ptr.mx) * k; ptr.my += (ptr.ty - ptr.my) * k;
      explore.style.setProperty('--mx', `${ptr.mx.toFixed(2)}px`);
      explore.style.setProperty('--my', `${ptr.my.toFixed(2)}px`);
    }
    const el = aboutEl.dataset.st === 'in' ? aboutEl : endEl.dataset.st === 'in' ? endEl : null;
    if (!el || reduced.matches) return;
    const k2 = 1 - Math.exp(-dt * 4.5), ox = ptr.sx, oy = ptr.sy;
    ptr.sx += (ptr.x - ptr.sx) * k2; ptr.sy += (ptr.y - ptr.sy) * k2;
    if (ptr.shown === el.className && Math.abs(ptr.sx - ox) + Math.abs(ptr.sy - oy) < 2e-4) return;
    ptr.shown = el.className;
    el.style.setProperty('--px', (ptr.sx - .5).toFixed(4));
    el.style.setProperty('--py', (ptr.sy - .5).toFixed(4));
  }

  // 底部进度条：按住拖动可以逐帧看动作，松手后顺着拖动方向把动作播完
  const bar = document.querySelector('.bar');
  const dragTo = e => {
    const r = bar.getBoundingClientRect();
    const nw = clamp((e.clientX - r.left) / r.width * (W0 + W_MAX) - W0, 0, W_MAX);
    dir = Math.sign(nw - w) || dir;
    w = nw; dirty = true;
  };
  bar.addEventListener('pointerdown', e => { dragging = true; tween = null; bar.setPointerCapture(e.pointerId); dragTo(e); });
  bar.addEventListener('pointermove', e => { if (dragging) dragTo(e); });
  const dragEnd = () => {
    if (!dragging) return;
    dragging = false;
    const n = stageAt(w);
    if (Math.abs(w - stageW[n]) < 0.005) goTo(n); else step(dir);
  };
  bar.addEventListener('pointerup', dragEnd);
  bar.addEventListener('pointercancel', dragEnd);

  addEventListener('resize', layout);

  // ---------- 作品：点目录卡片，卡片飞行放大成全屏阅读页，展示 Figma 终稿每页高清图 ----------
  // 每页导出 3840×2160（Figma 2 倍图），再出 1280 / 2560 两档；浏览器按屏幕宽度和像素密度自动挑最合适的一档
  const WORKS = [
    { slug: 'cai-ling-tong', no: '01', title: '采灵通', focal: '64% 50%', pages: ['采灵通：采销数智化 SaaS 平台项目封面', '业务背景与痛点分析', '竞品分析', '制定规范', '高效经营概览与数据决策', '高效检索与批量处理', '结构化表单与准入辅助设计', '可视化搭建与灵活配置', '可视化搭建与桌面端渲染', '京东京麦部分页面展示', '其他页面展示（一）', '其他页面展示（二）'] },
    { slug: 'da-ji-shi', no: '02', title: '大吉市', focal: '70% 50%', pages: ['大吉市：生鲜购物体验项目介绍', 'UI 视觉规范', '首页展示', '购物车介绍', '我的页面：围绕账户查看、订单处理与日常服务', '早餐好搭档', '会员中心', '当季鲜品', '页面总览'] },
    { slug: 'ru-yi', no: '03', title: '如意医疗', focal: '60% 50%', pages: ['如意：AI 健康服务项目介绍', '首页展示：让健康疑问有清楚的表达起点', '健康页面：让信息记录带着当时的情况呈现', '就医页面：让就医选择有据可循', '报告解读：先看关注项，再对照数值与原报告', '等待医生接诊：看清进度与已提交内容', '页面总览'] },
    { slug: 'ai-ops', no: '04', title: '运营设计', focal: '74% 50%', pages: ['AI 赋能运营设计：开学元气补给', 'AI 赋能运营设计：开学焕新计划', 'AI 赋能运营设计：活动主视觉', 'AI 赋能运营设计：新年与夏日双主题', 'AI 赋能运营设计：去野与春日双主题', 'AI 赋能运营设计：数据大屏（一）', 'AI 赋能运营设计：数据大屏（二）'] },
  ];
  const PROJECTS = WORKS.length;
  const PAGE_W = [1280, 2560, 3840], PAGE_SIZES = '(min-width: 1920px) 1920px, 100vw';
  const MORPH_MS = 620, MORPH_EASE = 'cubic-bezier(.22,1,.36,1)', PAGE_RADIUS = 0;
  const $ = id => document.getElementById(id);
  const reader = $('reader'), rPages = $('rPages'), rEnd = $('rEnd');
  const zoomer = $('zoomer'), zScroll = $('zScroll'), zImg = $('zImg');
  const cards = [...document.querySelectorAll('[data-work]')];
  const narrow = matchMedia('(max-aspect-ratio:4/5)');
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const pageSrc = (i, p, wd) => `works/${WORKS[i].slug}/${pad(p + 1, 2)}-${wd}.webp`;
  const srcsetOf = (i, p) => PAGE_W.map(wd => `${pageSrc(i, p, wd)} ${wd}w`).join(', ');
  let afterClose = null, openIdx = -1, busy = false, pushed = false, returnFocus = null;
  const savedTop = {};

  const hashOf = i => `#/works/${WORKS[i].slug}`;
  const parseHash = () => {
    const m = location.hash.match(/^#\/works\/([\w-]+)/);
    return m ? WORKS.findIndex(x => x.slug === m[1]) : -1;
  };
  const deepWork = parseHash();
  const pushHash = i => { try { history.pushState({ work: i }, '', hashOf(i)); pushed = true; } catch { pushed = false; } };
  const replaceHash = i => { try { history.replaceState(null, '', i < 0 ? location.pathname + location.search : hashOf(i)); } catch {} };

  // 封面：直接用每个作品第 1 页的 1280 图，卡片、飞行过渡和「下一个作品」缩略图共用同一张（浏览器缓存里只有一份）
  let coversReady = false;
  function coverImg(i) {
    const img = new Image();
    img.decoding = 'async'; img.alt = '';
    img.src = pageSrc(i, 0, 1280);
    img.style.objectPosition = WORKS[i].focal;
    return img;
  }
  async function loadCovers() {
    const imgs = cards.map((c, i) => coverImg(i));
    await Promise.all(imgs.map(img => img.decode().catch(() => {})));
    cards.forEach((card, i) => {
      const s = document.createElement('span');
      s.className = 'cover';
      s.append(imgs[i]);
      card.prepend(s);
    });
    coversReady = true;
    if (openIdx >= 0) fillEnd(openIdx);
  }

  function nextLink(i, label) {
    const n = WORKS[i], a = document.createElement('a');
    a.className = 'r-next'; a.href = hashOf(i);
    a.innerHTML = `<span class="r-next-text"><small>${label}</small><b>${n.no}</b><strong>${n.title}</strong></span><span class="r-thumb"></span><i aria-hidden="true">→</i>`;
    a.querySelector('.r-thumb').append(coverImg(i));
    arrowFlow(a.querySelector('i'), a);
    a.addEventListener('click', e => { e.preventDefault(); switchWork(i); });
    return a;
  }
  function downloadLink() {
    const dl = document.createElement('a');
    dl.className = 'r-download'; dl.href = PDF_URL; dl.innerHTML = '<span>下载完整作品集 PDF</span><i aria-hidden="true">↓</i>';
    const dlText = dl.firstChild, dlArrow = dl.lastChild;
    arrowFlow(dlArrow, dl);
    const dlShow = st => { dlText.textContent = st === 'ok' ? '已开始下载' : st === 'fail' ? '下载没有成功，请再试一次' : '下载完整作品集 PDF'; dlArrow.hidden = !!st; };
    bindDownload(dl, st => {
      dlShow(st);
      if (st === 'ok') setTimeout(() => dlShow(''), 2400);
    });
    return dl;
  }
  function fillEnd(i) {
    rEnd.textContent = '';
    if (i < PROJECTS - 1) rEnd.append(nextLink(i + 1, '下一个作品'));
    else {
      const p = document.createElement('p');
      p.className = 'r-done'; p.textContent = '四个作品已全部看完';
      rEnd.append(p, downloadLink());
    }
    const back = document.createElement('button');
    back.className = 'r-back'; back.textContent = '回到目录';
    back.addEventListener('click', () => closeWork());
    rEnd.append(back);
  }

  function buildPages(i) {
    const work = WORKS[i];
    $('rNo').textContent = work.no;
    $('rTitle').textContent = work.title;
    $('rOf').textContent = work.pages.length;
    rPages.innerHTML = work.pages.map((alt, p) =>
      `<figure class="r-page"><img src="${pageSrc(i, p, 1280)}" srcset="${srcsetOf(i, p)}" sizes="${PAGE_SIZES}" alt="${alt}" width="3840" height="2160" decoding="async" data-p="${p}" ${p < 2 ? 'fetchpriority="high"' : 'loading="lazy"'}></figure>`
    ).join('');
    fillEnd(i);
  }
  const pageEls = () => [...rPages.querySelectorAll('.r-page')];
  function currentIndex() {
    const first = rPages.firstElementChild, n = rPages.childElementCount;
    if (!first) return 0;
    return clamp(Math.floor((reader.scrollTop + reader.clientHeight / 2 - rPages.offsetTop) / first.offsetHeight), 0, n - 1);
  }
  const currentPageEl = () => pageEls()[currentIndex()];
  function syncProgress() {
    const max = reader.scrollHeight - reader.clientHeight;
    $('rAt').textContent = currentIndex() + 1;
    $('rLine').style.transform = `scaleX(${max > 0 ? clamp(reader.scrollTop / max, 0, 1) : 0})`;
  }
  reader.addEventListener('scroll', syncProgress, { passive: true });

  function flight(i, from, to) {
    const el = document.createElement('div');
    el.className = 'morph';
    el.append(coverImg(i));
    document.body.append(el);
    const box = r => ({ left: `${r.left}px`, top: `${r.top}px`, width: `${r.width}px`, height: `${r.height}px`, borderRadius: `${r.radius}px` });
    const anim = el.animate([box(from), box(to)], { duration: MORPH_MS, easing: MORPH_EASE, fill: 'both' });
    return { el, done: anim.finished.catch(() => {}) };
  }
  const rectOf = (el, radius) => { const r = el.getBoundingClientRect(); return { left: r.left, top: r.top, width: r.width, height: r.height, radius }; };
  const pageRadius = el => el.getBoundingClientRect().width * PAGE_RADIUS;
  const firstReady = el => { const img = el && el.querySelector('img'); return img ? Promise.race([img.decode().catch(() => {}), sleep(1600)]) : null; };

  async function openWork(i, { instant = false, push = true } = {}) {
    if (busy || openIdx >= 0) return;
    busy = true;
    openIdx = i;
    syncNav();
    returnFocus = cards[i] || document.activeElement;
    document.body.classList.add('reading');
    buildPages(i);
    reader.hidden = false;
    reader.scrollTop = savedTop[i] || 0;
    syncProgress();
    if (push) pushHash(i);
    const card = cards[i];
    const motion = !instant && !reduced.matches && coversReady && card;
    const target = currentPageEl();
    if (motion) {
      card.style.visibility = 'hidden';
      const f = flight(i, rectOf(card, 20), rectOf(target, pageRadius(target)));
      requestAnimationFrame(() => reader.classList.add('show'));
      await f.done;
      card.style.visibility = '';
      await firstReady(target);
      reader.classList.add('pages-in');
      f.el.classList.add('out');
      await sleep(200);
      f.el.remove();
    } else {
      reader.classList.add('show', 'pages-in');
    }
    busy = false;
    reader.focus({ preventScroll: true });
  }

  async function finishClose() {
    const i = openIdx;
    if (i < 0 || busy) return;
    busy = true;
    savedTop[i] = reader.scrollTop + reader.clientHeight / 2 < rEnd.offsetTop ? reader.scrollTop : 0;
    const card = cards[i];
    if (!reduced.matches && coversReady && card) {
      const page = currentPageEl();
      const f = flight(i, rectOf(page, pageRadius(page)), rectOf(card, 20));
      card.style.visibility = 'hidden';
      reader.classList.remove('pages-in');
      reader.classList.remove('show');
      await f.done;
      card.style.visibility = '';
      f.el.classList.add('out');
      await sleep(180);
      f.el.remove();
    } else {
      reader.classList.remove('show', 'pages-in');
      if (card) card.style.visibility = '';
      await sleep(reduced.matches ? 0 : 260);
    }
    reader.hidden = true;
    rPages.textContent = '';
    document.body.classList.remove('reading');
    openIdx = -1;
    syncNav();
    busy = false;
    dirty = true;
    if (returnFocus) returnFocus.focus({ preventScroll: true });
    if (afterClose) { const fn = afterClose; afterClose = null; fn(); }
  }
  function closeWork() {
    if (openIdx < 0 || busy) return;
    if (pushed) { pushed = false; history.back(); return; }
    replaceHash(-1);
    finishClose();
  }

  async function switchWork(i) {
    if (busy || openIdx < 0 || i === openIdx) return;
    busy = true;
    savedTop[openIdx] = 0;
    reader.classList.remove('pages-in');
    await sleep(reduced.matches ? 0 : 240);
    openIdx = i;
    syncNav();
    if (cards[i]) returnFocus = cards[i];
    buildPages(i);
    reader.scrollTop = 0;
    syncProgress();
    replaceHash(i);
    await firstReady(pageEls()[0]);
    reader.classList.add('pages-in');
    busy = false;
    reader.focus({ preventScroll: true });
  }

  addEventListener('popstate', () => {
    const i = parseHash();
    if (i < 0 && openIdx >= 0) finishClose();
    else if (i >= 0 && openIdx < 0) openWork(i, { push: false });
    else if (i >= 0 && i !== openIdx) switchWork(i);
  });

  cards.forEach((card, i) => {
    card.addEventListener('click', e => {
      if (e.metaKey || e.ctrlKey || e.shiftKey) return;
      e.preventDefault();
      openWork(i);
    });
    // 鼠标移上卡片就预取第 1 页（与阅读页同样的 srcset/sizes，浏览器挑中的那一档会直接命中缓存）
    const warm = () => { if (!card.dataset.warm) { card.dataset.warm = 1; const im = new Image(); im.sizes = PAGE_SIZES; im.srcset = srcsetOf(i, 0); } };
    card.addEventListener('pointerenter', warm);
    card.addEventListener('focus', warm);
  });

  let zoomFrom = null;
  function openZoom(img) {
    // 放大查看直接上 3840 超清图，先用已加载的那一档垫底
    zImg.src = img.currentSrc || img.src;
    const hi = new Image();
    hi.onload = () => { if (zoomFrom === img) zImg.src = hi.src; };
    hi.src = pageSrc(openIdx, +img.dataset.p || 0, 3840);
    zImg.alt = img.alt;
    zoomer.hidden = false;
    zScroll.scrollLeft = 0;
    zoomFrom = img;
    $('zClose').focus();
  }
  function closeZoom() {
    zoomer.hidden = true;
    zImg.removeAttribute('src');
    if (zoomFrom) reader.focus({ preventScroll: true });
    zoomFrom = null;
  }
  rPages.addEventListener('click', e => {
    const img = e.target.closest('.r-page img');
    if (img && narrow.matches) openZoom(img);
  });
  $('zClose').addEventListener('click', closeZoom);

  // ---------- 结尾页：下载完整作品集、联系方式、再看一遍 ----------
  const PDF_NAME = (CONTACT.name ? CONTACT.name + '-' : '') + 'UI作品集-2026.pdf';
  const PDF_URL = 'portfolio/portfolio-2026.pdf';
  document.getElementById('dlAgain').addEventListener('click', () => goTo(0, true));
  function bindDownload(link, show) {
    link.setAttribute('download', PDF_NAME);
    link.addEventListener('click', async e => {
      stat('download-pdf', '下载 PDF 作品集');
      if (!window.claude || !window.claude.use) { show('ok'); return; }
      e.preventDefault();
      try {
        const dl = await window.claude.use('downloads');
        if (!dl) { window.open(link.href, '_blank'); return; }
        const blob = await (await fetch(link.href)).blob();
        await dl.save({ filename: PDF_NAME, data: blob });
        show('ok');
      } catch (err) {
        show(err && err.code === 'declined' ? '' : 'fail');
      }
    });
  }
  const navDl = document.getElementById('navDl'), navMark = navDl.lastElementChild, navAf = arrowFlow(navMark, navDl);
  bindDownload(navDl, st => {
    navMark.replaceChildren(st === 'ok' ? '✓' : st === 'fail' ? '!' : navAf);
    if (st) setTimeout(() => navMark.replaceChildren(navAf), 2000);
  });
  arrowFlow(document.querySelector('#dlAgain span'), document.getElementById('dlAgain'));
  const dlState = document.querySelector('.dl-state');
  bindDownload(document.querySelector('.dl'), st => {
    dlState.textContent = st === 'ok' ? '已开始下载' : st === 'fail' ? '下载没有成功，请再试一次' : '';
    if (st === 'ok') setTimeout(() => { dlState.textContent = ''; }, 2400);
  });
  (function fillContact() {
    const box = document.getElementById('endContact');
    const items = [['邮箱', CONTACT.email], ['微信', CONTACT.wechat]].filter(x => x[1]);
    if (CONTACT.name) { const b = document.createElement('b'); b.textContent = CONTACT.name; box.append(b); }
    items.forEach(([k, v]) => {
      const btn = document.createElement('button');
      btn.textContent = `${k} ${v}`;
      btn.setAttribute('aria-label', `复制${k} ${v}`);
      btn.addEventListener('click', async () => {
        try { await navigator.clipboard.writeText(v); } catch { return; }
        const old = btn.textContent; btn.textContent = '已复制'; setTimeout(() => { btn.textContent = old; }, 1200);
      });
      box.append(btn);
    });
    box.hidden = !box.childElementCount;
  })();

  // ---------- 鼠标冰晶流体尾巴 (#glass)：光点后面拖出一条会自己流动、打卷的透明雾尾 ----------
  const glass = (() => {
    const CFG = { push: .13, curl: 20, velR: .0015, dyeR: .003, amt0: .2, amtK: 700, diss: 1.25, a0: .12, a1: .26, b0: .14, b1: .8, useMax: 1, edge: .2, refr: .04, haze: .25, blur: 2.5, spec: .08 };
    if (!matchMedia('(hover: hover) and (pointer: fine)').matches || reduced.matches) return null;
    const canvas = document.getElementById('glass');
    const gl = canvas && canvas.getContext('webgl2', { alpha: true, premultipliedAlpha: true, antialias: false });
    if (!gl || !gl.getExtension('EXT_color_buffer_float')) { if (canvas) canvas.remove(); return null; }
    const VS = `#version 300 es
    precision highp float;
    in vec2 aPos; uniform vec2 texel;
    out vec2 vUv, vL, vR, vT, vB;
    void main(){ vUv=aPos*.5+.5; vL=vUv-vec2(texel.x,0.); vR=vUv+vec2(texel.x,0.); vT=vUv+vec2(0.,texel.y); vB=vUv-vec2(0.,texel.y); gl_Position=vec4(aPos,0.,1.); }`;
    const head = `#version 300 es
    precision highp float; precision highp sampler2D;
    in vec2 vUv, vL, vR, vT, vB; out vec4 o;\n`;
    const FS = {
      splat: `uniform sampler2D uT; uniform float aspect, radius, cap, useMax; uniform vec3 color; uniform vec2 point;
        void main(){ vec2 p=vUv-point; p.x*=aspect; vec3 b=texture(uT,vUv).xyz, s=exp(-dot(p,p)/radius)*color;
          o=vec4(useMax>.5?max(b,s):clamp(b+s,-cap,cap),1.); }`,
      advect: `uniform sampler2D uVel, uSrc; uniform vec2 velTexel; uniform float dt, diss;
        void main(){ vec2 c=vUv-dt*texture(uVel,vUv).xy*velTexel; o=clamp(texture(uSrc,c)/(1.+diss*dt),-3000.,3000.); if(any(isnan(o))) o=vec4(0.); }`,
      div: `uniform sampler2D uVel;
        void main(){ vec2 C=texture(uVel,vUv).xy; float L=texture(uVel,vL).x,R=texture(uVel,vR).x,T=texture(uVel,vT).y,B=texture(uVel,vB).y;
          if(vL.x<0.)L=-C.x; if(vR.x>1.)R=-C.x; if(vT.y>1.)T=-C.y; if(vB.y<0.)B=-C.y; o=vec4(.5*(R-L+T-B),0.,0.,1.); }`,
      curl: `uniform sampler2D uVel;
        void main(){ float L=texture(uVel,vL).y,R=texture(uVel,vR).y,T=texture(uVel,vT).x,B=texture(uVel,vB).x; o=vec4(.5*(R-L-T+B),0.,0.,1.); }`,
      vort: `uniform sampler2D uVel, uCurl; uniform float curl, dt;
        void main(){ float L=texture(uCurl,vL).x,R=texture(uCurl,vR).x,T=texture(uCurl,vT).x,B=texture(uCurl,vB).x,C=texture(uCurl,vUv).x;
          vec2 f=.5*vec2(abs(T)-abs(B),abs(R)-abs(L)); f/=length(f)+1e-4; f*=curl*C; f.y*=-1.;
          o=vec4(clamp(texture(uVel,vUv).xy+f*dt,-1000.,1000.),0.,1.); }`,
      press: `uniform sampler2D uP, uDiv;
        void main(){ float L=texture(uP,vL).x,R=texture(uP,vR).x,T=texture(uP,vT).x,B=texture(uP,vB).x; o=vec4((L+R+T+B-texture(uDiv,vUv).x)*.25,0.,0.,1.); }`,
      grad: `uniform sampler2D uP, uVel;
        void main(){ float L=texture(uP,vL).x,R=texture(uP,vR).x,T=texture(uP,vT).x,B=texture(uP,vB).x; o=vec4(texture(uVel,vUv).xy-vec2(R-L,T-B),0.,1.); }`,
      scale: `uniform sampler2D uT; uniform float k; void main(){ o=k*texture(uT,vUv); }`,
      show: `uniform sampler2D uDye, uVel, uFilm, uTitle, uFront; uniform vec2 dyeTexel, velTexel; uniform float time, a0, a1, b0, b1, edge, refr, haze, blur, spec; uniform int hasTitle, hasFront;
        float dd(vec2 uv){ float d=texture(uDye,uv).x; return isnan(d)||isinf(d)?0.:clamp(d,0.,4.); }
        float body(vec2 uv){ return smoothstep(b0,b1,dd(uv)); }
        vec3 scene(vec2 uv){
          vec2 s=clamp(vec2(uv.x,1.-uv.y),0.,1.);
          vec3 c=texture(uFilm,s).rgb;
          if(hasTitle==1){ vec4 t=texture(uTitle,s); c=mix(c,t.rgb,t.a); }
          if(hasFront==1){ vec4 f=texture(uFront,s); c=mix(c,f.rgb,f.a); }
          return c;
        }
        void main(){
          float d=dd(vUv), a=smoothstep(a0,a1,d);
          if(a<.003){ o=vec4(0.); return; }
          float c=body(vUv);
          vec2 e=dyeTexel*1.5;
          vec2 n=vec2(body(vUv+vec2(e.x,0.))-body(vUv-vec2(e.x,0.)), body(vUv+vec2(0.,e.y))-body(vUv-vec2(0.,e.y)));
          float g=length(n);
          vec2 fl=clamp(texture(uVel,vUv).xy*velTexel,-6.,6.)*.006*c;
          vec2 base=vUv-(n*refr+fl);
          float r=1.+blur*c;
          vec3 acc=vec3(0.);
          for(int k=0;k<10;k++){ float fk=float(k), an=fk*2.39996, rr=r*sqrt((fk+.5)/10.); acc+=scene(base+vec2(cos(an),sin(an))*rr*dyeTexel); }
          vec3 col=acc/10.;
          col=mix(col,vec3(.95,.97,1.),haze*c)+.02*c;
          float rim=smoothstep(.05,.4,g)*(1.-c*.6);
          col+=mix(vec3(.78,.9,1.),vec3(1.,.86,.6),.5+.5*sin(time*.5+vUv.x*4.))*rim*edge;
          vec3 N=normalize(vec3(-n*3.,1.));
          col+=pow(max(dot(N,normalize(vec3(-.45,.55,1.))),0.),40.)*spec*c;
          o=vec4(col*a,a)*.94;
        }`,
    };
    const compile = (type, src) => { const sh = gl.createShader(type); gl.shaderSource(sh, src); gl.compileShader(sh); if (!gl.getShaderParameter(sh, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(sh)); return sh; };
    const prog = {};
    try {
      const vs = compile(gl.VERTEX_SHADER, VS);
      for (const [name, src] of Object.entries(FS)) {
        const pr = gl.createProgram();
        gl.attachShader(pr, vs); gl.attachShader(pr, compile(gl.FRAGMENT_SHADER, head + src));
        gl.bindAttribLocation(pr, 0, 'aPos'); gl.linkProgram(pr);
        if (!gl.getProgramParameter(pr, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(pr));
        const u = {}, n = gl.getProgramParameter(pr, gl.ACTIVE_UNIFORMS);
        for (let k = 0; k < n; k++) { const info = gl.getActiveUniform(pr, k); u[info.name] = gl.getUniformLocation(pr, info.name); }
        prog[name] = { p: pr, u };
      }
    } catch (err) { console.warn('glass off:', err); canvas.remove(); return null; }
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0); gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    const texParams = () => {
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
    };
    const targets = [];
    function target(tw, th) {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex); texParams();
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA16F, tw, th, 0, gl.RGBA, gl.HALF_FLOAT, null);
      const fb = gl.createFramebuffer();
      gl.bindFramebuffer(gl.FRAMEBUFFER, fb); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tex, 0);
      const t = { tex, fb, w: tw, h: th, texel: [1 / tw, 1 / th] };
      targets.push(t);
      return t;
    }
    const pair = (tw, th) => ({ a: target(tw, th), b: target(tw, th), flip() { const x = this.a; this.a = this.b; this.b = x; } });
    function clearAll() {
      gl.clearColor(0, 0, 0, 0);
      for (const t of targets) { gl.bindFramebuffer(gl.FRAMEBUFFER, t.fb); gl.viewport(0, 0, t.w, t.h); gl.clear(gl.COLOR_BUFFER_BIT); }
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, canvas.width, canvas.height); gl.clear(gl.COLOR_BUFFER_BIT);
    }
    const sceneTex = [0, 1, 2].map(() => { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); texParams(); return t; });
    const titleCanvas = document.createElement('canvas'), tc = titleCanvas.getContext('2d');
    const TITLE_PARTS = [
      ['.title .l', [[0, '#0d1638'], [.42, '#1b2c5e'], [.76, '#36507f'], [1, '#86a0c4']]],
      ['.title .r', [[0, '#a9b9d0'], [.2, '#9a7a46'], [.46, '#6e4c1d'], [.7, '#b9873a'], [1, '#4a3114']]],
    ].map(([sel, stops]) => [document.querySelector(sel), stops]);
    function drawTitle() {
      tc.setTransform(1, 0, 0, 1, 0, 0);
      tc.clearRect(0, 0, titleCanvas.width, titleCanvas.height);
      const op = parseFloat(root.style.getPropertyValue('--title-o'));
      tc.globalAlpha = Number.isFinite(op) ? op : 1;
      for (const [el, stops] of TITLE_PARTS) {
        const r = el.getBoundingClientRect(), W = el.offsetWidth, H = el.offsetHeight;
        if (!W) continue;
        const k = r.width / W, cs = getComputedStyle(el);
        tc.setTransform(dpr * k, 0, 0, dpr * k, r.left * dpr, r.top * dpr);
        tc.font = `${cs.fontWeight} ${cs.fontSize} ${cs.fontFamily}`;
        if ('letterSpacing' in tc) tc.letterSpacing = cs.letterSpacing;
        tc.textBaseline = 'alphabetic'; tc.textAlign = 'left';
        const m = tc.measureText(el.textContent), asc = m.fontBoundingBoxAscent, desc = m.fontBoundingBoxDescent;
        const y = (H - (asc + desc)) / 2 + asc;
        const ang = 100 * Math.PI / 180, dx = Math.sin(ang), dy = -Math.cos(ang), L = Math.abs(W * dx) + Math.abs(H * dy);
        const grad = tc.createLinearGradient(W / 2 - dx * L / 2, H / 2 - dy * L / 2, W / 2 + dx * L / 2, H / 2 + dy * L / 2);
        stops.forEach(([at, c]) => grad.addColorStop(at, c));
        tc.fillStyle = grad;
        tc.fillText(el.textContent, 0, y);
      }
    }
    // 画面读不进显卡时（本地打开又缺 local/ 包）折射做不了：不画尾巴，只留光点和细圈
    let texUploadOk = true;
    function upload(t, src) {
      if (!texUploadOk) return;
      try {
        gl.bindTexture(gl.TEXTURE_2D, t);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, src);
      } catch {
        texUploadOk = false;
      }
    }

    let vel, dye, pres, divT, curlT, cw = 0, ch = 0;
    function size() {
      if (film.width === cw && film.height === ch) return;
      cw = film.width; ch = film.height;
      canvas.width = cw; canvas.height = ch; titleCanvas.width = cw; titleCanvas.height = ch;
      for (const t of targets) { gl.deleteTexture(t.tex); gl.deleteFramebuffer(t.fb); }
      targets.length = 0;
      const sim = s => [Math.max(8, Math.round(vw * s)), Math.max(8, Math.round(vh * s))];
      const [a, b] = sim(1 / 7), [c, d] = sim(1 / 2);
      vel = pair(a, b); pres = pair(a, b); divT = target(a, b); curlT = target(a, b); dye = pair(c, d);
      clearAll();
      uploadedVer = -1;
    }
    function run(name, out, uniforms) {
      const { p, u } = prog[name];
      gl.useProgram(p);
      let unit = 0;
      for (const [k, v] of Object.entries(uniforms)) {
        if (!u[k]) continue;
        if (v && v.tex) { gl.activeTexture(gl.TEXTURE0 + unit); gl.bindTexture(gl.TEXTURE_2D, v.tex); gl.uniform1i(u[k], unit++); }
        else if (Array.isArray(v)) (v.length === 2 ? gl.uniform2fv : gl.uniform3fv).call(gl, u[k], v);
        else gl.uniform1f(u[k], v);
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, out.fb); gl.viewport(0, 0, out.w, out.h);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }

    const splats = [], cur = { x: -99, y: -99, dx: -99, dy: -99, rx: -99, ry: -99, inside: false };
    let lastHead = null, lastInput = -1e9, awake = false, warmed = false, uploadedVer = -1, t0 = performance.now(), prev = t0;
    const blocked = () => portrait || document.body.classList.contains('reading') || !document.body.classList.contains('ready');
    const dot = document.createElement('div'), ring = document.createElement('div');
    dot.className = 'cur-dot'; ring.className = 'cur-ring';
    document.body.append(dot, ring);
    addEventListener('pointermove', e => {
      if (e.pointerType !== 'mouse') return;
      cur.x = e.clientX; cur.y = e.clientY;
      if (!cur.inside) { cur.inside = true; cur.dx = cur.rx = cur.x; cur.dy = cur.ry = cur.y; lastHead = null; }
      if (blocked() || !texUploadOk) return;
      lastInput = performance.now();
      if (!awake) { awake = true; size(); uploadedVer = -1; lastHead = null; }
    }, { passive: true });
    document.documentElement.addEventListener('mouseleave', () => { cur.inside = false; lastHead = null; });
    addEventListener('blur', () => { cur.inside = false; lastHead = null; });
    function record(dt) {
      const x = cur.dx, y = cur.dy;
      if (!lastHead) { lastHead = { x, y }; return; }
      const mx = x - lastHead.x, my = y - lastHead.y, dist = Math.hypot(mx, my);
      if (dist < .5) return;
      const vx = mx / Math.max(dt, 1 / 240), vy = my / Math.max(dt, 1 / 240);
      const steps = Math.min(10, Math.max(1, Math.ceil(dist / 12)));
      for (let k = 1; k <= steps; k++) splats.push({ x: lastHead.x + mx * k / steps, y: lastHead.y + my * k / steps, vx, vy, n: steps });
      lastHead = { x, y };
    }

    function sleepGlass() {
      awake = false; splats.length = 0; lastHead = null;
      clearAll();
    }
    function frame(now) {
      const dt = Math.min((now - prev) / 1000, 1 / 30) || 0; prev = now;
      const showCur = cur.inside && !blocked();
      document.body.classList.toggle('cur-on', showCur);
      if (showCur) {
        cur.dx += (cur.x - cur.dx) * .3; cur.dy += (cur.y - cur.dy) * .3;
        cur.rx += (cur.x - cur.rx) * .14; cur.ry += (cur.y - cur.ry) * .14;
        dot.style.transform = `translate(${cur.dx.toFixed(1)}px,${cur.dy.toFixed(1)}px)`;
        ring.style.transform = `translate(${cur.rx.toFixed(1)}px,${cur.ry.toFixed(1)}px)`;
      }
      if (!warmed && !awake && !portrait) {
        warmed = true;
        size(); splats.push({ x: 0, y: 0, vx: 0, vy: 0, n: 1 }); simulate(dt, now); clearAll();
        canvas.style.visibility = 'visible';
        return;
      }
      if (!awake) return;
      if (now - lastInput > 3200 || blocked()) { sleepGlass(); return; }
      if (showCur) record(dt);
      simulate(dt, now);
    }
    function simulate(dt, now) {
      size();
      const aspect = vw / vh;
      for (const s of splats) {
        const pt = [s.x / vw, 1 - s.y / vh], speed = Math.hypot(s.vx, s.vy);
        const vk = vel.a.w / vw * CFG.push / s.n;
        run('splat', vel.b, { uT: vel.a, aspect, radius: CFG.velR, cap: 3000, useMax: 0, color: [s.vx * vk, -s.vy * vk, 0], point: pt, texel: vel.a.texel }); vel.flip();
        run('splat', dye.b, { uT: dye.a, aspect, radius: CFG.dyeR, cap: 1.3, useMax: CFG.useMax, color: [Math.min(1, CFG.amt0 + speed / CFG.amtK) / (CFG.useMax ? 1 : Math.sqrt(s.n)), 0, 0], point: pt, texel: dye.a.texel }); dye.flip();
      }
      splats.length = 0;
      const vt = vel.a.texel;
      run('curl', curlT, { uVel: vel.a, texel: vt });
      run('vort', vel.b, { uVel: vel.a, uCurl: curlT, curl: CFG.curl, dt, texel: vt }); vel.flip();
      run('div', divT, { uVel: vel.a, texel: vt });
      run('scale', pres.b, { uT: pres.a, k: .8, texel: vt }); pres.flip();
      for (let k = 0; k < 20; k++) { run('press', pres.b, { uP: pres.a, uDiv: divT, texel: vt }); pres.flip(); }
      run('grad', vel.b, { uP: pres.a, uVel: vel.a, texel: vt }); vel.flip();
      run('advect', vel.b, { uVel: vel.a, uSrc: vel.a, velTexel: vt, dt, diss: .3, texel: vt }); vel.flip();
      run('advect', dye.b, { uVel: vel.a, uSrc: dye.a, velTexel: vt, dt, diss: CFG.diss, texel: dye.a.texel }); dye.flip();
      if (uploadedVer !== sceneVer) {
        uploadedVer = sceneVer;
        upload(sceneTex[0], film);
        if (!texUploadOk) { sleepGlass(); return; }
        if (titleShown) { drawTitle(); upload(sceneTex[1], titleCanvas); upload(sceneTex[2], front); }
      }
      const { p, u } = prog.show;
      gl.useProgram(p);
      [dye.a.tex, vel.a.tex, ...sceneTex].forEach((tex, k) => { gl.activeTexture(gl.TEXTURE0 + k); gl.bindTexture(gl.TEXTURE_2D, tex); });
      gl.uniform1i(u.uDye, 0); gl.uniform1i(u.uVel, 1); gl.uniform1i(u.uFilm, 2); gl.uniform1i(u.uTitle, 3); gl.uniform1i(u.uFront, 4);
      gl.uniform2fv(u.dyeTexel, dye.a.texel); gl.uniform2fv(u.velTexel, vt);
      gl.uniform1f(u.time, (now - t0) / 1000);
      ['a0', 'a1', 'b0', 'b1', 'edge', 'refr', 'haze', 'blur', 'spec'].forEach(k => gl.uniform1f(u[k], CFG[k]));
      gl.uniform1i(u.hasTitle, titleShown ? 1 : 0); gl.uniform1i(u.hasFront, titleShown ? 1 : 0);
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, cw, ch);
      gl.clearColor(0, 0, 0, 0); gl.clear(gl.COLOR_BUFFER_BIT);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    }
    return { frame, mode: () => texUploadOk ? 'refract' : 'off' };
  })();

  window.phoenixPortfolio = { glass, state: () => ({ scene: lastScene, about: aboutEl.dataset.st || '', end: endEl.dataset.st || '', tier, loadedMB: +(loadedBytes / 1048576).toFixed(1), started, mode: useImg ? 'img' : 'blob', w, t: timeAtW(w), frame: lastFrame / 2, settled, hold, zoom, tween: tween ? tween.stage : null, loadedFrames, masks: masks.filter(Boolean).length, decoded: [...decoded.values()].filter(Boolean).length, stills: [...stills.keys()].map(k => k / 2), vw, vh, openIdx, busy }) };

  layout();
  if (deepWork >= 0) { w = stageW[CONTENTS_STAGE]; settled = CONTENTS_STAGE; openWork(deepWork, { instant: true, push: false }); }
  requestAnimationFrame(tick);
  loadAll();
  if (deepWork >= 0) afterStart();
})();

/* 整片共用的小工具。舞台按 1920×1080 设计（#stage），输出时整体放大到 data-width。
   截图是隔离实例里截的 2 倍图：逻辑尺寸 1600×1000，元素坐标在 window.RECTS[图名][元素名] = [x, y, w, h, 文字]。
   所有动画都是时间的函数：不用回调写状态，随机数用 OM.random。 */
(() => {
  const K = (window.K = {});
  const W = (K.W = 1920), H = (K.H = 1080);
  K.SW = 1600; K.SH = 1000; // 截图的逻辑尺寸
  gsap.config({ force3D: false }); // 不让 GSAP 强开合成层：放大时文字按最终尺寸栅格化，不会糊

  // 小的界面音效（pop、tick、click）整体轻一点；没指定音高的，每次音高略有不同，连着响时不像同一个声音复制粘贴
  const sfx0 = OM.sfx, RS = OM.random(4242);
  OM.sfx = (name, at, o = {}) => {
    if (!/^(pop|tick|click)$/.test(name)) return sfx0(name, at, o);
    const q = { ...o, gain: (o.gain ?? 0.4) * 0.72 };
    if (q.note == null && q.pitch == null) q.pitch = 0.94 + RS() * 0.12;
    return sfx0(name, at, q);
  };

  K.el = (tag, cls, parent, html) => {
    const e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    if (parent) parent.appendChild(e);
    return e;
  };
  K.svg = (tag, attrs, parent) => {
    const e = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const k in attrs || {}) e.setAttribute(k, attrs[k]);
    if (parent) parent.appendChild(e);
    return e;
  };
  K.css = (e, o) => { for (const k in o) e.style[k] = typeof o[k] === 'number' && !/opacity|zIndex|fontWeight|lineHeight|flex/.test(k) ? o[k] + 'px' : o[k]; return e; };

  // ---------- 截图上的坐标 ----------
  K.rect = (shot, name) => {
    const r = window.RECTS[shot] && window.RECTS[shot][name];
    if (!r) throw new Error(`没有元素 ${shot} / ${name}`);
    return { x: r[0], y: r[1], w: r[2], h: r[3], text: r[4] };
  };
  K.pad = (r, p, py) => ({ x: r.x - p, y: r.y - (py ?? p), w: r.w + 2 * p, h: r.h + 2 * (py ?? p) });
  K.union = (...rs) => {
    const x = Math.min(...rs.map((r) => r.x)), y = Math.min(...rs.map((r) => r.y));
    return { x, y, w: Math.max(...rs.map((r) => r.x + r.w)) - x, h: Math.max(...rs.map((r) => r.y + r.h)) - y };
  };
  K.center = (r) => [r.x + r.w / 2, r.y + r.h / 2];

  // ---------- 文字 ----------
  // 一行字拆成单字、各自装进遮罩；{ } 里的字用强调色。
  K.chars = (parent, text, cls, style) => {
    const h = K.el('div', cls, parent);
    if (style) K.css(h, style);
    for (const part of String(text).split(/(\{[^}]*\})/)) {
      const hot = part.startsWith('{');
      for (const c of hot ? part.slice(1, -1) : part) {
        if (c === '\n') { K.el('br', null, h); continue; }
        const m = K.el('span', 'mask', h);
        K.el('span', 'ch' + (hot ? ' hot' : ''), m, c === ' ' ? '&nbsp;' : c);
      }
    }
    gsap.set(h.querySelectorAll('.ch'), { yPercent: 140 });
    return h;
  };
  K.rise = (tl, h, at, o = {}) => tl.to(h.querySelectorAll('.ch'), { yPercent: 0, rotation: 0, duration: o.dur ?? 0.7, ease: o.ease ?? 'expo.out', stagger: o.stagger ?? 0.03 }, at);
  K.sink = (tl, h, at, o = {}) => tl.to(h.querySelectorAll('.ch'), { yPercent: -140, duration: o.dur ?? 0.4, ease: 'power3.in', stagger: o.stagger ?? 0.012 }, at);
  // 整行上浮（正文用，按行出现）
  K.lines = (parent, html, cls, style) => {
    const h = K.el('div', cls, parent, html);
    if (style) K.css(h, style);
    gsap.set(h, { opacity: 0, y: 18 });
    return h;
  };
  K.fadeUp = (tl, nodes, at, o = {}) => tl.to(nodes, { opacity: 1, y: 0, duration: o.dur ?? 0.6, ease: 'expo.out', stagger: o.stagger ?? 0.08 }, at);
  K.fadeOut = (tl, nodes, at, o = {}) => tl.to(nodes, { opacity: 0, y: o.y ?? -12, duration: o.dur ?? 0.35, ease: 'power2.in', stagger: o.stagger ?? 0 }, at);
  K.count = (tl, node, from, to, at, dur = 1, ease = 'expo.out') =>
    tl.fromTo(node, { innerText: from }, { innerText: to, snap: { innerText: 1 }, duration: dur, ease, immediateRender: false }, at);

  // 左侧讲解栏：眉题 + 标题 + 一两句说明。
  K.caption = (parent, { kicker, title, body, x = 120, y = 300, width = 600, size = 64, id }) => {
    const box = K.el('div', 'cap', parent);
    K.css(box, { left: x, top: y, width });
    if (id) box.dataset.omId = id;
    const k = kicker ? K.el('div', 'cap-k', box, kicker) : null;
    const t = K.chars(box, title, 'cap-t', { fontSize: size + 'px' });
    const b = body ? K.lines(box, body, 'cap-b') : null;
    if (k) gsap.set(k, { opacity: 0, x: -20 });
    return {
      box,
      in(tl, at) {
        if (k) tl.to(k, { opacity: 1, x: 0, duration: 0.5, ease: 'expo.out' }, at);
        K.rise(tl, t, at + 0.08, { stagger: 0.025 });
        if (b) K.fadeUp(tl, b, at + 0.45);
        return at;
      },
      out(tl, at) {
        if (k) tl.to(k, { opacity: 0, duration: 0.3 }, at);
        K.sink(tl, t, at);
        if (b) K.fadeOut(tl, b, at);
        tl.set(box, { visibility: 'hidden' }, at + 0.7);
        return at;
      },
    };
  };

  // ---------- 截图做成的屏幕 ----------
  // cam：平移和缩放（摄像机），tilt：3D 倾斜，dev：截图本身和贴在截图上的东西（截图的逻辑坐标）。
  K.screen = (parent, shot, o = {}) => {
    const s = { shot, states: {} };
    s.cam = K.el('div', 'cam', parent);
    s.tilt = K.el('div', 'tilt', s.cam);
    s.dev = K.el('div', 'dev', s.tilt);
    if (o.id) s.dev.dataset.omId = o.id;
    for (const e of [s.cam, s.tilt, s.dev]) K.css(e, { width: K.SW, height: K.SH });
    s.add = (name) => {
      if (s.states[name]) return s.states[name];
      const img = K.el('img', 'shot', s.dev);
      img.src = `assets/shots/${name}.png`;
      img.dataset.state = name;
      if (Object.keys(s.states).length) gsap.set(img, { opacity: 0 });
      s.states[name] = img;
      return img;
    };
    s.add(shot);
    for (const n of o.states || []) s.add(n);
    s.layer = K.el('div', 'layer', s.dev); // 光标、框、抠图都在这一层
    s.ink = K.svg('svg', { class: 'ink', viewBox: `0 0 ${K.SW} ${K.SH}`, width: K.SW, height: K.SH }, s.layer);
    s.current = shot;
    // 换到另一张状态图：默认硬切（和点击同一帧），fade 给交叉淡入
    s.swap = (tl, at, name, fade = 0) => {
      if (name === s.current) return at;
      const to = s.add(name), from = s.states[s.current];
      if (fade) { tl.to(to, { opacity: 1, duration: fade, ease: 'none' }, at); tl.set(from, { opacity: 0 }, at + fade); }
      else { tl.set(to, { opacity: 1 }, at); tl.set(from, { opacity: 0 }, at); }
      s.current = name;
      return at;
    };
    // 侧栏点进另一页：右边的内容区从右侧推进来（侧栏不动），推完再整张换过去（侧栏的选中项在这一刻换）
    const SIDE = 282;
    s.page = (tl, at, name, dur = 0.45) => {
      if (name === s.current) return at;
      const to = s.add(name), from = s.states[s.current];
      // z-index 1：盖住旧的那张（不管谁先加进来）；框、光标这些标注的层级更高或在它后面，仍在上面
      tl.set(to, { clipPath: `inset(0px 0px 0px ${SIDE}px)`, zIndex: 1 }, at);
      tl.fromTo(to, { x: 56, opacity: 0 }, { x: 0, opacity: 1, duration: dur, ease: 'expo.out', immediateRender: false }, at);
      tl.set(to, { clipPath: 'none', zIndex: 'auto' }, at + dur);
      tl.set(from, { opacity: 0 }, at + dur);
      s.current = name;
      return at;
    };
    s.r = (name, state) => K.rect(state || s.current, name);
    // 录屏当作一种状态：start 是成片里的时刻，rate 是播放速度。包一层 div，动画只动这一层。
    s.addVideo = (name, src, { start, dur, mediaStart = 0, rate = 1 }) => {
      const wrap = K.el('div', 'vstate', s.dev);
      const v = K.el('video', null, wrap);
      v.id = 'v-' + name; v.muted = true; v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      v.src = src; v.dataset.start = start.toFixed(3); v.dataset.duration = dur.toFixed(3);
      v.dataset.mediaStart = mediaStart; v.dataset.playbackRate = rate; v.dataset.trackIndex = 1;
      s.dev.insertBefore(wrap, s.layer);
      gsap.set(wrap, { opacity: 0 });
      s.states[name] = wrap;
      return wrap;
    };
    // 窗口收成其中一块面板（clip-path，截图坐标），阴影跟着形状走
    const inset = (r, rad) => `inset(${r.y}px ${K.SW - r.x - r.w}px ${K.SH - r.y - r.h}px ${r.x}px round ${rad}px)`;
    gsap.set(s.dev, { clipPath: inset({ x: 0, y: 0, w: K.SW, h: K.SH }, 14) });
    s.clipTo = (tl, at, r, dur = 0.9, rad = 14) => { tl.to(s.dev, { clipPath: inset(r || { x: 0, y: 0, w: K.SW, h: K.SH }, rad), duration: dur, ease: 'expo.inOut' }, at); return at + dur; };
    s.clipSet = (r, rad = 14) => gsap.set(s.dev, { clipPath: inset(r || { x: 0, y: 0, w: K.SW, h: K.SH }, rad) });
    s.cameraman = K.camera(s.cam, o.camera);
    gsap.set(s.tilt, { transformPerspective: 2600, transformOrigin: '50% 50%' });
    return s;
  };

  // 摄像机：焦点（截图坐标）落到舞台上的 anchor，缩放按对数插值。每一步从上一步的姿态出发。
  //   pose: { rect, w | h | zoom | pad, anchor:[x,y] } 或 { focus:[x,y], zoom }
  K.camera = (el, o = {}) => {
    el.style.transformOrigin = '0 0';
    const st = { fx: K.SW / 2, fy: K.SH / 2, lz: 0, ax: W / 2, ay: H / 2 };
    const apply = () => { const z = Math.exp(st.lz); el.style.transform = `translate(${st.ax - z * st.fx}px, ${st.ay - z * st.fy}px) scale(${z})`; };
    const pose = (p, base) => {
      const out = { ...base };
      if (p.anchor) { out.ax = p.anchor[0]; out.ay = p.anchor[1]; }
      if (p.rect) {
        const r = p.rect;
        out.fx = r.x + r.w / 2; out.fy = r.y + r.h / 2;
        const z = p.zoom || (p.w ? p.w / r.w : p.h ? p.h / r.h : Math.min((W - 2 * (p.pad ?? 120)) / r.w, (H - 2 * (p.pad ?? 120)) / r.h));
        out.lz = Math.log(z);
      } else {
        if (p.focus) { out.fx = p.focus[0]; out.fy = p.focus[1]; }
        if (p.zoom) out.lz = Math.log(p.zoom);
      }
      return out;
    };
    let plan = { ...st };
    let lastEnd = null; // 上一次移动落定的时刻
    const proxy = {};
    for (const k of Object.keys(st)) Object.defineProperty(proxy, k, { get: () => st[k], set: (v) => { st[k] = v; apply(); }, enumerable: true });
    const cam = {
      set(p) { Object.assign(st, pose(p, plan)); plan = { ...st }; lastEnd = null; apply(); return cam; },
      to(tl, at, p) {
        // 两次移动之间不让镜头完全停住：极慢地再推近一点（最多 2%），下一次移动从推近后的姿态出发
        if (lastEnd !== null && at - lastEnd > 0.6 && !p.noDrift) {
          const hold = at - lastEnd;
          const drift = { ...plan, lz: plan.lz + Math.log(1 + Math.min(0.02, 0.0028 * hold)) };
          tl.fromTo(proxy, { ...plan }, { ...drift, duration: hold, ease: 'sine.inOut', immediateRender: false }, lastEnd);
          plan = drift;
        }
        const target = pose(p, plan);
        tl.fromTo(proxy, { ...plan }, { ...target, duration: p.duration ?? 0.9, ease: p.ease || 'expo.inOut', immediateRender: false }, Math.max(0, at));
        plan = target;
        lastEnd = at + (p.duration ?? 0.9);
        return lastEnd;
      },
      // 当前计划姿态下，截图上一个点在舞台上的位置（用来接引线）
      toStage(x, y) { const z = Math.exp(plan.lz); return [plan.ax + z * (x - plan.fx), plan.ay + z * (y - plan.fy)]; },
      zoom: () => Math.exp(plan.lz),
      plan: () => ({ ...plan }),
    };
    apply();
    return cam;
  };

  // ---------- 贴在截图上的东西 ----------
  const rr = (r, rad) => {
    const { x, y, w, h } = r, q = Math.min(rad, w / 2, h / 2);
    return `M${x + w / 2},${y} H${x + w - q} Q${x + w},${y} ${x + w},${y + q} V${y + h - q} Q${x + w},${y + h} ${x + w - q},${y + h} H${x + q} Q${x},${y + h} ${x},${y + h - q} V${y + q} Q${x},${y} ${x + q},${y} Z`;
  };
  // 描出来的框
  K.ring = (s, r, o = {}) => {
    const p = K.svg('path', { d: rr(r, o.radius ?? 10), fill: 'none', stroke: o.color || 'var(--blue)', 'stroke-width': o.width ?? 2.5, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1, opacity: 0 }, s.ink);
    return p;
  };
  // 描之前整条隐藏：圆头线帽在长度为 0 时也会在起点画出一个点
  K.draw = (tl, path, at, dur = 0.6) => { tl.set(path, { opacity: 1 }, at); return tl.to(path, { strokeDashoffset: 0, duration: dur, ease: 'power2.inOut' }, at); };
  K.undraw = (tl, path, at, dur = 0.3) => tl.to(path, { opacity: 0, duration: dur }, at);
  // 压暗周围、留出亮区
  K.spot = (s, r, o = {}) => {
    const h = K.el('div', 'hole', s.layer);
    K.css(h, { left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: (o.radius ?? 12) + 'px' });
    return h;
  };
  K.dim = (tl, hole, at, a = 0.55, dur = 0.6) => tl.to(hole, { boxShadow: `0 0 0 3000px rgba(249,250,251,${a})`, duration: dur, ease: 'power2.inOut' }, at);
  K.dimDark = (tl, hole, at, a = 0.5, dur = 0.6) => tl.to(hole, { boxShadow: `0 0 0 3000px rgba(15,17,21,${a})`, duration: dur, ease: 'power2.inOut' }, at);
  // 把截图里的一块抠出来浮起（用当前状态图）
  K.lift = (s, r, state) => {
    const p = K.el('div', 'piece', s.layer);
    K.css(p, { left: r.x, top: r.y, width: r.w, height: r.h, backgroundImage: `url(assets/shots/${state || s.current}.png)`, backgroundSize: `${K.SW}px ${K.SH}px`, backgroundPosition: `${-r.x}px ${-r.y}px` });
    gsap.set(p, { opacity: 0, transformPerspective: 1400, transformOrigin: '50% 50%' });
    return p;
  };
  K.raise = (tl, p, at, o = {}) => {
    tl.set(p, { opacity: 1 }, at);
    tl.fromTo(p, { scale: 1, y: 0, boxShadow: '0 0 0 0 rgba(15,17,21,0), 0 0 0 0 rgba(65,118,230,0)' },
      { scale: o.scale ?? 1.06, y: o.y ?? -6, boxShadow: '0 22px 50px rgba(15,17,21,.18), 0 0 0 2px rgba(65,118,230,.9)', duration: o.dur ?? 0.6, ease: OM.spring(0.18), immediateRender: false }, at);
    return at;
  };
  K.lower = (tl, p, at) => { tl.to(p, { scale: 1, y: 0, boxShadow: '0 0 0 0 rgba(15,17,21,0), 0 0 0 0 rgba(65,118,230,0)', duration: 0.45, ease: 'power3.inOut' }, at); tl.set(p, { opacity: 0 }, at + 0.45); };
  // 一条浅蓝色的高亮条
  K.bar = (s, r, o = {}) => {
    const b = K.el('div', 'hbar', s.layer);
    K.css(b, { left: r.x, top: r.y, width: r.w, height: r.h, borderRadius: (o.radius ?? 8) + 'px' });
    gsap.set(b, { opacity: 0 });
    return b;
  };

  // ---------- 光标 ----------
  // 在截图坐标里移动，随摄像机一起缩放。尖端在 (0,0)。
  K.cursor = (s, x0 = 800, y0 = 1100) => {
    const c = K.el('div', 'cursor', s.layer, '<svg viewBox="0 0 24 24" width="24" height="24"><path d="M4.5 2.5l15 8.6-6.8 1.7-3.6 6.7z" fill="#0f1115" stroke="#fff" stroke-width="1.5" stroke-linejoin="round"/></svg>');
    gsap.set(c, { x: x0, y: y0, scale: 1, opacity: 0, transformOrigin: '4px 2px' });
    let px = x0, py = y0;
    const cur = {
      el: c,
      move(tl, at, x, y, dur = 0.7) { tl.fromTo(c, { x: px, y: py }, { x, y, duration: dur, ease: 'power3.inOut', immediateRender: false }, at); px = x; py = y; return at + dur; },
      to(tl, at, r, dur = 0.7, dx = 0.5, dy = 0.55) { return cur.move(tl, at, r.x + r.w * dx, r.y + r.h * dy, dur); },
      click(tl, at, o = {}) {
        tl.to(c, { scale: 0.82, duration: 0.08, ease: 'power2.in' }, at - 0.08).to(c, { scale: 1, duration: 0.25, ease: 'back.out(3)' }, at);
        const rp = K.el('div', 'ripple', s.layer);
        K.css(rp, { left: px - 18, top: py - 18 });
        tl.fromTo(rp, { scale: 0.3, opacity: 0.8 }, { scale: 1.6, opacity: 0, duration: 0.55, ease: 'power2.out', immediateRender: false }, at);
        gsap.set(rp, { opacity: 0 });
        if (o.sound !== false) OM.sfx('click', at, { gain: o.gain ?? 0.8 });
        return at;
      },
      show(tl, at) { tl.fromTo(c, { opacity: 0 }, { opacity: 1, duration: 0.2, immediateRender: false }, at); },
      hide(tl, at) { tl.to(c, { opacity: 0, duration: 0.25 }, at); },
    };
    return cur;
  };

  // ---------- 舞台上的标注 ----------
  K.label = (parent, html, o = {}) => {
    const l = K.el('div', 'label' + (o.cls ? ' ' + o.cls : ''), parent, html);
    K.css(l, { left: o.x ?? 0, top: o.y ?? 0 });
    if (o.id) l.dataset.omId = o.id;
    gsap.set(l, { opacity: 0, scale: 0.92, y: 10, transformOrigin: o.origin || '0% 50%' });
    return l;
  };
  K.pop = (tl, l, at) => tl.to(l, { opacity: 1, scale: 1, y: 0, duration: 0.55, ease: OM.spring(0.2) }, at);
  K.overlay = (parent) => K.svg('svg', { class: 'overlay', viewBox: `0 0 ${W} ${H}`, width: W, height: H }, parent);
  // 从 a 到 b 的折线引线，起点一个圆点
  K.leader = (svg, a, b, o = {}) => {
    const mid = o.vertical ? [a[0], b[1]] : [b[0], a[1]];
    const p = K.svg('path', { d: `M${a[0]},${a[1]} L${mid[0]},${mid[1]} L${b[0]},${b[1]}`, fill: 'none', stroke: o.color || '#4176e6', 'stroke-width': o.width ?? 2, pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1 }, svg);
    const d = K.svg('circle', { cx: a[0], cy: a[1], r: 0, fill: o.color || '#4176e6' }, svg);
    return {
      in(tl, at) { tl.to(d, { attr: { r: 5 }, duration: 0.25, ease: 'back.out(3)' }, at); tl.to(p, { strokeDashoffset: 0, duration: 0.5, ease: 'power2.inOut' }, at + 0.05); return at + 0.55; },
      out(tl, at) { tl.to([p, d], { opacity: 0, duration: 0.3 }, at); },
    };
  };

  // ---------- 架构图 ----------
  // 一张比舞台大的图（world），自带一台摄像机；节点是普通的 div，连线是三次贝塞尔，光点沿连线取样走。
  K.arch = (parent, tl, { w = 3900, h = 1100 } = {}) => {
    const world = K.el('div', 'arch', parent);
    K.css(world, { width: w, height: h });
    const svg = K.svg('svg', { class: 'arch-svg', viewBox: `0 0 ${w} ${h}`, width: w, height: h }, world);
    const cam = K.camera(world);
    const el = (cls, x, y, html, wd) => {
      const e = K.el('div', cls, world, html);
      K.css(e, { left: x, top: y });
      if (wd) K.css(e, { width: wd });
      gsap.set(e, { opacity: 0 });
      return e;
    };
    const pop = (e, at, o = {}) => tl.fromTo(e, { opacity: 0, scale: o.s ?? 0.92, x: o.x ?? 0, y: o.y ?? 10 }, { opacity: 1, scale: 1, x: 0, y: 0, duration: 0.5, ease: o.ease ?? 'expo.out', immediateRender: false, transformOrigin: o.origin ?? '50% 50%' }, at);
    const bez = ([x1, y1], [x2, y2]) => { const dx = (x2 - x1) * 0.5; return [[x1, y1], [x1 + dx, y1], [x2 - dx, y2], [x2, y2]]; };
    const pt = (b, t) => { const u = 1 - t; return [0, 1].map((k) => u * u * u * b[0][k] + 3 * u * u * t * b[1][k] + 3 * u * t * t * b[2][k] + t * t * t * b[3][k]); };
    // 圆头线帽在长度为 0 时也会画出一个点：描之前整条藏起来
    const link = (a, b, o = {}) => {
      const c = bez(a, b);
      const p = K.svg('path', { d: `M${c[0]} C${c[1]} ${c[2]} ${c[3]}`, fill: 'none', stroke: o.color || '#c9d6f5', 'stroke-width': o.width ?? 2.4, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1, opacity: 0 }, svg);
      return { p, c };
    };
    const drawL = (l, at, dur = 0.5) => { tl.set(l.p, { opacity: 1 }, at); tl.to(l.p, { strokeDashoffset: 0, duration: dur, ease: 'power2.inOut' }, at); };
    // 一串光点顺着连线流过去：t0 到 t1 之间每 every 秒发一颗，每颗走 dur 秒
    const flow = (l, t0, t1, every = 1.1, dur = 0.9, color = '#4176e6', r = 6) => {
      const pts = [0.25, 0.5, 0.75, 1].map((k) => pt(l.c, k));
      for (let t = t0; t < t1; t += every) {
        const d = K.svg('circle', { r, fill: color, cx: l.c[0][0], cy: l.c[0][1], opacity: 0 }, svg);
        tl.set(d, { opacity: 1 }, t);
        tl.to(d, { keyframes: pts.map(([x, y]) => ({ attr: { cx: x, cy: y }, duration: dur / 4, ease: 'none' })) }, t);
        tl.set(d, { opacity: 0 }, t + dur);
      }
    };
    return { world, svg, cam, el, pop, bez, pt, link, drawL, flow };
  };

  // 应用图标（assets/app-icon.svg，和应用里的是同一份）。x、y 是左上角，size 是边长
  K.icon = (parent, x, y, size) => {
    const i = K.el('img', 'app-icon', parent);
    i.src = 'assets/app-icon.svg';
    K.css(i, { left: x, top: y, width: size, height: size });
    return i;
  };

  // 场景整体出现 / 离开
  K.show = (tl, node, at) => tl.set(node, { visibility: 'visible' }, at);
  K.hide = (tl, node, at) => tl.set(node, { visibility: 'hidden' }, at);
})();

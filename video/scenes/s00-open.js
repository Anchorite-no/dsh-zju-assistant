/* 开场：先亮产品和五个亮点。32 秒（16 小节）。白底。
   第 0 秒窗口从纵深转出来、图标和产品名顶上 → 窗口收进应用图标 →
   01 一次初始化：一张缩略的架构图，来源（按账号分组）→ 初始化（读取、整理、比对、关联）→ 生成的档案 → 推进图标，里面是校园事务的通知栏 →
   02 消息按人送达 → 面板变形成执行过程 → 03 问一句跑 7 个网站 → 「智云课堂」那一行展开成讲解窗口 → 04 没听懂的课重讲一遍 →
   讲解窗口收进技能里的「讲解」→ 05 技能和定时任务：一天里几个任务到点去查，有新的弹提醒 →
   收进图标，产品名和五个亮点 → 图标放大铺满成蓝色，接下一场。 */
SCENES.push({
  id: 'open', part: 1, bars: 16, noDrift: true,
  build(tl, T, node) {
    K.show(tl, node, T); K.hide(tl, node, T + 32.2);
    const s = K.screen(node, 'affairs', { id: 'open-window', states: ['chat-trace-7'] });
    const cam = s.cameraman;
    const AN = [1330, 560]; // 右边那块的中心
    const B = (i) => T + 4.0 + i * 5.2; // 第 i 个亮点开始的时刻

    // ---------- 第 0 秒：产品登场 ----------
    cam.set({ rect: K.WHOLE, w: 1000, anchor: AN });
    gsap.set(s.tilt, { rotationY: -34, rotationX: 20, z: -900, opacity: 0, scale: 0.4 });
    tl.to(s.tilt, { rotationY: -12, rotationX: 5, z: 0, opacity: 1, scale: 1, duration: 1.5, ease: 'expo.out' }, T + 0.05);
    OM.sfx('whoosh', T + 0.3, { gain: 0.3 });
    const ring = K.el('div', 'burst', node);
    K.css(ring, { left: AN[0], top: AN[1] });
    gsap.set(ring, { xPercent: -50, yPercent: -50, scale: 0, opacity: 0.9 });
    tl.to(ring, { scale: 14, opacity: 0, duration: 1.2, ease: 'power2.out' }, T + 0.05);
    const icon = K.icon(node, 116, 112, 104);
    icon.dataset.omId = 'open-icon';
    gsap.set(icon, { scale: 0, rotation: -14, transformOrigin: '50% 50%' });
    tl.to(icon, { scale: 1, rotation: 0, duration: 0.7, ease: OM.spring(0.25) }, T + 0.15);
    OM.sfx('pop', T + 0.3, { note: 5, gain: 0.3 });
    const kick = K.lines(node, '浙江大学 · 校园 AI 助手', 'cap-k', { position: 'absolute', left: '116px', top: '250px', fontSize: '26px' });
    const title = K.chars(node, '校园智能体', 'hero-t', null);
    title.dataset.omVar = 'product'; title.dataset.omId = 'open-title';
    const tag1 = K.chars(node, '把散在各处的校园信息', 'hero-s');
    const tag2 = K.chars(node, '串成{你自己的日常}', 'hero-s');
    K.css(tag2, { top: 568 });
    K.fadeUp(tl, kick, T + 0.25);
    K.rise(tl, title, T + 0.35, { dur: 0.8, stagger: 0.07 });
    K.rise(tl, tag1, T + 1.1, { stagger: 0.025 });
    K.rise(tl, tag2, T + 1.35, { stagger: 0.025 });
    K.sink(tl, title, T + 3.3, { stagger: 0.03 }); K.sink(tl, tag1, T + 3.3); K.sink(tl, tag2, T + 3.35);
    K.fadeOut(tl, kick, T + 3.3);
    tl.to(icon, { scale: 0.4, opacity: 0, duration: 0.4, ease: 'power2.in' }, T + 3.3);

    // 左上角一直留着产品名，下面五格进度
    const brand = K.el('div', 'open-brand', node, '<img src="assets/app-icon.svg"><b>校园智能体</b><span>浙江大学 · 校园 AI 助手</span>');
    gsap.set(brand, { opacity: 0, x: -14 });
    tl.to(brand, { opacity: 1, x: 0, duration: 0.5, ease: 'expo.out' }, T + 3.8);
    const prog = K.el('div', 'open-prog', node, '<i><b></b></i>'.repeat(5));
    gsap.set(prog, { opacity: 0 });
    tl.to(prog, { opacity: 1, duration: 0.4 }, T + 3.9);
    const fills = prog.querySelectorAll('b');
    gsap.set(fills, { scaleX: 0, transformOrigin: '0% 50%' });
    fills.forEach((b, i) => tl.to(b, { scaleX: 1, duration: 5.2, ease: 'none' }, B(i)));

    const beat = (i, kicker, title, body, size = 54) => {
      const c = K.caption(node, { kicker, title, body, size, x: 120, y: 330, width: 680, id: 'open-cap' + i });
      c.in(tl, B(i) + 0.35);
      c.out(tl, B(i) + 4.75);
      return c;
    };
    const ov = K.overlay(node);
    ov.style.zIndex = 0;
    // 第一个亮点的缩略架构图装在 MW 里，绕图标中心整体放大一点
    const MW = K.el('div', 'mini-wrap', node);
    gsap.set(MW, { scale: 1.14, transformOrigin: `${AN[0]}px ${AN[1]}px` });
    const AR = K.arch(MW, tl, { w: 1920, h: 1080 });   // 只借它的连线和光点，坐标就是舞台坐标
    AR.cam.set({ focus: [960, 540], zoom: 1, anchor: [960, 540] });
    const { link, drawL, flow } = AR;

    // ---------- 窗口收进应用图标 ----------
    tl.to(s.tilt, { rotationY: 0, rotationX: 0, scale: 0.12, opacity: 0, duration: 0.7, ease: 'expo.in' }, T + 3.3);
    OM.sfx('reverse', T + 4.0, { dur: 0.7, gain: 0.25 });
    const hub = K.icon(MW, AN[0] - 60, AN[1] - 60, 120);
    hub.dataset.omId = 'open-hub';
    gsap.set(hub, { scale: 0, transformOrigin: '50% 50%' });
    tl.to(hub, { scale: 1, duration: 0.6, ease: OM.spring(0.22) }, T + 3.9);
    OM.sfx('thud', T + 4.05, { gain: 0.35 });

    // ---------- 01 一次初始化：缩略的架构图 ----------
    beat(0, '01　一次初始化', '十几处来源，\n拼成一份档案', '教务、学在浙大、智云、学习通、PTA，<br>加上你选定的钉钉、微信群；整理、比对、<br>关联以后，按课程归好。');
    const parts = [];
    const GRP = [
      ['校园账号 · 一次登录', ['教务网', '学在浙大', '智云课堂'], 330],
      ['独立账号', ['学习通', 'PTA'], 480],
      ['本机聊天 · 只读选定的群', ['钉钉 3 群', '微信 2 群'], 590, true],
    ];
    GRP.forEach(([h, items, y, chat], i) => {
      const g = K.el('div', 'mini-grp' + (chat ? ' chat' : ''), MW, `<div class="gh">${h}</div>${items.map((t) => `<i>${t}</i>`).join('')}`);
      K.css(g, { left: 830, top: y });
      gsap.set(g, { opacity: 0, x: -24 });
      tl.to(g, { opacity: 1, x: 0, duration: 0.5, ease: 'expo.out' }, T + 4.3 + i * 0.14);
      const l = link([1080, y + (i ? 45 : 60)], [AN[0] - 62, AN[1] - 20 + i * 20], { color: chat ? '#4176e6' : '#c9d6f5', width: chat ? 3 : 2.2 });
      drawL(l, T + 4.8 + i * 0.1, 0.45);
      flow(l, T + 5.2 + i * 0.25, T + 8.6, chat ? 0.6 : 0.9, 0.6, chat ? '#2f5fcc' : '#8fb0f2', 5);
      parts.push(g, l.p);
    });
    OM.sfx('slide', T + 4.3, { dur: 0.6, gain: 0.2 });
    const hubL = K.el('div', 'mini-label', MW, '初始化');
    K.css(hubL, { left: AN[0], top: AN[1] + 70 });
    const steps = K.el('div', 'mini-steps', MW, ['读取', '整理', '比对', '关联'].map((t) => `<i>${t}</i>`).join(''));
    K.css(steps, { left: AN[0], top: AN[1] + 98 });
    gsap.set([hubL, steps], { xPercent: -50, opacity: 0 });
    tl.to([hubL, steps], { opacity: 1, duration: 0.4 }, T + 5.0);
    const stepI = steps.querySelectorAll('i');
    gsap.set(stepI, { opacity: 0.3 });
    stepI.forEach((e, j) => { tl.to(e, { opacity: 1, duration: 0.15 }, T + 5.3 + j * 0.3); OM.sfx('tick', T + 5.3 + j * 0.3, { note: j + 2, gain: 0.25 }); });
    parts.push(hubL, steps);
    const outL = K.el('div', 'mini-label', MW, '生成的档案 · Markdown');
    K.css(outL, { left: 1480, top: 352 });
    gsap.set(outL, { opacity: 0 });
    tl.to(outL, { opacity: 1, duration: 0.4 }, T + 6.1);
    parts.push(outL);
    const OUT = [['个人资料', '00-个人资料.md'], ['课程 · 9 门', '01-课程.md'], ['平台入口', '02-平台入口.md'], ['事项', '03-事项.md']];
    OUT.forEach(([b, f], i) => {
      const y = 385 + i * 72;
      const o = K.el('div', 'mini-out', MW, `<b>${b}</b><span>${f}</span>`);
      K.css(o, { left: 1480, top: y });
      gsap.set(o, { opacity: 0, x: -16 });
      tl.to(o, { opacity: 1, x: 0, duration: 0.45, ease: 'expo.out' }, T + 6.3 + i * 0.12);
      const l = link([AN[0] + 62, AN[1]], [1480, y + 27], { color: '#4176e6', width: 2.4 });
      drawL(l, T + 6.1 + i * 0.12, 0.35);
      flow(l, T + 6.6 + i * 0.15, T + 8.6, 0.8, 0.45, '#2f5fcc', 5);
      parts.push(o, l.p);
    });
    // 课程那一支再长出几门课
    ['大学物理', '数据结构', '…'].forEach((t, j) => {
      const c = K.el('div', 'mini-steps', MW, `<i style="background:#fff;box-shadow:0 0 0 1px #e1e5ee;color:#0f1115;font-size:14px">${t}</i>`);
      K.css(c, { left: 1730, top: 430 + j * 36 });
      gsap.set(c, { opacity: 0, x: -10 });
      tl.to(c, { opacity: 1, x: 0, duration: 0.35, ease: 'expo.out' }, T + 6.9 + j * 0.1);
      const l = link([1700, 484], [1730, 444 + j * 36], { color: '#b7c8fe', width: 1.6 });
      drawL(l, T + 6.8 + j * 0.1, 0.25);
      parts.push(c, l.p);
    });
    OM.sfx('pop', T + 6.35, { note: 3, gain: 0.28 }); OM.sfx('pop', T + 6.9, { note: 5, gain: 0.25 });
    const cnt = K.el('div', 'open-count', MW, '<span><b>9</b>门课</span><span><b>6</b>个平台入口</span><span><b>5</b>个群</span>');
    K.css(cnt, { left: AN[0], top: 760 });
    gsap.set(cnt, { xPercent: -50 });
    gsap.set(cnt.children, { opacity: 0, y: 12 });
    tl.to(cnt.children, { opacity: 1, y: 0, duration: 0.5, ease: 'expo.out', stagger: 0.1 }, T + 7.3);
    parts.push(cnt);
    tl.fromTo(hub, { boxShadow: '0 0 0 0 rgba(65,118,230,.45)' }, { boxShadow: '0 0 0 22px rgba(65,118,230,0)', duration: 0.7, repeat: 2, ease: 'power1.out', immediateRender: false }, T + 5.4);

    // ---------- 推进图标，里面是校园事务的通知栏 ----------
    tl.to(parts, { opacity: 0, duration: 0.3 }, B(1) - 0.6);
    tl.to(hub, { scale: 7, opacity: 0, duration: 0.6, ease: 'expo.in' }, B(1) - 0.5);
    const F = { x: 904, y: 120, w: 526, h: 660 };
    s.clipTo(tl, B(1) - 0.5, F, 0.01, 16);
    cam.to(tl, B(1) - 0.5, { rect: F, h: 800, anchor: AN, duration: 0.01, noDrift: true });
    tl.set(s.tilt, { transformOrigin: `${F.x + F.w / 2}px ${F.y + F.h / 2}px` }, B(1) - 0.5);
    tl.fromTo(s.tilt, { scale: 0.2, opacity: 0 }, { scale: 1, opacity: 1, duration: 0.7, ease: 'expo.out', immediateRender: false }, B(1) - 0.1);
    OM.sfx('whoosh', B(1) - 0.1, { gain: 0.35 });

    // ---------- 02 消息按人送达 ----------
    beat(1, '02　消息按人送达', '学校和群里的消息，\n只留和你有关的', '学院、年级、校区对不上的自动收起；<br>实测一周 56 条通知，留下 23 条，用时 20 秒。');
    for (let j = 0; j < 7; j++) {
      const r = s.r(`notice[${j}]`, 'affairs');
      const b = K.bar(s, K.pad(r, -4, -3));
      const at = B(1) + 1.1 + j * 0.15;
      tl.to(b, { opacity: 1, duration: 0.12 }, at).to(b, { opacity: 0, duration: 0.4 }, at + 0.5);
    }
    OM.sfx('slide', B(1) + 1.1, { dur: 1.0, gain: 0.22 });
    const fold = K.ring(s, K.pad(s.r('feed.folded', 'affairs'), 8, 7), { radius: 8, width: 3 });
    K.draw(tl, fold, B(1) + 2.4, 0.5); OM.sfx('draw', B(1) + 2.4, { dur: 0.5, gain: 0.3 });
    const fr = s.r('feed.folded', 'affairs'), [fx, fy] = cam.toStage(F.x, fr.y + fr.h / 2);
    const lFold = K.label(node, '6 条和你关系不大，已收起', { cls: 'blue', x: fx - 24, y: fy, origin: '100% 50%' });
    gsap.set(lFold, { xPercent: -100, yPercent: -50 });
    K.pop(tl, lFold, B(1) + 2.8); OM.sfx('ding', B(1) + 2.8, { note: 3, gain: 0.3 });
    K.fadeOut(tl, lFold, B(1) + 4.7, { y: 0 });
    K.undraw(tl, fold, B(1) + 4.7);

    // ---------- 面板变形成执行过程 ----------
    const PANE = { x: 1181, y: 96, w: 419, h: 690 };
    s.clipTo(tl, B(2) - 0.2, PANE, 0.8, 16);
    cam.to(tl, B(2) - 0.2, { rect: PANE, zoom: 1.18, anchor: AN, duration: 0.8, noDrift: true });
    s.swap(tl, B(2) + 0.1, 'chat-trace-7');
    OM.sfx('whip', B(2) - 0.1, { gain: 0.3 });
    cam.to(tl, B(2) + 0.7, { rect: PANE, zoom: 1.24, anchor: AN, duration: 4.0, ease: 'sine.inOut', noDrift: true });

    // ---------- 03 问一句 ----------
    beat(2, '03　问一句', '问一句，它去 7 个网站\n把事情找齐', '学在浙大、教务网、钉钉群、智云录播……<br>13 步，每一步去了哪、拿到什么，都能点开。', 50);
    [2, 3, 4, 5, 6, 8, 9, 10].forEach((k, j) => {
      const r = s.r(`trace.site[${k}]`, 'chat-trace-7');
      const b = K.bar(s, { x: 1183, y: r.y, w: 413, h: r.h });
      const at = B(2) + 0.9 + j * 0.38;
      tl.to(b, { opacity: 1, duration: 0.15 }, at).to(b, { opacity: 0, duration: 0.5 }, at + 0.8);
      OM.sfx('tick', at, { note: (j % 6) + 1, gain: 0.2, pan: 0.3 });
    });

    // ---------- 「智云课堂」那一行展开成讲解窗口 ----------
    const row = s.r('trace.site[6]', 'chat-trace-7');
    const rowBox = { x: 1181, y: row.y, w: 419, h: row.h };
    const rgRow = K.ring(s, rowBox, { radius: 6, width: 3 });
    K.draw(tl, rgRow, B(3) - 0.7, 0.35); OM.sfx('click', B(3) - 0.4, { gain: 0.5 });
    // 讲解窗口落定后：中心在 AN，缩放 WS；把那一行在舞台上的框换算到窗口自己的坐标里，用裁切从这个框长开
    const WS = 0.58, WX = AN[0] - 800 * WS, WY = AN[1] - 500 * WS;
    const [r0x, r0y] = cam.toStage(rowBox.x, rowBox.y), [r1x, r1y] = cam.toStage(rowBox.x + rowBox.w, rowBox.y + rowBox.h);
    const loc = (sx, sy) => [(sx - WX) / WS, (sy - WY) / WS];
    const [a0, b0] = loc(r0x, r0y), [a1, b1] = loc(r1x, r1y);
    const win = K.el('div', 'film-win', node);
    win.dataset.omId = 'open-film';
    const still = K.el('img', 'film-still', win);
    still.src = 'assets/lesson/zig-f9.png';
    // lesson-zig60.mp4 从讲解的 1106.5 秒录起（60 帧）；原速放 f9 这一句：再转一次就平了，前后转两次，所以叫双旋
    const v = K.el('video', null, win);
    v.id = 'v-open-zig'; v.muted = true; v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
    v.src = 'assets/clips/lesson-zig60.mp4'; v.dataset.start = (B(3) - 0.2).toFixed(3); v.dataset.duration = (5.2).toFixed(3);
    v.dataset.mediaStart = (1155.4 - 1106.5).toFixed(2); v.dataset.playbackRate = 1; v.dataset.trackIndex = 2;
    gsap.set(win, { x: AN[0] - 960, y: AN[1] - 540, scale: WS, opacity: 0, transformOrigin: '50% 50%' });
    gsap.set(win, { clipPath: `inset(${b0}px ${1600 - a1}px ${1000 - b1}px ${a0}px round 8px)` });
    tl.set(win, { opacity: 1 }, B(3) - 0.4);
    tl.to(win, { clipPath: 'inset(0px 0px 0px 0px round 14px)', duration: 0.8, ease: 'expo.inOut' }, B(3) - 0.4);
    tl.to(s.tilt, { opacity: 0, duration: 0.5, ease: 'power2.in' }, B(3) - 0.3);
    OM.sfx('whoosh', B(3) - 0.2, { gain: 0.3 });

    // ---------- 04 没听懂的课 ----------
    beat(3, '04　学习', '没听懂的课，\n做成带动画的讲解', '先学懂课件和录播，再从你会的地方讲起；<br>例题里的每个数，都先用代码算过。');
    const lFilm = K.label(node, '应用自己做的讲解 · 这一集 32 分钟、九幕', { cls: 'light', x: AN[0], y: 868, origin: '50% 0%' });
    gsap.set(lFilm, { xPercent: -50 });
    K.pop(tl, lFilm, B(3) + 1.4);
    K.fadeOut(tl, lFilm, B(3) + 4.6, { y: 0 });

    // ---------- 讲解窗口收进技能里的「讲解」 ----------
    const SK = ['选课', '课程学习', '考前复习', '我的一周', '写技能', '讲解'];
    const SKX = (j) => 845 + j * 164, SKY = 268;
    tl.to(win, { x: SKX(5) + 75 - 960, y: SKY + 26 - 540, scale: 0.06, opacity: 0, duration: 0.6, ease: 'expo.in' }, B(4) - 0.5);
    const skLab = K.el('div', 'mini-label', node, '技能 · 一件事从头办到尾，交给你一样东西');
    K.css(skLab, { left: 845, top: 228 });
    gsap.set(skLab, { opacity: 0 });
    tl.to(skLab, { opacity: 1, duration: 0.4 }, B(4) + 0.2);
    const skEls = SK.map((t, j) => {
      const c = K.el('div', 'skill-chip' + (j === 5 ? ' hot' : ''), node, t);
      K.css(c, { left: SKX(j), top: SKY, width: 150, textAlign: 'center', padding: 0 });
      gsap.set(c, { opacity: 0, scale: 0.8, transformOrigin: '50% 50%' });
      tl.to(c, { opacity: 1, scale: 1, duration: 0.45, ease: OM.spring(0.2) }, j === 5 ? B(4) - 0.1 : B(4) + 0.1 + j * 0.07);
      return c;
    });
    OM.sfx('pop', B(4) - 0.05, { note: 5, gain: 0.3 });

    // ---------- 05 技能和定时任务：一天里几个任务到点去查 ----------
    beat(4, '05　技能和定时任务', '一件事从头办到尾，\n到点自己去查', '选课、复习、排一周……一句话起一个技能；<br>今日安排、作业快截止、CC98 新消息，<br>定时去查，有新的才提醒你。', 50);
    const dl = K.el('div', 'mini-label', node, '定时任务 · 一天里');
    K.css(dl, { left: 845, top: 382 });
    const X0 = 900, X1 = 1800, hx = (h) => X0 + (h / 24) * (X1 - X0), AY = 470, LY = 545;
    const axis = K.el('div', 'day-axis', node);
    K.css(axis, { left: X0, top: AY, width: X1 - X0 });
    gsap.set([dl, axis], { opacity: 0 });
    tl.to([dl, axis], { opacity: 1, duration: 0.4 }, B(4) + 0.3);
    gsap.set(axis, { scaleX: 0, transformOrigin: '0% 50%' });
    tl.to(axis, { scaleX: 1, duration: 0.6, ease: 'expo.out' }, B(4) + 0.3);
    const dayEls = [dl, axis, skLab, ...skEls];
    [0, 6, 12, 18, 24].forEach((h) => {
      const t = K.el('div', 'day-tick', node, `${h}:00`);
      K.css(t, { left: hx(h), top: AY + 12 });
      gsap.set(t, { xPercent: -50, opacity: 0 });
      tl.to(t, { opacity: 1, duration: 0.3 }, B(4) + 0.5);
      dayEls.push(t);
    });
    const DAILY = [[7.5, '今日安排', '每天 7:30'], [12.08, '场馆空场', '每天 12:05'], [21, '作业快截止', '每天 21:00']];
    DAILY.forEach(([h, n, w], j) => {
      const m = K.el('div', 'day-mark', node);
      K.css(m, { left: hx(h) - 7, top: AY - 7 });
      const nm = K.el('div', 'day-name', node, `${n}<small>${w}</small>`);
      K.css(nm, { left: hx(h), top: AY - 66 });
      gsap.set(nm, { xPercent: -50 });
      gsap.set([m, nm], { opacity: 0, y: 6 });
      tl.to([m, nm], { opacity: 1, y: 0, duration: 0.35, ease: 'expo.out' }, B(4) + 0.6 + j * 0.1);
      dayEls.push(m, nm);
    });
    const lane = K.el('div', 'day-lane', node, '每 30 分钟 · CC98 新消息');
    K.css(lane, { left: X0, top: LY + 14 });
    gsap.set(lane, { opacity: 0 });
    tl.to(lane, { opacity: 1, duration: 0.3 }, B(4) + 0.8);
    dayEls.push(lane);
    for (let h = 0; h <= 24; h += 0.5) {
      const d = K.el('div', 'day-mark small', node);
      K.css(d, { left: hx(h) - 3, top: LY - 3, width: 6, height: 6 });
      gsap.set(d, { opacity: 0 });
      tl.to(d, { opacity: 1, duration: 0.2 }, B(4) + 0.8 + h * 0.02);
      dayEls.push(d);
    }
    // 一根竖线走过一天，到点的任务弹出提醒（托盘那样的卡片），越往后越在上面
    const ph = K.el('div', 'day-head', node);
    K.css(ph, { left: hx(6), top: AY - 90, height: 170 });
    gsap.set(ph, { opacity: 0 });
    tl.set(ph, { opacity: 1 }, B(4) + 1.1);
    const P0 = B(4) + 1.1, P1 = B(4) + 4.3, at = (h) => P0 + ((h - 6) / 16) * (P1 - P0);
    tl.fromTo(ph, { x: 0 }, { x: hx(22) - hx(6), duration: P1 - P0, ease: 'none', immediateRender: false }, P0);
    dayEls.push(ph);
    const TOAST = [
      [7.5, '今日安排', '上午大学物理 · HW4 今天 23:59 截止', '7:30'],
      [13.5, 'CC98 新消息', '有人回复了你的帖子《大二数据结构怎么准备期中》', '13:30'],
      [21, '作业快截止', '4 项，最近的 HW4 今天 23:59', '21:00'],
    ];
    TOAST.forEach(([h, t, d, w], j) => {
      const e = K.el('div', 'toast', node, `<img src="assets/app-icon.svg"><b>${t}</b><span>${d}</span><em>${w}</em>`);
      K.css(e, { left: 1380, top: 860 - j * 96 });
      gsap.set(e, { opacity: 0, x: 40 });
      tl.to(e, { opacity: 1, x: 0, duration: 0.45, ease: 'expo.out' }, at(h));
      OM.sfx('ding', at(h), { note: 3 + j, gain: 0.28 });
      dayEls.push(e);
    });

    // ---------- 收：产品名和五个亮点 ----------
    tl.to([brand, prog], { opacity: 0, duration: 0.3 }, T + 29.6);
    tl.to(dayEls, { opacity: 0, scale: 0.9, duration: 0.35, ease: 'power2.in', stagger: 0.004 }, T + 29.7);
    const endIcon = K.icon(node, 900, 200, 120);
    gsap.set(endIcon, { scale: 0, transformOrigin: '50% 50%' });
    tl.to(endIcon, { scale: 1, duration: 0.6, ease: OM.spring(0.25) }, T + 30.0);
    OM.sfx('chime', T + 30.05, { gain: 0.32 });
    const end = K.chars(node, '校园智能体', 'kt dark', { top: '350px', fontSize: '120px' });
    end.dataset.omId = 'open-end';
    K.rise(tl, end, T + 30.05, { stagger: 0.05 });
    const chips = K.el('div', 'open-chips', node, ['一次初始化，全部接上', '消息按人送达', '问一句跑遍 7 个网站', '没听懂的课重讲一遍', '技能和定时任务'].map((t, i) => `<span><b>0${i + 1}</b>${t}</span>`).join(''));
    gsap.set(chips.children, { opacity: 0, y: 16 });
    tl.to(chips.children, { opacity: 1, y: 0, duration: 0.45, ease: 'expo.out', stagger: 0.07 }, T + 30.3);
    // 图标放大铺满成品牌蓝，下一场就在这片蓝上开始
    K.sink(tl, end, T + 31.25, { stagger: 0.02 });
    tl.to(chips.children, { opacity: 0, y: -12, duration: 0.25, stagger: 0.02 }, T + 31.25);
    tl.to(endIcon, { scale: 26, duration: 0.75, ease: 'expo.in' }, T + 31.25);
    OM.sfx('reverse', T + 32.0, { dur: 0.75, gain: 0.3 });
  },
});

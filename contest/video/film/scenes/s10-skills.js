/* 插件、技能和定时任务。40 秒（20 小节）。上一场光标停在侧栏「插件」上。
   插件四组 → 往下到技能：自带的几个各交给你一样东西 → 助手学到的三张 → 「自动化任务」那一行展开成一天的时间轴：
   七个常用定时任务（core/zju/references/schedule.md「常用的几种」）各自到点去查，有新的弹提醒、没有就不打扰 →
   收进日程表真实的「定时任务」页签（五个任务）→ 今天早上 7:30 到点跑过的那段对话：排好的今天一页，最后一步在托盘上提醒 → 光标去「日程表」。 */
SCENES.push({
  id: 'skills', part: 2, bars: 20,
  build(tl, T, node) {
    const A = APP, cam = A.cameraman, cur = A.cursor;
    K.show(tl, A.node, T); K.show(tl, node, T); K.hide(tl, node, T + 40.5);

    // ---- 插件：四组 ----
    cur.click(tl, T + 0.2);
    A.page(tl, T + 0.2, 'plugins');
    const PAGE = { x: 440, y: 52, w: 1000, h: 948 };
    A.clipTo(tl, T + 0.7, PAGE, 1.0, 16);
    cam.to(tl, T + 0.7, { rect: { x: 440, y: 110, w: 1000, h: 860 }, zoom: 1.05, anchor: [1340, 560], duration: 1.0 });
    cur.move(tl, T + 0.5, 600, 980, 0.8);
    cur.hide(tl, T + 1.1);
    const c1 = K.caption(node, { kicker: '插件', title: '学校的十几个系统，\n按用途接进来', size: 50, x: 120, y: 300, width: 600, id: 'skill-cap1',
      body: '课程与学习、消息与资讯、<br>校园生活、基础能力。<br>账号只存在你自己的电脑上。' });
    c1.in(tl, T + 1.2);
    for (let g = 0; g < 4; g++) {
      const r = A.r(`group[${g}]`, 'plugins');
      const b = K.bar(A, K.pad(r, 6, 6), { radius: 12 });
      const at = T + 2.0 + g * 0.45;
      tl.to(b, { opacity: 1, duration: 0.2 }, at).to(b, { opacity: 0, duration: 0.5 }, at + 0.7);
      OM.sfx('tick', at, { note: g + 2, gain: 0.3 });
    }
    // 往下滚到技能（换图的同一帧，镜头反向补 396 像素）
    const SC = 396;
    cam.to(tl, T + 4.0, { focus: [940, 760], zoom: 1.05, duration: 1.0, ease: 'sine.in' });
    A.swap(tl, T + 5.0, 'skills');
    cam.to(tl, T + 5.0, { focus: [940, 760 - SC], zoom: 1.05, duration: 0.001, ease: 'none' });
    cam.to(tl, T + 5.001, { focus: [940, 690], zoom: 1.05, duration: 1.2, ease: 'sine.out' });
    c1.out(tl, T + 5.0);

    // ---- 技能：一件事从头办到尾，交给你一样东西 ----
    const c2 = K.caption(node, { kicker: '技能', title: '一件事，\n从头办到尾', size: 60, x: 120, y: 300, width: 600, id: 'skill-cap2',
      body: '每个技能先读你的档案，<br>跨几个系统一步步做完，<br>最后交给你一样东西。' });
    c2.in(tl, T + 5.6);
    const GIVE = [[13, '一份选课方案：首选和备选'], [14, '一份课后总结，标出作业和考点'], [15, '一份到考试那天的复习计划'], [17, '一页这周的课、截止和考试']];
    GIVE.forEach(([i, give], j) => {
      const r = A.r(`skill[${i}]`, 'skills');
      const p = K.lift(A, K.pad(r, 0, 0), 'skills');
      const at = T + 6.8 + j * 1.1;
      K.raise(tl, p, at, { scale: 1.05, y: -6 });
      OM.sfx('thud', at + 0.2, { gain: 0.3, pan: j * 0.25 - 0.4 });
      const [lx, ly] = cam.toStage(r.x + r.w / 2, r.y + r.h + 6);
      const l = K.label(node, `交给你：${give}`, { cls: 'blue', x: lx, y: ly + 4, origin: '50% 0%' });
      gsap.set(l, { xPercent: -50 });
      K.pop(tl, l, at + 0.25);
      K.fadeOut(tl, l, at + 1.05, { y: 0, dur: 0.2 });
      K.lower(tl, p, at + 1.05);
    });
    c2.out(tl, T + 11.4);
    // 助手学到的三张
    const c3 = K.caption(node, { kicker: '写技能', title: '走通的做法，\n存成新技能', size: 60, x: 120, y: 300, width: 560, id: 'skill-cap3',
      body: '下面三张是助手在对话里学到的：<br>期中复习计划、比较选课老师、<br>每周一早上的本周提要。' });
    c3.in(tl, T + 11.8);
    [19, 20, 21].forEach((i, j) => {
      const p = K.lift(A, K.pad(A.r(`skill[${i}]`, 'skills'), 0, 0), 'skills');
      K.raise(tl, p, T + 12.6 + j * 0.35, { scale: 1.05, y: -6 });
      OM.sfx('pop', T + 12.8 + j * 0.35, { note: j + 3, gain: 0.3 });
      K.lower(tl, p, T + 15.4);
    });
    c3.out(tl, T + 15.4);

    // ---- 「自动化任务」那一行展开成一天的时间轴 ----
    const row = A.r('skill[9]', 'skills');
    const rg = K.ring(A, K.pad(row, 3, 3), { radius: 10, width: 3 });
    K.draw(tl, rg, T + 15.4, 0.45); OM.sfx('draw', T + 15.4, { dur: 0.45, gain: 0.3 });
    K.undraw(tl, rg, T + 16.5);
    const [r0x, r0y] = cam.toStage(row.x, row.y), [r1x, r1y] = cam.toStage(row.x + row.w, row.y + row.h);
    const panel = K.el('div', 'tasks-panel', node);
    panel.dataset.omId = 'tasks-panel';
    gsap.set(panel, { clipPath: `inset(${r0y}px ${1920 - r1x}px ${1080 - r1y}px ${r0x}px round 12px)`, opacity: 0 });
    tl.set(panel, { opacity: 1 }, T + 16.0);
    tl.to(panel, { clipPath: 'inset(0px 0px 0px 0px round 0px)', duration: 0.9, ease: 'expo.inOut' }, T + 16.0);
    tl.to(A.tilt, { opacity: 0, duration: 0.4 }, T + 16.6);
    OM.sfx('whoosh', T + 16.2, { gain: 0.35 });
    const hk = K.el('div', 'cap-k', panel, '定时任务');
    K.css(hk, { position: 'absolute', left: '120px', top: '56px' });
    const ht = K.chars(panel, '到点它自己去查，{有新的才提醒你}', 'arch-title', { position: 'absolute', left: '120px', top: '96px' });
    gsap.set(hk, { opacity: 0 });
    tl.to(hk, { opacity: 1, duration: 0.4 }, T + 16.8);
    K.rise(tl, ht, T + 16.9, { stagger: 0.025 });
    const legend = K.el('div', 'tasks-legend', panel, '<span><i class="hit"></i>查到新的：弹出提醒</span><span><i></i>没有新的：不打扰</span><span>说一句话就能建，在日程表的「定时任务」里看、改、删</span>');
    gsap.set(legend, { opacity: 0 });
    tl.to(legend, { opacity: 1, duration: 0.4 }, T + 17.6);
    // 一天的时间轴：七个任务一行一个
    const X0 = 560, X1 = 1800, hx = (h) => X0 + (h / 24) * (X1 - X0), Y0 = 250, LH = 78;
    const ticks = K.el('div', 'tasks-ticks', panel);
    [0, 3, 6, 9, 12, 15, 18, 21, 24].forEach((h) => {
      const t = K.el('div', 'day-tick', ticks, `${h}:00`);
      K.css(t, { left: hx(h), top: Y0 - 34 });
      gsap.set(t, { xPercent: -50 });
    });
    gsap.set(ticks, { opacity: 0 });
    tl.to(ticks, { opacity: 1, duration: 0.4 }, T + 17.2);
    const TASKS = [
      ['今日安排', '每天 7:30', [7.5], { 7.5: ['今日安排', '上午大学物理 · HW4 今天 23:59 截止 · 周六大物期中'] }],
      ['场馆空场', '每天 12:05 · 只查不约', [12.08], {}],
      ['作业快截止', '每天 21:00', [21], { 21: ['作业快截止', '4 项，最近的是数据结构 HW4，今天 23:59'] }],
      ['下周一览', '每周日 20:00', [], {}, '今天周三，周日再跑'],
      ['成绩出了', '每 2 小时', [0, 2, 4, 6, 8, 10, 12, 14, 16, 18, 20, 22], {}],
      ['CC98 新消息', '每 30 分钟', [...Array(48).keys()].map((k) => k / 2), { 13.5: ['CC98 新消息', '有人回复了你的帖子《大二数据结构怎么准备期中》'] }],
      ['盯教学班余量', '每 10 分钟 · 只查不选', [...Array(144).keys()].map((k) => k / 6), {}],
    ];
    const P0 = T + 19.0, P1 = T + 27.5, H0 = 5, H1 = 23.5, atH = (h) => P0 + ((h - H0) / (H1 - H0)) * (P1 - P0);
    const toasts = [];
    TASKS.forEach(([name, when, hours, hits, note], i) => {
      const y = Y0 + i * LH;
      const lab = K.el('div', 'tasks-name', panel, `<b>${name}</b><span>${when}</span>`);
      K.css(lab, { left: 120, top: y - 4 });
      const ln = K.el('div', 'tasks-line', panel);
      K.css(ln, { left: X0, top: y + 20, width: X1 - X0 });
      gsap.set([lab, ln], { opacity: 0, x: -14 });
      tl.to([lab, ln], { opacity: 1, x: 0, duration: 0.4, ease: 'expo.out' }, T + 17.3 + i * 0.1);
      if (note) {
        const n = K.el('div', 'tasks-note', panel, note);
        K.css(n, { left: X0 + 8, top: y + 6 });
        gsap.set(n, { opacity: 0 });
        tl.to(n, { opacity: 1, duration: 0.3 }, T + 17.6 + i * 0.1);
      }
      const dense = hours.length > 30;
      hours.forEach((h) => {
        const d = K.el('div', 'tasks-dot' + (dense ? ' tiny' : ''), panel);
        K.css(d, { left: hx(h), top: y + 20 });
        gsap.set(d, { opacity: 0 });
        tl.to(d, { opacity: 1, duration: 0.2 }, T + 17.5 + i * 0.1 + (h / 24) * 0.4);
        // 竖线走到这里时闪一下：查到新的变蓝、放大；没有新的只闪灰
        if (h >= H0 && h <= H1) {
          const at = atH(h);
          if (hits[h]) {
            tl.to(d, { backgroundColor: '#4176e6', scale: 2.2, duration: 0.2, ease: 'back.out(3)' }, at);
            toasts.push([at, hits[h]]);
          } else if (!dense || Math.round(h * 6) % 6 === 0) {
            tl.fromTo(d, { scale: 1 }, { scale: 1.8, duration: 0.12, yoyo: true, repeat: 1, immediateRender: false }, at);
          }
        }
      });
    });
    const ph = K.el('div', 'day-head', panel);
    K.css(ph, { left: hx(H0), top: Y0 - 40, height: TASKS.length * LH + 30 });
    const clock = K.el('div', 'tasks-clock', panel, '5:00');
    K.css(clock, { left: hx(H0), top: Y0 - 70 });
    gsap.set(clock, { xPercent: -50 });
    gsap.set([ph, clock], { opacity: 0 });
    tl.to([ph, clock], { opacity: 1, duration: 0.3 }, P0 - 0.3);
    tl.fromTo([ph, clock], { x: 0 }, { x: hx(H1) - hx(H0), duration: P1 - P0, ease: 'none', immediateRender: false }, P0);
    // 时钟上的字跟着走（按半小时取整）
    for (let h = H0; h <= H1; h += 0.5) tl.set(clock, { innerText: `${Math.floor(h)}:${h % 1 ? '30' : '00'}` }, atH(h));
    OM.sfx('slide', P0, { dur: P1 - P0, gain: 0.08 });
    // 弹出的提醒：托盘那样的卡片，排在下面一行
    toasts.forEach(([at, [t, d]], j) => {
      const e = K.el('div', 'toast', panel, `<img src="assets/brand/app-icon.svg"><b>${t}</b><span>${d}</span>`);
      K.css(e, { left: 120 + j * 600, top: 860, width: 560 });
      gsap.set(e, { opacity: 0, y: 30 });
      tl.to(e, { opacity: 1, y: 0, duration: 0.5, ease: OM.spring(0.15) }, at + 0.05);
      OM.sfx('ding', at + 0.05, { note: 3 + j, gain: 0.32 });
    });

    // ---- 收进日程表真实的「定时任务」页签：五个任务 ----
    A.swap(tl, T + 28.0, 'schedule-tasks');
    A.clipTo(tl, T + 28.0, K.WHOLE, 0.01, 14);
    const TAB = A.r('tasks.tab[1]', 'schedule-tasks');
    cam.to(tl, T + 28.0, { rect: K.WHOLE, w: 1560, anchor: [960, 548], duration: 0.01, noDrift: true });
    const [tx0, ty0] = cam.toStage(TAB.x, TAB.y), [tx1, ty1] = cam.toStage(TAB.x + TAB.w, TAB.y + TAB.h);
    tl.to(panel, { clipPath: `inset(${ty0}px ${1920 - tx1}px ${1080 - ty1}px ${tx0}px round 8px)`, duration: 0.9, ease: 'expo.inOut' }, T + 28.1);
    tl.to(A.tilt, { opacity: 1, duration: 0.5 }, T + 28.4);
    tl.set(panel, { opacity: 0 }, T + 29.0);
    OM.sfx('reverse', T + 28.9, { dur: 0.8, gain: 0.3 });
    const LIST = K.pad(A.r('tasks.list', 'schedule-tasks'), 12, 40);
    A.clipTo(tl, T + 29.3, { x: 440, y: 40, w: 1000, h: 560 }, 1.0, 16);
    cam.to(tl, T + 29.3, { rect: LIST, zoom: 1.28, anchor: [1340, 540], duration: 1.0 });
    const c4 = K.caption(node, { kicker: '定时任务', title: '说一句话就建好，\n到点它自己去查', size: 54, x: 120, y: 300, width: 600, id: 'skill-cap4',
      body: '盯余量、查成绩、作业快截止、<br>今日安排、下周一览……<br>都在日程表的「定时任务」里看、改、删。' });
    c4.in(tl, T + 29.8);
    const taskRings = [0, 1, 2, 3, 4].map((i, j) => {
      const r = A.r(`task.row[${i}]`, 'schedule-tasks');
      const b = K.bar(A, K.pad(r, -2, -3));
      const at = T + 30.6 + j * 0.3;
      tl.to(b, { opacity: 1, duration: 0.15 }, at).to(b, { opacity: 0, duration: 0.5 }, at + 0.8);
      OM.sfx('tick', at, { note: j + 2, gain: 0.3 });
      return b;
    });
    c4.out(tl, T + 33.6);

    // ---- 今天早上 7:30 它跑过一次：真实的那段对话 ----
    const WHEN = K.el('div', 'flip-when', node, '<span>今天</span><b>07:30</b>');
    gsap.set(WHEN, { opacity: 0, scale: 0.9 });
    tl.to(WHEN, { opacity: 1, scale: 1, duration: 0.45, ease: 'expo.out' }, T + 33.6);
    tl.to(WHEN, { opacity: 0, scale: 1.05, duration: 0.3, ease: 'power2.in' }, T + 34.6);
    OM.sfx('whip', T + 33.7, { gain: 0.3 });
    A.swap(tl, T + 34.2, 'schedule-reminder', 0.3);
    A.clipTo(tl, T + 34.2, { x: 360, y: 40, w: 1240, h: 960 }, 0.01, 16);
    const TRIG = { x: 386, y: 133, w: 680, h: 37 };
    cam.to(tl, T + 34.2, { rect: { x: 370, y: 120, w: 1230, h: 560 }, w: 1560, anchor: [1030, 560], duration: 0.8 });
    const rgTrig = K.ring(A, K.pad(TRIG, 4, 4), { radius: 10, width: 3 });
    K.draw(tl, rgTrig, T + 35.0, 0.4); OM.sfx('draw', T + 35.0, { dur: 0.4, gain: 0.3 });
    const [gx, gy] = cam.toStage(TRIG.x, TRIG.y + TRIG.h + 6);
    const lTrig = K.label(node, '到点自己开工：读课表、作业、考试、新通知和群消息，排成今天一页', { cls: 'blue', x: gx, y: gy + 4, origin: '0% 0%' });
    K.pop(tl, lTrig, T + 35.3); OM.sfx('pop', T + 35.3, { note: 4, gain: 0.3 });
    const ROWT = A.r('trace.row[7]', 'schedule-reminder');
    const rgT = K.ring(A, K.pad(ROWT, -2, 0), { radius: 8, width: 3, color: '#f0700f' });
    K.draw(tl, rgT, T + 36.4, 0.4);
    const [nx, ny] = cam.toStage(ROWT.x + ROWT.w, ROWT.y + ROWT.h + 8);
    const lNote = K.label(node, '最后一步：在托盘上提醒你最要紧的一件', { cls: 'dark', x: nx - 4, y: ny + 4, origin: '100% 0%' });
    gsap.set(lNote, { xPercent: -100 });
    K.pop(tl, lNote, T + 36.6); OM.sfx('ding', T + 36.6, { note: 5, gain: 0.32 });
    K.fadeOut(tl, [lTrig, lNote], T + 38.6, { y: 0 });
    tl.to([rgTrig, rgT], { opacity: 0, duration: 0.3 }, T + 38.6);
    // 下一场：回到整个窗口，光标去侧栏「日程表」
    A.clipTo(tl, T + 38.8, K.WHOLE, 0.9, 14);
    cam.to(tl, T + 38.8, { rect: K.WHOLE, w: 1560, anchor: [960, 548], duration: 0.9 });
    tl.set(cur.el, { x: 900, y: 700 }, T + 38.9);
    cur.move(tl, T + 38.9, 900, 700, 0.01);
    cur.show(tl, T + 39.0);
    cur.move(tl, T + 39.0, K.NAV.schedule.x + 80, K.NAV.schedule.y + 17, 0.9);
  },
});

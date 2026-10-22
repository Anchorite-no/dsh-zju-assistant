/* 校园事务：消息按人送达。50 秒（25 小节）。
   窗口收成通知栏 → 来源一条条亮起 → 展开被收起的、看理由 → 个人消息 → 张老师那条群消息 → 三处对得上。 */
SCENES.push({
  id: 'affairs', part: 2, bars: 25,
  build(tl, T, node) {
    const A = APP, cam = A.cameraman, cur = A.cursor;
    K.show(tl, A.node, T); K.show(tl, node, T); K.hide(tl, node, T + 50.5);
    const ov = K.overlay(node);

    // ---- 开场：整个窗口 → 收成通知栏面板，左边留给说明 ----
    A.swap(tl, T, 'affairs');
    cam.to(tl, T, { rect: K.WHOLE, w: 1560, anchor: [960, 548], duration: 0.8 });
    const F = { x: 904, y: 120, w: 526, h: 660 };
    A.clipTo(tl, T + 1.0, F, 1.1, 16);
    cam.to(tl, T + 1.0, { rect: F, h: 880, anchor: [1355, 548], duration: 1.1 });
    OM.sfx('whoosh', T + 1.45, { gain: 0.45 });
    const panelLeft = cam.toStage(F.x, 0)[0];

    const c1 = K.caption(node, { kicker: '校园事务 · 通知', title: '{51} 条通知，\n只把要紧的给你看', size: 60, x: 120, y: 250, id: 'affairs-cap1',
      body: '学校和学院的官网、公众号、二课活动，<br>还有你选定的微信群、钉钉群，<br>汇成一条按时间排的消息流。' });
    c1.in(tl, T + 1.7);

    // ---- 来源一条条亮起，左边标出是哪来的 ----
    const SRC = [
      ['公众号 · 浙江大学', '#4176e6'], ['微信 · 计科2502 班级群', '#22c55e'], ['综合服务网', '#61666b'], ['二课 · 图书馆', '#f0700f'],
      ['公众号 · 求是潮', '#4176e6'], ['学工部', '#61666b'], ['本科生院', '#61666b'], ['钉钉 · 大学物理（乙）Ⅱ 课程群', '#1a8cff'],
    ];
    const sideLabel = (text, color, yDev, extra = '') => {
      const y = cam.toStage(0, yDev)[1];
      const l = K.label(node, `<i style="background:${color}"></i>${text}${extra}`, { cls: 'light src', x: panelLeft - 22, y, origin: '100% 50%' });
      gsap.set(l, { xPercent: -100, yPercent: -50 });
      return l;
    };
    const srcLabels = [], srcBars = [];
    SRC.forEach(([text, color], i) => {
      const row = A.r(`notice[${i}]`);
      const at = T + 4.8 + i * 0.5;
      const b = K.bar(A, K.pad(row, -4, -3));
      tl.to(b, { opacity: 1, duration: 0.15 }, at).to(b, { opacity: 0, duration: 0.5 }, at + 0.6);
      const l = sideLabel(text, color, row.y + row.h / 2);
      K.pop(tl, l, at);
      OM.sfx('pop', at, { note: (i % 5) + 1, gain: 0.35, pan: -0.3 });
      srcLabels.push(l); srcBars.push(b);
    });
    K.fadeOut(tl, srcLabels, T + 9.8, { stagger: 0.03, y: 0 });

    // ---- 关系不大的自动收起 ----
    c1.out(tl, T + 10.0);
    const c2 = K.caption(node, { kicker: '按人筛选', title: '关系不大的，\n自动收起', size: 60, x: 120, y: 250, id: 'affairs-cap2',
      body: '先过一遍屏蔽词，再由模型对照<br>你的学院、年级、培养层次和校区逐条判断。' });
    c2.in(tl, T + 10.5);
    const fold = K.ring(A, K.pad(A.r('feed.folded'), 8, 7), { radius: 8 });
    K.draw(tl, fold, T + 11.2, 0.6); OM.sfx('draw', T + 11.2, { dur: 0.6, gain: 0.4 });
    cur.show(tl, T + 12.2);
    tl.set(cur.el, { x: 1250, y: 960 }, T + 12.2);
    cur.move(tl, T + 12.3, 1250, 960, 0.01);
    cur.move(tl, T + 12.5, 1124, 762, 0.9);
    cur.click(tl, T + 13.7);
    A.swap(tl, T + 13.7, 'affairs-collapsed');
    K.undraw(tl, fold, T + 13.7);
    // 回来的两条：研工部、外国语学院，标出为什么收起
    const why = [[4, '研究生的事 · 你是本科生'], [7, '外国语学院的名单 · 不是你的学院']];
    const whyLabels = [];
    why.forEach(([i, text], j) => {
      const row = A.r(`notice[${i}]`, 'affairs-collapsed');
      const rg = K.ring(A, K.pad(row, -2, -2), { color: '#f0700f', radius: 8, width: 2 });
      K.draw(tl, rg, T + 14.4 + j * 0.7, 0.5);
      const l = sideLabel(text, '#f0700f', row.y + row.h / 2, '<b class="tag">已收起</b>');
      K.pop(tl, l, T + 14.6 + j * 0.7);
      OM.sfx('tick', T + 14.6 + j * 0.7, { gain: 0.5 });
      whyLabels.push(l, rg);
    });
    c2.out(tl, T + 18.4);
    const c3 = K.caption(node, { kicker: '只收起，不删除', title: '拿不准的，\n一律留下', size: 60, x: 120, y: 250, id: 'affairs-cap3',
      body: '被收起的点一下就回来，<br>每一条原文都还在。' });
    c3.in(tl, T + 18.9);
    K.fadeOut(tl, whyLabels, T + 21.6, { y: 0 });

    // ---- 个人消息 ----
    const tab1 = A.r('feed.tab[1]');
    cur.to(tl, T + 21.6, tab1, 0.8);
    cur.click(tl, T + 22.6);
    A.swap(tl, T + 22.6, 'affairs-personal');
    c3.out(tl, T + 22.8);
    const c4 = K.caption(node, { kicker: '个人消息', title: '私聊、邮件、CC98，\n也在同一条里', size: 60, x: 120, y: 250, id: 'affairs-cap4',
      body: '群聊只读你选定的那几个；<br>邮件只读，不改你的已读状态。' });
    c4.in(tl, T + 23.2);
    const P = [[0, '微信 · 室友小周', '#22c55e'], [1, 'CC98 · 帖子回复', '#7d5bd6'], [2, '浙大邮箱 · 学在浙大', '#4176e6'], [6, '钉钉 · 计组助教', '#1a8cff']];
    const pLabels = [];
    P.forEach(([i, text, color], j) => {
      const row = A.r(`notice[${i}]`, 'affairs-personal');
      const at = T + 24.6 + j * 0.55;
      const b = K.bar(A, K.pad(row, -4, -3));
      tl.to(b, { opacity: 1, duration: 0.15 }, at).to(b, { opacity: 0, duration: 0.5 }, at + 0.7);
      const l = sideLabel(text, color, row.y + row.h / 2);
      K.pop(tl, l, at); OM.sfx('pop', at, { note: j + 2, gain: 0.35, pan: -0.3 });
      pLabels.push(l);
    });
    K.fadeOut(tl, pLabels, T + 29.4, { stagger: 0.03, y: 0 });
    c4.out(tl, T + 29.8);

    // ---- 回到校园通知：张老师那条群消息 ----
    const tab0 = A.r('feed.tab[0]');
    cur.to(tl, T + 29.9, tab0, 0.7);
    cur.click(tl, T + 30.8);
    A.swap(tl, T + 30.8, 'affairs');
    const row7 = A.r('notice[7]', 'affairs');
    cam.to(tl, T + 31.3, { rect: row7, w: 783, anchor: [1290, 600], duration: 1.1 });
    cur.move(tl, T + 31.1, 1480, 820, 0.6);
    cur.hide(tl, T + 31.6);
    const c5 = K.caption(node, { kicker: '课程群', title: '老师在群里说的话，\n不会被聊天刷走', size: 56, x: 120, y: 280, width: 560, id: 'affairs-cap5',
      body: '课程群可以只看老师和班委。<br>这一条已经整理进了备忘录。' });
    c5.in(tl, T + 32.2);
    const lift = K.lift(A, K.pad(row7, -2, 0), 'affairs');
    K.raise(tl, lift, T + 33.0, { scale: 1.04, y: -8 });
    OM.sfx('thud', T + 33.25, { gain: 0.5 });
    const okIcon = A.r('notice.memo[7]', 'affairs');
    const [ix, iy] = cam.toStage(okIcon.x + okIcon.w / 2, okIcon.y);
    const [rx] = cam.toStage(F.x + F.w, 0);
    const lOk = K.label(node, '已在备忘录', { cls: 'blue', x: rx + 22, y: iy + 21, origin: '0% 50%' });
    gsap.set(lOk, { yPercent: -50 });
    K.pop(tl, lOk, T + 34.4); OM.sfx('ding', T + 34.4, { note: 5, gain: 0.45 });
    K.lower(tl, lift, T + 37.3);
    K.fadeOut(tl, lOk, T + 37.3, { y: 0 });
    c5.out(tl, T + 37.4);

    // ---- 同一件事，三处对得上 ----
    const C = { x: 440, y: 112, w: 1000, h: 780 };
    A.clipTo(tl, T + 38.0, C, 1.2, 16);
    cam.to(tl, T + 38.0, { rect: C, h: 820, anchor: [960, 600], duration: 1.2 });
    OM.sfx('whoosh', T + 38.4, { gain: 0.4 });
    const head = K.chars(node, '同一件事，{三处}对得上', 'cap-t', { position: 'absolute', left: '50%', top: '64px', fontSize: '50px', transform: 'translateX(-50%)' });
    head.dataset.omId = 'thread-title';
    K.rise(tl, head, T + 39.0, { stagger: 0.035 });
    const task3 = A.r('task[3]', 'affairs'), memo0 = A.r('memo[0]', 'affairs');
    const spots = [
      [row7, '钉钉课程群 · 张老师', 'right'],
      [task3, '学在浙大 · 作业已延后两天', 'left'],
      [memo0, '备忘录 · 已记下', 'left'],
    ];
    const tLabels = [], tRings = [];
    spots.forEach(([r, text, side], j) => {
      const at = T + 40.0 + j * 0.9;
      const rg = K.ring(A, K.pad(r, 3, 3), { radius: 10, width: 3 });
      K.draw(tl, rg, at, 0.55); OM.sfx('draw', at, { dur: 0.5, gain: 0.35 });
      const [sx, sy] = cam.toStage(side === 'right' ? r.x + r.w : r.x, r.y);
      const l = K.label(node, text, { cls: 'blue', x: sx + (side === 'right' ? -4 : 4), y: sy - 12, origin: side === 'right' ? '100% 100%' : '0% 100%' });
      gsap.set(l, { xPercent: side === 'right' ? -100 : 0, yPercent: -100 });
      K.pop(tl, l, at + 0.3);
      tLabels.push(l); tRings.push(rg);
    });
    // 三处之间的连线（截图坐标里画，跟着镜头走）
    const link = (a, b) => K.svg('path', { d: `M${a[0]},${a[1]} C${a[0] - 80},${a[1]} ${b[0] + 80},${b[1]} ${b[0]},${b[1]}`, fill: 'none', stroke: '#4176e6', 'stroke-width': 2, 'stroke-dasharray': '1', pathLength: 1, 'stroke-dashoffset': 1, opacity: 0.8 }, A.ink);
    const l1 = link([row7.x - 2, row7.y + row7.h / 2], [task3.x + task3.w + 6, task3.y + task3.h / 2]);
    const l2 = K.svg('path', { d: `M${task3.x + 40},${task3.y + task3.h + 4} C${task3.x + 40},${task3.y + 160} ${memo0.x + 60},${memo0.y - 120} ${memo0.x + 60},${memo0.y - 4}`, fill: 'none', stroke: '#4176e6', 'stroke-width': 2, pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1, opacity: 0.8 }, A.ink);
    K.draw(tl, l1, T + 40.6, 0.6); K.draw(tl, l2, T + 41.5, 0.6);
    OM.sfx('chime', T + 42.4, { gain: 0.45 });
    // 收尾
    K.sink(tl, head, T + 47.0);
    K.fadeOut(tl, tLabels, T + 47.0, { y: 0 });
    tl.to([...tRings, l1, l2], { opacity: 0, duration: 0.4 }, T + 47.0);
  },
});

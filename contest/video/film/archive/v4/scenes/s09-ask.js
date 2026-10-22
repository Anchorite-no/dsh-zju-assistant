/* 问助手。50 秒（25 小节）。新会话里打字 → 发送（真实录屏：执行过程一行行长出来，回答流式出来）
   → 回答表格里「延后两天」那一行和它的来源 → 点开一步看读到了什么 → 拉开：几个网站、几步。 */
SCENES.push({
  id: 'ask', part: 2, bars: 25,
  build(tl, T, node) {
    const A = APP, cam = A.cameraman, cur = A.cursor;
    K.show(tl, A.node, T); K.show(tl, node, T); K.hide(tl, node, T + 50.5);
    // 上一场光标停在「新会话」上
    cur.click(tl, T + 0.2);
    A.swap(tl, T + 0.2, 'chat-trace-0');
    const comp = A.r('composer', 'chat-trace-0');
    // 输入框里的字先遮住，再一个字一个字出来
    const TXT = { x: 592, y: 526, w: 360, h: 28 };
    const cover = K.el('div', 'cover', A.layer);
    K.css(cover, { left: TXT.x, top: TXT.y, width: TXT.w + 6, height: TXT.h });
    gsap.set(cover, { opacity: 0 });
    tl.set(cover, { opacity: 1 }, T + 0.2);
    const typed = K.lift(A, TXT, 'chat-trace-0');
    typed.style.boxShadow = 'none'; typed.style.borderRadius = '0';
    gsap.set(typed, { clipPath: `inset(0px ${TXT.w}px 0px 0px)` });
    tl.set(typed, { opacity: 1 }, T + 0.2);
    const caret = K.el('div', 'caret', A.layer);
    K.css(caret, { left: TXT.x, top: TXT.y + 3 });
    gsap.set(caret, { opacity: 0 });
    tl.set(caret, { opacity: 1 }, T + 0.2);
    const N = 25, T0 = T + 2.0, TD = 2.6;
    tl.to(typed, { clipPath: 'inset(0px 0px 0px 0px)', duration: TD, ease: `steps(${N})` }, T0);
    tl.to(caret, { x: 352, duration: TD, ease: `steps(${N})` }, T0);
    OM.sfx('type', T0, { dur: TD, gain: 0.5 });
    tl.set([cover, caret], { opacity: 0 }, T + 5.1);
    cam.to(tl, T + 0.4, { rect: K.pad(comp, 40, 30), w: 1100, anchor: [960, 640], duration: 1.1 });
    cur.move(tl, T + 0.5, comp.x + comp.w - 120, comp.y + 120, 1.0);
    cur.hide(tl, T + 1.4);
    const head = K.chars(node, '问一句，它去{好几个网站}把事情找齐', 'cap-t', { position: 'absolute', left: '50%', top: '250px', fontSize: '56px', transform: 'translateX(-50%)' });
    head.dataset.omId = 'ask-head';
    K.rise(tl, head, T + 0.9, { stagger: 0.03 });

    // 发送：接真实录屏（从打好字的那一刻开始）
    const RATE = 1.35, MS = 0.95, V0 = T + 5.1, cT = (c) => V0 + (c - MS) / RATE;
    A.addVideo('trace-clip', 'assets/clips/trace-grow.mp4', { start: V0, dur: (21.2 - MS) / RATE + 2.5, mediaStart: MS, rate: RATE });
    cur.show(tl, T + 4.6);
    K.sink(tl, head, T + 4.3);
    cur.move(tl, T + 4.6, comp.x + comp.w - 30, comp.y + 38, cT(1.1) - (T + 4.6) - 0.08);
    A.swap(tl, V0, 'trace-clip');
    tl.set(typed, { opacity: 0 }, V0);
    cur.click(tl, cT(1.1));
    cur.hide(tl, cT(1.4));
    // 镜头：先看整个窗口，再推到右边的执行过程
    cam.to(tl, cT(1.2), { rect: K.WHOLE, w: 1560, anchor: [960, 548], duration: 0.9 });
    const PANE = { x: 1181, y: 78, w: 419, h: 520 };
    cam.to(tl, cT(2.6), { rect: PANE, zoom: 1.5, anchor: [1330, 540], duration: 1.1 });
    A.clipTo(tl, cT(2.6), { x: 1181, y: 60, w: 419, h: 940 }, 1.1, 16);
    OM.sfx('whoosh', cT(2.9), { gain: 0.35 });
    const c1 = K.caption(node, { kicker: '执行过程', title: '去了哪、拿到了什么，\n一步一步画出来', size: 52, x: 120, y: 290, width: 600, id: 'ask-cap1',
      body: '每一行是一条校园命令：登录、翻页、<br>名称匹配和回查都在命令里做完。' });
    c1.in(tl, cT(3.4));
    // 左边一列：去过的网站，随录屏里出现的时刻一个个亮起
    const SITES = [[2.4, '学在浙大'], [2.4, '教务网'], [4.2, '钉钉课程群'], [6.9, '智云课堂 · 录播字幕'], [10.0, '大物实验课'], [10.0, '超星学习通'], [12.8, '校园通知']];
    const rail = K.el('div', 'rail', node);
    K.css(rail, { left: 124, top: 640 });
    const chips = SITES.map(([c, name], i) => {
      const ch = K.el('div', 'chip', rail, `<b>${i + 1}</b>${name}`);
      gsap.set(ch, { opacity: 0, x: -16 });
      const at = cT(Math.max(c, 3.6)) + (i % 2) * 0.25;
      tl.to(ch, { opacity: 1, x: 0, duration: 0.45, ease: OM.spring(0.15) }, at);
      OM.sfx('pop', at, { note: i + 1, gain: 0.35, pan: -0.4 });
      return ch;
    });
    c1.out(tl, cT(14.6));
    tl.to(chips, { opacity: 0, x: -10, duration: 0.3, stagger: 0.02 }, cT(14.6));
    // 回答开始流式输出：镜头转到左边的回答
    const TABLE = { x: 380, y: 222, w: 700, h: 330 };
    A.clipTo(tl, cT(15.2), { x: 360, y: 60, w: 740, h: 900 }, 1.1, 16);
    cam.to(tl, cT(15.2), { rect: TABLE, zoom: 1.45, anchor: [1050, 520], duration: 1.1 });
    // 录屏结束后换成同一时刻的截图（回答表格一样），在镜头移动里换
    A.swap(tl, cT(21.2) + 0.2, 'chat-trace-6');
    const c2 = K.caption(node, { kicker: '回答', title: '按时间排好，\n每一行写着来源', size: 52, x: 120, y: 300, width: 460, id: 'ask-cap2',
      body: '平台、群消息和录播字幕<br>放在一起说。' });
    c2.in(tl, cT(16.4));
    // 延后两天那一行
    const ROW = { x: 386, y: 405, w: 680, h: 65 }, SRC = { x: 806, y: 410, w: 256, h: 56 };
    const spRow = K.spot(A, K.pad(ROW, 0, 0), { radius: 8 });
    K.dim(tl, spRow, T + 24.6, 0.62, 0.5);
    K.dim(tl, spRow, T + 31.0, 0, 0.4);
    const rgRow = K.ring(A, ROW, { radius: 8, width: 3 });
    K.draw(tl, rgRow, T + 25.0, 0.5); OM.sfx('draw', T + 25.0, { dur: 0.5, gain: 0.35 });
    const [rx, ry] = cam.toStage(ROW.x + 150, ROW.y + ROW.h);
    const lRow = K.label(node, '群里的延后通知，也算进来了', { cls: 'blue', x: rx, y: ry + 12, origin: '0% 0%' });
    K.pop(tl, lRow, T + 25.5); OM.sfx('ding', T + 25.5, { note: 5, gain: 0.45 });
    const rgSrc = K.ring(A, SRC, { radius: 8, width: 2.5, color: '#f0700f' });
    K.draw(tl, rgSrc, T + 27.2, 0.45);
    const [sx, sy] = cam.toStage(SRC.x + SRC.w, SRC.y);
    const lSrc = K.label(node, '张老师 10月20日 20:15 在钉钉课程群', { cls: 'light', x: sx - 4, y: sy - 12, origin: '100% 100%' });
    gsap.set(lSrc, { xPercent: -100, yPercent: -100 });
    K.pop(tl, lSrc, T + 27.6); OM.sfx('tick', T + 27.6, { gain: 0.5 });
    c2.out(tl, T + 31.0);
    K.fadeOut(tl, [lRow, lSrc], T + 31.0, { y: 0 });
    tl.to([rgRow, rgSrc], { opacity: 0, duration: 0.3 }, T + 31.0);

    // 点开执行过程里的一行
    A.clipTo(tl, T + 31.4, { x: 1181, y: 60, w: 419, h: 940 }, 1.1, 16);
    const row2 = A.r('trace.row[2]', 'chat-trace-6');
    cam.to(tl, T + 31.4, { rect: { x: 1181, y: 90, w: 419, h: 360 }, zoom: 1.5, anchor: [1300, 520], duration: 1.1 });
    cur.show(tl, T + 32.2);
    tl.set(cur.el, { x: 1500, y: 330 }, T + 32.1);
    cur.move(tl, T + 32.2, 1500, 330, 0.01);
    cur.move(tl, T + 32.3, row2.x + 220, row2.y + 16, 0.9);
    cur.click(tl, T + 33.4);
    A.swap(tl, T + 33.4, 'chat-trace-7');
    cur.move(tl, T + 33.7, 1560, 470, 0.7);
    cur.hide(tl, T + 34.3);
    const det = A.r('trace.detail', 'chat-trace-7');
    const rgDet = K.ring(A, K.pad(det, 6, 4), { radius: 10, width: 2.5 });
    K.draw(tl, rgDet, T + 34.0, 0.6);
    const c3 = K.caption(node, { kicker: '每一步都能点开', title: '它读到了什么，\n一条条摆出来', size: 52, x: 120, y: 300, width: 600, id: 'ask-cap3',
      body: '学在浙大这一步读到 8 条：<br>哪份作业、哪门课、什么时候截止。<br>点「看命令」能看到它具体执行了什么。' });
    c3.in(tl, T + 34.4);
    c3.out(tl, T + 41.0);
    K.undraw(tl, rgDet, T + 41.0);

    // 拉开：整个窗口 + 统计
    A.clipTo(tl, T + 41.6, K.WHOLE, 1.2, 14);
    cam.to(tl, T + 41.6, { rect: K.WHOLE, w: 1380, anchor: [960, 600], duration: 1.2 });
    const stat = K.el('div', 'stat3', node);
    stat.dataset.omId = 'ask-stat';
    stat.innerHTML = '<div><b>7</b><span>个网站</span></div><div><b>13</b><span>步</span></div><div><b>1</b><span>句话</span></div>';
    const bs = stat.querySelectorAll('b');
    gsap.set(stat.children, { opacity: 0, y: 20 });
    tl.to(stat.children, { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out', stagger: 0.15 }, T + 42.6);
    K.count(tl, bs[0], 0, 7, T + 42.6, 0.9); K.count(tl, bs[1], 0, 13, T + 42.75, 1.0);
    OM.sfx('count', T + 42.6, { dur: 1.0, gain: 0.4 });
    OM.sfx('impact', T + 43.8, { gain: 0.35 });
    const pane = A.r('trace.pane', 'chat-trace-7');
    const rgPane = K.ring(A, K.pad(pane, -2, -2), { radius: 12, width: 3 });
    K.draw(tl, rgPane, T + 43.2, 0.8);
    tl.to(stat.children, { opacity: 0, y: -14, duration: 0.4, stagger: 0.06 }, T + 47.4);
    K.undraw(tl, rgPane, T + 47.4);
  },
});

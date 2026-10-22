/* 交作业：你点头才执行。30 秒（15 小节）。
   另一段对话：把计组 Lab 3 交到学在浙大 → 它先读要求、看文件 → 「确认提交」卡片 → 点确认 → 提交、回查到记录。 */
SCENES.push({
  id: 'confirm', part: 2, bars: 15,
  build(tl, T, node) {
    const A = APP, cam = A.cameraman, cur = A.cursor;
    K.show(tl, A.node, T); K.show(tl, node, T); K.hide(tl, node, T + 30.5);
    // 切到另一段对话（镜头移动中换）
    const CHAT = { x: 360, y: 60, w: 740, h: 940 };
    A.clipTo(tl, T + 0.2, CHAT, 1.1, 16);
    cam.to(tl, T + 0.2, { rect: CHAT, h: 1000, anchor: [1290, 548], duration: 1.1 });
    A.swap(tl, T + 0.6, 'write-confirm', 0.3);
    OM.sfx('whip', T + 0.4, { gain: 0.3 });
    const c1 = K.caption(node, { kicker: '会改动学校系统的事', title: '交作业之前，\n先问你一句', size: 60, x: 120, y: 290, width: 560, id: 'conf-cap1',
      body: '选课、交作业、场馆预约、二课报名……<br>22 条会改动学校系统的操作，<br>都要你在对话里点头才执行。' });
    c1.in(tl, T + 1.3);
    // 它先读要求、看文件，判断这是写操作
    const THINK = { x: 386, y: 338, w: 650, h: 22 };
    const bThink = K.bar(A, K.pad(THINK, 4, 4));
    tl.to(bThink, { opacity: 1, duration: 0.3 }, T + 3.4).to(bThink, { opacity: 0, duration: 0.5 }, T + 6.6);
    const [tx, ty] = cam.toStage(THINK.x + 150, THINK.y + THINK.h + 6);
    const lThink = K.label(node, '提交是写操作，先请你确认', { cls: 'blue', x: tx, y: ty + 8, origin: '0% 0%' });
    K.pop(tl, lThink, T + 3.7); OM.sfx('pop', T + 3.7, { note: 3, gain: 0.4 });
    K.fadeOut(tl, lThink, T + 6.6, { y: 0 });
    c1.out(tl, T + 7.0);

    // 推到确认卡片
    const CARD = { x: 387, y: 682, w: 680, h: 312 };
    cam.to(tl, T + 7.0, { rect: CARD, zoom: 1.5, anchor: [1250, 560], duration: 1.0 });
    const c2 = K.caption(node, { kicker: '确认提交', title: '交什么、交到哪、\n什么时候截止', size: 54, x: 120, y: 330, width: 560, id: 'conf-cap2',
      body: '文件名、页数、课程和作业、截止时间，<br>写清楚了再问你。' });
    c2.in(tl, T + 7.6);
    const Q = { x: 400, y: 718, w: 600, h: 76 };
    const rgQ = K.ring(A, K.pad(Q, 8, 6), { radius: 10, width: 2.5 });
    K.draw(tl, rgQ, T + 8.6, 0.6); OM.sfx('draw', T + 8.6, { dur: 0.6, gain: 0.35 });
    // 选「确认提交」，再点「提交」
    const opt = A.r('question.button[20]', 'write-confirm'), send = A.r('question.button[25]', 'write-confirm');
    cur.show(tl, T + 11.0);
    tl.set(cur.el, { x: 1080, y: 990 }, T + 10.9);
    cur.move(tl, T + 10.9, 1080, 990, 0.01);
    cur.move(tl, T + 11.1, opt.x + 120, opt.y + 22, 0.8);
    cur.click(tl, T + 12.1);
    K.undraw(tl, rgQ, T + 12.1);
    cur.move(tl, T + 12.4, send.x + 28, send.y + 19, 0.7);
    cur.click(tl, T + 13.3, { gain: 1 });
    A.swap(tl, T + 13.3, 'write-confirm-done');
    cur.move(tl, T + 13.6, 1080, 860, 0.6);
    cur.hide(tl, T + 14.2);
    c2.out(tl, T + 13.6);

    // 提交了，回查到记录；执行过程多了一步「提交作业」
    const VIEW = { x: 370, y: 60, w: 1230, h: 440 };
    A.clipTo(tl, T + 13.35, VIEW, 1.1, 16);
    cam.to(tl, T + 13.35, { rect: VIEW, w: 1640, anchor: [960, 600], duration: 1.1 });
    const head = K.chars(node, '你点头才执行，{执行完再回查}', 'cap-t', { position: 'absolute', left: '50%', top: '70px', fontSize: '50px', transform: 'translateX(-50%)' });
    head.dataset.omId = 'conf-head';
    K.rise(tl, head, T + 15.0, { stagger: 0.03 });
    const ANS = { x: 386, y: 296, w: 682, h: 46 };
    const rgA = K.ring(A, K.pad(ANS, 6, 6), { radius: 8, width: 3 });
    K.draw(tl, rgA, T + 16.4, 0.55); OM.sfx('ding', T + 16.6, { note: 5, gain: 0.45 });
    const [ax, ay] = cam.toStage(ANS.x, ANS.y + ANS.h + 8);
    const lA = K.label(node, '回到学在浙大查了一遍：状态「已提交」', { cls: 'blue', x: ax, y: ay + 6, origin: '0% 0%' });
    K.pop(tl, lA, T + 16.9);
    const row4 = A.r('trace.row[4]', 'write-confirm-done');
    const rgR = K.ring(A, K.pad(row4, -2, 0), { radius: 8, width: 3 });
    K.draw(tl, rgR, T + 18.4, 0.5); OM.sfx('tick', T + 18.7, { gain: 0.5 });
    const [rx, ry] = cam.toStage(row4.x + row4.w, row4.y + row4.h + 6);
    const lR = K.label(node, '执行过程里多了一步：提交作业', { cls: 'dark', x: rx - 4, y: ry + 6, origin: '100% 0%' });
    gsap.set(lR, { xPercent: -100 });
    K.pop(tl, lR, T + 18.8);
    // 一句话说清边界
    const foot = K.lines(node, '群里的消息只当事实，不当你的授权；不代签到，不抢课。', 'foot-note');
    K.fadeUp(tl, foot, T + 21.0);
    // 收
    K.sink(tl, head, T + 26.4);
    K.fadeOut(tl, [lA, lR, foot], T + 26.4, { y: 0 });
    tl.to([rgA, rgR], { opacity: 0, duration: 0.3 }, T + 26.4);
    A.clipTo(tl, T + 27.0, K.WHOLE, 1.1, 14);
    cam.to(tl, T + 27.0, { rect: K.WHOLE, w: 1560, anchor: [960, 548], duration: 1.1 });
    cur.show(tl, T + 27.6);
    cur.move(tl, T + 27.6, K.NAV.learning.x + 80, K.NAV.learning.y + 18, 1.4);
  },
});

/* 通知一键变备忘录。22 秒（11 小节）。上一场光标停在侧栏「校园事务」上。
   真实录屏（光标由片子叠上，和界面变化同帧）→ 打开整理好的备忘 → 和原文逐字对上 → 拉远收掉，第二段结束。 */
SCENES.push({
  id: 'memo', part: 2, bars: 11,
  build(tl, T, node) {
    const A = APP, cam = A.cameraman, cur = A.cursor;
    K.show(tl, A.node, T); K.show(tl, node, T); K.hide(tl, node, T + 22.5);

    // ---- 说明 ----
    const C = { x: 440, y: 112, w: 1000, h: 780 };
    // 上一场光标停在侧栏「校园事务」上
    cur.click(tl, T + 0.2);
    A.page(tl, T + 0.2, 'affairs');
    cur.hide(tl, T + 0.5);
    A.clipTo(tl, T + 0.5, C, 0.9, 16);
    cam.to(tl, T + 0.5, { rect: C, h: 820, anchor: [1340, 560], duration: 1.0 });
    const c1 = K.caption(node, { kicker: '通知加到备忘录', title: '一条通知，\n一键变成待办', size: 60, x: 120, y: 300, width: 560, id: 'memo-cap1',
      body: '模型读出时间和截止，<br>再和原文逐字核对。' });
    c1.in(tl, T + 0.5);
    c1.out(tl, T + 3);

    // ---- 真实录屏：悬停 → 加到备忘录 → AI 总结后添加 → 整理 → 左栏多一条 ----
    const R = { x: 440, y: 22, w: 1000, h: 690 };
    A.clipTo(tl, T + 3, R, 1.0, 16);
    cam.to(tl, T + 3, { rect: R, h: 966, anchor: [960, 548], duration: 1.0 });
    OM.sfx('whoosh', T + 3.3, { gain: 0.35 });
    const RATE = 1.0, V0 = T + 3.6, clipT = (c) => V0 + c / RATE;
    A.addVideo('memo-clip', 'assets/clips/memo-organize.mp4', { start: V0, dur: 5.767 / RATE + 0.3, rate: RATE });
    A.swap(tl, V0, 'memo-clip');
    const row5 = A.r('notice[5]', 'memo-ai-2'), btn = A.r('notice.memo[5]', 'memo-ai-2'), item = A.r('menu.item[1]', 'memo-ai-2');
    tl.set(cur.el, { x: 1180, y: 700 }, T + 3.4);
    cur.move(tl, T + 3.4, 1180, 700, 0.01);
    cur.show(tl, T + 3.5);
    cur.move(tl, T + 3.7, 1210, row5.y + 32, clipT(0.6) - (T + 3.7));
    cur.move(tl, clipT(0.75), btn.x + 14, btn.y + 15, clipT(1.4) - clipT(0.75) - 0.08);
    cur.click(tl, clipT(1.4));
    // 菜单出来：标一下第二项
    const [mx, my] = cam.toStage(item.x + item.w + 4, item.y + item.h + 10);
    const lMenu = K.label(node, 'AI 总结后添加<small>模型读原文，整理出时间、截止和要点</small>', { cls: 'blue', x: mx, y: my + 8, origin: '100% 0%' });
    gsap.set(lMenu, { xPercent: -100 });
    K.pop(tl, lMenu, clipT(1.55));
    cur.move(tl, clipT(1.75), item.x + 70, item.y + 18, clipT(2.533) - clipT(1.75) - 0.08);
    cur.click(tl, clipT(2.533));
    K.fadeOut(tl, lMenu, clipT(2.6), { y: 0 });
    cur.move(tl, clipT(2.8), 1300, 660, 0.6);
    // 整理中
    const [bx, by] = cam.toStage(R.x + R.w, btn.y + btn.h / 2);
    const lBusy = K.label(node, '正在读原文…', { cls: 'light', x: bx + 18, y: by, origin: '0% 50%' });
    gsap.set(lBusy, { yPercent: -50 });
    K.pop(tl, lBusy, clipT(2.75));
    K.fadeOut(tl, lBusy, clipT(5.0), { y: 0 });
    // 整理完：左栏第一条、顶上提示
    const memo0 = A.r('memo[0]', 'memo-ai-4'), toast = A.r('toast', 'memo-ai-4');
    const rgMemo = K.ring(A, K.pad(memo0, 4, 2), { radius: 8, width: 3 });
    K.draw(tl, rgMemo, clipT(5.1), 0.5);
    OM.sfx('ding', clipT(5.067), { note: 3, gain: 0.5 });
    const [lx, ly] = cam.toStage(memo0.x, memo0.y + memo0.h);
    const lMemo = K.label(node, '备忘录多了一条「体质健康测试」', { cls: 'blue', x: lx, y: ly + 12, origin: '0% 0%' });
    K.pop(tl, lMemo, clipT(5.3));
    A.swap(tl, V0 + 5.767 / RATE, 'memo-ai-4');

    // ---- 打开它 ----
    K.fadeOut(tl, lMemo, T + 9.6, { y: 0 });
    K.undraw(tl, rgMemo, T + 9.6);
    cur.move(tl, T + 9.4, toast.x + toast.w - 22, toast.y + 24, 0.9);
    cur.click(tl, T + 10.3);
    A.swap(tl, T + 10.3, 'memo-ai-5');
    const M = { x: 440, y: 84, w: 800, h: 440 };
    A.clipTo(tl, T + 10.37, M, 1.0, 16);
    cam.to(tl, T + 10.37, { rect: M, w: 1120, anchor: [1300, 540], duration: 1.0 });
    cur.move(tl, T + 10.44, 1180, 470, 0.8);
    cur.hide(tl, T + 10.79);
    const c2 = K.caption(node, { kicker: 'AI 整理好的备忘', title: '时间、截止、来源，\n排进属性', size: 56, x: 120, y: 330, width: 560, id: 'memo-cap2',
      body: '正文是四条要点，<br>原文链接附在最后。' });
    c2.in(tl, T + 11);
    const props = [1, 2, 3].map((i) => A.r(`memo.prop[${i}]`, 'memo-ai-5'));
    const propRings = props.map((p, j) => {
      const rg = K.ring(A, { x: p.x - 6, y: p.y - 4, w: j === 2 ? 128 : 252, h: p.h + 8 }, { radius: 7, width: 2.5 });
      K.draw(tl, rg, T + 12 + j * 0.6, 0.45); OM.sfx('tick', T + 12 + j * 0.6 + 0.3, { gain: 0.5 });
      return rg;
    });
    c2.out(tl, T + 14.6);

    // ---- 和原文逐字核对 ----
    const card = K.el('div', 'orig', node);
    card.dataset.omId = 'original-notice';
    card.innerHTML = `<div class="orig-h"><span>原文 · 学工部</span><span>关于开展2026年秋季学期学生体质健康测试的通知</span></div>
      <div class="orig-q" id="q1">2025级本科生统一安排在 <mark>10月29日（周四）13:30</mark> 起，在紫金港校区东田径场测试。</div>
      <div class="orig-q" id="q2">请于 <mark>10月27日17:00前</mark> 登录体测系统确认测试时段，逾期不再调整。</div>
      <div class="orig-f">对不上的，宁可不写</div>`;
    gsap.set(card, { opacity: 0, x: -40 });
    tl.to(card, { opacity: 1, x: 0, duration: 0.7, ease: 'expo.out' }, T + 14.8);
    OM.sfx('paper', T + 14.87, { gain: 0.5 });
    // 两句原文分别连到时间、截止
    const ends = [[props[0], 410], [props[1], 530]];
    const links = ends.map(([p, qy], j) => {
      const b = cam.toStage(p.x - 8, p.y + p.h / 2);
      return K.leader(K.overlay(node), [700, qy], b, { color: '#4176e6' });
    });
    links.forEach((ln, j) => ln.in(tl, T + 15.8 + j * 1.2));
    const okLabels = props.slice(0, 2).map((p, j) => {
      const [ox, oy] = cam.toStage(p.x + 252 + 12, p.y + p.h / 2);
      const l = K.label(node, '✓ 和原文一致', { cls: 'ok', x: ox, y: oy, origin: '0% 50%' });
      gsap.set(l, { yPercent: -50 });
      K.pop(tl, l, T + 16.18 + j * 1.2);
      OM.sfx('ding', T + 16.18 + j * 1.2, { note: 4 + j, gain: 0.45 });
      return l;
    });
    const foot = card.querySelector('.orig-f');
    gsap.set(foot, { opacity: 0, y: 10 });
    tl.to(foot, { opacity: 1, y: 0, duration: 0.5, ease: 'expo.out' }, T + 17.8);
    // 收
    tl.to(card, { opacity: 0, x: -30, duration: 0.45, ease: 'power2.in' }, T + 19.6);
    links.forEach((ln) => ln.out(tl, T + 19.6));
    K.fadeOut(tl, okLabels, T + 19.6, { y: 0 });
    tl.to(propRings, { opacity: 0, duration: 0.3 }, T + 19.6);

    // 第二段收尾：拉远，应用窗口收掉，下一场蓝色场接
    A.clipTo(tl, T + 19.8, K.WHOLE, 1.2, 14);
    cam.to(tl, T + 19.8, { rect: K.WHOLE, w: 1100, anchor: [960, 540], duration: 1.4 });
    tl.to(A.tilt, { opacity: 0, scale: 0.94, duration: 0.7, ease: 'power2.in' }, T + 21.0);
    K.hide(tl, A.node, T + 21.9);
  },
});

/* 通知一键变备忘录。40 秒（20 小节）。
   真实录屏（光标由片子叠上，和界面变化同帧）→ 打开整理好的备忘 → 和原文逐字对上 → 刷新：新消息滑进来。 */
SCENES.push({
  id: 'memo', part: 2, bars: 20,
  build(tl, T, node) {
    const A = APP, cam = A.cameraman, cur = A.cursor;
    K.show(tl, A.node, T); K.show(tl, node, T); K.hide(tl, node, T + 40.5);

    // ---- 说明 ----
    const C = { x: 440, y: 112, w: 1000, h: 780 };
    A.swap(tl, T, 'affairs');
    A.clipTo(tl, T, C, 0.9, 16);
    cam.to(tl, T, { rect: C, h: 820, anchor: [1340, 560], duration: 1.0 });
    const c1 = K.caption(node, { kicker: '通知加到备忘录', title: '一条通知，\n一键变成待办', size: 60, x: 120, y: 300, width: 560, id: 'memo-cap1',
      body: '模型读出时间和截止，<br>再和原文逐字核对。' });
    c1.in(tl, T + 0.6);
    c1.out(tl, T + 3.7);

    // ---- 真实录屏：悬停 → 加到备忘录 → AI 总结后添加 → 整理 → 左栏多一条 ----
    const R = { x: 440, y: 22, w: 1000, h: 690 };
    A.clipTo(tl, T + 3.8, R, 1.0, 16);
    cam.to(tl, T + 3.8, { rect: R, h: 966, anchor: [960, 548], duration: 1.0 });
    OM.sfx('whoosh', T + 4.1, { gain: 0.35 });
    const RATE = 0.8, V0 = T + 4.8, clipT = (c) => V0 + c / RATE;
    A.addVideo('memo-clip', 'assets/clips/memo-organize.mp4', { start: V0, dur: 5.767 / RATE + 0.3, rate: RATE });
    A.swap(tl, V0, 'memo-clip');
    const row5 = A.r('notice[5]', 'memo-ai-2'), btn = A.r('notice.memo[5]', 'memo-ai-2'), item = A.r('menu.item[1]', 'memo-ai-2');
    tl.set(cur.el, { x: 1180, y: 700 }, T + 4.6);
    cur.move(tl, T + 4.6, 1180, 700, 0.01);
    cur.show(tl, T + 4.7);
    cur.move(tl, T + 4.9, 1210, row5.y + 32, clipT(0.6) - (T + 4.9));
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
    K.fadeOut(tl, lMemo, T + 12.6, { y: 0 });
    K.undraw(tl, rgMemo, T + 12.6);
    cur.move(tl, T + 12.2, toast.x + toast.w - 22, toast.y + 24, 0.9);
    cur.click(tl, T + 13.3);
    A.swap(tl, T + 13.3, 'memo-ai-5');
    const M = { x: 440, y: 84, w: 800, h: 440 };
    A.clipTo(tl, T + 13.4, M, 1.0, 16);
    cam.to(tl, T + 13.4, { rect: M, w: 1120, anchor: [1300, 540], duration: 1.0 });
    cur.move(tl, T + 13.5, 1180, 470, 0.8);
    cur.hide(tl, T + 14.0);
    const c2 = K.caption(node, { kicker: 'AI 整理好的备忘', title: '时间、截止、来源，\n排进属性', size: 56, x: 120, y: 330, width: 560, id: 'memo-cap2',
      body: '正文是四条要点，<br>原文链接附在最后。' });
    c2.in(tl, T + 14.3);
    const props = [1, 2, 3].map((i) => A.r(`memo.prop[${i}]`, 'memo-ai-5'));
    const propRings = props.map((p, j) => {
      const rg = K.ring(A, { x: p.x - 6, y: p.y - 4, w: j === 2 ? 128 : 252, h: p.h + 8 }, { radius: 7, width: 2.5 });
      K.draw(tl, rg, T + 15.8 + j * 0.6, 0.45); OM.sfx('tick', T + 15.8 + j * 0.6 + 0.3, { gain: 0.5 });
      return rg;
    });
    const body = A.r('memo.body[0]', 'memo-ai-5');
    const rgBody = K.ring(A, K.pad(body, 8, 6), { radius: 10, width: 2.5, color: '#61666b' });
    K.draw(tl, rgBody, T + 18.0, 0.6);
    K.undraw(tl, rgBody, T + 20.0);
    c2.out(tl, T + 20.2);

    // ---- 和原文逐字核对 ----
    const card = K.el('div', 'orig', node);
    card.dataset.omId = 'original-notice';
    card.innerHTML = `<div class="orig-h"><span>原文 · 学工部</span><span>关于开展2026年秋季学期学生体质健康测试的通知</span></div>
      <div class="orig-q" id="q1">2025级本科生统一安排在 <mark>10月29日（周四）13:30</mark> 起，在紫金港校区东田径场测试。</div>
      <div class="orig-q" id="q2">请于 <mark>10月27日17:00前</mark> 登录体测系统确认测试时段，逾期不再调整。</div>
      <div class="orig-f">对不上的，宁可不写</div>`;
    gsap.set(card, { opacity: 0, x: -40 });
    tl.to(card, { opacity: 1, x: 0, duration: 0.7, ease: 'expo.out' }, T + 20.6);
    OM.sfx('paper', T + 20.7, { gain: 0.5 });
    // 两句原文分别连到时间、截止
    const ends = [[props[0], 410], [props[1], 530]];
    const links = ends.map(([p, qy], j) => {
      const b = cam.toStage(p.x - 8, p.y + p.h / 2);
      return K.leader(K.overlay(node), [700, qy], b, { color: '#4176e6' });
    });
    links.forEach((ln, j) => ln.in(tl, T + 22.0 + j * 1.2));
    const okLabels = props.slice(0, 2).map((p, j) => {
      const [ox, oy] = cam.toStage(p.x + 252 + 12, p.y + p.h / 2);
      const l = K.label(node, '✓ 和原文一致', { cls: 'ok', x: ox, y: oy, origin: '0% 50%' });
      gsap.set(l, { yPercent: -50 });
      K.pop(tl, l, T + 22.6 + j * 1.2);
      OM.sfx('ding', T + 22.6 + j * 1.2, { note: 4 + j, gain: 0.45 });
      return l;
    });
    const foot = card.querySelector('.orig-f');
    gsap.set(foot, { opacity: 0, y: 10 });
    tl.to(foot, { opacity: 1, y: 0, duration: 0.5, ease: 'expo.out' }, T + 25.2);
    // 收
    tl.to(card, { opacity: 0, x: -30, duration: 0.45, ease: 'power2.in' }, T + 28.3);
    links.forEach((ln) => ln.out(tl, T + 28.3));
    K.fadeOut(tl, okLabels, T + 28.3, { y: 0 });
    tl.to(propRings, { opacity: 0, duration: 0.3 }, T + 28.3);

    // ---- 刷新：新消息从顶上滑进来（真实录屏） ----
    const N = { x: 900, y: 52, w: 540, h: 360 };
    A.clipTo(tl, T + 28.8, N, 1.0, 16);
    cam.to(tl, T + 28.8, { rect: N, h: 540, anchor: [1330, 560], duration: 1.0 });
    OM.sfx('whip', T + 29.1, { gain: 0.35 });
    const RATE2 = 0.6, V1 = T + 29.3, nT = (c) => V1 + c / RATE2;
    A.addVideo('notice-clip', 'assets/clips/notice-slide-in.mp4', { start: V1, dur: T + 40.5 - V1, rate: RATE2 });
    A.swap(tl, V1, 'notice-clip');
    const refresh = A.r('refresh', 'affairs');
    tl.set(cur.el, { x: 1300, y: 330 }, T + 29.6);
    cur.move(tl, T + 29.6, 1300, 330, 0.01);
    cur.show(tl, T + 29.7);
    cur.move(tl, T + 29.8, refresh.x + 14, refresh.y + 15, nT(0.833) - (T + 29.8) - 0.08);
    cur.click(tl, nT(0.833));
    cur.move(tl, nT(1.0), 1330, 140, 0.6);
    OM.sfx('slide', nT(1.2), { dur: 0.6, gain: 0.3 });
    const c3 = K.caption(node, { kicker: '随时更新', title: '新消息，\n从顶上滑进来', size: 56, x: 120, y: 330, width: 560, id: 'memo-cap3',
      body: '刷新一下，学校和群里的新消息<br>按时间排进同一条。' });
    c3.in(tl, T + 30.0);
    const tab = A.r('feed.tab[0]', 'affairs');
    const rgTab = K.ring(A, K.pad(tab, 4, 2), { radius: 8, width: 2.5 });
    K.draw(tl, rgTab, nT(1.9), 0.5);
    const [tx, ty] = cam.toStage(tab.x + tab.w, tab.y + tab.h / 2);
    const lTab = K.label(node, '51 → 54', { cls: 'blue', x: tx + 14, y: ty, origin: '0% 50%' });
    gsap.set(lTab, { yPercent: -50 });
    K.pop(tl, lTab, nT(2.0)); OM.sfx('pop', nT(2.0), { note: 5, gain: 0.45 });
    // 收尾：回到整个窗口，下一场从侧栏点「日程表」
    c3.out(tl, T + 37.0);
    K.fadeOut(tl, lTab, T + 37.0, { y: 0 });
    K.undraw(tl, rgTab, T + 37.0);
    A.clipTo(tl, T + 37.6, K.WHOLE, 1.1, 14);
    cam.to(tl, T + 37.6, { rect: K.WHOLE, w: 1560, anchor: [960, 548], duration: 1.1 });
    cur.move(tl, T + 37.8, K.NAV.schedule.x + 80, K.NAV.schedule.y + 17, 1.4);
  },
});

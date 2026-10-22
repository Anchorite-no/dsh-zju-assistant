/* 学习：录播、课件、课后总结，点开讲解。34 秒（17 小节）。上一场光标停在侧栏「学习」上。
   侧栏点「学习」→ 选数据结构基础 → 第 5 次课：回放、课件、截图、字幕 → 课后总结往下滚 → 点「播放」，讲解窗口打开，先放一段。
   讲解窗口建在共用的 LESSON 层上，下一场（这一讲怎么做出来的）接着用。 */
SCENES.push({
  id: 'learning', part: 2, bars: 17,
  build(tl, T, node) {
    const A = APP, cam = A.cameraman, cur = A.cursor;
    K.show(tl, A.node, T); K.show(tl, node, T); K.hide(tl, node, T + 34.5);
    cur.click(tl, T + 0.2);
    A.page(tl, T + 0.2, 'learning');
    const PAGE = { x: 440, y: 52, w: 1000, h: 760 };
    A.clipTo(tl, T + 0.9, PAGE, 1.1, 16);
    cam.to(tl, T + 0.9, { rect: PAGE, zoom: 1.08, anchor: [1360, 548], duration: 1.1 });
    cur.move(tl, T + 0.5, 600, 700, 0.8);
    const c1 = K.caption(node, { kicker: '学习', title: '每门课的录播和课件，\n按课排好', size: 52, x: 120, y: 300, width: 560, id: 'learn-cap1',
      body: '智云课堂、学在浙大、学习通上的，<br>都归到对应的那门课下面。' });
    c1.in(tl, T + 1.5);
    // 选数据结构基础
    const crs = A.r('learn.course[5]', 'learning');
    cur.move(tl, T + 3.0, crs.x + 140, crs.y + 30, 0.9);
    cur.click(tl, T + 4.0);
    A.swap(tl, T + 4.0, 'learning-course');
    const l0 = A.r('learn.lesson[0]', 'learning-course');
    const rgL0 = K.ring(A, K.pad(l0, -2, -2), { radius: 8, width: 3 });
    K.draw(tl, rgL0, T + 4.6, 0.5);
    const [bx, by] = cam.toStage(l0.x + l0.w, l0.y + l0.h + 4);
    const lBadge = K.label(node, '这次课已经有总结和讲解', { cls: 'blue', x: bx - 4, y: by + 8, origin: '100% 0%' });
    gsap.set(lBadge, { xPercent: -100 });
    K.pop(tl, lBadge, T + 5.0); OM.sfx('pop', T + 5.0, { note: 4, gain: 0.4 });
    cur.move(tl, T + 5.7, l0.x + 200, l0.y + 30, 0.8);
    K.fadeOut(tl, lBadge, T + 6.4, { y: 0 });
    cur.click(tl, T + 6.7);
    K.undraw(tl, rgL0, T + 6.7);
    A.swap(tl, T + 6.7, 'learning-lesson');
    c1.out(tl, T + 6.7);

    // 一次课的四样资料
    const RES = K.pad(A.r('section[2]', 'learning-lesson'), 6, 4);
    const COL = { x: 905, y: 120, w: 516, h: 880 };
    A.clipTo(tl, T + 7.1, COL, 1.1, 16);
    cam.to(tl, T + 7.1, { rect: RES, zoom: 1.5, anchor: [1270, 470], duration: 1.1 });
    cur.move(tl, T + 7.2, 1380, 600, 0.6);
    cur.hide(tl, T + 7.8);
    const c2 = K.caption(node, { kicker: '一次课', title: '回放、课件、截图、字幕，\n一处查齐', size: 50, x: 120, y: 300, width: 600, id: 'learn-cap2',
      body: '录播在本机转写，不需要显卡：<br>实测 148 分钟的课，普通台式机 113 秒转完。' });
    c2.in(tl, T + 7.8);
    ['resource[0]', 'resource[1]', 'resource[2]', 'resource[3]'].forEach((n, j) => {
      const r = A.r(n, 'learning-lesson');
      const b = K.bar(A, K.pad(r, -2, -3));
      const at = T + 8.7 + j * 0.45;
      tl.to(b, { opacity: 1, duration: 0.2 }, at).to(b, { opacity: 0, duration: 0.6 }, at + 1.6);
      OM.sfx('tick', at, { note: j + 2, gain: 0.35 });
    });
    c2.out(tl, T + 13.0);

    // 课后总结：按时间点分节，往下滚
    const c3 = K.caption(node, { kicker: '课后总结', title: '一个半小时的课，\n读一页就够', size: 54, x: 120, y: 300, width: 560, id: 'learn-cap3',
      body: '按录播时间分节，每节标出起止时间，<br>最后列出课后要做的。' });
    c3.in(tl, T + 13.6);
    const h2L = [0, 1, 2].map((i) => A.r(`summary.h2[${i}]`, 'learning-lesson'));
    cam.to(tl, T + 13.2, { focus: [1163, 640], zoom: 1.5, anchor: [1270, 540], duration: 1.0 });
    const tsRing = (r, at) => {
      const rg = K.ring(A, { x: r.x + 2, y: r.y - 3, w: 74, h: r.h + 6 }, { radius: 6, width: 2.5 });
      K.draw(tl, rg, at, 0.35); OM.sfx('tick', at, { gain: 0.4 });
      tl.to(rg, { opacity: 0, duration: 0.4 }, at + 1.4);
      return rg;
    };
    // 往下：先在课次页上走到 y≈860，再换成滚过 604 像素的那张图（镜头同一帧反向补 604），接着往下走
    cam.to(tl, T + 14.2, { focus: [1163, 860], zoom: 1.5, duration: 2.6, ease: 'sine.inOut' });
    h2L.forEach((r, j) => tsRing(r, T + 14.4 + j * 0.75));
    const SCROLL = 604;
    A.swap(tl, T + 16.8, 'learning-summary');
    cam.to(tl, T + 16.8, { focus: [1163, 860 - SCROLL], zoom: 1.5, duration: 0.001, ease: 'none' });
    cam.to(tl, T + 16.801, { focus: [1163, 720], zoom: 1.5, duration: 2.8, ease: 'sine.inOut' });
    [2, 3, 4].forEach((i, j) => tsRing(A.r(`summary.h2[${i}]`, 'learning-summary'), T + 17.3 + j * 0.8));
    c3.out(tl, T + 19.8);

    // 讲解：点「播放」
    const FILM = A.r('section[3]', 'learning-summary');
    cam.to(tl, T + 19.6, { rect: K.pad(FILM, 20, 120), zoom: 1.4, anchor: [1270, 560], duration: 1.0 });
    const c4 = K.caption(node, { kicker: '讲解', title: '没听懂的课，\n让它重讲一遍', size: 56, x: 120, y: 300, width: 560, id: 'learn-cap4',
      body: '先把课件和录播学懂，<br>再从你已经会的地方讲起。' });
    c4.in(tl, T + 20.2);
    tl.set(cur.el, { x: 1300, y: 990 }, T + 20.9);
    cur.move(tl, T + 20.9, 1300, 990, 0.01);
    cur.show(tl, T + 21.0);
    const play = { x: FILM.x + FILM.w - 70, y: FILM.y + 18, w: 56, h: 26 };
    cur.move(tl, T + 21.1, play.x + 26, play.y + 13, 0.9);
    cur.click(tl, T + 22.2);
    c4.out(tl, T + 22.4);

    // ---- 讲解窗口另开：从「播放」那里放大出来，先放一段（十二个月份一个个插进去） ----
    const L = (window.LESSON = { node: K.el('section', 'scene lesson-layer', node.parentNode) });
    K.show(tl, L.node, T + 22.3);
    const win = (L.win = K.el('div', 'film-win', L.node));
    win.dataset.omId = 'film-window';
    // 窗口里是应用讲解引擎做出来的那一集，逐帧录下来的；放完停在最后一帧
    const still = K.el('img', 'film-still', win);
    still.src = 'assets/lesson/months-end.png';
    L.video = (id, src, start, dur, mediaStart, rate) => {
      const v = K.el('video', null, win);
      v.id = id; v.muted = true; v.setAttribute('muted', ''); v.setAttribute('playsinline', '');
      v.src = src; v.dataset.start = start.toFixed(3); v.dataset.duration = dur.toFixed(3);
      v.dataset.mediaStart = mediaStart; v.dataset.playbackRate = rate; v.dataset.trackIndex = 2;
      // 只在自己那一段里露出来，放完露出下面那一层
      gsap.set(v, { opacity: 0 });
      tl.set(v, { opacity: 1 }, start);
      tl.set(v, { opacity: 0 }, start + dur);
      return v;
    };
    // lesson-months60.mp4 从讲解的 1486 秒录起（60 帧）；原速放 1488.7–1499.1 秒，正好是 g6 这一句：头三个一路向右，和刚才的 1、2、3 是同一回事
    L.video('v-months', 'assets/clips/lesson-months60.mp4', T + 22.4, 10.4, 2.7, 1);
    const [px, py] = cam.toStage(play.x + 26, play.y + 13);
    L.playAt = [px, py]; // 下一场结束时窗口收回到这里
    gsap.set(win, { x: px - 960, y: py - 540, scale: 0.05, opacity: 0, transformOrigin: '50% 50%' });
    tl.to(win, { x: 0, y: 50, scale: 0.8, opacity: 1, duration: 0.9, ease: 'expo.out' }, T + 22.4);
    OM.sfx('whoosh', T + 22.5, { gain: 0.4 });
    tl.to(A.tilt, { opacity: 0.08, duration: 0.6 }, T + 22.5);
    cur.hide(tl, T + 22.4);
    const head = K.chars(L.node, '带动画、公式和字幕的讲解，{在应用里直接放}', 'cap-t', { position: 'absolute', left: '50%', top: '70px', fontSize: '42px', transform: 'translateX(-50%)' });
    head.dataset.omId = 'film-head';
    K.rise(tl, head, T + 23.4, { stagger: 0.025 });
    K.sink(tl, head, T + 32.8);
  },
});

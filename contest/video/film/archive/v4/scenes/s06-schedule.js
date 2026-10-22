/* 日程表。32 秒（16 小节）。从侧栏点进来 → 一周的格子 → 依次推到：现在、双周的课、期中考试、延后的截止、带时间的备忘 → 拉回全周。 */
SCENES.push({
  id: 'schedule', part: 2, bars: 16,
  build(tl, T, node) {
    const A = APP, cam = A.cameraman, cur = A.cursor;
    K.show(tl, A.node, T); K.show(tl, node, T); K.hide(tl, node, T + 32.5);
    const S = 'schedule';
    // 上一场的光标停在侧栏「日程表」上
    cur.show(tl, T);
    cur.click(tl, T + 0.3);
    A.swap(tl, T + 0.3, S);
    const G = { x: 452, y: 50, w: 976, h: 836 };
    A.clipTo(tl, T + 1.0, G, 1.1, 16);
    cam.to(tl, T + 1.0, { rect: G, h: 900, anchor: [1300, 548], duration: 1.1 });
    cur.move(tl, T + 0.6, 700, 960, 0.8);
    cur.hide(tl, T + 1.2);
    OM.sfx('whoosh', T + 1.4, { gain: 0.4 });
    const c1 = K.caption(node, { kicker: '日程表 · 秋学期第 6 周', title: '课、考试、截止，\n排进同一张表', size: 54, x: 120, y: 300, width: 520, id: 'sched-cap',
      body: '周次、单双周、放假和调休<br>都按校历算好。' });
    c1.in(tl, T + 1.8);
    c1.out(tl, T + 5.2);

    // 一处一处推近，每处一个标签
    const L = [];
    let prevLabel = null;
    const stop = (at, rect, text, o = {}) => {
      cam.to(tl, at, { rect, zoom: o.zoom ?? 1.5, anchor: o.anchor ?? [960, 560], duration: 0.8 });
      const rings = (o.rings || [rect]).map((r) => { const rg = K.ring(A, K.pad(r, 3, 3), { radius: 8, width: 3, color: o.color }); K.draw(tl, rg, at + 0.7, 0.45); return rg; });
      const p = o.labelAt || [rect.x + rect.w + 10, rect.y];
      const [lx, ly] = cam.toStage(p[0], p[1]);
      const l = K.label(node, text, { cls: o.cls || 'blue', x: lx + 8, y: ly, origin: '0% 0%' });
      K.pop(tl, l, at + 0.95);
      OM.sfx(o.sfx || 'pop', at + 0.95, { note: o.note || 3, gain: 0.45 });
      if (prevLabel) K.fadeOut(tl, prevLabel, at - 0.05, { y: 0, dur: 0.25 });
      prevLabel = l;
      L.push(l, ...rings);
      return { l, rings };
    };
    const r = (n) => A.r(n, S);
    const now = r('grid.now');
    // 现在那条红线
    const s1 = stop(T + 5.6, { x: now.x - 130, y: now.y - 130, w: 390, h: 260 }, '现在 · 周三 15:40', { rings: [], labelAt: [now.x + now.w + 6, now.y - 18], cls: 'dark', note: 1 });
    const dot = K.el('div', 'nowdot', A.layer);
    K.css(dot, { left: now.x - 6, top: now.y - 6 });
    gsap.set(dot, { scale: 0 });
    tl.to(dot, { scale: 1, duration: 0.4, ease: OM.spring(0.3) }, T + 6.4);
    tl.fromTo(dot, { boxShadow: '0 0 0 0 rgba(239,68,68,.45)' }, { boxShadow: '0 0 0 16px rgba(239,68,68,0)', duration: 1.1, repeat: 1, ease: 'power1.out', immediateRender: false }, T + 6.5);
    // 双周才有的课
    const b8 = r('block[8]'), b10 = r('block[10]');
    stop(T + 8.2, K.union(b8, b10), '双周才有：机房上机、物理实验', { rings: [b8, b10], labelAt: [b10.x + b10.w + 10, b10.y], note: 2 });
    // 期中考试
    const b13 = r('block[13]');
    stop(T + 10.8, K.pad(b13, 60, 60), '期中考试 · 座位 37', { rings: [b13], labelAt: [b13.x + b13.w + 10, b13.y], color: '#f59e0b', cls: 'amber', note: 4 });
    // 延后的截止：贯穿全片的那条线
    const p4 = r('pin[4]'), p5 = r('pin[5]');
    stop(T + 13.4, K.pad(K.union(p4, p5), 40, 40), '延后两天后的新截止 · 周五 23:59', { rings: [p4, p5], labelAt: [p4.x + p4.w + 10, p5.y], note: 5, sfx: 'ding' });
    // 带时间的备忘
    const b9 = r('block[9]'), b12 = r('block[12]'), b14 = r('block[14]');
    stop(T + 16.2, K.union(b9, b12, b14), '备忘录里带时间的事，落在对应那天', { rings: [b9, b12, b14], labelAt: [b14.x + b14.w + 10, b14.y], zoom: 1.32, note: 3 });

    // 拉回全周：标签收起，框留着
    cam.to(tl, T + 19.4, { rect: G, h: 960, anchor: [960, 548], duration: 1.2 });
    tl.to(L.filter((x) => x.classList && x.classList.contains('label')), { opacity: 0, duration: 0.3 }, T + 19.3);
    tl.to(dot, { opacity: 0, duration: 0.3 }, T + 8.15);
    const head = K.chars(node, '这一周要做的事，{一屏看完}', 'cap-t', { position: 'absolute', left: '50%', top: '22px', fontSize: '44px', transform: 'translateX(-50%)' });
    head.dataset.omId = 'sched-head';
    K.rise(tl, head, T + 20.6, { stagger: 0.03 });
    OM.sfx('chime', T + 21.0, { gain: 0.4 });
    K.sink(tl, head, T + 27.0);
    tl.to(L.filter((x) => !(x.classList && x.classList.contains('label'))), { opacity: 0, duration: 0.4 }, T + 27.0);
    // 下一场：回到整个窗口，点「新会话」
    A.clipTo(tl, T + 28.2, K.WHOLE, 1.1, 14);
    cam.to(tl, T + 28.2, { rect: K.WHOLE, w: 1560, anchor: [960, 548], duration: 1.1 });
    cur.show(tl, T + 28.8);
    cur.move(tl, T + 28.8, 139, 113, 1.4);
  },
});

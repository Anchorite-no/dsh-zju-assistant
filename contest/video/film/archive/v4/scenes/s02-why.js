/* 为什么通用 AI 帮不上。24 秒（12 小节）。白底。
   「今天的 AI 已经足够聪明」→「可在校园里，它帮不上忙」→ 够不着（三把锁）→ 不会拼（四个平台、一堆问号）。 */
SCENES.push({
  id: 'why', part: 1, bars: 11,
  build(tl, T, node) {
    K.show(tl, node, T); K.hide(tl, node, T + 22.2);
    const a = K.chars(node, '今天的 AI，已经足够聪明', 'kt dark');
    const aSub = K.lines(node, '读懂一则通知、总结一节课、排一份复习计划，都不难。', 'kt-sub');
    K.rise(tl, a, T + 0.3, { stagger: 0.04 });
    K.fadeUp(tl, aSub, T + 1.2);
    K.sink(tl, a, T + 4.4); K.fadeOut(tl, aSub, T + 4.4);
    const b = K.chars(node, '可在校园里，{它帮不上忙}', 'kt dark');
    K.rise(tl, b, T + 4.9, { stagger: 0.05 });
    OM.sfx('hit', T + 4.9, { gain: 0.35 });
    tl.to(b, { y: -330, scale: 0.62, duration: 0.9, ease: 'expo.inOut', transformOrigin: '50% 50%' }, T + 7.0);

    // ---- 左：够不着 ----
    const L = K.el('div', 'why-col', node); K.css(L, { left: 150, top: 300 });
    const lt = K.chars(L, '一、{够不着}', 'why-t');
    const LOCK = '<svg viewBox="0 0 24 24" width="34" height="34"><path class="shackle" d="M7 11V8a5 5 0 0 1 10 0v3" fill="none" stroke="currentColor" stroke-width="2"/><rect x="5" y="11" width="14" height="10" rx="2.5" fill="currentColor"/></svg>';
    const gates = ['统一身份认证', '只在校园网内开放', '群聊在你自己的电脑上'].map((txt, i) => {
      const g = K.el('div', 'gate', L, `${LOCK}<span>${txt}</span>`);
      K.css(g, { top: 110 + i * 92 });
      gsap.set(g, { opacity: 0, x: -24 });
      gsap.set(g.querySelector('.shackle'), { y: -5 });
      return g;
    });
    K.rise(tl, lt, T + 7.6, { stagger: 0.05 });
    gates.forEach((g, i) => {
      const at = T + 8.6 + i * 1.0;
      tl.to(g, { opacity: 1, x: 0, duration: 0.5, ease: 'expo.out' }, at);
      tl.to(g.querySelector('.shackle'), { y: 0, duration: 0.2, ease: 'power3.in' }, at + 0.55);
      OM.sfx('stamp', at + 0.75, { gain: 0.35, pan: -0.4 });
    });
    const lsay = K.lines(L, '通用的 AI 助手进不去，<br>看不到你的课表、作业和群消息。', 'why-say');
    K.css(lsay, { top: 400 });
    K.fadeUp(tl, lsay, T + 11.8);

    // ---- 右：不会拼 ----
    const Rr = K.el('div', 'why-col', node); K.css(Rr, { left: 1000, top: 300 });
    const rt = K.chars(Rr, '二、{不会拼}', 'why-t');
    K.rise(tl, rt, T + 14.0, { stagger: 0.05 });
    const ov = K.svg('svg', { class: 'why-ov', viewBox: '0 0 760 560', width: 760, height: 560 }, Rr);
    const center = [380, 300];
    const tiles = [['教务网', '课表 · 教学班'], ['学在浙大', '作业'], ['智云课堂', '录播'], ['钉钉', '课程群']];
    const pos = [[110, 150], [650, 150], [110, 450], [650, 450]];
    const hub = K.el('div', 'why-hub', Rr, '大学物理（乙）Ⅱ');
    K.css(hub, { left: center[0], top: center[1] });
    gsap.set(hub, { xPercent: -50, yPercent: -50, scale: 0 });
    tl.to(hub, { scale: 1, duration: 0.5, ease: OM.spring(0.25) }, T + 14.8);
    tiles.forEach(([n, d], i) => {
      const t = K.el('div', 'why-tile', Rr, `<b>${n}</b><span>${d}</span>`);
      K.css(t, { left: pos[i][0], top: pos[i][1] });
      gsap.set(t, { xPercent: -50, yPercent: -50, scale: 0.6, opacity: 0 });
      const at = T + 15.2 + i * 0.4;
      tl.to(t, { scale: 1, opacity: 1, duration: 0.5, ease: OM.spring(0.2) }, at);
      OM.sfx('pop', at, { note: i + 2, gain: 0.35, pan: 0.4 });
      const p = K.svg('line', { x1: center[0], y1: center[1], x2: pos[i][0], y2: pos[i][1], stroke: '#cfd3d6', 'stroke-width': 2, 'stroke-dasharray': '6 8', opacity: 0 }, ov);
      tl.to(p, { opacity: 1, duration: 0.3 }, at + 0.2);
      const q = K.el('div', 'why-q', Rr, '?');
      K.css(q, { left: (center[0] + pos[i][0]) / 2, top: (center[1] + pos[i][1]) / 2 });
      gsap.set(q, { xPercent: -50, yPercent: -50, scale: 0 });
      tl.to(q, { scale: 1, duration: 0.4, ease: OM.spring(0.45) }, T + 17.2 + i * 0.25);
    });
    OM.sfx('glitch', T + 17.2, { gain: 0.25 });
    const rsay = K.lines(Rr, '哪个群属于哪门课？同名的课是不是同一个教学班？<br>群里说延后、平台没改，听谁的？', 'why-say');
    K.css(rsay, { top: 620 });
    K.fadeUp(tl, rsay, T + 18.6);

    // 全部吸进中间，下一场的窗口从这里出来
    const parts = [b, L, Rr];
    tl.to(parts, { scale: 0.2, opacity: 0, duration: 0.8, ease: 'power3.in', transformOrigin: '50% 50%' }, T + 20.9);
    OM.sfx('reverse', T + 22.0, { dur: 1.2, gain: 0.35 });
  },
});

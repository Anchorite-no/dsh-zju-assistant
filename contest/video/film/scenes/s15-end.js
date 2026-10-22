/* 落版。12 秒（6 小节）。一张课表的格子一格格亮起（呼应日程表），收进中间长出应用图标，再出产品名和一句话。 */
SCENES.push({
  id: 'end', part: 3, bars: 6,
  build(tl, T, node) {
    K.show(tl, node, T);
    const grid = K.el('div', 'end-grid', node);
    const R = OM.random(77);
    const cells = [];
    for (let r = 0; r < 6; r++) for (let c = 0; c < 7; c++) {
      const e = K.el('div', 'eg', grid);
      K.css(e, { left: c * 120, top: r * 72 });
      const on = R() < 0.42;
      if (on) e.classList.add(['b1', 'b2', 'b3'][Math.floor(R() * 3)]);
      gsap.set(e, { opacity: 0, scale: 0.6 });
      // 从中间（上一场三张卡收进去的地方）往外一圈圈亮起
      cells.push({ e, at: T + 0.05 + (Math.abs(r - 2.5) + Math.abs(c - 3)) * 0.09 + R() * 0.1 });
    }
    cells.forEach(({ e, at }) => tl.to(e, { opacity: 1, scale: 1, duration: 0.35, ease: OM.spring(0.2) }, at));
    OM.sfx('sparkle', T + 0.5, { gain: 0.3 });
    // 格子收成一行字
    tl.to(grid, { scale: 0.18, opacity: 0, duration: 0.9, ease: 'expo.in', transformOrigin: '50% 50%' }, T + 2.6);
    const name = K.chars(node, '校园智能体', 'end-t');
    name.dataset.omVar = 'product'; name.dataset.omId = 'end-title';
    const tag = K.chars(node, '把散在各处的校园信息，串成{你自己的日常}', 'end-s');
    // 格子收进中间，长出应用图标，再升到名字上面
    const icon = K.icon(node, 885, 465, 150);
    icon.dataset.omId = 'end-icon';
    gsap.set(icon, { scale: 0, rotation: -20, transformOrigin: '50% 50%' });
    tl.to(icon, { scale: 1, rotation: 0, duration: 0.6, ease: OM.spring(0.25) }, T + 3.2);
    tl.to(icon, { y: -280, scale: 0.86, duration: 0.8, ease: 'expo.inOut' }, T + 3.9);
    K.rise(tl, name, T + 4.3, { dur: 1.0, stagger: 0.09 });
    OM.sfx('impact', T + 3.3, { gain: 0.4 });
    K.rise(tl, tag, T + 5.2, { stagger: 0.025 });
    tl.to(node, { opacity: 0, duration: 0.8, ease: 'power2.in' }, T + 11.0);
  },
});

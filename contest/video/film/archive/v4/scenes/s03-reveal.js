/* 产品登场。10 秒（5 小节）。窗口从中心的一点转出来落定，标题逐字顶上，三个数字跳出来。 */
SCENES.push({
  id: 'reveal', part: 1, bars: 5, noDrift: true,
  build(tl, T, node) {
    K.show(tl, node, T); K.hide(tl, node, T + 10.2);
    const s = K.screen(node, 'affairs', { id: 'hero-window' });
    s.cameraman.set({ rect: K.WHOLE, w: 1080, anchor: [1340, 560] });
    gsap.set(s.tilt, { rotationY: -38, rotationX: 22, z: -900, opacity: 0, scale: 0.4 });
    tl.to(s.tilt, { rotationY: -14, rotationX: 6, z: 0, opacity: 1, scale: 1, duration: 1.6, ease: 'expo.out' }, T + 0.15);
    tl.to(s.tilt, { rotationY: -9, rotationX: 3, duration: 5.6, ease: 'none' }, T + 1.75);
    OM.sfx('impact', T + 0.4, { gain: 0.45 });
    OM.sfx('subdrop', T + 0.4, { dur: 1.2, gain: 0.35 });
    const ring = K.el('div', 'burst', node);
    gsap.set(ring, { xPercent: -50, yPercent: -50, scale: 0, opacity: 0.9 });
    tl.to(ring, { scale: 14, opacity: 0, duration: 1.2, ease: 'power2.out' }, T + 0.1);

    const title = K.chars(node, '校园智能体', 'hero-t', null);
    title.dataset.omVar = 'product'; title.dataset.omId = 'title';
    const tag1 = K.chars(node, '把散在各处的校园信息', 'hero-s');
    const tag2 = K.chars(node, '串成{你自己的日常}', 'hero-s');
    K.css(tag2, { top: 568 });
    K.rise(tl, title, T + 0.9, { dur: 0.9, stagger: 0.08 });
    K.rise(tl, tag1, T + 1.8, { stagger: 0.025 });
    K.rise(tl, tag2, T + 2.1, { stagger: 0.025 });
    const stats = K.el('div', 'hero-stats', node);
    stats.dataset.omId = 'hero-stats';
    const items = [[17, '个校园系统模块'], [159, '条命令'], [69, '个官网的通知']].map(([n, t], i) => {
      const it = K.el('div', 'hs', stats, `<b>0</b><span>${t}</span>`);
      gsap.set(it, { opacity: 0, y: 24 });
      tl.to(it, { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out' }, T + 3.0 + i * 0.25);
      K.count(tl, it.querySelector('b'), 0, n, T + 3.05 + i * 0.25, 1.2);
      return it;
    });
    OM.sfx('count', T + 3.05, { dur: 1.4, gain: 0.35 });
    // 收：字退场，窗口摆正、缩到中间，下一场的图从它长出来
    K.sink(tl, title, T + 7.4, { stagger: 0.03 }); K.sink(tl, tag1, T + 7.4); K.sink(tl, tag2, T + 7.45);
    tl.to(items, { opacity: 0, y: -16, duration: 0.35, stagger: 0.05 }, T + 7.4);
    tl.to(s.tilt, { rotationY: 0, rotationX: 0, duration: 1.2, ease: 'power3.inOut' }, T + 7.8);
    // 标题停留时窗口慢慢往前推，再摆正、缩到中间（摄像机按调用顺序衔接，先写早的那一步）
    s.cameraman.to(tl, T + 1.75, { rect: K.WHOLE, w: 1100, anchor: [1360, 560], duration: 5.6, ease: 'sine.inOut', noDrift: true });
    s.cameraman.to(tl, T + 7.8, { rect: K.WHOLE, w: 560, anchor: [960, 560], duration: 1.6, noDrift: true });
  },
});

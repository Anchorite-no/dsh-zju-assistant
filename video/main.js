/* 把各场景按顺序排到一条时间线上。120 BPM：一拍 0.5 秒，一小节 2 秒；场景长度按小节算，切换都落在小节线上。
   第二段（实操）共用一个应用窗口 APP：一台摄像机、一个光标，从头连到尾，页面之间用侧栏点过去。 */
(() => {
  const film = document.getElementById('film');
  const stage = document.getElementById('stage');
  const k = Number(film.dataset.width) / K.W;
  film.style.width = film.dataset.width + 'px';
  film.style.height = film.dataset.height + 'px';
  stage.style.transform = `scale(${k})`;

  OM.music({ bpm: 120 });
  const BAR = 2;
  const tl = gsap.timeline({ paused: true });
  const world = document.getElementById('world');

  // 侧栏导航（截图逻辑坐标，几张页面截图里位置相同）
  K.NAV = {
    newchat: { x: 12, y: 94, w: 254, h: 38 },
    plugins: { x: 14, y: 144, w: 252, h: 36 }, schedule: { x: 14, y: 184, w: 252, h: 36 },
    affairs: { x: 14, y: 224, w: 252, h: 36 }, learning: { x: 14, y: 264, w: 252, h: 36 },
  };
  K.WHOLE = { x: 0, y: 0, w: K.SW, h: K.SH };

  let t = 0;
  for (const sc of window.SCENES) {
    if (sc.part === 2 && !window.APP) {
      const layer = K.el('section', 'scene', world);
      layer.id = 'app-layer';
      window.APP = K.screen(layer, 'affairs', { id: 'app' });
      window.APP.node = layer;
      window.APP.cursor = K.cursor(window.APP, 800, 1060);
    }
    const node = K.el('section', 'scene', world);
    node.id = 's-' + sc.id;
    sc.t0 = t;
    tl.addLabel('scene:' + sc.id, t);
    sc.build(tl, t, node, sc);
    // 第一、三段的舞台整场慢慢推近一点，镜头不停在一个地方（第二段由 APP 的摄像机自己漂）
    if (sc.part !== 2 && !sc.noDrift) tl.fromTo(node, { scale: 1 }, { scale: 1.035, duration: sc.bars * BAR, ease: 'none', transformOrigin: '50% 50%', immediateRender: false }, t);
    t += sc.bars * BAR;
  }
  tl.to({}, { duration: 0.01 }, t - 0.01);
  window.__timelines = window.__timelines || {};
  window.__timelines.film = tl;
})();

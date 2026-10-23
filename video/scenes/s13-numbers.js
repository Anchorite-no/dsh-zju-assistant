/* 第三段：实测数字。40 秒（20 小节）。蓝色场，每个数字落在拍上；右边配一个会动的数据图。数字全部来自申报书里的实测。 */
SCENES.push({
  id: 'numbers', part: 3, bars: 20,
  build(tl, T, node) {
    K.show(tl, node, T); K.hide(tl, node, T + 40.4);
    // 从白场里长出蓝色场
    const flood = K.el('div', 'flood', node);
    gsap.set(flood, { clipPath: 'circle(0% at 50% 50%)' });
    tl.to(flood, { clipPath: 'circle(75% at 50% 50%)', duration: 0.9, ease: 'expo.inOut' }, T + 0.0);
    OM.sfx('reverse', T + 0.9, { dur: 1.0, gain: 0.35 });
    const ink = K.el('div', 'inkfield', node);
    gsap.set(ink, { opacity: 0 });
    const card = K.el('div', 'chapter-card on-blue', node);
    card.dataset.omId = 'part3-card';
    const num = K.el('div', 'cc-num', card, '03');
    const ttl = K.chars(card, '应用成效与反思', 'cc-title');
    const sub = K.lines(card, '下面的数字都是实测', 'cc-sub');
    gsap.set(num, { opacity: 0, y: 30 });
    tl.to(num, { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out' }, T + 0.9);
    K.rise(tl, ttl, T + 1.0, { stagger: 0.05 });
    K.fadeUp(tl, sub, T + 1.5);
    tl.to(card, { opacity: 0, y: -40, duration: 0.45, ease: 'power3.in' }, T + 4.4);

    const R = OM.random(56);
    const SHOTS = [
      { at: 5.0, big: '56 → 23', unit: '条', line: '一周的通知和推文，20 秒筛完', small: '收起 33 条和这名学生无关的，只收起、不删除', viz: 'grid' },
      { at: 10.0, big: '20 / 20', unit: '', line: '有截止时间的通知，测了 20 次，<br>截止时间全部抓对', small: '写法和原文一致；没有截止时间的，一次也没有编造日期', bg: 'ink', viz: 'checks' },
      { at: 15.0, big: '113', unit: '秒', line: '148 分钟的录播，<br>在普通台式机的 CPU 上转写完', small: '不需要显卡', count: [0, 113], viz: 'bar' },
      { at: 20.0, big: '10.52', unit: '%', line: '和智云官方字幕的差异率', small: '需要显卡的方案是 10.28%，基本持平', bg: 'ink', viz: 'compare' },
      { at: 25.0, big: '81 / 81', unit: '', line: '对话后自动整理档案，<br>没有一次写错或多写', small: '27 段测试对话，各跑 3 遍；每处改动都有记录、都能撤销', viz: 'dots' },
    ];
    SHOTS.forEach((sh, i) => {
      const box = K.el('div', 'num-shot', node);
      box.dataset.omId = 'num-' + i;
      const big = K.el('div', 'ns-big', box, `<span>${sh.big}</span><em>${sh.unit}</em>`);
      const line = K.el('div', 'ns-line', box, sh.line);
      const small = K.el('div', 'ns-small', box, sh.small);
      const t0 = T + sh.at, t1 = T + (SHOTS[i + 1] ? SHOTS[i + 1].at : 31.0);
      gsap.set(box, { opacity: 0 });
      tl.set(box, { opacity: 1 }, t0);
      tl.fromTo(big, { scale: 1.35, opacity: 0, filter: 'blur(8px)' }, { scale: 1, opacity: 1, filter: 'blur(0px)', duration: 0.5, ease: 'expo.out', immediateRender: false, transformOrigin: '0% 50%' }, t0);
      gsap.set([line, small], { opacity: 0, y: 16 });
      tl.to(line, { opacity: 1, y: 0, duration: 0.5, ease: 'expo.out' }, t0 + 0.35);
      tl.to(small, { opacity: 1, y: 0, duration: 0.5, ease: 'expo.out' }, t0 + 0.7);
      if (sh.count) K.count(tl, big.querySelector('span'), sh.count[0], sh.count[1], t0, 1.1);
      OM.sfx('hit', t0, { gain: 0.42 });
      tl.set(ink, { opacity: sh.bg === 'ink' ? 1 : 0 }, t0);
      tl.to(box, { opacity: 0, y: -20, duration: 0.3, ease: 'power2.in' }, t1 - 0.3);

      // 右边的数据图
      const viz = K.el('div', 'viz', node);
      gsap.set(viz, { opacity: 0 });
      tl.set(viz, { opacity: 1 }, t0);
      tl.to(viz, { opacity: 0, duration: 0.3 }, t1 - 0.3);
      if (sh.viz === 'grid') {
        // 56 个格子：扫过以后 33 个变暗收起，23 个留下排整齐
        const keep = new Set([...Array(56).keys()].sort(() => R() - 0.5).slice(0, 23));
        let k = 0;
        for (let j = 0; j < 56; j++) {
          const c = K.el('div', 'vcell', viz);
          const x = (j % 8) * 74, y = Math.floor(j / 8) * 74;
          K.css(c, { left: x, top: y });
          gsap.set(c, { scale: 0 });
          tl.to(c, { scale: 1, duration: 0.3, ease: OM.spring(0.3) }, t0 + 0.1 + (j % 8 + Math.floor(j / 8)) * 0.025);
          if (keep.has(j)) {
            const nx = (k % 6) * 74 + 74, ny = Math.floor(k / 6) * 74 + 74; k++;
            tl.to(c, { x: nx - x, y: ny - y, duration: 0.7, ease: 'expo.inOut' }, t0 + 2.2 + k * 0.01);
          } else {
            tl.to(c, { opacity: 0.12, scale: 0.55, duration: 0.35 }, t0 + 1.2 + (j % 8) * 0.06);
            tl.to(c, { opacity: 0, y: '+=40', duration: 0.5, ease: 'power2.in' }, t0 + 2.1 + (j % 5) * 0.03);
          }
        }
        OM.sfx('slide', t0 + 1.2, { dur: 0.6, gain: 0.25 });
      } else if (sh.viz === 'checks') {
        for (let j = 0; j < 20; j++) {
          const c = K.el('div', 'vcheck', viz, '✓');
          K.css(c, { left: (j % 5) * 104, top: Math.floor(j / 5) * 104 });
          gsap.set(c, { scale: 0, opacity: 0 });
          const at = t0 + 0.4 + j * 0.09;
          tl.to(c, { scale: 1, opacity: 1, duration: 0.35, ease: OM.spring(0.35) }, at);
          if (j % 4 === 0) OM.sfx('tick', at, { gain: 0.25, note: (j / 4) + 1 });
        }
      } else if (sh.viz === 'bar') {
        viz.innerHTML = '<div class="vbar-l">148 分钟的录播 · 转写进度</div><div class="vbar"><i></i></div><div class="vbar-r"><b>0</b> %</div>';
        const fill = viz.querySelector('.vbar i'), pct = viz.querySelector('.vbar-r b');
        gsap.set(fill, { scaleX: 0, transformOrigin: '0% 50%' });
        tl.to(fill, { scaleX: 1, duration: 1.2, ease: 'power2.inOut' }, t0 + 0.4);
        tl.fromTo(pct, { innerText: 0 }, { innerText: 100, snap: { innerText: 1 }, duration: 1.2, ease: 'power2.inOut', immediateRender: false }, t0 + 0.4);
        const note = K.el('div', 'vbar-n', viz, '用时 113 秒 · 不需要显卡');
        gsap.set(note, { opacity: 0, y: 14 });
        tl.to(note, { opacity: 1, y: 0, duration: 0.5, ease: 'expo.out' }, t0 + 1.7);
      } else if (sh.viz === 'compare') {
        viz.innerHTML = '<div class="vcmp"><span>本机 CPU</span><div><i style="width:421px"></i></div><b>10.52%</b></div><div class="vcmp dim"><span>需要显卡</span><div><i style="width:411px"></i></div><b>10.28%</b></div>';
        viz.querySelectorAll('.vcmp i').forEach((b, j) => {
          gsap.set(b, { scaleX: 0, transformOrigin: '0% 50%' });
          tl.to(b, { scaleX: 1, duration: 0.9, ease: 'expo.out' }, t0 + 0.4 + j * 0.25);
        });
      } else if (sh.viz === 'dots') {
        for (let j = 0; j < 81; j++) {
          const c = K.el('div', 'vdot', viz);
          K.css(c, { left: (j % 9) * 58, top: Math.floor(j / 9) * 58 });
          gsap.set(c, { scale: 0 });
          tl.to(c, { scale: 1, duration: 0.25, ease: OM.spring(0.3) }, t0 + 0.3 + j * 0.022);
        }
        OM.sfx('count', t0 + 0.3, { dur: 1.8, gain: 0.25 });
      }
    });
    // 收成一句
    const end = K.chars(node, '时间从搬运信息，{回到学习本身}', 'kt on-blue');
    tl.set(ink, { opacity: 0 }, T + 31.0);
    K.rise(tl, end, T + 31.4, { stagger: 0.05 });
    OM.sfx('chime', T + 31.6, { gain: 0.4 });
    K.sink(tl, end, T + 37.6);
    tl.to(flood, { clipPath: 'circle(0% at 50% 50%)', duration: 0.9, ease: 'expo.inOut' }, T + 38.6);
  },
});

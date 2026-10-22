/* 两层结构。34 秒（17 小节）。
   中间是应用 → 左边渠道层：渠道一条条接进来，命令一行行打出来 → 右边技能层：规则卡片盖章落下
   → 只留下一门课：以课程为中心长出一张网 → 推进「钉钉课程群」那个节点，转到第二段。 */
SCENES.push({
  id: 'layers', part: 1, bars: 17,
  build(tl, T, node) {
    K.show(tl, node, T); K.hide(tl, node, T + 34.4);
    // 中间的应用（接上一场缩小的窗口）
    const s = K.screen(node, 'affairs', { id: 'core-window' });
    s.cameraman.set({ rect: K.WHOLE, w: 560, anchor: [960, 560] });
    const ov = K.overlay(node);
    ov.style.zIndex = 0;
    const WL = 960 - 280, WY = 560;

    // ---- 渠道层 ----
    const ht = K.chars(node, '渠道层：让模型{够得着}', 'layer-t');
    K.css(ht, { left: 120, top: 120 });
    K.rise(tl, ht, T + 0.3, { stagger: 0.04 });
    const CH = ['教务网', '学在浙大', '智云课堂', '学习通', 'PTA', '素质拓展平台', '体艺场馆', 'CC98', '中国知网', '浙大邮箱', '69 个官网', '公众号', '钉钉群 · 微信群'];
    const chips = CH.map((n, i) => {
      const c = K.el('div', 'lchip', node, n);
      const y = 250 + i * 50;
      K.css(c, { left: 120, top: y });
      gsap.set(c, { opacity: 0, x: -20 });
      const at = T + 1.0 + i * 0.22;
      tl.to(c, { opacity: 1, x: 0, duration: 0.4, ease: 'expo.out' }, at);
      const p = K.svg('path', { d: `M330,${y + 18} C520,${y + 18} 520,${WY} ${WL},${WY + (i - 6) * 14}`, fill: 'none', stroke: '#b7c8fe', 'stroke-width': 1.6, pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1 }, ov);
      tl.to(p, { strokeDashoffset: 0, duration: 0.6, ease: 'power2.inOut' }, at + 0.15);
      // 一颗亮点沿线流进去
      const dot = K.svg('circle', { r: 4, fill: '#4176e6', cx: 330, cy: y + 18, opacity: 0 }, ov);
      tl.set(dot, { opacity: 1 }, at + 0.8);
      tl.to(dot, { attr: { cx: WL, cy: WY + (i - 6) * 14 }, duration: 0.9, ease: 'power2.in' }, at + 0.8);
      tl.set(dot, { opacity: 0 }, at + 1.7);
      if (i % 2 === 0) OM.sfx('tick', at, { gain: 0.25, note: (i % 7) + 1, pan: -0.5 });
      return { c, p };
    });
    // 命令终端：真的命令名
    const term = K.el('div', 'term', node);
    K.css(term, { left: 1240, top: 230 });
    term.dataset.omId = 'commands';
    const CMDS = [['zju xuezai todos', '8 条待交'], ['zju pta homework list', '没做完的题目集'], ['zju notice list', '51 条通知'], ['zju zhiyun search subtitles --keyword 期中', '2 处'], ['zju cc98 search --keyword 期中', '相关的帖子']];
    K.el('div', 'term-h', term, '159 条命令 · 每条把一件事从登录做到结果');
    CMDS.forEach(([cmd, res], i) => {
      const l = K.el('div', 'term-l', term, `<span class="pr">›</span><span class="cmd">${cmd}</span><span class="res">✓ ${res}</span>`);
      const cmdEl = l.querySelector('.cmd'), resEl = l.querySelector('.res');
      gsap.set(l, { opacity: 0 }); gsap.set(resEl, { opacity: 0, x: -6 });
      gsap.set(cmdEl, { clipPath: 'inset(0 100% 0 0)' });
      const at = T + 4.2 + i * 1.3;
      tl.set(l, { opacity: 1 }, at);
      tl.to(cmdEl, { clipPath: 'inset(0 0% 0 0)', duration: 0.7, ease: `steps(${cmd.length})` }, at);
      OM.sfx('type', at, { dur: 0.7, gain: 0.3, pan: 0.4 });
      tl.to(resEl, { opacity: 1, x: 0, duration: 0.3 }, at + 0.85);
    });
    gsap.set(term, { opacity: 0, y: 20 });
    tl.to(term, { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out' }, T + 3.8);
    const tnote = K.lines(node, '统一身份认证、WebVPN、翻页、名称匹配和操作后的回查，<br>都在命令里做完，返回整理好的结果。', 'layer-note');
    K.css(tnote, { left: 1240, top: 640 });
    K.fadeUp(tl, tnote, T + 10.6);

    // ---- 技能层：右边换成规则卡 ----
    tl.to([term, tnote], { opacity: 0, y: -16, duration: 0.45, ease: 'power2.in' }, T + 12.4);
    const ht2 = K.chars(node, '技能层：教模型{怎么拼}', 'layer-t');
    K.css(ht2, { left: 1240, top: 120 });
    K.rise(tl, ht2, T + 12.8, { stagger: 0.04 });
    const RULES = ['教务网的课表，才是选课的依据', '同名的课，要看学期、老师和教学班', '群聊不自动认定属于哪门课', '平台上作业不见了，不等于交了', '课表按校历、单双周和调休换算'];
    const rules = RULES.map((t, i) => {
      const r = K.el('div', 'rule', node, `<b>${String(i + 1).padStart(2, '0')}</b>${t}`);
      K.css(r, { left: 1240, top: 240 + i * 92 });
      gsap.set(r, { opacity: 0, scale: 1.25, rotation: i % 2 ? 2 : -2 });
      const at = T + 13.6 + i * 0.6;
      tl.to(r, { opacity: 1, scale: 1, rotation: 0, duration: 0.35, ease: 'power4.in' }, at);
      OM.sfx('stamp', at + 0.33, { gain: 0.38, pan: 0.5 });
      return r;
    });
    const rnote = K.lines(node, '近四十篇技能说明和约束；容易出错的环节由代码把关。', 'layer-note');
    K.css(rnote, { left: 1240, top: 720 });
    K.fadeUp(tl, rnote, T + 16.8);

    // ---- 以课程为中心的一张网 ----
    const out1 = [ht, ht2, ...chips.map((o) => o.c), ...rules, rnote];
    tl.to(out1, { opacity: 0, duration: 0.45, stagger: 0.01 }, T + 19.4);
    tl.to(chips.map((o) => o.p), { opacity: 0, duration: 0.4 }, T + 19.4);
    tl.to(s.tilt, { opacity: 0, scale: 0.6, duration: 0.6, ease: 'power3.in' }, T + 19.6);
    const g = K.el('div', 'graph', node);
    g.dataset.omId = 'course-graph';
    const gsvg = K.svg('svg', { viewBox: '0 0 1920 1080', width: 1920, height: 1080, class: 'graph-svg' }, g);
    const C0 = [960, 560];
    const hub = K.el('div', 'g-hub', g, '大学物理（乙）Ⅱ');
    K.css(hub, { left: C0[0], top: C0[1] });
    gsap.set(hub, { xPercent: -50, yPercent: -50, scale: 0 });
    tl.to(hub, { scale: 1, duration: 0.7, ease: OM.spring(0.25) }, T + 20.2);
    OM.sfx('impact', T + 20.3, { gain: 0.3 });
    const NODES = [
      ['教学班', '张老师 · 周一三 东1B-201', -470, -250], ['教务网', '课表 · 期中考试', 0, -330], ['学在浙大', '作业 · 课件', 470, -250],
      ['智云课堂', '录播 · 字幕', 600, 40], ['学习通', '实验课件', 430, 300], ['钉钉课程群', '张老师 · 延后两天', 0, 360, 'dd'],
      ['通知', '学工部 · 本科生院', -430, 300], ['备忘录', '第三次作业延后到周五', -600, 40],
    ];
    const gNodes = NODES.map(([n, d, dx, dy, tag], i) => {
      const x = C0[0] + dx, y = C0[1] + dy;
      const e = K.svg('line', { x1: C0[0], y1: C0[1], x2: x, y2: y, stroke: '#4176e6', 'stroke-width': 2, pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1, opacity: 0.7 }, gsvg);
      const nd = K.el('div', 'g-node' + (tag ? ' hot' : ''), g, `<b>${n}</b><span>${d}</span>`);
      K.css(nd, { left: x, top: y });
      gsap.set(nd, { xPercent: -50, yPercent: -50, scale: 0.5, opacity: 0 });
      const at = T + 20.9 + i * 0.45;
      tl.to(e, { strokeDashoffset: 0, duration: 0.5, ease: 'power2.out' }, at);
      tl.to(nd, { scale: 1, opacity: 1, duration: 0.5, ease: OM.spring(0.22) }, at + 0.3);
      OM.sfx('pop', at + 0.3, { note: (i % 6) + 1, gain: 0.3, pan: dx / 700 });
      return { nd, e, x, y, tag };
    });
    const gt = K.chars(node, '以课程为中心，{串成一张网}', 'cap-t');
    K.css(gt, { position: 'absolute', left: '50%', top: '60px', fontSize: '52px', transform: 'translateX(-50%)' });
    K.rise(tl, gt, T + 25.0, { stagger: 0.035 });
    OM.sfx('chime', T + 25.4, { gain: 0.35 });
    const gnote = K.lines(node, '每一条配对都写着依据；两个来源说法不一，两边都留下，标成待核实。', 'g-note');
    K.fadeUp(tl, gnote, T + 26.4);
    // 光点沿连线流向中间：各处的信息往这门课汇集
    gNodes.forEach((o, i) => {
      for (let k = 0; k < 3; k++) {
        const dot = K.svg('circle', { r: 5, fill: '#4176e6', cx: o.x, cy: o.y, opacity: 0 }, gsvg);
        const at = T + 25.2 + i * 0.17 + k * 1.6;
        tl.set(dot, { opacity: 1 }, at);
        tl.to(dot, { attr: { cx: C0[0], cy: C0[1] }, duration: 0.9, ease: 'power2.in' }, at);
        tl.set(dot, { opacity: 0 }, at + 0.9);
      }
    });
    tl.fromTo(hub, { boxShadow: '0 20px 50px rgba(47,95,204,.35), 0 0 0 0 rgba(65,118,230,.5)' }, { boxShadow: '0 20px 50px rgba(47,95,204,.35), 0 0 0 26px rgba(65,118,230,0)', duration: 0.8, repeat: 3, repeatDelay: 0.8, ease: 'power1.out', immediateRender: false }, T + 26.1);
    // 推进「钉钉课程群」：第二段从这条消息开始
    const dd = gNodes.find((o) => o.tag);
    K.sink(tl, gt, T + 31.6); K.fadeOut(tl, gnote, T + 31.6);
    tl.to(g, { scale: 3.2, x: (C0[0] - dd.x) * 3.2, y: (C0[1] - dd.y) * 3.2, duration: 1.6, ease: 'expo.in', transformOrigin: '50% 50%' }, T + 32.2);
    tl.to(g, { opacity: 0, duration: 0.45 }, T + 33.45);
    OM.sfx('whoosh', T + 33.4, { gain: 0.45 });
  },
});

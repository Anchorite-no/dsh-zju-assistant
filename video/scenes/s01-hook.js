/* 问题：信息涌来。18 秒（9 小节）。蓝色场。
   消息卡片踩拍砸进来 → 「信息从十几个地方涌来」→ 「同一门课，散在四五处」→ 大物的五张卡排开，群里说延后、平台没改 → 吸进中心，白场。 */
K.mcard = (parent, { src, color, title, meta }) => {
  const c = K.el('div', 'mcard', parent, `<div class="mc-h"><i style="background:${color}"></i><span>${src}</span><em>${meta || ''}</em></div><div class="mc-t">${title}</div>`);
  return c;
};
SCENES.push({
  id: 'hook', part: 1, bars: 9,
  build(tl, T, node) {
    K.show(tl, node, T); K.hide(tl, node, T + 18.2);
    K.el('div', 'flood', node);
    const field = K.el('div', 'field', node);
    const R = OM.random(1021);
    const C = {
      xz: ['学在浙大', '#4176e6'], dd: ['钉钉 · 大学物理（乙）Ⅱ 课程群', '#1a8cff'], jw: ['教务网', '#4176e6'], xg: ['学工部', '#61666b'],
      wx: ['微信 · 计科2502 班级群', '#22c55e'], zy: ['智云课堂', '#4176e6'], pta: ['PTA', '#4176e6'], mail: ['浙大邮箱', '#7d5bd6'],
      gzh: ['公众号 · 求是潮', '#f0700f'], cc: ['CC98', '#7d5bd6'], ek: ['二课 · 图书馆', '#f0700f'], xxt: ['学习通', '#4176e6'],
    };
    const DATA = [
      ['xz', 'HW4 书面作业：AVL 树与伸展树', '今天 23:59 截止'],
      ['dd', '张老师：第三次作业截止时间延后两天，改到本周五 23:59', '昨天 20:15', 'thread'],
      ['jw', '期中考试 · 大学物理（乙）Ⅱ · 周六 10:30', '东1B-201', 'phy'],
      ['wx', '班长：周四班会改到周五晚 7 点，记得带体测确认截图', '今天 11:20'],
      ['xg', '关于开展2026年秋季学期学生体质健康测试的通知', '今天 08:40'],
      ['zy', '大学物理（乙）Ⅱ 第 10 次课 · 回放已生成', '今天 12:30', 'phy'],
      ['pta', '第 4 章 处理器 练习题', '明天 12:00 截止'],
      ['mail', '作业批改通知：数据结构基础 HW3 已批改', '今天 10:02'],
      ['xz', '第三次作业：电磁感应', '今天 23:59 截止', 'platform'],
      ['gzh', '期中周生存指南：紫金港自习室空位地图', '今天 09:30'],
      ['cc', '有人回复了你的帖子《大二数据结构怎么准备期中》', '今天 13:12'],
      ['xxt', '大学物理实验：霍尔效应测磁场 · 课件已更新', '昨天', 'phy'],
      ['ek', '“书香浙大”读书分享会（第五期）开始报名', '10月22日'],
    ];
    // 落点：中间一圈，避开正中的大字带
    const spots = [[700, 250], [1240, 200], [330, 470], [1560, 430], [980, 120], [430, 760], [1500, 800], [960, 900], [260, 180], [1630, 140], [760, 690], [1180, 760], [1660, 610]];
    const cards = DATA.map(([k, title, meta, tag], i) => {
      const c = K.mcard(field, { src: C[k][0], color: C[k][1], title, meta });
      const [x, y] = spots[i];
      K.css(c, { left: x - 230, top: y - 48 });
      const dir = i % 4, dx = [-900, 900, 0, 0][dir], dy = [0, 0, -700, 700][dir];
      const rot = (R() - 0.5) * 8;
      gsap.set(c, { x: dx, y: dy, rotation: rot * 3, opacity: 0, scale: 1.15 });
      const at = T + 0.25 + i * 0.34;
      tl.to(c, { x: 0, y: 0, rotation: rot, opacity: 1, scale: 1, duration: 0.55, ease: 'expo.out' }, at);
      OM.sfx(i % 3 === 0 ? 'thud' : 'pop', at + 0.12, { note: (i % 5) + 1, gain: 0.32, pan: (x - 960) / 1200 });
      c.dataset.tag = tag || '';
      return { c, x, y, tag, rot };
    });
    // 大字一：信息从十几个地方涌来
    const kick = K.lines(node, '一名浙大学生的一天', 'kt-k');
    const h1 = K.chars(node, '信息从{十几个地方}涌来', 'kt');
    const h2 = K.chars(node, '同一门课，散在{四五处}', 'kt');
    h1.classList.add('on-blue'); h2.classList.add('on-blue');
    tl.to(cards.map((o) => o.c), { opacity: 0.38, filter: 'blur(1.5px)', duration: 0.5 }, T + 4.8);
    K.fadeUp(tl, kick, T + 4.88);
    K.rise(tl, h1, T + 5.04, { stagger: 0.045 });
    OM.sfx('impact', T + 5.12, { gain: 0.35 });
    // 镜头轻微推近，卡片继续漂
    tl.fromTo(field, { scale: 1 }, { scale: 1.06, duration: 5, ease: 'none', transformOrigin: '50% 50%', immediateRender: false }, T + 4.8);
    K.sink(tl, h1, T + 7.2);
    K.fadeOut(tl, kick, T + 7.2);
    K.rise(tl, h2, T + 7.51, { stagger: 0.05 });
    K.sink(tl, h2, T + 9.4);

    // 同一门课的五张卡排开
    const phy = cards.filter((o) => o.tag);
    const others = cards.filter((o) => !o.tag);
    tl.to(others.map((o) => o.c), { opacity: 0, scale: 0.9, duration: 0.6, ease: 'power2.in' }, T + 9.6);
    const SLOT = { thread: [1330, 370], platform: [590, 370], phy: null };
    const phyPos = [[590, 720], [1330, 720], [960, 870]];
    let pi = 0;
    phy.forEach((o) => {
      const [tx, ty] = o.tag === 'phy' ? phyPos[pi++] : SLOT[o.tag];
      tl.to(o.c, { x: tx - o.x, y: ty - o.y, rotation: 0, opacity: 1, filter: 'blur(0px)', scale: 1, duration: 1.0, ease: 'expo.inOut' }, T + 9.8);
    });
    // 中间一颗课程名
    const hub = K.el('div', 'hub', node, '大学物理（乙）Ⅱ');
    gsap.set(hub, { scale: 0, xPercent: -50, yPercent: -50 });
    tl.to(hub, { scale: 1, duration: 0.6, ease: OM.spring(0.3) }, T + 10.48);
    OM.sfx('pop', T + 10.48, { note: 1, gain: 0.5 });
    const ov = K.overlay(node);
    const ends = [[590, 370], [1330, 370], [590, 720], [1330, 720], [960, 870]];
    const lines = ends.map(([x, y]) => {
      const p = K.svg('path', { d: `M960,540 L${x},${y}`, stroke: 'rgba(255,255,255,.75)', 'stroke-width': 2, 'stroke-dasharray': '6 8', fill: 'none', opacity: 0 }, ov);
      return p;
    });
    tl.to(lines, { opacity: 1, duration: 0.4, stagger: 0.08 }, T + 10.82);
    // 对不上：群里说延后，平台还是今天
    const q = K.el('div', 'clash', node, '?');
    gsap.set(q, { scale: 0, xPercent: -50, yPercent: -50 });
    tl.to(q, { scale: 1, duration: 0.5, ease: OM.spring(0.4) }, T + 12);
    OM.sfx('glitch', T + 12, { gain: 0.3 });
    const say = K.lines(node, '群里说延后两天，平台上还是今天截止，<b>听谁的？</b>', 'clash-say');
    K.fadeUp(tl, say, T + 12.32);
    tl.to(phy.filter((o) => o.tag === 'thread' || o.tag === 'platform').map((o) => o.c), { boxShadow: '0 0 0 3px #ffb37a, 0 24px 60px rgba(10,30,90,.35)', duration: 0.3 }, T + 12);

    // 全部吸进中心 → 白场
    tl.to(say, { opacity: 0, duration: 0.3 }, T + 15);
    tl.to(lines, { opacity: 0, duration: 0.3 }, T + 15);
    phy.forEach((o) => tl.to(o.c, { x: 960 - o.x, y: 540 - o.y, scale: 0, rotation: (R() - 0.5) * 60, duration: 0.7, ease: 'power3.in' }, T + 15.1 + R() * 0.2));
    tl.to([hub, q], { scale: 0, duration: 0.5, ease: 'power3.in' }, T + 15.4);
    const wipe = K.el('div', 'wipe', node);
    gsap.set(wipe, { scale: 0, xPercent: -50, yPercent: -50 });
    tl.to(wipe, { scale: 1, duration: 1.0, ease: 'expo.inOut' }, T + 16);
    OM.sfx('whoosh', T + 16.33, { gain: 0.45 });
  },
});

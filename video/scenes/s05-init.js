/* 第二段开场 + 初始化：十几处来源，拼成一份档案。32 秒（16 小节）。
   章节牌（写明演示数据）→ 一张横着展开的架构图，镜头从左推到右：
   来源（校园账号一次统一认证：教务网、学在浙大、智云；独立账号：学习通、PTA；本机聊天只读选定的群：钉钉、微信；邮箱只记入口）
   → 初始化四步（读取、整理、比对、关联；比对看课程号、教学班、学年学期、任课教师、课程名和别名、群消息）
   → 生成的档案（思维导图：个人资料、课程、平台入口、事项，展开大学物理这一门）→ 用在哪里（后面几个功能）
   → 拉远看全图 → 推进「消息按人送达」，接应用窗口。
   照 core/initialize 和 ui/profile/context*.mjs；演示里的数：9 门课，钉钉 3 个群、微信 2 个群。 */
SCENES.push({
  id: 'init', part: 2, bars: 16,
  build(tl, T, node) {
    const A = APP;
    K.show(tl, node, T); K.hide(tl, node, T + 32.5);

    // ---- 章节牌 ----
    const card = K.el('div', 'chapter-card', node);
    card.dataset.omId = 'part2-card';
    const num = K.el('div', 'cc-num', card, '02');
    const ttl = K.chars(card, '核心场景实操', 'cc-title');
    const sub = K.lines(card, '一名 2025 级本科生的一个周三', 'cc-sub');
    const note = K.lines(card, '画面来自隔离的演示实例 · 数据为虚构 · 人物为化名', 'cc-note');
    gsap.set(num, { opacity: 0, y: 30 });
    tl.to(num, { opacity: 1, y: 0, duration: 0.6, ease: 'expo.out' }, T + 0.1);
    K.rise(tl, ttl, T + 0.25, { stagger: 0.05 });
    K.fadeUp(tl, [sub, note], T + 0.8, { stagger: 0.15 });
    OM.sfx('impact', T + 0.3, { gain: 0.22 });
    tl.to(card, { opacity: 0, x: -60, duration: 0.45, ease: 'power3.in' }, T + 3.0);

    // ---- 架构图：一张大图，镜头在上面走 ----
    const AR = K.arch(node, tl);
    const { el, pop, link, drawL, flow, bez, cam } = AR;
    const W = AR.world;
    W.dataset.omId = 'init-architecture';
    const ANC = [960, 600];
    cam.set({ focus: [990, 520], zoom: 0.82, anchor: ANC });
    gsap.set(W, { opacity: 0 });
    tl.to(W, { opacity: 1, duration: 0.5 }, T + 3.2);

    // 顶上的说明：每一段换一行
    const head = (kicker, title, at, out) => {
      const h = K.el('div', 'arch-head', node);
      const k = K.el('div', 'cap-k', h, kicker);
      const t = K.chars(h, title, 'arch-title');
      gsap.set(k, { opacity: 0, x: -16 });
      tl.to(k, { opacity: 1, x: 0, duration: 0.45, ease: 'expo.out' }, at);
      K.rise(tl, t, at + 0.06, { stagger: 0.022 });
      if (out) { tl.to(k, { opacity: 0, duration: 0.25 }, out); K.sink(tl, t, out); }
      return h;
    };

    // ---------- ① 来源 ----------
    head('第一次打开 · 初始化', '读：每处来源，用它自己的方式接上', T + 3.4, T + 7.4);
    const GROUPS = [
      { y: 30, h: 330, title: '校园账号 · 统一认证一次登录', items: [['教务网', '学籍 · 课表 9 门'], ['学在浙大', '课程 · 待办'], ['智云课堂', '本学期的课 · 录播']] },
      { y: 380, h: 250, title: '独立账号', items: [['学习通', '课程 · 实验课件'], ['PTA', '题目集']] },
      { y: 650, h: 250, title: '本机聊天 · 只读你选定的群', items: [['钉钉', '3 个课程群'], ['微信', '2 个群']], chat: true },
    ];
    const srcAnchors = [];
    GROUPS.forEach((gp, gi) => {
      const g = el('arch-group' + (gp.chat ? ' chat' : ''), 0, gp.y, `<div class="gh">${gp.title}</div>`, 560);
      K.css(g, { height: gp.h });
      pop(g, T + 3.6 + gi * 0.35, { s: 0.96 });
      gp.items.forEach(([n, d], ii) => {
        const y = gp.y + 55 + ii * 85;
        const it = el('arch-item', 20, y, `<b>${n}</b><span>${d}</span>`, 520);
        pop(it, T + 3.9 + gi * 0.35 + ii * 0.12, { x: -20, y: 0 });
        srcAnchors.push({ a: [540, y + 35], chat: !!gp.chat });
      });
    });
    const mail = el('arch-item dim', 20, 930, '<b>浙大邮箱</b><span>只记入口，不读信</span>', 520);
    pop(mail, T + 5.0, { x: -20, y: 0 });
    srcAnchors.push({ a: [540, 965] });
    OM.sfx('slide', T + 3.8, { dur: 1.4, gain: 0.2 });
    OM.sfx('thud', T + 3.7, { gain: 0.25, pan: -0.5 });

    // ---------- ② 初始化四步 ----------
    const EX = 820, EY = 150, EW = 560, EH = 800;
    const eng = el('arch-engine', EX, EY, `<div class="eh"><img src="assets/app-icon.svg"><b>初始化</b><code>campus_context_initialize</code></div>`, EW);
    K.css(eng, { height: EH });
    pop(eng, T + 6.2, { s: 0.94, y: 20 });
    OM.sfx('thud', T + 6.35, { gain: 0.3 });
    const toEng = srcAnchors.map((s, i) => {
      const l = link(s.a, [EX, 250 + i * 80], { color: s.chat ? '#4176e6' : '#c9d6f5', width: s.chat ? 3 : 2.2 });
      drawL(l, T + 6.4 + i * 0.06, 0.6);
      flow(l, T + 7.2 + (i % 3) * 0.35, T + 13.4, s.chat ? 0.8 : 1.3, 0.9, s.chat ? '#2f5fcc' : '#8fb0f2');
      return l;
    });
    OM.sfx('draw', T + 6.4, { dur: 0.8, gain: 0.2 });
    head('初始化', '拼：整理、比对，再把关系建起来', T + 7.6, T + 12.9);
    const STEPS = [
      ['读取', '账号各管各的，每条记下来源和读取时间'],
      ['整理', '统一写成 Markdown，去重；你改过的不会被覆盖'],
      ['比对', '<i>课程号</i><i>教学班</i><i>学年学期</i><i>任课教师</i><i>课程名和别名</i><i>群消息提到的课</i>'],
      ['关联', '每条关联写明依据；说法对不上的，两边都留，标「待核实」'],
    ];
    const stepEls = STEPS.map(([t, d], i) => {
      const r = K.el('div', 'arch-step', eng, `<em>${i + 1}</em><b>${t}</b><p>${d}</p>`);
      K.css(r, { top: 100 + i * 170 });
      gsap.set(r, { opacity: 0.25 });
      const at = T + 8.2 + i * 1.05;
      tl.to(r, { opacity: 1, duration: 0.3 }, at);
      tl.fromTo(r, { backgroundColor: 'rgba(65,118,230,0)' }, { backgroundColor: 'rgba(65,118,230,.10)', duration: 0.25, yoyo: true, repeat: 1, immediateRender: false }, at);
      OM.sfx('tick', at, { note: i + 2, gain: 0.35 });
      return r;
    });
    const chips = stepEls[2].querySelectorAll('i');
    gsap.set(chips, { opacity: 0.2 });
    chips.forEach((c, j) => tl.to(c, { opacity: 1, duration: 0.2 }, T + 10.5 + j * 0.16));
    OM.sfx('pop', T + 10.5, { note: 2, gain: 0.25 }); OM.sfx('pop', T + 11.1, { note: 4, gain: 0.25 });
    cam.to(tl, T + 7.4, { focus: [1060, 520], zoom: 0.85, anchor: ANC, duration: 5.4, ease: 'sine.inOut' });

    // ---------- ③ 生成的档案：思维导图 ----------
    const RX = 1640, RY = 505;
    const root = el('arch-root', RX, RY, '你的校园档案');
    const toRoot = link([EX + EW, 550], [RX, RY + 35], { color: '#4176e6', width: 3.4 });
    drawL(toRoot, T + 12.9, 0.6);
    flow(toRoot, T + 13.4, T + 24, 0.7, 0.7, '#2f5fcc');
    cam.to(tl, T + 13.1, { focus: [2560, 520], zoom: 0.82, anchor: ANC, duration: 1.3, ease: 'expo.inOut' });
    OM.sfx('whoosh', T + 13.3, { gain: 0.3 });
    head('生成的档案', '一份以课程为中心的档案，全是 Markdown', T + 13.8, T + 20.3);
    pop(root, T + 14.0, { ease: OM.spring(0.2), s: 0.6 });
    OM.sfx('pop', T + 14.05, { note: 1, gain: 0.35 });
    const BR = [
      ['个人资料', '00-个人资料.md', 110], ['课程 · 9 门', '01-课程.md · 课程/', 370], ['平台入口', '02-平台入口.md · 平台/', 720], ['事项', '03-事项.md · 事项/', 900],
    ];
    BR.forEach(([t, f, y], i) => {
      const b = el('arch-branch', 2000, y, `<b>${t}</b><span>${f}</span>`, 280);
      const l = link([RX + 262, RY + 35], [2000, y + 40], { color: '#4176e6', width: 2.6 });
      drawL(l, T + 14.3 + i * 0.15, 0.45);
      pop(b, T + 14.55 + i * 0.15, { x: -16, y: 0 });
      OM.sfx('tick', T + 14.6 + i * 0.15, { note: i + 3, gain: 0.25 });
    });
    const leafRow = (labels, x, y, at) => {
      const r = el('arch-leaves', x, y, labels.map((t) => `<i>${t}</i>`).join(''));
      const l = link([2280, y + 26], [x, y + 26], { color: '#b7c8fe', width: 2 });
      drawL(l, at - 0.15, 0.3);
      gsap.set(r.children, { opacity: 0, x: -8 });
      tl.set(r, { opacity: 1 }, at);
      tl.to(r.children, { opacity: 1, x: 0, duration: 0.3, stagger: 0.06, ease: 'expo.out' }, at);
      return r;
    };
    leafRow(['学院', '专业', '年级', '培养层次', '校区'], 2340, 112, T + 15.2);
    leafRow(['学在浙大', '智云课堂', '学习通', 'PTA', '浙大邮箱'], 2340, 722, T + 15.6);
    leafRow(['作业', '考试', '通知里要办的事'], 2340, 902, T + 15.9);
    const COURSES = ['大学物理（乙）Ⅱ', '数据结构基础', '计算机组成', '概率论与数理统计', '大学物理实验'];
    const crs = COURSES.map((t, j) => {
      const c = el('arch-course', 2340, 250 + j * 58, t, 280);
      const l = link([2280, 410], [2340, 275 + j * 58], { color: '#b7c8fe', width: 2 });
      drawL(l, T + 15.2 + j * 0.08, 0.3);
      pop(c, T + 15.35 + j * 0.08, { x: -10, y: 0 });
      return c;
    });
    const more = el('arch-more', 2350, 545, '另外 4 门 …');
    pop(more, T + 15.9, { y: 6 });
    OM.sfx('slide', T + 15.2, { dur: 0.9, gain: 0.18 });
    // 展开大学物理这一门
    const DX = 2700, DY = 200;
    const detail = el('arch-detail', DX, DY, `<div class="dh">大学物理（乙）Ⅱ<span>课程/大学物理（乙）Ⅱ.md</span></div>
      <div class="dr"><em>教学班</em><p>张老师 · 周一、周三 · 东1B-201</p></div>
      <div class="dr"><em>课程入口</em><p>学在浙大（作业、课件）· 智云课堂（录播）</p></div>
      <div class="dr hot"><em>课程群</em><p>钉钉「大学物理（乙）Ⅱ 课程群」<small>依据：课程名一致 · 任课教师重合 · 群消息提到课程名</small></p></div>
      <div class="dr"><em>事项</em><p>第三次作业 周五 23:59 · 期中 周六 10:30</p></div>`, 620);
    const toDetail = link([2620, 275], [DX, 275], { color: '#4176e6', width: 2.6 });
    drawL(toDetail, T + 17.0, 0.35);
    tl.to(crs[0], { boxShadow: '0 0 0 2.5px #4176e6, 0 12px 26px rgba(65,118,230,.22)', duration: 0.3 }, T + 16.9);
    pop(detail, T + 17.25, { s: 0.9, origin: '0% 20%', x: -20, y: 0 });
    OM.sfx('paper', T + 17.3, { gain: 0.35 });
    const rows = detail.querySelectorAll('.dr');
    gsap.set(rows, { opacity: 0, x: -10 });
    rows.forEach((r, j) => tl.to(r, { opacity: 1, x: 0, duration: 0.4, ease: 'expo.out' }, T + 17.7 + j * 0.35));
    const ev = detail.querySelector('small');
    gsap.set(ev, { opacity: 0 });
    tl.to(ev, { opacity: 1, duration: 0.4 }, T + 19.2);
    OM.sfx('ding', T + 19.2, { note: 4, gain: 0.3 });

    // ---------- ④ 用在哪里 ----------
    const BX = 3400, CX = 3480;
    const USE = [['消息按人送达', '学院 · 年级 · 校区'], ['问一句，知道去哪找', '课程入口 · 课程群'], ['讲解从你会的讲起', '学过 · 还不熟'], ['技能和定时任务', '课程 · 事项 · 平台入口']];
    const bus = K.svg('path', { d: `M${DX + 620},${435} L${BX},${435} M${BX},${225} L${BX},${825}`, fill: 'none', stroke: '#4176e6', 'stroke-width': 3, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1, opacity: 0 }, AR.svg);
    tl.set(bus, { opacity: 1 }, T + 20.6);
    tl.to(bus, { strokeDashoffset: 0, duration: 0.6, ease: 'power2.inOut' }, T + 20.6);
    cam.to(tl, T + 20.4, { focus: [3120, 520], zoom: 0.82, anchor: ANC, duration: 1.2, ease: 'expo.inOut' });
    OM.sfx('whoosh', T + 20.6, { gain: 0.28 });
    head('用在哪里', '后面的每一步，都从这份档案出发', T + 21.2, T + 23.4);
    const useEls = USE.map(([t, d], i) => {
      const y = 180 + i * 200;
      const u = el('arch-use', CX, y, `<b>${t}</b><span>用到：${d}</span>`, 400);
      const l = link([BX, y + 45], [CX, y + 45], { color: '#4176e6', width: 3 });
      drawL(l, T + 21.2 + i * 0.2, 0.3);
      pop(u, T + 21.4 + i * 0.2, { x: -16, y: 0 });
      OM.sfx('pop', T + 21.45 + i * 0.2, { note: i + 2, gain: 0.28, pan: 0.4 });
      return { u, y };
    });

    // ---------- 拉远看全图 ----------
    cam.to(tl, T + 23.6, { focus: [1950, 520], zoom: 0.47, anchor: [960, 610], duration: 1.6, ease: 'expo.inOut' });
    head('', '一次初始化：{十几处来源，拼成一份档案}', T + 24.4, T + 28.2);
    OM.sfx('chime', T + 24.6, { gain: 0.3 });
    toEng.forEach((l, i) => flow(l, T + 24.0 + (i % 4) * 0.25, T + 28.2, 1.0, 0.8, '#2f5fcc'));
    useEls.forEach((o, i) => flow({ c: bez([BX, 435], [CX, o.y + 45]) }, T + 24.6 + i * 0.2, T + 28.2, 1.0, 0.5, '#2f5fcc'));

    // ---------- 推进「消息按人送达」，接应用窗口 ----------
    const u0 = useEls[0];
    cam.to(tl, T + 28.4, { rect: { x: CX, y: u0.y, w: 400, h: 90 }, zoom: 5, anchor: [960, 540], duration: 1.3, ease: 'expo.in', noDrift: true });
    OM.sfx('whoosh', T + 29.2, { gain: 0.35 });
    tl.to(W, { opacity: 0, duration: 0.4 }, T + 29.4);
    // 应用窗口（校园事务，整个窗口）从这里长出来
    A.swap(tl, T, 'affairs');
    A.cameraman.set({ rect: K.WHOLE, w: 1560, anchor: [960, 548] });
    gsap.set(A.tilt, { opacity: 0 });
    K.show(tl, A.node, T + 29.3);
    tl.fromTo(A.tilt, { opacity: 0, scale: 1.12 }, { opacity: 1, scale: 1, duration: 0.8, ease: 'expo.out', immediateRender: false }, T + 29.4);
  },
});

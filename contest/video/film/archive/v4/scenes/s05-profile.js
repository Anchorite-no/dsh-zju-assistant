/* 第二段开场 + 个人档案。30 秒（15 小节）。
   章节牌（写明演示数据）→ 应用窗口进来 → 设置里的个人档案：基础信息、记忆 → 「计算机组成」待核实 → 关掉，回到校园事务。 */
SCENES.push({
  id: 'profile', part: 2, bars: 15,
  build(tl, T, node) {
    const A = APP, cam = A.cameraman, cur = A.cursor;
    K.show(tl, node, T); K.hide(tl, node, T + 30.5);

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
    OM.sfx('impact', T + 0.3, { gain: 0.3 });
    tl.to(card, { opacity: 0, y: -40, duration: 0.45, ease: 'power3.in' }, T + 3.1);

    // ---- 窗口进来（从下方升起落定）----
    K.show(tl, A.node, T + 3.6);
    A.swap(tl, T, 'affairs');
    cam.set({ rect: K.WHOLE, w: 1560, anchor: [960, 548] });
    tl.fromTo(A.tilt, { y: 700, rotationX: 18, scale: 0.92, opacity: 0 }, { y: 0, rotationX: 0, scale: 1, opacity: 1, duration: 1.3, ease: 'expo.out', immediateRender: false }, T + 3.7);
    gsap.set(A.tilt, { opacity: 0 });
    OM.sfx('whoosh', T + 3.8, { gain: 0.4 });

    // ---- 设置 → 个人档案 ----
    cur.show(tl, T + 4.6);
    tl.set(cur.el, { x: 330, y: 900 }, T + 4.5);
    cur.move(tl, T + 4.5, 330, 900, 0.01);
    cur.move(tl, T + 4.7, 70, 968, 0.8);
    cur.click(tl, T + 5.6);
    A.swap(tl, T + 5.6, 'profile');
    cur.move(tl, T + 5.8, 300, 800, 0.6);
    cur.hide(tl, T + 6.2);
    const ID = K.pad(A.r('identity', 'profile'), 12, 10);
    const DLG = { x: 588, y: 120, w: 610, h: 770 };
    A.clipTo(tl, T + 6.3, DLG, 1.1, 16);
    cam.to(tl, T + 6.3, { rect: ID, zoom: 1.5, anchor: [1290, 470], duration: 1.1 });
    const c1 = K.caption(node, { kicker: '个人档案', title: '第一次用，\n先认识你', size: 60, x: 120, y: 300, width: 560, id: 'prof-cap1',
      body: '初始化时用你自己的账号，<br>从教务网读出学院、年级、<br>培养层次和校区。' });
    c1.in(tl, T + 7.0);
    const fields = [0, 1, 3, 4, 5].map((i) => A.r(`identity.field[${i}]`, 'profile'));
    fields.forEach((f, j) => {
      const b = K.bar(A, K.pad(f, 2, 0));
      tl.to(b, { opacity: 1, duration: 0.2 }, T + 8.2 + j * 0.3).to(b, { opacity: 0, duration: 0.6 }, T + 10.6);
      OM.sfx('tick', T + 8.2 + j * 0.3, { gain: 0.35, note: j + 1 });
    });
    c1.out(tl, T + 11.6);

    // ---- 记忆：以课程为中心 ----
    const MEM = { x: 600, y: 600, w: 590, h: 300 };
    cam.to(tl, T + 11.8, { rect: MEM, zoom: 1.45, anchor: [1290, 560], duration: 1.0 });
    const c2 = K.caption(node, { kicker: '记忆', title: '课程、平台入口、\n你的偏好', size: 56, x: 120, y: 300, width: 600, id: 'prof-cap2',
      body: '每门课记下教学班、老师、<br>学在浙大和智云的入口、课程群。<br>都是普通的 Markdown，你能直接改。' });
    c2.in(tl, T + 12.4);
    for (let i = 5; i <= 9; i++) {
      const m = A.r(`memory[${i}]`, 'profile');
      const b = K.bar(A, K.pad(m, 0, -2));
      const at = T + 13.4 + (i - 5) * 0.45;
      tl.to(b, { opacity: 1, duration: 0.18 }, at).to(b, { opacity: 0, duration: 0.5 }, at + 0.5);
      OM.sfx('pop', at, { note: (i - 5) % 6 + 1, gain: 0.3 });
    }
    c2.out(tl, T + 18.6);

    // ---- 计算机组成：待核实 ----
    const m7 = A.r('memory[7]', 'profile');
    cur.show(tl, T + 18.6);
    tl.set(cur.el, { x: 1000, y: 960 }, T + 18.5);
    cur.move(tl, T + 18.5, 1000, 960, 0.01);
    cur.move(tl, T + 18.7, m7.x + 120, m7.y + 22, 0.8);
    cur.click(tl, T + 19.7);
    A.swap(tl, T + 19.7, 'profile-note');
    cur.move(tl, T + 19.9, 1150, 620, 0.6);
    cur.hide(tl, T + 20.4);
    const NOTE = { x: 600, y: 180, w: 590, h: 340 };
    cam.to(tl, T + 19.9, { rect: NOTE, zoom: 1.5, anchor: [1290, 520], duration: 1.0 });
    const st = A.r('note.prop[2]', 'profile-note'), bd = A.r('note.body[0]', 'profile-note');
    const rgSt = K.ring(A, { x: st.x - 6, y: st.y - 4, w: 150, h: st.h + 8 }, { color: '#f0700f', radius: 7, width: 3 });
    K.draw(tl, rgSt, T + 21.0, 0.45); OM.sfx('draw', T + 21.0, { dur: 0.45, gain: 0.35 });
    const rgBd = K.ring(A, { x: bd.x - 8, y: bd.y - 6, w: bd.w + 16, h: 34 }, { color: '#f0700f', radius: 7, width: 2.5 });
    K.draw(tl, rgBd, T + 21.8, 0.6);
    const c3 = K.caption(node, { kicker: '来源对不上的时候', title: '两边都留，\n标成待核实', size: 60, x: 120, y: 300, width: 600, id: 'prof-cap3',
      body: '课程群说交学在浙大，助教私聊说发邮件。<br>不悄悄覆盖其中一方，等你确认一次。' });
    c3.in(tl, T + 21.2);
    c3.out(tl, T + 27.4);
    tl.to([rgSt, rgBd], { opacity: 0, duration: 0.3 }, T + 27.4);

    // ---- 关掉，回到校园事务（下一场从这里接）----
    A.clipTo(tl, T + 27.8, K.WHOLE, 1.1, 14);
    cam.to(tl, T + 27.8, { rect: K.WHOLE, w: 1560, anchor: [960, 548], duration: 1.1 });
    A.swap(tl, T + 28.5, 'affairs', 0.35);
  },
});

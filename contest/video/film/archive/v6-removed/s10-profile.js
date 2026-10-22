/* 个人档案。20 秒（10 小节）。上一场光标停在「设置」上。
   前面按人筛消息、从你会的地方讲起，靠的都是这一份档案：基础信息、记忆 → 「计算机组成」待核实 → 关掉，回到校园事务。 */
SCENES.push({
  id: 'profile', part: 2, bars: 10,
  build(tl, T, node) {
    const A = APP, cam = A.cameraman, cur = A.cursor;
    K.show(tl, A.node, T); K.show(tl, node, T); K.hide(tl, node, T + 20.5);
    cur.click(tl, T + 0.2);
    A.swap(tl, T + 0.2, 'profile');
    cur.move(tl, T + 0.4, 300, 800, 0.6);
    cur.hide(tl, T + 0.8);
    const ID = K.pad(A.r('identity', 'profile'), 12, 10);
    const DLG = { x: 588, y: 120, w: 610, h: 770 };
    A.clipTo(tl, T + 0.8, DLG, 1.1, 16);
    cam.to(tl, T + 0.8, { rect: ID, zoom: 1.5, anchor: [1290, 470], duration: 1.1 });
    const c1 = K.caption(node, { kicker: '个人档案', title: '按你来，\n靠的是这一份档案', size: 56, x: 120, y: 300, width: 600, id: 'prof-cap1',
      body: '学院、年级、校区从教务网读出；<br>每门课的老师、平台入口、课程群，<br>记成你能直接改的笔记。' });
    c1.in(tl, T + 1.4);
    const fields = [0, 1, 3, 4, 5].map((i) => A.r(`identity.field[${i}]`, 'profile'));
    fields.forEach((f, j) => {
      const b = K.bar(A, K.pad(f, 2, 0));
      tl.to(b, { opacity: 1, duration: 0.2 }, T + 2.4 + j * 0.25).to(b, { opacity: 0, duration: 0.6 }, T + 4.4);
      OM.sfx('tick', T + 2.4 + j * 0.25, { gain: 0.35, note: j + 1 });
    });
    // 记忆：以课程为中心
    const MEM = { x: 600, y: 600, w: 590, h: 300 };
    cam.to(tl, T + 4.8, { rect: MEM, zoom: 1.45, anchor: [1290, 560], duration: 1.0 });
    for (let i = 5; i <= 9; i++) {
      const m = A.r(`memory[${i}]`, 'profile');
      const b = K.bar(A, K.pad(m, 0, -2));
      const at = T + 5.8 + (i - 5) * 0.35;
      tl.to(b, { opacity: 1, duration: 0.18 }, at).to(b, { opacity: 0, duration: 0.5 }, at + 0.5);
      OM.sfx('pop', at, { note: (i - 5) % 6 + 1, gain: 0.3 });
    }
    c1.out(tl, T + 8.4);

    // 计算机组成：待核实
    const m7 = A.r('memory[7]', 'profile');
    tl.set(cur.el, { x: 1000, y: 960 }, T + 8.3);
    cur.move(tl, T + 8.3, 1000, 960, 0.01);
    cur.show(tl, T + 8.4);
    cur.move(tl, T + 8.5, m7.x + 120, m7.y + 22, 0.8);
    cur.click(tl, T + 9.4);
    A.swap(tl, T + 9.4, 'profile-note');
    cur.move(tl, T + 9.6, 1150, 620, 0.6);
    cur.hide(tl, T + 10.1);
    const NOTE = { x: 600, y: 180, w: 590, h: 340 };
    cam.to(tl, T + 9.6, { rect: NOTE, zoom: 1.5, anchor: [1290, 520], duration: 1.0 });
    const st = A.r('note.prop[2]', 'profile-note'), bd = A.r('note.body[0]', 'profile-note');
    const rgSt = K.ring(A, { x: st.x - 6, y: st.y - 4, w: 150, h: st.h + 8 }, { color: '#f0700f', radius: 7, width: 3 });
    K.draw(tl, rgSt, T + 10.6, 0.45); OM.sfx('draw', T + 10.6, { dur: 0.45, gain: 0.35 });
    const rgBd = K.ring(A, { x: bd.x - 8, y: bd.y - 6, w: bd.w + 16, h: 34 }, { color: '#f0700f', radius: 7, width: 2.5 });
    K.draw(tl, rgBd, T + 11.3, 0.6);
    const c3 = K.caption(node, { kicker: '来源对不上的时候', title: '两边都留，\n标成待核实', size: 60, x: 120, y: 300, width: 600, id: 'prof-cap3',
      body: '课程群说交学在浙大，助教私聊说发邮件。<br>不悄悄覆盖其中一方，等你确认一次。' });
    c3.in(tl, T + 10.8);
    c3.out(tl, T + 16.4);
    tl.to([rgSt, rgBd], { opacity: 0, duration: 0.3 }, T + 16.4);

    // 关掉，回到校园事务（下一场从这里接）
    A.clipTo(tl, T + 16.8, K.WHOLE, 1.1, 14);
    cam.to(tl, T + 16.8, { rect: K.WHOLE, w: 1560, anchor: [960, 548], duration: 1.1 });
    A.swap(tl, T + 17.5, 'affairs', 0.35);
  },
});

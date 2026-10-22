/* 插件和技能。16 秒（8 小节）。侧栏点「插件」→ 四组卡片依次亮起 → 往下滚到技能 → 助手学到的三张浮起 → 拉远，第二段结束。 */
SCENES.push({
  id: 'plugins', part: 2, bars: 8,
  build(tl, T, node) {
    const A = APP, cam = A.cameraman, cur = A.cursor;
    K.show(tl, A.node, T); K.show(tl, node, T); K.hide(tl, node, T + 16.5);
    cur.click(tl, T + 0.2);
    A.swap(tl, T + 0.2, 'plugins');
    const PAGE = { x: 440, y: 52, w: 1000, h: 948 };
    A.clipTo(tl, T + 0.8, PAGE, 1.0, 16);
    cam.to(tl, T + 0.8, { rect: { x: 440, y: 110, w: 1000, h: 860 }, zoom: 1.05, anchor: [1340, 560], duration: 1.0 });
    cur.move(tl, T + 0.5, 600, 980, 0.8);
    cur.hide(tl, T + 1.3);
    const c1 = K.caption(node, { kicker: '插件', title: '学校的十几个系统，\n按用途接进来', size: 50, x: 120, y: 300, width: 600, id: 'plug-cap1',
      body: '课程与学习、消息与资讯、<br>校园生活、基础能力。<br>账号只存在你自己的电脑上。' });
    c1.in(tl, T + 1.4);
    for (let g = 0; g < 4; g++) {
      const r = A.r(`group[${g}]`, 'plugins');
      const b = K.bar(A, K.pad(r, 6, 6), { radius: 12 });
      const at = T + 2.6 + g * 0.6;
      tl.to(b, { opacity: 1, duration: 0.2 }, at).to(b, { opacity: 0, duration: 0.5 }, at + 0.7);
      OM.sfx('pop', at, { note: g + 2, gain: 0.35 });
    }
    // 往下滚到技能（换图的同一帧，镜头反向补 396 像素）
    const SC = 396;
    cam.to(tl, T + 5.6, { focus: [940, 760], zoom: 1.05, duration: 1.2, ease: 'sine.in' });
    A.swap(tl, T + 6.8, 'skills');
    cam.to(tl, T + 6.8, { focus: [940, 760 - SC], zoom: 1.05, duration: 0.001, ease: 'none' });
    cam.to(tl, T + 6.801, { focus: [940, 700], zoom: 1.05, duration: 1.4, ease: 'sine.out' });
    c1.out(tl, T + 7.0);
    const c2 = K.caption(node, { kicker: '技能', title: '走通的做法，\n存成技能', size: 54, x: 120, y: 300, width: 560, id: 'plug-cap2',
      body: '选课、考前复习、交作业……是自带的；<br>下面三张是助手在对话里学到的。' });
    c2.in(tl, T + 7.6);
    const learned = [19, 20, 21].map((i) => A.r(`skill[${i}]`, 'skills'));
    learned.forEach((r, j) => {
      const p = K.lift(A, K.pad(r, 0, 0), 'skills');
      K.raise(tl, p, T + 8.8 + j * 0.4, { scale: 1.05, y: -6 });
      OM.sfx('thud', T + 9.0 + j * 0.4, { gain: 0.35, pan: j * 0.3 - 0.3 });
      K.lower(tl, p, T + 13.4);
    });
    c2.out(tl, T + 13.6);
    // 第二段收尾：拉远
    A.clipTo(tl, T + 13.8, K.WHOLE, 1.2, 14);
    cam.to(tl, T + 13.8, { rect: K.WHOLE, w: 1100, anchor: [960, 540], duration: 1.4 });
    tl.to(A.tilt, { opacity: 0, scale: 0.94, duration: 0.7, ease: 'power2.in' }, T + 15.1);
    K.hide(tl, A.node, T + 16.0);
  },
});

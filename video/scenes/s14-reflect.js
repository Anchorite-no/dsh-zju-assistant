/* 边界与反思。22 秒（11 小节）。白底，三张卡翻上来，再一张一张聚焦；最后一句下一步。 */
SCENES.push({
  id: 'reflect', part: 3, bars: 11,
  build(tl, T, node) {
    K.show(tl, node, T); K.hide(tl, node, T + 22.4);
    const head = K.chars(node, '我们守住的边界，和{还做不到的}', 'cap-t');
    K.css(head, { position: 'absolute', left: '120px', top: '130px', fontSize: '56px' });
    head.dataset.omId = 'reflect-head';
    K.rise(tl, head, T + 0.3, { stagger: 0.035 });
    const ICON = {
      lock: '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.8"><rect x="4" y="11" width="16" height="10" rx="2.5"/><path d="M8 11V8a4 4 0 0 1 8 0v3"/></svg>',
      hand: '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M5 12l4 4 10-10"/><circle cx="12" cy="12" r="10"/></svg>',
      road: '<svg viewBox="0 0 24 24" width="40" height="40" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M4 20L9 4M20 20L15 4M12 6v2M12 11v2M12 16v2"/></svg>',
    };
    const CARDS = [
      ['账号只在你的电脑上', '账号和密码不进大模型的上下文；档案、会话和课件都存在本机。团队不设服务器，也不需要学校额外开放接口。', 'blue', 'lock'],
      ['说的每件事都有出处', '回答里每一行写着来自哪个平台、哪个群；备忘录的时间和原文逐字核对；档案的每处改动都有记录，能撤销。', 'blue', 'hand'],
      ['还做不到的', '目前只有 Windows 版；邮箱只接了浙大邮箱；学校网页一改版，对应的命令要跟着修。所以渠道和技能分层，改一处不动别处。', 'amber', 'road'],
    ];
    const cards = CARDS.map(([t, d, c, ic], i) => {
      const e = K.el('div', 'rcard ' + c, node, `<i>${ICON[ic]}</i><b>${t}</b><p>${d}</p>`);
      e.dataset.omId = 'reflect-' + i;
      K.css(e, { left: 120 + i * 570, top: 280 });
      gsap.set(e, { opacity: 0, y: 60, rotationX: -30, transformPerspective: 1200, transformOrigin: '50% 0%' });
      const at = T + 1.2 + i * 0.5;
      tl.to(e, { opacity: 1, y: 0, rotationX: 0, duration: 0.8, ease: 'expo.out' }, at);
      OM.sfx('thud', at + 0.2, { gain: 0.35, pan: i * 0.5 - 0.5 });
      return e;
    });
    // 一张一张聚焦
    cards.forEach((e, i) => {
      const at = T + 3.6 + i * 3.2;
      tl.to(e, { scale: 1.05, y: -10, duration: 0.6, ease: OM.spring(0.15), transformOrigin: '50% 50%' }, at);
      tl.to(cards.filter((x) => x !== e), { opacity: 0.45, scale: 0.98, y: 0, duration: 0.5 }, at);
      tl.to(e, { opacity: 1, duration: 0.3 }, at);
      OM.sfx('pop', at, { note: i + 3, gain: 0.3 });
    });
    tl.to(cards, { opacity: 1, scale: 1, y: 0, duration: 0.5 }, T + 13.4);
    const next = K.lines(node, '<b>下一步</b>　学校新上线的平台接进渠道层，再补一份说明，就能进同一张网；<br>其他高校也可以照这个结构，写出自己学校的一份。', 'next');
    K.fadeUp(tl, next, T + 13.8);
    OM.sfx('chime', T + 14.0, { gain: 0.3 });
    K.sink(tl, head, T + 20.8);
    // 三张卡收进中间，落版的课表格子从这里长出来
    tl.to(next, { opacity: 0, y: -20, duration: 0.35, ease: 'power2.in' }, T + 20.6);
    cards.forEach((e, i) => tl.to(e, { x: 960 - 265 - (120 + i * 570), y: 540 - 215 - 280, scale: 0.12, rotation: (i - 1) * 8, opacity: 0, duration: 0.7, ease: 'expo.in' }, T + 20.8 + i * 0.06));
    OM.sfx('reverse', T + 21.6, { dur: 0.7, gain: 0.25 });
  },
});

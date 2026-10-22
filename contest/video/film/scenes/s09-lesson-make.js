/* 这一讲是怎么做出来的。72 秒（36 小节）。接上一场打开的讲解窗口。
   窗口缩到右上角当「成品」→ 顶上一条五步的进度：知识点、讲稿、画面、读法、打包，照讲解技能（core/learn/SKILL.md）的五个阶段。
   每一步摆出这一讲真实的产物（D:\Learn\lessons\ADS-L01-AVL）：底稿里的观众基础、鱼骨图、验算代码的输出、讲稿第 6 幕、
   字幕行和画面代码、带读法的字幕；数字都是数出来的：主线 12 条、挂着的 58 条、例题 3 道、待核对 6 处、字幕 319 行、带读法 144 行。
   五步的产物文件落到进度条下面，最后并成一个 HTML，飞回窗口 → 原速放讲稿里写的那一幕的头三句 → 窗口收回「播放」，光标去「插件」。 */
SCENES.push({
  id: 'lessonmake', part: 2, bars: 36,
  build(tl, T, node) {
    const A = APP, cam = A.cameraman, L = window.LESSON, win = L.win;
    K.show(tl, node, T); K.hide(tl, node, T + 72.5);
    K.hide(tl, L.node, T + 68.6);

    // ---------- 小工具 ----------
    const box = (cls, x, y, w, h, html, parent = node) => {
      const e = K.el('div', cls, parent, html);
      K.css(e, { left: x, top: y, width: w, height: h });
      gsap.set(e, { opacity: 0 });
      return e;
    };
    const boxIn = (e, at, o = {}) => tl.fromTo(e, { opacity: 0, x: o.x ?? 0, y: o.y ?? 36, scale: o.s ?? 0.97 }, { opacity: 1, x: 0, y: 0, scale: 1, duration: o.dur ?? 0.6, ease: 'expo.out', immediateRender: false }, at);
    const boxOut = (els, at) => tl.to(els, { opacity: 0, y: '-=24', duration: 0.4, ease: 'power2.in', stagger: 0.03 }, at);
    // 逐字打出来：{ } 里的字用强调色
    const typed = (parent, text, cls) => {
      const e = K.el('div', cls, parent);
      for (const part of text.split(/(\{[^}]*\})/)) {
        const hot = part.startsWith('{');
        for (const c of hot ? part.slice(1, -1) : part) {
          const s = K.el('span', hot ? 'hot' : null, e, c === ' ' ? '&nbsp;' : c);
          s.style.opacity = 0;
        }
      }
      return e;
    };
    const typeIn = (e, at, dur) => { const cs = e.querySelectorAll('span'); tl.to(cs, { opacity: 1, duration: 0.01, stagger: dur / cs.length }, at); };
    const ov = K.overlay(node);
    // 圆头线帽在长度为 0 时也会画出一个点：描之前整条藏起来
    const line = (d, o = {}) => { const p = K.svg('path', { d, fill: 'none', stroke: o.color || '#4176e6', 'stroke-width': o.width ?? 2, 'stroke-linecap': 'round', pathLength: 1, 'stroke-dasharray': 1, 'stroke-dashoffset': 1, opacity: 0 }, o.svg || ov); p._op = o.opacity ?? 1; return p; };
    const drawIn = (p, at, dur = 0.5) => { tl.set(p, { opacity: p._op }, at); return tl.to(p, { strokeDashoffset: 0, duration: dur, ease: 'power2.inOut' }, at); };

    // ---------- 窗口缩到右上角，当作「成品」 ----------
    const THUMB = { x: 1620, y: 100, s: 0.15 };
    tl.to(win, { x: THUMB.x - 960, y: THUMB.y - 540, scale: THUMB.s, duration: 1.0, ease: 'expo.inOut' }, T + 0.0);
    tl.to(win, { boxShadow: '0 12px 30px rgba(15,17,21,.25)', borderRadius: '40px', duration: 1.0 }, T + 0.0);
    tl.to(A.tilt, { opacity: 0, scale: 0.97, duration: 0.6, ease: 'power2.in' }, T + 0.0);
    OM.sfx('reverse', T + 0.1, { dur: 0.8, gain: 0.3 });
    const head = K.chars(node, '这一讲，是{怎么做出来的}', 'kt dark', { top: '440px', fontSize: '88px' });
    head.dataset.omId = 'make-head';
    K.rise(tl, head, T + 0.6, { stagger: 0.04 });
    K.sink(tl, head, T + 2.3);

    // ---------- 顶上的五步 ----------
    const STEPS = ['知识点', '讲稿', '画面', '读法', '打包'];
    const SX = [120, 370, 590, 810, 1030];
    const steps = STEPS.map((t, i) => {
      const e = K.el('div', 'lm-step', node, `<b>${i + 1}</b>${t}`);
      K.css(e, { left: SX[i] });
      gsap.set(e, { opacity: 0, y: -14 });
      tl.to(e, { opacity: 1, y: 0, duration: 0.45, ease: OM.spring(0.2) }, T + 2.5 + i * 0.1);
      return e;
    });
    const stepW = [154, 130, 130, 130, 130];
    const links = SX.slice(0, 4).map((x, i) => {
      const p = line(`M${x + stepW[i] + 12},100 L${SX[i + 1] - 12},100`, { color: '#cfd3d6' });
      drawIn(p, T + 2.65 + i * 0.1, 0.3);
      return p;
    });
    const toThumb = line(`M${SX[4] + 142},100 L${THUMB.x - 140},100`, { color: '#cfd3d6' });
    drawIn(toThumb, T + 3.1, 0.4);
    const head2 = K.svg('path', { d: `M${THUMB.x - 150},92 L${THUMB.x - 140},100 L${THUMB.x - 150},108`, fill: 'none', stroke: '#cfd3d6', 'stroke-width': 2, opacity: 0 }, ov);
    tl.to(head2, { opacity: 1, duration: 0.2 }, T + 3.4);
    const thumbL = K.el('div', 'lm-thumb-l', node, '成品');
    K.css(thumbL, { left: THUMB.x - 120 });
    gsap.set(thumbL, { opacity: 0 });
    tl.to(thumbL, { opacity: 1, duration: 0.4 }, T + 3.2);
    OM.sfx('pop', T + 2.5, { note: 2, gain: 0.3 });
    // 当前这一步：亮起，前一步打上完成
    const go = (i, at) => {
      tl.set(steps[i], { attr: { class: 'lm-step on' } }, at);
      tl.fromTo(steps[i], { scale: 1 }, { scale: 1.08, duration: 0.18, yoyo: true, repeat: 1, ease: 'power2.out', immediateRender: false }, at);
      if (i > 0) { tl.set(steps[i - 1], { attr: { class: 'lm-step done' } }, at); tl.to(links[i - 1], { stroke: '#4176e6', duration: 0.3 }, at); }
      OM.sfx(i ? 'whip' : 'pop', at, { gain: 0.3, note: 3 });
    };
    // 产物文件落到进度条下面
    const files = [];
    const deposit = (name, i, k, from, at) => {
      const f = K.el('div', 'lm-file', node, name);
      const x = SX[i], y = 140 + k * 34;
      K.css(f, { left: x, top: y });
      gsap.set(f, { opacity: 0 });
      tl.fromTo(f, { opacity: 0, x: from[0] - x, y: from[1] - y, scale: 1.3 }, { opacity: 1, x: 0, y: 0, scale: 1, duration: 0.7, ease: 'expo.inOut', immediateRender: false }, at);
      OM.sfx('slide', at + 0.1, { dur: 0.5, gain: 0.25 });
      files.push(f);
      return f;
    };

    // ======================= ① 知识点 =======================
    go(0, T + 3.0);
    const c1 = K.caption(node, { kicker: '第一步 · 知识点', title: '先读懂资料，\n也读你', size: 60, x: 120, y: 300, width: 560, id: 'make-cap1',
      body: '录播字幕、课件，加上档案里<br>这门课你学过什么、哪里还不熟。' });
    c1.in(tl, T + 3.2);
    // 三样输入
    const cTx = box('lm-card', 780, 230, 340, 330, `<div class="lm-h"><i></i>录播字幕 · 本机转写</div>
      <div class="lm-tx"><span>28:50</span>好，插进去以后哪里会坏</div>
      <div class="lm-tx"><span>29:14</span>从新节点往上，第一个失衡的</div>
      <div class="lm-tx"><span>31:02</span>这种拐弯的，要转两次</div>
      <div class="lm-tx"><span>33:40</span>转完，子树的高度和原来一样</div>
      <div class="lm-tx"><span>35:05</span>所以插入只调这一处</div>`);
    const tree = '<svg width="96" height="62" viewBox="0 0 96 62"><g stroke="#9aa3b2" stroke-width="2" fill="#fff"><path d="M48 12 L24 34 M48 12 L72 34 M24 34 L12 54 M72 34 L84 54" fill="none"/><circle cx="48" cy="12" r="7"/><circle cx="24" cy="34" r="7"/><circle cx="72" cy="34" r="7"/><circle cx="12" cy="54" r="6"/><circle cx="84" cy="54" r="6"/></g></svg>';
    const cSl = box('lm-card', 1140, 230, 340, 330, `<div class="lm-h"><i></i>课件 · 第5讲 AVL树与伸展树</div>
      <div class="lm-slides">${Array.from({ length: 6 }, (_, j) => `<div class="lm-slide"><i></i>${j % 2 ? '' : tree}</div>`).join('')}</div>`);
    const cPf = box('lm-card', 1500, 230, 340, 330, `<div class="lm-h"><i></i>个人档案 · 记忆</div>
      <div class="lm-prof"><b>数据结构基础</b><span class="lm-pill">在修</span></div>
      <div class="lm-prof"><b>学过</b>　复杂度分析、堆、<br>　　　二叉搜索树的查找</div>
      <div class="lm-prof"><b>还不熟</b>　插入和删除、<br>　　　　递归地写程序</div>`);
    [cTx, cSl, cPf].forEach((e, j) => { boxIn(e, T + 3.5 + j * 0.2, { y: -50 }); OM.sfx('thud', T + 3.7 + j * 0.2, { gain: 0.3, pan: j * 0.4 - 0.4 }); });
    // 汇成底稿的第一行：观众的基础（这一讲 plan/outline.md 的原话）
    const cOut = box('lm-card', 780, 650, 1060, 220, '<div class="lm-h"><i></i>写进底稿 · 观众的基础</div>');
    const outT = typed(cOut, '见过二叉搜索树、树的高度和大 O 记号，但都不熟；查找和插入用小例子带回来。{没学过 AVL 树和旋转，从这里讲起。}', 'lm-out-t');
    const joins = [[950, 560], [1310, 560], [1670, 560]].map(([x, y], j) => line(`M${x},${y} C${x},${y + 50} 1310,${650 - 50} 1310,650`, { color: '#b7c8fe' }));
    joins.forEach((p, j) => drawIn(p, T + 5.0 + j * 0.08, 0.5));
    boxIn(cOut, T + 5.4);
    typeIn(outT, T + 5.9, 1.9);
    OM.sfx('type', T + 5.9, { dur: 1.9, gain: 0.35 });
    boxOut([cTx, cSl, cPf, cOut], T + 8.5);
    tl.to(joins, { opacity: 0, duration: 0.3 }, T + 8.5);
    c1.out(tl, T + 8.5);

    // 鱼骨图
    const c2 = K.caption(node, { kicker: '第一步 · 知识点', title: '鱼骨图：\n一条不漏', size: 64, x: 120, y: 300, width: 560, id: 'make-cap2',
      body: '资料里的知识排成 12 条主线，<br>58 条挂在下面，每条注明出处；<br>主线都追问到「为什么」。' });
    c2.in(tl, T + 8.9);
    const FB = K.el('div', 'fishbone', node);
    K.css(FB, { position: 'absolute', left: 0, top: 0, width: 1920, height: 1080 });
    const fsv = K.svg('svg', { class: 'overlay', viewBox: '0 0 1920 1080', width: 1920, height: 1080 }, FB);
    const SY = 600, SX0 = 790, SX1 = 1660;
    const spine = line(`M${SX0},${SY} L${SX1},${SY}`, { svg: fsv, color: '#0f1115', width: 3 });
    drawIn(spine, T + 9.2, 0.6); OM.sfx('draw', T + 9.2, { dur: 0.6, gain: 0.35 });
    const fhead = K.el('div', 'fb-head', FB, 'AVL 树');
    gsap.set(fhead, { opacity: 0, scale: 0.8, transformOrigin: '0% 50%' });
    tl.to(fhead, { opacity: 1, scale: 1, duration: 0.5, ease: OM.spring(0.25) }, T + 9.7);
    const BONES = ['二叉搜索树', '查找看树高', '什么算平衡', 'AVL 的定义', '最少节点数', '树高 O(log N)', '插入的步骤', '旋转', 'RR 和 LL', 'LR 和 RL', '转完高度复原', '插入 O(log N)'];
    const TWIGS = [4, 6, 7, 9, 5, 7, 9, 5, 6, 0, 0, 0];
    const boneEls = [];
    BONES.forEach((name, i) => {
      const up = i % 2 === 0, x = 830 + i * 70, tx = x - 110, ty = up ? SY - 200 : SY + 200;
      const at = T + 9.9 + i * 0.11;
      const b = line(`M${x},${SY} L${tx},${ty}`, { svg: fsv, color: '#61666b', width: 2 });
      drawIn(b, at, 0.35);
      const lab = K.el('div', 'fb-l', FB, name);
      K.css(lab, { left: tx, top: up ? ty - 36 : ty + 6 });
      gsap.set(lab, { xPercent: -50, opacity: 0, y: up ? 8 : -8 });
      tl.to(lab, { opacity: 1, y: 0, duration: 0.4, ease: 'expo.out' }, at + 0.2);
      const tw = [];
      for (let k = 0; k < TWIGS[i]; k++) {
        const f = 0.22 + (0.66 * k) / Math.max(1, TWIGS[i] - 1);
        const px = x + (tx - x) * f, py = SY + (ty - SY) * f;
        const t = line(`M${px},${py} L${px - 30},${py}`, { svg: fsv, color: '#9aa3b2', width: 2 });
        drawIn(t, at + 0.35 + k * 0.05, 0.2);
        tw.push(t);
      }
      boneEls.push({ b, lab, tw });
    });
    OM.sfx('tick', T + 9.9, { gain: 0.3 }); OM.sfx('tick', T + 10.5, { gain: 0.3, note: 3 }); OM.sfx('tick', T + 11.1, { gain: 0.3, note: 5 });
    const cnt = K.el('div', 'fb-count', FB, '<span><b>12</b>条主线</span><span><b>58</b>条挂着的</span><span><b>3</b>道例题</span><span><b>6</b>处待核对</span>');
    gsap.set(cnt.children, { opacity: 0, y: 12 });
    tl.to(cnt.children, { opacity: 1, y: 0, duration: 0.5, ease: 'expo.out', stagger: 0.12 }, T + 11.5);
    const nums = cnt.querySelectorAll('b');
    [[12, 0.8], [58, 1.0], [3, 0.5], [6, 0.6]].forEach(([n, d], j) => K.count(tl, nums[j], 0, n, T + 11.5 + j * 0.12, d));
    OM.sfx('count', T + 11.5, { dur: 1.0, gain: 0.3 });
    // 拿出第 4 条：主线一句，原因，挂着的几条
    tl.to(boneEls[3].lab, { color: '#2f5fcc', scale: 1.12, duration: 0.3 }, T + 12.3);
    tl.to(FB, { opacity: 0.05, duration: 0.5 }, T + 12.7);
    const cPt = box('lm-card', 780, 270, 1060, 560, `<div class="lm-pt">
      <div class="no">主线 4</div>
      <div class="main">AVL 树是每一个节点的左子树和右子树<br>高度最多相差 1 的二叉搜索树。<span class="src">〔课件 76；口头〕</span></div>
      <div class="row why"><i class="hb"></i><b>原因</b><span>要每个节点两边一样高，只有节点数恰好是 1、3、7、15 时才做得到，所以放宽到差 1；只管根不够，根下面挂两条一样长的链也算平衡。</span></div>
      <div class="row"><b>挂着的</b><span>平衡因子 BF＝左子树高度 − 右子树高度　·　空树高度记为 −1<br>判断时要查每一个节点，不能只看根〔口头强调，易错〕</span></div></div>`);
    boxIn(cPt, T + 12.8, { y: 30 });
    OM.sfx('paper', T + 12.9, { gain: 0.4 });
    const hb = cPt.querySelector('.hb');
    gsap.set(hb, { opacity: 0, scaleX: 0, transformOrigin: '0% 50%' });
    tl.to(hb, { opacity: 1, scaleX: 1, duration: 0.5, ease: 'expo.out' }, T + 13.6);
    OM.sfx('ding', T + 13.7, { note: 4, gain: 0.35 });
    boxOut([cPt], T + 15.3);
    tl.to(FB, { opacity: 0, duration: 0.4 }, T + 15.3);
    c2.out(tl, T + 15.3);

    // 验算：例题的数都由代码算
    const c3 = K.caption(node, { kicker: '第一步 · 验算', title: '例题里的每个数，\n先用代码算一遍', size: 56, x: 120, y: 300, width: 600, id: 'make-cap3',
      body: '资料里的例题照着做一遍；<br>讲解里出现的数值，都取自代码的输出。' });
    c3.in(tl, T + 15.7);
    const term = box('lm-term', 780, 250, 1060, 560, '<div class="bar">plan/code · 这一讲的验算</div>');
    const cmd = typed(term, '$ node plan/code/checks.mjs', 'ln');
    cmd.firstChild.classList.add('pr');
    const OUT = [
      ['<span class="dim">h      </span>0   1   2   3    4    5    6    7    8', false],
      ['<span class="dim">n(h)   </span><span class="num">1   2   4   7   12   20   33   54   88</span>', false],
      ['n(h) = F(h+3) − 1，对 h ≤ 40 都成立', true],
      ['N 个节点的 AVL 树，h ≤ 2·log₂N：最坏情形都成立', true],
      ['随机插入 37233 次：16785 次要修，单旋 8284，双旋 8501', true],
      ['修完，子树高度回到插入前：16785 次', true],
      ['依次插入 1..1023：高度 9，和满二叉树一样', true],
    ].map(([h, ok]) => {
      const l = K.el('div', 'ln', term, h + (ok ? '<span class="ok">✓</span>' : ''));
      gsap.set(l, { opacity: 0, x: -10 });
      return l;
    });
    boxIn(term, T + 15.8, { y: 30 });
    typeIn(cmd, T + 16.2, 0.7);
    OM.sfx('type', T + 16.2, { dur: 0.7, gain: 0.35 });
    OUT.forEach((l, j) => {
      const at = T + 17.1 + j * 0.24;
      tl.to(l, { opacity: 1, x: 0, duration: 0.25, ease: 'power2.out' }, at);
      if (j >= 2) OM.sfx('tick', at, { gain: 0.3, note: j });
    });
    boxOut([term], T + 19.9);
    deposit('plan/points.md', 0, 0, [1300, 520], T + 19.9);
    c3.out(tl, T + 20.0);

    // ======================= ② 讲稿 =======================
    go(1, T + 20.4);
    const c4 = K.caption(node, { kicker: '第二步 · 讲稿', title: '先写讲稿，\n再动手画', size: 64, x: 120, y: 300, width: 560, id: 'make-cap4',
      body: '不照搬资料的顺序，排成九幕；<br>讲稿写完、核对完，才开始做画面。' });
    c4.in(tl, T + 20.6);
    const ACTS = ['同样七个数，两棵树', '最矮能多矮，为什么守不住', 'AVL 的规矩', '守住规矩，树最高能多高', '插入：哪里会坏，怎么转回来', '拐弯的情形，和一次插入的代价', '十二个月份从头插一遍', '删除：转完可能还要再转', '这条规矩松一点会怎样'];
    const olH = K.el('div', 'lm-ol-h', node, '底稿 · 九幕');
    K.css(olH, { left: 790, top: 226 });
    gsap.set(olH, { opacity: 0 });
    tl.to(olH, { opacity: 1, duration: 0.4 }, T + 20.8);
    const olHot = K.el('div', 'lm-ol-hot', node);
    K.css(olHot, { left: 776, top: 266 + 5 * 56, width: 400 });
    gsap.set(olHot, { opacity: 0, scaleX: 0, transformOrigin: '0% 50%' });
    const ols = ACTS.map((t, i) => {
      const e = K.el('div', 'lm-ol', node, `<b>${i + 1}</b>${t}`);
      K.css(e, { left: 776, top: 266 + i * 56 });
      gsap.set(e, { opacity: 0, x: -16 });
      tl.to(e, { opacity: 1, x: 0, duration: 0.4, ease: 'expo.out' }, T + 21.0 + i * 0.09);
      return e;
    });
    OM.sfx('slide', T + 21.0, { dur: 0.8, gain: 0.25 });
    tl.to(olHot, { opacity: 1, scaleX: 1, duration: 0.45, ease: 'expo.out' }, T + 22.3);
    tl.to(ols[5], { color: '#0f1115', duration: 0.3 }, T + 22.3);
    tl.to(ols.filter((e, i) => i !== 5), { opacity: 0.4, duration: 0.4 }, T + 22.4);
    OM.sfx('pop', T + 22.3, { note: 5, gain: 0.35 });
    // 讲稿第 6 幕（plan/narration.md 原文）
    const page = box('lm-card lm-page', 1210, 210, 630, 790, `<div class="ttl">6　拐弯的情形，和一次插入的代价</div>
      <div class="sp dir"><em>画面</em>〔依次放进 3、1、2，成一条折线；头两步标 L、R，写 LR；照单旋让 1 升上来，结果是另一条折线，标红〕</div>
      <div class="sp say"><em>口述</em>还剩头两步方向不一样的情形，比如依次放 3、1、2，先左后右，叫 LR。照刚才的办法转一次，折线只是歪到了另一边。</div>
      <div class="sp dir"><em>画面</em>〔上一幕那张带三个记号的图，翻成 LL 的方向，这次多出一小块的是中间的方框，标红〕</div>
      <div class="sp say"><em>口述</em>原因就在那三个记号里。单旋抬高的是外侧的子树，中间那棵深度不变，<mark>而现在长高的偏偏是中间这一棵。那就先在下面转一次，把高的一头换到外侧去。<u></u></mark></div>`);
    const pageL = line('M1176,571 L1210,571', { color: '#4176e6' });
    drawIn(pageL, T + 22.5, 0.35);
    tl.fromTo(page, { opacity: 0, x: -30, scale: 0.96 }, { opacity: 1, x: 0, scale: 1, duration: 0.6, ease: 'expo.out', immediateRender: false }, T + 22.6);
    OM.sfx('paper', T + 22.7, { gain: 0.45 });
    const sps = page.querySelectorAll('.sp');
    gsap.set(sps, { opacity: 0, y: 12 });
    sps.forEach((e, j) => tl.to(e, { opacity: 1, y: 0, duration: 0.45, ease: 'expo.out' }, T + 23.0 + j * 0.5));
    const u = page.querySelector('mark u');
    gsap.set(u, { scaleX: 0 });
    tl.to(u, { scaleX: 1, duration: 0.8, ease: 'power2.inOut' }, T + 25.6);
    OM.sfx('draw', T + 25.6, { dur: 0.8, gain: 0.3 });
    boxOut([page, olH, ...ols, olHot], T + 28.4);
    tl.to(pageL, { opacity: 0, duration: 0.3 }, T + 28.4);
    deposit('plan/narration.md', 1, 0, [1500, 560], T + 28.7);
    c4.out(tl, T + 29.2);

    // ======================= ③ 画面 =======================
    go(2, T + 29.6);
    const c5 = K.caption(node, { kicker: '第三步 · 画面', title: '画面挂在句子上', size: 60, x: 120, y: 300, width: 600, id: 'make-cap5',
      body: '讲稿切成 319 行字幕，每行配一个动作；<br>配音读多长，画面就等多长。' });
    c5.in(tl, T + 29.8);
    const sub = box('lm-sub', 780, 230, 1060, 84, `<span>[</span><span class="k">'f3'</span><span>, </span><span class="s">'照刚才的办法转一次，折线只是歪到了另一边。'</span><span>]</span>`);
    const subCap = K.el('div', 'lm-cap', node, 'film/script.js · 字幕行');
    K.css(subCap, { left: 784, top: 196 });
    gsap.set(subCap, { opacity: 0 });
    boxIn(sub, T + 30.0, { y: 20 });
    tl.to(subCap, { opacity: 1, duration: 0.4 }, T + 30.1);
    const CODE = [
      ['<span class="f">V</span>.SCENES.zig = <span class="f">V</span>.frames([', 0],
      ["  [<span class=\"k\">'f1'</span>, f => bent(f), { off: 2.5 }],", 0],
      ["  [<span class=\"k\">'f2'</span>, f => { bent(f, LR); steps(f, 2); name(f); }],", 0],
      ['  <span class="c">// 照单旋让 1 升上来</span>', 0],
      ["  [<span class=\"k\">'f3'</span>, f => zt(f, D.wrong, { role: { 1: 'bad' } })],", 1],
      ["  [<span class=\"k\">'f4'</span>, failed],", 0],
      ['  <span class="c">// 回到折线，转两次</span>', 0],
      ["  [<span class=\"k\">'f8'</span>, f => zt(f, Z.mid, { role: { 2: 'hot' } })],", 0],
      ["  [<span class=\"k\">'f9'</span>, f => zt(f, Z.after, { role: { 2: 'hot' } })],", 0],
      [']);', 0],
    ];
    const code = box('lm-code', 780, 380, 560, 370, '<div class="hl"></div>' + CODE.map(([h], j) => `<div class="cl"><i>${41 + j}</i>${h}</div>`).join(''));
    const codeCap = K.el('div', 'lm-cap', node, 'film/scenes/40-act6.js · 画面代码');
    K.css(codeCap, { left: 784, top: 346 });
    gsap.set(codeCap, { opacity: 0 });
    boxIn(code, T + 30.4, { y: 20 });
    tl.to(codeCap, { opacity: 1, duration: 0.4 }, T + 30.5);
    const hl = code.querySelector('.hl');
    K.css(hl, { top: 20 + 4 * 32.175, height: 32.175 });
    gsap.set(hl, { opacity: 0, scaleX: 0, transformOrigin: '0% 50%' });
    tl.to(hl, { opacity: 1, scaleX: 1, duration: 0.45, ease: 'expo.out' }, T + 31.6);
    // 字幕行的 'f3' 和代码里的 'f3' 同时闪一下
    const keys = [sub.querySelector('.k'), ...code.querySelectorAll('.cl')[4].querySelectorAll('.k')];
    tl.fromTo(keys, { backgroundColor: 'rgba(240,112,15,0)' }, { backgroundColor: 'rgba(240,112,15,.22)', duration: 0.3, yoyo: true, repeat: 3, immediateRender: false }, T + 31.4);
    OM.sfx('tick', T + 31.6, { gain: 0.4 });
    // 画出来的那一帧（这一讲 18:43 的画面）
    const frame = box('lm-frame', 1376, 380, 464, 272, '<img src="assets/lesson/frame-f3.png">');
    const frCap = K.el('div', 'lm-cap', node, '画出来 · 18:43');
    K.css(frCap, { left: 1380, top: 346 });
    gsap.set(frCap, { opacity: 0 });
    const l2 = line('M1340,545 C1358,545 1358,516 1376,516', { color: '#4176e6' });
    drawIn(l2, T + 32.3, 0.4);
    boxIn(frame, T + 32.5, { x: 30, y: 0 });
    tl.to(frCap, { opacity: 1, duration: 0.4 }, T + 32.6);
    OM.sfx('whoosh', T + 32.5, { gain: 0.3 });
    // 版面自查：程序找越界、重叠、字太小、空画面
    const lint = K.el('div', 'lm-lint', node, '<span>版面自查</span><b>✓ 不出画</b><b>✓ 文字不重叠</b><b>✓ 字号不小于 26</b><b>✓ 没有空画面</b>');
    K.css(lint, { left: 1376, top: 690 });
    lint.style.flexWrap = 'wrap'; lint.style.width = '470px';
    gsap.set(lint.children, { opacity: 0, y: 10 });
    [...lint.children].forEach((e, j) => {
      tl.to(e, { opacity: 1, y: 0, duration: 0.4, ease: OM.spring(0.25) }, T + 34.0 + j * 0.3);
      if (j) OM.sfx('tick', T + 34.0 + j * 0.3, { gain: 0.35, note: j + 2 });
    });
    boxOut([sub, code, frame, subCap, codeCap, frCap, lint], T + 38.6);
    tl.to([l2], { opacity: 0, duration: 0.3 }, T + 38.6);
    deposit('film/script.js', 2, 0, [1300, 270], T + 38.9);
    deposit('film/scenes/', 2, 1, [1060, 600], T + 39.0);
    c5.out(tl, T + 39.0);

    // ======================= ④ 读法 =======================
    go(3, T + 39.4);
    const c6 = K.caption(node, { kicker: '第四步 · 读法', title: '公式和多音字，\n写好中文读法', size: 56, x: 120, y: 300, width: 600, id: 'make-cap6',
      body: '319 行里有 144 行写了读法，配音照着读；<br>没装配音时，画面和字幕照样放。' });
    c6.in(tl, T + 39.6);
    const arrow = '<svg width="56" height="24" viewBox="0 0 56 24"><path d="M2 12 H50 M40 3 L50 12 L40 21" fill="none" stroke="#4176e6" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round"/></svg>';
    const RD = [
      ['课件把这件事写成 <span class="m">T<sub>p</sub> = O(height)</span>', '课件把这件事写成 <span class="hl">T p 等于大 O height</span>'],
      ['又回到了 <span class="m">h</span> + 2，双旋数出来也一样', '又回到了 <span class="hl">h 加二</span>，双旋<span class="hl">数（shǔ）</span>出来也一样'],
      ['而现在长高的偏偏是中间这一棵', '而现在<span class="hl">长（zhǎng）</span>高的偏偏是中间这一棵'],
    ];
    const rds = RD.map(([a, b], j) => {
      const e = K.el('div', 'lm-rd', node, `<div><small>字幕</small>${a}</div>${arrow}<div class="say"><small>读法</small>${b}</div>`);
      K.css(e, { left: 780, top: 270 + j * 170 });
      gsap.set(e.children, { opacity: 0 });
      const at = T + 39.9 + j * 0.7;
      tl.fromTo(e.children[0], { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.45, ease: 'expo.out', immediateRender: false }, at);
      tl.fromTo(e.children[1], { opacity: 0, x: -10 }, { opacity: 1, x: 0, duration: 0.3, immediateRender: false }, at + 0.3);
      tl.fromTo(e.children[2], { opacity: 0, x: -20 }, { opacity: 1, x: 0, duration: 0.45, ease: 'expo.out', immediateRender: false }, at + 0.45);
      OM.sfx('pop', at + 0.45, { note: j + 3, gain: 0.3 });
      return e;
    });
    boxOut(rds, T + 43.7);
    c6.out(tl, T + 43.9);

    // ======================= ⑤ 打包 =======================
    go(4, T + 44.3);
    const c7 = K.caption(node, { kicker: '第五步 · 打包', title: '打成一个文件，\n在应用里放', size: 60, x: 120, y: 300, width: 560, id: 'make-cap7',
      body: '画面、字幕、公式和读法，<br>都在这一个 HTML 里。' });
    c7.in(tl, T + 44.5);
    // 产物文件从进度条下面飞到中间，并成一个
    const HC = [1310, 470];
    files.forEach((f, j) => {
      tl.to(f, { x: `+=${HC[0] - (SX[[0, 1, 2, 2][j]] + 60)}`, y: `+=${HC[1] - (140 + [0, 0, 0, 34][j])}`, scale: 0.6, opacity: 0, duration: 0.75, ease: 'expo.in' }, T + 45.0 + j * 0.05);
    });
    OM.sfx('reverse', T + 45.0, { dur: 0.8, gain: 0.3 });
    const html = K.el('div', 'lm-html', node, `<svg width="54" height="66" viewBox="0 0 54 66"><path d="M4 4 H36 L50 18 V62 H4 Z" fill="#edf3fe" stroke="#2f5fcc" stroke-width="3" stroke-linejoin="round"/><path d="M36 4 V18 H50" fill="none" stroke="#2f5fcc" stroke-width="3" stroke-linejoin="round"/><text x="27" y="48" text-anchor="middle" font-family="Inter" font-weight="700" font-size="13" fill="#2f5fcc">HTML</text></svg><div><b>AVL 树的四种旋转.html</b><span>单个文件 · 338 KB · 九幕</span></div>`);
    gsap.set(html, { opacity: 0, scale: 0.3, transformOrigin: '50% 50%' });
    tl.to(html, { opacity: 1, scale: 1, duration: 0.6, ease: OM.spring(0.3) }, T + 45.8);
    OM.sfx('impact', T + 45.85, { gain: 0.35 });
    // 飞进右上角的窗口
    tl.to(html, { x: THUMB.x - 1310, y: THUMB.y - 470, scale: 0.1, opacity: 0, duration: 0.7, ease: 'expo.in' }, T + 47.3);
    OM.sfx('whoosh', T + 47.4, { gain: 0.3 });
    tl.set(steps[4], { attr: { class: 'lm-step done' } }, T + 48.0);
    tl.to(toThumb, { stroke: '#4176e6', duration: 0.3 }, T + 48.0);
    tl.fromTo(win, { boxShadow: '0 0 0 0 rgba(65,118,230,.9)' }, { boxShadow: '0 0 0 40px rgba(65,118,230,0)', duration: 0.7, ease: 'power2.out', immediateRender: false }, T + 48.0);
    OM.sfx('ding', T + 48.0, { note: 5, gain: 0.4 });
    c7.out(tl, T + 48.0);
    tl.to([...steps, thumbL], { opacity: 0, y: -10, duration: 0.35, stagger: 0.03 }, T + 48.4);
    tl.to([...links, toThumb, head2], { opacity: 0, duration: 0.3 }, T + 48.4);

    // ======================= 放出来 =======================
    tl.to(win, { x: 0, y: 50, scale: 0.8, borderRadius: '14px', boxShadow: '0 50px 120px rgba(15,17,21,.35)', duration: 1.0, ease: 'expo.inOut' }, T + 48.5);
    OM.sfx('whoosh', T + 48.6, { gain: 0.35 });
    // lesson-zig60.mp4 从讲解的 1106.5 秒录起（60 帧）：原速连着放 f1–f3（1107.0–1125.2 秒），讲稿第 6 幕开头这三句，每句放完
    const Z0 = T + 49.4, ZD = 1125.0 - 1107.0;
    // 垫一张这一段最后一帧的定格：放完、窗口收回的那一下不露出前一段的画面
    const endStill = K.el('img', 'film-still', win);
    endStill.src = 'assets/lesson/zig-f3end.png';
    gsap.set(endStill, { opacity: 0 });
    tl.set(endStill, { opacity: 1 }, Z0);
    L.video('v-zig', 'assets/clips/lesson-zig60.mp4', Z0, ZD, 0.5, 1);
    const head3 = K.chars(node, '讲稿里写的那一段，{放出来就是这样}', 'cap-t', { position: 'absolute', left: '50%', top: '70px', fontSize: '42px', transform: 'translateX(-50%)' });
    head3.dataset.omId = 'make-head3';
    K.rise(tl, head3, T + 49.8, { stagger: 0.025 });
    const lBack = K.label(node, '哪里没看懂，告诉它：它回到那一幕换一种讲法，再记进你的档案', { cls: 'blue', x: 960, y: 1004, origin: '50% 0%' });
    gsap.set(lBack, { xPercent: -50 });
    K.pop(tl, lBack, T + 59.5); OM.sfx('pop', T + 59.5, { note: 5, gain: 0.3 });
    K.sink(tl, head3, T + 67.4);
    K.fadeOut(tl, lBack, T + 67.4, { y: 0 });
    // 关窗：应用回来，窗口收回到学习页「播放」那里（和打开时反过来）
    tl.to(A.tilt, { opacity: 1, scale: 1, duration: 0.6, ease: 'power2.out' }, T + 67.6);
    const [px, py] = L.playAt;
    tl.to(win, { x: px - 960, y: py - 540, scale: 0.04, opacity: 0, borderRadius: '40px', duration: 0.7, ease: 'expo.in' }, T + 67.8);
    OM.sfx('reverse', T + 68.5, { dur: 0.7, gain: 0.3 });
    A.clipTo(tl, T + 68.8, K.WHOLE, 1.1, 14);
    cam.to(tl, T + 68.8, { rect: K.WHOLE, w: 1560, anchor: [960, 548], duration: 1.1 });
    // 下一场：光标去侧栏「插件」
    tl.set(A.cursor.el, { x: 1200, y: 900 }, T + 69.5);
    A.cursor.move(tl, T + 69.5, 1200, 900, 0.01);
    A.cursor.show(tl, T + 69.6);
    A.cursor.move(tl, T + 69.6, K.NAV.plugins.x + 80, K.NAV.plugins.y + 18, 1.4);
  },
});

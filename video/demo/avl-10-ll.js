(() => {
  const { C } = V;
  // 一个结点：圆、数字、平衡因子
  function node(x, y, label, o = {}) {
    V.circle(x, y, 54, { fill: o.hot ? V.C.accent : V.C.paper, stroke: o.hot ? V.C.accent : V.C.ink, w: 4, alpha: o.alpha });
    V.txt(label, x, y + 2, { size: 46, weight: 700, color: o.hot ? V.C.bg : V.C.ink, alpha: o.alpha });
    if (o.bf !== undefined) V.txt(`BF ${o.bf}`, x + 96, y - 44, { size: 30, color: o.bf === 2 ? V.C.bad : V.C.mute, alpha: o.alpha, align: 'left' });
  }
  const edge = (a, b, o = {}) => V.line(a[0], a[1] + 54, b[0], b[1] - 54, { w: 4, color: V.C.ink, ...o });

  V.SCENES.why = (t) => {
    const p1 = V.ease((t - V.at('a1')) / 0.8), p2 = V.ease((t - V.at('a1') - 0.8) / 0.8), p3 = V.ease((t - V.at('a1') - 1.6) / 0.8)
    const A = [760, 300], B = [960, 500], D = [1160, 700]
    if (p2 > 0) edge(A, B, { p: p2 })
    if (p3 > 0) edge(B, D, { p: p3 })
    node(...A, '1', { alpha: p1 }); node(...B, '2', { alpha: p2 }); node(...D, '3', { alpha: p3, hot: t > V.at('a2') })
    V.txt('O(n)', 1460, 520, { size: 96, weight: 700, color: V.C.bad, alpha: V.ease((t - V.at('a2')) / 0.6) })
  };

  V.SCENES.ll = (t) => {
    const r = V.ease((t - V.at('b3')) / 1.6) // 旋转进度
    const show10 = V.ease((t - V.at('b1')) / 0.7), warn = V.ease((t - V.at('b2')) / 0.5), done = V.ease((t - V.at('b4')) / 0.6)
    const lerp2 = (a, b) => [V.lerp(a[0], b[0], r), V.lerp(a[1], b[1], r)]
    const N30 = lerp2([960, 260], [1220, 480]), N20 = lerp2([760, 460], [960, 260]), N10 = lerp2([560, 660], [700, 480])
    edge(r < 0.5 ? N30 : N20, r < 0.5 ? N20 : N30, { alpha: 1 })
    edge(N20, N10, { p: show10 })
    node(...N30, '30', { bf: done > 0 ? 0 : warn > 0 ? 2 : 1, hot: warn > 0 && r < 1 })
    node(...N20, '20', { bf: done > 0 ? 0 : 1, hot: r > 0 && r < 1 })
    node(...N10, '10', { alpha: show10, bf: 0 })
    if (r > 0 && r < 1) V.arrow(1180, 220, 1290, 380, { w: 6, color: V.C.accent, alpha: 1 - Math.abs(r - 0.5) * 2 })
    V.txt('右旋', 1500, 300, { size: 64, weight: 700, color: V.C.accentDeep, alpha: V.ease((t - V.at('b3')) / 0.6) })
    V.txt('LL 型', 340, 220, { size: 40, color: V.C.mute, alpha: show10 })
  };
})();

/*
 * 把当前页面存成一份自己就能打开的静态 HTML（视频那边放进 iframe 当矢量界面用）。
 * 注入到页面里运行：window.__snapshot() 返回整份 HTML 文本。
 *   样式：所有样式表（含 @import、构造出来的样式表、引擎的设计变量）的规则文本合成一个 <style>，url() 换成 data URL（字体、背景图）
 *   图片：<img>、<image>、<source> 换成 data URL；<canvas> 换成当时画面的 <img>
 *   去掉 <script>、原来的样式表链接和 CSP；输入框的值写进属性
 *   滚动：滚过的容器，把它的直接子元素用 CSS translate 挪回当时的位置，容器上记 data-demo-scroll-top/left
 * 关键元素上的 data-demo-id 由截图脚本（driver.mjs 的 rects）事先打好。
 */
(() => {
  const cache = new Map()
  async function dataUrl(url) {
    if (!url || url.startsWith('data:')) return url
    if (cache.has(url)) return cache.get(url)
    const task = (async () => {
      try {
        const response = await fetch(url, { credentials: 'include' })
        if (!response.ok) return null
        const blob = await response.blob()
        return await new Promise((resolve) => { const reader = new FileReader(); reader.onload = () => resolve(reader.result); reader.onerror = () => resolve(null); reader.readAsDataURL(blob) })
      } catch { return null }
    })()
    cache.set(url, task)
    return task
  }

  /** 一段 CSS 里的 url(...) 按 base 解析后换成 data URL。 */
  async function inlineUrls(css, base) {
    const found = [...css.matchAll(/url\(\s*(['"]?)([^'")]+)\1\s*\)/g)]
    let out = css
    for (const match of found) {
      const raw = match[2].trim()
      if (raw.startsWith('data:') || raw.startsWith('#')) continue
      let absolute
      try { absolute = new URL(raw, base).href } catch { continue }
      const data = await dataUrl(absolute)
      if (data) out = out.split(match[0]).join(`url("${data}")`)
    }
    return out
  }

  async function sheetText(sheet, depth = 0) {
    if (depth > 4) return ''
    let rules
    try { rules = sheet.cssRules } catch { return '' }
    const base = sheet.href || location.href
    let text = ''
    for (const rule of rules) {
      if (rule.styleSheet) { text += await sheetText(rule.styleSheet, depth + 1); continue }
      text += rule.cssText + '\n'
    }
    text = await inlineUrls(text, base)
    const media = sheet.media?.mediaText
    return media && media !== 'all' ? `@media ${media} {\n${text}}\n` : text
  }

  window.__snapshot = async function snapshot() {
    // 样式
    let css = ''
    for (const sheet of [...document.styleSheets, ...(document.adoptedStyleSheets ?? [])]) {
      if (sheet.disabled) continue
      css += await sheetText(sheet)
    }
    // 结构：原页面和复制出来的那一份并排走，把复制不过去的状态（滚动、输入、画布、图片）补上
    const clone = document.documentElement.cloneNode(true)
    const originals = [document.documentElement, ...document.documentElement.querySelectorAll('*')]
    const copies = [clone, ...clone.querySelectorAll('*')]
    const tasks = []
    originals.forEach((el, index) => {
      const copy = copies[index]
      if (!copy || copy.tagName !== el.tagName) return
      if (el.scrollTop || el.scrollLeft) {
        copy.setAttribute('data-demo-scroll-top', String(Math.round(el.scrollTop)))
        copy.setAttribute('data-demo-scroll-left', String(Math.round(el.scrollLeft)))
        // 吸附（sticky）和固定定位的子元素不跟着内容滚，原样留着（对话页底下的输入框就是吸附在滚动区底部的）；
        // display: contents 的包装层没有盒子，挪不动，往下一层挪它的子元素
        const shift = (copyParent, sourceParent) => {
          ;[...copyParent.children].forEach((child, at) => {
            const source = sourceParent.children[at]
            if (!source) return
            const computed = getComputedStyle(source)
            if (computed.display === 'contents') { shift(child, source); return }
            if (['sticky', 'fixed'].includes(computed.position)) return
            const style = child.getAttribute('style') ?? ''
            child.setAttribute('style', `${style}${style && !style.trim().endsWith(';') ? ';' : ''}translate: ${-el.scrollLeft}px ${-el.scrollTop}px;`)
          })
        }
        shift(copy, el)
      }
      if (el instanceof HTMLInputElement) {
        if (el.type === 'checkbox' || el.type === 'radio') { if (el.checked) copy.setAttribute('checked', ''); else copy.removeAttribute('checked') }
        else copy.setAttribute('value', el.value)
      } else if (el instanceof HTMLTextAreaElement) copy.textContent = el.value
      else if (el instanceof HTMLCanvasElement) {
        try {
          const img = document.createElement('img')
          img.src = el.toDataURL('image/png')
          for (const name of ['class', 'style', 'id', 'data-demo-id']) if (el.getAttribute(name)) img.setAttribute(name, el.getAttribute(name))
          const rect = el.getBoundingClientRect()
          img.setAttribute('width', String(Math.round(rect.width))); img.setAttribute('height', String(Math.round(rect.height)))
          copy.replaceWith(img)
        } catch { /* 画布读不出来就留空 */ }
      } else if (el instanceof HTMLImageElement && el.currentSrc) {
        tasks.push(dataUrl(el.currentSrc).then((data) => { if (data) { copy.setAttribute('src', data); copy.removeAttribute('srcset') } }))
      } else if (el instanceof SVGImageElement) {
        const href = el.href?.baseVal
        if (href) tasks.push(dataUrl(new URL(href, location.href).href).then((data) => { if (data) { copy.setAttribute('href', data); copy.removeAttribute('xlink:href') } }))
      }
      const inline = copy.getAttribute?.('style')
      if (inline && inline.includes('url(')) tasks.push(inlineUrls(inline, location.href).then((value) => { copy.setAttribute('style', value) }))
    })
    await Promise.all(tasks)
    for (const node of clone.querySelectorAll('script, link[rel~="stylesheet"], link[rel~="preload"], link[rel~="modulepreload"], style, meta[http-equiv]')) node.remove()
    const head = clone.querySelector('head') ?? clone.insertBefore(document.createElement('head'), clone.firstChild)
    const meta = document.createElement('meta'); meta.setAttribute('charset', 'utf-8')
    head.prepend(meta)
    const style = document.createElement('style')
    style.textContent = `${css}\n/* 静态快照：不响应鼠标的悬停以外的交互，页面本身不滚动 */\nhtml, body { overflow: hidden; }\n`
    head.append(style)
    return `<!doctype html>\n<!-- 校园智能体界面的静态快照（演示视频用），${new Date().toISOString()}，视口 ${innerWidth}×${innerHeight} -->\n${clone.outerHTML}`
  }
})()

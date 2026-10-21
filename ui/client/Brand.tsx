/**
 * 品牌：名字和图标都只在这个文件里改。
 * 图标是打开的书上升起一颗星（2026-10-21 用户定的），品牌蓝底、校园橙的星；
 * 32 像素及以下用简化的一版（书和星放大、去掉小圆点），和 desktop/icon.ico 里各尺寸的画法一致。
 * 源文件和各尺寸的 PNG 在 比赛/视频/icon/。
 */

export const PRODUCT_NAME = '校园智能体'

export function BrandMark({ size, className }: { size: number, className?: string | undefined }) {
  const small = size <= 32
  const id = small ? 'campus-brand-bg-small' : 'campus-brand-bg'
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 1024 1024" aria-hidden="true">
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1"><stop offset="0" stopColor="#5A8DF5" /><stop offset="1" stopColor="#2F5CC9" /></linearGradient>
      </defs>
      <rect width="1024" height="1024" rx="232" fill={`url(#${id})`} />
      {small ? (
        <>
          <path d="M512 516c-92-62-214-82-354-66v402c140-16 262 4 354 66Z" fill="#fff" />
          <path d="M512 516c92-62 214-82 354-66v402c-140-16-262 4-354 66Z" fill="#fff" fillOpacity="0.8" />
          <path d="M512 112c20 112 74 166 186 186-112 20-166 74-186 186-20-112-74-166-186-186 112-20 166-74 186-186Z" fill="#F0700F" />
        </>
      ) : (
        <>
          <path d="M512 468c-80-54-186-72-306-58v356c120-14 226 4 306 58Z" fill="#fff" />
          <path d="M512 468c80-54 186-72 306-58v356c-120-14-226 4-306 58Z" fill="#fff" fillOpacity="0.82" />
          <path d="M512 140c15 84 56 125 140 140-84 15-125 56-140 140-15-84-56-125-140-140 84-15 125-56 140-140Z" fill="#F0700F" />
          <circle cx="716" cy="188" r="36" fill="#fff" fillOpacity="0.9" />
        </>
      )}
    </svg>
  )
}

export function BrandName() {
  return <span className="campus-brand-name">{PRODUCT_NAME}</span>
}

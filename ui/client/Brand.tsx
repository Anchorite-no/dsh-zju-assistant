/** 品牌占位。图标和名字都是临时的，定名后只改这个文件。 */

export const PRODUCT_NAME = '校园智能体'

export function BrandMark({ size, className }: { size: number, className?: string | undefined }) {
  return (
    <svg className={className} width={size} height={size} viewBox="0 0 24 24" fill="none" aria-hidden="true">
      <rect x="2" y="2" width="20" height="20" rx="6" fill="currentColor" opacity="0.12" />
      <path d="M12 6 4.5 10 12 14l7.5-4L12 6Z" fill="currentColor" />
      <path d="M7.5 12.4v3.1c0 .9 2 2 4.5 2s4.5-1.1 4.5-2v-3.1L12 14.8l-4.5-2.4Z" fill="currentColor" opacity="0.6" />
    </svg>
  )
}

export function BrandName() {
  return <span className="campus-brand-name">{PRODUCT_NAME}</span>
}

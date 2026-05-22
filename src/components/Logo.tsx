import Link from 'next/link'

export default function Logo({ size = 'default' }: { size?: 'default' | 'small' }) {
  const fontSize = size === 'small' ? 'text-xl' : 'text-[26px]'

  return (
    <Link href="/" className={`font-sora font-extrabold ${fontSize} text-[var(--dark)] no-underline flex items-center gap-2`}>
      artisano
      <span className="w-[10px] h-[10px] bg-[var(--orange)] rounded-full inline-block animate-pulse-dot" />
    </Link>
  )
}

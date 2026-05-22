export default function Loading() {
  return (
    <div className="min-h-screen flex items-center justify-center bg-[var(--white)]">
      <div className="flex flex-col items-center gap-4">
        <div className="relative w-12 h-12">
          <div className="absolute inset-0 rounded-full border-[3px] border-[var(--gray-200)]" />
          <div className="absolute inset-0 rounded-full border-[3px] border-transparent border-t-[var(--orange)] animate-spin" />
        </div>
        <span className="font-sora text-sm font-semibold text-[var(--gray-500)]">Chargement...</span>
      </div>
    </div>
  )
}

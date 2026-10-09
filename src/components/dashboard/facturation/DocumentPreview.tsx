'use client'

import { useEffect, useRef, useState } from 'react'

const FRAME_WIDTH = 820 // page A4 (≈ 794 px à 96 dpi) + marges de l'aperçu

/**
 * Affiche le document exactement tel qu'il sera imprimé : le HTML du PDF est
 * rendu dans un cadre isolé, réduit à la largeur disponible (téléphone compris).
 */
export default function DocumentPreview({ html, title }: { html: string; title: string }) {
  const wrapRef = useRef<HTMLDivElement>(null)
  const frameRef = useRef<HTMLIFrameElement>(null)
  const [width, setWidth] = useState(0)
  const [height, setHeight] = useState(1180)

  useEffect(() => {
    const el = wrapRef.current
    if (!el) return
    const ro = new ResizeObserver(([entry]) => setWidth(entry.contentRect.width))
    ro.observe(el)
    return () => ro.disconnect()
  }, [])

  const scale = width ? Math.min(1, width / FRAME_WIDTH) : 0

  return (
    <div ref={wrapRef} className="w-full overflow-hidden rounded-xl bg-[#E5E3DE]" style={{ height: scale ? height * scale : 300 }}>
      <iframe
        ref={frameRef}
        title={title}
        srcDoc={html}
        sandbox="allow-same-origin"
        onLoad={() => {
          const docEl = frameRef.current?.contentDocument?.documentElement
          if (docEl) setHeight(docEl.scrollHeight)
        }}
        style={{ width: FRAME_WIDTH, height, border: 0, transform: `scale(${scale || 0.4})`, transformOrigin: 'top left', display: 'block' }}
      />
    </div>
  )
}

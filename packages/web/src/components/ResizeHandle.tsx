import { useCallback } from 'react'

interface ResizeHandleProps {
  side: 'left' | 'right'
  collapsed: boolean
  containerRef: React.RefObject<HTMLDivElement | null>
  minWidth: number
  maxWidth: number
  onResize: (width: number) => void
  onCollapse: () => void
  onExpand: () => void
}

export default function ResizeHandle({
  side,
  collapsed,
  containerRef,
  minWidth,
  maxWidth,
  onResize,
  onCollapse,
  onExpand,
}: ResizeHandleProps) {
  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (collapsed) return
    const container = containerRef.current
    if (!container) return
    e.preventDefault()

    // Disable CSS transition during drag for instant feedback
    container.style.transition = 'none'

    let lastX = e.clientX

    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - lastX
      lastX = e.clientX
      const current = container.offsetWidth
      const next = Math.max(minWidth, Math.min(maxWidth, current + (side === 'left' ? delta : -delta)))
      container.style.width = `${next}px`
    }

    const onUp = () => {
      container.style.transition = ''
      onResize(container.offsetWidth)
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup', onUp)
      document.body.style.cursor = ''
      document.body.style.userSelect = ''
    }

    document.body.style.cursor = 'col-resize'
    document.body.style.userSelect = 'none'
    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup', onUp)
  }, [collapsed, side, containerRef, minWidth, maxWidth, onResize])

  const expandIcon = side === 'left' ? 'chevron_right' : 'chevron_left'
  const collapseIcon = side === 'left' ? 'chevron_left' : 'chevron_right'

  return (
    <div
      className="relative flex-shrink-0 w-2 group flex items-center justify-center z-10"
      style={{ cursor: collapsed ? 'default' : 'col-resize' }}
      onMouseDown={handleMouseDown}
    >
      {/* Handle track */}
      <div
        className="absolute inset-y-0 w-0.5 bg-outline-variant/20 group-hover:bg-primary/40 transition-colors duration-150"
        style={{ [side === 'left' ? 'right' : 'left']: '3px' }}
      />

      {/* Collapse/expand button */}
      <button
        type="button"
        className="absolute z-20 w-5 h-5 rounded-full bg-surface-container-high border border-outline-variant/30 shadow-sm flex items-center justify-center hover:bg-primary hover:border-primary"
        onClick={collapsed ? onExpand : onCollapse}
        onMouseDown={e => e.stopPropagation()}
        title={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
      >
        <span className="material-symbols-outlined text-on-surface-variant" style={{ fontSize: '12px' }}>
          {collapsed ? expandIcon : collapseIcon}
        </span>
      </button>
    </div>
  )
}

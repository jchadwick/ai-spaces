import { Link } from 'react-router-dom'

interface TopNavBarProps {
  spaceName: string
}

export default function TopNavBar({ spaceName }: TopNavBarProps) {
  return (
    <header className="bg-surface-container-lowest border-b border-outline-variant/20 w-full h-14 flex justify-between items-center px-xl">
      <div className="flex items-center gap-md">
        <Link to="/" className="flex items-center gap-sm hover:opacity-80 transition-opacity">
          <span className="material-symbols-outlined text-primary text-2xl">workspaces</span>
          <span className="font-display text-title-lg text-on-surface font-bold">AI Spaces</span>
        </Link>
        <nav className="flex items-center gap-xs text-body-sm ml-md">
          <span className="text-on-surface-variant">{spaceName}</span>
        </nav>
      </div>
      <div className="flex items-center gap-md">
        <button type="button" className="bg-primary text-on-primary px-lg py-sm rounded-lg text-body-sm font-semibold hover:opacity-90">
          Share
        </button>
        <button type="button" className="p-xs hover:bg-surface-container rounded-full">
          <span className="material-symbols-outlined text-on-surface-variant">account_circle</span>
        </button>
      </div>
    </header>
  )
}
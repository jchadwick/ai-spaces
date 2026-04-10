interface RoleBadgeProps {
  role: 'viewer' | 'editor' | 'admin'
}

interface RoleConfig {
  icon: string
  label: string
  bgClass: string
  textClass: string
}

const roleConfigs: Record<string, RoleConfig> = {
  viewer: {
    icon: 'visibility',
    label: 'Viewer',
    bgClass: 'bg-slate-100 dark:bg-slate-800',
    textClass: 'text-slate-600 dark:text-slate-400',
  },
  editor: {
    icon: 'edit',
    label: 'Editor',
    bgClass: 'bg-blue-100 dark:bg-blue-900/30',
    textClass: 'text-blue-700 dark:text-blue-400',
  },
  admin: {
    icon: 'settings',
    label: 'Admin',
    bgClass: 'bg-purple-100 dark:bg-purple-900/30',
    textClass: 'text-purple-700 dark:text-purple-400',
  },
}

export default function RoleBadge({ role }: RoleBadgeProps) {
  const config = roleConfigs[role]

  return (
    <div className={`inline-flex items-center gap-1.5 px-2.5 py-1 rounded-full text-xs font-semibold uppercase tracking-wide transition-all ${config.bgClass} ${config.textClass}`}>
      <span className="material-symbols-outlined text-sm" style={{ fontVariationSettings: "'FILL' 1" }}>
        {config.icon}
      </span>
      {config.label}
    </div>
  )
}

export { roleConfigs }
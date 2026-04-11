import { useAuditLog, type AuditEntry } from '@/hooks/useAuditLog'
import { ScrollArea } from '@/components/ui/scroll-area'
import { cn } from '@/lib/utils'

interface RecentActivityProps {
  spaceId?: string
  className?: string
  maxEntries?: number
}

const actionLabels: Record<string, string> = {
  'space.create': 'Created space',
  'space.update': 'Updated space',
  'space.delete': 'Deleted space',
  'space.access': 'Accessed space',
  'space.scan': 'Scanned space',
}

const actionIcons: Record<string, string> = {
  'space.create': 'add_circle',
  'space.update': 'edit',
  'space.delete': 'delete',
  'space.access': 'folder_open',
  'space.scan': 'search',
}

function formatTime(timestamp: string): string {
  const date = new Date(timestamp)
  const now = new Date()
  const diff = now.getTime() - date.getTime()
  
  const minutes = Math.floor(diff / 60000)
  const hours = Math.floor(diff / 3600000)
  const days = Math.floor(diff / 86400000)
  
  if (minutes < 1) return 'Just now'
  if (minutes < 60) return `${minutes}m ago`
  if (hours < 24) return `${hours}h ago`
  if (days < 7) return `${days}d ago`
  
  return date.toLocaleDateString()
}

function AuditEntryItem({ entry }: { entry: AuditEntry }) {
  const icon = actionIcons[entry.action] || 'history'
  const label = actionLabels[entry.action] || entry.action
  
  return (
    <div className="flex items-start gap-3 py-2 px-2 rounded-md hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors">
      <span className="material-symbols-outlined text-lg text-slate-400 mt-0.5" style={{ fontVariationSettings: "'FILL' 1" }}>
        {icon}
      </span>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium text-on-surface truncate">
          {label}
        </p>
        {entry.spaceId && (
          <p className="text-xs text-on-surface-variant truncate">
            Space: {entry.spaceId.slice(0, 8)}...
          </p>
        )}
        <p className="text-xs text-on-surface-variant/70">
          {formatTime(entry.timestamp)}
        </p>
      </div>
    </div>
  )
}

function LoadingSkeleton() {
  return (
    <div className="space-y-3 p-3">
      {[...Array(5)].map((_, i) => (
        <div key={`skeleton-${i}`} className="flex items-start gap-3">
          <div className="w-6 h-6 rounded-full bg-slate-200 dark:bg-slate-700 animate-pulse" />
          <div className="flex-1 space-y-2">
            <div className="h-4 w-24 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
            <div className="h-3 w-16 bg-slate-200 dark:bg-slate-700 rounded animate-pulse" />
          </div>
        </div>
      ))}
    </div>
  )
}

export default function RecentActivity({ spaceId, className, maxEntries = 20 }: RecentActivityProps) {
  const { entries, loading, error } = useAuditLog(spaceId, maxEntries)
  
  return (
    <div className={cn("flex flex-col h-full", className)}>
      <div className="flex items-center gap-2 px-3 py-2 border-b border-slate-200 dark:border-slate-800">
        <span className="material-symbols-outlined text-lg text-on-surface-variant" style={{ fontVariationSettings: "'FILL' 1" }}>
          history
        </span>
        <h3 className="text-sm font-semibold text-on-surface">Recent Activity</h3>
      </div>
      
      <ScrollArea className="flex-1">
        {loading && <LoadingSkeleton />}
        
        {error && (
          <div className="p-4 text-center">
            <p className="text-sm text-error">{error}</p>
          </div>
        )}
        
        {!loading && !error && entries.length === 0 && (
          <div className="p-4 text-center">
            <span className="material-symbols-outlined text-3xl text-slate-300 dark:text-slate-600 mb-2">
              inbox
            </span>
            <p className="text-sm text-on-surface-variant">No recent activity</p>
          </div>
        )}
        
        {!loading && !error && entries.length > 0 && (
          <div className="p-2 space-y-1">
            {entries.map(entry => (
              <AuditEntryItem key={entry.id} entry={entry} />
            ))}
          </div>
        )}
      </ScrollArea>
    </div>
  )
}
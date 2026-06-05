import { Suspense, useEffect, useMemo, useState, type CSSProperties, type ReactNode } from 'react'
import { Check, Edit3 } from 'lucide-react'
import { writeSpaceFileHttp } from '@/api/spaceFiles'
import { useFileContent } from '@/hooks/useFileContent'
import { getFileTypeHandler } from './editors/registry'

interface RoomsContentPaneProps {
  spaceId: string
  filePath: string | null
  canEdit: boolean
  onSaved: () => void
  headerContent?: ReactNode
  externalRefreshKey?: number
}

function basename(path: string) {
  return path.split('/').filter(Boolean).pop() || path
}

function RoomsButton({
  children,
  icon,
  onClick,
  variant = 'outline',
  disabled,
}: {
  children: ReactNode
  icon?: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'outline' | 'ghost'
  disabled?: boolean
}) {
  const palette: Record<NonNullable<typeof variant>, CSSProperties> = {
    primary: {
      background: 'var(--rooms-ink)',
      color: 'var(--rooms-paper)',
      border: '1.5px solid var(--rooms-ink)',
    },
    outline: {
      background: 'var(--rooms-paper)',
      color: 'var(--rooms-ink)',
      border: '1.5px solid var(--rooms-line-strong)',
    },
    ghost: {
      background: 'transparent',
      color: 'var(--rooms-ink-soft)',
      border: '1.5px solid transparent',
    },
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        ...palette[variant],
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: '7px 12px',
        borderRadius: 10,
        fontSize: 14,
        fontWeight: 500,
        lineHeight: 1.1,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        whiteSpace: 'nowrap',
      }}
    >
      {icon}
      <span>{children}</span>
    </button>
  )
}

function PaneState({ children, tone = 'muted' }: { children: ReactNode; tone?: 'muted' | 'error' }) {
  return (
    <div
      style={{
        display: 'grid',
        placeItems: 'center',
        minHeight: 180,
        padding: 28,
        color: tone === 'error' ? 'var(--rooms-error)' : 'var(--rooms-muted)',
        fontSize: 14,
        textAlign: 'center',
      }}
    >
      {children}
    </div>
  )
}

function LoadingFallback() {
  return <PaneState>Loading preview...</PaneState>
}

export default function RoomsContentPane({
  spaceId,
  filePath,
  canEdit,
  onSaved,
  headerContent,
  externalRefreshKey = 0,
}: RoomsContentPaneProps) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [localRefresh, setLocalRefresh] = useState(0)
  const refreshKey = localRefresh + externalRefreshKey
  const { content, fileInfo, loading, error } = useFileContent(spaceId, filePath ?? undefined, { refreshKey })
  const handler = useMemo(() => fileInfo ? getFileTypeHandler(fileInfo.type) : undefined, [fileInfo])
  const Viewer = handler?.viewer
  const Editor = handler?.editor
  const showEdit = Boolean(canEdit && Editor && content !== null)

  useEffect(() => {
    setEditing(false)
    setDraft('')
    setSaveError(null)
    setSaving(false)
  }, [filePath])

  async function save() {
    if (!filePath || saving) return
    setSaving(true)
    setSaveError(null)

    try {
      const result = await writeSpaceFileHttp(spaceId, filePath, draft)
      if (!result.success) {
        setSaveError(result.error ?? 'Failed to save file.')
        return
      }

      setEditing(false)
      setLocalRefresh((current) => current + 1)
      onSaved()
    } catch (err) {
      setSaveError(err instanceof Error ? err.message : 'Failed to save file.')
    } finally {
      setSaving(false)
    }
  }

  if (!filePath) {
    return (
      <div style={{ flex: 1, display: 'grid', placeItems: 'center', background: 'var(--rooms-paper)', color: 'var(--rooms-muted)' }}>
        <span style={{ fontSize: 14 }}>No file selected.</span>
      </div>
    )
  }

  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--rooms-paper)' }}>
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 12,
          padding: '13px 28px',
          borderBottom: '1px solid var(--rooms-line)',
          flexShrink: 0,
        }}
      >
        {headerContent ?? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 14, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {fileInfo?.name ?? basename(filePath)}
            </span>
            <span style={{ fontSize: 12, color: 'var(--rooms-muted-2)', whiteSpace: 'nowrap' }}>
              {editing ? 'Editing...' : fileInfo?.modifiedAt ?? ''}
            </span>
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexShrink: 0 }}>
          {editing && (
            <>
              <RoomsButton
                variant="ghost"
                disabled={saving}
                onClick={() => {
                  setEditing(false)
                  setSaveError(null)
                }}
              >
                Cancel
              </RoomsButton>
              <RoomsButton variant="primary" icon={<Check size={16} />} disabled={saving} onClick={() => void save()}>
                {saving ? 'Saving...' : 'Save'}
              </RoomsButton>
            </>
          )}
          {!editing && showEdit && (
            <RoomsButton
              variant="outline"
              icon={<Edit3 size={16} />}
              onClick={() => {
                setDraft(content ?? '')
                setSaveError(null)
                setEditing(true)
              }}
            >
              Edit
            </RoomsButton>
          )}
        </div>
      </div>

      {saveError && (
        <div
          style={{
            padding: '9px 28px',
            borderBottom: '1px solid var(--rooms-error-line)',
            background: 'var(--rooms-error-soft)',
            color: 'var(--rooms-error)',
            fontSize: 13,
            flexShrink: 0,
          }}
        >
          {saveError}
        </div>
      )}

      <div className="rooms-scrollbar" style={{ flex: 1, minHeight: 0, overflow: 'auto', padding: editing ? 0 : '32px 28px 64px' }}>
        {loading && <PaneState>Loading file...</PaneState>}
        {!loading && error && <PaneState tone="error">{error}</PaneState>}
        {!loading && !error && !fileInfo && <PaneState>Loading file...</PaneState>}
        {!loading && !error && fileInfo && editing && Editor && (
          <div style={{ height: '100%', minHeight: 420, background: 'var(--rooms-paper-2)' }}>
            <Suspense fallback={<LoadingFallback />}>
              <Editor content={draft} onChange={setDraft} />
            </Suspense>
          </div>
        )}
        {!loading && !error && fileInfo && !editing && Viewer && (
          <Suspense fallback={<LoadingFallback />}>
            <Viewer content={content} fileInfo={fileInfo} />
          </Suspense>
        )}
        {!loading && !error && fileInfo && !editing && !Viewer && (
          <PaneState>No viewer is available for this file.</PaneState>
        )}
      </div>
    </div>
  )
}

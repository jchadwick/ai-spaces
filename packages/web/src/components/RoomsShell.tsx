import { useCallback, useEffect, useMemo, useRef, useState, type CSSProperties, type ReactNode } from 'react'
import { useLocation, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  ArrowLeft,
  ArrowRight,
  Check,
  ChevronRight,
  Edit3,
  Eye,
  FileText,
  Folder,
  FolderOpen,
  Grid2X2,
  Lock,
  LogOut,
  MessageSquare,
  Plus,
  Shield,
  Trash2,
  User,
  Users,
  X,
} from 'lucide-react'
import ReactMarkdown from 'react-markdown'
import remarkGfm from 'remark-gfm'
import type { FileMetadataEntry, FileNode, SpaceMetadata, SpaceRole } from '@ai-spaces/shared'
import { hasPermission } from '@ai-spaces/shared'
import { useAPI } from '@/hooks/useAPI'
import { useAuth } from '@/contexts/AuthContext'
import { useFileTree } from '@/hooks/useFileTree'
import { useFileContent } from '@/hooks/useFileContent'
import { useToast } from '@/components/ui/use-toast'
import { ToastProvider } from '@/components/ui/toast'
import SpaceSettingsEditor from '@/components/SpaceSettingsEditor'
import { ConnectionStatusProvider, useConnectionStatus } from '@/contexts/ConnectionStatusContext'
import { FileMetadataProvider, useFileMetadata } from '@/contexts/FileMetadataContext'
import AIChatPane from '@/components/AIChatPane'
import { writeSpaceFileHttp } from '@/api/spaceFiles'
import {
  archiveSpaceTopic,
  createSpaceDirectory,
  createSpaceFile,
  createSpaceInvite,
  deleteSpacePath,
  fetchSpaceMembers,
  fetchSpaceMetadata,
  fetchSpaceTopics,
  patchFileMetadata,
  promoteSpaceTopic,
  renameSpacePath,
  type SpaceMember,
  type SpaceTopic,
} from '@/api/spaceFiles'

interface SpaceSummary {
  id: string
  path: string
  config: {
    name: string
    description?: string
  }
  userRole: SpaceRole
}

interface RoomSummary {
  id: string
  spaceId: string
  topicPath: string
  targetType: 'file' | 'directory'
  name: string
  summary: string
  pathParts: string[]
  members: SpaceMember[]
  updatedAt?: string
}

const SPACE_COLORS = ['var(--rooms-space-0)', 'var(--rooms-space-1)', 'var(--rooms-space-2)', 'var(--rooms-space-3)']

function spaceColor(spaces: SpaceSummary[], spaceId: string) {
  const index = Math.max(0, spaces.findIndex((space) => space.id === spaceId))
  return SPACE_COLORS[index % SPACE_COLORS.length]
}

function stripTopicPath(topicPath: string) {
  return topicPath.replace(/^\/+/, '')
}

function pathParts(topicPath: string) {
  return stripTopicPath(topicPath).split('/').filter(Boolean)
}

function basename(topicPath: string) {
  const parts = pathParts(topicPath)
  return parts[parts.length - 1] || 'Root'
}

function initials(label: string) {
  return label
    .split(/\s+/)
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0]?.toUpperCase())
    .join('') || '?'
}

function spaceAbbreviationBase(space: SpaceSummary) {
  const label = space.config.name || space.path || space.id
  return label.replace(/[^a-z0-9]/gi, '').toUpperCase() || '?'
}

function uniqueSpaceAbbreviations(spaces: SpaceSummary[]) {
  const bases = spaces.map(spaceAbbreviationBase)
  const abbreviations = bases.map((base) => base.slice(0, 1))
  const counts = new Map<string, number>()

  abbreviations.forEach((abbreviation) => {
    counts.set(abbreviation, (counts.get(abbreviation) ?? 0) + 1)
  })

  bases.forEach((base, index) => {
    if ((counts.get(abbreviations[index]) ?? 0) > 1) {
      abbreviations[index] = base.slice(0, Math.min(2, base.length))
    }
  })

  for (let width = 3; width <= 4; width += 1) {
    const duplicateCounts = new Map<string, number>()
    abbreviations.forEach((abbreviation) => {
      duplicateCounts.set(abbreviation, (duplicateCounts.get(abbreviation) ?? 0) + 1)
    })
    bases.forEach((base, index) => {
      if ((duplicateCounts.get(abbreviations[index]) ?? 0) > 1 && base.length >= width) {
        abbreviations[index] = base.slice(0, width)
      }
    })
  }

  const finalCounts = new Map<string, number>()
  abbreviations.forEach((abbreviation) => {
    finalCounts.set(abbreviation, (finalCounts.get(abbreviation) ?? 0) + 1)
  })

  const seen = new Map<string, number>()
  return new Map(spaces.map((space, index) => {
    const abbreviation = abbreviations[index]
    if ((finalCounts.get(abbreviation) ?? 0) <= 1) return [space.id, abbreviation] as const

    const seenCount = seen.get(abbreviation) ?? 0
    seen.set(abbreviation, seenCount + 1)
    const suffix = String(seenCount + 1)
    return [space.id, `${abbreviation.slice(0, Math.max(1, 4 - suffix.length))}${suffix}`] as const
  }))
}

function roleIsOwner(role?: SpaceRole) {
  return role === 'owner'
}

function roomUrl(room: RoomSummary) {
  return `/spaces/${room.spaceId}/rooms/${room.id}`
}

function Button({
  children,
  icon,
  onClick,
  variant = 'outline',
  size = 'md',
  disabled,
  title,
  style,
}: {
  children?: ReactNode
  icon?: ReactNode
  onClick?: () => void
  variant?: 'primary' | 'outline' | 'ghost' | 'boundary' | 'danger'
  size?: 'sm' | 'md'
  disabled?: boolean
  title?: string
  style?: CSSProperties
}) {
  const palette = {
    primary: { background: 'var(--rooms-ink)', color: 'var(--rooms-paper)', border: '1.5px solid var(--rooms-ink)' },
    outline: { background: 'var(--rooms-paper)', color: 'var(--rooms-ink)', border: '1.5px solid var(--rooms-line-strong)' },
    ghost: { background: 'transparent', color: 'var(--rooms-ink-soft)', border: '1.5px solid transparent' },
    boundary: { background: 'var(--rooms-boundary)', color: 'var(--rooms-paper)', border: '1.5px solid var(--rooms-boundary)' },
    danger: { background: 'var(--rooms-error-soft)', color: 'var(--rooms-error)', border: '1.5px solid var(--rooms-error-line)' },
  }[variant]
  return (
    <button
      type="button"
      title={title}
      disabled={disabled}
      onClick={onClick}
      style={{
        ...palette,
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        gap: 8,
        padding: size === 'sm' ? '7px 12px' : '10px 16px',
        borderRadius: 10,
        fontSize: size === 'sm' ? 14 : 15,
        fontWeight: 500,
        lineHeight: 1.1,
        cursor: disabled ? 'default' : 'pointer',
        opacity: disabled ? 0.45 : 1,
        whiteSpace: 'nowrap',
        ...style,
      }}
    >
      {icon}
      {children && <span>{children}</span>}
    </button>
  )
}

function IconButton({
  children,
  onClick,
  active,
  title,
  style,
}: {
  children: ReactNode
  onClick?: () => void
  active?: boolean
  title?: string
  style?: CSSProperties
}) {
  return (
    <button
      type="button"
      title={title}
      onClick={onClick}
      style={{
        width: 38,
        height: 38,
        padding: 0,
        borderRadius: 9,
        border: `1.5px solid ${active ? 'var(--rooms-ink)' : 'transparent'}`,
        background: active ? 'var(--rooms-ink)' : 'transparent',
        color: active ? 'var(--rooms-paper)' : 'var(--rooms-ink-soft)',
        cursor: 'pointer',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        ...style,
      }}
    >
      {children}
    </button>
  )
}

function Chip({
  children,
  tone = 'neutral',
  icon,
}: {
  children: ReactNode
  tone?: 'neutral' | 'promoted' | 'restricted' | 'boundary'
  icon?: ReactNode
}) {
  const palette = {
    neutral: { bg: 'var(--rooms-paper-3)', fg: 'var(--rooms-ink-soft)', bd: 'transparent' },
    promoted: { bg: 'var(--rooms-success-soft)', fg: 'var(--rooms-success)', bd: 'transparent' },
    restricted: { bg: 'transparent', fg: 'var(--rooms-muted-2)', bd: 'var(--rooms-line)' },
    boundary: { bg: 'var(--rooms-boundary-soft)', fg: 'var(--rooms-boundary)', bd: 'transparent' },
  }[tone]
  return (
    <span
      style={{
        display: 'inline-flex',
        alignItems: 'center',
        gap: 5,
        padding: '3px 8px',
        borderRadius: 999,
        background: palette.bg,
        color: palette.fg,
        border: `1px solid ${palette.bd}`,
        fontWeight: 600,
        fontSize: 11,
        lineHeight: 1.2,
      }}
    >
      {icon}
      {children}
    </span>
  )
}

function InlineEditableText({
  value,
  placeholder,
  ariaLabel,
  canEdit,
  multiline,
  required,
  textStyle,
  emptyStyle,
  onSave,
}: {
  value: string
  placeholder: string
  ariaLabel: string
  canEdit: boolean
  multiline?: boolean
  required?: boolean
  textStyle?: CSSProperties
  emptyStyle?: CSSProperties
  onSave: (value: string) => Promise<void>
}) {
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState(value)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const normalizedValue = value.trim()
  const displayValue = normalizedValue || placeholder
  const canSave = !required || draft.trim().length > 0

  useEffect(() => {
    if (!editing) setDraft(value)
  }, [editing, value])

  async function save() {
    if (!canSave) {
      setError('Required')
      return
    }
    setSaving(true)
    setError(null)
    try {
      await onSave(draft.trim())
      setEditing(false)
    } catch (saveError) {
      setError(saveError instanceof Error ? saveError.message : 'Failed to save')
    } finally {
      setSaving(false)
    }
  }

  if (!canEdit) {
    return <span style={{ ...textStyle, ...(!normalizedValue ? emptyStyle : undefined) }}>{displayValue}</span>
  }

  if (!editing) {
    return (
      <button
        type="button"
        aria-label={`${ariaLabel}: edit`}
        onClick={() => {
          setDraft(value)
          setEditing(true)
          setError(null)
        }}
        style={{
          display: 'inline-flex',
          alignItems: multiline ? 'flex-start' : 'center',
          gap: 7,
          width: multiline ? '100%' : undefined,
          maxWidth: '100%',
          padding: '2px 5px',
          margin: '-2px -5px',
          border: '1.5px solid transparent',
          borderRadius: 8,
          background: 'transparent',
          color: 'inherit',
          cursor: 'pointer',
          textAlign: 'left',
          ...textStyle,
          ...(!normalizedValue ? emptyStyle : undefined),
        }}
      >
        <span style={{ minWidth: 0, overflow: multiline ? 'visible' : 'hidden', textOverflow: multiline ? undefined : 'ellipsis', whiteSpace: multiline ? 'pre-wrap' : undefined }}>{displayValue}</span>
        <Edit3 size={multiline ? 14 : 16} style={{ flexShrink: 0, color: 'var(--rooms-muted)' }} />
      </button>
    )
  }

  const inputStyle: CSSProperties = {
    width: '100%',
    border: '1.5px solid var(--rooms-line-strong)',
    borderRadius: 10,
    outline: 'none',
    background: 'var(--rooms-paper)',
    color: 'var(--rooms-ink)',
    padding: multiline ? '9px 11px' : '7px 10px',
    resize: 'none',
    ...textStyle,
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8, width: '100%', maxWidth: multiline ? 620 : 520 }}>
      {multiline ? (
        <textarea
          aria-label={ariaLabel}
          rows={3}
          autoFocus
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setEditing(false)
            if ((event.metaKey || event.ctrlKey) && event.key === 'Enter') void save()
          }}
          style={inputStyle}
        />
      ) : (
        <input
          aria-label={ariaLabel}
          autoFocus
          value={draft}
          placeholder={placeholder}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Escape') setEditing(false)
            if (event.key === 'Enter') void save()
          }}
          style={inputStyle}
        />
      )}
      <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
        <Button variant="primary" size="sm" icon={<Check size={16} />} disabled={!canSave || saving} onClick={() => void save()}>
          {saving ? 'Saving' : 'Save'}
        </Button>
        <Button variant="ghost" size="sm" icon={<X size={16} />} disabled={saving} onClick={() => setEditing(false)}>
          Cancel
        </Button>
        {error && <span style={{ fontSize: 12.5, color: 'var(--rooms-error)' }}>{error}</span>}
      </div>
    </div>
  )
}

function Avatar({ label, size = 30, index = 0 }: { label: string; size?: number; index?: number }) {
  const tints = ['var(--rooms-avatar-0)', 'var(--rooms-avatar-1)', 'var(--rooms-avatar-2)', 'var(--rooms-avatar-3)']
  return (
    <span
      title={label}
      style={{
        width: size,
        height: size,
        borderRadius: 999,
        flexShrink: 0,
        background: tints[index % tints.length],
        color: 'var(--rooms-ink-soft)',
        border: '1.5px solid var(--rooms-paper)',
        boxShadow: '0 0 0 1px var(--rooms-line-strong)',
        display: 'inline-flex',
        alignItems: 'center',
        justifyContent: 'center',
        fontWeight: 600,
        fontSize: size * 0.36,
      }}
    >
      {initials(label)}
    </span>
  )
}

function AvatarStack({ members }: { members: SpaceMember[] }) {
  const visible = members.slice(0, 4)
  return (
    <span style={{ display: 'inline-flex' }}>
      {visible.map((member, index) => (
        <span key={member.userId} style={{ marginLeft: index ? -8 : 0 }}>
          <Avatar label={member.displayName || member.email} size={26} index={index} />
        </span>
      ))}
    </span>
  )
}

function PathCrumb({ room, spaces, size = 12 }: { room: RoomSummary; spaces: SpaceSummary[]; size?: number }) {
  const space = spaces.find((candidate) => candidate.id === room.spaceId)
  const parts = [space?.config.name ?? 'Space', ...room.pathParts]
  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 5, color: 'var(--rooms-muted)', fontSize: size, minWidth: 0 }}>
      <span style={{ width: 7, height: 7, borderRadius: 999, background: spaceColor(spaces, room.spaceId), flexShrink: 0 }} />
      {parts.map((part, index) => (
        <span key={`${part}-${index}`} style={{ display: 'inline-flex', alignItems: 'center', gap: 5, minWidth: 0 }}>
          {index > 0 && <span style={{ color: 'var(--rooms-muted-2)' }}>/</span>}
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{part}</span>
        </span>
      ))}
    </span>
  )
}

function Modal({
  title,
  subtitle,
  children,
  footer,
  onClose,
}: {
  title: string
  subtitle?: string
  children: ReactNode
  footer: ReactNode
  onClose: () => void
}) {
  return (
    <div
      className="rooms-fade"
      onMouseDown={onClose}
      style={{ position: 'fixed', inset: 0, zIndex: 80, background: 'rgba(31,31,29,0.32)', display: 'flex', alignItems: 'flex-start', justifyContent: 'center', padding: '7vh 24px 24px', overflow: 'auto' }}
    >
      <div
        className="rooms-rise"
        onMouseDown={(event) => event.stopPropagation()}
        style={{ width: '100%', maxWidth: 540, background: 'var(--rooms-paper)', borderRadius: 20, border: '1.5px solid var(--rooms-line-strong)', boxShadow: '0 40px 80px -30px rgba(31,31,29,0.5)', overflow: 'hidden' }}
      >
        <div style={{ padding: '24px 26px 0', display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 16 }}>
          <div>
            <h2 className="rooms-title" style={{ margin: 0, fontSize: 27, lineHeight: 1.12 }}>{title}</h2>
            {subtitle && <p style={{ margin: '9px 0 0', fontSize: 13.5, color: 'var(--rooms-muted)', lineHeight: 1.5, maxWidth: 420 }}>{subtitle}</p>}
          </div>
          <IconButton title="Close" onClick={onClose} style={{ width: 34, height: 34 }}><X size={18} /></IconButton>
        </div>
        <div style={{ padding: '22px 26px 0' }}>{children}</div>
        <div style={{ padding: '22px 26px', display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 4 }}>{footer}</div>
      </div>
    </div>
  )
}

function Field({
  label,
  value,
  onChange,
  placeholder,
  prefix,
  textarea,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  placeholder?: string
  prefix?: string
  textarea?: boolean
}) {
  const inputStyle: CSSProperties = {
    flex: 1,
    border: 0,
    outline: 'none',
    background: 'transparent',
    resize: 'none',
    fontSize: 15,
    color: 'var(--rooms-ink)',
    minWidth: 0,
    padding: textarea ? 0 : '11px 0',
    lineHeight: 1.5,
  }
  return (
    <label style={{ display: 'block' }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--rooms-ink-soft)', marginBottom: 7 }}>{label}</div>
      <div style={{ display: 'flex', alignItems: textarea ? 'flex-start' : 'center', gap: 6, border: '1.5px solid var(--rooms-line-strong)', borderRadius: 10, background: 'var(--rooms-paper)', padding: textarea ? '11px 13px' : '0 13px', minHeight: textarea ? 0 : 44 }}>
        {prefix && <span style={{ fontSize: 14, color: 'var(--rooms-muted)', whiteSpace: 'nowrap' }}>{prefix}</span>}
        {textarea ? (
          <textarea rows={3} value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} style={inputStyle} />
        ) : (
          <input value={value} onChange={(event) => onChange(event.target.value)} placeholder={placeholder} style={inputStyle} />
        )}
      </div>
    </label>
  )
}

function Rail({
  spaces,
  rooms,
  activeSpaceId,
  view,
  onHome,
  onSpace,
  onNewRoom,
}: {
  spaces: SpaceSummary[]
  rooms: RoomSummary[]
  activeSpaceId: string | null
  view: 'home' | 'space' | 'room'
  onHome: () => void
  onSpace: (spaceId: string) => void
  onNewRoom: () => void
}) {
  const { user, logout } = useAuth()
  const navigate = useNavigate()
  const [userMenuOpen, setUserMenuOpen] = useState(false)
  const menuRef = useRef<HTMLDivElement>(null)
  const hasOwnerSpace = spaces.some((space) => roleIsOwner(space.userRole))
  const visibleSpaces = spaces.filter((space) => roleIsOwner(space.userRole) || rooms.some((room) => room.spaceId === space.id))
  const spaceAbbreviations = uniqueSpaceAbbreviations(visibleSpaces)
  const userLabel = user?.displayName || user?.email || 'User'

  useEffect(() => {
    if (!userMenuOpen) return
    const close = (event: MouseEvent) => {
      if (!menuRef.current?.contains(event.target as Node)) setUserMenuOpen(false)
    }
    const esc = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setUserMenuOpen(false)
    }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => {
      document.removeEventListener('mousedown', close)
      document.removeEventListener('keydown', esc)
    }
  }, [userMenuOpen])

  const handleSignOut = async () => {
    setUserMenuOpen(false)
    await logout()
    navigate('/login')
  }

  return (
    <div style={{ width: 72, flexShrink: 0, background: 'var(--rooms-paper-3)', borderRight: '1px solid var(--rooms-line)', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '16px 0', gap: 10, position: 'relative' }}>
      <button
        type="button"
        title="Rooms home"
        onClick={onHome}
        style={{ width: 44, height: 44, borderRadius: 13, cursor: 'pointer', flexShrink: 0, background: 'var(--rooms-ink)', color: 'var(--rooms-paper)', border: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', boxShadow: view === 'home' && !activeSpaceId ? '0 0 0 3px var(--rooms-paper-3), 0 0 0 4.5px var(--rooms-ink)' : 'none' }}
      >
        <Grid2X2 size={21} />
      </button>
      <div style={{ width: 26, height: 1, background: 'var(--rooms-line-strong)', margin: '4px 0' }} />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 9, alignItems: 'center', overflow: 'visible' }}>
        {visibleSpaces.map((space) => {
          const active = activeSpaceId === space.id && (view === 'space' || view === 'home')
          const color = spaceColor(spaces, space.id)
          const abbreviation = spaceAbbreviations.get(space.id) ?? '?'
          return (
            <button
              key={space.id}
              type="button"
              title={space.config.name}
              onClick={() => onSpace(space.id)}
              style={{ width: 44, height: 44, borderRadius: 13, cursor: 'pointer', flexShrink: 0, position: 'relative', border: `1.5px solid ${active ? color : 'var(--rooms-line-strong)'}`, background: active ? color : 'var(--rooms-paper)', color: active ? 'var(--rooms-paper)' : color, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: abbreviation.length > 3 ? 13 : abbreviation.length > 2 ? 14.5 : 17, fontWeight: 700, letterSpacing: 0 }}
            >
              {abbreviation}
              {active && <span style={{ position: 'absolute', left: -10, top: 12, width: 4, height: 20, borderRadius: 4, background: 'var(--rooms-ink)' }} />}
            </button>
          )
        })}
        {hasOwnerSpace && (
          <button type="button" onClick={onNewRoom} title="New room" style={{ width: 44, height: 44, borderRadius: 13, cursor: 'pointer', border: '1.5px dashed var(--rooms-line-strong)', background: 'transparent', color: 'var(--rooms-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <Plus size={20} />
          </button>
        )}
      </div>
      <div style={{ flex: 1 }} />
      {user?.serverRole === 'admin' && (
        <button type="button" onClick={() => navigate('/admin')} title="Admin" style={{ width: 44, height: 44, borderRadius: 13, cursor: 'pointer', border: '1.5px solid var(--rooms-line-strong)', background: 'var(--rooms-paper)', color: 'var(--rooms-muted)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
          <Shield size={19} />
        </button>
      )}
      <div ref={menuRef} style={{ position: 'relative' }}>
        <button
          type="button"
          onClick={() => setUserMenuOpen((open) => !open)}
          title={userLabel}
          aria-label="Profile menu"
          aria-expanded={userMenuOpen}
          style={{
            width: 44,
            height: 44,
            borderRadius: 13,
            cursor: 'pointer',
            border: `1.5px solid ${userMenuOpen ? 'var(--rooms-ink)' : 'var(--rooms-line-strong)'}`,
            background: 'var(--rooms-paper)',
            color: 'var(--rooms-ink-soft)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            padding: 0,
          }}
        >
          <Avatar label={userLabel} size={32} index={1} />
        </button>
        {userMenuOpen && (
          <div className="rooms-fade" style={{ position: 'absolute', left: 54, bottom: 0, width: 216, padding: 6, background: 'var(--rooms-paper)', border: '1.5px solid var(--rooms-line-strong)', borderRadius: 12, boxShadow: '0 20px 48px -18px rgba(31,31,29,0.4)', zIndex: 100 }}>
            <div style={{ padding: '9px 10px 10px', borderBottom: '1px solid var(--rooms-line)', marginBottom: 4 }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--rooms-ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{userLabel}</div>
              <div style={{ marginTop: 2, fontSize: 12, color: 'var(--rooms-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{user?.email}</div>
            </div>
            <button type="button" onClick={() => { setUserMenuOpen(false); navigate('/profile') }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 0, cursor: 'pointer', background: 'transparent', fontSize: 13.5, fontWeight: 500, color: 'var(--rooms-ink-soft)' }}>
              <User size={16} color="var(--rooms-muted)" />
              Profile
            </button>
            <button type="button" onClick={handleSignOut} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 0, cursor: 'pointer', background: 'transparent', fontSize: 13.5, fontWeight: 500, color: 'var(--rooms-ink-soft)' }}>
              <LogOut size={16} color="var(--rooms-muted)" />
              Sign out
            </button>
          </div>
        )}
      </div>
    </div>
  )
}

function RoomsHome({
  spaces,
  rooms,
  activeSpaceId,
  onOpenRoom,
  onNewRoom,
  onManageSpace,
}: {
  spaces: SpaceSummary[]
  rooms: RoomSummary[]
  activeSpaceId: string | null
  onOpenRoom: (room: RoomSummary) => void
  onNewRoom: () => void
  onManageSpace: (spaceId: string) => void
}) {
  const list = activeSpaceId ? rooms.filter((room) => room.spaceId === activeSpaceId) : rooms
  const activeSpace = activeSpaceId ? spaces.find((space) => space.id === activeSpaceId) : null
  const canCreate = spaces.some((space) => roleIsOwner(space.userRole))
  return (
    <div className="rooms-rise rooms-scrollbar" style={{ height: '100%', overflow: 'auto' }}>
      <div style={{ maxWidth: 1080, margin: '0 auto', padding: '40px 48px 64px' }}>
        <div style={{ display: 'flex', alignItems: 'flex-end', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <h1 className="rooms-title" style={{ margin: 0, fontSize: 44, lineHeight: 1.05 }}>Rooms</h1>
            <p style={{ margin: '10px 0 0', fontSize: 15, color: 'var(--rooms-muted)' }}>
              {list.length} room{list.length === 1 ? '' : 's'} you can work in. Pick one to jump in.
            </p>
          </div>
          {canCreate && <Button variant="primary" icon={<Plus size={18} />} onClick={onNewRoom}>New room</Button>}
        </div>
        {activeSpace && (
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 26, flexWrap: 'wrap' }}>
            <Chip tone="neutral"><span style={{ width: 8, height: 8, borderRadius: 999, background: spaceColor(spaces, activeSpace.id) }} />{activeSpace.config.name}</Chip>
            {roleIsOwner(activeSpace.userRole) && (
              <Button variant="ghost" size="sm" icon={<Folder size={16} />} onClick={() => onManageSpace(activeSpace.id)}>
                Browse raw files & manage this space
              </Button>
            )}
          </div>
        )}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(300px, 1fr))', gap: 18, marginTop: activeSpace ? 22 : 30 }}>
          {list.map((room) => (
            <button
              key={room.id}
              type="button"
              onClick={() => onOpenRoom(room)}
              style={{ background: 'var(--rooms-paper)', border: '1.5px solid var(--rooms-line)', borderRadius: 16, padding: '20px 20px 16px', cursor: 'pointer', minHeight: 168, textAlign: 'left', display: 'flex', flexDirection: 'column', boxShadow: '0 1px 0 rgba(31,31,29,0.02)' }}
            >
              <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 12 }}>
                <h3 className="rooms-title" style={{ margin: 0, fontSize: 24, lineHeight: 1.16 }}>{room.name}</h3>
                <ArrowRight size={20} color="var(--rooms-muted)" />
              </div>
              <p style={{ margin: '9px 0 0', fontSize: 14, lineHeight: 1.5, color: 'var(--rooms-ink-soft)', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical', overflow: 'hidden' }}>
                {room.summary}
              </p>
              <div style={{ flex: 1 }} />
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, marginTop: 16 }}>
                <PathCrumb room={room} spaces={spaces} />
                <AvatarStack members={room.members} />
              </div>
            </button>
          ))}
        </div>
        {list.length === 0 && (
          <div style={{ marginTop: 30, padding: '42px 24px', background: 'var(--rooms-paper)', border: '1.5px solid var(--rooms-line)', borderRadius: 16, textAlign: 'center', color: 'var(--rooms-muted)' }}>
            <MessageSquare size={28} style={{ margin: '0 auto 12px' }} />
            <div style={{ fontSize: 14 }}>No rooms yet.</div>
          </div>
        )}
      </div>
    </div>
  )
}

function CreateRoomModal({
  spaces,
  onClose,
  onCreated,
}: {
  spaces: SpaceSummary[]
  onClose: () => void
  onCreated: (spaceId: string, roomId: string) => void
}) {
  const ownerSpaces = spaces.filter((space) => roleIsOwner(space.userRole))
  const [name, setName] = useState('')
  const [spaceId, setSpaceId] = useState(ownerSpaces[0]?.id ?? '')
  const [folder, setFolder] = useState('')
  const [summary, setSummary] = useState('')
  const { showToast } = useToast()
  const selectedSpace = ownerSpaces.find((space) => space.id === spaceId)
  const canCreate = Boolean(name.trim() && folder.trim() && spaceId)
  async function createRoom() {
    if (!canCreate) return
    const normalizedPath = folder.split('/').map((part) => part.trim()).filter(Boolean).join('/')
    try {
      await createSpaceDirectory(spaceId, normalizedPath)
      await createSpaceFile(spaceId, `${normalizedPath}/overview.md`, `# ${name.trim()}\n\n${summary.trim() || 'Start here.'}\n`)
      await patchFileMetadata(spaceId, normalizedPath, { displayName: name.trim(), summary: summary.trim() || undefined })
      const room = await promoteSpaceTopic(spaceId, `/${normalizedPath}`, 'directory')
      showToast('Room created', 'success')
      onCreated(spaceId, room.id)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to create room', 'error')
    }
  }
  return (
    <Modal
      title="New room"
      subtitle="Create a folder inside a Space and promote it into a room collaborators can open."
      onClose={onClose}
      footer={<><Button variant="ghost" onClick={onClose}>Cancel</Button><Button variant="primary" icon={<Plus size={17} />} disabled={!canCreate} onClick={createRoom}>Create room</Button></>}
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
        <Field label="Room name" placeholder="Yellowstone vacation" value={name} onChange={setName} />
        <div>
          <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--rooms-ink-soft)', marginBottom: 9 }}>Space</div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
            {ownerSpaces.map((space) => (
              <button key={space.id} type="button" onClick={() => setSpaceId(space.id)} style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '9px 14px', borderRadius: 10, border: `1.5px solid ${spaceId === space.id ? 'var(--rooms-ink)' : 'var(--rooms-line-strong)'}`, background: spaceId === space.id ? 'var(--rooms-paper-3)' : 'var(--rooms-paper)', cursor: 'pointer', fontWeight: 500, fontSize: 13.5 }}>
                <span style={{ width: 9, height: 9, borderRadius: 999, background: spaceColor(spaces, space.id) }} />
                {space.config.name}
                {spaceId === space.id && <Check size={15} />}
              </button>
            ))}
          </div>
        </div>
        <Field label="Folder path" prefix={selectedSpace ? `${selectedSpace.config.name} /` : undefined} placeholder="Vacations / Yellowstone" value={folder} onChange={setFolder} />
        <Field label="Summary" textarea placeholder="Plans, budget, lodging, and chat for the Yellowstone trip." value={summary} onChange={setSummary} />
        <div style={{ display: 'flex', gap: 10, padding: '12px 14px', background: 'var(--rooms-paper-2)', border: '1px solid var(--rooms-line)', borderRadius: 12 }}>
          <Shield size={17} color="var(--rooms-muted)" />
          <span style={{ fontSize: 12.5, color: 'var(--rooms-ink-soft)', lineHeight: 1.5 }}>This adds a folder inside the Space and promotes that one path. The rest of the Space stays private.</span>
        </div>
      </div>
    </Modal>
  )
}

function RoomDetail({
  room,
  spaces,
  role,
  initialFilePath,
  onSelectFile,
  onUpdateRoomMetadata,
}: {
  room: RoomSummary
  spaces: SpaceSummary[]
  role: SpaceRole
  initialFilePath: string | null
  onSelectFile: (filePath: string) => void
  onUpdateRoomMetadata: (room: RoomSummary, patch: Partial<FileMetadataEntry>) => Promise<void>
}) {
  const { accessToken } = useAuth()
  return (
    <ConnectionStatusProvider spaceId={room.spaceId} accessToken={accessToken}>
      <RoomDetailInner room={room} spaces={spaces} role={role} initialFilePath={initialFilePath} onSelectFile={onSelectFile} onUpdateRoomMetadata={onUpdateRoomMetadata} />
    </ConnectionStatusProvider>
  )
}

function RoomDetailInner({
  room,
  spaces,
  role,
  initialFilePath,
  onSelectFile,
  onUpdateRoomMetadata,
}: {
  room: RoomSummary
  spaces: SpaceSummary[]
  role: SpaceRole
  initialFilePath: string | null
  onSelectFile: (filePath: string) => void
  onUpdateRoomMetadata: (room: RoomSummary, patch: Partial<FileMetadataEntry>) => Promise<void>
}) {
  const apiFetch = useAPI()
  const { selectTopic } = useConnectionStatus()
  const canEdit = hasPermission(role, 'files:write')
  const canEditMetadata = roleIsOwner(role)
  const [files, setFiles] = useState<FileNode[]>([])
  const [loading, setLoading] = useState(false)
  const [activePath, setActivePath] = useState<string | null>(null)
  const [chatOpen, setChatOpen] = useState(false)
  const roomRoot = stripTopicPath(room.topicPath)
  const routedFilePath = initialFilePath ? `${roomRoot}/${initialFilePath}` : null
  const refresh = useCallback(async () => {
    setLoading(true)
    try {
      const res = await apiFetch(`/api/spaces/${room.spaceId}/files?path=${encodeURIComponent(roomRoot)}`)
      const data = await res.json() as { files?: FileNode[] }
      const next = (data.files ?? []).filter((node) => node.type === 'file')
      setFiles(next)
      setActivePath((current) => routedFilePath ?? current ?? next[0]?.path ?? null)
    } finally {
      setLoading(false)
    }
  }, [apiFetch, room.spaceId, roomRoot, routedFilePath])
  useEffect(() => { void refresh() }, [refresh])
  useEffect(() => {
    if (routedFilePath) setActivePath(routedFilePath)
  }, [routedFilePath])
  useEffect(() => {
    void selectTopic(room.topicPath)
  }, [room.topicPath, selectTopic])
  const activeFile = files.find((file) => file.path === activePath) ?? files[0]
  return (
    <div className="rooms-rise" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '22px 36px 20px', borderBottom: '1px solid var(--rooms-line)', flexShrink: 0 }}>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div style={{ minWidth: 0, maxWidth: 620 }}>
            <h1 className="rooms-title" style={{ margin: 0, fontSize: 34, lineHeight: 1.08 }}>
              <InlineEditableText
                value={room.name}
                placeholder="Untitled room"
                ariaLabel="Room name"
                canEdit={canEditMetadata}
                required
                textStyle={{ fontSize: 34, lineHeight: 1.08, fontWeight: 700 }}
                onSave={(displayName) => onUpdateRoomMetadata(room, { displayName })}
              />
            </h1>
            <div style={{ margin: '8px 0 0', fontSize: 14, lineHeight: 1.55, color: 'var(--rooms-ink-soft)' }}>
              <InlineEditableText
                value={room.summary}
                placeholder="Add a room description"
                ariaLabel="Room description"
                canEdit={canEditMetadata}
                multiline
                textStyle={{ fontSize: 14, lineHeight: 1.55, fontWeight: 400 }}
                emptyStyle={{ color: 'var(--rooms-muted)' }}
                onSave={(summary) => onUpdateRoomMetadata(room, { summary })}
              />
            </div>
            <div style={{ marginTop: 11 }}><PathCrumb room={room} spaces={spaces} size={12.5} /></div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <AvatarStack members={room.members} />
            {!chatOpen && <Button variant="outline" icon={<MessageSquare size={18} />} onClick={() => setChatOpen(true)}>Ask the agent</Button>}
          </div>
        </div>
      </div>
      <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
        <div style={{ width: 232, flexShrink: 0, borderRight: '1px solid var(--rooms-line)', display: 'flex', flexDirection: 'column', background: 'var(--rooms-paper-2)' }}>
          <div style={{ padding: '16px 14px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
            <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--rooms-muted)' }}>Files</span>
            <span style={{ fontSize: 12, color: 'var(--rooms-muted-2)' }}>{files.length}</span>
          </div>
          <div className="rooms-scrollbar" style={{ flex: 1, overflow: 'auto', padding: '0 8px 12px', display: 'flex', flexDirection: 'column', gap: 2 }}>
            {loading && <div style={{ padding: 12, color: 'var(--rooms-muted)', fontSize: 13 }}>Loading...</div>}
            {files.map((file) => (
              <button key={file.path} type="button" onClick={() => { setActivePath(file.path); onSelectFile(file.path) }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '9px 11px', borderRadius: 9, cursor: 'pointer', border: `1.5px solid ${file.path === activeFile?.path ? 'var(--rooms-line-strong)' : 'transparent'}`, background: file.path === activeFile?.path ? 'var(--rooms-paper)' : 'transparent' }}>
                <FileText size={17} color={file.path === activeFile?.path ? 'var(--rooms-ink)' : 'var(--rooms-muted)'} />
                <span style={{ fontWeight: file.path === activeFile?.path ? 600 : 500, fontSize: 13.5, color: file.path === activeFile?.path ? 'var(--rooms-ink)' : 'var(--rooms-ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{file.name}</span>
              </button>
            ))}
          </div>
          <div style={{ padding: '12px 14px', borderTop: '1px solid var(--rooms-line)', display: 'flex', gap: 8, alignItems: 'flex-start' }}>
            <Shield size={15} color="var(--rooms-boundary)" />
            <span style={{ fontSize: 11.5, lineHeight: 1.5, color: 'var(--rooms-muted)' }}>Only this folder is shared. The rest of the Space stays private.</span>
          </div>
        </div>
        <RoomFileDoc key={activeFile?.path ?? 'no-file'} spaceId={room.spaceId} filePath={activeFile?.path ?? null} canEdit={canEdit} onSaved={refresh} />
        {chatOpen && (
          <div style={{ width: 380, minWidth: 320, maxWidth: '40vw', flexShrink: 0, display: 'flex', minHeight: 0 }}>
            <AIChatPane role={role} spaceId={room.spaceId} onClose={() => setChatOpen(false)} />
          </div>
        )}
      </div>
    </div>
  )
}

function RoomFileDoc({
  spaceId,
  filePath,
  canEdit,
  onSaved,
  headerContent,
}: {
  spaceId: string
  filePath: string | null
  canEdit: boolean
  onSaved: () => void
  headerContent?: ReactNode
}) {
  const { content, fileInfo, loading, error } = useFileContent(spaceId, filePath ?? undefined)
  const [editing, setEditing] = useState(false)
  const [draft, setDraft] = useState('')
  const { showToast } = useToast()
  if (!filePath) {
    return <div style={{ flex: 1, display: 'grid', placeItems: 'center', background: 'var(--rooms-paper)', color: 'var(--rooms-muted)' }}>No file selected.</div>
  }
  async function save() {
    if (!filePath) return
    const result = await writeSpaceFileHttp(spaceId, filePath, draft)
    if (result.success) {
      setEditing(false)
      onSaved()
      showToast('Saved', 'success')
    } else {
      showToast(result.error ?? 'Failed to save', 'error')
    }
  }
  return (
    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0, background: 'var(--rooms-paper)' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '13px 28px', borderBottom: '1px solid var(--rooms-line)', flexShrink: 0 }}>
        {headerContent ?? (
          <div style={{ display: 'flex', alignItems: 'baseline', gap: 10, minWidth: 0 }}>
            <span style={{ fontWeight: 600, fontSize: 14 }}>{fileInfo?.name ?? basename(filePath)}</span>
            <span style={{ fontSize: 12, color: 'var(--rooms-muted-2)', whiteSpace: 'nowrap' }}>{editing ? 'Editing...' : fileInfo?.modifiedAt ?? ''}</span>
          </div>
        )}
        <div style={{ display: 'flex', gap: 8 }}>
          {editing ? <><Button variant="ghost" size="sm" onClick={() => setEditing(false)}>Cancel</Button><Button variant="primary" size="sm" icon={<Check size={16} />} onClick={save}>Save</Button></> : canEdit && <Button variant="outline" size="sm" icon={<Edit3 size={16} />} onClick={() => { setDraft(content ?? ''); setEditing(true) }}>Edit</Button>}
        </div>
      </div>
      <div className="rooms-scrollbar" style={{ flex: 1, overflow: 'auto', padding: editing ? 0 : '32px 28px 64px' }}>
        {loading && <div style={{ color: 'var(--rooms-muted)' }}>Loading...</div>}
        {error && <div style={{ color: 'var(--rooms-error)' }}>{error}</div>}
        {editing ? (
          <textarea value={draft} onChange={(event) => setDraft(event.target.value)} autoFocus spellCheck={false} style={{ width: '100%', height: '100%', minHeight: 400, border: 0, outline: 'none', resize: 'none', padding: 28, fontFamily: 'ui-monospace, Menlo, monospace', fontSize: 13.5, lineHeight: 1.7, color: 'var(--rooms-ink)', background: 'var(--rooms-paper-2)' }} />
        ) : (
          <div style={{ maxWidth: 660, fontSize: 15, lineHeight: 1.7, color: 'var(--rooms-ink-soft)' }}>
            <ReactMarkdown remarkPlugins={[remarkGfm]}>{content ?? ''}</ReactMarkdown>
          </div>
        )}
      </div>
    </div>
  )
}

function findNode(nodes: FileNode[], targetPath: string): FileNode | null {
  for (const node of nodes) {
    if (node.path === targetPath) return node
    if (node.children) {
      const found = findNode(node.children, targetPath)
      if (found) return found
    }
  }
  return null
}

function isRestricted(metadata: SpaceMetadata, nodePath: string) {
  return Object.entries(metadata.files).some(([path, entry]) => {
    const normalized = path.replace(/^\/+/, '').replace(/\/+$/, '')
    return (entry as { restricted?: boolean }).restricted && (nodePath === normalized || nodePath.startsWith(`${normalized}/`))
  })
}

function SpaceExplorer({
  space,
  spaces,
  promotedTopicPaths,
  promotedTopicIdsByPath,
  initialPath,
  onBack,
  onOpenRoom,
  onRefreshRooms,
  onUpdateSpaceConfig,
}: {
  space: SpaceSummary
  spaces: SpaceSummary[]
  promotedTopicPaths: ReadonlySet<string>
  promotedTopicIdsByPath: ReadonlyMap<string, string>
  initialPath: string | null
  onBack: () => void
  onOpenRoom: (spaceId: string, topicPath: string) => void
  onRefreshRooms: () => void
  onUpdateSpaceConfig: (spaceId: string, patch: Partial<SpaceSummary['config']>) => Promise<void>
}) {
  return (
    <FileMetadataProvider spaceId={space.id}>
      <SpaceExplorerInner key={`${space.id}:${initialPath ?? ''}`} space={space} spaces={spaces} promotedTopicPaths={promotedTopicPaths} promotedTopicIdsByPath={promotedTopicIdsByPath} initialPath={initialPath} onBack={onBack} onOpenRoom={onOpenRoom} onRefreshRooms={onRefreshRooms} onUpdateSpaceConfig={onUpdateSpaceConfig} />
    </FileMetadataProvider>
  )
}

function SpaceExplorerInner({
  space,
  spaces,
  promotedTopicPaths,
  promotedTopicIdsByPath,
  initialPath,
  onBack,
  onOpenRoom,
  onRefreshRooms,
  onUpdateSpaceConfig,
}: {
  space: SpaceSummary
  spaces: SpaceSummary[]
  promotedTopicPaths: ReadonlySet<string>
  promotedTopicIdsByPath: ReadonlyMap<string, string>
  initialPath: string | null
  onBack: () => void
  onOpenRoom: (spaceId: string, topicPath: string) => void
  onRefreshRooms: () => void
  onUpdateSpaceConfig: (spaceId: string, patch: Partial<SpaceSummary['config']>) => Promise<void>
}) {
  const { files, loading, refresh, loadChildren } = useFileTree(space.id)
  const { metadata, updateEntry } = useFileMetadata()
  const { showToast } = useToast()
  const routeSelection = useMemo(() => {
    if (!initialPath || files.length === 0) {
      return { currentFolder: null as string | null, selectedFile: null as string | null }
    }
    const node = findNode(files, initialPath)
    if (node?.type === 'directory') {
      return { currentFolder: node.path, selectedFile: null as string | null }
    }
    if (node?.type === 'file') {
      const parent = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : null
      return { currentFolder: parent, selectedFile: node.path }
    }
    return { currentFolder: null as string | null, selectedFile: null as string | null }
  }, [files, initialPath])
  const [currentFolderOverride, setCurrentFolderOverride] = useState<string | null>()
  const [selectedFileOverride, setSelectedFileOverride] = useState<string | null>()
  const [menu, setMenu] = useState<{ x: number; y: number; node: FileNode | null } | null>(null)
  const [draftFile, setDraftFile] = useState<{ parent: string | null; type: 'file' | 'directory' } | null>(null)
  const [newName, setNewName] = useState('')
  const [activeTab, setActiveTab] = useState<'files' | 'members'>('files')
  const currentFolder = currentFolderOverride === undefined ? routeSelection.currentFolder : currentFolderOverride
  const selectedFile = selectedFileOverride === undefined ? routeSelection.selectedFile : selectedFileOverride
  const setCurrentFolder = (path: string | null) => setCurrentFolderOverride(path)
  const setSelectedFile = (path: string | null) => setSelectedFileOverride(path)
  const selectedNode = selectedFile ? findNode(files, selectedFile) : null
  const selectedPathParts = selectedFile?.split('/').filter(Boolean) ?? []
  async function promote(node: FileNode) {
    if (isRestricted(metadata, node.path)) {
      showToast('Restricted paths cannot be promoted to Rooms', 'error')
      return
    }
    try {
      await promoteSpaceTopic(space.id, `/${node.path}`, node.type === 'directory' ? 'directory' : 'file')
      showToast(`${node.name} promoted to a Room`, 'success')
      onRefreshRooms()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to promote', 'error')
    }
  }
  async function demote(node: FileNode) {
    const roomId = promotedTopicIdsByPath.get(node.path)
    if (!roomId) return
    try {
      await archiveSpaceTopic(space.id, roomId)
      showToast('Demoted to a folder - files kept', 'success')
      onRefreshRooms()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to demote', 'error')
    }
  }
  async function toggleRestricted(node: FileNode) {
    await updateEntry(node.path, { restricted: !isRestricted(metadata, node.path) } as never)
    showToast(isRestricted(metadata, node.path) ? 'Sharing allowed' : 'Restricted - never shared', 'success')
    onRefreshRooms()
  }
  async function deleteNode(node: FileNode) {
    try {
      await deleteSpacePath(space.id, node.path, node.type === 'directory' ? 'directory' : 'file')
      showToast(`Deleted ${node.name}`, 'success')
      if (selectedFile === node.path) setSelectedFile(null)
      refresh()
      onRefreshRooms()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to delete', 'error')
    }
  }
  async function renameNode(node: FileNode) {
    const name = window.prompt('Rename', node.name)?.trim()
    if (!name || name === node.name) return
    const parent = node.path.includes('/') ? node.path.slice(0, node.path.lastIndexOf('/')) : ''
    const nextPath = parent ? `${parent}/${name}` : name
    try {
      const actualPath = await renameSpacePath(space.id, node.path, nextPath, node.type === 'directory' ? 'directory' : 'file')
      if (selectedFile === node.path) setSelectedFile(actualPath)
      refresh()
      onRefreshRooms()
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to rename', 'error')
    }
  }
  async function createNew() {
    if (!draftFile || !newName.trim()) return
    const path = draftFile.parent ? `${draftFile.parent}/${newName.trim()}` : newName.trim()
    try {
      if (draftFile.type === 'directory') await createSpaceDirectory(space.id, path)
      else await createSpaceFile(space.id, path)
      setDraftFile(null)
      setNewName('')
      refresh()
      if (draftFile.parent) await loadChildren(draftFile.parent)
      if (draftFile.type === 'file') setSelectedFile(path)
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to create', 'error')
    }
  }
  function openNode(node: FileNode) {
    if (node.type === 'directory') {
      setCurrentFolder(node.path)
      setSelectedFile(null)
      void loadChildren(node.path)
      return
    }
    setSelectedFile(node.path)
  }
  return (
    <div className="rooms-rise" style={{ height: '100%', display: 'flex', flexDirection: 'column', overflow: 'hidden' }} onContextMenu={(event) => event.preventDefault()}>
      <div style={{ padding: '22px 32px 18px', borderBottom: '1px solid var(--rooms-line)', flexShrink: 0 }}>
        <button type="button" onClick={onBack} style={{ display: 'inline-flex', alignItems: 'center', gap: 6, background: 'transparent', border: 0, cursor: 'pointer', color: 'var(--rooms-muted)', fontSize: 13.5, padding: 0, marginBottom: 12 }}><ArrowLeft size={16} /> All rooms</button>
        <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', gap: 20, flexWrap: 'wrap' }}>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 11 }}>
              <span style={{ width: 13, height: 13, borderRadius: 999, background: spaceColor(spaces, space.id) }} />
              <h1 className="rooms-title" style={{ margin: 0, fontSize: 32, lineHeight: 1.08 }}>
                <InlineEditableText
                  value={space.config.name}
                  placeholder="Untitled space"
                  ariaLabel="Space name"
                  canEdit
                  required
                  textStyle={{ fontSize: 32, lineHeight: 1.08, fontWeight: 700 }}
                  onSave={(name) => onUpdateSpaceConfig(space.id, { name })}
                />
              </h1>
            </div>
            <div style={{ margin: '8px 0 0', fontSize: 13.5, color: 'var(--rooms-muted)', maxWidth: 620 }}>
              <InlineEditableText
                value={space.config.description ?? ''}
                placeholder="Add a space description"
                ariaLabel="Space description"
                canEdit
                multiline
                textStyle={{ fontSize: 13.5, lineHeight: 1.5, fontWeight: 400 }}
                emptyStyle={{ color: 'var(--rooms-muted-2)' }}
                onSave={(description) => onUpdateSpaceConfig(space.id, { description })}
              />
            </div>
          </div>
          <InviteButton spaceId={space.id} />
        </div>
      </div>
      <div style={{ padding: '0 32px', borderBottom: '1px solid var(--rooms-line)', flexShrink: 0, display: 'flex', gap: 6 }}>
        {(['files', 'members'] as const).map((tab) => {
          const active = activeTab === tab
          return (
            <button key={tab} type="button" onClick={() => setActiveTab(tab)} style={{ padding: '12px 12px 10px', marginBottom: -1, border: 0, borderBottom: `2px solid ${active ? 'var(--rooms-ink)' : 'transparent'}`, background: 'transparent', cursor: 'pointer', color: active ? 'var(--rooms-ink)' : 'var(--rooms-muted)', fontSize: 13.5, fontWeight: 650 }}>
              {tab === 'files' ? 'Files' : 'Members'}
            </button>
          )
        })}
      </div>
      {activeTab === 'files' ? (
        <div style={{ flex: 1, display: 'flex', minHeight: 0 }}>
          <div style={{ width: 264, flexShrink: 0, borderRight: '1px solid var(--rooms-line)', display: 'flex', flexDirection: 'column', background: 'var(--rooms-paper-2)' }}>
            <div style={{ padding: '14px 14px 8px', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: 12, fontWeight: 700, letterSpacing: '0.04em', textTransform: 'uppercase', color: 'var(--rooms-muted)' }}>Files</span>
              <div style={{ display: 'flex', gap: 2 }}>
                <IconButton title="New folder" onClick={() => setDraftFile({ parent: currentFolder, type: 'directory' })} style={{ width: 30, height: 30 }}><Folder size={16} /></IconButton>
                <IconButton title="New file" onClick={() => setDraftFile({ parent: currentFolder, type: 'file' })} style={{ width: 30, height: 30 }}><Plus size={16} /></IconButton>
              </div>
            </div>
            <TreeList nodes={files} selected={selectedFile ?? currentFolder} promotedTopicPaths={promotedTopicPaths} metadata={metadata} onOpen={openNode} onMenu={(event, node) => setMenu({ x: event.clientX, y: event.clientY, node })} />
          </div>
          {selectedNode ? (
            <RoomFileDoc
              spaceId={space.id}
              filePath={selectedNode.path}
              canEdit={true}
              onSaved={refresh}
              headerContent={(
                <div style={{ display: 'flex', alignItems: 'center', gap: 6, flexWrap: 'wrap', minWidth: 0 }}>
                  <button type="button" onClick={() => { setCurrentFolder(null); setSelectedFile(null) }} style={{ background: 'transparent', border: 0, cursor: 'pointer', fontSize: 13.5, fontWeight: 600, color: 'var(--rooms-muted)', padding: 0 }}>{space.config.name}</button>
                  {selectedPathParts.map((part, index) => (
                    <span key={`${part}-${index}`} style={{ display: 'inline-flex', gap: 6, alignItems: 'center', color: index === selectedPathParts.length - 1 ? 'var(--rooms-ink)' : 'var(--rooms-muted)', fontSize: 13.5, fontWeight: index === selectedPathParts.length - 1 ? 650 : 500 }}>
                      <span style={{ color: 'var(--rooms-muted-2)' }}>/</span>{part}
                    </span>
                  ))}
                </div>
              )}
            />
          ) : (
            <div onContextMenu={(event) => { event.preventDefault(); setMenu({ x: event.clientX, y: event.clientY, node: null }) }} style={{ flex: 1, display: 'grid', placeItems: 'center', minWidth: 0, background: 'var(--rooms-paper)', color: 'var(--rooms-muted)' }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 12 }}>
                {loading ? <div style={{ fontSize: 14 }}>Loading files...</div> : <><FileText size={32} color="var(--rooms-muted-2)" /><div style={{ fontSize: 14 }}>Select a file</div></>}
              </div>
            </div>
          )}
        </div>
      ) : (
        <div className="rooms-scrollbar" style={{ flex: 1, overflow: 'auto', background: 'var(--rooms-paper)' }}>
          <SpaceSettingsEditor spaceId={space.id} spaceConfig={space.config} onConfigUpdated={() => { void onRefreshRooms() }} initialTab="users" allowedTabs={['users']} showHeader={false} />
        </div>
      )}
      {menu && (
        <ContextMenu
          x={menu.x}
          y={menu.y}
          onClose={() => setMenu(null)}
          items={menu.node ? [
            { label: 'Open', icon: menu.node.type === 'directory' ? <FolderOpen size={16} /> : <Eye size={16} />, onClick: () => openNode(menu.node!) },
            { label: 'Rename', icon: <Edit3 size={16} />, onClick: () => void renameNode(menu.node!) },
            ...(menu.node.type === 'directory'
              ? promotedTopicPaths.has(menu.node.path)
                ? [
                    { label: 'Open Room', icon: <Grid2X2 size={16} />, onClick: () => onOpenRoom(space.id, `/${menu.node!.path}`) },
                    { label: 'Demote to folder', icon: <ArrowRight size={16} />, onClick: () => void demote(menu.node!) },
                  ]
                : [{ label: 'Promote to Room', icon: <Grid2X2 size={16} />, onClick: () => void promote(menu.node!) }]
              : []),
            { label: isRestricted(metadata, menu.node.path) ? 'Allow sharing' : 'Restrict (make private)', icon: isRestricted(metadata, menu.node.path) ? <Eye size={16} /> : <Lock size={16} />, onClick: () => void toggleRestricted(menu.node!) },
            { label: 'Delete', icon: <Trash2 size={16} />, danger: true, onClick: () => void deleteNode(menu.node!) },
          ] : [
            { label: 'New folder', icon: <Folder size={16} />, onClick: () => setDraftFile({ parent: currentFolder, type: 'directory' }) },
            { label: 'New file', icon: <FileText size={16} />, onClick: () => setDraftFile({ parent: currentFolder, type: 'file' }) },
          ]}
        />
      )}
      {draftFile && (
        <Modal title={draftFile.type === 'directory' ? 'New folder' : 'New file'} onClose={() => setDraftFile(null)} footer={<><Button variant="ghost" onClick={() => setDraftFile(null)}>Cancel</Button><Button variant="primary" disabled={!newName.trim()} onClick={createNew}>Create</Button></>}>
          <Field label="Name" value={newName} onChange={setNewName} placeholder={draftFile.type === 'directory' ? 'Folder name' : 'notes.md'} />
        </Modal>
      )}
    </div>
  )
}

function InviteButton({ spaceId }: { spaceId: string }) {
  const { showToast } = useToast()
  const [inviteUrl, setInviteUrl] = useState<string | null>(null)
  async function createInvite() {
    try {
      const next = await createSpaceInvite(spaceId, 'editor')
      setInviteUrl(next)
      await navigator.clipboard?.writeText(next).catch(() => undefined)
      showToast('Invite link created', 'success')
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to create invite', 'error')
    }
  }
  return (
    <>
      <Button variant="outline" size="sm" icon={<Users size={16} />} onClick={createInvite}>Invite link</Button>
      {inviteUrl && (
        <div style={{ position: 'fixed', right: 24, bottom: 24, zIndex: 70, background: 'var(--rooms-ink)', color: 'var(--rooms-paper)', padding: '12px 16px', borderRadius: 12, maxWidth: 460, fontSize: 13, boxShadow: '0 16px 40px -16px rgba(0,0,0,0.5)' }}>
          <div style={{ fontWeight: 600, marginBottom: 6 }}>Invite link</div>
          <div style={{ overflow: 'hidden', textOverflow: 'ellipsis' }}>{inviteUrl}</div>
        </div>
      )}
    </>
  )
}

function ContextMenu({ x, y, items, onClose }: { x: number; y: number; items: Array<{ label: string; icon: ReactNode; danger?: boolean; onClick: () => void }>; onClose: () => void }) {
  const ref = useRef<HTMLDivElement>(null)
  useEffect(() => {
    const close = (event: MouseEvent) => { if (!ref.current?.contains(event.target as Node)) onClose() }
    const esc = (event: KeyboardEvent) => { if (event.key === 'Escape') onClose() }
    document.addEventListener('mousedown', close)
    document.addEventListener('keydown', esc)
    return () => { document.removeEventListener('mousedown', close); document.removeEventListener('keydown', esc) }
  }, [onClose])
  return (
    <div ref={ref} className="rooms-fade" style={{ position: 'fixed', left: Math.min(x, window.innerWidth - 232), top: Math.min(y, window.innerHeight - (items.length * 38 + 16)), zIndex: 90, width: 216, padding: 6, background: 'var(--rooms-paper)', border: '1.5px solid var(--rooms-line-strong)', borderRadius: 12, boxShadow: '0 20px 48px -18px rgba(31,31,29,0.4)' }}>
      {items.map((item) => (
        <button key={item.label} type="button" onClick={() => { onClose(); item.onClick() }} style={{ display: 'flex', alignItems: 'center', gap: 10, width: '100%', textAlign: 'left', padding: '8px 10px', borderRadius: 8, border: 0, cursor: 'pointer', background: 'transparent', fontSize: 13.5, fontWeight: 500, color: item.danger ? 'var(--rooms-error)' : 'var(--rooms-ink-soft)' }}>
          <span style={{ color: item.danger ? 'var(--rooms-error)' : 'var(--rooms-muted)' }}>{item.icon}</span>
          {item.label}
        </button>
      ))}
    </div>
  )
}

function TreeList({
  nodes,
  selected,
  promotedTopicPaths,
  metadata,
  onOpen,
  onMenu,
}: {
  nodes: FileNode[]
  selected: string | null
  promotedTopicPaths: ReadonlySet<string>
  metadata: SpaceMetadata
  onOpen: (node: FileNode) => void
  onMenu: (event: React.MouseEvent, node: FileNode) => void
}) {
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  function render(node: FileNode, depth: number): ReactNode {
    const active = selected === node.path
    const open = node.type === 'directory' && !collapsed.has(node.path)
    const promoted = promotedTopicPaths.has(node.path)
    const restricted = isRestricted(metadata, node.path)
    return (
      <div key={node.path}>
        <div onClick={() => onOpen(node)} onContextMenu={(event) => { event.preventDefault(); event.stopPropagation(); onMenu(event, node) }} style={{ display: 'flex', alignItems: 'center', gap: 6, padding: `6px 8px 6px ${8 + depth * 15}px`, borderRadius: 8, cursor: 'pointer', userSelect: 'none', background: active ? 'var(--rooms-paper)' : 'transparent', border: `1.5px solid ${active ? 'var(--rooms-line-strong)' : 'transparent'}` }}>
          <button type="button" onClick={(event) => {
            event.stopPropagation()
            if (node.type === 'directory') {
              setCollapsed((prev) => {
                const next = new Set(prev)
                if (next.has(node.path)) next.delete(node.path)
                else next.add(node.path)
                return next
              })
            }
          }} style={{ width: 13, display: 'inline-flex', justifyContent: 'center', color: 'var(--rooms-muted-2)', border: 0, background: 'transparent', padding: 0 }}>
            {node.type === 'directory' && <ChevronRight size={13} style={{ transform: open ? 'rotate(90deg)' : 'none', transition: 'transform 120ms' }} />}
          </button>
          {node.type === 'directory' ? (open ? <FolderOpen size={15} /> : <Folder size={15} />) : <FileText size={15} />}
          <span style={{ flex: 1, minWidth: 0, fontSize: 13.5, fontWeight: promoted ? 650 : active ? 600 : 500, color: restricted ? 'var(--rooms-muted)' : promoted ? 'var(--primary)' : 'var(--rooms-ink-soft)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{node.name}</span>
          {promoted && <Grid2X2 size={13} color="var(--rooms-success)" />}
          {restricted && <Lock size={13} color="var(--rooms-muted-2)" />}
        </div>
        {node.type === 'directory' && open && node.children?.map((child) => render(child, depth + 1))}
      </div>
    )
  }
  return <div className="rooms-scrollbar" style={{ flex: 1, overflow: 'auto', padding: '0 8px 16px', display: 'flex', flexDirection: 'column', gap: 1 }}>{nodes.map((node) => render(node, 0))}</div>
}

function makeRooms(spaces: SpaceSummary[], topicsBySpace: Map<string, SpaceTopic[]>, metadataBySpace: Map<string, SpaceMetadata>, membersBySpace: Map<string, SpaceMember[]>): RoomSummary[] {
  return spaces.flatMap((space) => {
    const metadata = metadataBySpace.get(space.id) ?? { files: {} }
    const members = membersBySpace.get(space.id) ?? []
    return (topicsBySpace.get(space.id) ?? [])
      .filter((topic) => topic.targetType === 'directory' || topic.targetType === 'file')
      .map((topic) => {
        const cleanPath = stripTopicPath(topic.topicPath)
        const entry = metadata.files[cleanPath] ?? metadata.files[topic.topicPath] ?? {}
        return {
          id: topic.id,
          spaceId: space.id,
          topicPath: topic.topicPath,
          targetType: topic.targetType === 'file' ? 'file' : 'directory',
          name: entry.displayName || basename(topic.topicPath),
          summary: entry.summary ?? `Focused room for ${basename(topic.topicPath)} inside ${space.config.name}.`,
          pathParts: pathParts(topic.topicPath),
          members,
          updatedAt: topic.updatedAt,
        }
      })
  })
}

function RoomsShellContent() {
  const apiFetch = useAPI()
  const navigate = useNavigate()
  const location = useLocation()
  const params = useParams()
  const [searchParams, setSearchParams] = useSearchParams()
  const { showToast } = useToast()
  const [spaces, setSpaces] = useState<SpaceSummary[]>([])
  const [topicsBySpace, setTopicsBySpace] = useState<Map<string, SpaceTopic[]>>(new Map())
  const [metadataBySpace, setMetadataBySpace] = useState<Map<string, SpaceMetadata>>(new Map())
  const [membersBySpace, setMembersBySpace] = useState<Map<string, SpaceMember[]>>(new Map())
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState<'create' | null>(null)
  const routeSpaceId = params.spaceId ?? null
  const routeRoomId = params.roomId ?? null
  const routePath = params['*'] ?? null
  const isRoomRoute = location.pathname.startsWith('/room/') || location.pathname.includes('/rooms/')
  const view: 'home' | 'space' | 'room' = isRoomRoute ? 'room' : (location.pathname.startsWith('/space/') || (location.pathname.startsWith('/spaces/') && routeSpaceId)) ? 'space' : 'home'
  const querySpace = searchParams.get('space')
  const activeSpaceId = view === 'space' || view === 'room' ? routeSpaceId : querySpace
  const rooms = useMemo(() => makeRooms(spaces, topicsBySpace, metadataBySpace, membersBySpace), [spaces, topicsBySpace, metadataBySpace, membersBySpace])
  const activeRoom = view === 'room' && routeSpaceId && (routeRoomId || routePath)
    ? rooms.find((room) => room.spaceId === routeSpaceId && (room.id === routeRoomId || (!routeRoomId && stripTopicPath(room.topicPath) === routePath)))
    : null
  const activeSpace = activeSpaceId ? spaces.find((space) => space.id === activeSpaceId) : null
  const refreshAll = useCallback(async () => {
    setLoading(true)
    try {
      const response = await apiFetch('/api/spaces')
      if (!response.ok) throw new Error('Failed to load spaces')
      const data = await response.json() as { spaces?: SpaceSummary[] }
      const nextSpaces = data.spaces ?? []
      const topicPairs = await Promise.all(nextSpaces.map(async (space) => [space.id, await fetchSpaceTopics(space.id)] as const))
      const metadataPairs = await Promise.all(nextSpaces.map(async (space) => [space.id, await fetchSpaceMetadata(space.id)] as const))
      const memberPairs = await Promise.all(nextSpaces.map(async (space) => [space.id, await fetchSpaceMembers(space.id).catch(() => [])] as const))
      setSpaces(nextSpaces)
      setTopicsBySpace(new Map(topicPairs))
      setMetadataBySpace(new Map(metadataPairs))
      setMembersBySpace(new Map(memberPairs))
    } catch (error) {
      showToast(error instanceof Error ? error.message : 'Failed to load rooms', 'error')
    } finally {
      setLoading(false)
    }
  }, [apiFetch, showToast])
  const updateSpaceConfig = useCallback(async (spaceId: string, patch: Partial<SpaceSummary['config']>) => {
    const response = await apiFetch(`/api/spaces/${spaceId}/config`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(patch),
    })
    if (!response.ok) {
      const data = await response.json().catch(() => ({}))
      throw new Error((data as { error?: string }).error || `Failed to save space (${response.status})`)
    }
    const data = await response.json() as { space?: { config?: SpaceSummary['config'] } }
    const nextConfig = data.space?.config
    if (!nextConfig) return
    setSpaces((current) => current.map((space) => (
      space.id === spaceId ? { ...space, config: nextConfig } : space
    )))
    showToast('Space updated', 'success')
  }, [apiFetch, showToast])
  const updateRoomMetadata = useCallback(async (room: RoomSummary, patch: Partial<FileMetadataEntry>) => {
    const metadataPath = stripTopicPath(room.topicPath)
    const result = await patchFileMetadata(room.spaceId, metadataPath, patch)
    if (!result.success) throw new Error(result.error || 'Failed to save room metadata')
    setMetadataBySpace((current) => {
      const next = new Map(current)
      const spaceMetadata = next.get(room.spaceId) ?? { files: {} }
      next.set(room.spaceId, {
        files: {
          ...spaceMetadata.files,
          [metadataPath]: {
            ...(spaceMetadata.files[metadataPath] ?? {}),
            ...patch,
          },
        },
      })
      return next
    })
    showToast('Room updated', 'success')
  }, [showToast])
  useEffect(() => { void refreshAll() }, [refreshAll])
  useEffect(() => {
    if (!loading && view === 'space' && activeSpace && !roleIsOwner(activeSpace.userRole)) {
      navigate(`/spaces?space=${activeSpace.id}`, { replace: true })
    }
  }, [activeSpace, loading, navigate, view])
  function goHome() {
    navigate('/spaces')
  }
  function filterOrManageSpace(spaceId: string) {
    const space = spaces.find((candidate) => candidate.id === spaceId)
    if (space && roleIsOwner(space.userRole)) navigate(`/spaces/${spaceId}`)
    else {
      setSearchParams((params) => {
        const next = new URLSearchParams(params)
        if (next.get('space') === spaceId) next.delete('space')
        else next.set('space', spaceId)
        return next
      })
      if (location.pathname !== '/' && location.pathname !== '/spaces') navigate(`/spaces?space=${spaceId}`)
    }
  }
  const promotedSet = new Set((activeSpaceId ? topicsBySpace.get(activeSpaceId) ?? [] : []).map((topic) => stripTopicPath(topic.topicPath)))
  const promotedIdsByPath = new Map((activeSpaceId ? topicsBySpace.get(activeSpaceId) ?? [] : []).map((topic) => [stripTopicPath(topic.topicPath), topic.id] as const))
  const roomFilePath = view === 'room' && routeRoomId ? routePath : null
  return (
    <div className="rooms-shell">
      <Rail spaces={spaces} rooms={rooms} activeSpaceId={view === 'home' ? querySpace : activeSpaceId} view={view} onHome={goHome} onSpace={filterOrManageSpace} onNewRoom={() => setModal('create')} />
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', minWidth: 0 }}>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden' }}>
          {loading && <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--rooms-muted)' }}>Loading rooms...</div>}
          {!loading && view === 'home' && <RoomsHome spaces={spaces} rooms={rooms} activeSpaceId={querySpace} onOpenRoom={(room) => navigate(roomUrl(room))} onNewRoom={() => setModal('create')} onManageSpace={(spaceId) => navigate(`/space/${spaceId}`)} />}
          {!loading && view === 'room' && activeRoom && activeSpace && <RoomDetail room={activeRoom} spaces={spaces} role={activeSpace.userRole} initialFilePath={roomFilePath} onSelectFile={(filePath) => navigate(`/spaces/${activeRoom.spaceId}/rooms/${activeRoom.id}/${filePath.slice(stripTopicPath(activeRoom.topicPath).length).replace(/^\/+/, '')}`)} onUpdateRoomMetadata={updateRoomMetadata} />}
          {!loading && view === 'room' && !activeRoom && <div style={{ height: '100%', display: 'grid', placeItems: 'center', color: 'var(--rooms-muted)' }}>Room not found.</div>}
          {!loading && view === 'space' && activeSpace && roleIsOwner(activeSpace.userRole) && <SpaceExplorer space={activeSpace} spaces={spaces} promotedTopicPaths={promotedSet} promotedTopicIdsByPath={promotedIdsByPath} initialPath={routePath} onBack={() => navigate('/spaces')} onOpenRoom={(spaceId, topicPath) => {
            const roomId = topicsBySpace.get(spaceId)?.find((topic) => topic.topicPath === topicPath)?.id
            if (roomId) navigate(`/spaces/${spaceId}/rooms/${roomId}`)
          }} onRefreshRooms={refreshAll} onUpdateSpaceConfig={updateSpaceConfig} />}
        </div>
      </div>
      {modal === 'create' && <CreateRoomModal spaces={spaces} onClose={() => setModal(null)} onCreated={(spaceId, roomId) => {
        setModal(null)
        void refreshAll()
        navigate(`/spaces/${spaceId}/rooms/${roomId}`)
      }} />}
    </div>
  )
}

export default function RoomsShell() {
  return (
    <ToastProvider>
      <RoomsShellContent />
    </ToastProvider>
  )
}

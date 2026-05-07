import {
  FileText,
  Search,
  FolderOpen,
  Sparkles,
  Settings,
  Home,
  type LucideIcon,
} from 'lucide-react'

export interface NavItem {
  label: string
  href: string
  icon: LucideIcon
  /** Owner agent — informational only; helps reviewers see who wires the route. */
  ownerAgent?: string
}

/**
 * Side nav items. Routes are placeholders the feature agents will own.
 * Presentation only; no permission logic here.
 */
export const PRIMARY_NAV: NavItem[] = [
  { label: 'Home', href: '/', icon: Home },
  { label: 'Notes', href: '/notes', icon: FileText, ownerAgent: 'notes-agent' },
  { label: 'Search', href: '/search', icon: Search, ownerAgent: 'search-ai-agent' },
  { label: 'Files', href: '/files', icon: FolderOpen, ownerAgent: 'files-logging-agent' },
  { label: 'AI', href: '/ai', icon: Sparkles, ownerAgent: 'search-ai-agent' },
]

export const SECONDARY_NAV: NavItem[] = [
  { label: 'Settings', href: '/settings', icon: Settings, ownerAgent: 'auth-agent' },
]

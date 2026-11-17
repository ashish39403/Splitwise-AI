import type { ReactNode } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { Button } from '@/components/ui/button'

type NavItem = { label: string; to: string; active?: boolean }

export function DashboardShell({
  active,
  children,
  group,
  onAddMember,
}: {
  active: 'home' | 'groups'
  children: ReactNode
  group?: { id: string; name: string; memberCount: number }
  onAddMember?: () => void
}) {
  const navigate = useNavigate()
  const items: NavItem[] = group
    ? [
        { label: 'Overview', to: `/groups/${group.id}`, active: false },
        { label: 'Expenses', to: `/groups/${group.id}`, active: active === 'groups' },
        { label: 'Balances', to: `/groups/${group.id}?tab=balances`, active: false },
        { label: 'Settlements', to: `/groups/${group.id}?tab=settlements`, active: false },
      ]
    : [
        { label: 'Home', to: '/dashboard', active: active === 'home' },
        { label: 'Groups', to: '/groups', active: active === 'groups' },
      ]

  return (
    <div className="app-shell dashboard">
      <aside className="sidebar" aria-label="Primary navigation">
        <a className="brand sidebar__brand" href="/">
          <span className="brand-mark" aria-hidden="true">
            <svg viewBox="0 0 32 32" width="26" height="26">
              <defs>
                <linearGradient id="sm2" x1="0" y1="0" x2="1" y2="1">
                  <stop offset="0%" stopColor="#0f9f6e" />
                  <stop offset="100%" stopColor="#7c6ff7" />
                </linearGradient>
              </defs>
              <rect x="2" y="2" width="28" height="28" rx="8" fill="url(#sm2)" />
              <path d="M11 10c0-1.5 1.2-2.5 3-2.5h4c1.8 0 3 1 3 2.5s-1.2 2.5-3 2.5h-2c-1.8 0-3 1-3 2.5s1.2 2.5 3 2.5h4c1.8 0 3 1 3 2.5" stroke="#fff" strokeWidth="2.2" strokeLinecap="round" fill="none" />
            </svg>
          </span>
          <span>Splitter <b>AI</b></span>
        </a>

        {group && (
          <>
            <Link className="group-switcher" to="/groups">
              <span className="group-switcher__icon" aria-hidden="true">☷</span>
              <span><strong>{group.name}</strong><small>{group.memberCount} members</small></span>
              <span aria-hidden="true">⌄</span>
            </Link>

            <div className="sidebar__actions" aria-label="Group actions">
              <Button
                className="sidebar__action-button"
                onClick={() => navigate(`/groups/${group.id}/expenses/new`)}
              >
                <span data-icon="inline-start" aria-hidden="true">+</span>
                Add expense
              </Button>
              {onAddMember && (
                <Button className="sidebar__action-button" variant="outline" onClick={onAddMember}>
                  <span data-icon="inline-start" aria-hidden="true">+</span>
                  Add member
                </Button>
              )}
            </div>
          </>
        )}

        <nav className="sidebar__nav">
          {items.map((item) => (
            <Link
              key={item.label}
              to={item.to}
              className={`sidebar__link${item.active ? ' is-active' : ''}`}
            >
              <span className="sidebar__dot" aria-hidden="true" />
              {item.label}
            </Link>
          ))}
        </nav>
      </aside>

      <div className="dashboard__main">
        <header className="topbar">
          <span className="muted">Splitter AI workspace</span>
        </header>

        <div className="dashboard__content">{children}</div>
      </div>
    </div>
  )
}

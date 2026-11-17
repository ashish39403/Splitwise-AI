import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate } from 'react-router-dom'
import { createDemoWorkspace, createGroup, getGroups, type GroupSummary } from '../../lib/api'
import { getAccessToken } from '../../lib/auth'
import { DashboardShell } from '../../components/DashboardShell'

export function GroupsPage() {
  const navigate = useNavigate()
  const [groups, setGroups] = useState<GroupSummary[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showForm, setShowForm] = useState(false)
  const [name, setName] = useState('')
  const [description, setDescription] = useState('')
  const [submitting, setSubmitting] = useState(false)
  const [loadingDemo, setLoadingDemo] = useState(false)

  useEffect(() => {
    let active = true
    void (async () => {
      const token = await getAccessToken()
      if (!token) {
        if (active) {
          setError('Your session has expired.')
          setLoading(false)
        }
        return
      }
      try {
        const data = await getGroups(token)
        if (active) setGroups(data)
      } catch (reason) {
        if (active) {
          setError(reason instanceof Error ? reason.message : 'Could not load groups.')
        }
      } finally {
        if (active) setLoading(false)
      }
    })()
    return () => {
      active = false
    }
  }, [])

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setError('')
    setSubmitting(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Your session has expired.')
      const group = await createGroup(token, { name: name.trim(), description: description.trim() })
      setGroups((prev) => [group, ...prev])
      setName('')
      setDescription('')
      setShowForm(false)
      navigate(`/groups/${group.id}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not create group.')
    } finally {
      setSubmitting(false)
    }
  }

  async function handleLoadDemo() {
    setError('')
    setLoadingDemo(true)
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Your session has expired.')
      const group = await createDemoWorkspace(token)
      setGroups((current) => [group, ...current.filter((item) => item.id !== group.id)])
      navigate(`/groups/${group.id}`)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Could not load the sample workspace.')
    } finally {
      setLoadingDemo(false)
    }
  }

  return (
    <DashboardShell active="groups">
      <div className="page-head anim-slide-up">
        <div>
          <p className="eyebrow">GROUPS</p>
          <h1>Your groups</h1>
          <p className="page-subcopy">Create a group and start tracking shared expenses.</p>
        </div>
        <button type="button" className="primary" onClick={() => setShowForm((v) => !v)}>
          {showForm ? 'Cancel' : '+ New group'}
        </button>
      </div>

      {showForm && (
        <form className="card create-form anim-slide-up" onSubmit={handleCreate}>
          <label>
            <span>Group name</span>
            <input value={name} onChange={(e) => setName(e.target.value)} required placeholder="e.g. Goa Trip" />
          </label>
          <label>
            <span>Description</span>
            <input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="Optional" />
          </label>
          {error && <div className="alert alert--error" role="alert"><span>{error}</span></div>}
          <button type="submit" className="primary" disabled={submitting || !name.trim()}>
            {submitting ? 'Creating…' : 'Create group'}
          </button>
        </form>
      )}

      {error && !showForm && <div className="alert alert--error" role="alert"><span>{error}</span></div>}

      {loading ? (
        <div className="skeleton-grid">
          {[0, 1, 2].map((i) => (
            <div key={i} className="skeleton" style={{ height: '7rem' }} />
          ))}
        </div>
      ) : groups.length === 0 ? (
        <div className="empty-state">
          <h3>No groups yet</h3>
          <p>Create your first group to start splitting expenses.</p>
          {import.meta.env.DEV && (
            <button type="button" className="ghost-button" onClick={() => void handleLoadDemo()} disabled={loadingDemo}>
              {loadingDemo ? 'Loading sample…' : 'Load sample workspace'}
            </button>
          )}
        </div>
      ) : (
        <div className="group-grid anim-stagger">
          {groups.map((group) => (
            <Link key={group.id} to={`/groups/${group.id}`} className="group-card">
              <div className="group-card__icon" aria-hidden="true">🧳</div>
              <div className="group-card__body">
                <strong>{group.name}</strong>
                <span>{group.member_count} members</span>
                {group.description && <p>{group.description}</p>}
              </div>
              <span className="group-card__arrow" aria-hidden="true">→</span>
            </Link>
          ))}
        </div>
      )}
    </DashboardShell>
  )
}

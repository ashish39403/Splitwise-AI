import { useEffect, useState } from 'react'
import type { FormEvent } from 'react'
import { Link, useNavigate, useParams, useSearchParams } from 'react-router-dom'
import {
  addGroupMember, createSettlement, getGroup, getGroupBalances, getGroupExpenses,
  getGroupSettlements, quickAddExpense, removeGroupMember, updateSettlementStatus,
  type BalancesResponse, type Expense, type GroupDetail, type GroupMember, type Settlement,
} from '../../lib/api'
import { getAccessToken } from '../../lib/auth'
import { formatInr, parseMinorInput } from '../../lib/money'
import { DashboardShell } from '../../components/DashboardShell'

type Tab = 'expenses' | 'balances' | 'settlements'

const formatMoney = formatInr
function pastelFor(name: string) { const colors = ['#fde68a', '#c4b5fd', '#86efac', '#fca5a5', '#93c5fd']; let hash = 0; for (let index = 0; index < name.length; index += 1) hash = name.charCodeAt(index) + ((hash << 5) - hash); return colors[Math.abs(hash) % colors.length] }

function BalanceList({ balances }: { balances: BalancesResponse | null }) {
  if (!balances) return <p className="section-sub">Calculating balances…</p>
  return <ul className="balance-list">{balances.members.map((member) => <li key={member.profile_id} className={`balance-row balance-row--${member.net_balance_minor > 0 ? 'receives' : member.net_balance_minor < 0 ? 'owes' : 'settled'}`}><span className="avatar avatar--xs" style={{ background: pastelFor(member.display_name) }}>{member.display_name.charAt(0)}</span><span className="balance-name">{member.display_name}</span><span className="balance-amount">{member.net_balance_minor > 0 ? '+' : ''}{formatMoney(member.net_balance_minor)}</span></li>)}</ul>
}

export function GroupDetailPage() {
  const { groupId = '' } = useParams()
  const navigate = useNavigate()
  const [params, setParams] = useSearchParams()
  const tab = (params.get('tab') as Tab) || 'expenses'
  const [group, setGroup] = useState<GroupDetail | null>(null)
  const [expenses, setExpenses] = useState<Expense[]>([])
  const [balances, setBalances] = useState<BalancesResponse | null>(null)
  const [settlements, setSettlements] = useState<Settlement[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState('')
  const [showMemberForm, setShowMemberForm] = useState(false)
  const [showMembers, setShowMembers] = useState(false)
  const [memberEmail, setMemberEmail] = useState('')
  const [showSettlementForm, setShowSettlementForm] = useState(false)
  const [payerId, setPayerId] = useState('')
  const [receiverId, setReceiverId] = useState('')
  const [amount, setAmount] = useState('')
  const [note, setNote] = useState('')
  const [showAiForm, setShowAiForm] = useState(false)
  const [aiText, setAiText] = useState('')
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError, setAiError] = useState('')

  async function load() {
    const token = await getAccessToken()
    if (!token) throw new Error('Your session has expired. Please sign in again.')
    const [nextGroup, nextExpenses, nextBalances, nextSettlements] = await Promise.all([
      getGroup(token, groupId), getGroupExpenses(token, groupId), getGroupBalances(token, groupId), getGroupSettlements(token, groupId),
    ])
    setGroup(nextGroup); setExpenses(nextExpenses); setBalances(nextBalances); setSettlements(nextSettlements)
  }

  useEffect(() => {
    let active = true
    void (async () => {
      try {
        const token = await getAccessToken()
        if (!token) throw new Error('Your session has expired. Please sign in again.')
        const [nextGroup, nextExpenses, nextBalances, nextSettlements] = await Promise.all([
          getGroup(token, groupId), getGroupExpenses(token, groupId), getGroupBalances(token, groupId), getGroupSettlements(token, groupId),
        ])
        if (active) { setGroup(nextGroup); setExpenses(nextExpenses); setBalances(nextBalances); setSettlements(nextSettlements) }
      } catch (reason) {
        if (active) setError(reason instanceof Error ? reason.message : 'Could not load group.')
      } finally { if (active) setLoading(false) }
    })()
    return () => { active = false }
  }, [groupId])
  function changeTab(next: Tab) { const updated = new URLSearchParams(params); updated.set('tab', next); setParams(updated, { replace: true }) }
  async function addMember(event: FormEvent<HTMLFormElement>) { event.preventDefault(); try { const token = await getAccessToken(); if (!token) throw new Error('Your session has expired. Please sign in again.'); const member = await addGroupMember(token, groupId, memberEmail.trim()); setGroup((current) => current ? { ...current, member_count: current.member_count + 1, members: [...current.members, member] } : current); setMemberEmail(''); setShowMemberForm(false) } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not add member.') } }
  async function removeMember(profileId: string, name: string) {
    if (!window.confirm(`Remove ${name} from the group?`)) return
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Your session has expired. Please sign in again.')
      await removeGroupMember(token, groupId, profileId)
      await load()
    } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not remove member.') }
  }
  async function submitAi(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    setAiLoading(true); setAiError('')
    try {
      const token = await getAccessToken()
      if (!token) throw new Error('Your session has expired. Please sign in again.')
      const draft = await quickAddExpense(token, groupId, aiText.trim())
      sessionStorage.setItem(`splitter-ai-draft:${groupId}`, JSON.stringify(draft))
      setShowAiForm(false); setAiText('')
      navigate(`/groups/${groupId}/expenses/new?draft=1`)
    } catch (reason) {
      setAiError(reason instanceof Error ? reason.message : 'Could not parse that expense.')
    } finally { setAiLoading(false) }
  }
  async function addSettlement(event: FormEvent<HTMLFormElement>) { event.preventDefault(); const amountMinor = parseMinorInput(amount); if (!amountMinor) { setError('Enter a valid settlement amount.'); return } try { const token = await getAccessToken(); if (!token) throw new Error('Your session has expired. Please sign in again.'); await createSettlement(token, groupId, { payer_id: payerId, receiver_id: receiverId, amount_minor: amountMinor, settled_on: new Date().toISOString().slice(0, 10), note }); setAmount(''); setNote(''); setShowSettlementForm(false); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not record settlement.') } }
  async function setStatus(id: string, status: 'confirmed' | 'cancelled') { try { const token = await getAccessToken(); if (!token) throw new Error('Your session has expired. Please sign in again.'); await updateSettlementStatus(token, groupId, id, status); await load() } catch (reason) { setError(reason instanceof Error ? reason.message : 'Could not update settlement.') } }

  if (loading) return <DashboardShell active="groups"><div className="skeleton" style={{ height: '14rem' }} /></DashboardShell>
  if (!group) return <DashboardShell active="groups"><div className="alert alert--error">{error || 'Group not found.'}</div><Link className="text-link" to="/groups">← Back to groups</Link></DashboardShell>
  const isAdmin = group.current_membership.role === 'admin'
  const total = expenses.reduce((sum, expense) => sum + expense.amount_minor, 0)
  const debtors = balances?.members.filter((member) => member.net_balance_minor < 0) ?? []
  const creditors = balances?.members.filter((member) => member.net_balance_minor > 0) ?? []

  return <DashboardShell active="groups" group={{ id: groupId, name: group.name, memberCount: group.member_count }} onAddMember={isAdmin ? () => setShowMemberForm(true) : undefined}><div className="group-header anim-slide-up"><div className="group-identity"><div className="group-icon">🧳</div><div><p className="eyebrow">GROUP WORKSPACE</p><h1>{group.name}</h1><p className="group-meta">{group.member_count} members · Shared expenses and balances</p></div></div><div className="avatar-cluster">{group.members.slice(0, 5).map((member: GroupMember) => <span key={member.id} className="avatar" title={member.display_name} style={{ background: pastelFor(member.display_name) }}>{member.display_name.charAt(0)}</span>)}{isAdmin && <button type="button" className="avatar avatar--plus" onClick={() => setShowMemberForm(true)}>+</button>}</div><div className="group-actions">{isAdmin && <button type="button" className="ghost-button" onClick={() => setShowMembers((value) => !value)}>Manage members</button>}</div></div>
    {showMembers && isAdmin && <div className="card inline-form"><h3>Members</h3><ul className="settlement-list">{group.members.map((member) => <li className="settlement-row" key={member.id}><span>{member.display_name} <small className="muted">{member.role}</small></span>{member.id !== group.created_by ? <button type="button" className="ghost-button small" onClick={() => void removeMember(member.id, member.display_name)}>Remove</button> : <span className="badge badge--primary">owner</span>}</li>)}</ul></div>}
    {error && <div className="alert alert--error">{error}</div>}
    {showMemberForm && <form className="card inline-form" onSubmit={addMember}><label><span>Member email</span><input type="email" required value={memberEmail} onChange={(event) => setMemberEmail(event.target.value)} placeholder="member@example.com" /></label><div className="inline-form__actions"><button className="ghost-button" type="button" onClick={() => setShowMemberForm(false)}>Cancel</button><button className="primary" type="submit">Add member</button></div></form>}
    <div className="tabs" role="tablist">{(['expenses', 'balances', 'settlements'] as Tab[]).map((item) => <button key={item} role="tab" aria-selected={tab === item} className={`tab-btn${tab === item ? ' is-active' : ''}`} onClick={() => changeTab(item)}>{item[0].toUpperCase() + item.slice(1)}</button>)}</div>
    {tab === 'expenses' && <div className="content-grid"><section className="card expenses-section"><div className="section-head"><div><h2>Expenses</h2><p className="section-sub">All group expenses ({expenses.length}) · Total: {formatMoney(total)}</p></div><button type="button" className="ghost-button" onClick={() => setShowAiForm((value) => !value)}>✦ AI Quick Add</button></div>{showAiForm && <form className="inline-form ai-quick-add" onSubmit={submitAi}><label><span>Describe your expense</span><textarea required rows={3} maxLength={1000} value={aiText} onChange={(event) => setAiText(event.target.value)} placeholder="Dinner with Rahul and Aman for ₹1,500, paid by me, split equally" /></label>{aiError && <div className="alert alert--error">{aiError}</div>}<p className="section-sub">The AI only suggests details. You review and confirm before anything is saved.</p><div className="inline-form__actions"><button type="button" className="ghost-button" onClick={() => setShowAiForm(false)}>Cancel</button><button className="primary" disabled={aiLoading}>{aiLoading ? 'Understanding…' : 'Suggest expense'}</button></div></form>}{expenses.length === 0 ? <div className="empty-state"><h3>No expenses yet</h3><p>Add the first expense to start splitting.</p></div> : <div className="table-wrap"><table className="expense-table"><thead><tr><th>Date</th><th>Expense</th><th>Paid by</th><th>Amount</th><th>Split</th></tr></thead><tbody>{expenses.map((expense) => <tr key={expense.id}><td className="muted">{new Date(`${expense.expense_date}T00:00:00`).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' })}</td><td><Link className="exp-cell" to={`/groups/${groupId}/expenses/${expense.id}/edit`}><span className="exp-icon">₹</span>{expense.description}</Link></td><td>{expense.payer.display_name}</td><td className="amount">{formatMoney(expense.amount_minor)}</td><td className="muted">{expense.split_method} ({expense.participants.length})</td></tr>)}</tbody></table></div>}</section><aside className="side-stack"><div className="card"><h3>Balances</h3><p className="section-sub">Net amount for each member</p><BalanceList balances={balances} /></div></aside></div>}
    {tab === 'balances' && <section className="card"><h2>Balances</h2><p className="section-sub">Calculated live from expenses and settlements.</p><BalanceList balances={balances} /></section>}
    {tab === 'settlements' && <section className="card"><div className="section-head"><div><h2>Settlement recommendations</h2><p className="section-sub">A minimal set of repayments that settles the group.</p></div><button type="button" className="primary" onClick={() => setShowSettlementForm((value) => !value)}>Record settlement</button></div>{showSettlementForm && <form className="inline-form settlement-form" onSubmit={addSettlement}><label><span>Who paid?</span><select required value={payerId} onChange={(event) => setPayerId(event.target.value)}><option value="">Choose member</option>{debtors.map((member) => <option value={member.profile_id} key={member.profile_id}>{member.display_name}</option>)}</select></label><label><span>Who received?</span><select required value={receiverId} onChange={(event) => setReceiverId(event.target.value)}><option value="">Choose member</option>{creditors.map((member) => <option value={member.profile_id} key={member.profile_id}>{member.display_name}</option>)}</select></label><label><span>Amount (₹)</span><input required inputMode="decimal" value={amount} onChange={(event) => setAmount(event.target.value)} placeholder="0.00" /></label><label><span>Note</span><input value={note} onChange={(event) => setNote(event.target.value)} placeholder="Optional" /></label><div className="inline-form__actions"><button className="ghost-button" type="button" onClick={() => setShowSettlementForm(false)}>Cancel</button><button className="primary" type="submit">Record payment</button></div></form>}<div className="settlement-section"><h3>Suggested payments</h3>{balances?.recommendations.length ? <ul className="settlement-list">{balances.recommendations.map((item) => <li className="settlement-row" key={`${item.payer_id}-${item.receiver_id}`}><span>{item.payer_name}</span><span className="arrow">→</span><span>{item.receiver_name}</span><strong>{formatMoney(item.amount_minor)}</strong></li>)}</ul> : <p className="section-sub">Everyone is settled up.</p>}<h3>Settlement history</h3>{settlements.length ? <ul className="settlement-list">{settlements.map((item) => <li className="settlement-row" key={item.id}><span>{item.payer.display_name} → {item.receiver.display_name}</span><strong>{formatMoney(item.amount_minor)}</strong><span className="badge badge--primary">{item.status}</span>{item.status === 'recorded' && (isAdmin || group.current_membership.profile_id === item.created_by) && <><button type="button" className="ghost-button small" onClick={() => void setStatus(item.id, 'confirmed')}>Confirm</button><button type="button" className="ghost-button small" onClick={() => void setStatus(item.id, 'cancelled')}>Cancel</button></>}</li>)}</ul> : <p className="section-sub">No settlements recorded yet.</p>}</div></section>}
  </DashboardShell>
}

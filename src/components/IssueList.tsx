import { ChevronDown, Plus } from 'lucide-react'
import { useId, useState, type FormEvent } from 'react'
import type { IssueEntry } from '../domain/issues'
import type { Issue, IssueFields, IssueTarget } from '../domain/model'

const issueTypes = { question: '疑問', concern: '懸念' } as const

function IssueForm({ issue, onSave, onCancel }: {
  issue?: Issue
  onSave: (fields: IssueFields) => Promise<unknown>
  onCancel: () => void
}) {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    const form = new FormData(event.currentTarget)
    setBusy(true)
    setError('')
    try {
      await onSave({
        type: form.get('type') === 'concern' ? 'concern' : 'question',
        title: String(form.get('title')),
        description: String(form.get('description')),
        status: form.has('resolved') ? 'resolved' : 'open',
        resolution: String(form.get('resolution') ?? ''),
      })
      setSaved(true)
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '疑問・懸念を保存できませんでした。')
    } finally {
      setBusy(false)
    }
  }

  return <form className="form-stack issue-form" onSubmit={event => void submit(event)} onChange={() => setSaved(false)}>
    <label>種別<select name="type" defaultValue={issue?.type ?? 'question'}>
      {Object.entries(issueTypes).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
    </select></label>
    <label>表題<input name="title" required defaultValue={issue?.title} /></label>
    <label>詳細<textarea name="description" rows={3} defaultValue={issue?.description} /></label>
    {issue && <>
      <label className="check-label"><input type="checkbox" name="resolved" defaultChecked={issue.status === 'resolved'} />解消済みにする</label>
      <label>解消内容<textarea name="resolution" rows={3} defaultValue={issue.resolution} /></label>
      {issue.resolvedAt && <p className="muted text-sm">解消日 {new Date(issue.resolvedAt).toLocaleDateString('ja-JP')}</p>}
    </>}
    {error && <p className="form-error" role="alert">{error}</p>}
    {saved && <p className="muted text-sm" role="status">保存しました。</p>}
    <div className="flex justify-end gap-2">
      <button type="button" className="button small" disabled={busy} onClick={onCancel}>{issue ? '閉じる' : 'キャンセル'}</button>
      <button type="submit" className="button primary small" disabled={busy}>{issue ? '保存' : '登録'}</button>
    </div>
  </form>
}

interface Props {
  issues: IssueEntry[]
  target: IssueTarget
  targetLabel: string
  onSave: (target: IssueTarget, fields: IssueFields, id?: string) => Promise<string>
}

export function IssueList({ issues, target, targetLabel, onSave }: Props) {
  const headingId = useId()
  const [expanded, setExpanded] = useState<string>()
  const [creating, setCreating] = useState(false)
  const unresolved = issues.filter(({ issue }) => issue.status === 'open').length

  return <section className="drawer-section" aria-labelledby={headingId}>
    <div className="section-heading">
      <h3 id={headingId}>疑問・懸念</h3>
      <span className={unresolved ? 'unresolved-text' : undefined}>未解消 {unresolved} 件</span>
    </div>
    <p className="issue-scope">新規登録先 <strong>{targetLabel}</strong></p>
    {!creating && <button type="button" className="button small section-add" onClick={() => setCreating(true)}><Plus size={16} />疑問・懸念を追加</button>}
    {creating && <IssueForm onCancel={() => setCreating(false)} onSave={async fields => {
      const id = await onSave(target, fields)
      setCreating(false)
      setExpanded(id)
    }} />}
    <ul className="issue-list">
      {issues.map(({ issue, source }) => <li key={issue.id}>
        <button type="button" className="issue-toggle" aria-expanded={expanded === issue.id}
          onClick={() => setExpanded(current => current === issue.id ? undefined : issue.id)}>
          <span className="issue-title">{issue.title}</span>
          <span className="issue-type">{issueTypes[issue.type]} · <span className={issue.status === 'open' ? 'unresolved-text' : undefined}>
            {issue.status === 'resolved' ? '解消済み' : '未解消'}
          </span></span>
          <span className="issue-source">{source}</span>
          <ChevronDown size={16} aria-hidden="true" />
        </button>
        {expanded === issue.id && <IssueForm issue={issue}
          onSave={fields => onSave({ targetType: issue.targetType, targetId: issue.targetId }, fields, issue.id)}
          onCancel={() => setExpanded(undefined)} />}
      </li>)}
    </ul>
  </section>
}

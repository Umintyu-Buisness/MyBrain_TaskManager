import { ArrowDown, ArrowUp, Plus, Trash2, X } from 'lucide-react'
import { useEffect, useRef, useState, type FormEvent } from 'react'
import type { IssueEntry } from '../domain/issues'
import { statuses, type IssueFields, type IssueTarget, type Plan, type Schedule, type Status, type TaskFields, type Todo } from '../domain/model'
import { descendantIds, siblings, taskRows, type TaskRow } from '../domain/tasks'
import { IssueList } from './IssueList'
import { TaskTodos } from './TaskTodos'

const sections = { basic: '基本情報', todos: 'Todo', issues: '疑問・懸念' } as const
type Section = keyof typeof sections

export interface DrawerRequest {
  section: 'todos' | 'issues'
  todoId?: string
}

interface Props {
  plan: Plan
  row?: TaskRow
  initial: TaskFields
  request?: DrawerRequest
  extras?: {
    todos: Todo[]
    projectIssues: IssueEntry[]
    unresolved: number
    unresolvedByTodo: ReadonlyMap<string, number>
    onAddTodo: (title: string) => Promise<string>
    onToggleTodo: (id: string, completed: boolean) => Promise<void>
    onScheduleTodo: (id: string, schedule?: Schedule) => Promise<void>
    onDeleteTodo: (id: string) => Promise<void>
    onSaveIssue: (target: IssueTarget, fields: IssueFields, id?: string) => Promise<string>
  }
  onClose: () => void
  onSave: (fields: TaskFields) => Promise<void>
  onDelete: () => Promise<void>
  onReorder: (offset: -1 | 1) => Promise<void>
  onChild: () => void
  onReveal: (date: string) => void
}

export function TaskDrawer({ plan, row, initial, request, extras, onClose, onSave, onDelete, onReorder, onChild, onReveal }: Props) {
  const [fields, setFields] = useState(initial)
  const [section, setSection] = useState<Section>('basic')
  const [todoScope, setTodoScope] = useState<string>()
  const [scheduleTodoId, setScheduleTodoId] = useState<string>()
  const [startOverride, setStartOverride] = useState<string>()
  const [endOverride, setEndOverride] = useState<string>()
  const [error, setError] = useState('')
  const [busy, setBusy] = useState(false)
  const heading = useRef<HTMLHeadingElement>(null)
  const project = plan.projects.find(item => item.id === fields.projectId)
  const excluded = row ? descendantIds(plan.tasks, row.task.id) : new Set<string>()
  const taskIssues = extras?.projectIssues.filter(entry => entry.taskId && excluded.has(entry.taskId)) ?? []
  const selectedTodo = extras?.todos.find(todo => todo.id === todoScope)
  const parents = taskRows(plan.tasks.filter(task => task.projectId === fields.projectId))
    .filter(candidate => !excluded.has(candidate.task.id))
  const peers = row ? siblings(plan.tasks, row.task.projectId, row.task.parentTaskId) : []
  const position = row ? peers.findIndex(task => task.id === row.task.id) : -1
  const aggregate = Boolean(row?.childCount)
  const checklist = Boolean(extras?.todos.length)
  const automaticProgress = aggregate || checklist
  const startDate = aggregate ? row!.startDate : (startOverride ?? row?.task.startDate ?? initial.startDate)
  const endDate = aggregate ? row!.endDate : (endOverride ?? row?.task.endDate ?? initial.endDate)

  useEffect(() => { heading.current?.focus() }, [])
  useEffect(() => {
    if (request) {
      setSection(request.section)
      setTodoScope(request.section === 'issues' ? request.todoId : undefined)
      setScheduleTodoId(request.section === 'todos' ? request.todoId : undefined)
    }
  }, [request])

  function change<K extends keyof TaskFields>(key: K, value: TaskFields[K]) {
    setFields(current => ({ ...current, [key]: value }))
  }

  async function perform(action: () => Promise<void>) {
    setBusy(true)
    setError('')
    try {
      await action()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '変更を保存できませんでした。')
    } finally {
      setBusy(false)
    }
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    void perform(async () => {
      await onSave({
        ...fields,
        progress: automaticProgress ? row!.task.progress : fields.progress,
        startDate: aggregate ? row!.task.startDate : startDate,
        endDate: aggregate ? row!.task.endDate : endDate,
      })
      setStartOverride(undefined)
      setEndOverride(undefined)
    })
  }

  return <aside className="task-drawer" aria-labelledby="drawer-title" onKeyDown={event => {
    if (event.key === 'Escape' && !event.nativeEvent.isComposing && !busy) onClose()
  }}>
    <div className="drawer-header">
      <div><p className="drawer-context">{project?.name ?? 'プロジェクト'}</p>
        <h2 id="drawer-title" ref={heading} tabIndex={-1}>{row ? 'タスク詳細' : 'タスクを追加'}</h2></div>
      <button type="button" className="icon-button" onClick={onClose} disabled={busy} aria-label="詳細を閉じる"><X size={20} /></button>
    </div>
    {extras && <div className="drawer-nav" role="group" aria-label="タスク詳細の表示">
      {(Object.keys(sections) as Section[]).map(key => <button key={key} type="button"
        aria-description={key === 'issues' && extras.unresolved > 0 ? `未解消 ${extras.unresolved} 件` : undefined}
        aria-pressed={section === key} onClick={() => { setSection(key); setTodoScope(undefined) }}>
        {sections[key]}{key === 'issues' && extras.unresolved > 0 && <span className="issue-badge" aria-hidden="true">! {extras.unresolved}</span>}
      </button>)}
    </div>}
    <form className="drawer-form" onSubmit={submit} hidden={section !== 'basic'}>
      <fieldset disabled={busy} className="form-stack drawer-fields">
        {row && <p className="record-id"><span>タスクID</span><code>{row.task.id}</code></p>}
        <label>表題<input required value={fields.title} onChange={event => change('title', event.target.value)} placeholder="例：引越し業者を手配する" /></label>
        <label>説明<textarea rows={3} value={fields.description} onChange={event => change('description', event.target.value)} /></label>
        <label>プロジェクト<select required value={fields.projectId} disabled={aggregate} onChange={event => {
          setFields(current => ({ ...current, projectId: event.target.value, parentTaskId: null }))
        }}>
          <option value="" disabled>選択してください</option>
          {plan.projects.map(item => <option key={item.id} value={item.id}>{item.name}</option>)}
        </select></label>
        <label>親タスク<select value={fields.parentTaskId ?? ''} onChange={event => change('parentTaskId', event.target.value || null)}>
          <option value="">親タスクなし</option>
          {parents.map(parent => <option key={parent.task.id} value={parent.task.id}>{'　'.repeat(Math.min(parent.depth, 12))}{parent.task.title}</option>)}
        </select></label>
        <div className="field-grid">
          <label>ステータス<select value={fields.status} onChange={event => change('status', event.target.value as Status)}>
            {Object.entries(statuses).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select></label>
          <label>進捗率（%）<input required disabled={automaticProgress} type="number" min={0} max={100} step={1}
            value={automaticProgress ? row!.progress : Number.isNaN(fields.progress) ? '' : fields.progress}
            onChange={event => change('progress', event.target.valueAsNumber)} /></label>
        </div>
        <div className="field-grid">
          <label>開始日<input type="date" required disabled={aggregate} value={startDate} onChange={event => setStartOverride(event.target.value)} /></label>
          <label>終了日<input type="date" required disabled={aggregate} min={startDate} value={endDate} onChange={event => setEndOverride(event.target.value)} /></label>
        </div>
        {aggregate && <p className="muted text-sm">期間と進捗率は子タスクから自動集約されます。</p>}
        {checklist && !aggregate && <p className="muted text-sm">進捗率は Todo の完了件数から自動計算されます。</p>}
        {row && <div className="drawer-actions">
          <button type="button" className="button small" onClick={onChild}><Plus size={16} />子タスク</button>
          <button type="button" className="button small" onClick={() => onReveal(row.startDate)}>ガントで表示</button>
          <span className="order-controls">
            <button type="button" className="icon-button" disabled={position <= 0} onClick={() => void perform(() => onReorder(-1))} aria-label="同じ階層で上へ"><ArrowUp size={17} /></button>
            <button type="button" className="icon-button" disabled={position >= peers.length - 1} onClick={() => void perform(() => onReorder(1))} aria-label="同じ階層で下へ"><ArrowDown size={17} /></button>
          </span>
        </div>}
        {error && <p className="form-error" role="alert">{error}</p>}
      </fieldset>
      <div className="drawer-footer">
        {row && <button type="button" className="icon-button danger" disabled={busy} aria-label="タスクを削除" onClick={() => {
          const message = excluded.size > 1
            ? `「${row.task.title}」と子孫タスク ${excluded.size - 1} 件を削除しますか？`
            : `「${row.task.title}」を削除しますか？`
          if (window.confirm(message)) void perform(onDelete)
        }}><Trash2 size={18} /></button>}
        <button className="button primary" type="submit" disabled={busy}>{row ? '変更を保存' : 'タスクを作成'}</button>
      </div>
    </form>
    {extras && row && <>
      <div className="drawer-body" hidden={section !== 'todos'}>
        <TaskTodos todos={extras.todos} unresolvedByTodo={extras.unresolvedByTodo}
          taskSchedule={row} scheduleTodoId={scheduleTodoId} onSelectSchedule={setScheduleTodoId}
          onSaveSchedule={extras.onScheduleTodo}
          todosWithIssues={new Set(taskIssues.filter(({ issue }) => issue.targetType === 'todo').map(({ issue }) => issue.targetId))}
          onIssues={id => { setTodoScope(id); setSection('issues') }}
          onAdd={extras.onAddTodo} onToggle={extras.onToggleTodo} onDelete={extras.onDeleteTodo} />
      </div>
      <div className="drawer-body" hidden={section !== 'issues'}>
        {selectedTodo && <button type="button" className="button small mb-3"
          onClick={() => { setTodoScope(undefined); setSection('todos') }}>Todo リストへ</button>}
        {row && <IssueList key={selectedTodo?.id ?? row.task.id}
          issues={selectedTodo ? taskIssues.filter(({ issue }) => issue.targetType === 'todo' && issue.targetId === selectedTodo.id) : taskIssues}
          target={selectedTodo ? { targetType: 'todo', targetId: selectedTodo.id } : { targetType: 'task', targetId: row.task.id }}
          targetLabel={selectedTodo ? `Todo「${selectedTodo.title}」` : `タスク「${row.task.title}」`}
          onSave={extras.onSaveIssue} />}
      </div>
    </>}
  </aside>
}

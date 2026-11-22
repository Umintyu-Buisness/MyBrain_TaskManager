import { CalendarDays, MessageSquare, Plus, Trash2 } from 'lucide-react'
import { useState, type FormEvent } from 'react'
import type { Schedule, Todo } from '../domain/model'
import { checklistProgress } from '../domain/tasks'

interface Props {
  todos: Todo[]
  taskSchedule: Schedule
  scheduleTodoId?: string
  onSelectSchedule: (id?: string) => void
  onSaveSchedule: (id: string, schedule?: Schedule) => Promise<void>
  unresolvedByTodo: ReadonlyMap<string, number>
  todosWithIssues: ReadonlySet<string>
  onIssues: (id: string) => void
  onAdd: (title: string) => Promise<unknown>
  onToggle: (id: string, completed: boolean) => Promise<void>
  onDelete: (id: string) => Promise<void>
}

function TodoScheduleForm({ todo, taskSchedule, onSave, onClose }: {
  todo: Todo
  taskSchedule: Schedule
  onSave: (schedule?: Schedule) => Promise<void>
  onClose: () => void
}) {
  const schedule = todo.schedule ?? taskSchedule
  const [startDate, setStartDate] = useState(schedule.startDate)
  const [endDate, setEndDate] = useState(schedule.endDate)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')

  async function save(next?: Schedule) {
    setBusy(true)
    setError('')
    try {
      await onSave(next)
      onClose()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '日程を保存できませんでした。')
      setBusy(false)
    }
  }

  return <form className="form-stack todo-schedule" aria-label={`Todo「${todo.title}」の日程`} onSubmit={event => {
    event.preventDefault()
    void save({ startDate, endDate })
  }}>
    <p className="muted text-sm">{todo.schedule ? 'この Todo の日程' : '所属タスクの日程を使用中'}</p>
    <div className="field-grid">
      <label>開始日<input type="date" required value={startDate} onChange={event => setStartDate(event.target.value)} /></label>
      <label>終了日<input type="date" required min={startDate} value={endDate} onChange={event => setEndDate(event.target.value)} /></label>
    </div>
    {error && <p className="form-error" role="alert">{error}</p>}
    <div className="flex flex-wrap gap-2">
      {todo.schedule && <button type="button" className="button small" disabled={busy} onClick={() => void save()}>タスクの日程に戻す</button>}
      <button type="submit" className="button primary small" disabled={busy}>日程を保存</button>
    </div>
  </form>
}

export function TaskTodos({ todos, taskSchedule, scheduleTodoId, onSelectSchedule, onSaveSchedule,
  unresolvedByTodo, todosWithIssues, onIssues, onAdd, onToggle, onDelete }: Props) {
  const [title, setTitle] = useState('')
  const [adding, setAdding] = useState(false)
  const [error, setError] = useState('')
  const completed = todos.filter(todo => todo.completed).length

  async function perform(action: () => Promise<unknown>) {
    setError('')
    try {
      await action()
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : 'Todo を保存できませんでした。')
    }
  }

  async function add(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    if (adding || !title.trim()) return
    const submittedTitle = title
    setAdding(true)
    await perform(async () => {
      await onAdd(submittedTitle)
      setTitle(current => current === submittedTitle ? '' : current)
    })
    setAdding(false)
  }

  return <section className="drawer-section" aria-labelledby="todo-title">
    <div className="section-heading">
      <h3 id="todo-title">Todo リスト</h3>
      <span>{completed}/{todos.length} 件完了{todos.length > 0 && ` · ${checklistProgress(completed, todos.length)}%`}</span>
    </div>
    <form className="form-stack" onSubmit={event => void add(event)}>
      <div className="todo-add">
        <input aria-label="新しい Todo" placeholder="やることを入力" value={title} onChange={event => setTitle(event.target.value)} required />
        <button type="submit" className="button primary" disabled={adding || !title.trim()}><Plus size={16} />追加</button>
      </div>
    </form>
    <ul className="checklist">
      {todos.map(todo => {
        const unresolved = unresolvedByTodo.get(todo.id) ?? 0
        const editingSchedule = scheduleTodoId === todo.id
        const schedule = todo.schedule ?? taskSchedule
        return <li key={todo.id} data-completed={todo.completed}>
          <div className="checklist-item">
          <label>
            <input type="checkbox" checked={todo.completed} onChange={event => {
              const checked = event.currentTarget.checked
              void perform(() => onToggle(todo.id, checked))
            }} />
            <span>{todo.title}</span>
          </label>
          <button type="button" className="icon-button" aria-label={`Todo「${todo.title}」の日程を編集`}
            title={todo.schedule ? `${schedule.startDate} ～ ${schedule.endDate}` : 'タスクの日程を使用'}
            aria-expanded={editingSchedule} onClick={() => onSelectSchedule(editingSchedule ? undefined : todo.id)}>
            <CalendarDays size={16} />
          </button>
          <button type="button" className={unresolved ? 'issue-badge' : 'icon-button'}
            aria-label={`Todo「${todo.title}」の疑問・懸念${unresolved ? `（未解消 ${unresolved} 件）` : ''}`}
            title={unresolved ? `未解消の疑問・懸念 ${unresolved} 件` : '疑問・懸念'} onClick={() => onIssues(todo.id)}>
            {unresolved ? `! ${unresolved}` : <MessageSquare size={16} />}
          </button>
          <button type="button" className="icon-button danger" aria-label={`Todo「${todo.title}」を削除`}
            onClick={() => {
              if (!todosWithIssues.has(todo.id) || window.confirm(`「${todo.title}」と関連する疑問・懸念を削除しますか？`)) {
                void perform(() => onDelete(todo.id))
              }
            }}><Trash2 size={15} /></button>
          </div>
          {editingSchedule && <TodoScheduleForm key={`${schedule.startDate}:${schedule.endDate}`} todo={todo} taskSchedule={taskSchedule}
            onSave={next => onSaveSchedule(todo.id, next)} onClose={() => onSelectSchedule(undefined)} />}
        </li>
      })}
    </ul>
    {error && <p className="form-error" role="alert">{error}</p>}
  </section>
}

import { CalendarDays, ChevronLeft, ChevronRight, FolderOpen, FolderPlus, GanttChartSquare, MessageSquare, Plus, Settings2 } from 'lucide-react'
import { useEffect, useMemo, useRef, useState } from 'react'
import { Gantt, type Scale } from './components/Gantt'
import { GanttSettingsDialog } from './components/GanttSettingsDialog'
import { IssueList } from './components/IssueList'
import { ProjectDialog } from './components/ProjectDialog'
import { TaskDrawer, type DrawerRequest } from './components/TaskDrawer'
import { DialogContent, DialogRoot } from './components/ui/dialog'
import { loadGanttSettings, storeGanttSettings } from './data/ganttSettings'
import { repository } from './data/repository'
import { addDays, dateKey, localDate } from './domain/dates'
import { indexIssues } from './domain/issues'
import { ganttRows, type GanttRow } from './domain/gantt'
import type { Plan, Schedule, TaskFields } from './domain/model'
import { taskRows, todoProgressByTask } from './domain/tasks'

type Drawer = { id: string; request?: DrawerRequest } | { key: number; initial: TaskFields }
const emptyPlan: Plan = { projects: [], tasks: [], todos: [], issues: [] }
const scales = { day: '日', week: '週', month: '月' } as const
const pageStep = { day: 14, week: 56, month: 180 }

export function App() {
  const [plan, setPlan] = useState(emptyPlan)
  const [loading, setLoading] = useState(true)
  const [storageError, setStorageError] = useState(false)
  const [projectId, setProjectId] = useState('')
  const [projectDialog, setProjectDialog] = useState(false)
  const [projectIssuesId, setProjectIssuesId] = useState<string>()
  const [settings, setSettings] = useState(loadGanttSettings)
  const [settingsOpen, setSettingsOpen] = useState(false)
  const [drawer, setDrawer] = useState<Drawer>()
  const [collapsed, setCollapsed] = useState<Set<string>>(() => new Set())
  const [scale, setScale] = useState<Scale>('day')
  const [jump, setJump] = useState(() => ({ date: dateKey(new Date()) }))
  const [viewDate, setViewDate] = useState(jump.date)
  const anchor = useRef(jump.date)
  const serial = useRef(0)
  const taskAfterProject = useRef<{ date: string } | null>(null)
  const [notice, setNotice] = useState<{ text: string; error?: boolean }>()
  const rows = useMemo(() => {
    const todoProgress = todoProgressByTask(plan.todos)
    return plan.projects.flatMap(project => taskRows(
      plan.tasks.filter(task => task.projectId === project.id), todoProgress,
    ))
  }, [plan])
  const issueIndex = useMemo(() => indexIssues(plan, rows), [plan, rows])
  const shownRows = useMemo(() => projectId ? rows.filter(row => row.task.projectId === projectId) : rows, [rows, projectId])
  const project = plan.projects.find(item => item.id === projectId)
  const issuesProject = plan.projects.find(item => item.id === projectIssuesId)
  const chartRows = useMemo(() => ganttRows({
    projects: project ? [project] : plan.projects, tasks: shownRows, todos: plan.todos,
    settings, allProjects: !projectId, unresolved: issueIndex,
  }), [project, plan.projects, plan.todos, shownRows, settings, projectId, issueIndex])
  const currentRow = drawer && 'id' in drawer ? rows.find(row => row.task.id === drawer.id) : undefined
  const currentTaskId = currentRow?.task.id
  const projectUnresolved = issueIndex.projectOpen.get(projectId) ?? 0

  useEffect(() => repository.watch(data => {
    setPlan(data)
    setLoading(false)
  }, () => {
    setStorageError(true)
    setLoading(false)
  }), [])

  useEffect(() => {
    if (!notice || notice.error) return
    const timeout = window.setTimeout(() => setNotice(undefined), 3500)
    return () => window.clearTimeout(timeout)
  }, [notice])

  function goTo(date: string) {
    anchor.current = date
    setViewDate(date)
    setJump({ date })
  }

  function openTask(id: string) {
    setDrawer(current => current && 'id' in current && current.id === id ? current : { id })
  }

  function openGanttRow(row: GanttRow, issues = false) {
    if (row.kind === 'project') {
      setProjectIssuesId(row.targetId)
    } else if (row.taskId && (issues || row.kind === 'todo')) {
      setDrawer({ id: row.taskId, request: {
        section: issues ? 'issues' : 'todos', todoId: row.kind === 'todo' ? row.targetId : undefined,
      } })
    } else if (row.taskId) {
      openTask(row.taskId)
    }
  }

  function newTask(date: string, targetProject: string, parentTaskId: string | null = null) {
    setDrawer({ key: ++serial.current, initial: {
      projectId: targetProject, parentTaskId, title: '', description: '',
      startDate: date, endDate: date, status: 'todo', progress: 0,
    } })
  }

  function addTask(date = anchor.current, rowProject?: string) {
    if (storageError || loading) return
    if (!plan.projects.length) {
      taskAfterProject.current = { date }
      setProjectDialog(true)
      return
    }
    newTask(date, rowProject || projectId || plan.projects[0].id)
  }

  function expandAncestors(parentTaskId: string | null, targetProjectId: string) {
    const parentById = new Map(plan.tasks.map(task => [task.id, task.parentTaskId]))
    setCollapsed(current => {
      const next = new Set(current)
      next.delete(`project:${targetProjectId}`)
      for (let id = parentTaskId; id; id = parentById.get(id) ?? null) next.delete(id)
      return next
    })
  }

  function toggle(id: string) {
    setCollapsed(current => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  async function save(fields: TaskFields) {
    const id = await repository.saveTask(fields, currentRow?.task.id)
    if (projectId && projectId !== fields.projectId) setProjectId(fields.projectId)
    expandAncestors(fields.parentTaskId, fields.projectId)
    if (!currentRow || currentRow.task.startDate !== fields.startDate) goTo(fields.startDate)
    openTask(id)
    setNotice({ text: currentRow ? 'タスクを更新しました。' : 'タスクを作成しました。' })
  }

  async function move(row: GanttRow, schedule: Schedule) {
    try {
      if (row.kind === 'todo') await repository.setTodoSchedule(row.targetId, schedule)
      else if (row.kind === 'task') await repository.moveDates(row.targetId, schedule.startDate, schedule.endDate)
      setNotice({ text: '日程を更新しました。' })
    } catch (reason) {
      setNotice({ text: reason instanceof Error ? reason.message : '日程を保存できませんでした。', error: true })
    }
  }

  const draft = drawer && 'initial' in drawer ? drawer : undefined
  const accessibleMonth = new Intl.DateTimeFormat('ja-JP', { year: 'numeric', month: 'long' }).format(localDate(viewDate))

  return <div className="app-shell">
    <aside className="sidebar" aria-label="ナビゲーション">
      <div className="brand"><span className="brand-mark"><GanttChartSquare size={21} /></span>予定帳</div>
      <nav className="sidebar-nav">
        <button className={!projectId ? 'nav-item active' : 'nav-item'} aria-current={!projectId ? 'page' : undefined}
          onClick={() => { setProjectId(''); setDrawer(undefined) }}>
          <CalendarDays size={17} />すべてのタスク
        </button>
        <div className="nav-heading"><span>プロジェクト</span>
          <button className="icon-button" onClick={() => setProjectDialog(true)} disabled={storageError || loading} aria-label="プロジェクトを作成"><Plus size={17} /></button>
        </div>
        {plan.projects.map(item => {
          const unresolved = issueIndex.projectOpen.get(item.id) ?? 0
          return <button key={item.id} title={unresolved ? `${item.name}（未解消 ${unresolved} 件）` : item.name}
            aria-description={unresolved ? `未解消の疑問・懸念 ${unresolved} 件` : undefined}
            className={projectId === item.id ? 'nav-item active' : 'nav-item'} aria-current={projectId === item.id ? 'page' : undefined}
            onClick={() => { setProjectId(item.id); setDrawer(undefined) }}>
            <FolderOpen size={17} /><span className="nav-project-name">{item.name}</span>
            {unresolved > 0 && <span className="issue-badge" aria-hidden="true">! {unresolved}</span>}
          </button>
        })}
      </nav>
    </aside>

    <main className="workspace">
      <header className="page-header">
        <div className="min-w-0">
          <div className="breadcrumb"><CalendarDays size={15} /> ガントチャート</div>
          <h1>{project?.name ?? 'すべてのタスク'}</h1>
          {project?.description && <p className="project-description">{project.description}</p>}
        </div>
        <div className="header-actions">
          {project && <button className="button" onClick={() => setProjectIssuesId(project.id)}>
            <MessageSquare size={16} />疑問・懸念{projectUnresolved > 0 && <span className="issue-badge">未解消 {projectUnresolved}</span>}
          </button>}
          <button className="button primary shrink-0" onClick={() => addTask()} disabled={storageError || loading}>
            <Plus size={17} />タスクを追加
          </button>
        </div>
      </header>
      {storageError && <p role="alert" className="storage-error">ローカルデータを開けませんでした。ブラウザで IndexedDB が使える状態にして、再読み込みしてください。</p>}
      <div className="content-area">
        <section className="gantt-card" aria-label="予定">
          <div className="gantt-toolbar">
            <div className="period-tools">
              <div className="period-nav">
                <button className="icon-button" aria-label="前の期間" onClick={() => goTo(addDays(anchor.current, -pageStep[scale]))}><ChevronLeft size={17} /></button>
                <button className="icon-button" aria-label="次の期間" onClick={() => goTo(addDays(anchor.current, pageStep[scale]))}><ChevronRight size={17} /></button>
              </div>
              <button className="button small" onClick={() => goTo(dateKey(new Date()))}>今日</button>
              <span className="period-month">{accessibleMonth}</span>
            </div>
            <div className="chart-controls">
              <div className="scale-toggle" role="group" aria-label="表示単位">
                {Object.entries(scales).map(([value, label]) => <button key={value} type="button" aria-pressed={value === scale}
                  onClick={() => {
                    if (value === scale) return
                    goTo(anchor.current)
                    setScale(value as Scale)
                  }}>{label}</button>)}
              </div>
              <button className="button small" type="button" onClick={() => setSettingsOpen(true)}>
                <Settings2 size={16} />表示設定
              </button>
            </div>
          </div>
          <div className="chart-area">
            <Gantt rows={chartRows} collapsed={collapsed}
              scale={scale} jump={jump} onOpen={openGanttRow} onToggle={toggle} onAdd={addTask} onMove={(row, dates) => void move(row, dates)}
              onWindow={date => { anchor.current = date; setViewDate(date) }} />
            {!loading && !storageError && !shownRows.length && <div className="empty-state">
              <span className="empty-icon"><CalendarDays size={23} /></span>
              <h2>{plan.projects.length ? '予定を登録しましょう' : '最初のプロジェクトを作成しましょう'}</h2>
              <p>{plan.projects.length ? '時間軸をダブルクリックすると、その日付でタスクを追加できます。' : 'プロジェクトを作成すると、家事や引越しなどの予定をここで管理できます。'}</p>
              <button className="button" onClick={() => plan.projects.length ? addTask() : setProjectDialog(true)}>
                {plan.projects.length ? <Plus size={17} /> : <FolderPlus size={17} />}
                {plan.projects.length ? '最初のタスクを追加' : 'プロジェクトを作成'}
              </button>
            </div>}
          </div>
          <footer className="gantt-footer">
            <span>{loading ? '読み込み中…' : `${shownRows.length} 件のタスク`}</span>
            <span>時間軸をダブルクリックで追加 · バーと両端をドラッグで日程変更</span>
          </footer>
        </section>
        {(draft || currentRow) && <TaskDrawer key={currentRow?.task.id ?? draft?.key}
          plan={plan} row={currentRow} initial={currentRow?.task ?? draft!.initial}
          request={drawer && 'id' in drawer ? drawer.request : undefined}
          extras={currentTaskId ? {
            todos: plan.todos.filter(todo => todo.taskId === currentTaskId)
              .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)),
            projectIssues: issueIndex.projectIssues.get(currentRow.task.projectId) ?? [],
            unresolved: issueIndex.taskOpen.get(currentTaskId) ?? 0,
            unresolvedByTodo: issueIndex.todoOpen,
            onAddTodo: title => repository.addTodo(currentTaskId, title),
            onToggleTodo: repository.setTodoCompleted,
            onScheduleTodo: repository.setTodoSchedule,
            onDeleteTodo: repository.deleteTodo,
            onSaveIssue: repository.saveIssue,
          } : undefined}
          onClose={() => setDrawer(undefined)} onSave={save} onReveal={goTo}
          onDelete={async () => {
            if (!currentRow) return
            await repository.deleteTask(currentRow.task.id)
            setDrawer(undefined)
            setNotice({ text: 'タスクを削除しました。' })
          }}
          onReorder={async offset => {
            if (currentRow) await repository.reorder(currentRow.task.id, offset)
          }}
          onChild={() => {
            if (currentRow) newTask(currentRow.startDate, currentRow.task.projectId, currentRow.task.id)
          }} />}
      </div>
    </main>
    {settingsOpen && <GanttSettingsDialog settings={settings} onClose={() => setSettingsOpen(false)} onChange={next => {
      setSettings(next)
      storeGanttSettings(next)
    }} />}
    {issuesProject && <DialogRoot open onOpenChange={open => { if (!open) setProjectIssuesId(undefined) }}>
      <DialogContent title={issuesProject.name} description="プロジェクト全体の疑問・懸念">
        <IssueList key={issuesProject.id} issues={issueIndex.projectIssues.get(issuesProject.id) ?? []}
          target={{ targetType: 'project', targetId: issuesProject.id }} targetLabel={`プロジェクト「${issuesProject.name}」`}
          onSave={repository.saveIssue} />
      </DialogContent>
    </DialogRoot>}
    {projectDialog && <ProjectDialog onClose={() => { taskAfterProject.current = null; setProjectDialog(false) }}
      onSave={async (name, description) => {
        const id = await repository.createProject(name, description)
        setProjectId(id)
        if (taskAfterProject.current) newTask(taskAfterProject.current.date, id)
        else setDrawer(undefined)
        taskAfterProject.current = null
        setProjectDialog(false)
        setNotice({ text: 'プロジェクトを作成しました。' })
      }} />}
    {notice && <div className={notice.error ? 'toast error' : 'toast'} role={notice.error ? 'alert' : 'status'}>{notice.text}
      {notice.error && <button className="button small" onClick={() => setNotice(undefined)}>閉じる</button>}
    </div>}
  </div>
}

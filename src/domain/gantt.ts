import { statuses, type Project, type Schedule, type Todo } from './model'
import { aggregateProgress, type TaskRow } from './tasks'

export interface GanttSettings {
  showProjects: boolean
  showTodos: boolean
}

export type GanttRow = {
  id: string
  kind: 'project' | 'parent' | 'task' | 'todo'
  targetId: string
  projectId: string
  taskId?: string
  title: string
  subtitle?: string
  description?: string
  depth: number
  hasChildren: boolean
  progress?: number
  unresolved: number
  schedule?: Schedule
  editable: boolean
  barClass: string
}

export function ganttRows({
  projects, tasks, todos, settings, allProjects, unresolved,
}: {
  projects: Project[]
  tasks: TaskRow[]
  todos: Todo[]
  settings: GanttSettings
  allProjects: boolean
  unresolved: { projectOpen: ReadonlyMap<string, number>; taskOpen: ReadonlyMap<string, number>; todoOpen: ReadonlyMap<string, number> }
}): GanttRow[] {
  const rows: GanttRow[] = []
  const todosByTask = new Map<string, Todo[]>()
  if (settings.showTodos) {
    for (const todo of [...todos].sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
      const list = todosByTask.get(todo.taskId) ?? []
      list.push(todo)
      todosByTask.set(todo.taskId, list)
    }
  }
  for (const project of projects) {
    const projectTasks = tasks.filter(row => row.task.projectId === project.id)
    const roots = projectTasks.filter(row => row.depth === 0)
    if (settings.showProjects) {
      const startDate = roots.reduce((earliest, row) => row.startDate < earliest ? row.startDate : earliest, roots[0]?.startDate)
      const endDate = roots.reduce((latest, row) => row.endDate > latest ? row.endDate : latest, roots[0]?.endDate)
      rows.push({
        id: `project:${project.id}`, kind: 'project', targetId: project.id, projectId: project.id,
        title: project.name, subtitle: 'プロジェクト', depth: 0, hasChildren: roots.length > 0,
        schedule: startDate && endDate ? { startDate, endDate } : undefined,
        progress: roots.length ? aggregateProgress(roots.map(row => row.progress)) : undefined,
        unresolved: unresolved.projectOpen.get(project.id) ?? 0, editable: false, barClass: 'project-bar',
      })
    }
    for (const row of projectTasks) {
      const { task } = row
      const list = todosByTask.get(task.id) ?? []
      const depth = row.depth + Number(settings.showProjects)
      const schedule = { startDate: row.startDate, endDate: row.endDate }
      rows.push({
        id: task.id, kind: row.childCount ? 'parent' : 'task', targetId: task.id, projectId: project.id, taskId: task.id, title: task.title,
        subtitle: allProjects && !settings.showProjects && row.depth === 0 ? project.name : undefined,
        description: statuses[task.status], depth, hasChildren: Boolean(row.childCount || list.length),
        progress: row.progress, unresolved: unresolved.taskOpen.get(task.id) ?? 0,
        schedule, editable: !row.childCount, barClass: `status-${task.status}${row.childCount ? ' summary-bar' : ''}`,
      })
      for (const todo of list) {
        rows.push({
          id: `todo:${todo.id}`, kind: 'todo', targetId: todo.id, projectId: project.id, taskId: task.id,
          title: todo.title, subtitle: 'Todo', description: todo.schedule ? undefined : 'タスクの期間を使用',
          depth: depth + 1, hasChildren: false, progress: todo.completed ? 100 : 0,
          unresolved: unresolved.todoOpen.get(todo.id) ?? 0, schedule: todo.schedule ?? schedule,
          editable: true, barClass: `todo-bar${todo.schedule ? '' : ' inherited-bar'}${todo.completed ? ' status-done' : ''}`,
        })
      }
    }
  }
  return rows
}

export function visibleGanttRows(rows: GanttRow[], collapsed: ReadonlySet<string>): GanttRow[] {
  const visible: GanttRow[] = []
  let hiddenBelow = Infinity
  for (const row of rows) {
    if (row.depth > hiddenBelow) continue
    hiddenBelow = row.hasChildren && collapsed.has(row.id) ? row.depth : Infinity
    visible.push(row)
  }
  return visible
}

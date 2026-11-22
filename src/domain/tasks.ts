import { isDateKey } from './dates'
import { statuses, type Task, type TaskFields, type Todo } from './model'

export interface TaskRow {
  task: Task
  depth: number
  childCount: number
  startDate: string
  endDate: string
  progress: number
}

export function aggregateProgress(progress: number[]): number {
  return Math.round(progress.reduce((total, value) => total + value, 0) / progress.length)
}

export function checklistProgress(completed: number, total: number): number {
  return total ? Math.round(completed / total * 100) : 0
}

export function todoProgressByTask(todos: Todo[]): Map<string, number> {
  const counts = new Map<string, { total: number; completed: number }>()
  for (const todo of todos) {
    const count = counts.get(todo.taskId) ?? { total: 0, completed: 0 }
    count.total++
    if (todo.completed) count.completed++
    counts.set(todo.taskId, count)
  }
  return new Map(Array.from(counts, ([id, count]) => [id, checklistProgress(count.completed, count.total)]))
}

export function siblings(tasks: Task[], projectId: string, parentTaskId: string | null): Task[] {
  return tasks.filter(task => task.projectId === projectId && task.parentTaskId === parentTaskId)
    .sort(compareOrder)
}

function compareOrder(a: Task, b: Task): number {
  return a.sortOrder - b.sortOrder || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id)
}

export function taskRows(tasks: Task[], todoProgress?: ReadonlyMap<string, number>): TaskRow[] {
  const byParent = new Map<string | null, Task[]>()
  for (const task of [...tasks].sort(compareOrder)) {
    const children = byParent.get(task.parentTaskId) ?? []
    if (!byParent.has(task.parentTaskId)) byParent.set(task.parentTaskId, children)
    children.push(task)
  }
  const rows: TaskRow[] = []
  const pending = (byParent.get(null) ?? []).map(task => ({ task, depth: 0 })).reverse()
  while (pending.length) {
    const { task, depth } = pending.pop()!
    const children = byParent.get(task.id) ?? []
    rows.push({
      task, depth, childCount: children.length,
      startDate: task.startDate, endDate: task.endDate, progress: todoProgress?.get(task.id) ?? task.progress,
    })
    for (let index = children.length - 1; index >= 0; index--) {
      pending.push({ task: children[index], depth: depth + 1 })
    }
  }
  const byId = new Map(rows.map(row => [row.task.id, row]))
  const summaries = new Map<string, TaskRow[]>()
  for (const row of [...rows].reverse()) {
    const children = summaries.get(row.task.id)
    if (children) {
      row.startDate = children.reduce((value, child) => child.startDate < value ? child.startDate : value, children[0].startDate)
      row.endDate = children.reduce((value, child) => child.endDate > value ? child.endDate : value, children[0].endDate)
      row.progress = aggregateProgress(children.map(child => child.progress))
    }
    const parentId = row.task.parentTaskId
    if (parentId && byId.has(parentId)) {
      const childrenOfParent = summaries.get(parentId) ?? []
      if (!summaries.has(parentId)) summaries.set(parentId, childrenOfParent)
      childrenOfParent.push(row)
    }
  }
  return rows
}

export function descendantIds(tasks: Task[], id: string): Set<string> {
  const byParent = new Map<string, string[]>()
  for (const task of tasks) {
    if (!task.parentTaskId) continue
    const children = byParent.get(task.parentTaskId) ?? []
    if (!byParent.has(task.parentTaskId)) byParent.set(task.parentTaskId, children)
    children.push(task.id)
  }
  const found = new Set<string>()
  const pending = [id]
  while (pending.length) {
    const current = pending.pop()!
    if (found.has(current)) continue
    found.add(current)
    for (const child of byParent.get(current) ?? []) pending.push(child)
  }
  return found
}

export function validateTask(fields: TaskFields) {
  if (!fields.title.trim()) throw new Error('表題を入力してください。')
  if (!isDateKey(fields.startDate) || !isDateKey(fields.endDate) || fields.startDate > fields.endDate) {
    throw new Error('開始日と終了日を確認してください。')
  }
  if (!Object.hasOwn(statuses, fields.status)) throw new Error('ステータスを確認してください。')
  if (!Number.isInteger(fields.progress) || fields.progress < 0 || fields.progress > 100) {
    throw new Error('進捗率は 0〜100 の整数で入力してください。')
  }
}

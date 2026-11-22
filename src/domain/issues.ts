import type { Issue, Plan } from './model'
import type { TaskRow } from './tasks'

export interface IssueEntry {
  issue: Issue
  taskId?: string
  source: string
}

export function indexIssues(plan: Plan, rows: TaskRow[]) {
  const tasks = new Map(plan.tasks.map(task => [task.id, task]))
  const todos = new Map(plan.todos.map(todo => [todo.id, todo]))
  const projectIssues = new Map<string, IssueEntry[]>()
  const projectOpen = new Map<string, number>()
  const taskOpen = new Map<string, number>()
  const todoOpen = new Map<string, number>()
  for (const issue of plan.issues) {
    const todo = issue.targetType === 'todo' ? todos.get(issue.targetId) : undefined
    const task = issue.targetType === 'task' ? tasks.get(issue.targetId) : todo && tasks.get(todo.taskId)
    const projectId = issue.targetType === 'project' ? issue.targetId : task?.projectId
    if (!projectId) continue

    const source = todo && task ? `タスク「${task.title}」の Todo「${todo.title}」`
      : task ? `タスク「${task.title}」` : 'プロジェクト直下'
    const entries = projectIssues.get(projectId) ?? []
    entries.push({ issue, taskId: task?.id, source })
    projectIssues.set(projectId, entries)
    if (issue.status === 'open') {
      projectOpen.set(projectId, (projectOpen.get(projectId) ?? 0) + 1)
      if (task) taskOpen.set(task.id, (taskOpen.get(task.id) ?? 0) + 1)
      if (todo) todoOpen.set(todo.id, (todoOpen.get(todo.id) ?? 0) + 1)
    }
  }
  // ガントの行は親から子の順に並ぶので、逆順で親まで未解消件数を足す。
  for (let i = rows.length - 1; i >= 0; i--) {
    const { id, parentTaskId } = rows[i].task
    const count = taskOpen.get(id)
    if (count && parentTaskId) taskOpen.set(parentTaskId, (taskOpen.get(parentTaskId) ?? 0) + count)
  }
  for (const entries of projectIssues.values()) {
    entries.sort((a, b) => a.issue.createdAt.localeCompare(b.issue.createdAt) || a.issue.id.localeCompare(b.issue.id))
  }
  return { projectIssues, projectOpen, taskOpen, todoOpen }
}

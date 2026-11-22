import { Dexie, liveQuery, type EntityTable } from 'dexie'
import { isDateKey } from '../domain/dates'
import { descendantIds, siblings, validateTask } from '../domain/tasks'
import type { Comment, Issue, IssueFields, IssueTarget, Plan, Project, Schedule, Task, TaskFields, Todo } from '../domain/model'

export class TaskDatabase extends Dexie {
  projects!: EntityTable<Project, 'id'>
  tasks!: EntityTable<Task, 'id'>
  todos!: EntityTable<Todo, 'id'>
  comments!: EntityTable<Comment, 'id'>
  issues!: EntityTable<Issue, 'id'>

  constructor(name = 'personal-task-manager') {
    super(name)
    this.version(1).stores({
      projects: 'id',
      tasks: 'id, projectId, parentTaskId',
      comments: 'id, taskId',
      issues: 'id, taskId, commentId',
    })
    this.version(2).stores({ todos: 'id, taskId' })
    this.version(3).stores({ issues: 'id, [targetType+targetId], commentId' }).upgrade(transaction =>
      transaction.table<Omit<Issue, keyof IssueTarget> & Partial<IssueTarget> & { taskId?: string }>('issues')
        .toCollection().modify(issue => {
          if (issue.taskId) {
            issue.targetType = 'task'
            issue.targetId = issue.taskId
            delete issue.taskId
          }
        }),
    )
  }
}

export function createRepository(db: TaskDatabase) {
  function read(): Promise<Plan> {
    return db.transaction('r', db.projects, db.tasks, db.todos, db.issues, async () => ({
      projects: (await db.projects.toArray()).sort((a, b) => a.createdAt.localeCompare(b.createdAt)),
      tasks: await db.tasks.toArray(),
      todos: await db.todos.toArray(),
      issues: await db.issues.toArray(),
    }))
  }

  async function saveTask(fields: TaskFields, id?: string) {
    validateTask(fields)
    return db.transaction('rw', db.tasks, db.projects, async () => {
      const tasks = await db.tasks.toArray()
      const existing = tasks.find(task => task.id === id)
      if (id && !existing) throw new Error('タスクが見つかりません。')
      if (!await db.projects.get(fields.projectId)) throw new Error('プロジェクトを選択してください。')
      const subtree = existing ? descendantIds(tasks, existing.id) : new Set<string>()
      if (fields.parentTaskId) {
        const parent = tasks.find(task => task.id === fields.parentTaskId)
        if (!parent || parent.projectId !== fields.projectId || subtree.has(parent.id)) {
          throw new Error('同じプロジェクト内で、循環しない親タスクを選択してください。')
        }
      }
      if (existing && existing.projectId !== fields.projectId && subtree.size > 1) {
        throw new Error('子タスクがあるタスクは別のプロジェクトに移動できません。')
      }
      const samePosition = existing && existing.projectId === fields.projectId && existing.parentTaskId === fields.parentTaskId
      const peers = siblings(tasks, fields.projectId, fields.parentTaskId)
      const now = new Date().toISOString()
      const task: Task = {
        ...fields,
        title: fields.title.trim(),
        id: existing?.id ?? crypto.randomUUID(),
        createdAt: existing?.createdAt ?? now,
        updatedAt: now,
        sortOrder: samePosition ? existing.sortOrder : (peers.at(-1)?.sortOrder ?? -1) + 1,
      }
      await db.tasks.put(task)
      return task.id
    })
  }

  return {
    watch(onPlan: (plan: Plan) => void, onError: (error: unknown) => void) {
      const subscription = liveQuery(read).subscribe({ next: onPlan, error: onError })
      return () => subscription.unsubscribe()
    },
    async addTodo(taskId: string, title: string) {
      title = title.trim()
      if (!title) throw new Error('Todo の内容を入力してください。')
      return db.transaction('rw', db.tasks, db.todos, async () => {
        if (!await db.tasks.get(taskId)) throw new Error('タスクが見つかりません。')
        const now = new Date().toISOString()
        return db.todos.add({ id: crypto.randomUUID(), taskId, title, completed: false, createdAt: now, updatedAt: now })
      })
    },
    async setTodoCompleted(id: string, completed: boolean) {
      const updated = await db.todos.update(id, { completed, updatedAt: new Date().toISOString() })
      if (!updated) throw new Error('Todo が見つかりません。')
    },
    async setTodoSchedule(id: string, schedule?: Schedule) {
      if (schedule && (!isDateKey(schedule.startDate) || !isDateKey(schedule.endDate) || schedule.startDate > schedule.endDate)) {
        throw new Error('Todo の開始日と終了日を確認してください。')
      }
      const updated = await db.todos.update(id, { schedule, updatedAt: new Date().toISOString() })
      if (!updated) throw new Error('Todo が見つかりません。')
    },
    async deleteTodo(id: string) {
      await db.transaction('rw', db.todos, db.issues, async () => {
        await db.issues.where('[targetType+targetId]').equals(['todo', id]).delete()
        await db.todos.delete(id)
      })
    },
    async saveIssue({ targetType, targetId }: IssueTarget, fields: IssueFields, id?: string) {
      const title = fields.title.trim()
      if (!title) throw new Error('疑問・懸念の表題を入力してください。')
      if (fields.type !== 'question' && fields.type !== 'concern') throw new Error('種別を選択してください。')
      if (fields.status !== 'open' && fields.status !== 'resolved') throw new Error('解消状態を確認してください。')
      const tables = { project: db.projects, task: db.tasks, todo: db.todos }
      const targetTable = tables[targetType]
      if (!targetTable || !targetId) throw new Error('疑問・懸念の登録先を確認してください。')
      return db.transaction('rw', targetTable, db.issues, async () => {
        if (!await targetTable.get(targetId)) throw new Error('疑問・懸念の登録先が見つかりません。')
        const existing = id ? await db.issues.get(id) : undefined
        if (id && (existing?.targetType !== targetType || existing.targetId !== targetId)) {
          throw new Error('疑問・懸念が見つかりません。')
        }
        const now = new Date().toISOString()
        const resolvedAt = fields.status === 'resolved' ? existing?.resolvedAt ?? now : null
        return db.issues.put({
          ...fields,
          id: existing?.id ?? crypto.randomUUID(),
          targetType,
          targetId,
          commentId: existing?.commentId ?? null,
          title,
          createdAt: existing?.createdAt ?? now,
          updatedAt: now,
          resolvedAt,
        })
      })
    },
    async createProject(name: string, description: string) {
      if (!name.trim()) throw new Error('プロジェクト名を入力してください。')
      const now = new Date().toISOString()
      const id = crypto.randomUUID()
      await db.projects.add({ id, name: name.trim(), description, createdAt: now, updatedAt: now })
      return id
    },
    saveTask,
    async moveDates(id: string, startDate: string, endDate: string) {
      await db.transaction('rw', db.tasks, async () => {
        const task = await db.tasks.get(id)
        if (!task) throw new Error('タスクが見つかりません。')
        if (await db.tasks.where('parentTaskId').equals(id).count()) {
          throw new Error('子タスクの日程を変更してください。')
        }
        validateTask({ ...task, startDate, endDate })
        await db.tasks.update(id, { startDate, endDate, updatedAt: new Date().toISOString() })
      })
    },
    async reorder(id: string, offset: -1 | 1) {
      await db.transaction('rw', db.tasks, async () => {
        const task = await db.tasks.get(id)
        if (!task) throw new Error('タスクが見つかりません。')
        const list = siblings(await db.tasks.where('projectId').equals(task.projectId).toArray(), task.projectId, task.parentTaskId)
        const index = list.findIndex(peer => peer.id === id)
        const neighbor = list[index + offset]
        if (!neighbor) return
        list[index] = neighbor
        list[index + offset] = task
        const now = new Date().toISOString()
        await db.tasks.bulkPut(list.map((peer, sortOrder) =>
          peer.sortOrder === sortOrder ? peer : { ...peer, sortOrder, updatedAt: now }))
      })
    },
    async deleteTask(id: string) {
      await db.transaction('rw', db.tasks, db.comments, db.issues, db.todos, async () => {
        const ids = [...descendantIds(await db.tasks.toArray(), id)]
        const todoIds = await db.todos.where('taskId').anyOf(ids).primaryKeys()
        await db.issues.where('[targetType+targetId]').anyOf([
          ...ids.map(taskId => ['task', taskId]),
          ...todoIds.map(todoId => ['todo', todoId]),
        ]).delete()
        await db.todos.where('taskId').anyOf(ids).delete()
        await db.comments.where('taskId').anyOf(ids).delete()
        await db.tasks.bulkDelete(ids)
      })
    },
  }
}

export const repository = createRepository(new TaskDatabase())

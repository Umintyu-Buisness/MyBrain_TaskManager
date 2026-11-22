import 'fake-indexeddb/auto'
import assert from 'node:assert/strict'
import { test } from 'node:test'
import { Dexie } from 'dexie'
import { createRepository, TaskDatabase } from '../src/data/repository'
import type { TaskFields } from '../src/domain/model'

const fields = (projectId: string, parentTaskId: string | null = null): TaskFields => ({
  projectId, parentTaskId, title: '  仮タスク  ', description: '',
  startDate: '2026-11-20', endDate: '2026-11-20', status: 'todo', progress: 0,
})

test('親子関係と入力値を検証し、失敗時に既存データを維持する', async () => {
  const db = new TaskDatabase(crypto.randomUUID())
  try {
    const repository = createRepository(db)
    const first = await repository.createProject('引越し準備', '')
    const other = await repository.createProject('家事', '')
    const root = await repository.saveTask(fields(first))
    const child = await repository.saveTask(fields(first, root))
    await assert.rejects(repository.saveTask(fields(first, child), root), /循環/)
    await assert.rejects(repository.saveTask(fields(other, root)), /同じプロジェクト/)
    await assert.rejects(repository.saveTask(fields(other), root), /子タスクがある/)
    await assert.rejects(repository.saveTask(fields('missing')), /プロジェクト/)
    await assert.rejects(repository.saveTask({ ...fields(first), title: ' ' }), /表題/)
    await assert.rejects(repository.saveTask({ ...fields(first), progress: 101 }), /進捗率/)
    await assert.rejects(repository.moveDates(child, '2026-11-22', '2026-11-21'), /開始日/)
    await assert.rejects(repository.moveDates(root, '2026-11-21', '2026-11-21'), /子タスク/)
    assert.equal(await db.tasks.count(), 2)
    assert.equal((await db.tasks.get(root))?.parentTaskId, null)
    assert.equal((await db.tasks.get(child))?.title, '仮タスク')
  } finally {
    await db.delete()
  }
})

test('同じ階層の並び替えと日程更新が再オープン後も残る', async () => {
  const name = crypto.randomUUID()
  const db = new TaskDatabase(name)
  const reopened = new TaskDatabase(name)
  try {
    const repository = createRepository(db)
    const project = await repository.createProject('個人タスク', '')
    const root = await repository.saveTask(fields(project))
    const [first, second] = await Promise.all([
      repository.saveTask(fields(project, root)),
      repository.saveTask(fields(project, root)),
    ])
    await repository.reorder(second, -1)
    await repository.moveDates(first, '2026-11-24', '2026-11-25')
    db.close()
    assert.equal((await reopened.tasks.get(first))?.sortOrder, 1)
    assert.equal((await reopened.tasks.get(second))?.sortOrder, 0)
    assert.equal((await reopened.tasks.get(first))?.endDate, '2026-11-25')
  } finally {
    db.close()
    await reopened.delete()
  }
})

test('親の削除で子孫と関連データをまとめて削除し、他のタスクを保持する', async () => {
  const db = new TaskDatabase(crypto.randomUUID())
  try {
    const repository = createRepository(db)
    const project = await repository.createProject('家具', '')
    const root = await repository.saveTask(fields(project))
    const child = await repository.saveTask(fields(project, root))
    const grandchild = await repository.saveTask(fields(project, child))
    const remaining = await repository.saveTask(fields(project))
    const grandchildTodo = await repository.addTodo(grandchild, '荷物をまとめる')
    const remainingTodo = await repository.addTodo(remaining, '家事')
    const timestamps = { createdAt: '', updatedAt: '' }
    await db.comments.add({ id: 'comment', taskId: grandchild, body: '履歴', ...timestamps })
    await db.issues.add({ id: 'issue', targetType: 'task', targetId: grandchild, commentId: 'comment', type: 'question',
      title: '疑問', description: '', status: 'open', resolution: '', resolvedAt: null, ...timestamps })
    const issueFields = { type: 'concern', title: '懸念', description: '', status: 'open', resolution: '' } as const
    await repository.saveIssue({ targetType: 'todo', targetId: grandchildTodo }, issueFields)
    const projectIssue = await repository.saveIssue({ targetType: 'project', targetId: project }, issueFields)
    const todoIssue = await repository.saveIssue({ targetType: 'todo', targetId: remainingTodo }, issueFields)
    await repository.deleteTask(root)
    assert.deepEqual(await db.tasks.toCollection().primaryKeys(), [remaining])
    assert.equal(await db.comments.count(), 0)
    assert.deepEqual((await db.issues.toCollection().primaryKeys()).sort(), [projectIssue, todoIssue].sort())
    assert.deepEqual(await db.todos.toCollection().primaryKeys(), [remainingTodo])
    await repository.deleteTodo(remainingTodo)
    assert.deepEqual(await db.issues.toCollection().primaryKeys(), [projectIssue])
    assert.equal(await db.todos.count(), 0)
  } finally {
    await db.delete()
  }
})

test('既存の IndexedDB を更新し、従来のタスクに Todo と疑問・懸念を保存できる', async () => {
  const name = crypto.randomUUID()
  const legacy = new Dexie(name)
  legacy.version(1).stores({ projects: 'id', tasks: 'id, projectId, parentTaskId',
    comments: 'id, taskId', issues: 'id, taskId, commentId' })
  legacy.version(2).stores({ todos: 'id, taskId' })
  const db = new TaskDatabase(name)
  try {
    const timestamps = { createdAt: '', updatedAt: '' }
    await legacy.table('projects').add({ id: 'project', name: '既存プロジェクト', description: '', ...timestamps })
    await legacy.table('tasks').add({ ...fields('project'), id: 'old-task', sortOrder: 0, progress: 25, ...timestamps })
    await legacy.table('todos').add({ id: 'old-todo', taskId: 'old-task', title: '既存の Todo', completed: true, ...timestamps })
    await legacy.table('comments').add({ id: 'old-comment', taskId: 'old-task', body: '以前の作業履歴', ...timestamps })
    const oldIssue = { type: 'question', title: '以前の疑問', description: '', status: 'open', resolution: '' } as const
    await legacy.table('issues').add({ ...oldIssue, id: 'old-issue', taskId: 'old-task', commentId: 'old-comment',
      resolvedAt: null, ...timestamps })
    legacy.close()

    const repository = createRepository(db)
    assert.equal((await db.todos.get('old-todo'))?.completed, true)
    assert.equal((await db.todos.get('old-todo'))?.schedule, undefined)
    const migrated = await db.issues.get('old-issue')
    assert.equal(migrated?.targetType, 'task')
    assert.equal(migrated?.targetId, 'old-task')
    assert.equal(migrated?.title, oldIssue.title)
    const todo = await repository.addTodo('old-task', '  確認する  ')
    await repository.setTodoCompleted(todo, true)
    assert.equal((await db.todos.get(todo))?.completed, true)
    assert.equal((await db.todos.get(todo))?.title, '確認する')
    await assert.rejects(repository.setTodoSchedule(todo, { startDate: '2026-11-25', endDate: '2026-11-24' }), /開始日と終了日/)
    const schedule = { startDate: '2026-11-25', endDate: '2026-11-26' }
    await repository.setTodoSchedule(todo, schedule)
    assert.deepEqual((await db.todos.get(todo))?.schedule, schedule)
    await repository.setTodoSchedule(todo)
    assert.equal((await db.todos.get(todo))?.schedule, undefined)
    assert.equal((await db.todos.get(todo))?.completed, true)
    assert.equal((await db.tasks.get('old-task'))?.progress, 25)
    await assert.rejects(repository.addTodo('unknown', '確認する'), /タスクが見つかりません/)

    const scope = { targetType: 'task', targetId: 'old-task' } as const
    const newIssue = await repository.saveIssue(scope, {
      ...oldIssue, type: 'concern', title: '新しい懸念', description: '詳細',
    })
    assert.equal((await db.issues.get(newIssue))?.commentId, null)
    await assert.rejects(repository.saveIssue({ targetType: 'todo', targetId: 'unknown' }, oldIssue), /登録先が見つかりません/)
    await assert.rejects(repository.saveIssue({ targetType: 'todo', targetId: 'old-todo' }, oldIssue, 'old-issue'), /疑問・懸念が見つかりません/)
    await repository.saveIssue(scope, { ...oldIssue, status: 'resolved', resolution: '確認済み' }, 'old-issue')
    const resolved = await db.issues.get('old-issue')
    assert.equal(resolved?.commentId, 'old-comment')
    assert.ok(resolved?.resolvedAt)
    assert.equal(resolved?.resolution, '確認済み')
    assert.equal((await db.comments.get('old-comment'))?.body, '以前の作業履歴')
    await repository.saveIssue(scope, { ...oldIssue, resolution: '確認済み' }, 'old-issue')
    assert.equal((await db.issues.get('old-issue'))?.resolvedAt, null)
  } finally {
    legacy.close()
    await db.delete()
  }
})

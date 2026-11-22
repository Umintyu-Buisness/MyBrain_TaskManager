import assert from 'node:assert/strict'
import { test } from 'node:test'
import { inclusiveRange, isDateKey, timelineRange } from '../src/domain/dates'
import { indexIssues } from '../src/domain/issues'
import { ganttRows, visibleGanttRows } from '../src/domain/gantt'
import type { Issue, Plan, Task } from '../src/domain/model'
import { taskRows, todoProgressByTask } from '../src/domain/tasks'

test('日付は実在する日だけを受け付け、同日および月またぎの期間は両端を含む', () => {
  assert.equal(isDateKey('2024-02-29'), true)
  for (const key of ['2025-02-29', '2026-04-31', '2026-4-01', '0000-01-01', '']) {
    assert.equal(isDateKey(key), false, key)
  }
  for (const [startDate, endDate] of [
    ['2026-11-20', '2026-11-20'],
    ['2026-12-30', '2027-01-02'],
    ['2026-03-07', '2026-03-09'],
  ]) {
    const { start, end } = timelineRange(startDate, endDate)
    assert.ok(end > start)
    assert.deepEqual(inclusiveRange(start, end), { startDate, endDate })
  }
})

function task(id: string, parentTaskId: string | null, startDate: string, endDate: string, progress: number, sortOrder = 0): Task {
  return { id, parentTaskId, startDate, endDate, progress, sortOrder, projectId: 'p', title: id,
    description: '', status: 'todo', createdAt: '', updatedAt: '' }
}

test('孫の期間が親まで集約され、進捗は直接の子の単純平均になる', () => {
  const rows = taskRows([
    task('parent', null, '2026-11-01', '2026-11-01', 99),
    task('branch', 'parent', '2026-11-02', '2026-11-02', 99, 1),
    task('grandchild', 'branch', '2026-11-11', '2026-11-28', 80),
    task('leaf', 'parent', '2026-11-05', '2026-11-07', 21),
  ])
  assert.deepEqual(rows.map(row => [row.task.id, row.depth]), [
    ['parent', 0], ['leaf', 1], ['branch', 1], ['grandchild', 2],
  ])
  assert.equal(rows[0].startDate, '2026-11-05')
  assert.equal(rows[0].endDate, '2026-11-28')
  assert.equal(rows[0].progress, 51)
})

test('深い階層は再帰のスタック上限に依存しない', () => {
  const rows = taskRows(Array.from({ length: 12000 }, (_, index) => task(
    String(index), index ? String(index - 1) : null, '2026-11-20', '2026-11-21', 40,
  )))
  assert.equal(rows.at(-1)?.depth, 11999)
  assert.equal(rows[0].progress, 40)
})

test('Todo のある末端タスクは完了割合を使い、親は子の実効進捗を集約する', () => {
  const progress = todoProgressByTask([
    { id: '1', taskId: 'leaf', title: '完了', completed: true, createdAt: '', updatedAt: '' },
    { id: '2', taskId: 'leaf', title: '未完了 A', completed: false, createdAt: '', updatedAt: '' },
    { id: '3', taskId: 'leaf', title: '未完了 B', completed: false, createdAt: '', updatedAt: '' },
    { id: '4', taskId: 'parent', title: '親の Todo', completed: true, createdAt: '', updatedAt: '' },
  ])
  const tasks = [
    task('parent', null, '2026-11-20', '2026-11-20', 99),
    task('leaf', 'parent', '2026-11-20', '2026-11-20', 90),
    task('manual', 'parent', '2026-11-20', '2026-11-20', 60),
  ]
  assert.deepEqual(taskRows(tasks, progress).map(row => row.progress), [47, 33, 60])
  assert.deepEqual(taskRows(tasks, todoProgressByTask([])).map(row => row.progress), [75, 90, 60])
})

test('未解消のみを対象と上位に一度ずつ集約し、Todo の所属変更を追従する', () => {
  const timestamps = { createdAt: '', updatedAt: '' }
  const issues = ([
    ['project', 'p', 'open'], ['task', 'leaf', 'open'],
    ['todo', 'list-item', 'open'], ['todo', 'list-item', 'resolved'],
  ] as const).map(([targetType, targetId, status], id): Issue => ({
    targetType, targetId, status, id: String(id), type: 'concern', title: '懸念', description: '',
    commentId: null, resolvedAt: null, resolution: '', ...timestamps,
  }))
  const plan: Plan = {
    projects: ['p', 'q'].map(id => ({ id, name: id, description: '', ...timestamps })),
    tasks: [
      task('parent', null, '2026-11-20', '2026-11-20', 0),
      task('branch', 'parent', '2026-11-20', '2026-11-20', 0),
      task('leaf', 'branch', '2026-11-20', '2026-11-20', 0),
    ],
    todos: [{ id: 'list-item', taskId: 'leaf', title: '出荷', completed: true, ...timestamps }],
    issues,
  }
  const index = indexIssues(plan, taskRows(plan.tasks))
  assert.equal(index.projectOpen.get('p'), 3)
  assert.equal(index.projectOpen.get('q'), undefined)
  assert.equal(index.taskOpen.get('parent'), 2)
  assert.equal(index.taskOpen.get('branch'), 2)
  assert.equal(index.taskOpen.get('leaf'), 2)
  assert.equal(index.todoOpen.get('list-item'), 1)
  assert.equal(index.projectIssues.get('p')?.length, 4)
  assert.equal(index.projectIssues.get('p')?.[2].source, 'タスク「leaf」の Todo「出荷」')

  plan.tasks[2] = { ...plan.tasks[2], parentTaskId: null, projectId: 'q' }
  const moved = indexIssues(plan, taskRows(plan.tasks))
  assert.equal(moved.projectOpen.get('p'), 1)
  assert.equal(moved.projectOpen.get('q'), 2)
  assert.equal(moved.taskOpen.get('parent'), undefined)
})

test('表示設定でプロジェクトの集約行と所属タスク直下の Todo 行を切り替える', () => {
  const timestamps = { createdAt: '', updatedAt: '' }
  const plan: Plan = {
    projects: ['p', 'empty'].map(id => ({ id, name: id, description: '', ...timestamps })),
    tasks: [
      task('parent', null, '2026-11-01', '2026-11-03', 0),
      task('child', 'parent', '2026-11-08', '2026-11-10', 25),
      task('another', null, '2026-11-12', '2026-11-15', 75, 1),
    ],
    todos: [
      { id: 'inherited', taskId: 'child', title: '引き継ぐ', completed: false, ...timestamps },
      { id: 'scheduled', taskId: 'child', title: '指定する', completed: true, ...timestamps,
        schedule: { startDate: '2026-11-09', endDate: '2026-11-09' } },
    ],
    issues: [],
  }
  const tasks = taskRows(plan.tasks)
  const inputs = { projects: plan.projects, tasks, todos: plan.todos, allProjects: true, unresolved: indexIssues(plan, tasks) }
  const combined = ganttRows({ ...inputs, settings: { showProjects: true, showTodos: true } })
  assert.deepEqual(combined.map(row => [row.id, row.depth]), [
    ['project:p', 0], ['parent', 1], ['child', 2], ['todo:inherited', 3], ['todo:scheduled', 3],
    ['another', 1], ['project:empty', 0],
  ])
  assert.deepEqual(combined[0].schedule, { startDate: '2026-11-08', endDate: '2026-11-15' })
  assert.equal(combined[0].progress, 50)
  assert.equal(combined[0].editable, false)
  assert.deepEqual(combined[3].schedule, combined[2].schedule)
  assert.deepEqual(combined[4].schedule, plan.todos[1].schedule)
  assert.equal(combined.at(-1)?.schedule, undefined)
  assert.deepEqual(visibleGanttRows(combined, new Set(['child'])).map(row => row.id),
    ['project:p', 'parent', 'child', 'another', 'project:empty'])
  assert.deepEqual(visibleGanttRows(combined, new Set(['project:p'])).map(row => row.id), ['project:p', 'project:empty'])
  const tasksOnly = ganttRows({ ...inputs, settings: { showProjects: false, showTodos: false } })
  assert.deepEqual(tasksOnly.map(row => row.id), ['parent', 'child', 'another'])
  const todosOnly = ganttRows({ ...inputs, settings: { showProjects: false, showTodos: true } })
  assert.deepEqual(todosOnly.map(row => row.id), ['parent', 'child', 'todo:inherited', 'todo:scheduled', 'another'])
})

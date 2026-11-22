export const statuses = {
  todo: '未着手',
  doing: '進行中',
  hold: '保留',
  done: '完了',
} as const

export type Status = keyof typeof statuses

interface RecordFields {
  id: string
  createdAt: string
  updatedAt: string
}

export interface Project extends RecordFields {
  name: string
  description: string
}

export interface TaskFields {
  projectId: string
  parentTaskId: string | null
  title: string
  description: string
  startDate: string
  endDate: string
  status: Status
  progress: number
}

export interface Task extends RecordFields, TaskFields {
  sortOrder: number
}

export interface Todo extends RecordFields {
  taskId: string
  title: string
  completed: boolean
  schedule?: Schedule
}

export interface Schedule {
  startDate: string
  endDate: string
}

export interface Comment extends RecordFields {
  taskId: string
  body: string
}

export interface IssueFields {
  type: 'question' | 'concern'
  title: string
  description: string
  status: 'open' | 'resolved'
  resolution: string
}

export interface IssueTarget {
  targetType: 'project' | 'task' | 'todo'
  targetId: string
}

export interface Issue extends RecordFields, IssueFields, IssueTarget {
  commentId: string | null
  resolvedAt: string | null
}

export interface Plan {
  projects: Project[]
  tasks: Task[]
  todos: Todo[]
  issues: Issue[]
}

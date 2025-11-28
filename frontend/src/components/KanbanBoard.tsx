// frontend/src/components/KanbanBoard.tsx
import { useMemo, useState } from "react";
import type { Task } from "../types";

type KanbanBoardProps = {
  tasks: Task[];
  onUpdateTask: (id: number, updates: Partial<Task>) => void;
};

type ColumnKey = "todo" | "in_progress" | "done";

const COLUMN_CONFIG: { key: ColumnKey; label: string }[] = [
  { key: "todo",        label: "To Do" },
  { key: "in_progress", label: "In Progress" },
  { key: "done",        label: "Done" },
];

export function KanbanBoard({ tasks, onUpdateTask }: KanbanBoardProps) {
  const columns = useMemo(() => {
    const grouped: Record<ColumnKey, Task[]> = {
      todo: [],
      in_progress: [],
      done: [],
    };

    tasks.forEach(task => {
      const status = (task.status ?? "todo") as ColumnKey;
      if (!grouped[status]) {
        grouped.todo.push(task);
      } else {
        grouped[status].push(task);
      }
    });

    return grouped;
  }, [tasks]);

  return (
    <div className="kanban-board">
      {COLUMN_CONFIG.map(col => (
        <KanbanColumn
          key={col.key}
          title={col.label}
          status={col.key}
          tasks={columns[col.key]}
          onUpdateTask={onUpdateTask}
        />
      ))}
    </div>
  );
}

type KanbanColumnProps = {
  title: string;
  status: ColumnKey;
  tasks: Task[];
  onUpdateTask: (id: number, updates: Partial<Task>) => void;
};

function KanbanColumn({ title, status, tasks, onUpdateTask }: KanbanColumnProps) {
  return (
    <div className="kanban-column">
      <div className="kanban-column__header">
        <h2>{title}</h2>
        <span className="kanban-column__count">{tasks.length}</span>
      </div>

      <div className="kanban-column__body">
        {tasks.map(task => (
          <KanbanCard
            key={task.id}
            task={task}
            onUpdateTask={onUpdateTask}
            columnStatus={status}
          />
        ))}
      </div>
    </div>
  );
}

type KanbanCardProps = {
  task: Task;
  columnStatus: ColumnKey;
  onUpdateTask: (id: number, updates: Partial<Task>) => void;
};

function KanbanCard({ task, columnStatus, onUpdateTask }: KanbanCardProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [draftTitle, setDraftTitle] = useState(task.title);
  const [draftDescription, setDraftDescription] = useState(task.description ?? "");
  const [draftStatus, setDraftStatus] = useState<ColumnKey>(
    (task.status as ColumnKey) || columnStatus
  );
  const [draftDueDate, setDraftDueDate] = useState(
    task.due_date ? task.due_date.slice(0, 10) : ""
  );

  const handleSave = () => {
    onUpdateTask(task.id, {
      title: draftTitle,
      description: draftDescription,
      status: draftStatus,
      due_date: draftDueDate || null,
    });
    setIsEditing(false);
  };

  const handleCancel = () => {
    setDraftTitle(task.title);
    setDraftDescription(task.description ?? "");
    setDraftStatus((task.status as ColumnKey) || columnStatus);
    setDraftDueDate(task.due_date ? task.due_date.slice(0, 10) : "");
    setIsEditing(false);
  };

  if (isEditing) {
    return (
      <div className="kanban-card kanban-card--editing">
        <input
          className="kanban-card__title-input"
          value={draftTitle}
          onChange={e => setDraftTitle(e.target.value)}
          placeholder="Task title"
        />

        <textarea
          className="kanban-card__description-input"
          value={draftDescription}
          onChange={e => setDraftDescription(e.target.value)}
          placeholder="Description"
          rows={3}
        />

        <div className="kanban-card__meta">
          <div className="kanban-card__field">
            <label>Status</label>
            <select
              value={draftStatus}
              onChange={e => setDraftStatus(e.target.value as ColumnKey)}
            >
              <option value="todo">To Do</option>
              <option value="in_progress">In Progress</option>
              <option value="done">Done</option>
            </select>
          </div>

          <div className="kanban-card__field">
            <label>Due date</label>
            <input
              type="date"
              value={draftDueDate}
              onChange={e => setDraftDueDate(e.target.value)}
            />
          </div>
        </div>

        <div className="kanban-card__actions">
          <button type="button" onClick={handleCancel}>
            Cancel
          </button>
          <button type="button" onClick={handleSave}>
            Save
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="kanban-card"
      onClick={() => setIsEditing(true)}
      role="button"
      tabIndex={0}
      onKeyDown={e => {
        if (e.key === "Enter" || e.key === " ") {
          setIsEditing(true);
        }
      }}
    >
      <div className="kanban-card__title">{task.title}</div>

      {task.description && (
        <div className="kanban-card__description">
          {task.description.length > 120
            ? task.description.slice(0, 120) + "…"
            : task.description}
        </div>
      )}

      <div className="kanban-card__footer">
        {task.due_date && (
          <span className="kanban-card__badge">
            Due {task.due_date.slice(0, 10)}
          </span>
        )}
        <span className={`kanban-card__status kanban-card__status--${task.status}`}>
          {task.status === "todo"
            ? "To Do"
            : task.status === "in_progress"
            ? "In Progress"
            : "Done"}
        </span>
      </div>
    </div>
  );
}
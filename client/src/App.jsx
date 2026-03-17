import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";
import {
  addDoc,
  collection,
  doc,
  onSnapshot,
  orderBy,
  query,
  serverTimestamp,
  updateDoc
} from "firebase/firestore";
import { db } from "./firebase";

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) return crypto.randomUUID();
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

const TEMPLATE_TEXT = {
  standup: `# Daily Standup

## Yesterday
- 

## Today
- 

## Blockers
- 
`,
  planning: `# Sprint Planning

## Goals
- 

## Scope
- 

## Risks
- 
`,
  retro: `# Sprint Retrospective

## What Went Well
- 

## What Didn't Go Well
- 

## Action Items
- 
`
};

export default function App() {
  const [noteId, setNoteId] = useState("team-standup");
  const [activeNoteId, setActiveNoteId] = useState("");
  const [author, setAuthor] = useState("Student");
  const [status, setStatus] = useState("idle");
  const [persistenceMode, setPersistenceMode] = useState(db ? "firebase" : "memory");
  const [comments, setComments] = useState([]);
  const [versions, setVersions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [selectedRange, setSelectedRange] = useState(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("Student");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskFilter, setTaskFilter] = useState("all");

  const textareaRef = useRef(null);
  const ydocRef = useRef(null);
  const ytextRef = useRef(null);
  const applyingRemoteRef = useRef(false);

  const roomName = useMemo(() => `note:${activeNoteId}`, [activeNoteId]);
  const myOpenTasks = useMemo(
    () =>
      tasks.filter(
        (t) => t.assignee?.trim().toLowerCase() === author.trim().toLowerCase() && t.status !== "done"
      ),
    [tasks, author]
  );
  const visibleTasks = useMemo(() => {
    if (taskFilter === "open") return tasks.filter((t) => t.status !== "done");
    if (taskFilter === "done") return tasks.filter((t) => t.status === "done");
    return tasks;
  }, [tasks, taskFilter]);

  useEffect(() => {
    setTaskAssignee(author);
  }, [author]);

  useEffect(() => {
    if (!activeNoteId) {
      setStatus("idle");
      return undefined;
    }

    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    const ytext = ydoc.getText("content");
    ytextRef.current = ytext;

    const provider = new WebrtcProvider(roomName, ydoc);
    provider.on("status", ({ status: nextStatus, connected }) => {
      if (typeof nextStatus === "string") {
        setStatus(nextStatus);
        return;
      }
      setStatus(connected ? "connected" : "disconnected");
    });

    const textarea = textareaRef.current;
    if (textarea) {
      textarea.value = ytext.toString();

      const handleLocalInput = () => {
        if (applyingRemoteRef.current) return;
        ydoc.transact(() => {
          ytext.delete(0, ytext.length);
          ytext.insert(0, textarea.value);
        });
      };

      const handleRemoteChange = () => {
        const next = ytext.toString();
        if (textarea.value === next) return;
        applyingRemoteRef.current = true;
        const start = textarea.selectionStart;
        const end = textarea.selectionEnd;
        textarea.value = next;
        try {
          textarea.setSelectionRange(start, end);
        } catch (_e) {
          // no-op
        }
        applyingRemoteRef.current = false;
      };

      textarea.addEventListener("input", handleLocalInput);
      ytext.observe(handleRemoteChange);

      return () => {
        textarea.removeEventListener("input", handleLocalInput);
        ytext.unobserve(handleRemoteChange);
        provider.destroy();
        ydoc.destroy();
      };
    }

    return () => {
      provider.destroy();
      ydoc.destroy();
    };
  }, [roomName, activeNoteId]);

  useEffect(() => {
    if (!activeNoteId) {
      setComments([]);
      setVersions([]);
      setTasks([]);
      return undefined;
    }

    if (!db) {
      setPersistenceMode("memory");
      return undefined;
    }

    setPersistenceMode("firebase");
    const commentsQuery = query(
      collection(db, "notes", activeNoteId, "comments"),
      orderBy("createdAt", "desc")
    );
    const versionsQuery = query(
      collection(db, "notes", activeNoteId, "versions"),
      orderBy("createdAt", "desc")
    );
    const tasksQuery = query(
      collection(db, "notes", activeNoteId, "tasks"),
      orderBy("createdAt", "desc")
    );

    const unComments = onSnapshot(commentsQuery, (snapshot) => {
      setComments(
        snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const createdAt = data.createdAt?.toDate
            ? data.createdAt.toDate().toISOString()
            : new Date().toISOString();
          return { id: docSnap.id, ...data, createdAt };
        })
      );
    });

    const unVersions = onSnapshot(versionsQuery, (snapshot) => {
      setVersions(
        snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const createdAt = data.createdAt?.toDate
            ? data.createdAt.toDate().toISOString()
            : new Date().toISOString();
          return { id: docSnap.id, ...data, createdAt };
        })
      );
    });

    const unTasks = onSnapshot(tasksQuery, (snapshot) => {
      setTasks(
        snapshot.docs.map((docSnap) => {
          const data = docSnap.data();
          const createdAt = data.createdAt?.toDate
            ? data.createdAt.toDate().toISOString()
            : new Date().toISOString();
          return { id: docSnap.id, ...data, createdAt };
        })
      );
    });

    return () => {
      unComments();
      unVersions();
      unTasks();
    };
  }, [activeNoteId]);

  function handleSelection() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (textarea.selectionStart === textarea.selectionEnd) {
      setSelectedRange(null);
      return;
    }
    setSelectedRange({ start: textarea.selectionStart, end: textarea.selectionEnd });
  }

  function joinNote(e) {
    e.preventDefault();
    if (activeNoteId) return;
    const next = noteId.trim();
    if (!next) return;
    setActiveNoteId(next);
  }

  function exitRoom() {
    setActiveNoteId("");
    setStatus("idle");
    setComments([]);
    setVersions([]);
    setTasks([]);
  }

  function applyTemplate(kind) {
    if (!activeNoteId) return;
    const text = TEMPLATE_TEXT[kind];
    if (!text) return;
    const ytext = ytextRef.current;
    if (!ytext || !ydocRef.current) return;
    ydocRef.current.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, text);
    });
  }

  async function submitComment(e) {
    e.preventDefault();
    if (!activeNoteId) return;
    const text = commentText.trim();
    if (!text) return;

    if (db) {
      await addDoc(collection(db, "notes", activeNoteId, "comments"), {
        author,
        text,
        anchor: selectedRange,
        createdAt: serverTimestamp()
      });
    } else {
      setComments((prev) => [
        { id: makeId(), author, text, anchor: selectedRange, createdAt: new Date().toISOString() },
        ...prev
      ]);
    }
    setCommentText("");
    setSelectedRange(null);
  }

  async function saveVersion() {
    if (!activeNoteId) return;
    const content = textareaRef.current?.value || "";
    const payload = {
      author,
      label: `Manual save (${new Date().toLocaleTimeString()})`,
      content,
      size: content.length
    };

    if (db) {
      await addDoc(collection(db, "notes", activeNoteId, "versions"), {
        ...payload,
        createdAt: serverTimestamp()
      });
    } else {
      setVersions((prev) => [{ id: makeId(), ...payload, createdAt: new Date().toISOString() }, ...prev]);
    }
  }

  function restoreVersion(versionId) {
    if (!activeNoteId) return;
    const version = versions.find((v) => v.id === versionId);
    if (!version) return;
    const ytext = ytextRef.current;
    if (!ytext || !ydocRef.current) return;
    ydocRef.current.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, version.content || "");
    });
  }

  async function createTask(e) {
    e.preventDefault();
    if (!activeNoteId) return;
    const title = taskTitle.trim();
    const assignee = taskAssignee.trim();
    if (!title || !assignee) return;

    const payload = {
      title,
      assignee,
      dueDate: taskDueDate || null,
      status: "open",
      createdBy: author
    };

    if (db) {
      await addDoc(collection(db, "notes", activeNoteId, "tasks"), {
        ...payload,
        createdAt: serverTimestamp()
      });
    } else {
      setTasks((prev) => [{ id: makeId(), ...payload, createdAt: new Date().toISOString() }, ...prev]);
    }

    setTaskTitle("");
    setTaskDueDate("");
    setTaskAssignee(author);
  }

  async function toggleTask(task) {
    const nextStatus = task.status === "done" ? "open" : "done";
    if (db && activeNoteId) {
      await updateDoc(doc(db, "notes", activeNoteId, "tasks", task.id), { status: nextStatus });
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, status: nextStatus } : t)));
  }

  return (
    <div className="layout">
      <header className="header">
        <h1>Meeting Notes + Action Tracker</h1>
        <p>Room: {activeNoteId || "Not joined"}</p>
        <p className={`status status-${status}`}>Connection: {status}</p>
        <p>Persistence: {persistenceMode}</p>
      </header>

      <section className="controls">
        <form onSubmit={joinNote}>
          <label>
            Meeting ID
            <input value={noteId} onChange={(e) => setNoteId(e.target.value)} />
          </label>
          <label>
            Your Name
            <input value={author} onChange={(e) => setAuthor(e.target.value)} />
          </label>
          {!activeNoteId ? (
            <button type="submit">Join Meeting</button>
          ) : (
            <button type="button" onClick={exitRoom}>
              Exit
            </button>
          )}
        </form>
      </section>

      <main className="content">
        <section className="editor-card">
          <div className="editor-toolbar">
            <h2>Live Meeting Notes</h2>
            <button onClick={saveVersion} disabled={!activeNoteId}>
              Save Snapshot
            </button>
          </div>
          <div className="template-row">
            <button type="button" disabled={!activeNoteId} onClick={() => applyTemplate("standup")}>
              Standup Template
            </button>
            <button type="button" disabled={!activeNoteId} onClick={() => applyTemplate("planning")}>
              Planning Template
            </button>
            <button type="button" disabled={!activeNoteId} onClick={() => applyTemplate("retro")}>
              Retro Template
            </button>
          </div>
          <textarea
            ref={textareaRef}
            className="editor"
            disabled={!activeNoteId}
            onMouseUp={handleSelection}
            onKeyUp={handleSelection}
            placeholder="Capture decisions, blockers, and key updates..."
          />
          <p className="hint">Use a template at meeting start, then track action items on the right panel.</p>
        </section>

        <aside className="side">
          <section className="panel">
            <h3>Action Items</h3>
            <form onSubmit={createTask} className="task-form">
              <input
                value={taskTitle}
                onChange={(e) => setTaskTitle(e.target.value)}
                disabled={!activeNoteId}
                placeholder="Task title"
              />
              <input
                value={taskAssignee}
                onChange={(e) => setTaskAssignee(e.target.value)}
                disabled={!activeNoteId}
                placeholder="Assignee"
              />
              <input
                type="date"
                value={taskDueDate}
                onChange={(e) => setTaskDueDate(e.target.value)}
                disabled={!activeNoteId}
              />
              <button type="submit" disabled={!activeNoteId}>
                Add Task
              </button>
            </form>

            <div className="task-filter">
              <label>
                Show
                <select value={taskFilter} onChange={(e) => setTaskFilter(e.target.value)}>
                  <option value="all">All</option>
                  <option value="open">Open</option>
                  <option value="done">Done</option>
                </select>
              </label>
            </div>

            <ul>
              {visibleTasks.map((task) => (
                <li key={task.id} className={task.status === "done" ? "task-done" : ""}>
                  <div>
                    <strong>{task.title}</strong>
                  </div>
                  <div className="meta">
                    {task.assignee} | {task.dueDate || "No due date"} | {task.status}
                  </div>
                  <button type="button" onClick={() => toggleTask(task)}>
                    {task.status === "done" ? "Reopen" : "Mark Done"}
                  </button>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <h3>My Open Tasks</h3>
            <ul>
              {myOpenTasks.map((task) => (
                <li key={task.id}>
                  <strong>{task.title}</strong>
                  <div className="meta">{task.dueDate || "No due date"} | {task.createdBy}</div>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <h3>Comments</h3>
            <form onSubmit={submitComment}>
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                disabled={!activeNoteId}
                placeholder="Add contextual comment"
              />
              <button type="submit" disabled={!activeNoteId}>
                Add Comment
              </button>
            </form>
            <ul>
              {comments.map((c) => (
                <li key={c.id}>
                  <strong>{c.author}</strong>: {c.text}
                  <div className="meta">
                    {c.anchor ? `Range ${c.anchor.start}-${c.anchor.end}` : "General"} |{" "}
                    {new Date(c.createdAt).toLocaleString()}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <h3>Version History</h3>
            <ul>
              {versions.map((v) => (
                <li key={v.id}>
                  <div>
                    <strong>{v.label}</strong>
                  </div>
                  <div className="meta">
                    {v.author} | {new Date(v.createdAt).toLocaleString()} | {v.size} chars
                  </div>
                  <button type="button" onClick={() => restoreVersion(v.id)}>
                    Restore
                  </button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </main>
    </div>
  );
}

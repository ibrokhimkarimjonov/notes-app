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

const TASK_STATUSES = ["open", "in_progress", "blocked", "done"];
const TASK_PRIORITIES = ["low", "medium", "high"];

function normalizeName(value) {
  return (value || "").trim().toLowerCase();
}

function extractMentions(value) {
  const text = value || "";
  const matches = text.match(/@([a-zA-Z0-9._-]+)/g) || [];
  return Array.from(new Set(matches.map((m) => m.slice(1).toLowerCase())));
}

function todayISODate() {
  return new Date().toISOString().slice(0, 10);
}

export default function App() {
  const [noteId, setNoteId] = useState("team-standup");
  const [activeNoteId, setActiveNoteId] = useState("");
  const [author, setAuthor] = useState("Student");
  const [status, setStatus] = useState("idle");
  const [persistenceMode, setPersistenceMode] = useState(db ? "firebase" : "memory");
  const [comments, setComments] = useState([]);
  const [versions, setVersions] = useState([]);
  const [tasks, setTasks] = useState([]);
  const [decisions, setDecisions] = useState([]);
  const [liveNoteText, setLiveNoteText] = useState("");
  const [commentText, setCommentText] = useState("");
  const [selectedRange, setSelectedRange] = useState(null);
  const [taskTitle, setTaskTitle] = useState("");
  const [taskAssignee, setTaskAssignee] = useState("Student");
  const [taskDueDate, setTaskDueDate] = useState("");
  const [taskPriority, setTaskPriority] = useState("medium");
  const [taskFilter, setTaskFilter] = useState("all");
  const [decisionText, setDecisionText] = useState("");
  const [decisionContext, setDecisionContext] = useState("");
  const [decisionOwner, setDecisionOwner] = useState("Student");

  const textareaRef = useRef(null);
  const ydocRef = useRef(null);
  const ytextRef = useRef(null);
  const applyingRemoteRef = useRef(false);

  const roomName = useMemo(() => `note:${activeNoteId}`, [activeNoteId]);
  const myOpenTasks = useMemo(
    () =>
      tasks.filter(
        (t) => normalizeName(t.assignee) === normalizeName(author) && t.status !== "done"
      ),
    [tasks, author]
  );
  const myMentions = useMemo(() => {
    const me = normalizeName(author);
    if (!me) return [];

    const result = [];
    for (const c of comments) {
      if (extractMentions(c.text).includes(me)) {
        result.push({ id: `c-${c.id}`, kind: "comment", text: c.text, when: c.createdAt });
      }
    }
    for (const d of decisions) {
      const decisionMentions = d.mentions || extractMentions(`${d.decision || ""} ${d.context || ""}`);
      if (decisionMentions.includes(me)) {
        result.push({ id: `d-${d.id}`, kind: "decision", text: d.decision, when: d.createdAt });
      }
    }
    if (extractMentions(liveNoteText).includes(me)) {
      result.push({
        id: "notes-mention",
        kind: "notes",
        text: "You were mentioned in live meeting notes.",
        when: new Date().toISOString()
      });
    }
    return result.slice(0, 12);
  }, [author, comments, decisions, liveNoteText]);
  const overdueTasks = useMemo(
    () =>
      tasks.filter((t) => t.dueDate && t.status !== "done" && t.dueDate < todayISODate()),
    [tasks]
  );
  const visibleTasks = useMemo(() => {
    if (taskFilter === "open") return tasks.filter((t) => t.status !== "done");
    if (taskFilter === "in_progress") return tasks.filter((t) => t.status === "in_progress");
    if (taskFilter === "blocked") return tasks.filter((t) => t.status === "blocked");
    if (taskFilter === "done") return tasks.filter((t) => t.status === "done");
    return tasks;
  }, [tasks, taskFilter]);

  useEffect(() => {
    setTaskAssignee(author);
    setDecisionOwner(author);
  }, [author]);

  useEffect(() => {
    if (!activeNoteId) {
      setStatus("idle");
      setLiveNoteText("");
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
      setLiveNoteText(textarea.value);

      const handleLocalInput = () => {
        if (applyingRemoteRef.current) return;
        setLiveNoteText(textarea.value);
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
        setLiveNoteText(next);
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
      setDecisions([]);
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
    const decisionsQuery = query(
      collection(db, "notes", activeNoteId, "decisions"),
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
    const unDecisions = onSnapshot(decisionsQuery, (snapshot) => {
      setDecisions(
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
      unDecisions();
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
    setDecisions([]);
    setLiveNoteText("");
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
      priority: taskPriority,
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
    setTaskPriority("medium");
    setTaskAssignee(author);
  }

  async function updateTask(task, patch) {
    if (db && activeNoteId) {
      await updateDoc(doc(db, "notes", activeNoteId, "tasks", task.id), patch);
      return;
    }
    setTasks((prev) => prev.map((t) => (t.id === task.id ? { ...t, ...patch } : t)));
  }

  async function createDecision(e) {
    e.preventDefault();
    if (!activeNoteId) return;
    const decision = decisionText.trim();
    const context = decisionContext.trim();
    const owner = decisionOwner.trim() || author;
    if (!decision) return;

    const payload = {
      decision,
      context,
      owner,
      mentions: extractMentions(`${decision} ${context}`),
      createdBy: author
    };

    if (db) {
      await addDoc(collection(db, "notes", activeNoteId, "decisions"), {
        ...payload,
        createdAt: serverTimestamp()
      });
    } else {
      setDecisions((prev) => [{ id: makeId(), ...payload, createdAt: new Date().toISOString() }, ...prev]);
    }

    setDecisionText("");
    setDecisionContext("");
    setDecisionOwner(author);
  }

  function exportSummary() {
    const room = activeNoteId || "meeting";
    const openTasks = tasks.filter((t) => t.status !== "done");
    const markdown = `# Meeting Summary: ${room}

Generated: ${new Date().toLocaleString()}

## Notes

${liveNoteText || "_No notes_"}

## Decisions
${decisions.length ? decisions.map((d) => `- ${d.decision} (Owner: ${d.owner || "Unassigned"})`).join("\n") : "- None"}

## Open Tasks
${openTasks.length ? openTasks.map((t) => `- [ ] ${t.title} | ${t.assignee} | ${t.status} | ${t.priority}${t.dueDate ? ` | due ${t.dueDate}` : ""}`).join("\n") : "- None"}

## Overdue Tasks
${overdueTasks.length ? overdueTasks.map((t) => `- ${t.title} (${t.assignee}) due ${t.dueDate}`).join("\n") : "- None"}
`;

    const blob = new Blob([markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `${room}-summary.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="layout">
      <header className="header">
        <h1>Meeting Notes + Action Tracker</h1>
        <p>Room: {activeNoteId || "Not joined"}</p>
        <p className={`status status-${status}`}>Connection: {status}</p>
        <p>Persistence: {persistenceMode}</p>
        <button type="button" disabled={!activeNoteId} onClick={exportSummary}>
          Export Summary (.md)
        </button>
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
              <label>
                Priority
                <select
                  value={taskPriority}
                  onChange={(e) => setTaskPriority(e.target.value)}
                  disabled={!activeNoteId}
                >
                  {TASK_PRIORITIES.map((p) => (
                    <option key={p} value={p}>
                      {p}
                    </option>
                  ))}
                </select>
              </label>
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
                  <option value="in_progress">In Progress</option>
                  <option value="blocked">Blocked</option>
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
                    {task.assignee} | {task.dueDate || "No due date"} | {task.status} | {task.priority}
                  </div>
                  <div className="task-actions">
                    <select
                      value={task.status}
                      onChange={(e) => updateTask(task, { status: e.target.value })}
                    >
                      {TASK_STATUSES.map((statusOption) => (
                        <option key={statusOption} value={statusOption}>
                          {statusOption}
                        </option>
                      ))}
                    </select>
                    <select
                      value={task.priority || "medium"}
                      onChange={(e) => updateTask(task, { priority: e.target.value })}
                    >
                      {TASK_PRIORITIES.map((priorityOption) => (
                        <option key={priorityOption} value={priorityOption}>
                          {priorityOption}
                        </option>
                      ))}
                    </select>
                    {task.status !== "done" ? (
                      <button type="button" onClick={() => updateTask(task, { status: "done" })}>
                        Mark Done
                      </button>
                    ) : (
                      <button type="button" onClick={() => updateTask(task, { status: "open" })}>
                        Reopen
                      </button>
                    )}
                  </div>
                </li>
              ))}
            </ul>
          </section>

          <section className="panel">
            <h3>Decision Log</h3>
            <form onSubmit={createDecision} className="task-form">
              <input
                value={decisionText}
                onChange={(e) => setDecisionText(e.target.value)}
                disabled={!activeNoteId}
                placeholder="Decision (required)"
              />
              <textarea
                value={decisionContext}
                onChange={(e) => setDecisionContext(e.target.value)}
                disabled={!activeNoteId}
                placeholder="Context / rationale"
              />
              <input
                value={decisionOwner}
                onChange={(e) => setDecisionOwner(e.target.value)}
                disabled={!activeNoteId}
                placeholder="Owner"
              />
              <button type="submit" disabled={!activeNoteId}>
                Add Decision
              </button>
            </form>
            <ul>
              {decisions.map((d) => (
                <li key={d.id}>
                  <strong>{d.decision}</strong>
                  <div className="meta">
                    Owner: {d.owner || "Unassigned"} | {new Date(d.createdAt).toLocaleString()}
                  </div>
                  {d.context ? <div>{d.context}</div> : null}
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
            <h3>Alerts</h3>
            <p className="meta">Overdue tasks: {overdueTasks.length}</p>
            <ul>
              {overdueTasks.map((task) => (
                <li key={`overdue-${task.id}`}>
                  <strong>Overdue:</strong> {task.title}
                  <div className="meta">
                    {task.assignee} | due {task.dueDate}
                  </div>
                </li>
              ))}
              {myMentions.map((mention) => (
                <li key={mention.id}>
                  <strong>Mention in {mention.kind}:</strong> {mention.text}
                  <div className="meta">{new Date(mention.when).toLocaleString()}</div>
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

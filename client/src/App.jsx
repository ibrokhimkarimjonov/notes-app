import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { WebsocketProvider } from "y-websocket";

const API_BASE = import.meta.env.VITE_API_BASE || "http://localhost:4000";
const WS_BASE = import.meta.env.VITE_WS_BASE || "ws://localhost:4000";

export default function App() {
  const [noteId, setNoteId] = useState("demo-note");
  const [activeNoteId, setActiveNoteId] = useState("demo-note");
  const [author, setAuthor] = useState("Student");
  const [status, setStatus] = useState("connecting");
  const [comments, setComments] = useState([]);
  const [versions, setVersions] = useState([]);
  const [commentText, setCommentText] = useState("");
  const [selectedRange, setSelectedRange] = useState(null);

  const textareaRef = useRef(null);
  const ydocRef = useRef(null);
  const ytextRef = useRef(null);
  const applyingRemoteRef = useRef(false);

  const roomName = useMemo(() => `note:${activeNoteId}`, [activeNoteId]);

  async function loadComments() {
    const res = await fetch(`${API_BASE}/api/notes/${activeNoteId}/comments`);
    const data = await res.json();
    setComments(data);
  }

  async function loadVersions() {
    const res = await fetch(`${API_BASE}/api/notes/${activeNoteId}/versions`);
    const data = await res.json();
    setVersions(data);
  }

  useEffect(() => {
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;
    const ytext = ydoc.getText("content");
    ytextRef.current = ytext;

    const provider = new WebsocketProvider(WS_BASE, roomName, ydoc);
    provider.on("status", (event) => setStatus(event.status));

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
        const nextValue = ytext.toString();
        if (textarea.value !== nextValue) {
          applyingRemoteRef.current = true;
          const start = textarea.selectionStart;
          const end = textarea.selectionEnd;
          textarea.value = nextValue;
          try {
            textarea.setSelectionRange(start, end);
          } catch (_e) {
            // Ignore selection restore issues for very short content.
          }
          applyingRemoteRef.current = false;
        }
      };

      textarea.addEventListener("input", handleLocalInput);
      ytext.observe(handleRemoteChange);

      loadComments().catch(console.error);
      loadVersions().catch(console.error);

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
  }, [roomName]);

  function handleSelection() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    if (textarea.selectionStart === textarea.selectionEnd) {
      setSelectedRange(null);
      return;
    }
    setSelectedRange({
      start: textarea.selectionStart,
      end: textarea.selectionEnd
    });
  }

  async function submitComment(e) {
    e.preventDefault();
    if (!commentText.trim()) return;

    await fetch(`${API_BASE}/api/notes/${activeNoteId}/comments`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        author,
        text: commentText.trim(),
        anchor: selectedRange
      })
    });
    setCommentText("");
    setSelectedRange(null);
    await loadComments();
  }

  async function saveVersion() {
    const content = textareaRef.current?.value || "";
    await fetch(`${API_BASE}/api/notes/${activeNoteId}/versions`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        author,
        content,
        label: `Manual save (${new Date().toLocaleTimeString()})`
      })
    });
    await loadVersions();
  }

  async function restoreVersion(versionId) {
    const response = await fetch(
      `${API_BASE}/api/notes/${activeNoteId}/versions/${versionId}`
    );
    if (!response.ok) return;
    const fullVersion = await response.json();

    const ytext = ytextRef.current;
    ydocRef.current.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, fullVersion.content || "");
    });

    await fetch(`${API_BASE}/api/notes/${activeNoteId}/restore/${versionId}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ author })
    });
    await loadVersions();
  }

  function joinNote(e) {
    e.preventDefault();
    const next = noteId.trim();
    if (!next) return;
    setActiveNoteId(next);
  }

  return (
    <div className="layout">
      <header className="header">
        <h1>Collaborative Notes</h1>
        <p>Room: {activeNoteId}</p>
        <p className={`status status-${status}`}>WebSocket: {status}</p>
      </header>

      <section className="controls">
        <form onSubmit={joinNote}>
          <label>
            Note ID
            <input value={noteId} onChange={(e) => setNoteId(e.target.value)} />
          </label>
          <label>
            Your Name
            <input value={author} onChange={(e) => setAuthor(e.target.value)} />
          </label>
          <button type="submit">Join Room</button>
        </form>
      </section>

      <main className="content">
        <section className="editor-card">
          <div className="editor-toolbar">
            <h2>Editor</h2>
            <button onClick={saveVersion}>Save Version</button>
          </div>
          <textarea
            ref={textareaRef}
            className="editor"
            onMouseUp={handleSelection}
            onKeyUp={handleSelection}
            placeholder="Start typing with another tab open..."
          />
          <p className="hint">
            Select text to anchor comments. Same Note ID in multiple tabs will sync in real-time.
          </p>
        </section>

        <aside className="side">
          <section className="panel">
            <h3>Comments</h3>
            <form onSubmit={submitComment}>
              <textarea
                value={commentText}
                onChange={(e) => setCommentText(e.target.value)}
                placeholder="Add a comment"
              />
              <button type="submit">Add Comment</button>
            </form>
            <ul>
              {comments.map((c) => (
                <li key={c.id}>
                  <strong>{c.author}</strong>: {c.text}
                  <div className="meta">
                    {c.anchor
                      ? `Range ${c.anchor.start}-${c.anchor.end}`
                      : "General comment"}{" "}
                    | {new Date(c.createdAt).toLocaleString()}
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
                  <button onClick={() => restoreVersion(v.id)}>Restore</button>
                </li>
              ))}
            </ul>
          </section>
        </aside>
      </main>
    </div>
  );
}

import { useEffect, useMemo, useRef, useState } from "react";
import * as Y from "yjs";
import { WebrtcProvider } from "y-webrtc";

function makeId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

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
  const ycommentsRef = useRef(null);
  const yversionsRef = useRef(null);
  const applyingRemoteRef = useRef(false);

  const roomName = useMemo(() => `note:${activeNoteId}`, [activeNoteId]);

  useEffect(() => {
    const ydoc = new Y.Doc();
    ydocRef.current = ydoc;

    const ytext = ydoc.getText("content");
    const ycomments = ydoc.getArray("comments");
    const yversions = ydoc.getArray("versions");
    ytextRef.current = ytext;
    ycommentsRef.current = ycomments;
    yversionsRef.current = yversions;

    const provider = new WebrtcProvider(roomName, ydoc);
    provider.on("status", ({ status: nextStatus, connected }) => {
      if (typeof nextStatus === "string") {
        setStatus(nextStatus);
        return;
      }
      setStatus(connected ? "connected" : "disconnected");
    });

    const syncComments = () => setComments(ycomments.toArray());
    const syncVersions = () => setVersions(yversions.toArray());
    ycomments.observe(syncComments);
    yversions.observe(syncVersions);
    syncComments();
    syncVersions();

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
          // Ignore selection restore errors on short text.
        }
        applyingRemoteRef.current = false;
      };

      textarea.addEventListener("input", handleLocalInput);
      ytext.observe(handleRemoteChange);

      return () => {
        textarea.removeEventListener("input", handleLocalInput);
        ytext.unobserve(handleRemoteChange);
        ycomments.unobserve(syncComments);
        yversions.unobserve(syncVersions);
        provider.destroy();
        ydoc.destroy();
      };
    }

    return () => {
      ycomments.unobserve(syncComments);
      yversions.unobserve(syncVersions);
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

  function submitComment(e) {
    e.preventDefault();
    const text = commentText.trim();
    if (!text) return;

    const ycomments = ycommentsRef.current;
    ycomments.push([
      {
        id: makeId(),
        author,
        text,
        anchor: selectedRange,
        createdAt: new Date().toISOString()
      }
    ]);

    setCommentText("");
    setSelectedRange(null);
  }

  function saveVersion() {
    const yversions = yversionsRef.current;
    const content = textareaRef.current?.value || "";
    yversions.insert(0, [
      {
        id: makeId(),
        author,
        label: `Manual save (${new Date().toLocaleTimeString()})`,
        content,
        createdAt: new Date().toISOString(),
        size: content.length
      }
    ]);
  }

  function restoreVersion(versionId) {
    const version = versions.find((v) => v.id === versionId);
    if (!version) return;
    const ytext = ytextRef.current;
    ydocRef.current.transact(() => {
      ytext.delete(0, ytext.length);
      ytext.insert(0, version.content || "");
    });
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
        <p className={`status status-${status}`}>Connection: {status}</p>
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
            placeholder="Open the same Note ID in another device/tab to collaborate."
          />
          <p className="hint">
            Collaboration uses WebRTC + CRDT, so this works on static hosting like GitHub Pages.
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
                    {c.anchor ? `Range ${c.anchor.start}-${c.anchor.end}` : "General comment"} |{" "}
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

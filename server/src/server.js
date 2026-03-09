const http = require("http");
const express = require("express");
const cors = require("cors");
const { WebSocketServer } = require("ws");
const { setupWSConnection } = require("y-websocket/bin/utils");
const {
  listComments,
  addComment,
  listVersions,
  addVersion,
  getVersion
} = require("./store");

const PORT = process.env.PORT || 4000;

const app = express();
app.use(cors());
app.use(express.json({ limit: "2mb" }));

app.get("/health", (_req, res) => {
  res.json({ ok: true, service: "collab-notes-server" });
});

app.get("/api/notes/:noteId/comments", (req, res) => {
  const { noteId } = req.params;
  const comments = listComments(noteId);
  res.json(comments);
});

app.post("/api/notes/:noteId/comments", (req, res) => {
  const { noteId } = req.params;
  const { author, text, anchor } = req.body || {};
  if (!text || typeof text !== "string" || !text.trim()) {
    return res.status(400).json({ error: "Comment text is required." });
  }
  const comment = addComment(noteId, author, text.trim(), anchor);
  return res.status(201).json(comment);
});

app.get("/api/notes/:noteId/versions", (req, res) => {
  const { noteId } = req.params;
  const versions = listVersions(noteId);
  res.json(
    versions.map((v) => ({
      id: v.id,
      author: v.author,
      label: v.label,
      createdAt: v.createdAt,
      size: v.content.length
    }))
  );
});

app.get("/api/notes/:noteId/versions/:versionId", (req, res) => {
  const { noteId, versionId } = req.params;
  const version = getVersion(noteId, versionId);
  if (!version) {
    return res.status(404).json({ error: "Version not found." });
  }
  return res.json(version);
});

app.post("/api/notes/:noteId/versions", (req, res) => {
  const { noteId } = req.params;
  const { author, content, label } = req.body || {};
  if (typeof content !== "string") {
    return res.status(400).json({ error: "String content is required." });
  }
  const version = addVersion(noteId, author, content, label);
  return res.status(201).json(version);
});

app.post("/api/notes/:noteId/restore/:versionId", (req, res) => {
  const { noteId, versionId } = req.params;
  const { author } = req.body || {};
  const version = getVersion(noteId, versionId);
  if (!version) {
    return res.status(404).json({ error: "Version not found." });
  }
  const restoreSnapshot = addVersion(
    noteId,
    author || "Anonymous",
    version.content,
    `Restore: ${version.label}`
  );
  return res.json({ restoredFrom: version.id, snapshot: restoreSnapshot });
});

const server = http.createServer(app);

const wss = new WebSocketServer({ server });
wss.on("connection", (conn, req) => {
  setupWSConnection(conn, req);
});

server.listen(PORT, () => {
  console.log(`Server listening on http://localhost:${PORT}`);
});

const fs = require("fs");
const path = require("path");
const { v4: uuidv4 } = require("uuid");

const DATA_FILE = path.join(__dirname, "..", "data", "notes.json");

function ensureDataFile() {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  if (!fs.existsSync(DATA_FILE)) {
    fs.writeFileSync(DATA_FILE, JSON.stringify({ notes: {} }, null, 2), "utf8");
  }
}

function readData() {
  ensureDataFile();
  const raw = fs.readFileSync(DATA_FILE, "utf8");
  return JSON.parse(raw);
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
}

function ensureNote(data, noteId) {
  if (!data.notes[noteId]) {
    data.notes[noteId] = { comments: [], versions: [] };
  }
  return data.notes[noteId];
}

function listComments(noteId) {
  const data = readData();
  const note = ensureNote(data, noteId);
  return note.comments;
}

function addComment(noteId, author, text, anchor) {
  const data = readData();
  const note = ensureNote(data, noteId);
  const comment = {
    id: uuidv4(),
    author: author || "Anonymous",
    text,
    anchor: anchor || null,
    createdAt: new Date().toISOString()
  };
  note.comments.push(comment);
  writeData(data);
  return comment;
}

function listVersions(noteId) {
  const data = readData();
  const note = ensureNote(data, noteId);
  return note.versions;
}

function addVersion(noteId, author, content, label) {
  const data = readData();
  const note = ensureNote(data, noteId);
  const version = {
    id: uuidv4(),
    author: author || "Anonymous",
    label: label || "Snapshot",
    content,
    createdAt: new Date().toISOString()
  };
  note.versions.unshift(version);
  writeData(data);
  return version;
}

function getVersion(noteId, versionId) {
  const versions = listVersions(noteId);
  return versions.find((v) => v.id === versionId) || null;
}

module.exports = {
  listComments,
  addComment,
  listVersions,
  addVersion,
  getVersion
};

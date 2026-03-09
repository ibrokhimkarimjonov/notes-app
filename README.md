# Real-Time Collaborative Notes App

Google Docs-style collaborative notes with:
- Real-time editing via WebSockets + Yjs CRDT
- Inline comments (stored via REST API)
- Version history snapshots + restore

## Tech Stack
- Frontend: React + Vite + Yjs + y-websocket
- Backend: Node.js + Express + ws + y-websocket

## Project Structure
- `server/`: WebSocket CRDT server + comments/version APIs
- `client/`: React app with collaborative editor UI

## 1) Start Backend

```bash
cd /Users/ibrokhimkarimjonov/Desktop/study-bot/collab-notes/server
npm install
npm run dev
```

Backend runs on `http://localhost:4000`.

## 2) Start Frontend

Open a second terminal:

```bash
cd /Users/ibrokhimkarimjonov/Desktop/study-bot/collab-notes/client
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

## 3) Use the App

1. Enter the same `Note ID` in two browser tabs.
2. Type in one tab and watch real-time sync in the other tab.
3. Add comments in the comments panel.
4. Click `Save Version` to create a snapshot.
5. Restore any older snapshot from version history.

## 4) Publish Free (Render)

1. Push `/Users/ibrokhimkarimjonov/Desktop/study-bot/collab-notes` to a GitHub repo.
2. Go to Render dashboard and create a new **Blueprint** service from that repo.
3. Render will detect [render.yaml](/Users/ibrokhimkarimjonov/Desktop/study-bot/collab-notes/render.yaml) and create:
   - `collab-notes-api` (Node web service)
   - `collab-notes-web` (static frontend)
4. After first deploy, open API service URL. It should return:
   - `/health` => `{ "ok": true, ... }`
5. In static site settings, update env vars to match your real API URL:
   - `VITE_API_BASE=https://<your-api>.onrender.com`
   - `VITE_WS_BASE=wss://<your-api>.onrender.com`
6. Redeploy `collab-notes-web`.
7. Open static site URL on your phone and test with same `Note ID` in two devices/tabs.

Notes:
- Render free instances can sleep when idle and need a short wake-up time.
- If your Render service names differ from defaults, update values in [render.yaml](/Users/ibrokhimkarimjonov/Desktop/study-bot/collab-notes/render.yaml).

## API Endpoints

- `GET /health`
- `GET /api/notes/:noteId/comments`
- `POST /api/notes/:noteId/comments`
- `GET /api/notes/:noteId/versions`
- `POST /api/notes/:noteId/versions`
- `POST /api/notes/:noteId/restore/:versionId`



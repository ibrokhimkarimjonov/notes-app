# Team Meeting Notes + Action Tracker

Real-time meeting workspace with:
- Live collaborative meeting notes (WebRTC + Yjs CRDT)
- Action items with assignee, due date, status, and priority
- "My Open Tasks" view per participant
- Decision log with owner + rationale
- Mentions/overdue alerts and markdown summary export
- Inline comments + version snapshots with restore

## Tech Stack
- Frontend: React + Vite + Yjs + y-webrtc
- Persistence: Firebase Firestore
- Hosting: GitHub Pages (free)

## Project Structure
- `client/`: React app with collaborative editor UI
- `server/`: legacy websocket/backend version (optional)

## 1) Start Frontend (Local)

```bash
cd /Users/ibrokhimkarimjonov/Desktop/study-bot/collab-notes/client
npm install
npm run dev
```

Frontend runs on `http://localhost:5173`.

## 2) Use the App

1. Enter the same `Meeting ID` on two devices/tabs and join.
2. Pick a template (`Standup`, `Planning`, or `Retro`).
3. Capture decisions and discussion in live notes.
4. Add action items with assignee + due date.
5. Use `My Open Tasks` to track your pending items.
6. Add decisions (owner + context) to keep rationale visible.
7. Check `Alerts` for mentions and overdue tasks.
8. Save/restore snapshots from version history and export summary markdown.

## 3) Configure Firebase

1. Create a Firebase project and enable Firestore.
2. Create a web app in Firebase and copy config values.
3. For local dev, create `client/.env` from [client/.env.example](/Users/ibrokhimkarimjonov/Desktop/study-bot/collab-notes/client/.env.example).
4. In GitHub repo, go to `Settings` -> `Secrets and variables` -> `Actions` -> `Variables`.
5. Add these repository variables:
   - `VITE_FIREBASE_API_KEY`
   - `VITE_FIREBASE_AUTH_DOMAIN`
   - `VITE_FIREBASE_PROJECT_ID`
   - `VITE_FIREBASE_STORAGE_BUCKET`
   - `VITE_FIREBASE_MESSAGING_SENDER_ID`
   - `VITE_FIREBASE_APP_ID`
   - Optional for your current repo: app already includes your provided Firebase config as defaults.

Recommended Firestore rules for this project:

```txt
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /notes/{noteId}/{document=**} {
      allow read, write: if true;
    }
  }
}
```

## 4) Publish Free (GitHub Pages)

1. Push code to `main` branch in your repo.
2. In GitHub repo: `Settings` -> `Pages` -> `Source: GitHub Actions`.
3. Workflow [deploy-pages.yml](/Users/ibrokhimkarimjonov/Desktop/study-bot/collab-notes/.github/workflows/deploy-pages.yml) runs automatically on push.
4. After it succeeds, your app URL is:
   - `https://ibrokhimkarimjonov.github.io/notes-app/`
5. Open that URL on phone and laptop, use same `Note ID`, and test collaboration.

## Resume-Friendly Talking Points

- Built a real-time collaborative meeting workspace using CRDTs (Yjs) over WebRTC.
- Implemented persistent action-item tracking (assignee, due date, status, priority) with Firebase Firestore.
- Added decision logs, mention/overdue alerts, and exportable meeting summaries.

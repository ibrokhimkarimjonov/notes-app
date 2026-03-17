# Real-Time Collaborative Notes App

Google Docs-style collaborative notes with:
- Real-time editing via WebRTC + Yjs CRDT
- Inline comments (shared via CRDT)
- Version history snapshots + restore

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

1. Enter the same `Note ID` in two browser tabs/devices.
2. Type in one tab and watch real-time sync in the other tab.
3. Add comments in the comments panel.
4. Click `Save Version` to create a persistent snapshot.
5. Restore any older snapshot from version history.

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

- Built collaborative editing with CRDT conflict resolution (Yjs).
- Designed note-scoped comments and version history synced through CRDT.
- Implemented persistent version history/comments with Firebase Firestore.

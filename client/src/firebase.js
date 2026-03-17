import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore";

const defaultFirebaseConfig = {
  apiKey: "AIzaSyASzox90BBZRHJVA-n1lFW2iMUokrHGTbo",
  authDomain: "notes-app-ccbca.firebaseapp.com",
  projectId: "notes-app-ccbca",
  storageBucket: "notes-app-ccbca.firebasestorage.app",
  messagingSenderId: "735069390575",
  appId: "1:735069390575:web:f05a3ba08479deb3a63d1a"
};

const firebaseConfig = {
  apiKey: import.meta.env.VITE_FIREBASE_API_KEY || defaultFirebaseConfig.apiKey,
  authDomain: import.meta.env.VITE_FIREBASE_AUTH_DOMAIN || defaultFirebaseConfig.authDomain,
  projectId: import.meta.env.VITE_FIREBASE_PROJECT_ID || defaultFirebaseConfig.projectId,
  storageBucket: import.meta.env.VITE_FIREBASE_STORAGE_BUCKET || defaultFirebaseConfig.storageBucket,
  messagingSenderId:
    import.meta.env.VITE_FIREBASE_MESSAGING_SENDER_ID || defaultFirebaseConfig.messagingSenderId,
  appId: import.meta.env.VITE_FIREBASE_APP_ID || defaultFirebaseConfig.appId
};

const hasFirebaseConfig = Object.values(firebaseConfig).every(Boolean);

let db = null;
if (hasFirebaseConfig) {
  const app = initializeApp(firebaseConfig);
  db = getFirestore(app);
} else {
  console.warn("Firebase config missing. Running without persistent storage.");
}

export { db };

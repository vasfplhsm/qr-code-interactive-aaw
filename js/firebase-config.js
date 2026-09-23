// ============================================================
// FIREBASE CONNECTION SETTINGS
//
// Replace every value below with the config object from YOUR
// Firebase project:
//   Firebase Console → Project settings → General →
//   "Your apps" → the web app → SDK setup and configuration
//
// This is safe to be public — a Firebase web config is not a
// secret key. Your data is protected separately by the Realtime
// Database Security Rules (see firebase-rules.json).
//
// Full step-by-step instructions are in README.md.
const firebaseConfig = {
  apiKey: "AIzaSyAxcywf5Ql9szynQaDfyRwy8OxhZZNdDsY",
  authDomain: "qr-code-interactive-aaw.firebaseapp.com",
  databaseURL: "https://qr-code-interactive-aaw-default-rtdb.asia-southeast1.firebasedatabase.app",
  projectId: "qr-code-interactive-aaw",
  storageBucket: "qr-code-interactive-aaw.firebasestorage.app",
  messagingSenderId: "899801770146",
  appId: "1:899801770146:web:d12c15216562e6adf70ffb",
  measurementId: "G-G3XHFXGL5P"
};

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

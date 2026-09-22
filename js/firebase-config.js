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
     apiKey: "YOUR_API_KEY",
     authDomain: "YOUR_PROJECT_ID.firebaseapp.com",
     databaseURL: "https://YOUR_PROJECT_ID-default-rtdb.asia-southeast1.firebasedatabase.app",
     projectId: "YOUR_PROJECT_ID",
     storageBucket: "YOUR_PROJECT_ID.appspot.com",
     messagingSenderId: "YOUR_SENDER_ID",
     appId: "YOUR_APP_ID"
   };

firebase.initializeApp(firebaseConfig);
const db = firebase.database();

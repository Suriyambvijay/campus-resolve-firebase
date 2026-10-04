// ============================================================
// Campus Resolve - Firebase client configuration
// Replace these values with YOUR Firebase project's config,
// found at: Firebase Console -> Project Settings -> General ->
// "Your apps" -> Web app -> SDK setup and configuration.
// ============================================================
const firebaseConfig = {
  apiKey: "AIzaSyAcalB04-La7MwTrcmfnyd8rSHFEtrlycE",
  authDomain: "campus-resolve-4dbb9.firebaseapp.com",
  projectId: "campus-resolve-4dbb9",
  storageBucket: "campus-resolve-4dbb9.firebasestorage.app",
  messagingSenderId: "600771356406",
  appId: "1:600771356406:web:af871c193be3e45e51aed7",
  measurementId: "G-3CNY1DKC3D"
};

firebase.initializeApp(firebaseConfig);
const fbAuth = firebase.auth();

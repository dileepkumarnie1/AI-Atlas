// Firebase initialization and exports for auth and Firestore
import { initializeApp } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";


const firebaseConfig = {
  apiKey: "AIzaSyDKpMZ_ik9LdcJxg3tKre-MAApV0BpI0Wo",
  authDomain: "ai-domain-atlas.firebaseapp.com",
  projectId: "ai-domain-atlas",
  storageBucket: "ai-domain-atlas.firebasestorage.app",
  messagingSenderId: "656158450742",
  appId: "1:656158450742:web:928b64678b22c12fe22497",
  measurementId: "G-ES11CRRDP6"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);

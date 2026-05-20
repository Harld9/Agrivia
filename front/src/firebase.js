// src/firebase.js
import { initializeApp } from "firebase/app";
import { getFirestore } from "firebase/firestore"; // <-- Important : On importe Firestore

// Ta configuration (J'ai repris tes clés exactes)
const firebaseConfig = {
    apiKey: "AIzaSyCXGsec6yRLj5NOuWrZGglmYOaIyBBem5U",
    authDomain: "agrivia-mvp.firebaseapp.com",
    projectId: "agrivia-mvp",
    storageBucket: "agrivia-mvp.firebasestorage.app",
    messagingSenderId: "502839455726",
    appId: "1:502839455726:web:1e182e51782aaf4f3fa8ff",
    measurementId: "G-VJLT066ER0"
};

// 1. Initialiser Firebase
const app = initializeApp(firebaseConfig);

// 2. Initialiser et EXPORTER la base de données pour l'utiliser ailleurs
export const db = getFirestore(app);
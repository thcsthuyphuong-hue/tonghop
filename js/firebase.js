// Firebase gateway: mọi kết nối Firebase/Auth/Firestore của app đi qua file này.
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import {
    getAuth, signInAnonymously, onAuthStateChanged, setPersistence,
    browserSessionPersistence, signInWithEmailAndPassword, signOut
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
    getFirestore, collection, addDoc, getDocs, doc, deleteDoc,
    setDoc, getDoc
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

// TODO(beta): thay toàn bộ object này bằng config của Firebase BETA.
const firebaseConfig = {
    apiKey: "AIzaSyDg4Q6rsrvPhY31oCpL4DAAjTKlgjJN1c0",
    authDomain: "khtn9-5c1f4.firebaseapp.com",
    projectId: "khtn9-5c1f4",
    storageBucket: "khtn9-5c1f4.firebasestorage.app",
    messagingSenderId: "498407772914",
    appId: "1:498407772914:web:8ec0ed711675a96a42366b",
    measurementId: "G-GPZSP2DR92"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const appId_fixed = 'kham-pha-vat-ly-9';
const collectionName = 'quiz_results';
const collectionReports = 'error_reports';
const collectionStudents = 'students_list';
const collectionBanks = 'question_banks';

const basePath = () => ['artifacts', appId_fixed, 'public', 'data'];
const collectionRef = name => collection(db, ...basePath(), name);
const documentRef = (name, id) => doc(db, ...basePath(), name, id);
const configRef = id => doc(db, ...basePath(), 'config', id);

// ---------- Auth gateway ----------
const signInAsGuest = () => signInAnonymously(auth);
const subscribeAuthState = callback => onAuthStateChanged(auth, callback);
const signInAdmin = async (email, password) => {
    await setPersistence(auth, browserSessionPersistence);
    return signInWithEmailAndPassword(auth, email, password);
};
const signOutFirebase = () => signOut(auth);
const getCurrentUser = () => auth.currentUser;

// ---------- Firestore gateway ----------
const getStudents = () => getDocs(collectionRef(collectionStudents));
const getQuestionBanks = () => getDocs(collectionRef(collectionBanks));
const getResults = () => getDocs(collectionRef(collectionName));
const getReports = () => getDocs(collectionRef(collectionReports));
const getTimerConfig = () => getDoc(configRef('timer_settings'));

const addResult = data => addDoc(collectionRef(collectionName), data);
const addReport = data => addDoc(collectionRef(collectionReports), data);
const addStudent = data => addDoc(collectionRef(collectionStudents), data);

const deleteResult = id => deleteDoc(documentRef(collectionName, id));
const deleteStudent = id => deleteDoc(documentRef(collectionStudents, id));
const deleteQuestionBank = id => deleteDoc(documentRef(collectionBanks, id));
const deleteReport = id => deleteDoc(documentRef(collectionReports, id));

const saveQuestionBank = (id, data) => setDoc(documentRef(collectionBanks, id), data, { merge: false });
const saveTimerConfig = data => setDoc(configRef('timer_settings'), data, { merge: true });

const clearStudents = async () => {
    const snap = await getStudents();
    await Promise.all(snap.docs.map(d => deleteStudent(d.id)));
};

const clearQuestionBanks = async () => {
    const snap = await getQuestionBanks();
    await Promise.all(snap.docs.map(d => deleteQuestionBank(d.id)));
};

export {
    appId_fixed, collectionName, collectionReports, collectionStudents, collectionBanks,
    signInAsGuest, subscribeAuthState, signInAdmin, signOutFirebase, getCurrentUser,
    getStudents, getQuestionBanks, getResults, getReports, getTimerConfig,
    addResult, addReport, addStudent,
    deleteResult, deleteStudent, deleteQuestionBank, deleteReport,
    saveQuestionBank, saveTimerConfig, clearStudents, clearQuestionBanks
};

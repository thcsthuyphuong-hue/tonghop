
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, setPersistence, browserSessionPersistence, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, setDoc, getDoc, writeBatch, updateDoc, onSnapshot, serverTimestamp, Timestamp, runTransaction } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
    apiKey: "AIzaSyCH-47CWu8DWwTmAT1QH3ua89LghT9TNIA",
    authDomain: "khtn-10.firebaseapp.com",
    projectId: "khtn-10",
    storageBucket: "khtn-10.firebasestorage.app",
    messagingSenderId: "259562457690",
    appId: "1:259562457690:web:414909df433ad291716663",
    measurementId: "G-XH9S9LTP65"
};

const app = initializeApp(firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

const examRoomApp = initializeApp(firebaseConfig, "host-client-exam-room");
const examRoomAuth = getAuth(examRoomApp);
const examRoomDb = getFirestore(examRoomApp);



function getFirebaseErrorMessage(error, appCode, fallback) {
    const code = error?.code || "unknown";
    const messages = {
        "permission-denied": "Firestore từ chối quyền truy cập. Kiểm tra Rules và phiên đăng nhập.",
        "unauthenticated": "Phiên đăng nhập không hợp lệ hoặc đã hết hạn.",
        "unavailable": "Firebase tạm thời không khả dụng. Kiểm tra kết nối rồi thử lại.",
        "resource-exhausted": "Đã vượt giới hạn tài nguyên hoặc hạn mức.",
        "invalid-argument": "Dữ liệu gửi lên không hợp lệ.",
        "deadline-exceeded": "Yêu cầu hết thời gian chờ.",
        "auth/invalid-credential": "Email hoặc mật khẩu không hợp lệ.",
        "auth/invalid-login-credentials": "Email hoặc mật khẩu không hợp lệ.",
        "auth/wrong-password": "Email hoặc mật khẩu không hợp lệ.",
        "auth/user-not-found": "Không tìm thấy tài khoản.",
        "auth/user-disabled": "Tài khoản đã bị vô hiệu hóa.",
        "auth/too-many-requests": "Có quá nhiều lần thử. Hãy chờ rồi thử lại.",
        "auth/network-request-failed": "Không thể kết nối dịch vụ xác thực. Kiểm tra mạng."
    };
    const detail = messages[code] || fallback || "Đã xảy ra lỗi không xác định.";
    console.error("[" + appCode + "] Firebase error", { firebaseCode: code, message: error?.message || "", error });
    return "[" + appCode + "] " + detail + " (Firebase: " + code + ")";
}

const appId_fixed = 'kham-pha-vat-ly-9';
const collectionName = 'quiz_results';
const collectionReports = 'error_reports';
const collectionPublicResults = 'public_quiz_results';
const collectionStudents = 'students_list';
const collectionBanks = 'question_banks';

let currentUser = null, quizStartTime = 0, isQuizRunning = false, mode = '', currentIdx = 0, userAnswers = {}, timeLeft = 0, timerInt, currentExam = [];
let pendingAdminTab = null;
let arExamData = [], arUserAnswers = {};
let globalStudentList = [];
let importedStudentsCache = [];
let importedQuestionsCache = {};
let pendingQuestionImport = null;

let practiceTimeLimit = 2700;
let testTimeLimit = 2700;
let maxHintsAllowed = 3;
let hintsUsed = 0;
let unlockedHints = [];


let canCheckCheat = false;
let isProcessingCheat = false;
let wishTimeoutId = null;
let reportImageBase64 = "";
let hasSaved = false;
let pendingAuthAction = null;
let currentDeleteId = null;

const audioPing = new Audio('https://www.soundjay.com/buttons/sounds/button-16.mp3');
const audioFinish = new Audio('https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3');

const closeOverlay = (modal) => {
    modal.style.display = 'none';
    if (modal.id === 'question-import-preview-modal') pendingQuestionImport = null;
    if (modal.id === 'delete-auth-modal') { pendingAuthAction = null; currentDeleteId = null; importedStudentsCache = []; importedQuestionsCache = {}; document.getElementById('delete-pw').value = ''; document.getElementById('delete-email').value = ''; document.getElementById('file-import-students').value = ''; document.getElementById('file-import-questions').value = '';}
    if (modal.id === 'admin-auth-modal') { document.getElementById('admin-email').value = ''; document.getElementById('admin-pw').value = ''; pendingAdminTab = null; }
};

document.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay').forEach(modal => {
            if (modal.style.display === 'flex' || modal.style.display === 'block') { closeOverlay(modal); }
        });
    }
    if (e.key === 'Enter') {
        if (e.target.tagName.toLowerCase() === 'textarea') return;
        const adminModal = document.getElementById('admin-auth-modal');
        if (adminModal.style.display === 'flex' || adminModal.style.display === 'block') { document.getElementById('btn-auth-confirm').click(); return; }
        const deleteModal = document.getElementById('delete-auth-modal');
        if (deleteModal.style.display === 'flex' || deleteModal.style.display === 'block') { document.getElementById('btn-delete-confirm').click(); return; }
        const finishModal = document.getElementById('confirm-finish-modal');
        if (finishModal.style.display === 'flex' || finishModal.style.display === 'block') { document.getElementById('btn-modal-confirm').click(); return; }
        const reportModal = document.getElementById('report-modal');
        if (reportModal.style.display === 'flex' || reportModal.style.display === 'block') { document.getElementById('btn-report-submit').click(); return; }
    }
}, true);

document.querySelectorAll('.modal-overlay').forEach(modal => {
    modal.addEventListener('mousedown', (e) => {
        if (e.target === modal && modal.id !== 'image-viewer-modal') { closeOverlay(modal); }
    });
});

document.addEventListener('paste', function(e) {
    if (document.getElementById('report-modal').style.display === 'flex' || document.getElementById('report-modal').style.display === 'block') {
        const items = (e.clipboardData || e.originalEvent.clipboardData).items;
        for (let index in items) {
            const item = items[index];
            if (item.kind === 'file' && item.type.indexOf('image/') !== -1) {
                const blob = item.getAsFile();
                processImageFile(blob);
                showCustomAlert("✅ Đã dán ảnh thành công!");
            }
        }
    }
});

document.getElementById('topic-select').addEventListener('change', (e) => {
    const topicText = e.target.options[e.target.selectedIndex].text;
    document.getElementById('banner-topic').innerText = `Chuyên đề: ${topicText}`;
});


function autocomplete(inp, arr) {
    let currentFocus;
    inp.addEventListener("input", function(e) {
        let a, b, val = this.value;
        closeAllLists();
        if (!val) { return false;}
        currentFocus = -1;
        a = document.createElement("DIV");
        a.setAttribute("id", this.id + "autocomplete-list");
        a.setAttribute("class", "autocomplete-items");
        this.parentNode.appendChild(a);

        let count = 0;
        for (let i = 0; i < arr.length; i++) {
            const student = arr[i];
            let sName = student.name || "";
            if (sName.toLowerCase().includes(val.toLowerCase())) {
                b = document.createElement("DIV");
                let matchIdx = sName.toLowerCase().indexOf(val.toLowerCase());
                b.innerHTML = sName.substring(0, matchIdx);
                b.innerHTML += "<strong>" + sName.substring(matchIdx, matchIdx + val.length) + "</strong>";
                b.innerHTML += sName.substring(matchIdx + val.length);
                b.innerHTML += ` <span style="color:#64748b; font-size:0.8rem;">(Lớp ${student.class} - SBD ${student.sbd})</span>`;

                b.innerHTML += "<input type='hidden' value='" + sName.replace(/'/g, "&#39;") + "'>";
                b.addEventListener("click", function(e) {
                    inp.value = this.getElementsByTagName("input")[0].value;
                    document.getElementById("user_class").value = student.class || "";
                    document.getElementById("user_sbd").value = student.sbd || "";
                    document.getElementById("user_school").value = student.school || "";
                    document.getElementById("user_class").setAttribute("readonly", true);
                    document.getElementById("user_sbd").setAttribute("readonly", true);
                    document.getElementById("user_school").setAttribute("readonly", true);
                    closeAllLists();
                });
                a.appendChild(b);
                count++;
                if(count > 10) break;
            }
        }
        if(count === 0) {
            b = document.createElement("DIV");
            b.innerHTML = `<span style="color:#ef4444; font-size:0.8rem;">Không tìm thấy trong danh sách. Hãy tick chọn "Thí sinh tự do" ở trên nếu bạn thuộc trường khác.</span>`;
            a.appendChild(b);
        }
    });

    inp.addEventListener("keydown", function(e) {
        let x = document.getElementById(this.id + "autocomplete-list");
        if (x) x = x.getElementsByTagName("div");
        if (e.keyCode == 40) { currentFocus++; addActive(x); }
        else if (e.keyCode == 38) { currentFocus--; addActive(x); }
        else if (e.keyCode == 13) { e.preventDefault(); if (currentFocus > -1) { if (x) x[currentFocus].click(); } }
    });

    function addActive(x) {
        if (!x) return false;
        removeActive(x);
        if (currentFocus >= x.length) currentFocus = 0;
        if (currentFocus < 0) currentFocus = (x.length - 1);
        x[currentFocus].classList.add("autocomplete-active");
    }
    function removeActive(x) { for (let i = 0; i < x.length; i++) { x[i].classList.remove("autocomplete-active"); } }
    function closeAllLists(elmnt) {
        let x = document.getElementsByClassName("autocomplete-items");
        for (let i = 0; i < x.length; i++) { if (elmnt != x[i] && elmnt != inp) { x[i].parentNode.removeChild(x[i]); } }
    }
    document.addEventListener("click", function (e) { closeAllLists(e.target); });
}

document.getElementById('guest-mode-toggle').addEventListener('change', function(e) {
    const isGuest = e.target.checked;
    const classInp = document.getElementById("user_class");
    const sbdInp = document.getElementById("user_sbd");
    const schoolInp = document.getElementById("user_school");
    const nameInp = document.getElementById("username");

    if (isGuest) {
        classInp.removeAttribute("readonly"); classInp.value = ""; classInp.placeholder = "Ví dụ: 9A1";
        sbdInp.removeAttribute("readonly"); sbdInp.value = ""; sbdInp.placeholder = "Ví dụ: 01";
        schoolInp.removeAttribute("readonly"); schoolInp.value = ""; schoolInp.placeholder = "Nhập tên trường";
        nameInp.value = ""; nameInp.placeholder = "Nhập họ và tên...";
        document.getElementById('username-hint').style.display = 'none';

        const oldInp = nameInp; const newInp = oldInp.cloneNode(true);
        oldInp.parentNode.replaceChild(newInp, oldInp);
    } else {
        classInp.setAttribute("readonly", true); classInp.value = ""; classInp.placeholder = "Tự động điền";
        sbdInp.setAttribute("readonly", true); sbdInp.value = ""; sbdInp.placeholder = "Tự động điền";
        schoolInp.setAttribute("readonly", true); schoolInp.value = ""; schoolInp.placeholder = "Tự động điền";
        document.getElementById('username').value = ""; document.getElementById('username').placeholder = "Nhập tên để tìm kiếm trong danh sách...";
        document.getElementById('username-hint').style.display = 'block';
        autocomplete(document.getElementById("username"), globalStudentList);
    }
});

async function loadStudentList() {
    try {
        const snap = await getDocs(collection(db, 'artifacts', appId_fixed, 'public', 'data', collectionStudents));
        globalStudentList = [];
        snap.forEach(d => globalStudentList.push({id: d.id, ...d.data()}));
        if(!document.getElementById('guest-mode-toggle').checked) { autocomplete(document.getElementById("username"), globalStudentList); }
    } catch(e) { console.log("Lỗi tải danh sách HS:", e); }
}

const initAuth = async () => { try { await signInAnonymously(auth); } catch (e) {} }; initAuth();
onAuthStateChanged(auth, async user => {
    currentUser = user;
    syncTeacherAuthButton();
    if (!user) return;
    await loadTimeConfig();
    if (user.isAnonymous) {
        const guestToggle = document.getElementById('guest-mode-toggle');
        if (!guestToggle.checked) {
            guestToggle.checked = true;
            guestToggle.dispatchEvent(new Event('change'));
        }
    } else {
        await loadStudentList();
    }
});

let fireRequest;
const adaptiveGraphics = (() => {
    const root = document.documentElement;
    const reducedMotion = window.matchMedia?.('(prefers-reduced-motion: reduce)').matches || false;
    const hardwareCores = Number(navigator.hardwareConcurrency) || 0;
    const deviceMemory = Number(navigator.deviceMemory) || 0;
    const lowPowerDevice = (hardwareCores > 0 && hardwareCores <= 4) || (deviceMemory > 0 && deviceMemory <= 4);
    let frameCount = 0;
    let sampleStartedAt = 0;
    let lastWindowAt = 0;
    let slowWindows = 0;
    let smoothWindows = 0;
    let requestId = 0;
    let stopAt = 0;

    const updateQuality = () => {
        root.classList.toggle('performance-lite', lowPowerDevice || slowWindows >= 2 || reducedMotion);
    };

    const sampleFrame = timestamp => {
        if (!sampleStartedAt) {
            sampleStartedAt = timestamp;
            lastWindowAt = timestamp;
        }
        frameCount++;
        if (timestamp - lastWindowAt >= 1200) {
            const fps = frameCount * 1000 / (timestamp - lastWindowAt);
            if (fps < 48) {
                slowWindows++;
                smoothWindows = 0;
            } else if (fps >= 54) {
                smoothWindows++;
                slowWindows = 0;
                if (smoothWindows >= 3 && !lowPowerDevice && !reducedMotion) {
                    root.classList.remove('performance-lite');
                }
            }
            frameCount = 0;
            lastWindowAt = timestamp;
            updateQuality();
        }
        if (timestamp < stopAt) {
            requestId = requestAnimationFrame(sampleFrame);
        } else {
            requestId = 0;
            sampleStartedAt = 0;
        }
    };

    const sample = () => {
        if (document.visibilityState === 'hidden') return;
        stopAt = Math.max(stopAt, performance.now() + 7000);
        if (!requestId) requestId = requestAnimationFrame(sampleFrame);
    };

    updateQuality();
    window.addEventListener('scroll', sample, { passive: true });
    document.addEventListener('animationstart', sample, true);
    document.addEventListener('transitionrun', sample, true);
    return { sample };
})();

function startFire() {
    const canvas = document.getElementById('fire-canvas'); const ctx = canvas.getContext('2d');
    canvas.width = window.innerWidth; canvas.height = window.innerHeight; let flames = [];
    class Flame {
        constructor() {
            this.x = Math.random() * canvas.width; this.y = canvas.height + 100; this.size = Math.random() * 100 + 60;
            this.vx = Math.random() * 2 - 1; this.vy = Math.random() * -4 - 3; this.life = 1.0; this.decay = Math.random() * 0.01 + 0.006;
        }
        update() { this.x += this.vx + Math.sin(this.life * 10) * 1.5; this.y += this.vy; this.life -= this.decay; this.size *= 0.992; }
        draw() {
            if (this.life <= 0) return;
            const halfWidth = this.size / 2.5;
            if (this.x + halfWidth < 0 || this.x - halfWidth > canvas.width || this.y + this.size < 0 || this.y - this.size * 1.3 > canvas.height) return;
            ctx.save(); ctx.translate(this.x, this.y); ctx.beginPath(); ctx.moveTo(0, 0);
            ctx.bezierCurveTo(-this.size/2.5, -this.size/2, -this.size/3, -this.size*0.8, 0, -this.size * 1.3);
            ctx.bezierCurveTo(this.size/3, -this.size*0.8, this.size/2.5, -this.size/2, 0, 0);
            let color = this.life > 0.8 ? `rgba(255, 255, 255, ${this.life})` : (this.life > 0.5 ? `rgba(255, 220, 0, ${this.life})` : (this.life > 0.2 ? `rgba(255, 80, 0, ${this.life})` : `rgba(200, 0, 0, ${this.life})`));
            ctx.fillStyle = color; ctx.shadowBlur = this.size / 3; ctx.shadowColor = "#ff4e00"; ctx.fill(); ctx.restore();
        }
    }
    function animate() {
        if (document.getElementById('wish-overlay').style.display === 'none') return;
        ctx.clearRect(0, 0, canvas.width, canvas.height);
        const flameLimit = document.documentElement.classList.contains('performance-lite') ? 26 : 55;
        while (flames.length > flameLimit) flames.pop();
        if (flames.length < flameLimit) flames.push(new Flame());
        for (let i = 0; i < flames.length; i++) { flames[i].update(); flames[i].draw(); if (flames[i].life <= 0) { flames.splice(i, 1); i--; } }
        fireRequest = requestAnimationFrame(animate);
    }
    adaptiveGraphics.sample();
    animate();
}

function showCustomAlert(msg = "⚠️ Vui lòng hoàn thành câu hỏi này!") {
    const alertBox = document.getElementById('custom-alert'); alertBox.innerHTML = msg; alertBox.style.display = 'block';
    setTimeout(() => { alertBox.style.display = 'none'; }, 3000);
}

function isCurrentQuestionComplete() {
    const q = currentExam[currentIdx];
    if (q.type === 'mcq') return !!userAnswers[q.id];
    if (q.type === 'tf') { const a = userAnswers[q.id] || {}; return (a[0] !== undefined && a[1] !== undefined && a[2] !== undefined && a[3] !== undefined); }
    if (q.type === 'short') { return (userAnswers[q.id] || "").trim().length > 0; }
    return false;
}

function checkShortAns(u, a) {
    let cleanU = (u||"").toString().replace(/\s+/g, '').replace(/,/g, '.');
    let cleanA = (a||"").toString().replace(/\s+/g, '').replace(/,/g, '.');
    if (cleanU === cleanA) return true;
    if (!isNaN(cleanU) && !isNaN(cleanA) && cleanU !== '' && cleanA !== '') { return Number(cleanU) === Number(cleanA); }
    return false;
}

async function loadTimeConfig() {
    try {
        const docRef = await getDoc(doc(db, 'artifacts', appId_fixed, 'public', 'data', 'config', 'timer_settings'));
        if(docRef.exists()) {
            const data = docRef.data();
            practiceTimeLimit = (data.practice || 45) * 60; testTimeLimit = (data.test || 45) * 60; maxHintsAllowed = data.maxHints !== undefined ? data.maxHints : 3;
            document.getElementById('cfg-time-practice').value = data.practice || 45; document.getElementById('cfg-time-test').value = data.test || 45; document.getElementById('cfg-max-hints').value = maxHintsAllowed;
        }
    } catch(e) {}
}


const initGame = async (m) => {
    const getVal = (id) => { const el = document.getElementById(id); return (el && el.value.trim()) ? el.value.trim() : ""; };
    const name = getVal('username'); const sch = getVal('user_school'); const cls = getVal('user_class'); const sbd = getVal('user_sbd');

    if (!name || !sch || !cls || !sbd) {
        document.getElementById('start-error').style.display = 'block'; return;
    }
    document.getElementById('start-error').style.display = 'none';

    const topicVal = document.getElementById('topic-select').value;
    const topicText = document.getElementById('topic-select').options[document.getElementById('topic-select').selectedIndex].text;
    window.finalUserData = { name, sch, cls, sbd, topic: topicText, topicCode: topicVal };
    mode = m; isQuizRunning = true; canCheckCheat = false; isProcessingCheat = false; hasSaved = false;
    document.getElementById('btn-report-open').style.display = 'none'; document.getElementById('btn-admin-open').style.display = 'none';
    document.getElementById('header-user-info').innerText = `${name} | Lớp: ${cls} | ${topicText}`;
    hintsUsed = 0; unlockedHints = []; currentExam = [];


    document.getElementById('start-buttons').style.display = 'none';
    document.getElementById('loading-text').style.display = 'block';

    try {
        let activeBank = { mcq: [], tf: [], short: [] };
        if (topicVal === 'mix') {
            const snap = await getDocs(collection(db, 'artifacts', appId_fixed, 'public', 'data', collectionBanks));
            if (snap.empty) {
                alert("Hệ thống chưa có đề thi nào trên máy chủ! Vui lòng báo Giáo viên Import đề.");
                document.getElementById('start-buttons').style.display = 'grid';
                document.getElementById('loading-text').style.display = 'none';
                return;
            }
            snap.forEach(bankDoc => {
                const bank = bankDoc.data();
                if (Array.isArray(bank.mcq)) activeBank.mcq.push(...bank.mcq);
                if (Array.isArray(bank.tf)) activeBank.tf.push(...bank.tf);
                if (Array.isArray(bank.short)) activeBank.short.push(...bank.short);
            });
        } else {
            const bankSnap = await getDoc(doc(db, 'artifacts', appId_fixed, 'public', 'data', collectionBanks, topicVal));
            if (bankSnap.exists()) activeBank = bankSnap.data();
        }


        const numMcq = Math.min(12, activeBank.mcq.length);
        const numTf = Math.min(4, activeBank.tf.length);
        const numShort = Math.min(4, activeBank.short.length);

        if(numMcq === 0 && numTf === 0 && numShort === 0) {
            alert("Chuyên đề này chưa có dữ liệu câu hỏi trong kho!");
            document.getElementById('start-buttons').style.display = 'grid';
            document.getElementById('loading-text').style.display = 'none';
            return;
        }

        let qNum = 1;
        shuffle([...activeBank.mcq]).slice(0, numMcq).forEach(q => currentExam.push({...q, id: `q_${qNum}`, type: 'mcq', section: 'Phần I. Trắc nghiệm Đa lựa chọn', displayNum: qNum++}));
        shuffle([...activeBank.tf]).slice(0, numTf).forEach(q => currentExam.push({...q, id: `q_${qNum}`, type: 'tf', section: 'Phần II. Trắc nghiệm Đúng/Sai', displayNum: qNum++}));
        shuffle([...activeBank.short]).slice(0, numShort).forEach(q => currentExam.push({...q, id: `q_${qNum}`, type: 'short', section: 'Phần III. Trắc nghiệm Trả lời ngắn', displayNum: qNum++}));

        userAnswers = {}; currentIdx = 0; timeLeft = (mode === 'test') ? testTimeLimit : practiceTimeLimit;
        const elTimer = document.getElementById('timer'); if(elTimer) { elTimer.innerText = `${Math.floor(timeLeft/60)}:${(timeLeft%60).toString().padStart(2,'0')}`; }
        quizStartTime = Date.now();


        document.getElementById('start-buttons').style.display = 'grid';
        document.getElementById('loading-text').style.display = 'none';

        document.getElementById('wish-overlay').style.display = 'flex'; document.getElementById('wish-cheat-info').style.display = (mode === 'test') ? 'block' : 'none';
        startFire();
        if(mode === 'test') { canCheckCheat = true; window.testInitialWidth = window.innerWidth; }

        wishTimeoutId = setTimeout(() => {
            if(!isQuizRunning) return;
            document.getElementById('wish-overlay').style.display = 'none'; cancelAnimationFrame(fireRequest);
            document.getElementById('main-header').style.display = 'flex'; showScreen('screen-quiz'); renderQuestion(); startTimer();
            if(mode === 'practice') canCheckCheat = true;
        }, 5000);

    } catch(e) {
        console.error("Lỗi tải đề:", e);
        alert("Có lỗi xảy ra khi tải đề từ Máy chủ Firebase!");
        document.getElementById('start-buttons').style.display = 'grid';
        document.getElementById('loading-text').style.display = 'none';
    }
};

function renderQuestion() {
    const q = currentExam[currentIdx]; const container = document.getElementById('quiz-content'); const labels = ['A', 'B', 'C', 'D'];
    let html = `<div class="section-title">${q.section}</div><div class="card" style="margin-top: -10px;">`;
    if(mode === 'practice') {
        let hintBtnText = unlockedHints.includes(q.id) ? "ĐÃ MỞ GỢI Ý 💡" : `XEM GỢI Ý 💡 (Còn ${maxHintsAllowed - hintsUsed})`;
        let hintHtml = q.e;
        const mask = `<span style="background:#cbd5e0; color:transparent; border-radius:4px; padding:0 8px; border: 1px solid #94a3b8;" title="Đáp án bị che trong chế độ Luyện tập">?</span>`;
        if (q.type === 'mcq') {
            hintHtml = hintHtml.replace(/(Phương án|Đáp án|Chọn)\s+([A-D])/gi, `$1 ${mask}`);
        } else if (q.type === 'short') {
            const safeA = q.a.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
            hintHtml = hintHtml.replace(new RegExp(`\\b${safeA}\\b`, 'g'), mask);
        } else if (q.type === 'tf') {
            hintHtml = hintHtml.replace(/(Ý\s+[a-d](?:[\s,và]+[a-d])*)\s*(đúng|sai)/gi, `$1 ${mask}`);
        }
        html += `<button class="btn-hint" id="hint-trigger" style="padding: 8px 15px; border-radius: 8px; border: 2px solid var(--accent); background: #fffbeb; color: #b45309; font-weight: bold; cursor: pointer; margin-bottom: 15px;">${hintBtnText}</button><div id="hint-box" class="hint-box" style="display: none; margin-bottom: 15px; padding: 12px; background: #f8fafc; border-radius: 10px; border: 1px solid #e2e8f0; font-size: 0.9rem; color: #475569; line-height: 1.5;"><b>Hướng dẫn tư duy:</b><br>${hintHtml}</div>`;
    }
    if(q.type === 'mcq') {
        html += `<h3>Câu ${q.displayNum}. ${q.q}</h3>`;
        if(!q.shuffledOptions) q.shuffledOptions = shuffle([...q.o]);
        q.shuffledOptions.forEach((o, idx) => {
            const isSelected = userAnswers[q.id] === o;
            html += `<div class="option ${isSelected?'selected':''}" data-ans="${o.replace(/"/g, '&quot;')}"><b>${labels[idx]}.</b> ${o}</div>`;
        });
    } else if(q.type === 'tf') {
        html += `<h3>Câu ${q.displayNum}</h3><div style="background:#f1f5f9; padding:15px; border-radius:12px; margin-bottom:15px; font-style:italic;">${q.ctx}</div>`;
        q.sts.forEach((st, si) => {
            let val = (userAnswers[q.id]||{})[si];
            html += `<div class="tf-row"><span><b>${st.l}</b> ${st.t}</span><div><button class="tf-btn ${val===true?'active-t':''}" data-si="${si}" data-val="true">Đúng</button><button class="tf-btn ${val===false?'active-f':''}" data-si="${si}" data-val="false">Sai</button></div></div>`;
        });
    } else {
        html += `<h3>Câu ${q.displayNum}. ${q.q}</h3>`;
        const currentVal = (userAnswers[q.id] || "").padEnd(4, " ");
        html += `<div class="short-answer-wrapper"><input type="text" class="char-slot" maxlength="1" value="${currentVal[0] !== ' ' ? currentVal[0] : ''}" data-idx="0"><input type="text" class="char-slot" maxlength="1" value="${currentVal[1] !== ' ' ? currentVal[1] : ''}" data-idx="1"><input type="text" class="char-slot" maxlength="1" value="${currentVal[2] !== ' ' ? currentVal[2] : ''}" data-idx="2"><input type="text" class="char-slot" maxlength="1" value="${currentVal[3] !== ' ' ? currentVal[3] : ''}" data-idx="3"></div><p style="color:var(--danger); font-size:0.8rem; font-weight:bold; text-align:center;">Lưu ý: Nhập mỗi ký tự vào một ô</p>`;
    }
    container.innerHTML = html + `</div>`;
    if(q.type === 'mcq') {
        container.querySelectorAll('.option').forEach(el => el.onclick = () => {
            userAnswers[q.id] = el.getAttribute('data-ans');
            container.querySelectorAll('.option').forEach(option => option.classList.toggle('selected', option === el));
            audioPing.play().catch(()=>{});
        });
    } else if(q.type === 'tf') {
        container.querySelectorAll('.tf-btn').forEach(el => el.onclick = () => {
            const si = el.getAttribute('data-si'), val = el.getAttribute('data-val') === 'true';
            if(!userAnswers[q.id]) userAnswers[q.id] = {};
            userAnswers[q.id][si] = val;
            const row = el.closest('.tf-row');
            row.querySelectorAll('.tf-btn').forEach(button => {
                const selected = button.getAttribute('data-val') === String(val);
                button.classList.toggle('active-t', selected && val);
                button.classList.toggle('active-f', selected && !val);
            });
            audioPing.play().catch(()=>{});
        });
    } else {
        const slots = container.querySelectorAll('.char-slot');
        slots.forEach((slot, idx) => {
            slot.oninput = (e) => {
                const val = e.target.value; if (val && idx < 3) slots[idx + 1].focus();
                let combined = ""; slots.forEach(s => combined += (s.value || " ")); userAnswers[q.id] = combined.trim();
            };
            slot.onkeydown = (e) => { if (e.key === 'Backspace' && !e.target.value && idx > 0) slots[idx - 1].focus(); };
        });
    }
    const hb = document.getElementById('hint-trigger');
    if(hb) {
        hb.onclick = async () => {
            const b = document.getElementById('hint-box'); const isH = b.style.display === 'none';
            if (isH && !unlockedHints.includes(q.id)) {
                if (hintsUsed >= maxHintsAllowed) { showCustomAlert("⚠️ Bạn đã hết lượt xem gợi ý!"); return; }
                hintsUsed++; unlockedHints.push(q.id); hb.innerText = "ĐÃ MỞ GỢI Ý 💡";
            }
            b.style.display = isH ? 'block' : 'none'; if(isH && window.MathJax) await MathJax.typesetPromise([b]);
        };
    }
    document.getElementById('btn-prev').style.visibility = currentIdx === 0 ? 'hidden' : 'visible';
    document.getElementById('btn-next').style.display = currentIdx === currentExam.length - 1 ? 'none' : 'block';
    document.getElementById('btn-finish').style.display = currentIdx === currentExam.length - 1 ? 'block' : 'none';
    if(window.MathJax) MathJax.typesetPromise();
}

async function calculateResult() {
    if (hasSaved) return; if(!isQuizRunning && !isProcessingCheat) return; hasSaved = true;
    if(wishTimeoutId) clearTimeout(wishTimeoutId);
    isQuizRunning = false; canCheckCheat = false; clearInterval(timerInt); audioFinish.play().catch(()=>{});
    document.getElementById('btn-report-open').style.display = 'block'; document.getElementById('btn-admin-open').style.display = 'block';
    const dur = Math.floor((Date.now() - quizStartTime) / 1000); let score = 0;
    const totalMCQ = currentExam.filter(q=>q.type==='mcq').length || 1;
    const totalTF = currentExam.filter(q=>q.type==='tf').length || 1;
    const totalShort = currentExam.filter(q=>q.type==='short').length || 1;
    const pMCQ = 3.0 / totalMCQ, pTF = 2.0 / totalTF, pShort = 2.0 / totalShort;
    const tfMap = {0:0, 1: pTF*0.1/0.5, 2: pTF*0.25/0.5, 3: pTF*0.35/0.5, 4: pTF};
    currentExam.forEach(q => {
        const norm = (s) => (s || "").toString().trim().replace(',','.');
        if(q.type === 'mcq' && norm(userAnswers[q.id]||'') === norm(q.a)) score += pMCQ;
        else if(q.type === 'tf') { let cp = 0, u = userAnswers[q.id] || {}; q.sts.forEach((st, si) => { if(u[si] === st.a) cp++; }); score += tfMap[cp] || 0; }
        else if(q.type === 'short' && checkShortAns(userAnswers[q.id], q.a)) score += pShort;
    });
    const fs = Number(Math.min(10, score).toFixed(2));
    document.getElementById('wish-overlay').style.display = 'none'; cancelAnimationFrame(fireRequest);
    showScreen('screen-result'); document.getElementById('main-header').style.display = 'none';
    document.getElementById('final-score').innerText = fs;
    const u = window.finalUserData;
    document.getElementById('res-name').innerText = (u.name || "input").toUpperCase();
    document.getElementById('res-meta').innerText = `${u.topic} | ${u.sch || "input"} | Lớp ${u.cls || "input"} | SBD ${u.sbd || "input"}`;
    let rb = document.getElementById('rank-badge'), txt = 'CHƯA ĐẠT', col = '#64748b';
    if(fs >= 9.0) { txt='XUẤT SẮC'; col='#f59e0b'; } else if(fs >= 8.0) { txt='GIỎI'; col='#10b981'; } else if(fs >= 6.5) { txt='KHÁ'; col='#3b82f6'; } else if(fs >= 5.0) { txt='ĐẠT'; col='#8b5cf6'; }
    rb.innerText = txt; rb.style.background = col;
    if(fs >= 5.0) confetti({ particleCount: 150, spread: 70, origin: { y: 0.6 } });
    if(currentUser) {
        try {
            const summary = {
                name: u.name, school: u.sch, sbd: u.sbd, class: u.cls,
                topic: u.topic, score: fs, duration: dur, mode,
                timestamp: new Date().toISOString()
            };
            const resultRef = doc(collection(db, 'artifacts', appId_fixed, 'public', 'data', collectionName));
            const publicResultRef = doc(db, 'artifacts', appId_fixed, 'public', 'data', collectionPublicResults, resultRef.id);
            const batch = writeBatch(db);
            batch.set(resultRef, { ...summary, examData: currentExam, userAnswers });
            batch.set(publicResultRef, summary);
            await batch.commit();
        } catch(e) { hasSaved = false; showCustomAlert(getFirebaseErrorMessage(e, "APP-SUB-001", "Không thể lưu kết quả bài làm.")); }
    }
    fetchRankAndLeaderboard(fs, u.topic);
}

async function fetchRankAndLeaderboard(myScore, myTopic) {
    try {
        const snap = await getDocs(collection(db, 'artifacts', appId_fixed, 'public', 'data', collectionPublicResults));
        let list = []; snap.forEach(d => list.push(d.data()));
        list = list.filter(r => (r.mode === 'test' || !r.mode) && r.topic === myTopic);
        list.sort((a,b) => b.score - a.score || a.duration - b.duration);
        const myRank = list.findIndex(r => r.name === window.finalUserData.name && r.score === myScore) + 1;
        if(myRank > 0) document.getElementById('my-rank-text').innerText = `HẠNG ${myRank} / ${list.length}`; else document.getElementById('my-rank-text').innerText = `KẾT QUẢ LUYỆN TẬP`;
    } catch (e) {}
}

function setupAdminExcelFilters(options) {
 const controls=document.querySelector('#admin-results-section > .admin-controls'); if(!controls)return;
 const state=window.adminExcelFilterState||(window.adminExcelFilterState={school:[],class:[],topic:[],mode:[]});
 const defs=[{key:'school',label:'Trường',values:options.school.map(String)},{key:'class',label:'Lớp',values:options.class.map(String)},{key:'topic',label:'Chuyên đề',values:options.topic.map(String)},{key:'mode',label:'Chế độ',values:['test','practice']}];
 const esc=s=>String(s).replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
 defs.forEach(d=>{state[d.key]=(state[d.key]||[]).filter(v=>d.values.includes(String(v)));const e=document.getElementById('admin-filter-'+d.key);if(e)e.parentElement.hidden=true;});
 let root=controls.querySelector('.admin-excel-filters');if(!root){root=document.createElement('div');root.className='admin-excel-filters';controls.insertBefore(root,controls.querySelector('.grid-2-col'));}
 const sortControl=document.getElementById('admin-sort')?.parentElement;
 if(sortControl&&sortControl.parentElement===root)sortControl.remove();
 root.innerHTML=defs.map(d=>{const sel=state[d.key],title=sel.length?d.label+' ('+sel.length+')':d.label+': Tất cả',items=d.values.map(v=>'<label class="admin-filter-option"><input type="checkbox" data-filter-check="'+d.key+'" value="'+esc(v)+'"'+(sel.includes(String(v))?' checked':'')+'><span>'+esc(v==='test'?'Kiểm tra':v==='practice'?'Luyện tập':v)+'</span></label>').join('');return '<div class="admin-filter-group" data-filter-group="'+d.key+'"><button type="button" class="admin-filter-trigger" aria-expanded="false">'+esc(title)+' ▾</button><div class="admin-filter-menu" hidden><input class="admin-filter-search" type="search" placeholder="Tìm '+esc(d.label.toLowerCase())+'..."><div class="admin-filter-options">'+(items||'<small>Chưa có dữ liệu</small>')+'</div><div class="admin-filter-menu-actions"><button type="button" data-filter-action="all">Chọn tất cả</button><button type="button" data-filter-action="clear">Bỏ lọc</button></div><button type="button" class="admin-filter-apply">Áp dụng</button></div></div>';}).join('');
 root.querySelectorAll('.admin-filter-trigger').forEach(b=>b.onclick=()=>{const g=b.closest('.admin-filter-group'),m=g.querySelector('.admin-filter-menu'),open=m.hidden||m.dataset.rollState==='closing';root.querySelectorAll('.admin-filter-menu').forEach(x=>setLiquidGlassMenu(x,false,'down'));root.querySelectorAll('.admin-filter-trigger').forEach(x=>x.setAttribute('aria-expanded','false'));if(open)setLiquidGlassMenu(m,true,'down');b.setAttribute('aria-expanded',String(open));});
 root.querySelectorAll('.admin-filter-search').forEach(i=>i.oninput=()=>{const q=i.value.trim().toLocaleLowerCase('vi');i.closest('.admin-filter-menu').querySelectorAll('.admin-filter-option').forEach(x=>x.hidden=!x.innerText.toLocaleLowerCase('vi').includes(q));});
 root.querySelectorAll('.admin-filter-group').forEach(g=>{const k=g.dataset.filterGroup,d=defs.find(x=>x.key===k),b=g.querySelector('.admin-filter-trigger'),update=()=>{state[k]=[...g.querySelectorAll('[data-filter-check]:checked')].map(x=>x.value);b.firstChild.textContent=state[k].length?d.label+' ('+state[k].length+') ▾':d.label+': Tất cả ▾';};g.querySelectorAll('[data-filter-check]').forEach(x=>x.onchange=update);g.querySelector('[data-filter-action="all"]').onclick=()=>{g.querySelectorAll('[data-filter-check]').forEach(x=>x.checked=true);update();};g.querySelector('[data-filter-action="clear"]').onclick=()=>{g.querySelectorAll('[data-filter-check]').forEach(x=>x.checked=false);update();};g.querySelector('.admin-filter-apply').onclick=()=>renderAdmin();});
 if(sortControl){sortControl.classList.add('admin-sort-control');root.appendChild(sortControl);}
 setupAdminSortGlassMenu();
}


function setupAdminSortGlassMenu() {
    const select = document.getElementById('admin-sort');
    if (!select || select.dataset.glassMenuReady) return;
    select.dataset.glassMenuReady = 'true';

    const wrapper = document.createElement('div');
    wrapper.className = 'admin-single-filter admin-sort-glass-select';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'admin-filter-trigger admin-sort-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', 'Sắp xếp kết quả');
    const menu = document.createElement('div');
    menu.className = 'admin-filter-menu admin-sort-menu';
    menu.hidden = true;
    const optionsBox = document.createElement('div');
    optionsBox.className = 'admin-filter-options';
    optionsBox.setAttribute('role', 'listbox');

    const updateSelection = () => {
        const selected = [...select.options].find(option => option.value === select.value);
        trigger.textContent = (selected ? selected.textContent : 'Chọn cách sắp xếp') + ' ▾';
        optionsBox.querySelectorAll('[role="option"]').forEach(item => {
            item.setAttribute('aria-selected', String(item.dataset.value === select.value));
        });
    };
    [...select.options].forEach(option => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'admin-filter-option admin-single-filter-option';
        item.textContent = option.textContent;
        item.dataset.value = option.value;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(option.value === select.value));
        item.onclick = () => {
            select.value = option.value;
            updateSelection();
            select.dispatchEvent(new Event('change', { bubbles: true }));
            setLiquidGlassMenu(menu, false, 'down');
            trigger.setAttribute('aria-expanded', 'false');
        };
        optionsBox.appendChild(item);
    });
    menu.appendChild(optionsBox);
    wrapper.append(trigger, menu);
    select.parentNode.insertBefore(wrapper, select);
    select.hidden = true;
    updateSelection();

    trigger.onclick = () => {
        const open = menu.hidden || menu.dataset.rollState === 'closing';
        setLiquidGlassMenu(menu, open, 'down');
        trigger.setAttribute('aria-expanded', String(open));
    };
    document.addEventListener('click', event => {
        if (!wrapper.contains(event.target)) {
            setLiquidGlassMenu(menu, false, 'down');
            trigger.setAttribute('aria-expanded', 'false');
        }
    });
}

async function syncPublicResultSummaries(results) {
    const publicResultsRef = collection(db, 'artifacts', appId_fixed, 'public', 'data', collectionPublicResults);
    const existing = await getDocs(publicResultsRef);
    const existingIds = new Set(existing.docs.map(result => result.id));
    const missing = results.filter(result => !existingIds.has(result.id));
    for (let offset = 0; offset < missing.length; offset += 500) {
        const batch = writeBatch(db);
        missing.slice(offset, offset + 500).forEach(result => {
            const summary = {
                name: String(result.name || ''),
                school: String(result.school || ''),
                sbd: String(result.sbd || ''),
                class: String(result.class || ''),
                topic: String(result.topic || ''),
                score: Number(result.score) || 0,
                duration: Number(result.duration) || 0,
                mode: result.mode === 'practice' ? 'practice' : 'test',
                timestamp: typeof result.timestamp === 'string' ? result.timestamp : new Date().toISOString()
            };
            batch.set(doc(publicResultsRef, result.id), summary);
        });
        await batch.commit();
    }
}

function hasTeacherSession() {
    const user = auth.currentUser;
    return Boolean(user && !user.isAnonymous && user.uid === "wg7QT6isC2dryLf8rxc6z9lUjNd2");
}

async function renderAdmin() {
    const listBody = document.getElementById('admin-list-body'), statsBox = document.getElementById('admin-stats');
    listBody.innerHTML = "<tr><td colspan='11'>Đang tải dữ liệu...</td></tr>";
    try {
        const teacherSession = hasTeacherSession();
        const resultCollection = teacherSession ? collectionName : collectionPublicResults;
        const snap = await getDocs(collection(db, 'artifacts', appId_fixed, 'public', 'data', resultCollection));
        let rawData = []; snap.forEach(d => rawData.push({id: d.id, ...d.data()}));
        if (teacherSession) await syncPublicResultSummaries(rawData);
        const classes = [...new Set(rawData.map(i => i.class))].sort();
        const schools = [...new Set(rawData.map(i => i.school))].filter(s => s).sort();
        const topics = [...new Set(rawData.map(i => i.topic))].filter(t => t).sort();
        const fClass = document.getElementById('admin-filter-class'); const oldC = fClass.value; fClass.innerHTML = '<option value="all">Tất cả lớp</option>' + classes.map(c => `<option value="${c}" ${c===oldC?'selected':''}>Lớp ${c}</option>`).join('');
        const fSchool = document.getElementById('admin-filter-school'); const oldS = fSchool.value; fSchool.innerHTML = '<option value="all">Tất cả trường</option>' + schools.map(s => `<option value="${s}" ${s===oldS?'selected':''}>${s}</option>`).join('');
        const fTopic = document.getElementById('admin-filter-topic'); const oldT = fTopic.value; fTopic.innerHTML = '<option value="all">Tất cả chuyên đề</option>' + topics.map(t => `<option value="${t}" ${t===oldT?'selected':''}>${t}</option>`).join('');
        setupAdminExcelFilters({ class: classes, school: schools, topic: topics }); const filters = window.adminExcelFilterState; const sVal = document.getElementById('admin-sort').value;
        let data = rawData.filter(i => {
            return (!filters.mode.length || filters.mode.includes(String(i.mode || '')))
                && (!filters.class.length || filters.class.includes(String(i.class || '')))
                && (!filters.school.length || filters.school.includes(String(i.school || '')))
                && (!filters.topic.length || filters.topic.includes(String(i.topic || '')));
        });
        data.sort((a,b) => { if(sVal === 'score_desc') return b.score - a.score || a.duration - b.duration; if(sVal === 'date_new') return new Date(b.timestamp) - new Date(a.timestamp); if(sVal === 'duration_fast') return a.duration - b.duration || b.score - a.score; return 0; });
        let s = { xs: 0, g: 0, k: 0, d: 0, cd: 0 };
        data.forEach(i => { if(i.score >= 9.0) s.xs++; else if(i.score >= 8.0) s.g++; else if(i.score >= 6.5) s.k++; else if(i.score >= 5.0) s.d++; else s.cd++; });
        statsBox.innerHTML = `<div class="stat-box" style="border-bottom-color: #f59e0b"><b>${s.xs}</b><br><small>X.Sắc</small></div><div class="stat-box" style="border-bottom-color: #10b981"><b>${s.g}</b><br><small>Giỏi</small></div><div class="stat-box" style="border-bottom-color: #3b82f6"><b>${s.k}</b><br><small>Khá</small></div><div class="stat-box" style="border-bottom-color: #8b5cf6"><b>${s.d}</b><br><small>Đạt</small></div><div class="stat-box" style="border-bottom-color: #ef4444"><b>${s.cd}</b><br><small>C.Đạt</small></div>`;
        listBody.innerHTML = data.map((i, idx) => `<tr><td>${idx+1}</td><td>${i.sbd}</td><td>${i.name}</td><td>${i.class}</td><td>${i.school||'-'}</td><td style="font-size:0.75rem; color:var(--primary); font-weight:bold;">${i.topic || 'Đề tổng hợp'}</td><td><span class="badge-mode ${i.mode === 'practice' ? 'badge-practice' : 'badge-test'}">${i.mode === 'practice' ? 'Luyện tập' : 'Kiểm tra'}</span></td><td><b>${Number((i.score||0).toFixed(2))}</b></td><td>${i.duration}s</td><td>${new Date(i.timestamp).toLocaleDateString()}</td><td style="display:flex; gap:5px;">${teacherSession ? `<button style="background:var(--secondary); color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer" class="btn-view" data-id="${i.id}">👁️</button><button style="background:red; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer" class="btn-del" data-id="${i.id}">X</button>` : (currentUser?.isAnonymous ? '<button style="background:var(--secondary); color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer" class="btn-view" data-id="' + i.id + '" title="Xem lại bài làm">👁️</button>' : 'Công khai')}</td></tr>`).join('');
        listBody.querySelectorAll('.btn-del').forEach(b => b.onclick = () => deleteEntry(b.dataset.id, 'result'));
        listBody.querySelectorAll('.btn-view').forEach(b => b.onclick = () => viewAdminReview(b.dataset.id)); window.currentFilteredData = data;
    } catch(e) { listBody.innerHTML = "<tr><td colspan='11'>Lỗi kết nối Firebase.</td></tr>"; }
}

async function renderAdminStudents() {
    const listBody = document.getElementById('student-list-body');
    listBody.innerHTML = "<tr><td colspan='6' style='text-align: center;'>Đang tải danh sách...</td></tr>";
    try {
        await loadStudentList();

        const classes = [...new Set(globalStudentList.map(i => i.class))].filter(c => c).sort();
        const schools = [...new Set(globalStudentList.map(i => i.school))].filter(s => s).sort();

        setupAdminStudentsFilters({ class: classes, school: schools }); const fClass = document.getElementById('stu-filter-class'); const oldC = fClass.value;
        fClass.innerHTML = '<option value="all">Tất cả lớp</option>' + classes.map(c => `<option value="${c}" ${c===oldC?'selected':''}>Lớp ${c}</option>`).join('');
        const fSchool = document.getElementById('stu-filter-school'); const oldS = fSchool.value;
        fSchool.innerHTML = '<option value="all">Tất cả trường</option>' + schools.map(s => `<option value="${s}" ${s===oldS?'selected':''}>${s}</option>`).join('');

        let data = globalStudentList.filter(i => {
            const filters = window.adminStudentFilterState;
            return (!filters.class.length || filters.class.includes(String(i.class || '')))
                && (!filters.school.length || filters.school.includes(String(i.school || '')));
        });
        const getVnNameParts = (fullName) => {
            const parts = (fullName || '').trim().split(/\s+/);
            if (parts.length === 0) return { first: '', rest: '' };
            if (parts.length === 1) return { first: parts[0], rest: '' };
            const first = parts.pop(); const rest = parts.join(' ');
            return { first, rest };
        };

        data.sort((a,b) => {
            if (a.school !== b.school) return (a.school || '').localeCompare(b.school || '', 'vi', { numeric: true });
            if (a.class !== b.class) return (a.class || '').localeCompare(b.class || '', 'vi', { numeric: true });

            const nameA = getVnNameParts(a.name); const nameB = getVnNameParts(b.name);
            const firstCompare = nameA.first.localeCompare(nameB.first, 'vi', { sensitivity: 'base' });
            if (firstCompare !== 0) return firstCompare;
            return nameA.rest.localeCompare(nameB.rest, 'vi', { sensitivity: 'base' });
        });

        if(data.length === 0) {
            listBody.innerHTML = "<tr><td colspan='6' style='text-align: center;'>Chưa có danh sách học sinh. Vui lòng Import từ Excel.</td></tr>";
        } else {
            listBody.innerHTML = data.map((i, idx) => `<tr><td style="text-align:center;">${idx+1}</td><td><b>${i.name}</b></td><td>${i.class}</td><td>${i.sbd}</td><td>${i.school}</td><td style="text-align:center;"><button style="background:var(--danger); color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer" class="btn-del-stu" data-id="${i.id}">Xóa</button></td></tr>`).join('');
            listBody.querySelectorAll('.btn-del-stu').forEach(b => b.onclick = () => deleteEntry(b.dataset.id, 'student'));
        }

    } catch(e) { listBody.innerHTML = "<tr><td colspan='6' style='text-align: center; color: red;'>Lỗi kết nối CSDL.</td></tr>"; }
}

async function renderAdminQuestions() {
    setupAdminQuestionTopicMenu(); const listBody = document.getElementById('question-bank-body');
    listBody.innerHTML = "<tr><td colspan='5' style='text-align: center;'>Đang tải dữ liệu...</td></tr>";
    try {
        const snap = await getDocs(collection(db, 'artifacts', appId_fixed, 'public', 'data', collectionBanks));
        let rows = "";
        snap.forEach(d => {
            const data = d.data();
            const qMcq = data.mcq ? data.mcq.length : 0;
            const qTf = data.tf ? data.tf.length : 0;
            const qShort = data.short ? data.short.length : 0;
            rows += `<tr><td><b>${d.id}</b></td><td>${qMcq}</td><td>${qTf}</td><td>${qShort}</td><td><b>${qMcq + qTf + qShort}</b></td></tr>`;
        });
        if(!rows) listBody.innerHTML = "<tr><td colspan='5' style='text-align: center;'>Chưa có dữ liệu đề thi trên Server.</td></tr>";
        else listBody.innerHTML = rows;
    } catch(e) { listBody.innerHTML = "<tr><td colspan='5' style='text-align: center; color: red;'>Lỗi kết nối Server.</td></tr>"; }
}


const adminPanelTabs = {
    results: document.getElementById('tab-results'),
    students: document.getElementById('tab-students'),
    questions: document.getElementById('tab-questions'),
    graphics: document.getElementById('tab-graphics')
};
const adminPanelSections = {
    results: document.getElementById('admin-results-section'),
    students: document.getElementById('admin-students-section'),
    questions: document.getElementById('admin-questions-section'),
    graphics: document.getElementById('admin-graphics-section')
};

function setAdminPanelTab(activeTab) {
    if (['students', 'questions'].includes(activeTab) && !hasTeacherSession()) {
        pendingAdminTab = activeTab;
        document.getElementById('admin-auth-modal').style.display = 'flex';
        return;
    }
    Object.entries(adminPanelTabs).forEach(([name, tab]) => tab.classList.toggle('active', name === activeTab));
    Object.entries(adminPanelSections).forEach(([name, section]) => section.style.display = name === activeTab ? 'block' : 'none');
    if (activeTab === 'results') renderAdmin();
    if (activeTab === 'students') renderAdminStudents();
    if (activeTab === 'questions') renderAdminQuestions();
}

Object.entries(adminPanelTabs).forEach(([name, tab]) => {
    tab.onclick = () => setAdminPanelTab(name);
    tab.onkeydown = event => {
        if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            setAdminPanelTab(name);
        }
    };
});

const graphicsThemeOptions = [...document.querySelectorAll('.graphics-theme-option')];
const applyGraphicsTheme = theme => {
    document.documentElement.dataset.theme = theme;
    graphicsThemeOptions.forEach(option => {
        const selected = option.dataset.theme === theme;
        option.classList.toggle('is-selected', selected);
        option.setAttribute('aria-checked', String(selected));
    });
};
graphicsThemeOptions.forEach(option => {
    option.onclick = () => applyGraphicsTheme(option.dataset.theme);
});
applyGraphicsTheme('aurora');

const glassTransparencyInput = document.getElementById('glass-transparency');
const glassTransparencyValue = document.getElementById('glass-transparency-value');
const applyGlassTransparency = value => {
    const transparency = Number(value);
    document.documentElement.style.setProperty('--glass-opacity', String(1 - transparency / 100));
    glassTransparencyValue.value = transparency + '%';
    glassTransparencyValue.textContent = transparency + '%';
};
glassTransparencyInput.oninput = () => applyGlassTransparency(glassTransparencyInput.value);
document.getElementById('glass-transparency-reset').onclick = () => {
    glassTransparencyInput.value = '82';
    applyGlassTransparency(glassTransparencyInput.value);
};


document.getElementById('stu-filter-school').onchange = () => renderAdminStudents();
document.getElementById('stu-filter-class').onchange = () => renderAdminStudents();
document.getElementById('btn-refresh-students').onclick = () => renderAdminStudents();

async function viewAdminReview(docId) {
    let record = window.currentFilteredData.find(d => d.id === docId);
    if (!record) { alert("Không tìm thấy bài làm!"); return; }
    if (!record.examData && currentUser?.isAnonymous) {
        try {
            const detailRef = doc(db, 'artifacts', appId_fixed, 'public', 'data', collectionName, docId);
            const detailSnapshot = await getDoc(detailRef);
            if (!detailSnapshot.exists()) { alert("Không có dữ liệu chi tiết!"); return; }
            record = { ...record, ...detailSnapshot.data() };
            window.currentFilteredData = window.currentFilteredData.map(item => item.id === docId ? record : item);
        } catch (error) {
            console.error('[APP-REVIEW-001] Không thể tải dữ liệu chi tiết bài làm.', error);
            showCustomAlert(getFirebaseErrorMessage(error, 'APP-REVIEW-001', 'Không thể tải dữ liệu chi tiết bài làm.'));
            return;
        }
    }
    if (!record.examData) { alert("Không có dữ liệu chi tiết!"); return; }
    document.getElementById('ar-name').innerText = `${record.name} - Điểm: ${record.score}`; arExamData = record.examData; arUserAnswers = record.userAnswers || {};
    const content = document.getElementById('ar-content'); let h = '', labels = ['A', 'B', 'C', 'D'];
    const norm = (s) => (s || "").toString().trim().replace(',','.');
    const pMCQ = 3.0 / (arExamData.filter(q=>q.type==='mcq').length||1), pTF = 2.0 / (arExamData.filter(q=>q.type==='tf').length||1), pShort = 2.0 / (arExamData.filter(q=>q.type==='short').length||1);
    const tfMapReview = {0:0, 1: pTF*0.1/0.5, 2: pTF*0.25/0.5, 3: pTF*0.35/0.5, 4: pTF};
    arExamData.forEach(q => {
        let qText = q.type === 'tf' ? `Câu ${q.displayNum} (Đúng/Sai)` : `Câu ${q.displayNum}. ${q.q}`; let itemScore = 0, scoreHTML = '';
        if(q.type === 'mcq') { itemScore = norm(arUserAnswers[q.id]||'') === norm(q.a) ? pMCQ : 0; scoreHTML = `<span class="score-badge ${itemScore > 0 ? 'score-plus' : 'score-zero'}">${itemScore > 0 ? '+'+itemScore.toFixed(2) : '0'}đ</span>`; }
        else if(q.type === 'short') { itemScore = checkShortAns(arUserAnswers[q.id], q.a) ? pShort : 0; scoreHTML = `<span class="score-badge ${itemScore > 0 ? 'score-plus' : 'score-zero'}">${itemScore > 0 ? '+'+itemScore.toFixed(2) : '0'}đ</span>`; }
        else if(q.type === 'tf') { let cp = 0; q.sts.forEach((st, si) => { if((arUserAnswers[q.id]||{})[si] === st.a) cp++; }); itemScore = tfMapReview[cp] || 0; scoreHTML = `<span class="score-badge ${itemScore > 0 ? 'score-plus' : 'score-zero'}">Đúng ${cp}/4 ý (${itemScore > 0 ? '+'+itemScore.toFixed(2) : '0'}đ)</span>`; }
        h += `<div style="border-left: 5px solid ${itemScore > 0 ? 'var(--success)' : 'var(--danger)'}; padding-left: 15px; margin-bottom: 25px;"><h4>${qText} ${scoreHTML}</h4>`;
        if(q.type === 'mcq') {
            (q.shuffledOptions || q.o).forEach((o, idx) => { const isC = norm(o) === norm(q.a), isU = arUserAnswers[q.id] === o; h += `<div style="padding: 8px; margin: 5px 0; border-radius: 5px; background: ${isC ? '#d1fae5' : (isU ? '#fee2e2' : '#f8fafc')}; border: 1px solid ${isC ? 'var(--success)' : (isU ? 'var(--danger)' : '#e2e8f0')}"><b>${labels[idx]}.</b> ${o} ${isC?'✓':(isU?'✗':'')}</div>`; });
        } else if(q.type === 'tf') {
            q.sts.forEach((st, si) => {
                const uV = (arUserAnswers[q.id] || {})[si], isC = uV === st.a;
                const answerState = uV === undefined ? 'unanswered' : (isC ? 'correct' : 'wrong');
                const chosenText = uV === true ? 'Đúng' : (uV === false ? 'Sai' : 'Chưa trả lời');
                h += `<div class="tf-review-row tf-review-${answerState} tf-review-admin"><span class="tf-review-statement">${st.l} ${st.t}</span><div class="tf-review-feedback"><span class="tf-review-selected">Học sinh chọn: <b>${chosenText}</b>${uV === undefined ? '' : (isC ? ' ✓' : ' ✗')}</span><span class="tf-review-correct-answer">Đáp án đúng: <b>${st.a ? 'Đúng' : 'Sai'}</b></span></div></div>`;
            });
        } else {
            const isC = checkShortAns(arUserAnswers[q.id], q.a); h += `<div style="padding: 8px; background: #f8fafc; border-radius: 5px;">Bạn nhập: <b style="color:${isC?'#10b981':'#ef4444'}">${arUserAnswers[q.id]||'Trống'}</b> <br> Đáp án: <b style="color:#10b981">${q.a}</b></div>`;
        }
        h += `</div>`;
    });
    content.innerHTML = h; document.getElementById('admin-review-modal').style.display = 'flex'; if(window.MathJax) MathJax.typesetPromise([content]);
}
document.getElementById('btn-ar-close').onclick = () => document.getElementById('admin-review-modal').style.display = 'none';

document.getElementById('btn-ar-retry').onclick = () => {
    let wrongQuestions = []; let newQCount = 1; const norm = (s) => (s || "").toString().trim().replace(',','.');
    arExamData.forEach(q => {
        let isWrong = false;
        if (q.type === 'mcq' && norm(arUserAnswers[q.id]) !== norm(q.a)) isWrong = true;
        else if (q.type === 'short' && !checkShortAns(arUserAnswers[q.id], q.a)) isWrong = true;
        else if (q.type === 'tf') { let cp = 0; q.sts.forEach((st, si) => { if((arUserAnswers[q.id]||{})[si] === st.a) cp++; }); if (cp < 4) isWrong = true; }
        if (isWrong) { let clonedQ = JSON.parse(JSON.stringify(q)); clonedQ.displayNum = newQCount++; wrongQuestions.push(clonedQ); }
    });
    if (wrongQuestions.length === 0) { alert("Tuyệt vời! Học sinh này đã làm đúng toàn bộ 100%."); return; }
    document.getElementById('admin-review-modal').style.display = 'none'; document.getElementById('screen-admin').classList.remove('active');
    document.getElementById('btn-report-open').style.display = 'none'; document.getElementById('btn-admin-open').style.display = 'none';
    currentExam = wrongQuestions; userAnswers = {}; currentIdx = 0; mode = 'practice'; isQuizRunning = true; timeLeft = practiceTimeLimit; hasSaved = false;
    const elTimer = document.getElementById('timer'); if(elTimer) { elTimer.innerText = `${Math.floor(timeLeft/60)}:${(timeLeft%60).toString().padStart(2,'0')}`; }
    quizStartTime = Date.now(); document.getElementById('main-header').style.display = 'flex'; showScreen('screen-quiz'); renderQuestion(); startTimer();
};


document.getElementById('btn-download-template').onclick = () => {
    const templateData = [{ "STT": 1, "Họ và Tên": "Nguyễn Văn A", "Lớp": "9A1", "SBD": "01", "Trường": "THCS Thuỷ Phương" }, { "STT": 2, "Họ và Tên": "Trần Thị B", "Lớp": "9A2", "SBD": "02", "Trường": "THCS Thuỷ Phương" }];
    const ws = XLSX.utils.json_to_sheet(templateData);
    ws['!cols'] = [{wch: 5}, {wch: 30}, {wch: 10}, {wch: 10}, {wch: 30}];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "DanhSachHocSinh");
    XLSX.writeFile(wb, "Mau_DanhSachHocSinh.xlsx");
};
document.getElementById('btn-trigger-import').onclick = () => { document.getElementById('file-import-students').click(); };

document.getElementById('btn-delete-all-students').onclick = () => {
    pendingAuthAction = 'delete_all_students';
    if (auth.currentUser && !auth.currentUser.isAnonymous) { executePendingAdminAction(); return; }
    document.getElementById('auth-action-title').innerText = "Xác nhận Xóa TOÀN BỘ HS";
    document.getElementById('delete-pw').value = ''; document.getElementById('delete-email').value = '';
    document.getElementById('delete-auth-modal').style.display = 'flex';
};

document.getElementById('file-import-students').onchange = (e) => {
    const file = e.target.files[0]; if (!file) return;
    const reader = new FileReader();
    reader.onload = function(e) {
        try {
            const data = new Uint8Array(e.target.result);
            const workbook = XLSX.read(data, {type: 'array'});
            const worksheet = workbook.Sheets[workbook.SheetNames[0]];
            const json = XLSX.utils.sheet_to_json(worksheet);

            importedStudentsCache = []; let duplicateCount = 0;

            json.forEach(row => {
                let name = (row["Họ và Tên"] || row["Họ tên"] || row["Name"] || "").toString().trim();
                let cls = (row["Lớp"] || row["Class"] || "").toString().trim();
                let sbd = (row["SBD"] || row["Số báo danh"] || "").toString().trim();
                let sch = (row["Trường"] || row["School"] || "THCS Thuỷ Phương").toString().trim();
                if(name) {
                    let isDupDB = globalStudentList.some(s => s.name === name && s.class === cls && s.school === sch);
                    let isDupCache = importedStudentsCache.some(s => s.name === name && s.class === cls && s.school === sch);
                    if(!isDupDB && !isDupCache) { importedStudentsCache.push({ name: name, class: cls, sbd: sbd, school: sch, timestamp: new Date().toISOString() }); } else { duplicateCount++; }
                }
            });

            if (importedStudentsCache.length > 0) {
                pendingAuthAction = 'import_students';
                if (auth.currentUser && !auth.currentUser.isAnonymous) { executePendingAdminAction(); return; }
                let msg = "Xác nhận Import " + importedStudentsCache.length + " HS";
                if(duplicateCount > 0) msg += " (Bỏ qua " + duplicateCount + " trùng)";
                document.getElementById('auth-action-title').innerText = msg;
                document.getElementById('delete-pw').value = ''; document.getElementById('delete-email').value = '';
                document.getElementById('delete-auth-modal').style.display = 'flex';
            } else {
                if(duplicateCount > 0) showCustomAlert(`Đã bỏ qua ${duplicateCount} học sinh do trùng lặp! Không có dữ liệu mới.`); else showCustomAlert("File không có dữ liệu hợp lệ!");
            }
        } catch(error) { showCustomAlert("Lỗi đọc file Excel. Vui lòng dùng file mẫu!"); }
        document.getElementById('file-import-students').value = '';
    };
    reader.readAsArrayBuffer(file);
};






const WORD_TEMPLATE_VERSION = '1.0';

const wordXmlEscape = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&apos;');

const downloadBlob = (blob, filename) => {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = filename; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
};







const wordRunXml = (text, options = {}) => {
    const safe = wordXmlEscape(text);
    const rPr = [];
    if (options.bold) rPr.push('<w:b/>');
    if (options.italics) rPr.push('<w:i/>');
    if (options.size) rPr.push(`<w:sz w:val="${options.size}"/><w:szCs w:val="${options.size}"/>`);
    return `<w:r>${rPr.length ? `<w:rPr>${rPr.join('')}</w:rPr>` : ''}<w:t xml:space="preserve">${safe}</w:t></w:r>`;
};

const wordParagraphXml = (text = '', options = {}) => {
    const pPr = [];
    if (options.heading) pPr.push(`<w:pStyle w:val="${options.heading}"/>`);
    if (options.after != null) pPr.push(`<w:spacing w:after="${options.after}"/>`);
    if (options.align) pPr.push(`<w:jc w:val="${options.align}"/>`);
    const runs = Array.isArray(text)
        ? text.map(x => wordRunXml(x.text, x)).join('')
        : wordRunXml(text, options);
    return `<w:p>${pPr.length ? `<w:pPr>${pPr.join('')}</w:pPr>` : ''}${runs}</w:p>`;
};

const wordQuestionXml = (title, bodyLines, answer, explanation) => {
    let out = '';
    out += wordParagraphXml(title, { bold: true, after: 100 });
    bodyLines.forEach(line => { out += wordParagraphXml(line, { after: 60 }); });
    out += wordParagraphXml(`Đáp án: ${answer}`, { bold: true, after: 60 });
    out += wordParagraphXml(`Giải thích: ${explanation}`, { after: 160 });
    return out;
};

const crc32Table = (() => {
    const table = new Uint32Array(256);
    for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = (c & 1) ? (0xEDB88320 ^ (c >>> 1)) : (c >>> 1);
        table[n] = c >>> 0;
    }
    return table;
})();

const wordCrc32 = (bytes) => {
    let c = 0xFFFFFFFF;
    for (let i = 0; i < bytes.length; i++) c = crc32Table[(c ^ bytes[i]) & 0xFF] ^ (c >>> 8);
    return (c ^ 0xFFFFFFFF) >>> 0;
};

const wordU16 = (n) => new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF]);
const wordU32 = (n) => new Uint8Array([n & 0xFF, (n >>> 8) & 0xFF, (n >>> 16) & 0xFF, (n >>> 24) & 0xFF]);
const wordConcat = (parts) => {
    const total = parts.reduce((sum, a) => sum + a.length, 0);
    const out = new Uint8Array(total);
    let offset = 0;
    parts.forEach(a => { out.set(a, offset); offset += a.length; });
    return out;
};

const createStoredZip = (entries) => {
    const encoder = new TextEncoder();
    const localParts = [];
    const centralParts = [];
    let offset = 0;

    entries.forEach(entry => {
        const nameBytes = encoder.encode(entry.name);
        const data = typeof entry.data === 'string' ? encoder.encode(entry.data) : entry.data;
        const crc = wordCrc32(data);
        if (nameBytes.length > 0xFFFF || data.length > 0xFFFFFFFF) {
            throw new Error(`WORD-E03: Dữ liệu "${entry.name}" vượt giới hạn ZIP.`);
        }

        const local = wordConcat([
            new Uint8Array([0x50,0x4B,0x03,0x04]),
            wordU16(20), wordU16(0), wordU16(0), wordU16(0), wordU16(0),
            wordU32(crc), wordU32(data.length), wordU32(data.length),
            wordU16(nameBytes.length), wordU16(0), nameBytes, data
        ]);
        localParts.push(local);

        const central = wordConcat([
            new Uint8Array([0x50,0x4B,0x01,0x02]),
            wordU16(20), wordU16(20), wordU16(0), wordU16(0), wordU16(0), wordU16(0),
            wordU32(crc), wordU32(data.length), wordU32(data.length),
            wordU16(nameBytes.length), wordU16(0), wordU16(0), wordU16(0), wordU16(0),
            wordU32(0), wordU32(offset), nameBytes
        ]);
        centralParts.push(central);
        offset += local.length;
    });

    const centralOffset = offset;
    const centralSize = centralParts.reduce((sum, a) => sum + a.length, 0);
    const count = entries.length;
    if (count > 0xFFFF || centralOffset > 0xFFFFFFFF || centralSize > 0xFFFFFFFF) {
        throw new Error('WORD-E03: ZIP vượt giới hạn định dạng DOCX.');
    }

    const eocd = wordConcat([
        new Uint8Array([0x50,0x4B,0x05,0x06]),
        wordU16(0), wordU16(0), wordU16(count), wordU16(count),
        wordU32(centralSize), wordU32(centralOffset), wordU16(0)
    ]);
    return new Blob([...localParts, ...centralParts, eocd], { type: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' });
};

const buildWordTemplateBlob = () => {
    if (typeof Blob === 'undefined' || typeof TextEncoder === 'undefined') throw new Error('WORD-E01: Trình duyệt không hỗ trợ Blob/TextEncoder cần thiết để tạo file Word.');
    const body = [];
    body.push(wordParagraphXml('MẪU NGÂN HÀNG ĐỀ VẬT LÝ 9 - IMPORT 40 CÂU',{bold:true,size:32,align:'center',after:180}));
    body.push(wordParagraphXml('Phiên bản mẫu: 2.0',{italics:true,align:'center',after:120}));
    body.push(wordParagraphXml('CẤU TRÚC: PHẦN I = 24 MCQ; PHẦN II = 8 Đúng/Sai (4 ý a-d/câu); PHẦN III = 8 trả lời ngắn. Giữ nguyên nhãn A-D, a-d, Đáp án và Giải thích.',{bold:true,after:160}));
    body.push(wordParagraphXml('Có thể thay toàn bộ nội dung mẫu. Công thức nên dùng text/Unicode như Ω, ρ, μ, Δ, m², m³; không cần Equation của Word.',{after:120}));
    body.push(wordParagraphXml('PHẦN I - TRẮC NGHIỆM',{bold:true,size:28,after:120}));
        body.push(wordQuestionXml('Câu 1. [Nội dung câu hỏi trắc nghiệm 1]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 1]'));
        body.push(wordQuestionXml('Câu 2. [Nội dung câu hỏi trắc nghiệm 2]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 2]'));
        body.push(wordQuestionXml('Câu 3. [Nội dung câu hỏi trắc nghiệm 3]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 3]'));
        body.push(wordQuestionXml('Câu 4. [Nội dung câu hỏi trắc nghiệm 4]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 4]'));
        body.push(wordQuestionXml('Câu 5. [Nội dung câu hỏi trắc nghiệm 5]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 5]'));
        body.push(wordQuestionXml('Câu 6. [Nội dung câu hỏi trắc nghiệm 6]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 6]'));
        body.push(wordQuestionXml('Câu 7. [Nội dung câu hỏi trắc nghiệm 7]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 7]'));
        body.push(wordQuestionXml('Câu 8. [Nội dung câu hỏi trắc nghiệm 8]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 8]'));
        body.push(wordQuestionXml('Câu 9. [Nội dung câu hỏi trắc nghiệm 9]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 9]'));
        body.push(wordQuestionXml('Câu 10. [Nội dung câu hỏi trắc nghiệm 10]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 10]'));
        body.push(wordQuestionXml('Câu 11. [Nội dung câu hỏi trắc nghiệm 11]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 11]'));
        body.push(wordQuestionXml('Câu 12. [Nội dung câu hỏi trắc nghiệm 12]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 12]'));
        body.push(wordQuestionXml('Câu 13. [Nội dung câu hỏi trắc nghiệm 13]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 13]'));
        body.push(wordQuestionXml('Câu 14. [Nội dung câu hỏi trắc nghiệm 14]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 14]'));
        body.push(wordQuestionXml('Câu 15. [Nội dung câu hỏi trắc nghiệm 15]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 15]'));
        body.push(wordQuestionXml('Câu 16. [Nội dung câu hỏi trắc nghiệm 16]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 16]'));
        body.push(wordQuestionXml('Câu 17. [Nội dung câu hỏi trắc nghiệm 17]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 17]'));
        body.push(wordQuestionXml('Câu 18. [Nội dung câu hỏi trắc nghiệm 18]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 18]'));
        body.push(wordQuestionXml('Câu 19. [Nội dung câu hỏi trắc nghiệm 19]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 19]'));
        body.push(wordQuestionXml('Câu 20. [Nội dung câu hỏi trắc nghiệm 20]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 20]'));
        body.push(wordQuestionXml('Câu 21. [Nội dung câu hỏi trắc nghiệm 21]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 21]'));
        body.push(wordQuestionXml('Câu 22. [Nội dung câu hỏi trắc nghiệm 22]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 22]'));
        body.push(wordQuestionXml('Câu 23. [Nội dung câu hỏi trắc nghiệm 23]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 23]'));
        body.push(wordQuestionXml('Câu 24. [Nội dung câu hỏi trắc nghiệm 24]', ['A. [Phương án A]','B. [Phương án B]','C. [Phương án C]','D. [Phương án D]'], 'A', '[Giải thích câu 24]'));
    body.push(wordParagraphXml('PHẦN II - ĐÚNG / SAI',{bold:true,size:28,after:120}));
        body.push(wordParagraphXml('Câu 25. [Ngữ cảnh/câu dẫn Đúng-Sai 1]',{bold:true,after:100}));
        body.push(wordParagraphXml('a) [Mệnh đề a] — Đúng',{after:50})); body.push(wordParagraphXml('b) [Mệnh đề b] — Sai',{after:50})); body.push(wordParagraphXml('c) [Mệnh đề c] — Đúng',{after:50})); body.push(wordParagraphXml('d) [Mệnh đề d] — Sai',{after:50}));
        body.push(wordParagraphXml('Đáp án: Đúng, Sai, Đúng, Sai',{bold:true,after:50})); body.push(wordParagraphXml('Giải thích: [Giải thích câu 25]',{after:160}));
        body.push(wordParagraphXml('Câu 26. [Ngữ cảnh/câu dẫn Đúng-Sai 2]',{bold:true,after:100}));
        body.push(wordParagraphXml('a) [Mệnh đề a] — Đúng',{after:50})); body.push(wordParagraphXml('b) [Mệnh đề b] — Sai',{after:50})); body.push(wordParagraphXml('c) [Mệnh đề c] — Đúng',{after:50})); body.push(wordParagraphXml('d) [Mệnh đề d] — Sai',{after:50}));
        body.push(wordParagraphXml('Đáp án: Đúng, Sai, Đúng, Sai',{bold:true,after:50})); body.push(wordParagraphXml('Giải thích: [Giải thích câu 26]',{after:160}));
        body.push(wordParagraphXml('Câu 27. [Ngữ cảnh/câu dẫn Đúng-Sai 3]',{bold:true,after:100}));
        body.push(wordParagraphXml('a) [Mệnh đề a] — Đúng',{after:50})); body.push(wordParagraphXml('b) [Mệnh đề b] — Sai',{after:50})); body.push(wordParagraphXml('c) [Mệnh đề c] — Đúng',{after:50})); body.push(wordParagraphXml('d) [Mệnh đề d] — Sai',{after:50}));
        body.push(wordParagraphXml('Đáp án: Đúng, Sai, Đúng, Sai',{bold:true,after:50})); body.push(wordParagraphXml('Giải thích: [Giải thích câu 27]',{after:160}));
        body.push(wordParagraphXml('Câu 28. [Ngữ cảnh/câu dẫn Đúng-Sai 4]',{bold:true,after:100}));
        body.push(wordParagraphXml('a) [Mệnh đề a] — Đúng',{after:50})); body.push(wordParagraphXml('b) [Mệnh đề b] — Sai',{after:50})); body.push(wordParagraphXml('c) [Mệnh đề c] — Đúng',{after:50})); body.push(wordParagraphXml('d) [Mệnh đề d] — Sai',{after:50}));
        body.push(wordParagraphXml('Đáp án: Đúng, Sai, Đúng, Sai',{bold:true,after:50})); body.push(wordParagraphXml('Giải thích: [Giải thích câu 28]',{after:160}));
        body.push(wordParagraphXml('Câu 29. [Ngữ cảnh/câu dẫn Đúng-Sai 5]',{bold:true,after:100}));
        body.push(wordParagraphXml('a) [Mệnh đề a] — Đúng',{after:50})); body.push(wordParagraphXml('b) [Mệnh đề b] — Sai',{after:50})); body.push(wordParagraphXml('c) [Mệnh đề c] — Đúng',{after:50})); body.push(wordParagraphXml('d) [Mệnh đề d] — Sai',{after:50}));
        body.push(wordParagraphXml('Đáp án: Đúng, Sai, Đúng, Sai',{bold:true,after:50})); body.push(wordParagraphXml('Giải thích: [Giải thích câu 29]',{after:160}));
        body.push(wordParagraphXml('Câu 30. [Ngữ cảnh/câu dẫn Đúng-Sai 6]',{bold:true,after:100}));
        body.push(wordParagraphXml('a) [Mệnh đề a] — Đúng',{after:50})); body.push(wordParagraphXml('b) [Mệnh đề b] — Sai',{after:50})); body.push(wordParagraphXml('c) [Mệnh đề c] — Đúng',{after:50})); body.push(wordParagraphXml('d) [Mệnh đề d] — Sai',{after:50}));
        body.push(wordParagraphXml('Đáp án: Đúng, Sai, Đúng, Sai',{bold:true,after:50})); body.push(wordParagraphXml('Giải thích: [Giải thích câu 30]',{after:160}));
        body.push(wordParagraphXml('Câu 31. [Ngữ cảnh/câu dẫn Đúng-Sai 7]',{bold:true,after:100}));
        body.push(wordParagraphXml('a) [Mệnh đề a] — Đúng',{after:50})); body.push(wordParagraphXml('b) [Mệnh đề b] — Sai',{after:50})); body.push(wordParagraphXml('c) [Mệnh đề c] — Đúng',{after:50})); body.push(wordParagraphXml('d) [Mệnh đề d] — Sai',{after:50}));
        body.push(wordParagraphXml('Đáp án: Đúng, Sai, Đúng, Sai',{bold:true,after:50})); body.push(wordParagraphXml('Giải thích: [Giải thích câu 31]',{after:160}));
        body.push(wordParagraphXml('Câu 32. [Ngữ cảnh/câu dẫn Đúng-Sai 8]',{bold:true,after:100}));
        body.push(wordParagraphXml('a) [Mệnh đề a] — Đúng',{after:50})); body.push(wordParagraphXml('b) [Mệnh đề b] — Sai',{after:50})); body.push(wordParagraphXml('c) [Mệnh đề c] — Đúng',{after:50})); body.push(wordParagraphXml('d) [Mệnh đề d] — Sai',{after:50}));
        body.push(wordParagraphXml('Đáp án: Đúng, Sai, Đúng, Sai',{bold:true,after:50})); body.push(wordParagraphXml('Giải thích: [Giải thích câu 32]',{after:160}));
    body.push(wordParagraphXml('PHẦN III - TRẢ LỜI NGẮN',{bold:true,size:28,after:120}));
        body.push(wordQuestionXml('Câu 33. [Nội dung câu hỏi trả lời ngắn 1]', [], '0', '[Giải thích câu 33]'));
        body.push(wordQuestionXml('Câu 34. [Nội dung câu hỏi trả lời ngắn 2]', [], '0', '[Giải thích câu 34]'));
        body.push(wordQuestionXml('Câu 35. [Nội dung câu hỏi trả lời ngắn 3]', [], '0', '[Giải thích câu 35]'));
        body.push(wordQuestionXml('Câu 36. [Nội dung câu hỏi trả lời ngắn 4]', [], '0', '[Giải thích câu 36]'));
        body.push(wordQuestionXml('Câu 37. [Nội dung câu hỏi trả lời ngắn 5]', [], '0', '[Giải thích câu 37]'));
        body.push(wordQuestionXml('Câu 38. [Nội dung câu hỏi trả lời ngắn 6]', [], '0', '[Giải thích câu 38]'));
        body.push(wordQuestionXml('Câu 39. [Nội dung câu hỏi trả lời ngắn 7]', [], '0', '[Giải thích câu 39]'));
        body.push(wordQuestionXml('Câu 40. [Nội dung câu hỏi trả lời ngắn 8]', [], '0', '[Giải thích câu 40]'));
    body.push(wordParagraphXml('LƯU Ý KHI SOẠN FILE',{bold:true,size:28,after:120}));
    body.push(wordParagraphXml('MCQ phải có đủ A-D và một đáp án. Đúng/Sai phải đủ a-d và 4 đáp án. Trả lời ngắn phải có đáp án. Không để phương án rỗng. Không dùng nhiều đáp án cho một MCQ.',{after:100}));
    const documentXml=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;
    const contentTypes=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
    const rootRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
    const docRels=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
    const styles=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault></w:docDefaults></w:styles>`;
    const core=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/"><dc:title>Mẫu Ngân Hàng Đề Vật Lý 9 - Import 40 câu</dc:title><dc:creator>Hệ thống luyện tập</dc:creator></cp:coreProperties>`;
    const app=`<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties"><Application>Web Question Bank</Application></Properties>`;
    const blob=createStoredZip([{name:'[Content_Types].xml',data:contentTypes},{name:'_rels/.rels',data:rootRels},{name:'word/document.xml',data:documentXml},{name:'word/styles.xml',data:styles},{name:'word/_rels/document.xml.rels',data:docRels},{name:'docProps/core.xml',data:core},{name:'docProps/app.xml',data:app}]);
    if(!blob||blob.size<1000) throw new Error(`WORD-E04: File DOCX tạo ra quá nhỏ (${blob?.size||0} bytes).`);
    return blob;
};

document.getElementById('btn-download-q-template').onclick = async () => {
    const btn = document.getElementById('btn-download-q-template');
    const originalText = btn.innerHTML;
    try {
        if (typeof document === 'undefined' || typeof window === 'undefined') {
            throw new Error('WORD-E01: Môi trường trình duyệt không khả dụng.');
        }
        btn.disabled = true;
        btn.innerHTML = '⏳ ĐANG TẠO WORD...';
        showCustomAlert('🛠️ Đang dựng file Word mẫu, vui lòng chờ...');

        let blob;
        try {
            blob = buildWordTemplateBlob();
        } catch (buildError) {
            throw buildError instanceof Error ? buildError : new Error(`WORD-E02: ${String(buildError)}`);
        }

        try {
            downloadBlob(blob, 'Mau_NganHangDe_TungBai.docx');
        } catch (downloadError) {
            throw new Error(`WORD-E05: Đã tạo file Word (${blob.size} bytes) nhưng trình duyệt không cho phép tải xuống. ${downloadError?.message || downloadError}`);
        }

        showCustomAlert(`✅ TẠO & TẢI WORD THÀNH CÔNG!<br>📄 Mau_NganHangDe_TungBai.docx<br>📦 ${(blob.size / 1024).toFixed(1)} KB`);
    } catch (error) {
        console.error('[WORD TEMPLATE ERROR]', error);
        const message = String(error?.message || error || 'Lỗi không xác định');
        let userMessage = '❌ KHÔNG TẠO ĐƯỢC FILE WORD MẪU.<br>';
        if (/WORD-E01/.test(message)) {
            userMessage += '🌐 WORD-E01 — Trình duyệt không hỗ trợ API cần thiết.<br>';
        } else if (/WORD-E02/.test(message)) {
            userMessage += '⚙️ WORD-E02 — Lỗi dựng nội dung Word.<br>';
        } else if (/WORD-E03/.test(message)) {
            userMessage += '📦 WORD-E03 — Lỗi đóng gói cấu trúc DOCX.<br>';
        } else if (/WORD-E04/.test(message)) {
            userMessage += '📄 WORD-E04 — File DOCX tạo ra không hợp lệ hoặc quá nhỏ.<br>';
        } else if (/WORD-E05/.test(message)) {
            userMessage += '⬇️ WORD-E05 — Word đã tạo nhưng trình duyệt không cho tải xuống.<br>';
        } else {
            userMessage += '⚠️ WORD-E99 — Lỗi không xác định.<br>';
        }
        userMessage += `Chi tiết: ${wordXmlEscape(message)}`;
        showCustomAlert(userMessage);
    } finally {
        btn.disabled = false;
        btn.innerHTML = originalText;
    }
};

document.getElementById('btn-trigger-import-q').onclick = () => {
    const selectedTopic = document.getElementById('import-q-topic').value;
    if(!selectedTopic) {
        showCustomAlert('⚠️ Vui lòng CHỌN CHUYÊN ĐỀ ở menu trước khi Import!');
        return;
    }
    document.getElementById('file-import-questions').click();
};

document.getElementById('btn-delete-all-q').onclick = () => {
    pendingAuthAction = 'delete_all_questions';
    if (auth.currentUser && !auth.currentUser.isAnonymous) { executePendingAdminAction(); return; }
    document.getElementById('auth-action-title').innerText = 'Xóa TOÀN BỘ Kho Đề';
    document.getElementById('delete-pw').value = ''; document.getElementById('delete-email').value = '';
    document.getElementById('delete-auth-modal').style.display = 'flex';
};

const cleanLine = (value) => String(value ?? '')
    .normalize('NFC')
    .replace(/\u00a0/g, ' ')
    .replace(/[\uFEFF\u200B\u200C\u200D]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

const escapeQuestionHtml = (value) => String(value ?? '')
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;').replace(/'/g, '&#39;');

const getWordParagraphs = (html) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString('<div id="word-root">' + html + '</div>', 'text/html');
    const root = doc.getElementById('word-root');
    const blocks = [];
    const blockTags = new Set(['P', 'LI', 'H1', 'H2', 'H3', 'H4', 'H5', 'H6', 'TD', 'TH']);
    const supMap = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾','n':'ⁿ','i':'ⁱ' };
    const subMap = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋','=':'₌','(':'₍',')':'₎','a':'ₐ','e':'ₑ','h':'ₕ','i':'ᵢ','j':'ⱼ','k':'ₖ','l':'ₗ','m':'ₘ','n':'ₙ','o':'ₒ','p':'ₚ','r':'ᵣ','s':'ₛ','t':'ₜ','u':'ᵤ','v':'ᵥ','x':'ₓ' };
    const addBlock = (node) => {
        const clone = node.cloneNode(true);
        clone.querySelectorAll('sup').forEach(el => el.replaceWith([...el.textContent].map(ch => supMap[ch] || ch).join('')));
        clone.querySelectorAll('sub').forEach(el => el.replaceWith([...el.textContent].map(ch => subMap[ch] || ch).join('')));
        const images = [];
        clone.querySelectorAll('img').forEach(img => {
            const src = img.getAttribute('src') || '';
            const alt = img.getAttribute('alt') || '';
            if (/^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/]+=*$/i.test(src)) {
                images.push('<img class="imported-question-image" src="' + src.replace(/"/g, '&quot;') + '" alt="' + alt.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;') + '">');
            }
            img.remove();
        });
        clone.querySelectorAll('br').forEach(br => br.replaceWith(' '));
        const text = cleanLine(clone.textContent);
        if (text || images.length) blocks.push({ text, images: images.join(''), imageCount: images.length });
    };
    const walk = (node) => {
        if (!node || node.nodeType !== 1) return;
        const tag = node.tagName;
        if (blockTags.has(tag)) {
            const hasNestedBlocks = !!node.querySelector('p, li, h1, h2, h3, h4, h5, h6');
            if ((tag === 'LI' || tag === 'TD' || tag === 'TH') && hasNestedBlocks) {
                [...node.childNodes].forEach(walk);
            } else {
                addBlock(node);
            }
            return;
        }
        [...node.childNodes].forEach(walk);
    };
    [...root.childNodes].forEach(walk);
    if (!blocks.length) {
        const fallback = cleanLine(root.textContent);
        if (fallback) blocks.push({ text: fallback, images: '' });
    }
    return blocks;
};

const parseWordSection = (text) => {
    const match = cleanLine(text).match(/^(?:phần\s*)?(iii|ii|i|3|2|1)(?=$|\s|[).:–—-])\s*[).:–—-]?\s*(.*)$/i);
    if (!match) return null;
    const number = match[1].toLowerCase();
    const label = cleanLine(match[2]).toLocaleLowerCase('vi');
    let type = '';
    if (/đúng/.test(label) && /sai/.test(label)) type = 'tf';
    else if (/trả\s*lời\s*ngắn|tự\s*luận\s*ngắn|short\s*answer/.test(label)) type = 'short';
    else if (/trắc\s*nghiệm|chọn\s*đáp\s*án|multiple\s*choice/.test(label)) type = 'mcq';
    else type = ({ i: 'mcq', '1': 'mcq', ii: 'tf', '2': 'tf', iii: 'short', '3': 'short' })[number] || '';
    return type ? { type, tail: '' } : null;
};

const matchWordQuestion = (text) => {
    const normalized = cleanLine(text);
    const prefixed = normalized.match(/^(?:câu(?:\s*(?:hỏi|số))?\s*#?|question\s*#?)\s*(\d+(?:\.\d+)*)\s*[.)]?\s*[:.)\-–—]?\s*/i);
    if (prefixed) return { length: prefixed[0].length, number: prefixed[1] };
    const numbered = normalized.match(/^(\d+\.\d+(?:\.\d+)*)\s*[.)]\s*/) || normalized.match(/^(\d+)\s*[.)]\s*/);
    if (!numbered) return null;
    return { length: numbered[0].length, number: numbered[1] };
};

const parseTruthValue = (value) => {
    const token = cleanLine(value).toLocaleLowerCase('vi').replace(/[.!?]+$/g, '');
    if (/^(true|đúng|đ|d|t|1|yes)$/.test(token)) return true;
    if (/^(false|sai|s|0|no)$/.test(token)) return false;
    return null;
};

const parseWordQuestionBank = async (arrayBuffer) => {
    if (!window.mammoth) throw new Error('Thư viện đọc Word chưa tải xong.');
    const result = await window.mammoth.convertToHtml({ arrayBuffer }, {
        styleMap: [
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh"
        ]
    });
    const blocks = getWordParagraphs(result.value);
    const sections = { mcq: [], tf: [], short: [] };
    const pendingQuestions = { mcq: [], tf: [], short: [] };
    const rejected = [];
    const warnings = [];
    const questionNumbers = { mcq: [], tf: [], short: [] };
    const allQuestionNumbers = [];
    const keyedAnswers = { mcq: {}, tf: {}, short: {} };
    let section = '';
    let answerKeyMode = '';
    let answerKeyNumber = '';
    let current = null;
    let pendingQuestionNumber = '';
    let candidateCount = 0;
    let imageCount = 0;
    let unsupportedCount = 0;
    let numberingIssueCount = 0;

    const append = (oldValue, text, images, html = false) => {
        const value = cleanLine(text);
        const part = (html ? escapeQuestionHtml(value) : value) + (images || '');
        if (!part) return oldValue || '';
        return oldValue ? oldValue + ' ' + part : part;
    };
    const addIssue = (message) => {
        if (current && !current.issues.includes(message)) current.issues.push(message);
    };
    const keyFor = (number) => String(number || '').trim();
    const inferMcqAnswer = (text) => {
        const value = cleanLine(text);
        const labelled = value.match(/(?:đáp\s*án(?:\s+đúng)?|phương\s*án|chọn)\s*(?:là)?\s*[:：-]?\s*\(?([A-D])\)?(?=$|[\s.,;:!?])/i);
        if (labelled) return labelled[1].toUpperCase();
        const reversed = value.match(/(?:^|[\s;])([A-D])\s+(?:là\s+)?đáp\s*án(?:\s+đúng)?(?=$|[\s.,;:!?])/i);
        return reversed ? reversed[1].toUpperCase() : '';
    };
    const readTfAnswers = (text, target) => {
        const matchers = [
            /(?:^|[\s;])([a-d])\s*[.)\-:]\s*(Đúng|Sai|Đ|S|D|T|True|False)(?=$|[\s;,.!?):\]])/gi,
            /(?:^|[\s;])(?:ý\s*)?([a-d])\s+(đúng|sai)(?=$|[\s;,.!?):\]])/gi
        ];
        matchers.forEach(matcher => {
            let match;
            while ((match = matcher.exec(text))) {
                const idx = match[1].toLowerCase().charCodeAt(0) - 97;
                const value = parseTruthValue(match[2]);
                if (value !== null) target[idx] = value;
            }
        });
    };
    const finish = () => {
        if (!current) return;
        if (current.type === 'mcq' && !current.a) current.a = inferMcqAnswer(current.e);
        if (current.type === 'mcq' && /^[A-D]$/i.test(current.a)) {
            const answerIndex = current.a.toUpperCase().charCodeAt(0) - 65;
            if (current.o[answerIndex]) current.a = current.o[answerIndex];
        }
        if (current.type === 'tf') {
            const inferred = {};
            readTfAnswers(current.e, inferred);
            current.sts.forEach((item, index) => {
                if (typeof item.a !== 'boolean' && typeof inferred[index] === 'boolean') item.a = inferred[index];
            });
        }
        pendingQuestions[current.type].push(current);
        current = null;
    };

    const startQuestion = (number) => {
        finish();
        candidateCount++;
        if (number) {
            questionNumbers[section].push(String(number));
            allQuestionNumbers.push(String(number));
        }
        current = { type: section, number: String(number || ''), q: '', ctx: '', a: '', o: [], e: '', sts: [], issues: [], region: 'content' };
    };
    const addTfItem = (label, rawText, images) => {
        let text = cleanLine(rawText);
        let answer = null;
        const inline = text.match(/(?:\s*[—–-]\s*|\s*[|:]\s*)(Đúng|Sai|Đ|S|D|T|True|False)\s*$/i);
        if (inline) {
            answer = parseTruthValue(inline[1]);
            text = cleanLine(text.slice(0, inline.index));
        }
        current.sts.push({ l: label.toLowerCase() + ')', t: append('', text, images, true), a: answer });
    };
    const addContent = (rawText, images) => {
        const text = cleanLine(rawText);
        if (!text && !images) return;
        if (current.type === 'mcq') {
            const labels = [...text.matchAll(/(?:^|\s)([A-D])\s*[.)\-:]\s*/gi)];
            const sequence = labels.map(m => m[1].toUpperCase());
            const inlineOptions = sequence.length >= 2 && sequence.every((v, i) => v === String.fromCharCode(65 + i));
            if (labels.length && (labels[0].index === 0 || inlineOptions)) {
                if (labels[0].index > 0 && inlineOptions) current.q = append(current.q, text.slice(0, labels[0].index), '', true);
                labels.forEach((m, i) => {
                    const start = m.index + m[0].length;
                    const end = i + 1 < labels.length ? labels[i + 1].index : text.length;
                    const option = cleanLine(text.slice(start, end));
                    if (option || (images && i === labels.length - 1)) current.o.push(option);
                });
                if (images && current.o.length) current.o[current.o.length - 1] = append(current.o[current.o.length - 1], '', images, false);
                return;
            }
            if (current.o.length) current.o[current.o.length - 1] = append(current.o[current.o.length - 1], text, images, false);
            else current.q = append(current.q, text, images, true);
            return;
        }
        if (current.type === 'tf') {
            const markers = [...text.matchAll(/(?:^|\s)([a-d])\s*[.)\-:]\s*/gi)];
            const labels = markers.map(m => m[1].toLowerCase());
            const orderedList = labels.length >= 2 && labels.every((v, i) => v === String.fromCharCode(97 + i));
            if (markers.length && (markers[0].index === 0 || current.sts.length > 0 || labels[0] === 'a' || orderedList)) {
                if (markers[0].index > 0) current.ctx = append(current.ctx, text.slice(0, markers[0].index), '', true);
                markers.forEach((m, i) => {
                    const start = m.index + m[0].length;
                    const end = i + 1 < markers.length ? markers[i + 1].index : text.length;
                    addTfItem(m[1], text.slice(start, end), i === markers.length - 1 ? images : '');
                });
                return;
            }
            if (current.sts.length) {
                const item = current.sts[current.sts.length - 1];
                item.t = append(item.t, text, images, true);
            } else current.ctx = append(current.ctx, text, images, true);
            return;
        }
        const shortAnswer = text.match(/(?:^|\s)A\s*[.)]\s*([+-]?\d+(?:[.,]\d+)?(?:\s*,\s*\d+)*)\s*$/i);
        if (shortAnswer && !current.a) {
            const beforeAnswer = cleanLine(text.slice(0, shortAnswer.index));
            if (beforeAnswer) current.q = append(current.q, beforeAnswer, '', true);
            current.a = cleanLine(shortAnswer[1]).replace(/\s+/g, '');
        } else current.q = append(current.q, text, images, true);
    };

    const setAnswer = (raw) => {
        let value = cleanLine(raw).replace(/[;,.]+$/g, '');
        if (!value) { addIssue('Dòng đáp án không có giá trị.'); return; }
        if (current.type === 'short') value = value.replace(/^A\s*[.)]\s*/i, '');
        if (current.type === 'mcq') {
            if (/^[A-D]\s*[,/&]\s*[A-D]$/i.test(value)) {
                addIssue('Phát hiện nhiều đáp án trắc nghiệm (' + value + '), nhưng hệ thống hiện chỉ chấm một lựa chọn mỗi câu.');
                return;
            }
            const letter = value.match(/^(?:(?:đáp\s*án(?:\s+đúng)?|phương\s*án|chọn|đúng)\s*(?:là)?\s*[:：-]?\s*)?\(?([A-D])\)?(?:\s*(?:là\s+đáp\s*án|đúng))?$/i);
            if (letter) {
                const index = letter[1].toUpperCase().charCodeAt(0) - 65;
                current.a = current.o[index] || letter[1].toUpperCase();
            } else current.a = value;
            return;
        }
        if (current.type === 'tf') {
            const labelled = [...value.matchAll(/(?:^|[\s,;|])([a-d])\s*[.)\-:]\s*(Đúng|Sai|Đ|S|D|T|True|False)/gi)];
            if (labelled.length) {
                const assigned = new Set();
                labelled.forEach(match => {
                    const index = match[1].toLowerCase().charCodeAt(0) - 97;
                    const parsed = parseTruthValue(match[2]);
                    if (assigned.has(index)) addIssue('Ý ' + match[1].toLowerCase() + ' có nhiều đáp án.');
                    assigned.add(index);
                    if (parsed === null) addIssue('Không hiểu đáp án Đúng/Sai "' + match[2] + '".');
                    if (current.sts[index]) current.sts[index].a = parsed;
                });
                if (assigned.size !== 4) addIssue('Dòng đáp án gắn nhãn chưa có đủ các ý a–d.');
                return;
            }
            const values = value.split(/[\s,;|/]+/).filter(Boolean);
            if (values.length !== 4) {
                addIssue('Dòng đáp án Đúng/Sai có ' + values.length + ' giá trị; cần đúng 4 giá trị.');
                return;
            }
            values.forEach((token, index) => {
                const parsed = parseTruthValue(token);
                if (parsed === null) addIssue('Không hiểu đáp án Đúng/Sai "' + token + '". Dùng Đúng/Sai, Đ/S hoặc T/F.');
                if (current.sts[index]) current.sts[index].a = parsed;
            });
            return;
        }
        current.a = value;
    };

    const processText = (rawText, images) => {
        const text = cleanLine(rawText);
        if (!text && !images) return;
        if (current.region === 'explanation') {
            current.e = append(current.e, text, images, true);
            if (current.type === 'tf') {
                const inferred = {};
                readTfAnswers(text, inferred);
                Object.entries(inferred).forEach(([index, value]) => {
                    if (current.sts[Number(index)]) current.sts[Number(index)].a = value;
                });
            } else if (current.type === 'mcq' && !current.a) current.a = inferMcqAnswer(text);
            return;
        }
        const explanation = text.match(/(?:^|\s)(?:giải\s*thích(?:\s+chi\s+tiết)?|lời\s*giải)\s*[:.)\-–—]\s*/i);
        const answer = text.match(/(?:^|\s)(?:đáp\s*án|đáp\s*số|answer)\s*[:.)\-–—]?\s*/i);
        if (answer && (!explanation || answer.index < explanation.index)) {
            const before = cleanLine(text.slice(0, answer.index));
            if (before) addContent(before, '');
            const answerStart = answer.index + answer[0].length;
            const explanationAfter = text.slice(answerStart).match(/(?:^|\s)(?:giải\s*thích(?:\s+chi\s+tiết)?|lời\s*giải)\s*[:.)\-–—]\s*/i);
            const answerEnd = explanationAfter ? answerStart + explanationAfter.index : text.length;
            setAnswer(text.slice(answerStart, answerEnd));
            current.region = 'answer';
            if (explanationAfter) {
                current.region = 'explanation';
                current.e = append(current.e, text.slice(answerEnd + explanationAfter[0].length), images, true);
            } else if (images) addIssue('Hình nằm cùng dòng với nhãn đáp án; hãy đặt hình ở câu hỏi hoặc giải thích.');
            return;
        }
        if (explanation) {
            const before = cleanLine(text.slice(0, explanation.index));
            if (before) addContent(before, '');
            current.region = 'explanation';
            current.e = append(current.e, text.slice(explanation.index + explanation[0].length), images, true);
            return;
        }
        if (current.region === 'answer') return;
        addContent(text, images);
    };

    const saveKeyBlock = (text) => {
        if (!answerKeyNumber || !answerKeyMode) return;
        const key = keyFor(answerKeyNumber);
        if (answerKeyMode === 'mcq') {
            const letter = inferMcqAnswer(text) || (cleanLine(text).match(/đáp\s*án\s*[:.]?\s*([A-D])\b/i) || [])[1];
            if (letter) keyedAnswers.mcq[key] = { ...(keyedAnswers.mcq[key] || {}), answer: letter.toUpperCase() };
        } else if (answerKeyMode === 'tf') {
            const target = (keyedAnswers.tf[key] = keyedAnswers.tf[key] || { truth: {} }).truth;
            readTfAnswers(text, target);
            const sequence = cleanLine(text).split(/[;,\s|/]+/).filter(Boolean);
            if (sequence.length === 4 && sequence.every(token => parseTruthValue(token) !== null)) {
                sequence.forEach((token, index) => { target[index] = parseTruthValue(token); });
            }
        } else {
            const ans = cleanLine(text).match(/(?:đáp\s*án\s*[:.]?\s*)?(?:A\s*[.)]\s*)?(-?\d+(?:[.,]\d+)?)/i);
            if (ans) keyedAnswers.short[key] = { answer: ans[1] };
        }
    };

    let answerTableMode = false;
    let answerTableType = '';
    let answerTableExplicitType = '';
    let answerTableNumber = '';
    let answerTableTruthIndex = 0;
    const parseAnswerTableBlock = (text) => {
        const normalized = cleanLine(text);
        const part = normalized.match(/^phần\s*(iii|ii|i|3|2|1)\b/i);
        if (part) {
            answerTableExplicitType = parseWordSection('PHẦN ' + part[1])?.type || '';
            answerTableType = answerTableExplicitType;
            answerTableNumber = '';
            answerTableTruthIndex = 0;
            return true;
        }
        if (/^(?:câu|đáp\s*án|answer|a|b|c|d)$/i.test(normalized)) return true;
        const number = normalized.match(/^(\d+\.\d+(?:\.\d+)*)\.?$/);
        if (number) {
            answerTableNumber = number[1];
            answerTableTruthIndex = 0;
            const suffix = Number(answerTableNumber.split('.').pop());
            const inferredType = suffix >= 33 ? 'short' : (suffix >= 25 ? 'tf' : (suffix >= 1 && suffix <= 24 ? 'mcq' : ''));
            answerTableType = answerTableExplicitType || inferredType || answerTableType;
            return true;
        }
        if (!answerTableNumber) return true;
        const key = keyFor(answerTableNumber);
        if (answerTableType === 'mcq') {
            const letter = normalized.match(/^(?:đáp\s*án\s*)?\(?([A-D])\)?\s*[.)]?$/i);
            if (letter) keyedAnswers.mcq[key] = { ...(keyedAnswers.mcq[key] || {}), answer: letter[1].toUpperCase() };
            answerTableNumber = '';
        } else if (answerTableType === 'tf') {
            const target = (keyedAnswers.tf[key] = keyedAnswers.tf[key] || { truth: {} }).truth;
            const sequence = normalized.split(/[;,\s|/]+/).filter(Boolean);
            if (sequence.length === 4 && sequence.every(token => parseTruthValue(token) !== null)) {
                sequence.forEach((token, index) => { target[index] = parseTruthValue(token); });
                answerTableNumber = '';
                answerTableTruthIndex = 0;
            } else {
                const value = parseTruthValue(normalized);
                if (value !== null) {
                    target[answerTableTruthIndex] = value;
                    answerTableTruthIndex++;
                    if (answerTableTruthIndex >= 4) {
                        answerTableNumber = '';
                        answerTableTruthIndex = 0;
                    }
                } else {
                    const beforeCount = Object.keys(target).length;
                    readTfAnswers(normalized, target);
                    if (Object.keys(target).length > beforeCount) answerTableNumber = '';
                }
            }
        } else if (answerTableType === 'short') {
            const value = normalized.replace(/^(?:đáp\s*số|đáp\s*án)\s*[:：-]?\s*/i, '').replace(/^A\s*[.)]\s*/i, '');
            if (value) keyedAnswers.short[key] = { answer: value };
            answerTableNumber = '';
        } else answerTableNumber = '';
        return true;
    };

    blocks.forEach(block => {
        imageCount += block.imageCount || 0;
        const text = cleanLine(block.text);
        if (/^(?:thạc\s*sĩ|nếu\s+phát\s+hiện|cảm\s*ơn\s+trợ\s+l[ií]|vui\s+lòng\s+nhận)/i.test(text)) {
            finish();
            answerTableMode = false;
            answerKeyMode = '';
            section = '';
            pendingQuestionNumber = '';
            return;
        }
        if (/^bảng\s+đáp\s*án\b/i.test(text)) {
            finish();
            answerKeyMode = '';
            answerTableMode = true;
            answerTableType = '';
            answerTableExplicitType = '';
            answerTableNumber = '';
            answerTableTruthIndex = 0;
            return;
        }
        if (answerTableMode) {
            parseAnswerTableBlock(text);
            return;
        }
        const keyHeading = text.match(/^giải\s*thích\s+chi\s+tiết\s+phần\s+(iii|ii|i|3|2|1)\b/i);
        if (keyHeading) {
            finish();
            answerKeyMode = parseWordSection('PHẦN ' + keyHeading[1])?.type || '';
            answerKeyNumber = '';
            pendingQuestionNumber = '';
            return;
        }
        const heading = text.match(/^(?:phần\s*)?(iii|ii|i|3|2|1)(?=$|\s|[).:–—-])\s*[).:–—-]?\s*(.*)$/i);
        if (heading) {
            const parsedHeading = parseWordSection(text);
            if (parsedHeading) {
                finish();
                section = parsedHeading.type;
                answerKeyMode = '';
                answerKeyNumber = '';
                pendingQuestionNumber = '';
                const tail = cleanLine(heading[2]);
                const tailMark = matchWordQuestion(tail);
                if (tailMark) {
                    const rest = cleanLine(tail.slice(tailMark.length));
                    if (/^(?:YCCĐ(?=$|\s|:)|yêu\s*cầu\s*cần\s*đạt(?=$|\s|:))/i.test(rest)) pendingQuestionNumber = tailMark.number;
                    else {
                        startQuestion(tailMark.number);
                        processText(rest, block.images);
                    }
                }
                return;
            }
        }

        const marker = matchWordQuestion(text);
        if (answerKeyMode) {
            if (marker) {
                answerKeyNumber = marker.number;
                saveKeyBlock(text.slice(marker.length));
            } else saveKeyBlock(text);
            return;
        }
        if (!section) return;
        if (marker) {
            const rest = cleanLine(text.slice(marker.length));
            if (/^(?:YCCĐ(?=$|\s|:)|yêu\s*cầu\s*cần\s*đạt(?=$|\s|:))/i.test(rest)) {
                finish();
                pendingQuestionNumber = marker.number;
                return;
            }
            pendingQuestionNumber = '';
            startQuestion(marker.number);
            processText(rest, block.images);
            return;
        }
        if (/^(?:YCCĐ(?=$|\s|:)|yêu\s*cầu\s*cần\s*đạt(?=$|\s|:)|\[(?:biết|hiểu|vận dụng|vận dụng cao)\])/i.test(text)) return;
        if (!current && pendingQuestionNumber && text) {
            startQuestion(pendingQuestionNumber);
            pendingQuestionNumber = '';
        }
        if (current) processText(text, block.images);
    });
    finish();

    Object.keys(keyedAnswers.mcq).forEach(key => {
        const entry = keyedAnswers.mcq[key];
        const question = pendingQuestions.mcq.find(item => item._importNumber === key);
        if (question && !question.a) {
            const index = entry.answer.charCodeAt(0) - 65;
            question.a = question.o[index] || entry.answer;
        }
    });
    Object.keys(keyedAnswers.tf).forEach(key => {
        const question = pendingQuestions.tf.find(item => item._importNumber === key);
        if (question) question.sts.forEach((item, index) => {
            if (typeof item.a !== 'boolean' && typeof keyedAnswers.tf[key].truth[index] === 'boolean') item.a = keyedAnswers.tf[key].truth[index];
        });
    });
    Object.keys(keyedAnswers.short).forEach(key => {
        const question = pendingQuestions.short.find(item => item._importNumber === key);
        if (question && !question.a) question.a = keyedAnswers.short[key].answer;
    });

    for (const type of ['mcq', 'tf', 'short']) {
        pendingQuestions[type].forEach(question => {
            const content = type === 'tf' ? question.ctx : question.q;
            let reason = '';
            if (!content) reason = 'Thiếu nội dung câu hỏi/ngữ cảnh.';
            else if (type === 'mcq' && question.o.length < 2) reason = 'Thiếu phương án; cần ít nhất 2 lựa chọn.';
            else if (type === 'mcq' && !question.a) reason = 'Chưa nhận diện được đáp án trắc nghiệm.';
            else if (type === 'tf' && question.sts.length !== 4) reason = 'Nhận diện được ' + question.sts.length + '/4 ý Đúng/Sai.';
            else if (type === 'tf' && !question.sts.every(item => typeof item.a === 'boolean')) reason = 'Thiếu hoặc chưa hiểu đủ đáp án Đúng/Sai.';
            else if (type === 'short' && !question.a) reason = 'Chưa nhận diện được đáp án ngắn.';
            if (!reason && question.issues.length) reason = question.issues.join(' ');
            if (reason) {
                rejected.push({ number: question.number, type, reason });
                return;
            }
            if (type === 'mcq') sections.mcq.push({ q: question.q, a: question.a, o: question.o, e: question.e, _importNumber: question._importNumber });
            else if (type === 'tf') sections.tf.push({ ctx: question.ctx, sts: question.sts, e: question.e, _importNumber: question._importNumber });
            else sections.short.push({ q: question.q, a: question.a, e: question.e, _importNumber: question._importNumber });
        });
    }
    for (const type of ['mcq', 'tf', 'short']) {
        sections[type].forEach(question => { delete question._importNumber; });
    }
    const total = sections.mcq.length + sections.tf.length + sections.short.length;
    const expectedMatch = blocks.slice(0, 8).map(block => block.text).join(' ').match(/\b(\d+)\s+câu(?:\s+hỏi)?\b/i);
    const expectedCount = expectedMatch ? Number(expectedMatch[1]) : 0;
    if (expectedCount && candidateCount !== expectedCount) warnings.push('Tài liệu ghi ' + expectedCount + ' câu nhưng parser mới nhận dạng ' + candidateCount + ' dấu câu hỏi. Không tải khi số này chưa khớp.');
    if (expectedCount && total !== expectedCount) warnings.push('Chỉ có ' + total + '/' + expectedCount + ' câu hợp lệ sau khi kiểm tra đáp án.');
    else if (total !== candidateCount) warnings.push('Có ' + (candidateCount - total) + ' câu nhận diện được nhưng chưa đủ dữ liệu để nhập.');
    if (expectedCount && allQuestionNumbers.length === expectedCount
        && allQuestionNumbers.every(number => /^\d+$/.test(number))
        && new Set(allQuestionNumbers).size === allQuestionNumbers.length) {
        const importedNumbers = new Set(allQuestionNumbers.map(Number));
        const missing = [];
        for (let number = 1; number <= expectedCount; number++) {
            if (!importedNumbers.has(number)) missing.push(number);
        }
        const outOfRange = [...importedNumbers].filter(number => number < 1 || number > expectedCount);
        if (missing.length || outOfRange.length) {
            numberingIssueCount++;
            warnings.push('Dãy số câu không liên tục 1–' + expectedCount +
                (missing.length ? '; thiếu ' + missing.slice(0, 12).join(', ') : '') +
                (outOfRange.length ? '; ngoài phạm vi: ' + outOfRange.slice(0, 12).join(', ') : '') + '.');
        }
    }
    if (!section) warnings.push('Không nhận diện được tiêu đề phần; hãy dùng PHẦN I, PHẦN II hoặc PHẦN III.');
    if (!candidateCount) warnings.push('Không nhận diện được câu hỏi. Hãy kiểm tra cách ghi số câu và tiêu đề PHẦN.');
    if (rejected.length) warnings.push('Có ' + rejected.length + ' câu bị loại vì thiếu trường bắt buộc hoặc dữ liệu mơ hồ.');
    Object.entries(questionNumbers).forEach(([type, numbers]) => {
        if (new Set(numbers).size !== numbers.length) {
            numberingIssueCount++;
            warnings.push('Có số câu bị lặp trong phần ' + type.toUpperCase() + '.');
        }
        const groups = new Map();
        numbers.forEach(number => {
            const parts = String(number).split('.');
            const prefix = parts.slice(0, -1).join('.');
            const value = Number(parts[parts.length - 1]);
            if (!groups.has(prefix)) groups.set(prefix, new Set());
            groups.get(prefix).add(value);
        });
        const missing = [];
        groups.forEach((values, prefix) => {
            const ordered = [...values].sort((a, b) => a - b);
            for (let n = 1; n < ordered.length; n++) {
                if (ordered[n] - ordered[n - 1] > 1) missing.push((prefix ? prefix + '.' : '') + (ordered[n - 1] + 1));
            }
        });
        if (missing.length) {
            numberingIssueCount++;
            warnings.push('Có thể thiếu số câu ở phần ' + type.toUpperCase() + ': ' + missing.slice(0, 12).join(', ') + (missing.length > 12 ? '…' : '') + '.');
        }
    });
    if (imageCount) warnings.push('DOCX có ' + imageCount + ' hình/công thức; các hình được nhúng vào nội dung. Kiểm tra kỹ preview và dung lượng trước khi tải.');
    const unsupportedMessages = (result.messages || []).filter(message => /unsupported|unrecognized|ignored/i.test((message.message || '') + ' ' + (message.type || '')));
    unsupportedCount = unsupportedMessages.length;
    if (unsupportedCount) warnings.push('Bộ đọc Word báo ' + unsupportedCount + ' thành phần không hỗ trợ; hãy dùng bản DOCX đã chuyển công thức sang ảnh chuẩn trước khi tải.');
    const estimatedBytes = new Blob([JSON.stringify(sections)]).size;
    if (estimatedBytes > 850 * 1024) warnings.push('Dữ liệu có hình/công thức nhúng khá lớn (' + Math.ceil(estimatedBytes / 1024) + ' KB); Firestore có giới hạn kích thước tài liệu.');
    const importReady = total > 0
        && total === candidateCount
        && (!expectedCount || total === expectedCount)
        && numberingIssueCount === 0
        && unsupportedCount === 0;
    const hasBlockingErrors = !importReady;
    return { sections, total, candidateCount, expectedCount, rejected, warnings, estimatedBytes, imageCount, unsupportedCount, hasBlockingErrors, importReady };
};

const renderQuestionImportPreview = (topic, result) => {
    let modal = document.getElementById('question-import-preview-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'question-import-preview-modal';
        modal.className = 'modal-overlay';
        modal.setAttribute('role', 'presentation');
        modal.innerHTML = '<div class="modal-box question-import-preview" role="dialog" aria-modal="true" aria-labelledby="question-import-preview-title">' +
            '<h3 id="question-import-preview-title">XEM TRƯỚC ĐỀ WORD</h3>' +
            '<p id="question-import-preview-topic"></p>' +
            '<div class="question-import-counts">' +
                '<div><b id="question-import-count-mcq">0</b><span>Trắc nghiệm</span></div>' +
                '<div><b id="question-import-count-tf">0</b><span>Đúng/Sai</span></div>' +
                '<div><b id="question-import-count-short">0</b><span>Trả lời ngắn</span></div>' +
                '<div><b id="question-import-count-errors">0</b><span>Câu lỗi/bị loại</span></div>' +
                '<div><b id="question-import-count-total">0</b><span>Tổng hợp lệ</span></div>' +
            '</div>' +
            '<div id="question-import-preview-status" class="question-import-preview-status"></div>' +
            '<div id="question-import-preview-details" class="question-import-preview-details"></div>' +
            '<label id="question-import-preview-ack-wrap" class="question-import-preview-ack"><input id="question-import-preview-ack" type="checkbox"><span id="question-import-preview-ack-text"></span></label>' +
            '<div class="question-import-preview-actions"><button type="button" id="question-import-preview-cancel" class="btn btn-gray">HỦY</button><button type="button" id="question-import-preview-confirm" class="btn btn-fire">XÁC NHẬN TẢI LÊN</button></div>' +
        '</div>';
        document.body.appendChild(modal);
        modal.addEventListener('mousedown', event => {
            if (event.target === modal) {
                pendingQuestionImport = null;
                modal.style.display = 'none';
            }
        });
        modal.querySelector('#question-import-preview-cancel').onclick = () => {
            pendingQuestionImport = null;
            modal.style.display = 'none';
        };
        modal.querySelector('#question-import-preview-ack').onchange = () => {
            modal.querySelector('#question-import-preview-confirm').disabled =
                !pendingQuestionImport || pendingQuestionImport.result.total === 0 ||
                !pendingQuestionImport.result.importReady ||
                pendingQuestionImport.result.estimatedBytes > 900 * 1024 ||
                (pendingQuestionImport.needsAcknowledgement && !modal.querySelector('#question-import-preview-ack').checked);
        };
        modal.querySelector('#question-import-preview-confirm').onclick = () => {
            const staged = pendingQuestionImport;
            if (!staged || staged.result.total === 0) {
                showCustomAlert('Không có câu hợp lệ để tải lên.');
                return;
            }
            if (!staged.result.importReady) {
                showCustomAlert('Đề chưa đủ câu hợp lệ để nhập. Hãy kiểm tra số câu và các lỗi trong phần xem trước.');
                return;
            }
            if (staged.result.estimatedBytes > 900 * 1024) {
                showCustomAlert('Dữ liệu đề quá lớn để ghi an toàn vào một tài liệu Firebase. Hãy giảm kích thước ảnh.');
                return;
            }
            if (staged.needsAcknowledgement && !modal.querySelector('#question-import-preview-ack').checked) {
                showCustomAlert('Hãy xác nhận đã xem các cảnh báo trước khi tải lên.');
                return;
            }
            importedQuestionsCache = {};
            importedQuestionsCache[staged.topic] = staged.result.sections;
            pendingAuthAction = 'import_questions';
            pendingQuestionImport = null;
            modal.style.display = 'none';
            const total = staged.result.total;
            if (auth.currentUser && !auth.currentUser.isAnonymous) {
                executePendingAdminAction();
                return;
            }
            document.getElementById('auth-action-title').innerText = 'Xác nhận đẩy ' + total + ' câu lên Cloud';
            document.getElementById('delete-pw').value = '';
            document.getElementById('delete-email').value = '';
            document.getElementById('delete-auth-modal').style.display = 'flex';
        };
    }

    pendingQuestionImport = {
        topic,
        result,
        needsAcknowledgement: !!result.warnings.length
    };
    const counts = result.sections;
    const topicOption = document.getElementById('import-q-topic').selectedOptions[0];
    modal.querySelector('#question-import-preview-topic').textContent = 'Chuyên đề: ' + (topicOption ? topicOption.textContent : topic);
    modal.querySelector('#question-import-count-mcq').textContent = counts.mcq.length;
    modal.querySelector('#question-import-count-tf').textContent = counts.tf.length;
    modal.querySelector('#question-import-count-short').textContent = counts.short.length;
    modal.querySelector('#question-import-count-errors').textContent = result.rejected.length;
    modal.querySelector('#question-import-count-total').textContent = result.total;
    const status = modal.querySelector('#question-import-preview-status');
    status.textContent = 'Tìm thấy ' + result.candidateCount + (result.expectedCount ? '/' + result.expectedCount : '') + ' câu; hợp lệ ' + result.total +
        (result.rejected.length ? '; lỗi ' + result.rejected.length + ' câu.' : '') +
        (!result.importReady ? ' Chưa đạt đủ số câu hợp lệ; hệ thống chưa cho tải lên để tránh lưu đề thiếu câu.' : (result.warnings.length ? ' Hãy đọc cảnh báo trước khi xác nhận.' : ' Đủ điều kiện tải lên.'));
    status.classList.toggle('has-warning', !!(result.rejected.length || result.warnings.length));
    const details = modal.querySelector('#question-import-preview-details');
    details.replaceChildren();
    const messages = [...result.warnings];
    result.rejected.slice(0, 12).forEach(item => messages.push((item.number ? 'Câu ' + item.number + ': ' : 'Câu không rõ số: ') + item.reason));
    if (result.rejected.length > 12) messages.push('… và ' + (result.rejected.length - 12) + ' câu lỗi khác.');
    if (!messages.length) {
        const ok = document.createElement('p');
        ok.textContent = 'Không phát hiện câu bị loại hoặc cảnh báo.';
        details.appendChild(ok);
    } else {
        const list = document.createElement('ul');
        messages.forEach(message => {
            const li = document.createElement('li');
            li.textContent = message;
            list.appendChild(li);
        });
        details.appendChild(list);
    }
    const ackWrap = modal.querySelector('#question-import-preview-ack-wrap');
    const ack = modal.querySelector('#question-import-preview-ack');
    ack.checked = false;
    ackWrap.hidden = !pendingQuestionImport.needsAcknowledgement || result.total === 0 || !result.importReady;
    modal.querySelector('#question-import-preview-ack-text').textContent =
        'Tôi biết mình đang làm gì — chấp nhận tải lên ' + result.total + ' câu hợp lệ và thay thế ngân hàng đề hiện tại của chuyên đề này.';
    const confirm = modal.querySelector('#question-import-preview-confirm');
    confirm.disabled = !result.importReady || result.estimatedBytes > 900 * 1024 || pendingQuestionImport.needsAcknowledgement;
    modal.style.display = 'flex';
};

document.getElementById('file-import-questions').onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    const selectedTopic = document.getElementById('import-q-topic').value;
    if (!selectedTopic) {
        showCustomAlert('⚠️ Vui lòng CHỌN CHUYÊN ĐỀ trước khi Import!');
        event.target.value = '';
        return;
    }
    try {
        const result = await parseWordQuestionBank(await file.arrayBuffer());
        renderQuestionImportPreview(selectedTopic, result);
    } catch (error) {
        console.error('Lỗi đọc Word:', error);
        showCustomAlert('Lỗi đọc file Word. Vui lòng kiểm tra file .docx và kết nối thư viện Mammoth.');
    }
    event.target.value = '';
};


function deleteEntry(id, type) {
    pendingAuthAction = type === 'student' ? 'delete_student' : 'delete_result';
    currentDeleteId = id;
    if (auth.currentUser && !auth.currentUser.isAnonymous) { executePendingAdminAction(); return; }
    document.getElementById('auth-action-title').innerText = "Xác nhận Xoá";
    document.getElementById('delete-pw').value = ''; document.getElementById('delete-email').value = '';
    document.getElementById('delete-auth-modal').style.display = 'flex';
}

async function executePendingAdminAction() {
    if (pendingAuthAction === 'delete_result' && currentDeleteId) {
        const batch = writeBatch(db);
        batch.delete(doc(db, 'artifacts', appId_fixed, 'public', 'data', collectionName, currentDeleteId));
        batch.delete(doc(db, 'artifacts', appId_fixed, 'public', 'data', collectionPublicResults, currentDeleteId));
        await batch.commit();
        renderAdmin(); currentDeleteId = null;
    }
    else if (pendingAuthAction === 'delete_student' && currentDeleteId) {
        await deleteDoc(doc(db, 'artifacts', appId_fixed, 'public', 'data', collectionStudents, currentDeleteId));
        renderAdminStudents(); currentDeleteId = null;
    }
    else if (pendingAuthAction === 'delete_all_students') {
        showCustomAlert("Đang xóa toàn bộ học sinh, vui lòng đợi...");
        try {
            const snap = await getDocs(collection(db, 'artifacts', appId_fixed, 'public', 'data', collectionStudents));
            const deletePromises = []; snap.forEach(docSnap => { deletePromises.push(deleteDoc(doc(db, 'artifacts', appId_fixed, 'public', 'data', collectionStudents, docSnap.id))); });
            await Promise.all(deletePromises);
            showCustomAlert("✅ Đã làm sạch toàn bộ danh sách học sinh!"); renderAdminStudents();
        } catch(e) { showCustomAlert(getFirebaseErrorMessage(e, "APP-STU-002", "Không thể xóa dữ liệu học sinh.")); }
    }
    else if (pendingAuthAction === 'import_students' && importedStudentsCache.length > 0) {
        showCustomAlert("Đang tiến hành nhập dữ liệu, vui lòng đợi...");
        try {
            const studentsRef = collection(db, 'artifacts', appId_fixed, 'public', 'data', collectionStudents);
            for (let offset = 0; offset < importedStudentsCache.length; offset += 500) {
                const batch = writeBatch(db);
                importedStudentsCache.slice(offset, offset + 500).forEach(student => {
                    batch.set(doc(studentsRef), student);
                });
                await batch.commit();
            }
            showCustomAlert(`✅ Đã import thành công ${importedStudentsCache.length} học sinh!`);
            importedStudentsCache = []; renderAdminStudents();
        } catch(e) { showCustomAlert(getFirebaseErrorMessage(e, "APP-STU-001", "Không thể import danh sách học sinh.")); }
    }
    else if (pendingAuthAction === 'import_questions' && Object.keys(importedQuestionsCache).length > 0) {
        const invalidBank = Object.values(importedQuestionsCache).some(bank => !bank || !['mcq','tf','short'].some(key => Array.isArray(bank[key]) && bank[key].length));
        const oversizedBank = Object.values(importedQuestionsCache).some(bank => new Blob([JSON.stringify(bank)]).size > 900 * 1024);
        if (invalidBank || oversizedBank) {
            showCustomAlert(invalidBank ? 'Không có câu hợp lệ để ghi vào Firebase.' : 'Dữ liệu đề vượt ngưỡng an toàn 900 KB; hãy giảm kích thước ảnh.');
            importedQuestionsCache = {};
            pendingAuthAction = null;
            return;
        }
        showCustomAlert("Đang tiến hành đẩy kho đề lên Đám mây, vui lòng đợi...");
        try {
            const topics = Object.keys(importedQuestionsCache);
            for(let i = 0; i < topics.length; i++) {
                const tCode = topics[i];
                await setDoc(doc(db, 'artifacts', appId_fixed, 'public', 'data', collectionBanks, tCode), importedQuestionsCache[tCode], { merge: false });
            }
            showCustomAlert(`✅ Đã đẩy thành công dữ liệu của ${topics.length} chuyên đề!`);
            importedQuestionsCache = {}; renderAdminQuestions();
        } catch(e) { showCustomAlert(getFirebaseErrorMessage(e, "APP-BANK-001", "Không thể import ngân hàng đề.")); }
    }
    else if (pendingAuthAction === 'delete_all_questions') {
        showCustomAlert("Đang xóa toàn bộ Ngân hàng đề, vui lòng đợi...");
        try {
            const snap = await getDocs(collection(db, 'artifacts', appId_fixed, 'public', 'data', collectionBanks));
            const deletePromises = []; snap.forEach(docSnap => { deletePromises.push(deleteDoc(doc(db, 'artifacts', appId_fixed, 'public', 'data', collectionBanks, docSnap.id))); });
            await Promise.all(deletePromises);
            showCustomAlert("✅ Đã xóa sạch kho đề trên hệ thống!"); renderAdminQuestions();
        } catch(e) { showCustomAlert(getFirebaseErrorMessage(e, "APP-BANK-002", "Không thể xóa ngân hàng đề.")); }
    }
    else if (pendingAuthAction === 'config') {
        const pTime = parseInt(document.getElementById('cfg-time-practice').value), tTime = parseInt(document.getElementById('cfg-time-test').value), mHints = parseInt(document.getElementById('cfg-max-hints').value);
        if(isNaN(pTime) || isNaN(tTime) || isNaN(mHints) || pTime <= 0 || tTime <= 0 || mHints < 0) { showCustomAlert("⚠️ Vui lòng nhập số hợp lệ!"); return; }
        try { await setDoc(doc(db, 'artifacts', appId_fixed, 'public', 'data', 'config', 'timer_settings'), { practice: pTime, test: tTime, maxHints: mHints, lastUpdated: new Date().toISOString() }, { merge: true }); practiceTimeLimit = pTime * 60; testTimeLimit = tTime * 60; maxHintsAllowed = mHints; showCustomAlert("Đã cập nhật cấu hình thành công!"); } catch(e) { showCustomAlert(getFirebaseErrorMessage(e, "APP-CFG-001", "Không thể lưu cấu hình.")); }
    } else if (pendingAuthAction === 'inbox') { renderAdminInbox(); }
    pendingAuthAction = null;
}

document.getElementById('btn-save-config').onclick = () => {
    pendingAuthAction = 'config';
    if (auth.currentUser && !auth.currentUser.isAnonymous) { executePendingAdminAction(); return; }
    document.getElementById('auth-action-title').innerText = "Lưu Cấu Hình";
    document.getElementById('delete-pw').value = ''; document.getElementById('delete-email').value = '';
    document.getElementById('delete-auth-modal').style.display = 'flex';
};

document.getElementById('btn-admin-inbox').onclick = () => {
    pendingAuthAction = 'inbox';
    if (auth.currentUser && !auth.currentUser.isAnonymous) { executePendingAdminAction(); return; }
    document.getElementById('auth-action-title').innerText = "Mở Hộp Thư 📩";
    document.getElementById('delete-pw').value = ''; document.getElementById('delete-email').value = '';
    document.getElementById('delete-auth-modal').style.display = 'flex';
};

document.getElementById('btn-delete-cancel').onclick = () => { document.getElementById('delete-auth-modal').style.display = 'none'; currentDeleteId = null; pendingAuthAction = null; importedStudentsCache = []; importedQuestionsCache = {}; pendingQuestionImport = null;};

document.getElementById('btn-delete-confirm').onclick = async () => {
    const email = document.getElementById('delete-email').value.trim();
    const pw = document.getElementById('delete-pw').value;
    if (!email || !pw) { showCustomAlert("Vui lòng nhập Email và Mật khẩu!"); return; }

    document.getElementById('btn-delete-confirm').innerText = "...";
    try {
        await signInTeacherAccount(email, pw);
        document.getElementById('delete-auth-modal').style.display = 'none';
        executePendingAdminAction();
    } catch (error) {
        showCustomAlert(getFirebaseErrorMessage(error, "APP-AUTH-001", "Xác thực giáo viên thất bại."));
    }
    document.getElementById('btn-delete-confirm').innerText = "XÁC NHẬN";
};

function syncTeacherAuthButton() {
    const button = document.getElementById('btn-teacher-auth');
    if (!button) return;
    button.textContent = hasTeacherSession() ? '🚪 ĐĂNG XUẤT GIÁO VIÊN' : '🔐 ĐĂNG NHẬP GIÁO VIÊN';
}

async function signInTeacherAccount(email, password) {
    await setPersistence(auth, browserSessionPersistence);
    await signInWithEmailAndPassword(auth, email, password);
    if (!hasTeacherSession()) {
        await signOut(auth);
        await signInAnonymously(auth);
        throw new Error('Tài khoản này chưa được cấp quyền giáo viên.');
    }
}

document.getElementById('btn-admin-open').onclick = () => {
    showScreen('screen-admin');
    setAdminPanelTab('results');
};
document.getElementById('btn-auth-cancel').onclick = () => closeOverlay(document.getElementById('admin-auth-modal'));
document.getElementById('btn-auth-confirm').onclick = async () => {
    const email = document.getElementById('admin-email').value.trim();
    const password = document.getElementById('admin-pw').value;
    if (!email || !password) { showCustomAlert('Vui lòng nhập email và mật khẩu giáo viên.'); return; }
    const button = document.getElementById('btn-auth-confirm');
    button.disabled = true;
    button.textContent = 'ĐANG ĐĂNG NHẬP...';
    try {
        await signInTeacherAccount(email, password);
        const tab = pendingAdminTab || 'results';
        pendingAdminTab = null;
        closeOverlay(document.getElementById('admin-auth-modal'));
        syncTeacherAuthButton();
        setAdminPanelTab(tab);
    } catch (error) {
        showCustomAlert(getFirebaseErrorMessage(error, 'APP-AUTH-001', 'Đăng nhập giáo viên thất bại.'));
    } finally {
        button.disabled = false;
        button.textContent = 'ĐĂNG NHẬP';
    }
};
document.getElementById('btn-teacher-auth').onclick = async () => {
    if (!hasTeacherSession()) {
        pendingAdminTab = null;
        document.getElementById('admin-auth-modal').style.display = 'flex';
        return;
    }
    await signOut(auth);
    await signInAnonymously(auth);
    setAdminPanelTab('results');
    renderAdmin();
    syncTeacherAuthButton();
};

document.getElementById('btn-init-practice').onclick = () => initGame('practice'); document.getElementById('btn-init-test').onclick = () => initGame('test');
document.getElementById('btn-prev').onclick = () => { if(currentIdx > 0) { currentIdx--; renderQuestion(); window.scrollTo(0,0); } };
document.getElementById('btn-next').onclick = () => { if(!isCurrentQuestionComplete()) { showCustomAlert(); return; } if(currentIdx < currentExam.length - 1) { currentIdx++; renderQuestion(); window.scrollTo(0,0); } };
document.getElementById('btn-finish').onclick = () => { if(!isCurrentQuestionComplete()) { showCustomAlert(); return; } document.getElementById('confirm-finish-modal').style.display = 'flex'; };
document.getElementById('btn-modal-cancel').onclick = () => document.getElementById('confirm-finish-modal').style.display = 'none';
document.getElementById('btn-modal-confirm').onclick = () => { document.getElementById('confirm-finish-modal').style.display = 'none'; calculateResult(); };

document.getElementById('btn-admin-close').onclick = async () => {
    if (auth.currentUser && !auth.currentUser.isAnonymous) {
        await signOut(auth);
        await signInAnonymously(auth);
    }
    document.getElementById('main-header').style.display = 'none';
    showScreen('screen-start');
    loadStudentList();
};

document.getElementById('btn-admin-refresh').onclick = () => renderAdmin();
document.getElementById('admin-sort').onchange = () => renderAdmin();
document.getElementById('admin-filter-mode').onchange = () => renderAdmin();
document.getElementById('admin-filter-class').onchange = () => renderAdmin();
document.getElementById('admin-filter-school').onchange = () => renderAdmin();
document.getElementById('admin-filter-topic').onchange = () => renderAdmin();
document.getElementById('btn-cheat-submit').onclick = () => { document.getElementById('cheat-modal').style.display = 'none'; };
document.getElementById('btn-report-open').onclick = () => { document.getElementById('report-modal').style.display = 'flex'; };
document.getElementById('btn-report-cancel').onclick = () => { document.getElementById('report-modal').style.display = 'none'; };

function processImageFile(file) {
    if (!file) return;
    const reader = new FileReader();
    reader.onload = function(event) {
        const img = new Image();
        img.onload = function() {
            const canvas = document.createElement('canvas'); const MAX_WIDTH = 800; const MAX_HEIGHT = 800; let width = img.width; let height = img.height;
            if (width > height) { if (width > MAX_WIDTH) { height *= MAX_WIDTH / width; width = MAX_WIDTH; } } else { if (height > MAX_HEIGHT) { width *= MAX_HEIGHT / height; height = MAX_HEIGHT; } }
            canvas.width = width; canvas.height = height; const ctx = canvas.getContext('2d'); ctx.drawImage(img, 0, 0, width, height);
            reportImageBase64 = canvas.toDataURL('image/jpeg', 0.7);
            document.getElementById('report-img-preview').src = reportImageBase64;
            document.getElementById('report-img-preview').style.display = 'block';
        }
        img.src = event.target.result;
    }
    reader.readAsDataURL(file);
}

document.getElementById('report-file').addEventListener('change', function(e) { processImageFile(e.target.files[0]); });

document.getElementById('btn-report-submit').onclick = async () => {
    const qPos = document.getElementById('report-question').value.trim(); const detail = document.getElementById('report-detail').value.trim();
    if (!qPos && !detail) { showCustomAlert("Vui lòng nhập ít nhất vị trí lỗi hoặc mô tả!"); return; }
    const btn = document.getElementById('btn-report-submit'); btn.innerText = "ĐANG GỬI..."; btn.disabled = true;
    try {
        await addDoc(collection(db, 'artifacts', appId_fixed, 'public', 'data', collectionReports), { name: window.finalUserData?.name || "Học sinh Ẩn danh", question: qPos, detail: detail, image: reportImageBase64, timestamp: new Date().toISOString() });
        document.getElementById('report-modal').style.display = 'none'; showCustomAlert("Cảm ơn bạn đã gửi báo lỗi!");
        document.getElementById('report-question').value = ''; document.getElementById('report-detail').value = ''; document.getElementById('report-file').value = ''; document.getElementById('report-img-preview').style.display = 'none'; reportImageBase64 = "";
    } catch(e) { showCustomAlert(getFirebaseErrorMessage(e, "APP-REPORT-001", "Không thể gửi báo cáo lỗi.")); }
    btn.innerText = "GỬI PHẢN HỒI"; btn.disabled = false;
};

async function renderAdminInbox() {
    document.getElementById('admin-inbox-modal').style.display = 'flex'; const listBody = document.getElementById('inbox-list-body'); listBody.innerHTML = "<tr><td colspan='6'>Đang tải hộp thư...</td></tr>";
    try {
        const snap = await getDocs(collection(db, 'artifacts', appId_fixed, 'public', 'data', collectionReports));
        let reports = []; snap.forEach(d => reports.push({id: d.id, ...d.data()})); reports.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
        if (reports.length === 0) { listBody.innerHTML = "<tr><td colspan='6' style='text-align:center;'>Hộp thư trống. Chưa có báo cáo nào!</td></tr>"; return; }
        listBody.innerHTML = reports.map(r => `<tr><td><small>${new Date(r.timestamp).toLocaleString('vi-VN')}</small></td><td><b>${r.name}</b></td><td>${r.question || '-'}</td><td>${r.detail || '-'}</td><td>${r.image ? `<button class="btn btn-gray btn-view-img" data-img="${r.image}" style="padding:4px 8px; font-size:0.75rem;">Xem ảnh 🖼️</button>` : '-'}</td><td><button class="btn-del-report" data-id="${r.id}" style="background:var(--danger); color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer; font-size: 0.8rem;">Xóa</button></td></tr>`).join('');
        listBody.querySelectorAll('.btn-del-report').forEach(b => { b.onclick = async () => { if (confirm("Xóa báo cáo lỗi này?")) { b.innerText = "..."; b.disabled = true; await deleteDoc(doc(db, 'artifacts', appId_fixed, 'public', 'data', collectionReports, b.dataset.id)); renderAdminInbox(); } } });
        listBody.querySelectorAll('.btn-view-img').forEach(b => { b.onclick = () => { document.getElementById('image-viewer-img').src = b.dataset.img; document.getElementById('image-viewer-modal').style.display = 'flex'; } });
    } catch(e) { console.error("[APP-REPORT-002] Không thể tải hộp thư báo lỗi", e); listBody.innerHTML = "<tr><td colspan='6'>[APP-REPORT-002] Không thể tải hộp thư báo lỗi. Kiểm tra quyền giáo viên và Console.</td></tr>"; }
}
document.getElementById('btn-inbox-close').onclick = () => document.getElementById('admin-inbox-modal').style.display = 'none';

document.getElementById('btn-view-review').onclick = () => {
    const area = document.getElementById('review-area'), content = document.getElementById('review-content'), labels = ['A', 'B', 'C', 'D']; area.style.display = 'block'; let h = '';
    const norm = (s) => (s || "").toString().trim().replace(',','.');
    const pMCQ = 3.0 / (currentExam.filter(q=>q.type==='mcq').length||1), pTF = 2.0 / (currentExam.filter(q=>q.type==='tf').length||1), pShort = 2.0 / (currentExam.filter(q=>q.type==='short').length||1);
    const tfMapReview = {0:0, 1: pTF*0.1/0.5, 2: pTF*0.25/0.5, 3: pTF*0.35/0.5, 4: pTF};
    currentExam.forEach(q => {
        let qText = q.type === 'tf' ? `Câu ${q.displayNum} (Đúng/Sai)` : `Câu ${q.displayNum}. ${q.q}`; let itemScore = 0, scoreHTML = '';
        if(q.type === 'mcq') { itemScore = norm(userAnswers[q.id]||'') === norm(q.a) ? pMCQ : 0; scoreHTML = `<span class="score-badge ${itemScore > 0 ? 'score-plus' : 'score-zero'}">${itemScore > 0 ? '+'+itemScore.toFixed(2) : '0'}đ</span>`; }
        else if(q.type === 'short') { itemScore = checkShortAns(userAnswers[q.id], q.a) ? pShort : 0; scoreHTML = `<span class="score-badge ${itemScore > 0 ? 'score-plus' : 'score-zero'}">${itemScore > 0 ? '+'+itemScore.toFixed(2) : '0'}đ</span>`; }
        else if(q.type === 'tf') { let cp = 0; q.sts.forEach((st, si) => { if((userAnswers[q.id]||{})[si] === st.a) cp++; }); itemScore = tfMapReview[cp] || 0; scoreHTML = `<span class="score-badge ${itemScore > 0 ? 'score-plus' : 'score-zero'}">Đúng ${cp}/4 ý (${itemScore > 0 ? '+'+itemScore.toFixed(2) : '0'}đ)</span>`; }
        h += `<div class="card" style="border-left: 8px solid var(--primary)"><h3>${qText} ${scoreHTML}</h3>`;
        if(q.type === 'mcq') {
            (q.shuffledOptions || q.o).forEach((o, idx) => { const isC = norm(o) === norm(q.a), isU = userAnswers[q.id] === o; h += `<div class="option ${isC?'correct':(isU?'wrong':'')}"><b>${labels[idx]}.</b> ${o} ${isC?'✓':(isU?'✗':'')}</div>`; });
            if(norm(userAnswers[q.id]||'') !== norm(q.a)) h += `<div class="review-choice-box review-wrong" style="padding:10px; border-radius:8px; margin-top:10px; background:#fee2e2; border:1px solid #ef4444;">Bạn chọn: <b>${userAnswers[q.id]||'Chưa chọn'}</b>. Đáp án: <b style="color:#10b981">${q.a}</b></div>`;
        } else if(q.type === 'tf') {
            h += `<div style="background:#f1f5f9; padding:15px; border-radius:12px; margin-bottom:15px; font-style:italic;">${q.ctx}</div>`;
            q.sts.forEach((st, si) => {
                const uV = (userAnswers[q.id] || {})[si], isC = uV === st.a;
                const answerState = uV === undefined ? 'unanswered' : (isC ? 'correct' : 'wrong');
                const chosenText = uV === true ? 'Đúng' : (uV === false ? 'Sai' : 'Chưa trả lời');
                h += `<div class="tf-review-row tf-review-${answerState}"><span class="tf-review-statement">${st.l} ${st.t}</span><div class="tf-review-feedback"><span class="tf-review-selected">Bạn chọn: <b>${chosenText}</b>${uV === undefined ? '' : (isC ? ' ✓' : ' ✗')}</span><span class="tf-review-correct-answer">Đáp án đúng: <b>${st.a ? 'Đúng' : 'Sai'}</b></span></div></div>`;
            });
        } else {
            const isC = checkShortAns(userAnswers[q.id], q.a); h += `<p>Bạn nhập: <b style="color:${isC?'#10b981':'#ef4444'}">${userAnswers[q.id]||'Trống'}</b></p><p>Đáp án đúng: <b style="color:#10b981">${q.a}</b> ${isC?'✓':'✗'}</p>`;
        }
        h += `<div class="explanation"><b>Giải thích:</b><br>${q.e}</div></div>`;
    });
    content.innerHTML = h; const target = document.getElementById('review-heading'); if (target) { setTimeout(async () => { const y = target.getBoundingClientRect().top + window.pageYOffset - 20; window.scrollTo({ top: y, behavior: 'smooth' }); if(window.MathJax) await MathJax.typesetPromise([content]); }, 150); }
};

document.getElementById('btn-export-excel').onclick = () => {
    const dataToExport = window.currentFilteredData || []; if (dataToExport.length === 0) { showCustomAlert("Không có dữ liệu để xuất!"); return; }
    const excelRows = dataToExport.map((item, index) => ({ "STT": index + 1, "Họ và Tên": item.name || "", "Số báo danh": item.sbd || "", "Lớp": item.class || "", "Trường": item.school || "", "Chuyên đề": item.topic || "N/A", "Chế độ làm": item.mode === 'practice' ? "Luyện tập" : "Kiểm tra", "Điểm số": Number((item.score || 0).toFixed(2)), "Thời gian làm (giây)": item.duration || 0, "Ngày nộp bài": new Date(item.timestamp).toLocaleString('vi-VN') }));
    const ws = XLSX.utils.json_to_sheet(excelRows); ws['!cols'] = [{wch: 5}, {wch: 25}, {wch: 12}, {wch: 10}, {wch: 25}, {wch: 35}, {wch: 15}, {wch: 10}, {wch: 18}, {wch: 25}];
    const wb = XLSX.utils.book_new(); XLSX.utils.book_append_sheet(wb, ws, "Báo cáo học tập"); XLSX.writeFile(wb, `KetQua_TongHop_${new Date().getTime()}.xlsx`);
};

function showScreen(id) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById(id).classList.add('active'); }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function startTimer() { clearInterval(timerInt); timerInt = setInterval(() => { timeLeft--; const el = document.getElementById('timer'); if(el) el.innerText = `${Math.floor(timeLeft/60)}:${(timeLeft%60).toString().padStart(2,'0')}`; if(timeLeft <= 0) calculateResult(); }, 1000); }

const triggerCheat = () => { if (canCheckCheat && isQuizRunning && mode === 'test' && !isProcessingCheat) { isProcessingCheat = true; isQuizRunning = false; calculateResult(); document.getElementById('cheat-modal').style.display = 'flex'; } };
document.addEventListener('visibilitychange', () => { if(canCheckCheat && isQuizRunning && mode === 'test' && document.visibilityState === 'hidden') { triggerCheat(); } });
window.addEventListener('blur', () => { setTimeout(() => { if (canCheckCheat && isQuizRunning && mode === 'test' && !document.hasFocus()) { triggerCheat(); } }, 200); });
window.addEventListener('resize', () => { if (canCheckCheat && isQuizRunning && mode === 'test') { if (Math.abs(window.innerWidth - (window.testInitialWidth || window.innerWidth)) > 150) { triggerCheat(); } } });

window.onload = () => {
    document.getElementById('main-header').style.display = 'none';
};


function setLiquidGlassMenu(menu, open, direction) {
    if (direction) menu.dataset.openDirection = direction;
    if (open) {
        clearTimeout(menu._liquidGlassRollTimer);
        menu.hidden = false;
        menu.dataset.rollState = 'opening';
        menu.onanimationend = event => {
            if (event.target === menu && menu.dataset.rollState === 'opening') {
                delete menu.dataset.rollState;
                menu.onanimationend = null;
            }
        };
        return;
    }
    if (menu.hidden || menu.dataset.rollState === 'closing') return;
    menu.dataset.rollState = 'closing';
    const finishClose = () => {
        if (menu.dataset.rollState !== 'closing') return;
        menu.hidden = true;
        delete menu.dataset.rollState;
        menu.onanimationend = null;
        clearTimeout(menu._liquidGlassRollTimer);
    };
    menu.onanimationend = event => {
        if (event.target === menu && menu.dataset.rollState === 'closing') finishClose();
    };
    menu._liquidGlassRollTimer = setTimeout(finishClose, 450);
}

function setupAdminStudentsFilters(options) {
    const controls = document.querySelector('#admin-students-section .admin-controls');
    if (!controls) return;
    const state = window.adminStudentFilterState || (window.adminStudentFilterState = { school: [], class: [] });
    const defs = [
        { key: 'school', label: 'Trường', values: options.school.map(String) },
        { key: 'class', label: 'Lớp', values: options.class.map(String) }
    ];
    const esc = s => String(s).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
    defs.forEach(d => {
        state[d.key] = (state[d.key] || []).map(String).filter(v => d.values.includes(v));
        const oldFilter = document.getElementById('stu-filter-' + d.key);
        if (oldFilter) oldFilter.parentElement.hidden = true;
    });
    let root = controls.querySelector('.admin-student-excel-filters');
    if (!root) {
        root = document.createElement('div');
        root.className = 'admin-student-excel-filters';
        controls.insertBefore(root, document.getElementById('btn-refresh-students'));
    }
    root.innerHTML = defs.map(d => {
        const selected = state[d.key];
        const title = selected.length ? d.label + ' (' + selected.length + ')' : d.label + ': Tất cả';
        const items = d.values.map(v => '<label class="admin-filter-option"><input type="checkbox" data-student-filter="' + d.key + '" value="' + esc(v) + '"' + (selected.includes(v) ? ' checked' : '') + '><span>' + esc(v) + '</span></label>').join('');
        return '<div class="admin-filter-group" data-student-group="' + d.key + '"><button type="button" class="admin-filter-trigger" aria-expanded="false">' + esc(title) + ' ▾</button><div class="admin-filter-menu" hidden><input class="admin-filter-search" type="search" placeholder="Tìm ' + esc(d.label.toLowerCase()) + '..."><div class="admin-filter-options">' + (items || '<small>Chưa có dữ liệu</small>') + '</div><div class="admin-filter-menu-actions"><button type="button" data-student-action="all">Chọn tất cả</button><button type="button" data-student-action="clear">Bỏ lọc</button></div><button type="button" class="admin-filter-apply">Áp dụng</button></div></div>';
    }).join('');
    root.querySelectorAll('.admin-filter-trigger').forEach(button => button.onclick = () => {
        const group = button.closest('.admin-filter-group'), menu = group.querySelector('.admin-filter-menu');
        const open = menu.hidden || menu.dataset.rollState === 'closing';
        root.querySelectorAll('.admin-filter-menu').forEach(item => setLiquidGlassMenu(item, false, 'down'));
        root.querySelectorAll('.admin-filter-trigger').forEach(item => item.setAttribute('aria-expanded', 'false'));
        if (open) setLiquidGlassMenu(menu, true, 'down');
        button.setAttribute('aria-expanded', String(open));
    });
    root.querySelectorAll('.admin-filter-search').forEach(input => input.oninput = () => {
        const query = input.value.trim().toLocaleLowerCase('vi');
        input.closest('.admin-filter-menu').querySelectorAll('.admin-filter-option').forEach(item => item.hidden = !item.innerText.toLocaleLowerCase('vi').includes(query));
    });
    root.querySelectorAll('.admin-filter-group').forEach(group => {
        const key = group.dataset.studentGroup, def = defs.find(item => item.key === key), button = group.querySelector('.admin-filter-trigger');
        const update = () => {
            state[key] = [...group.querySelectorAll('[data-student-filter]:checked')].map(input => input.value);
            button.firstChild.textContent = (state[key].length ? def.label + ' (' + state[key].length + ')' : def.label + ': Tất cả') + ' ▾';
        };
        group.querySelectorAll('[data-student-filter]').forEach(input => input.onchange = update);
        group.querySelector('[data-student-action="all"]').onclick = () => { group.querySelectorAll('[data-student-filter]').forEach(input => input.checked = true); update(); };
        group.querySelector('[data-student-action="clear"]').onclick = () => { group.querySelectorAll('[data-student-filter]').forEach(input => input.checked = false); update(); };
        group.querySelector('.admin-filter-apply').onclick = () => renderAdminStudents();
    });
}

function setupAdminQuestionTopicMenu() {
    const select = document.getElementById('import-q-topic');
    if (!select || select.dataset.glassMenuReady) return;
    select.dataset.glassMenuReady = 'true';
    const wrapper = document.createElement('div');
    wrapper.className = 'admin-single-filter';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'admin-filter-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', 'Chọn chuyên đề để import');
    const menu = document.createElement('div');
    menu.className = 'admin-filter-menu';
    menu.hidden = true;
    const search = document.createElement('input');
    search.type = 'search';
    search.className = 'admin-filter-search';
    search.placeholder = 'Tìm chuyên đề...';
    const optionsBox = document.createElement('div');
    optionsBox.className = 'admin-filter-options';
    [...select.options].forEach(option => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'admin-filter-option admin-single-filter-option';
        item.textContent = option.textContent;
        item.dataset.value = option.value;
        item.dataset.search = option.textContent.toLocaleLowerCase('vi');
        item.setAttribute('role', 'option');
        item.onclick = () => {
            select.value = option.value;
            trigger.textContent = (option.value ? option.textContent : 'Chọn chuyên đề để import') + ' ▾';
            setLiquidGlassMenu(menu, false, 'down');
            trigger.setAttribute('aria-expanded', 'false');
        };
        optionsBox.appendChild(item);
    });
    menu.append(search, optionsBox);
    wrapper.append(trigger, menu);
    select.parentNode.insertBefore(wrapper, select);
    select.hidden = true;
    trigger.textContent = (select.value ? select.options[select.selectedIndex].textContent : 'Chọn chuyên đề để import') + ' ▾';
    trigger.onclick = () => {
        const open = menu.hidden || menu.dataset.rollState === 'closing';
        setLiquidGlassMenu(menu, open, 'down');
        trigger.setAttribute('aria-expanded', String(open));
        if (open) search.focus();
    };
    search.oninput = () => {
        const query = search.value.trim().toLocaleLowerCase('vi');
        optionsBox.querySelectorAll('.admin-single-filter-option').forEach(item => item.hidden = !item.dataset.search.includes(query));
    };
    document.addEventListener('click', event => {
        if (!wrapper.contains(event.target)) {
            setLiquidGlassMenu(menu, false, 'down');
            trigger.setAttribute('aria-expanded', 'false');
        }
    });
}

function setupLoginTopicGlassMenu() {
    const select = document.getElementById('topic-select');
    if (!select || select.dataset.glassMenuReady) return;
    select.dataset.glassMenuReady = 'true';
    const wrapper = document.createElement('div');
    wrapper.className = 'topic-select-glass';
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'topic-select-glass-trigger';
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-label', 'Chọn chuyên đề ôn tập');
    const menu = document.createElement('div');
    menu.className = 'topic-select-glass-menu';
    menu.hidden = true;
    const optionsBox = document.createElement('div');
    optionsBox.setAttribute('role', 'listbox');
    [...select.options].forEach(option => {
        const item = document.createElement('button');
        item.type = 'button';
        item.className = 'topic-select-glass-option';
        item.textContent = option.textContent;
        item.setAttribute('role', 'option');
        item.setAttribute('aria-selected', String(option.value === select.value));
        item.onclick = () => {
            select.value = option.value;
            optionsBox.querySelectorAll('[role=option]').forEach(entry => entry.setAttribute('aria-selected', String(entry === item)));
            trigger.textContent = option.textContent + '  ▾';
            select.dispatchEvent(new Event('change', { bubbles: true }));
            closeMenu();
        };
        optionsBox.appendChild(item);
    });
    menu.appendChild(optionsBox);
    wrapper.append(trigger);
    select.parentNode.insertBefore(wrapper, select);
    select.hidden = true;
    trigger.textContent = select.options[select.selectedIndex].textContent + '  ▾';

    let positionFrame = 0;
    const positionMenu = () => {
        if (menu.hidden) return;
        const rect = trigger.getBoundingClientRect();
        const edge = 10;
        const gap = 7;
        const viewportWidth = document.documentElement.clientWidth;
        const viewportHeight = window.innerHeight;
        const width = Math.min(rect.width, viewportWidth - edge * 2);
        const left = Math.max(edge, Math.min(rect.left, viewportWidth - width - edge));
        const preferredHeight = Math.min(320, viewportHeight * 0.55);
        const spaceBelow = Math.max(0, viewportHeight - rect.bottom - gap - edge);
        const spaceAbove = Math.max(0, rect.top - gap - edge);
        const naturalHeight = Math.min(menu.scrollHeight, preferredHeight);
        const openBelow = spaceBelow >= naturalHeight || spaceBelow >= spaceAbove;
        const availableSpace = openBelow ? spaceBelow : spaceAbove;

        menu.style.width = width + 'px';
        menu.style.left = left + 'px';
        menu.style.maxHeight = Math.max(80, Math.min(preferredHeight, availableSpace)) + 'px';
        const height = menu.offsetHeight;
        const desiredTop = openBelow ? rect.bottom + gap : rect.top - height - gap;
        menu.style.top = Math.max(edge, Math.min(desiredTop, viewportHeight - height - edge)) + 'px';
        menu.dataset.openDirection = openBelow ? 'down' : 'up';
    };

    const scheduleMenuPosition = () => {
        if (menu.hidden || positionFrame) return;
        positionFrame = requestAnimationFrame(() => {
            positionFrame = 0;
            positionMenu();
        });
    };

    const closeMenu = () => {
        setLiquidGlassMenu(menu, false, menu.dataset.openDirection);
        trigger.setAttribute('aria-expanded', 'false');
        if (positionFrame) {
            cancelAnimationFrame(positionFrame);
            positionFrame = 0;
        }
        window.removeEventListener('resize', scheduleMenuPosition);
        window.removeEventListener('scroll', scheduleMenuPosition, true);
    };

    const openMenu = () => {
        document.body.appendChild(menu);
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        positionMenu();
        setLiquidGlassMenu(menu, true, menu.dataset.openDirection);
        window.addEventListener('resize', scheduleMenuPosition);
        window.addEventListener('scroll', scheduleMenuPosition, true);
    };

    trigger.onclick = () => {
        if (menu.hidden || menu.dataset.rollState === 'closing') openMenu();
        else closeMenu();
    };
    document.addEventListener('click', event => {
        if (!wrapper.contains(event.target) && !menu.contains(event.target)) closeMenu();
    });
}
setupLoginTopicGlassMenu();

const ROOT = "exam_rooms";
const BANK_PATH = ["artifacts", "kham-pha-vat-ly-9", "public", "data", "question_banks"];
const HOST_UID_ALLOWLIST = ["wg7QT6isC2dryLf8rxc6z9lUjNd2"];
const READING_MS = 5 * 60 * 1000;
const $ = id => document.getElementById(id);
let user = null, role = null, roomId = null, roomData = null, participantData = null;
let roomUnsub = null, rosterUnsub = null, submissionsUnsub = null, participantUnsub = null, tickTimer = null;
let roster = [], submissions = [], answers = {}, submitted = false, endTimeWriteInFlight = false, lastRenderedPhase = null, answerKeyCache = null;

function message(text, error = false) {
  const el = $("global-message");
  el.textContent = text;
  el.classList.remove("hidden");
  el.style.borderColor = error ? "#fb7185" : "#9b89ff55";
  el.style.background = error ? "#be123c24" : "#7259ee22";

  window.scrollTo({ top: 0, behavior: "smooth" });
}
function clearMessage() { $("global-message").classList.add("hidden"); }
function show(el, yes = true) { $(el).classList.toggle("hidden", !yes); }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function roomRef(id = roomId) { return doc(examRoomDb, ROOT, id); }
function participantRef(uid, id = roomId) { return doc(examRoomDb, ROOT, id, "participants", uid); }
function submissionsRef(id = roomId) { return collection(examRoomDb, ROOT, id, "submissions"); }
function phaseOf(data, now = Date.now()) {
  if (!data) return "waiting";
  if (data.status === "finished" || data.status === "cancelled") return data.status;
  const start = data.readingStartedAt?.toMillis?.();
  if (!start) return "waiting";
  if (now < start + READING_MS) return "reading";
  const end = data.examEndsAt?.toMillis?.() ?? (start + READING_MS + (Number(data.durationMinutes) || 45) * 60000);
  return now < end ? "running" : "grading";
}
function formatTime(ms) {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return String(Math.floor(s / 60)).padStart(2, "0") + ":" + String(s % 60).padStart(2, "0");
}
function stopListeners() {
  [roomUnsub, rosterUnsub, submissionsUnsub, participantUnsub].forEach(fn => { if (fn) fn(); });
  roomUnsub = rosterUnsub = submissionsUnsub = participantUnsub = null;
  if (tickTimer) clearInterval(tickTimer);
  tickTimer = null;
}
function cleanQuestion(q, type, n) {
  const base = { ...q, id: "q_" + n, type, displayNum: n };
  delete base.a; delete base.e;
  if (type === "tf" && Array.isArray(base.sts)) base.sts = base.sts.map(st => {
    const item = { ...st }; delete item.a; return item;
  });
  return base;
}
function answerKey(q) {
  return q.type === "tf" ? { type: q.type, sts: (q.sts || []).map(st => st.a) } : { type: q.type, a: q.a };
}
function shuffleExamRoomItems(items) {
  const a = [...items];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}
function getBankTopicLabel(value) {
  const labels = {mix:"Đề tổng hợp",bai_11:"Bài 11: Điện trở. Định luật Ohm",bai_12:"Bài 12: Đoạn mạch nối tiếp, song song",bai_13:"Bài 13: Năng lượng điện và công suất",bai_14:"Bài 14: Cảm ứng điện từ. Dòng điện XC",bai_15:"Bài 15: Tác dụng của dòng điện XC"};
  return labels[value] || value;
}
async function requireHost() {
  if (!user || user.isAnonymous || !HOST_UID_ALLOWLIST.includes(user.uid)) {
    throw new Error("Tài khoản này chưa được cấp quyền Host. Hãy dùng tài khoản giáo viên đã được cấp quyền.");
  }
}
async function ensureAnonymous() {
  if (user && !user.isAnonymous) await signOut(examRoomAuth);
  if (!examRoomAuth.currentUser) {
    const credential = await signInAnonymously(examRoomAuth);
    user = credential.user;
  } else user = examRoomAuth.currentUser;
  if (!user.isAnonymous) throw new Error("Không tạo được phiên học sinh.");
}
async function getSelectedQuestions(topic) {
  const snap = await getDocs(collection(examRoomDb, ...BANK_PATH));
  const banks = {};
  snap.forEach(d => banks[d.id] = d.data());
  if (!Object.keys(banks).length) throw new Error("Kho đề trên Firebase đang trống.");
  let bank = {mcq:[],tf:[],short:[]};
  if (topic === "mix") {
    Object.values(banks).forEach(b => {
      bank.mcq.push(...(Array.isArray(b.mcq) ? b.mcq : []));
      bank.tf.push(...(Array.isArray(b.tf) ? b.tf : []));
      bank.short.push(...(Array.isArray(b.short) ? b.short : []));
    });
  } else bank = banks[topic] || bank;
  const picked = [];
  shuffleExamRoomItems(bank.mcq || []).slice(0,12).forEach(q => picked.push({...q, type:"mcq"}));
  shuffleExamRoomItems(bank.tf || []).slice(0,4).forEach(q => picked.push({...q, type:"tf"}));
  shuffleExamRoomItems(bank.short || []).slice(0,4).forEach(q => picked.push({...q, type:"short"}));
  if (!picked.length) throw new Error("Chuyên đề này chưa có câu hỏi.");
  return shuffleExamRoomItems(picked).map((q,i) => ({...q, id:"q_"+(i+1), displayNum:i+1}));
}
function makeRoomCode() {
  const chars = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, b => chars[b % chars.length]).join("");
}
async function createRoom() {
  clearMessage();
  await requireHost();
  $("create-room-btn").disabled = true;
  try {
    const topic = $("bank-topic").value;
    const durationMinutes = Math.max(1, Math.min(180, Number($("duration").value) || 45));
    const fullQuestions = await getSelectedQuestions(topic);
    const publicQuestions = fullQuestions.map((q, i) => {
      const n = i + 1;
      const type = q.type;
      return {
        ...cleanQuestion(q, type, n),
        section: type === "mcq" ? "Phần I. Trắc nghiệm nhiều lựa chọn" : type === "tf" ? "Phần II. Đúng/Sai" : "Phần III. Trả lời ngắn"
      };
    });
    const keys = Object.fromEntries(fullQuestions.map((q, i) => ["q_"+(i+1), answerKey(q)]));
    let code = "", ref;
    for (let attempt = 0; attempt < 5; attempt++) {
      code = makeRoomCode();
      ref = roomRef(code);
      const existing = await getDoc(ref);
      if (!existing.exists()) break;
      code = "";
    }
    if (!code) throw new Error("Không tạo được mã phòng duy nhất, hãy thử lại.");
    const title = $("room-title").value.trim() || "Kiểm tra Vật lý 9";
    await setDoc(ref, {
      roomCode: code, title, topic, topicLabel: getBankTopicLabel(topic),
      hostUid: user.uid,
      status: "waiting", durationMinutes, readingMinutes: 5,
      publicQuestions, createdAt: serverTimestamp(), readingStartedAt: null,
      examEndsAt: null, finishedAt: null
    });
    await setDoc(doc(examRoomDb, ROOT, code, "private", "answer_key"), { keys, createdAt: serverTimestamp() });
    answerKeyCache = keys;
    roomId = code; role = "host"; submitted = false;
    show("room-panel"); show("host-create", false);
    listenRoom(code);
    message("Đã tạo phòng " + code + ". Hãy gửi mã này cho học sinh.");
  } catch (e) {
    message(e.message || "Không thể tạo phòng. Kiểm tra kết nối và Firestore Rules.", true);
  } finally { $("create-room-btn").disabled = false; }
}
async function joinRoom() {
  clearMessage();
  $("join-room-btn").disabled = true;
  try {
    const code = $("join-code").value.trim().toUpperCase();
    const name = $("student-name").value.trim(), cls = $("student-class").value.trim();
    const sbd = $("student-sbd").value.trim(), school = $("student-school").value.trim();
    if (!/^[A-HJ-NP-Z2-9]{6}$/.test(code)) throw new Error("Mã phòng gồm 6 ký tự. Hãy kiểm tra lại.");
    if (!name || !cls || !sbd || !school) throw new Error("Hãy nhập đủ họ tên, lớp, SBD và trường.");
    await ensureAnonymous();
    const ref = roomRef(code), snap = await getDoc(ref);
    if (!snap.exists()) throw new Error("Không tìm thấy phòng thi.");
    const data = snap.data(), phase = phaseOf(data);
    if (!["waiting","reading"].includes(phase)) throw new Error("Phòng đã bắt đầu làm bài hoặc đã kết thúc; không thể tham gia muộn.");
    const existing = await getDoc(participantRef(user.uid, code));
    if (!existing.exists()) {
      await setDoc(participantRef(user.uid, code), {
        uid:user.uid, name, class:cls, sbd, school,
        joinedAt:serverTimestamp(), approved:false, submitted:false
      });
    } else {
      await updateDoc(participantRef(user.uid, code), {name, class:cls, sbd, school});
    }
    roomId = code; role = "student";
    participantData = {uid:user.uid,...(existing.exists() ? existing.data() : {name,class:cls,sbd,school,approved:false,submitted:false})};
    submitted = !!participantData.submitted; answers = {};
    show("room-panel"); show("host-login", false); show("host-create", false);
    listenRoom(code);
    message("Đã gửi yêu cầu vào phòng. Chờ Host duyệt danh sách.");
  } catch (e) {
    message(e.message || "Không thể vào phòng. Kiểm tra kết nối và mã phòng.", true);
  } finally { $("join-room-btn").disabled = false; }
}
function listenRoom(code) {
  stopListeners();
  roomUnsub = onSnapshot(roomRef(code), snap => {
    if (!snap.exists()) { message("Phòng thi không còn tồn tại.", true); return; }
    roomData = snap.data();
    renderRoom();
    if (role === "host" && roomData.readingStartedAt?.toMillis?.() && !roomData.examEndsAt && !endTimeWriteInFlight) {
      endTimeWriteInFlight = true;
      const computedEnd = Timestamp.fromMillis(roomData.readingStartedAt.toMillis() + READING_MS + (Number(roomData.durationMinutes) || 45) * 60000);
      updateDoc(roomRef(code), { examEndsAt: computedEnd }).catch(e => message("Không đồng bộ được giờ kết thúc: " + e.message, true)).finally(() => { endTimeWriteInFlight = false; });
    }
    if (role === "host") {
      rosterUnsub = rosterUnsub || onSnapshot(collection(examRoomDb, ROOT, code, "participants"), s => {
        roster = s.docs.map(d => ({id:d.id,...d.data()})); renderRoster(); renderSubmissions();
      }, e => message("Không tải được danh sách: " + e.message, true));
      submissionsUnsub = submissionsUnsub || onSnapshot(submissionsRef(code), s => {
        submissions = s.docs.map(d => ({id:d.id,...d.data()})); renderSubmissions();
      }, e => message("Không tải được bài nộp: " + e.message, true));
    } else {


      participantUnsub = participantUnsub || onSnapshot(participantRef(user.uid, code), s => {
        participantData = s.exists() ? {uid:user.uid,...s.data()} : null;
        submitted = !!participantData?.submitted;
        renderRoom();
      }, e => message("Không cập nhật được trạng thái thí sinh: " + e.message, true));
    }
  }, e => message("Mất kết nối phòng thi: " + e.message, true));
  tickTimer = setInterval(tickCountdown, 500);
}
function renderRoom() {
  if (!roomData) return;
  const phase = phaseOf(roomData);
  lastRenderedPhase = phase;
  $("room-heading").textContent = roomData.title || "Phòng thi";
  $("room-subtitle").textContent = "Mã phòng: " + roomId + " · " + (roomData.topicLabel || "");
  $("room-role").textContent = role === "host" ? "HOST / GIÁO VIÊN" : "CLIENT / HỌC SINH";
  const labels = {waiting:"Đang chờ",reading:"5 phút đọc đề",running:"Đang làm bài",grading:"Hết giờ · Chờ chấm",finished:"Đã kết thúc",cancelled:"Đã hủy"};
  $("phase-label").textContent = labels[phase] || phase;
  let remain = null;
  if (phase === "reading") remain = roomData.readingStartedAt.toMillis() + READING_MS - Date.now();
  if (phase === "running") remain = (roomData.examEndsAt?.toMillis?.() ?? roomData.readingStartedAt.toMillis()+READING_MS+(roomData.durationMinutes||45)*60000) - Date.now();
  $("countdown").textContent = remain === null ? (phase === "waiting" ? "CHỜ" : "--:--") : formatTime(remain);
  const notes = {
    waiting: role === "host" ? "Đề đã nạp. Kiểm tra và duyệt danh sách thí sinh, rồi bắt đầu 5 phút đọc đề." : "Bạn đã vào phòng. Chờ giáo viên duyệt và bắt đầu thời gian đọc đề.",
    reading: "Được xem câu hỏi nhưng chưa thể chọn hoặc thay đổi đáp án. Học sinh vào muộn chỉ được tham gia trong giai đoạn này.",
    running: "Thời gian làm bài đang chạy theo mốc thời gian chung của phòng.",
    grading: "Đã hết thời gian làm bài. Không thể nộp hoặc sửa câu trả lời.",
    finished: "Phòng thi đã kết thúc.",
    cancelled: "Phòng thi đã bị hủy."
  };
  $("room-notice").textContent = notes[phase] || "";
  show("host-room-controls", role === "host" && ["waiting","reading","running","grading"].includes(phase));
  $("start-reading-btn").disabled = phase !== "waiting" || !roster.some(p=>p.approved);
  $("start-reading-btn").textContent = phase === "waiting" ? "Bắt đầu 5 phút đọc đề" : phase === "reading" ? "Đang đọc đề…" : "Đã bắt đầu";
  show("roster-wrap", role === "host");
  show("exam-wrap", role === "student" && ["reading","running","grading","finished"].includes(phase) && !!participantData?.approved);
  show("host-submissions-wrap", role === "host" && ["running","grading","finished"].includes(phase));
  if (role === "student" && !participantData?.approved) $("room-notice").textContent += " Yêu cầu của bạn đang chờ Host duyệt.";
  if (role === "student" && participantData?.submitted) $("submit-exam-btn").disabled = true;
  if (role === "student" && participantData?.approved && ["reading","running","grading","finished"].includes(phase)) renderExam(phase);
}
function tickCountdown() {
  if (!roomData) return;
  const phase = phaseOf(roomData);
  if (phase !== lastRenderedPhase) {
    renderRoom();
    return;
  }
  let remain = null;
  if (phase === "reading") remain = roomData.readingStartedAt.toMillis() + READING_MS - Date.now();
  if (phase === "running") remain = (roomData.examEndsAt?.toMillis?.() ?? roomData.readingStartedAt.toMillis()+READING_MS+(roomData.durationMinutes||45)*60000) - Date.now();
  $("countdown").textContent = remain === null ? (phase === "waiting" ? "CHỜ" : "--:--") : formatTime(remain);
}
function renderRoster() {
  $("roster-count").textContent = String(roster.length);
  $("roster-list").innerHTML = roster.length ? roster.map(p => `
    <div class="person"><div class="row"><div><b>${escapeHtml(p.name)}</b><small>${escapeHtml(p.school)} · Lớp ${escapeHtml(p.class)} · SBD ${escapeHtml(p.sbd)}</small><small>${p.submitted ? "Đã nộp bài" : p.approved ? "Đã duyệt" : "Chờ duyệt"}</small></div>
    <button class="${p.approved?'secondary':''}" data-approve="${escapeHtml(p.id)}" ${["running","grading","finished"].includes(phaseOf(roomData))?'disabled':''}>${p.approved?"Đã duyệt ✓":"Duyệt"}</button></div></div>`).join("") : '<p class="muted">Chưa có thí sinh nào vào phòng.</p>';
  $("roster-list").querySelectorAll("[data-approve]").forEach(btn => btn.onclick = () => approveParticipant(btn.dataset.approve));
}
async function approveParticipant(uid) {
  try {
    await requireHost();
    const p = roster.find(x=>x.id===uid);
    if (!p || !["waiting","reading"].includes(phaseOf(roomData))) return;
    await updateDoc(participantRef(uid), {approved:!p.approved, approvedAt:!p.approved?serverTimestamp():null});
  } catch(e) { message(e.message || "Không duyệt được thí sinh.", true); }
}
async function approveAll() {
  try {
    await requireHost();
    if (!["waiting","reading"].includes(phaseOf(roomData))) throw new Error("Danh sách đã khóa sau giai đoạn đọc đề.");
    if (!roster.length) throw new Error("Danh sách đang trống: Host chưa tải được thí sinh từ Firebase. Kiểm tra thông báo quyền đọc danh sách và Firestore Rules.");
    const pending = roster.filter(p=>!p.approved);
    if (!pending.length) {
      message("Không có thí sinh nào đang chờ duyệt.");
      return;
    }
    await Promise.all(pending.map(p=>updateDoc(participantRef(p.id),{approved:true,approvedAt:serverTimestamp()})));
    message("Đã duyệt " + pending.length + " thí sinh.");
  } catch(e) { message(e.message || "Không thể duyệt danh sách.", true); }
}
async function startReading() {
  try {
    await requireHost();
    if (phaseOf(roomData)!=="waiting") throw new Error("Phòng đã bắt đầu hoặc không còn ở trạng thái chờ.");
    if (!roster.some(p=>p.approved)) throw new Error("Hãy duyệt ít nhất một thí sinh trước.");
    await updateDoc(roomRef(), {status:"reading",readingStartedAt:serverTimestamp(),examEndsAt:null});
    message("Đã bắt đầu 5 phút đọc đề. Mốc thời gian được chia sẻ qua Firebase.");
  } catch(e) { message(e.message || "Không thể bắt đầu phòng.", true); }
}
function renderExam(phase) {
  const questions = roomData.publicQuestions || [];
  $("exam-heading").textContent = phase === "reading" ? "Đọc đề (chưa được chọn đáp án)" : "Bài làm";
  $("questions").innerHTML = questions.map(q => {
    const answer = answers[q.id];
    let body = "";
    if (q.type === "mcq") {
      body = (q.o || []).map((o,i)=>`<label class="option"><input type="radio" name="${q.id}" value="${escapeHtml(o)}" ${answer===o?'checked':''} ${phase!=="running"||submitted?'disabled':''}><span><b>${"ABCD"[i]||""}.</b> ${escapeHtml(o)}</span></label>`).join("");
    } else if (q.type === "tf") {
      body = (q.sts || []).map((st,i)=>`<div class="tfline"><span><b>${escapeHtml(st.l || String.fromCharCode(97+i)+")")}</b> ${escapeHtml(st.t)}</span><div><label><input type="radio" name="${q.id}_${i}" value="true" ${answer?.[i]===true?'checked':''} ${phase!=="running"||submitted?'disabled':''}> Đúng</label><label><input type="radio" name="${q.id}_${i}" value="false" ${answer?.[i]===false?'checked':''} ${phase!=="running"||submitted?'disabled':''}> Sai</label></div></div>`).join("");
    } else {
      body = `<label for="ans-${q.id}">Câu trả lời</label><input id="ans-${q.id}" data-short="${q.id}" maxlength="120" value="${escapeHtml(answer||"")}" ${phase!=="running"||submitted?'disabled':''} placeholder="Nhập câu trả lời ngắn">`;
    }
    return `<article class="question"><p class="muted">${escapeHtml(q.section || "")}</p><p class="qtitle">Câu ${q.displayNum}. ${escapeHtml(q.q || q.ctx || "")}</p>${q.type==="tf"&&q.ctx?'<p>'+escapeHtml(q.ctx)+'</p>':''}${body}</article>`;
  }).join("");
  if (phase === "reading") $("questions").querySelectorAll("input").forEach(el=>el.disabled=true);
  if (phase === "running" && !submitted) {
    $("questions").querySelectorAll('input[type="radio"]').forEach(el => el.addEventListener("change", () => {
      const tfMatch = el.name.match(/^(q_\d+)_(\d+)$/);
      if (tfMatch) {
        const v = answers[tfMatch[1]] || {};
        v[Number(tfMatch[2])] = el.value === "true";
        answers[tfMatch[1]] = v;
      } else {
        answers[el.name] = el.value;
      }
    }));
    $("questions").querySelectorAll("[data-short]").forEach(el=>el.addEventListener("input",()=>{answers[el.dataset.short]=el.value;}));
  }
  $("submit-exam-btn").disabled = phase !== "running" || submitted;
  $("submit-exam-btn").textContent = submitted ? "Đã nộp bài" : "Nộp bài";
}
async function submitExam() {
  try {
    if (phaseOf(roomData)!=="running") throw new Error("Chỉ được nộp bài trong thời gian làm bài.");
    if (!participantData?.approved) throw new Error("Bạn chưa được Host duyệt.");
    if (submitted || participantData?.submitted) throw new Error("Bài thi đã được nộp.");
    const payload = JSON.parse(JSON.stringify(answers));
    await setDoc(doc(examRoomDb, ROOT, roomId, "submissions", user.uid), {
      uid:user.uid, answers:payload, submittedAt:serverTimestamp(), state:"submitted"
    });
    await updateDoc(participantRef(user.uid), {submitted:true, submittedAt:serverTimestamp()});
    submitted = true; participantData.submitted = true; renderExam("grading");
    message("Đã nộp bài. Hãy chờ giáo viên hoàn tất chấm điểm.");
  } catch(e) { message(e.message || "Không nộp được bài. Hãy kiểm tra mạng rồi thử lại.", true); }
}
function autoScore(questions, keyMap, submittedAnswers) {
  const mcqs = questions.filter(q=>q.type==="mcq"), tfs=questions.filter(q=>q.type==="tf");
  const shortCount = questions.filter(q=>q.type==="short").length;
  let mcqScore=0, tfScore=0;
  if(mcqs.length) mcqScore = mcqs.reduce((sum,q)=>sum+(String(submittedAnswers[q.id]??"").trim().replace(",",".")===String(keyMap[q.id]?.a??"").trim().replace(",",".")?3/mcqs.length:0),0);
  if(tfs.length) {
    const p=2/tfs.length;
    const factors={0:0,1:.2,2:.5,3:.7,4:1};
    tfScore=tfs.reduce((sum,q)=>{
      const selected=submittedAnswers[q.id]||{}, correct=keyMap[q.id]?.sts||[];
      const count=correct.reduce((n,v,i)=>n+(selected[i]===v?1:0),0);
      return sum+p*(factors[count]||0);
    },0);
  }
  return {mcqScore:Number(mcqScore.toFixed(2)),tfScore:Number(tfScore.toFixed(2)),autoScore:Number((mcqScore+tfScore).toFixed(2)),shortCount};
}
async function getAnswerKeyMap() {
  if (answerKeyCache !== null) return answerKeyCache;
  const keySnap = await getDoc(doc(examRoomDb, ROOT, roomId, "private", "answer_key"));
  if (!keySnap.exists()) throw new Error("Không tìm thấy đáp án của phòng thi.");
  answerKeyCache = keySnap.data().keys || {};
  return answerKeyCache;
}
async function renderSubmissions() {
  const hostList = $("submissions-list");
  if (!hostList || role!=="host" || !roomData) return;
  if (!submissions.length) { hostList.innerHTML='<p class="muted">Chưa có bài nộp.</p>'; return; }
  let keyMap;
  try {
    keyMap = await getAnswerKeyMap();
  } catch(e) { hostList.innerHTML='<p class="muted">Không đọc được đáp án. Kiểm tra quyền Host trong Firestore Rules.</p>'; return; }
  hostList.innerHTML=submissions.map(sub=>{
    const p=roster.find(x=>x.id===sub.id)||{};
    const score=autoScore(roomData.publicQuestions||[],keyMap,sub.answers||{});
    const manual=Number(sub.manualShortScore)||0;
    const isGraded=sub.gradeState==="graded";
    const shortQs=(roomData.publicQuestions||[]).filter(q=>q.type==="short");
    const shortReview=shortQs.map(q=>`<div class="tfline"><span><b>Câu ${q.displayNum}:</b> ${escapeHtml((sub.answers||{})[q.id]||"(bỏ trống)")}</span><div><label>Điểm (tối đa ${(shortQs.length?5/shortQs.length:0).toFixed(2)}) <input style="width:90px" type="number" min="0" max="${(shortQs.length?5/shortQs.length:0).toFixed(2)}" step="0.1" data-manual="${sub.id}" data-qid="${q.id}" value="${escapeHtml(sub.manualScores?.[q.id] ?? "")}" ${isGraded?'disabled':''}></label></div></div>`).join("");
    return `<div class="submission"><div class="row"><div><b>${escapeHtml(p.name||sub.id)}</b><small>${escapeHtml(p.class||"")} · SBD ${escapeHtml(p.sbd||"")} · ${isGraded?'Đã chấm':'Đã nộp'}</small></div><span class="pill">Tự chấm: ${score.autoScore.toFixed(2)}/5</span></div><p class="muted">MCQ: ${score.mcqScore.toFixed(2)}/3 · Đúng/Sai: ${score.tfScore.toFixed(2)}/2 · Trả lời ngắn: chấm thủ công tối đa 5 điểm.</p>${shortReview}<div class="actions"><button data-grade="${sub.id}" ${isGraded?'disabled':''}>Lưu điểm thủ công</button><span class="pill">${isGraded?'Tổng: '+Number(sub.finalScore||0).toFixed(2)+'/10':'Chưa chấm xong'}</span></div></div>`;
  }).join("");
  hostList.querySelectorAll("[data-grade]").forEach(btn=>btn.onclick=()=>saveManualGrade(btn.dataset.grade));
}
async function saveManualGrade(uid) {
  try {
    await requireHost();
    const sub=submissions.find(x=>x.id===uid); if(!sub) return;
    const questions=(roomData.publicQuestions||[]).filter(q=>q.type==="short");
    const scores={}; let total=0;
    questions.forEach(q=>{
      const input=$("submissions-list").querySelector(`[data-manual="${CSS.escape(uid)}"][data-qid="${CSS.escape(q.id)}"]`);
      const max=questions.length?5/questions.length:0;
      const val=Math.max(0,Math.min(max,Number(input?.value)||0));
      scores[q.id]=Number(val.toFixed(2)); total+=val;
    });
    const keyMap = await getAnswerKeyMap();
    const auto=autoScore(roomData.publicQuestions||[],keyMap,sub.answers||{});
    const finalScore=Number(Math.min(10,auto.autoScore+total).toFixed(2));
    await setDoc(doc(examRoomDb,ROOT,roomId,"grades",uid),{
      uid, autoScore:auto.autoScore, mcqScore:auto.mcqScore, tfScore:auto.tfScore,
      manualShortScore:Number(total.toFixed(2)), manualScores:scores,
      finalScore, gradedBy:user.uid, gradedAt:serverTimestamp()
    });
    await updateDoc(doc(examRoomDb,ROOT,roomId,"submissions",uid),{
      manualShortScore:Number(total.toFixed(2)),manualScores:scores,gradeState:"graded",finalScore
    });
    message("Đã lưu điểm cho " + (roster.find(p=>p.id===uid)?.name||uid) + ": " + finalScore + "/10.");
  } catch(e) { message(e.message || "Không lưu được điểm. Kiểm tra Firestore Rules.", true); }
}
async function finishRoom() {
  try {
    await requireHost();
    if (!confirm("Kết thúc phòng thi? Học sinh sẽ không thể tiếp tục nộp bài.")) return;
    await updateDoc(roomRef(),{status:"finished",finishedAt:serverTimestamp()});
    message("Đã kết thúc phòng thi.");
  } catch(e) { message(e.message || "Không kết thúc được phòng.", true); }
}
function leaveRoom() {
  stopListeners(); roomId=null; role=null; roomData=null; participantData=null; roster=[]; submissions=[]; answers={}; submitted=false;
  show("room-panel",false); show("host-login",true);
  if (user && !user.isAnonymous) show("host-create",true);
}
$("host-login-btn").addEventListener("click",async()=>{
  clearMessage(); $("host-login-btn").disabled=true;
  try {
    const email=$("host-email").value.trim(), password=$("host-password").value;
    if(!email||!password) throw new Error("Nhập email và mật khẩu giáo viên.");
    const credential=await signInWithEmailAndPassword(examRoomAuth,email,password);
    user=credential.user;
    await requireHost();
    show("host-login",false);show("host-create",true);
    message("Đăng nhập Host thành công.");
  } catch(e) {
    if(examRoomAuth.currentUser && !examRoomAuth.currentUser.isAnonymous) await signOut(examRoomAuth).catch(()=>{});
    user=examRoomAuth.currentUser;
    message(e.message?.includes("cấp quyền")?e.message:"Đăng nhập Host thất bại. Kiểm tra email, mật khẩu và cấu hình Firebase Auth.",true);
  } finally { $("host-login-btn").disabled=false; }
});
$("host-logout-btn").addEventListener("click",async()=>{try{await signOut(examRoomAuth);user=null;show("host-create",false);show("host-login",true);message("Đã đăng xuất Host.");}catch(e){message(e.message,true);}});
$("create-room-btn").addEventListener("click",createRoom);
$("join-room-btn").addEventListener("click",joinRoom);
$("approve-all-btn").addEventListener("click",approveAll);
$("start-reading-btn").addEventListener("click",startReading);
$("finish-room-btn").addEventListener("click",finishRoom);
$("submit-exam-btn").addEventListener("click",submitExam);
$("leave-room-btn").addEventListener("click",leaveRoom);
$("join-code").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g,"").slice(0,6));

function routeExamRoomScreen() {
  const screen = document.getElementById("screen-exam-room");
  const header = document.getElementById("main-header");
  if (location.hash === "#exam-room") {
    showScreen("screen-exam-room");
    header.style.display = "none";
  } else if (screen.classList.contains("active")) {
    showScreen("screen-start");
    header.style.display = "flex";
  }
}
document.getElementById("btn-open-exam-room").addEventListener("click", () => {
  location.hash = "exam-room";
  if (location.hash === "#exam-room") routeExamRoomScreen();
});
document.getElementById("btn-back-from-exam-room").addEventListener("click", () => {
  history.replaceState(null, "", location.pathname + location.search);
  showScreen("screen-start");
  document.getElementById("main-header").style.display = "flex";
});
window.addEventListener("hashchange", routeExamRoomScreen);
if (location.hash === "#exam-room") routeExamRoomScreen();

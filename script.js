
import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, signInAnonymously, onAuthStateChanged, setPersistence, browserSessionPersistence, signInWithEmailAndPassword, signOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import { getFirestore, collection, addDoc, getDocs, doc, deleteDoc, setDoc, getDoc } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

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
const appId_fixed = 'kham-pha-vat-ly-9'; 
const collectionName = 'quiz_results'; 
const collectionReports = 'error_reports';
const collectionStudents = 'students_list'; 
const collectionBanks = 'question_banks'; // COLLECTION KHO ĐỀ

let currentUser = null, quizStartTime = 0, isQuizRunning = false, mode = '', currentIdx = 0, userAnswers = {}, timeLeft = 0, timerInt, currentExam = [];
let arExamData = [], arUserAnswers = {}; 
let globalStudentList = []; 
let importedStudentsCache = []; 
let importedQuestionsCache = {}; // Cache lưu trữ đề thi khi đọc từ excel

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
    if (modal.id === 'delete-auth-modal') { pendingAuthAction = null; currentDeleteId = null; importedStudentsCache = []; importedQuestionsCache = {}; document.getElementById('delete-pw').value = ''; document.getElementById('delete-email').value = ''; document.getElementById('file-import-students').value = ''; document.getElementById('file-import-questions').value = '';}
    if (modal.id === 'admin-auth-modal') { document.getElementById('admin-pw').value = ''; }
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

// AUTOCOMPLETE LOGIC
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
    if(user) { await loadTimeConfig(); await loadStudentList(); }
});

let fireRequest;
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
        if (flames.length < 55) flames.push(new Flame());
        for (let i = 0; i < flames.length; i++) { flames[i].update(); flames[i].draw(); if (flames[i].life <= 0) { flames.splice(i, 1); i--; } }
        fireRequest = requestAnimationFrame(animate);
    }
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

// LOGIC INIT GAME - FETCH TỪ FIREBASE VÀ BỐC NGẪU NHIÊN
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
    
    // TẠM ẨN NÚT VÀ HIỂN THỊ TRẠNG THÁI LOADING
    document.getElementById('start-buttons').style.display = 'none';
    document.getElementById('loading-text').style.display = 'block';

    try {
        let activeBank = { mcq: [], tf: [], short: [] };
        const snap = await getDocs(collection(db, 'artifacts', appId_fixed, 'public', 'data', collectionBanks));
        let allData = {};
        snap.forEach(doc => { allData[doc.id] = doc.data(); });

        if (Object.keys(allData).length === 0) {
            alert("Hệ thống chưa có đề thi nào trên máy chủ! Vui lòng báo Giáo viên Import đề.");
            document.getElementById('start-buttons').style.display = 'grid';
            document.getElementById('loading-text').style.display = 'none';
            return;
        }

        if (topicVal === 'mix') {
            Object.values(allData).forEach(bank => {
                if(bank.mcq) activeBank.mcq.push(...bank.mcq);
                if(bank.tf) activeBank.tf.push(...bank.tf);
                if(bank.short) activeBank.short.push(...bank.short);
            });
        } else { 
            activeBank = allData[topicVal] || { mcq: [], tf: [], short: [] }; 
        }

        // THUẬT TOÁN BỐC NGẪU NHIÊN 12-4-4
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
        
        // PHỤC HỒI UI BẮT ĐẦU
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
        container.querySelectorAll('.option').forEach(el => el.onclick = () => { userAnswers[q.id] = el.getAttribute('data-ans'); audioPing.play().catch(()=>{}); renderQuestion(); });
    } else if(q.type === 'tf') {
        container.querySelectorAll('.tf-btn').forEach(el => el.onclick = () => {
            const si = el.getAttribute('data-si'), val = el.getAttribute('data-val') === 'true';
            if(!userAnswers[q.id]) userAnswers[q.id] = {}; userAnswers[q.id][si] = val; audioPing.play().catch(()=>{}); renderQuestion();
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
            await addDoc(collection(db, 'artifacts', appId_fixed, 'public', 'data', collectionName), { 
                name: u.name, school: u.sch, sbd: u.sbd, class: u.cls, topic: u.topic, score: fs, duration: dur, mode: mode, timestamp: new Date().toISOString(), examData: currentExam, userAnswers: userAnswers 
            }); 
        } catch(e) { hasSaved = false; }
    }
    fetchRankAndLeaderboard(fs, u.topic);
}

async function fetchRankAndLeaderboard(myScore, myTopic) {
    try {
        const snap = await getDocs(collection(db, 'artifacts', appId_fixed, 'public', 'data', collectionName));
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
 root.innerHTML=defs.map(d=>{const sel=state[d.key],title=sel.length?d.label+' ('+sel.length+')':d.label+': Tất cả',items=d.values.map(v=>'<label class="admin-filter-option"><input type="checkbox" data-filter-check="'+d.key+'" value="'+esc(v)+'"'+(sel.includes(String(v))?' checked':'')+'><span>'+esc(v==='test'?'Kiểm tra':v==='practice'?'Luyện tập':v)+'</span></label>').join('');return '<div class="admin-filter-group" data-filter-group="'+d.key+'"><button type="button" class="admin-filter-trigger" aria-expanded="false">'+esc(title)+' ▾</button><div class="admin-filter-menu" hidden><input class="admin-filter-search" type="search" placeholder="Tìm '+esc(d.label.toLowerCase())+'..."><div class="admin-filter-options">'+(items||'<small>Chưa có dữ liệu</small>')+'</div><div class="admin-filter-menu-actions"><button type="button" data-filter-action="all">Chọn tất cả</button><button type="button" data-filter-action="clear">Bỏ lọc</button></div><button type="button" class="admin-filter-apply">Áp dụng</button></div></div>';}).join('');
 root.querySelectorAll('.admin-filter-trigger').forEach(b=>b.onclick=()=>{const g=b.closest('.admin-filter-group'),m=g.querySelector('.admin-filter-menu'),open=m.hidden||m.dataset.rollState==='closing';root.querySelectorAll('.admin-filter-menu').forEach(x=>setLiquidGlassMenu(x,false,'down'));root.querySelectorAll('.admin-filter-trigger').forEach(x=>x.setAttribute('aria-expanded','false'));if(open)setLiquidGlassMenu(m,true,'down');b.setAttribute('aria-expanded',String(open));});
 root.querySelectorAll('.admin-filter-search').forEach(i=>i.oninput=()=>{const q=i.value.trim().toLocaleLowerCase('vi');i.closest('.admin-filter-menu').querySelectorAll('.admin-filter-option').forEach(x=>x.hidden=!x.innerText.toLocaleLowerCase('vi').includes(q));});
 root.querySelectorAll('.admin-filter-group').forEach(g=>{const k=g.dataset.filterGroup,d=defs.find(x=>x.key===k),b=g.querySelector('.admin-filter-trigger'),update=()=>{state[k]=[...g.querySelectorAll('[data-filter-check]:checked')].map(x=>x.value);b.firstChild.textContent=state[k].length?d.label+' ('+state[k].length+') ▾':d.label+': Tất cả ▾';};g.querySelectorAll('[data-filter-check]').forEach(x=>x.onchange=update);g.querySelector('[data-filter-action="all"]').onclick=()=>{g.querySelectorAll('[data-filter-check]').forEach(x=>x.checked=true);update();};g.querySelector('[data-filter-action="clear"]').onclick=()=>{g.querySelectorAll('[data-filter-check]').forEach(x=>x.checked=false);update();};g.querySelector('.admin-filter-apply').onclick=()=>renderAdmin();});
}

async function renderAdmin() {
    const listBody = document.getElementById('admin-list-body'), statsBox = document.getElementById('admin-stats');
    listBody.innerHTML = "<tr><td colspan='11'>Đang tải dữ liệu...</td></tr>";
    try {
        const snap = await getDocs(collection(db, 'artifacts', appId_fixed, 'public', 'data', collectionName));
        let rawData = []; snap.forEach(d => rawData.push({id: d.id, ...d.data()}));
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
        listBody.innerHTML = data.map((i, idx) => `<tr><td>${idx+1}</td><td>${i.sbd}</td><td>${i.name}</td><td>${i.class}</td><td>${i.school||'-'}</td><td style="font-size:0.75rem; color:var(--primary); font-weight:bold;">${i.topic || 'Đề tổng hợp'}</td><td><span class="badge-mode ${i.mode === 'practice' ? 'badge-practice' : 'badge-test'}">${i.mode === 'practice' ? 'Luyện tập' : 'Kiểm tra'}</span></td><td><b>${Number((i.score||0).toFixed(2))}</b></td><td>${i.duration}s</td><td>${new Date(i.timestamp).toLocaleDateString()}</td><td style="display:flex; gap:5px;"><button style="background:var(--secondary); color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer" class="btn-view" data-id="${i.id}">👁️</button><button style="background:red; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer" class="btn-del" data-id="${i.id}">X</button></td></tr>`).join('');
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
            return ((fClass.value === 'all') || (i.class === fClass.value)) 
                && ((fSchool.value === 'all') || (i.school === fSchool.value));
        });
        
        data = globalStudentList.filter(i => { const filters = window.adminStudentFilterState; return (!filters.class.length || filters.class.includes(String(i.class || ''))) && (!filters.school.length || filters.school.includes(String(i.school || ''))); }); const getVnNameParts = (fullName) => {
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

// TAB MANAGEMENT IN ADMIN
document.getElementById('tab-results').onclick = () => {
    document.getElementById('tab-results').classList.add('active');
    document.getElementById('tab-students').classList.remove('active');
    document.getElementById('tab-questions').classList.remove('active');
    document.getElementById('admin-results-section').style.display = 'block';
    document.getElementById('admin-students-section').style.display = 'none';
    document.getElementById('admin-questions-section').style.display = 'none';
    renderAdmin();
};
document.getElementById('tab-students').onclick = () => {
    document.getElementById('tab-students').classList.add('active');
    document.getElementById('tab-results').classList.remove('active');
    document.getElementById('tab-questions').classList.remove('active');
    document.getElementById('admin-students-section').style.display = 'block';
    document.getElementById('admin-results-section').style.display = 'none';
    document.getElementById('admin-questions-section').style.display = 'none';
    renderAdminStudents();
};
document.getElementById('tab-questions').onclick = () => {
    document.getElementById('tab-questions').classList.add('active');
    document.getElementById('tab-results').classList.remove('active');
    document.getElementById('tab-students').classList.remove('active');
    document.getElementById('admin-questions-section').style.display = 'block';
    document.getElementById('admin-results-section').style.display = 'none';
    document.getElementById('admin-students-section').style.display = 'none';
    renderAdminQuestions();
};

document.getElementById('stu-filter-school').onchange = () => renderAdminStudents();
document.getElementById('stu-filter-class').onchange = () => renderAdminStudents();
document.getElementById('btn-refresh-students').onclick = () => renderAdminStudents();

function viewAdminReview(docId) {
    const record = window.currentFilteredData.find(d => d.id === docId); if (!record || !record.examData) { alert("Không có dữ liệu chi tiết!"); return; }
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
            q.sts.forEach((st, si) => { let uV = (arUserAnswers[q.id]||{})[si], isC = (uV === st.a); h += `<div style="padding: 5px; border-bottom:1px solid #e2e8f0;">${st.l} ${st.t} <br><span style="font-size:0.8rem;">Bạn: <b style="color:${isC?'#10b981':'#ef4444'}">${uV===true?'Đúng':(uV===false?'Sai':'Trống')}</b> | Đáp án: <b>${st.a?'Đúng':'Sai'}</b></span></div>`; });
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

// EXCEL IMPORT CHO DANH SÁCH HỌC SINH
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

// WORD IMPORT CHO ĐỀ THI LÊN FIREBASE
// Cấu trúc Word giữ nguyên các trường dữ liệu của mẫu Excel cũ:
// MCQ: CauHoi, DapAnDung, PhuongAn1-4, GiaiThich
// TF: NguCanh, Y_A-D, DapAn_A-D, GiaiThich
// SHORT: CauHoi, DapAn, GiaiThich
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

/* ===================== TẠO FILE WORD MẪU - KHÔNG DÙNG CDN =====================
   .docx là một ZIP chứa các XML của Word. Phần này tạo ZIP dạng Store (không nén)
   trực tiếp bằng Web APIs, nên nút TẢI FILE WORD MẪU không phụ thuộc Internet.
*/


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
    if (typeof Blob === 'undefined' || typeof TextEncoder === 'undefined') {
        throw new Error('WORD-E01: Trình duyệt không hỗ trợ Blob/TextEncoder cần thiết để tạo file Word.');
    }

    const body = [];
    body.push(wordParagraphXml('MẪU NGÂN HÀNG ĐỀ VẬT LÝ 9', { bold: true, size: 32, align: 'center', after: 180 }));
    body.push(wordParagraphXml(`Phiên bản mẫu: ${WORD_TEMPLATE_VERSION}`, { italics: true, align: 'center', after: 120 }));
    body.push(wordParagraphXml('HƯỚNG DẪN: Không đổi tên các tiêu đề PHẦN. Mỗi câu bắt đầu bằng "Câu ...". Giữ đúng dòng "Đáp án:" và "Giải thích:".', { bold: true, after: 160 }));

    body.push(wordParagraphXml('PHẦN I - TRẮC NGHIỆM', { bold: true, size: 28, after: 120 }));
    body.push(wordQuestionXml('Câu 1. Công thức tính điện trở dây dẫn hình trụ là:', [
        'A. R = ρ l/S', 'B. R = l/(ρS)', 'C. R = ρ S/l', 'D. R = S/(ρl)'
    ], 'A', 'Điện trở tỉ lệ thuận với chiều dài l, tỉ lệ nghịch với tiết diện S.'));

    body.push(wordParagraphXml('PHẦN II - ĐÚNG / SAI', { bold: true, size: 28, after: 120 }));
    body.push(wordQuestionXml('Câu 1. Cho đoạn mạch nối tiếp:', [
        'a) Dòng điện luôn bằng nhau ở mọi điểm — Đúng',
        'b) Hiệu điện thế bằng nhau ở mọi điểm — Sai',
        'c) Điện trở tương đương bằng tổng các điện trở — Đúng',
        'd) Khi tăng 1 điện trở thì dòng mạch tăng — Sai'
    ], 'Đ, S, Đ, S', 'Mạch nối tiếp có I bằng nhau, U bằng tổng, R bằng tổng.'));

    body.push(wordParagraphXml('PHẦN III - TRẢ LỜI NGẮN', { bold: true, size: 28, after: 120 }));
    body.push(wordQuestionXml('Câu 1. Bếp điện có điện trở 80 Ω, cường độ dòng điện 2,5 A. Tính U?', [], '200', 'U = I × R = 2,5 × 80 = 200 V.'));

    body.push(wordParagraphXml('LƯU Ý KÝ HIỆU', { bold: true, size: 28, after: 120 }));
    body.push(wordParagraphXml('Bạn có thể gõ hoặc dán trực tiếp các ký hiệu như m³, m², Ω, Δ, ρ, μ và công thức. Không cần dùng ký tự ô vuông.', { after: 100 }));

    const documentXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:document xmlns:wpc="http://schemas.microsoft.com/office/word/2010/wordprocessingCanvas" xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006" xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:m="http://schemas.openxmlformats.org/officeDocument/2006/math" xmlns:v="urn:schemas-microsoft-com:vml" xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing" xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing" xmlns:w10="urn:schemas-microsoft-com:office:word" xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main" xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml" xmlns:w15="http://schemas.microsoft.com/office/word/2012/wordml" xmlns:w16cex="http://schemas.microsoft.com/office/word/2018/wordml/cex" xmlns:w16cid="http://schemas.microsoft.com/office/word/2016/wordml/cid" xmlns:w16="http://schemas.microsoft.com/office/word/2018/wordml" xmlns:w16du="http://schemas.microsoft.com/office/word/2023/wordml" xmlns:w16sdtdh="http://schemas.microsoft.com/office/word/2024/wordml/sdtdatahash" xmlns:w16sdtfl="http://schemas.microsoft.com/office/word/2024/wordml/sdtformatlock" xmlns:w16wml="http://schemas.microsoft.com/office/word/2024/wordml" xmlns:wne="http://schemas.microsoft.com/office/word/2006/wordml" xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape" mc:Ignorable="w14 w15 w16cex w16cid w16 w16du w16sdtdh w16sdtfl w16wml">\n<w:body>${body.join('')}<w:sectPr><w:pgSz w:w="11906" w:h="16838"/><w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440"/></w:sectPr></w:body></w:document>`;

    const contentTypes = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/><Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/></Types>`;
    const rootRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`;
    const docRels = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"></Relationships>`;
    const styles = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:docDefaults><w:rPrDefault><w:rPr><w:rFonts w:ascii="Arial" w:hAnsi="Arial" w:eastAsia="Arial"/><w:sz w:val="24"/><w:szCs w:val="24"/></w:rPr></w:rPrDefault><w:pPrDefault><w:pPr><w:spacing w:after="100"/></w:pPr></w:pPrDefault></w:docDefaults></w:styles>`;
    const core = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:dcmitype="http://purl.org/dc/dcmitype/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>Mẫu Ngân Hàng Đề Vật Lý 9</dc:title><dc:creator>Hệ thống luyện tập</dc:creator><cp:lastModifiedBy>Hệ thống luyện tập</cp:lastModifiedBy></cp:coreProperties>`;
    const app = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>\n<Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>Web Question Bank</Application></Properties>`;

    const blob = createStoredZip([
        { name: '[Content_Types].xml', data: contentTypes },
        { name: '_rels/.rels', data: rootRels },
        { name: 'word/document.xml', data: documentXml },
        { name: 'word/styles.xml', data: styles },
        { name: 'word/_rels/document.xml.rels', data: docRels },
        { name: 'docProps/core.xml', data: core },
        { name: 'docProps/app.xml', data: app }
    ]);
    if (!blob || blob.size < 1000) throw new Error(`WORD-E04: File DOCX tạo ra quá nhỏ (${blob?.size || 0} bytes).`);
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

const normalizeWordHtml = (html) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="word-root">${html}</div>`, 'text/html');
    const root = doc.getElementById('word-root');
    const supMap = { '0':'⁰','1':'¹','2':'²','3':'³','4':'⁴','5':'⁵','6':'⁶','7':'⁷','8':'⁸','9':'⁹','+':'⁺','-':'⁻','=':'⁼','(':'⁽',')':'⁾','n':'ⁿ','i':'ⁱ' };
    root.querySelectorAll('sup').forEach(el => { el.replaceWith([...el.textContent].map(ch => supMap[ch] || ch).join('')); });
    root.querySelectorAll('sub').forEach(el => {
        const subMap = { '0':'₀','1':'₁','2':'₂','3':'₃','4':'₄','5':'₅','6':'₆','7':'₇','8':'₈','9':'₉','+':'₊','-':'₋','=':'₌','(':'₍',')':'₎','a':'ₐ','e':'ₑ','h':'ₕ','i':'ᵢ','j':'ⱼ','k':'ₖ','l':'ₗ','m':'ₘ','n':'ₙ','o':'ₒ','p':'ₚ','r':'ᵣ','s':'ₛ','t':'ₜ','u':'ᵤ','v':'ᵥ','x':'ₓ' };
        el.replaceWith([...el.textContent].map(ch => subMap[ch] || ch).join(''));
    });
    return root.innerHTML.trim();
};

const wordBlockText = (node) => normalizeWordHtml(node?.innerHTML || '').replace(/\u00a0/g, ' ').replace(/\s+$/g, '').trim();
const cleanLine = (value) => String(value || '').replace(/^[\uFEFF\u200B\u200C\u200D]+/, '').trim();
const stripQuestionPrefix = (value) => cleanLine(value).replace(/^Câu\s*\d+\s*[:.\-]\s*/i, '').trim();
const stripOptionPrefix = (value) => cleanLine(value).replace(/^[A-D]\s*[.)\-:]\s*/i, '').trim();
const stripTfPrefix = (value) => cleanLine(value).replace(/^[a-d]\s*[.)\-:]\s*/i, '').trim();
const parseBool = (value) => /^(true|đúng|d|t|1|yes)$/i.test(cleanLine(value));

const parseWordQuestionNumber = (text) => /^Câu\s*\d+\s*[:.\-]?/i.test(cleanLine(text));
const getWordParagraphs = (html) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(`<div id="word-root">${html}</div>`, 'text/html');
    const root = doc.getElementById('word-root');
    const nodes = [...root.querySelectorAll('p, li, h1, h2, h3, h4, h5, h6')];
    if (nodes.length === 0) return [root];
    return nodes.map(n => ({ el: n, text: cleanLine(wordBlockText(n)), html: wordBlockText(n) })).filter(x => x.text);
};

const parseWordQuestionBank = async (arrayBuffer) => {
    if (!window.mammoth) throw new Error('Thư viện đọc Word chưa tải xong.');
    const result = await mammoth.convertToHtml({ arrayBuffer }, {
        styleMap: [
            "p[style-name='Heading 1'] => h1:fresh",
            "p[style-name='Heading 2'] => h2:fresh"
        ]
    });
    const blocks = getWordParagraphs(result.value);
    const sections = { mcq: [], tf: [], short: [] };
    let section = '';
    let current = null;

    const finish = () => {
        if (!current) return;
        if (section === 'mcq') {
            if (current.q && current.o.length >= 2 && current.a) sections.mcq.push(current);
        } else if (section === 'tf') {
            if (current.ctx && current.sts.length === 4 && current.sts.every(x => typeof x.a === 'boolean')) sections.tf.push(current);
        } else if (section === 'short') {
            if (current.q && current.a !== '') sections.short.push(current);
        }
        current = null;
    };

    const startQuestion = (raw) => {
        finish();
        const qText = stripQuestionPrefix(raw);
        current = section === 'mcq'
            ? { q: qText, a: '', o: [], e: '' }
            : section === 'tf'
                ? { ctx: qText, sts: [], e: '' }
                : { q: qText, a: '', e: '' };
    };

    for (let i = 0; i < blocks.length; i++) {
        const text = blocks[i].text;
        const lower = text.toLowerCase();
        if (/^phần\s*i\s*[-–—:]?\s*trắc nghiệm/i.test(text)) { finish(); section = 'mcq'; continue; }
        if (/^phần\s*ii\s*[-–—:]?\s*đúng\s*[/\\-]?\s*sai/i.test(text)) { finish(); section = 'tf'; continue; }
        if (/^phần\s*iii\s*[-–—:]?\s*trả\s*lời\s*ngắn/i.test(text)) { finish(); section = 'short'; continue; }
        if (!section) continue;

        if (parseWordQuestionNumber(text)) { startQuestion(text); continue; }
        if (!current) continue;

        if (section === 'mcq') {
            const opt = text.match(/^([A-D])\s*[.)\-:]\s*(.+)$/i);
            if (opt) { current.o.push(stripOptionPrefix(text)); continue; }
            const ans = text.match(/^Đáp\s*án\s*:\s*(.+)$/i);
            if (ans) {
                const val = cleanLine(ans[1]);
                current.a = val.length === 1 ? val.toUpperCase() : val.replace(/^[A-D]\s*[.)\-:]\s*/i, '').trim();
                if (/^[A-D]$/i.test(current.a)) {
                    current.a = current.a.toUpperCase();
                    const idx = current.a.charCodeAt(0) - 65;
                    current.a = current.o[idx] || current.a;
                }
                continue;
            }
            const exp = text.match(/^Giải\s*thích\s*:\s*(.*)$/i);
            if (exp) { current.e = cleanLine(exp[1]); continue; }
        } else if (section === 'tf') {
            const tf = text.match(/^([a-d])\s*[.)\-:]\s*(.+)$/i);
            if (tf) {
                const raw = tf[2];
                const inline = raw.match(/^(.*?)(?:\s*[—-]\s*|\s*\|\s*)(Đúng|Sai)$/i);
                if (inline) current.sts.push({ l: tf[1].toLowerCase() + ')', t: cleanLine(inline[1]), a: parseBool(inline[2]) });
                else current.sts.push({ l: tf[1].toLowerCase() + ')', t: cleanLine(raw), a: undefined });
                continue;
            }
            const ans = text.match(/^Đáp\s*án\s*:\s*(.+)$/i);
            if (ans) {
                const vals = ans[1].split(/[,;|\s]+/).filter(Boolean);
                current.sts.forEach((st, idx) => { if (vals[idx]) st.a = parseBool(vals[idx]); });
                continue;
            }
            const exp = text.match(/^Giải\s*thích\s*:\s*(.*)$/i);
            if (exp) { current.e = cleanLine(exp[1]); continue; }
        } else if (section === 'short') {
            const ans = text.match(/^Đáp\s*án\s*:\s*(.*)$/i);
            if (ans) { current.a = cleanLine(ans[1]); continue; }
            const exp = text.match(/^Giải\s*thích\s*:\s*(.*)$/i);
            if (exp) { current.e = cleanLine(exp[1]); continue; }
        }
    }
    finish();
    return sections;
};

document.getElementById('file-import-questions').onchange = async (e) => {
    const file = e.target.files[0]; if (!file) return;
    const selectedTopic = document.getElementById('import-q-topic').value;
    if (!selectedTopic) { showCustomAlert('⚠️ Vui lòng CHỌN CHUYÊN ĐỀ trước khi Import!'); e.target.value = ''; return; }
    try {
        const data = await file.arrayBuffer();
        const parsed = await parseWordQuestionBank(data);
        importedQuestionsCache = {};
        importedQuestionsCache[selectedTopic] = parsed;
        const total = parsed.mcq.length + parsed.tf.length + parsed.short.length;
        if (total > 0) {
            pendingAuthAction = 'import_questions';
            if (auth.currentUser && !auth.currentUser.isAnonymous) { executePendingAdminAction(); return; }
            document.getElementById('auth-action-title').innerText = `Xác nhận Đẩy ${total} câu lên Cloud`;
            document.getElementById('delete-pw').value = ''; document.getElementById('delete-email').value = '';
            document.getElementById('delete-auth-modal').style.display = 'flex';
        } else {
            showCustomAlert('File Word không có dữ liệu hợp lệ. Hãy tải file mẫu và giữ đúng các tiêu đề PHẦN, Câu, Đáp án, Giải thích!');
        }
    } catch(error) {
        console.error('Lỗi đọc Word:', error);
        showCustomAlert('Lỗi đọc file Word. Vui lòng dùng file .docx mẫu của hệ thống!');
    }
    document.getElementById('file-import-questions').value = '';
};

// ADMIN ACTIONS PIPELINE
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
        await deleteDoc(doc(db, 'artifacts', appId_fixed, 'public', 'data', collectionName, currentDeleteId)); 
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
        } catch(e) { showCustomAlert("Lỗi khi xóa dữ liệu!"); }
    }
    else if (pendingAuthAction === 'import_students' && importedStudentsCache.length > 0) {
        showCustomAlert("Đang tiến hành nhập dữ liệu, vui lòng đợi...");
        try {
            for(let i=0; i<importedStudentsCache.length; i++) { await addDoc(collection(db, 'artifacts', appId_fixed, 'public', 'data', collectionStudents), importedStudentsCache[i]); }
            showCustomAlert(`✅ Đã import thành công ${importedStudentsCache.length} học sinh!`);
            importedStudentsCache = []; renderAdminStudents();
        } catch(e) { showCustomAlert("Lỗi khi tải dữ liệu lên Server!"); }
    }
    else if (pendingAuthAction === 'import_questions' && Object.keys(importedQuestionsCache).length > 0) {
        showCustomAlert("Đang tiến hành đẩy kho đề lên Đám mây, vui lòng đợi...");
        try {
            const topics = Object.keys(importedQuestionsCache);
            for(let i = 0; i < topics.length; i++) {
                const tCode = topics[i];
                await setDoc(doc(db, 'artifacts', appId_fixed, 'public', 'data', collectionBanks, tCode), importedQuestionsCache[tCode], { merge: false });
            }
            showCustomAlert(`✅ Đã đẩy thành công dữ liệu của ${topics.length} chuyên đề!`);
            importedQuestionsCache = {}; renderAdminQuestions();
        } catch(e) { showCustomAlert("Lỗi khi đẩy đề lên Server!"); console.error(e); }
    }
    else if (pendingAuthAction === 'delete_all_questions') {
        showCustomAlert("Đang xóa toàn bộ Ngân hàng đề, vui lòng đợi...");
        try {
            const snap = await getDocs(collection(db, 'artifacts', appId_fixed, 'public', 'data', collectionBanks));
            const deletePromises = []; snap.forEach(docSnap => { deletePromises.push(deleteDoc(doc(db, 'artifacts', appId_fixed, 'public', 'data', collectionBanks, docSnap.id))); });
            await Promise.all(deletePromises);
            showCustomAlert("✅ Đã xóa sạch kho đề trên hệ thống!"); renderAdminQuestions();
        } catch(e) { showCustomAlert("Lỗi khi xóa dữ liệu đề!"); }
    }
    else if (pendingAuthAction === 'config') {
        const pTime = parseInt(document.getElementById('cfg-time-practice').value), tTime = parseInt(document.getElementById('cfg-time-test').value), mHints = parseInt(document.getElementById('cfg-max-hints').value);
        if(isNaN(pTime) || isNaN(tTime) || isNaN(mHints) || pTime <= 0 || tTime <= 0 || mHints < 0) { showCustomAlert("⚠️ Vui lòng nhập số hợp lệ!"); return; }
        try { await setDoc(doc(db, 'artifacts', appId_fixed, 'public', 'data', 'config', 'timer_settings'), { practice: pTime, test: tTime, maxHints: mHints, lastUpdated: new Date().toISOString() }, { merge: true }); practiceTimeLimit = pTime * 60; testTimeLimit = tTime * 60; maxHintsAllowed = mHints; showCustomAlert("Đã cập nhật cấu hình thành công!"); } catch(e) { showCustomAlert("Lỗi khi lưu cấu hình!"); }
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

document.getElementById('btn-delete-cancel').onclick = () => { document.getElementById('delete-auth-modal').style.display = 'none'; currentDeleteId = null; pendingAuthAction = null; importedStudentsCache = []; importedQuestionsCache = {};};

document.getElementById('btn-delete-confirm').onclick = async () => { 
    const email = document.getElementById('delete-email').value.trim();
    const pw = document.getElementById('delete-pw').value;
    if (!email || !pw) { showCustomAlert("Vui lòng nhập Email và Mật khẩu!"); return; }
    
    document.getElementById('btn-delete-confirm').innerText = "...";
    try {
        await setPersistence(auth, browserSessionPersistence);
        await signInWithEmailAndPassword(auth, email, pw);
        document.getElementById('delete-auth-modal').style.display = 'none'; 
        executePendingAdminAction();
    } catch (error) {
        showCustomAlert("⚠️ XÁC THỰC THẤT BẠI! Hãy kiểm tra tài khoản Firebase.");
    }
    document.getElementById('btn-delete-confirm').innerText = "XÁC NHẬN";
};

document.getElementById('btn-admin-open').onclick = () => document.getElementById('admin-auth-modal').style.display = 'flex';
document.getElementById('btn-auth-cancel').onclick = () => document.getElementById('admin-auth-modal').style.display = 'none';
document.getElementById('btn-auth-confirm').onclick = () => { if(document.getElementById('admin-pw').value === "112233@@") { document.getElementById('admin-auth-modal').style.display='none'; showScreen('screen-admin'); renderAdmin(); } else showCustomAlert("Sai mật khẩu!"); };

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
    } catch(e) { showCustomAlert("Có lỗi xảy ra, vui lòng thử lại sau!"); }
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
    } catch(e) {}
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
            q.sts.forEach((st, si) => { let uV = (userAnswers[q.id]||{})[si], isC = (uV === st.a); h += `<div class="tf-row" style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #f1f5f9;"><span>${st.l} ${st.t}</span><div style="font-size:0.8rem; text-align:right; width: max-content;"><span style="color:${isC?'#10b981':'#ef4444'}">Bạn: <b>${uV===true?'Đúng':(uV===false?'Sai':'?')}</b></span><br><span>Đáp án: <b>${st.a?'Đúng':'Sai'}</b> ${isC?'✓':'✗'}</span></div></div>`; });
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
        const group = button.closest('.admin-filter-group'), menu = group.querySelector('.admin-filter-menu'), open = menu.hidden;
        root.querySelectorAll('.admin-filter-menu').forEach(item => item.hidden = true);
        root.querySelectorAll('.admin-filter-trigger').forEach(item => item.setAttribute('aria-expanded', 'false'));
        menu.hidden = !open;
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

    const closeMenu = () => {
        setLiquidGlassMenu(menu, false, menu.dataset.openDirection);
        trigger.setAttribute('aria-expanded', 'false');
        window.removeEventListener('resize', positionMenu);
        window.removeEventListener('scroll', positionMenu, true);
    };

    const openMenu = () => {
        document.body.appendChild(menu);
        menu.hidden = false;
        trigger.setAttribute('aria-expanded', 'true');
        positionMenu();
        setLiquidGlassMenu(menu, true, menu.dataset.openDirection);
        window.addEventListener('resize', positionMenu);
        window.addEventListener('scroll', positionMenu, true);
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

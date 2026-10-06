import {
    appId_fixed, collectionName, collectionReports, collectionStudents, collectionBanks,
    signInAsGuest, subscribeAuthState, signInAdmin, signOutFirebase, getCurrentUser,
    getStudents, getQuestionBanks, getResults, getReports, getTimerConfig,
    addResult, addReport, addStudent,
    deleteResult, deleteStudent, deleteQuestionBank, deleteReport,
    saveQuestionBank, saveTimerConfig, clearStudents, clearQuestionBanks
} from "./firebase.js";
import { state } from "./state.js";
import { buildWordTemplateBlob, parseWordQuestionBank, wordXmlEscape, downloadBlob } from "./word.js";
import { downloadStudentTemplate, exportResultsToExcel } from "./excel.js";
import { setupAntiCheat } from "./anti-cheat.js";


const audioPing = new Audio('https://www.soundjay.com/buttons/sounds/button-16.mp3');
const audioFinish = new Audio('https://www.soundjay.com/misc/sounds/bell-ringing-05.mp3');

function autoScaleApp() {
    const container = document.querySelector('.container');
    const wrapper = document.getElementById('app-wrapper');
    const adminScreen = document.getElementById('screen-admin');
    const reviewArea = document.getElementById('review-area');
    if (!container || !wrapper) return;

    const isReviewing = reviewArea && reviewArea.style.display === 'block';
    if ((adminScreen && adminScreen.classList.contains('active')) || window.innerWidth <= 768 || isReviewing) {
        container.style.transform = `none`; wrapper.style.height = 'auto'; wrapper.style.overflow = 'visible';
        container.style.marginBottom = '50px'; return; 
    }

    container.style.transform = `none`; wrapper.style.height = 'auto'; wrapper.style.overflow = 'visible'; container.style.marginBottom = '0px';
    void container.offsetHeight; 
    const naturalHeight = container.offsetHeight + 20, windowHeight = window.innerHeight;

    if (naturalHeight > windowHeight) {
        const ratio = windowHeight / naturalHeight; container.style.transform = `scale(${ratio})`;
        wrapper.style.height = `${windowHeight}px`; wrapper.style.overflow = 'hidden'; 
    } else {
        container.style.transform = `scale(1)`; wrapper.style.height = `${windowHeight}px`; wrapper.style.overflow = 'hidden'; 
    }
}
window.addEventListener('resize', autoScaleApp); autoScaleApp();

document.addEventListener('copy', (e) => { e.preventDefault(); return false; });

const closeOverlay = (modal) => {
    modal.style.display = 'none';
    if (modal.id === 'delete-auth-modal') { state.pendingAuthAction = null; state.currentDeleteId = null; state.importedStudentsCache = []; state.importedQuestionsCache = {}; document.getElementById('delete-pw').value = ''; document.getElementById('delete-email').value = ''; document.getElementById('file-import-students').value = ''; document.getElementById('file-import-questions').value = '';}
    if (modal.id === 'admin-auth-modal') { document.getElementById('admin-pw').value = ''; }
};

document.addEventListener('keydown', (e) => {
    if ((e.ctrlKey && (e.key === 'c' || e.key === 'v' || e.key === 'x' || e.key === 'u' || e.key === 's'))) {
        e.preventDefault(); return false;
    }
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
        autocomplete(document.getElementById("username"), state.globalStudentList);
    }
});

async function loadStudentList() {
    try {
        const snap = await getStudents();
        state.globalStudentList = [];
        snap.forEach(d => state.globalStudentList.push({id: d.id, ...d.data()}));
        if(!document.getElementById('guest-mode-toggle').checked) { autocomplete(document.getElementById("username"), state.globalStudentList); }
    } catch(e) { console.log("Lỗi tải danh sách HS:", e); }
}

const initAuth = async () => { try { await signInAsGuest(); } catch (e) {} }; initAuth();
subscribeAuthState(async user => { 
    state.currentUser = user; 
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
    const q = state.currentExam[state.currentIdx];
    if (q.type === 'mcq') return !!state.userAnswers[q.id];
    if (q.type === 'tf') { const a = state.userAnswers[q.id] || {}; return (a[0] !== undefined && a[1] !== undefined && a[2] !== undefined && a[3] !== undefined); }
    if (q.type === 'short') { return (state.userAnswers[q.id] || "").trim().length > 0; }
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
        const docRef = await getTimerConfig();
        if(docRef.exists()) {
            const data = docRef.data();
            state.practiceTimeLimit = (data.practice || 45) * 60; state.testTimeLimit = (data.test || 45) * 60; state.maxHintsAllowed = data.maxHints !== undefined ? data.maxHints : 3;
            document.getElementById('cfg-time-practice').value = data.practice || 45; document.getElementById('cfg-time-test').value = data.test || 45; document.getElementById('cfg-max-hints').value = state.maxHintsAllowed;
            
            autoScaleApp();
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
    state.mode = m; state.isQuizRunning = true; state.canCheckCheat = false; state.isProcessingCheat = false; state.hasSaved = false;
    document.getElementById('btn-report-open').style.display = 'none'; document.getElementById('btn-admin-open').style.display = 'none';
    document.getElementById('header-user-info').innerText = `${name} | Lớp: ${cls} | ${topicText}`;
    state.hintsUsed = 0; state.unlockedHints = []; state.currentExam = [];
    
    // TẠM ẨN NÚT VÀ HIỂN THỊ TRẠNG THÁI LOADING
    document.getElementById('start-buttons').style.display = 'none';
    document.getElementById('loading-text').style.display = 'block';

    try {
        let activeBank = { mcq: [], tf: [], short: [] };
        const snap = await getQuestionBanks();
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
        shuffle([...activeBank.mcq]).slice(0, numMcq).forEach(q => state.currentExam.push({...q, id: `q_${qNum}`, type: 'mcq', section: 'Phần I. Trắc nghiệm Đa lựa chọn', displayNum: qNum++}));
        shuffle([...activeBank.tf]).slice(0, numTf).forEach(q => state.currentExam.push({...q, id: `q_${qNum}`, type: 'tf', section: 'Phần II. Trắc nghiệm Đúng/Sai', displayNum: qNum++}));
        shuffle([...activeBank.short]).slice(0, numShort).forEach(q => state.currentExam.push({...q, id: `q_${qNum}`, type: 'short', section: 'Phần III. Trắc nghiệm Trả lời ngắn', displayNum: qNum++}));
        
        state.userAnswers = {}; state.currentIdx = 0; state.timeLeft = (state.mode === 'test') ? state.testTimeLimit : state.practiceTimeLimit;
        const elTimer = document.getElementById('timer'); if(elTimer) { elTimer.innerText = `${Math.floor(state.timeLeft/60)}:${(state.timeLeft%60).toString().padStart(2,'0')}`; }
        state.quizStartTime = Date.now();
        
        // PHỤC HỒI UI BẮT ĐẦU
        document.getElementById('start-buttons').style.display = 'grid';
        document.getElementById('loading-text').style.display = 'none';

        document.getElementById('wish-overlay').style.display = 'flex'; document.getElementById('wish-cheat-info').style.display = (state.mode === 'test') ? 'block' : 'none';
        startFire();
        if(state.mode === 'test') { state.canCheckCheat = true; window.testInitialWidth = window.innerWidth; }
        
        state.wishTimeoutId = setTimeout(() => {
            if(!state.isQuizRunning) return; 
            document.getElementById('wish-overlay').style.display = 'none'; cancelAnimationFrame(fireRequest);
            document.getElementById('main-header').style.display = 'flex'; showScreen('screen-quiz'); renderQuestion(); startTimer();
            if(state.mode === 'practice') state.canCheckCheat = true;
        }, 5000);

    } catch(e) {
        console.error("Lỗi tải đề:", e);
        alert("Có lỗi xảy ra khi tải đề từ Máy chủ Firebase!");
        document.getElementById('start-buttons').style.display = 'grid';
        document.getElementById('loading-text').style.display = 'none';
    }
};

function renderQuestion() {
    const q = state.currentExam[state.currentIdx]; const container = document.getElementById('quiz-content'); const labels = ['A', 'B', 'C', 'D'];
    let html = `<div class="section-title">${q.section}</div><div class="card" style="margin-top: -10px;">`;
    if(state.mode === 'practice') {
        let hintBtnText = state.unlockedHints.includes(q.id) ? "ĐÃ MỞ GỢI Ý 💡" : `XEM GỢI Ý 💡 (Còn ${state.maxHintsAllowed - state.hintsUsed})`;
        let hintHtml = q.e;
        const mask = `<span style="background:#cbd5e0; color:transparent; border-radius:4px; padding:0 8px; user-select:none; border: 1px solid #94a3b8;" title="Đáp án bị che trong chế độ Luyện tập">?</span>`;
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
            const isSelected = state.userAnswers[q.id] === o;
            html += `<div class="option ${isSelected?'selected':''}" data-ans="${o.replace(/"/g, '&quot;')}"><b>${labels[idx]}.</b> ${o}</div>`;
        });
    } else if(q.type === 'tf') {
        html += `<h3>Câu ${q.displayNum}</h3><div style="background:#f1f5f9; padding:15px; border-radius:12px; margin-bottom:15px; font-style:italic;">${q.ctx}</div>`;
        q.sts.forEach((st, si) => {
            let val = (state.userAnswers[q.id]||{})[si];
            html += `<div class="tf-row"><span><b>${st.l}</b> ${st.t}</span><div><button class="tf-btn ${val===true?'active-t':''}" data-si="${si}" data-val="true">Đúng</button><button class="tf-btn ${val===false?'active-f':''}" data-si="${si}" data-val="false">Sai</button></div></div>`;
        });
    } else {
        html += `<h3>Câu ${q.displayNum}. ${q.q}</h3>`;
        const currentVal = (state.userAnswers[q.id] || "").padEnd(4, " ");
        html += `<div class="short-answer-wrapper"><input type="text" class="char-slot" maxlength="1" value="${currentVal[0] !== ' ' ? currentVal[0] : ''}" data-idx="0"><input type="text" class="char-slot" maxlength="1" value="${currentVal[1] !== ' ' ? currentVal[1] : ''}" data-idx="1"><input type="text" class="char-slot" maxlength="1" value="${currentVal[2] !== ' ' ? currentVal[2] : ''}" data-idx="2"><input type="text" class="char-slot" maxlength="1" value="${currentVal[3] !== ' ' ? currentVal[3] : ''}" data-idx="3"></div><p style="color:var(--danger); font-size:0.8rem; font-weight:bold; text-align:center;">Lưu ý: Nhập mỗi ký tự vào một ô</p>`;
    }
    container.innerHTML = html + `</div>`;
    if(q.type === 'mcq') {
        container.querySelectorAll('.option').forEach(el => el.onclick = () => { state.userAnswers[q.id] = el.getAttribute('data-ans'); audioPing.play().catch(()=>{}); renderQuestion(); });
    } else if(q.type === 'tf') {
        container.querySelectorAll('.tf-btn').forEach(el => el.onclick = () => {
            const si = el.getAttribute('data-si'), val = el.getAttribute('data-val') === 'true';
            if(!state.userAnswers[q.id]) state.userAnswers[q.id] = {}; state.userAnswers[q.id][si] = val; audioPing.play().catch(()=>{}); renderQuestion();
        });
    } else {
        const slots = container.querySelectorAll('.char-slot');
        slots.forEach((slot, idx) => {
            slot.oninput = (e) => {
                const val = e.target.value; if (val && idx < 3) slots[idx + 1].focus();
                let combined = ""; slots.forEach(s => combined += (s.value || " ")); state.userAnswers[q.id] = combined.trim();
            };
            slot.onkeydown = (e) => { if (e.key === 'Backspace' && !e.target.value && idx > 0) slots[idx - 1].focus(); };
        });
    }
    const hb = document.getElementById('hint-trigger');
    if(hb) {
        hb.onclick = async () => { 
            const b = document.getElementById('hint-box'); const isH = b.style.display === 'none'; 
            if (isH && !state.unlockedHints.includes(q.id)) {
                if (state.hintsUsed >= state.maxHintsAllowed) { showCustomAlert("⚠️ Bạn đã hết lượt xem gợi ý!"); return; }
                state.hintsUsed++; state.unlockedHints.push(q.id); hb.innerText = "ĐÃ MỞ GỢI Ý 💡";
            }
            b.style.display = isH ? 'block' : 'none'; if(isH && window.MathJax) await MathJax.typesetPromise([b]); autoScaleApp(); 
        };
    }
    document.getElementById('btn-prev').style.visibility = state.currentIdx === 0 ? 'hidden' : 'visible';
    document.getElementById('btn-next').style.display = state.currentIdx === state.currentExam.length - 1 ? 'none' : 'block';
    document.getElementById('btn-finish').style.display = state.currentIdx === state.currentExam.length - 1 ? 'block' : 'none';
    if(window.MathJax) MathJax.typesetPromise().then(autoScaleApp); else setTimeout(autoScaleApp, 50);
}

async function calculateResult() {
    if (state.hasSaved) return; if(!state.isQuizRunning && !state.isProcessingCheat) return; state.hasSaved = true;
    if(state.wishTimeoutId) clearTimeout(state.wishTimeoutId);
    state.isQuizRunning = false; state.canCheckCheat = false; clearInterval(state.timerInt); audioFinish.play().catch(()=>{});
    document.getElementById('btn-report-open').style.display = 'block'; document.getElementById('btn-admin-open').style.display = 'block';
    const dur = Math.floor((Date.now() - state.quizStartTime) / 1000); let score = 0; 
    const totalMCQ = state.currentExam.filter(q=>q.type==='mcq').length || 1;
    const totalTF = state.currentExam.filter(q=>q.type==='tf').length || 1;
    const totalShort = state.currentExam.filter(q=>q.type==='short').length || 1;
    const pMCQ = 3.0 / totalMCQ, pTF = 2.0 / totalTF, pShort = 2.0 / totalShort;
    const tfMap = {0:0, 1: pTF*0.1/0.5, 2: pTF*0.25/0.5, 3: pTF*0.35/0.5, 4: pTF};
    state.currentExam.forEach(q => {
        const norm = (s) => (s || "").toString().trim().replace(',','.');
        if(q.type === 'mcq' && norm(state.userAnswers[q.id]||'') === norm(q.a)) score += pMCQ;
        else if(q.type === 'tf') { let cp = 0, u = state.userAnswers[q.id] || {}; q.sts.forEach((st, si) => { if(u[si] === st.a) cp++; }); score += tfMap[cp] || 0; }
        else if(q.type === 'short' && checkShortAns(state.userAnswers[q.id], q.a)) score += pShort;
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
    if(state.currentUser) {
        try { 
            await addResult( { 
                name: u.name, school: u.sch, sbd: u.sbd, class: u.cls, topic: u.topic, score: fs, duration: dur, mode: state.mode, timestamp: new Date().toISOString(), examData: state.currentExam, userAnswers: state.userAnswers 
            }); 
        } catch(e) { state.hasSaved = false; }
    }
    fetchRankAndLeaderboard(fs, u.topic);
}

async function fetchRankAndLeaderboard(myScore, myTopic) {
    try {
        const snap = await getResults();
        let list = []; snap.forEach(d => list.push(d.data()));
        list = list.filter(r => (r.mode === 'test' || !r.mode) && r.topic === myTopic); 
        list.sort((a,b) => b.score - a.score || a.duration - b.duration);
        const myRank = list.findIndex(r => r.name === window.finalUserData.name && r.score === myScore) + 1;
        if(myRank > 0) document.getElementById('my-rank-text').innerText = `HẠNG ${myRank} / ${list.length}`; else document.getElementById('my-rank-text').innerText = `KẾT QUẢ LUYỆN TẬP`;
    } catch (e) {}
}

async function renderAdmin() {
    const listBody = document.getElementById('admin-list-body'), statsBox = document.getElementById('admin-stats');
    listBody.innerHTML = "<tr><td colspan='11'>Đang tải dữ liệu...</td></tr>";
    try {
        const snap = await getResults();
        let rawData = []; snap.forEach(d => rawData.push({id: d.id, ...d.data()}));
        const classes = [...new Set(rawData.map(i => i.class))].sort(); 
        const schools = [...new Set(rawData.map(i => i.school))].filter(s => s).sort();
        const topics = [...new Set(rawData.map(i => i.topic))].filter(t => t).sort(); 
        const fClass = document.getElementById('admin-filter-class'); const oldC = fClass.value; fClass.innerHTML = '<option value="all">Tất cả lớp</option>' + classes.map(c => `<option value="${c}" ${c===oldC?'selected':''}>Lớp ${c}</option>`).join('');
        const fSchool = document.getElementById('admin-filter-school'); const oldS = fSchool.value; fSchool.innerHTML = '<option value="all">Tất cả trường</option>' + schools.map(s => `<option value="${s}" ${s===oldS?'selected':''}>${s}</option>`).join('');
        const fTopic = document.getElementById('admin-filter-topic'); const oldT = fTopic.value; fTopic.innerHTML = '<option value="all">Tất cả chuyên đề</option>' + topics.map(t => `<option value="${t}" ${t===oldT?'selected':''}>${t}</option>`).join(''); 
        const mFilter = document.getElementById('admin-filter-mode').value, sVal = document.getElementById('admin-sort').value;
        let data = rawData.filter(i => { 
            return ((mFilter === 'all') || (i.mode === mFilter)) 
                && ((fClass.value === 'all') || (i.class === fClass.value)) 
                && ((fSchool.value === 'all') || (i.school === fSchool.value))
                && ((fTopic.value === 'all') || (i.topic === fTopic.value)); 
        });
        data.sort((a,b) => { if(sVal === 'score_desc') return b.score - a.score || a.duration - b.duration; if(sVal === 'date_new') return new Date(b.timestamp) - new Date(a.timestamp); if(sVal === 'duration_fast') return a.duration - b.duration || b.score - a.score; return 0; });
        let s = { xs: 0, g: 0, k: 0, d: 0, cd: 0 };
        data.forEach(i => { if(i.score >= 9.0) s.xs++; else if(i.score >= 8.0) s.g++; else if(i.score >= 6.5) s.k++; else if(i.score >= 5.0) s.d++; else s.cd++; });
        statsBox.innerHTML = `<div class="stat-box" style="border-bottom-color: #f59e0b"><b>${s.xs}</b><br><small>X.Sắc</small></div><div class="stat-box" style="border-bottom-color: #10b981"><b>${s.g}</b><br><small>Giỏi</small></div><div class="stat-box" style="border-bottom-color: #3b82f6"><b>${s.k}</b><br><small>Khá</small></div><div class="stat-box" style="border-bottom-color: #8b5cf6"><b>${s.d}</b><br><small>Đạt</small></div><div class="stat-box" style="border-bottom-color: #ef4444"><b>${s.cd}</b><br><small>C.Đạt</small></div>`;
        listBody.innerHTML = data.map((i, idx) => `<tr><td>${idx+1}</td><td>${i.sbd}</td><td>${i.name}</td><td>${i.class}</td><td>${i.school||'-'}</td><td style="font-size:0.75rem; color:var(--primary); font-weight:bold;">${i.topic || 'Đề tổng hợp'}</td><td><span class="badge-mode ${i.mode === 'practice' ? 'badge-practice' : 'badge-test'}">${i.mode === 'practice' ? 'Luyện tập' : 'Kiểm tra'}</span></td><td><b>${Number((i.score||0).toFixed(2))}</b></td><td>${i.duration}s</td><td>${new Date(i.timestamp).toLocaleDateString()}</td><td style="display:flex; gap:5px;"><button style="background:var(--secondary); color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer" class="btn-view" data-id="${i.id}">👁️</button><button style="background:red; color:white; border:none; padding:4px 8px; border-radius:4px; cursor:pointer" class="btn-del" data-id="${i.id}">X</button></td></tr>`).join('');
        listBody.querySelectorAll('.btn-del').forEach(b => b.onclick = () => deleteEntry(b.dataset.id, 'result'));
        listBody.querySelectorAll('.btn-view').forEach(b => b.onclick = () => viewAdminReview(b.dataset.id)); window.currentFilteredData = data; setTimeout(autoScaleApp, 50);
    } catch(e) { listBody.innerHTML = "<tr><td colspan='11'>Lỗi kết nối Firebase.</td></tr>"; }
}

async function renderAdminStudents() {
    const listBody = document.getElementById('student-list-body');
    listBody.innerHTML = "<tr><td colspan='6' style='text-align: center;'>Đang tải danh sách...</td></tr>";
    try {
        await loadStudentList(); 
        
        const classes = [...new Set(state.globalStudentList.map(i => i.class))].filter(c => c).sort(); 
        const schools = [...new Set(state.globalStudentList.map(i => i.school))].filter(s => s).sort();
        
        const fClass = document.getElementById('stu-filter-class'); const oldC = fClass.value; 
        fClass.innerHTML = '<option value="all">Tất cả lớp</option>' + classes.map(c => `<option value="${c}" ${c===oldC?'selected':''}>Lớp ${c}</option>`).join('');
        const fSchool = document.getElementById('stu-filter-school'); const oldS = fSchool.value; 
        fSchool.innerHTML = '<option value="all">Tất cả trường</option>' + schools.map(s => `<option value="${s}" ${s===oldS?'selected':''}>${s}</option>`).join('');
        
        let data = state.globalStudentList.filter(i => { 
            return ((fClass.value === 'all') || (i.class === fClass.value)) 
                && ((fSchool.value === 'all') || (i.school === fSchool.value));
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
        setTimeout(autoScaleApp, 50);
    } catch(e) { listBody.innerHTML = "<tr><td colspan='6' style='text-align: center; color: red;'>Lỗi kết nối CSDL.</td></tr>"; }
}

async function renderAdminQuestions() {
    const listBody = document.getElementById('question-bank-body');
    listBody.innerHTML = "<tr><td colspan='5' style='text-align: center;'>Đang tải dữ liệu...</td></tr>";
    try {
        const snap = await getQuestionBanks();
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
    document.getElementById('ar-name').innerText = `${record.name} - Điểm: ${record.score}`; state.arExamData = record.examData; state.arUserAnswers = record.userAnswers || {};
    const content = document.getElementById('ar-content'); let h = '', labels = ['A', 'B', 'C', 'D'];
    const norm = (s) => (s || "").toString().trim().replace(',','.'); 
    const pMCQ = 3.0 / (state.arExamData.filter(q=>q.type==='mcq').length||1), pTF = 2.0 / (state.arExamData.filter(q=>q.type==='tf').length||1), pShort = 2.0 / (state.arExamData.filter(q=>q.type==='short').length||1);
    const tfMapReview = {0:0, 1: pTF*0.1/0.5, 2: pTF*0.25/0.5, 3: pTF*0.35/0.5, 4: pTF};
    state.arExamData.forEach(q => {
        let qText = q.type === 'tf' ? `Câu ${q.displayNum} (Đúng/Sai)` : `Câu ${q.displayNum}. ${q.q}`; let itemScore = 0, scoreHTML = '';
        if(q.type === 'mcq') { itemScore = norm(state.arUserAnswers[q.id]||'') === norm(q.a) ? pMCQ : 0; scoreHTML = `<span class="score-badge ${itemScore > 0 ? 'score-plus' : 'score-zero'}">${itemScore > 0 ? '+'+itemScore.toFixed(2) : '0'}đ</span>`; }
        else if(q.type === 'short') { itemScore = checkShortAns(state.arUserAnswers[q.id], q.a) ? pShort : 0; scoreHTML = `<span class="score-badge ${itemScore > 0 ? 'score-plus' : 'score-zero'}">${itemScore > 0 ? '+'+itemScore.toFixed(2) : '0'}đ</span>`; }
        else if(q.type === 'tf') { let cp = 0; q.sts.forEach((st, si) => { if((state.arUserAnswers[q.id]||{})[si] === st.a) cp++; }); itemScore = tfMapReview[cp] || 0; scoreHTML = `<span class="score-badge ${itemScore > 0 ? 'score-plus' : 'score-zero'}">Đúng ${cp}/4 ý (${itemScore > 0 ? '+'+itemScore.toFixed(2) : '0'}đ)</span>`; }
        h += `<div style="border-left: 5px solid ${itemScore > 0 ? 'var(--success)' : 'var(--danger)'}; padding-left: 15px; margin-bottom: 25px;"><h4>${qText} ${scoreHTML}</h4>`;
        if(q.type === 'mcq') {
            (q.shuffledOptions || q.o).forEach((o, idx) => { const isC = norm(o) === norm(q.a), isU = state.arUserAnswers[q.id] === o; h += `<div style="padding: 8px; margin: 5px 0; border-radius: 5px; background: ${isC ? '#d1fae5' : (isU ? '#fee2e2' : '#f8fafc')}; border: 1px solid ${isC ? 'var(--success)' : (isU ? 'var(--danger)' : '#e2e8f0')}"><b>${labels[idx]}.</b> ${o} ${isC?'✓':(isU?'✗':'')}</div>`; });
        } else if(q.type === 'tf') {
            q.sts.forEach((st, si) => { let uV = (state.arUserAnswers[q.id]||{})[si], isC = (uV === st.a); h += `<div style="padding: 5px; border-bottom:1px solid #e2e8f0;">${st.l} ${st.t} <br><span style="font-size:0.8rem;">Bạn: <b style="color:${isC?'#10b981':'#ef4444'}">${uV===true?'Đúng':(uV===false?'Sai':'Trống')}</b> | Đáp án: <b>${st.a?'Đúng':'Sai'}</b></span></div>`; });
        } else {
            const isC = checkShortAns(state.arUserAnswers[q.id], q.a); h += `<div style="padding: 8px; background: #f8fafc; border-radius: 5px;">Bạn nhập: <b style="color:${isC?'#10b981':'#ef4444'}">${state.arUserAnswers[q.id]||'Trống'}</b> <br> Đáp án: <b style="color:#10b981">${q.a}</b></div>`;
        }
        h += `</div>`;
    });
    content.innerHTML = h; document.getElementById('admin-review-modal').style.display = 'flex'; if(window.MathJax) MathJax.typesetPromise([content]);
}
document.getElementById('btn-ar-close').onclick = () => document.getElementById('admin-review-modal').style.display = 'none';

document.getElementById('btn-ar-retry').onclick = () => {
    let wrongQuestions = []; let newQCount = 1; const norm = (s) => (s || "").toString().trim().replace(',','.');
    state.arExamData.forEach(q => {
        let isWrong = false;
        if (q.type === 'mcq' && norm(state.arUserAnswers[q.id]) !== norm(q.a)) isWrong = true;
        else if (q.type === 'short' && !checkShortAns(state.arUserAnswers[q.id], q.a)) isWrong = true;
        else if (q.type === 'tf') { let cp = 0; q.sts.forEach((st, si) => { if((state.arUserAnswers[q.id]||{})[si] === st.a) cp++; }); if (cp < 4) isWrong = true; }
        if (isWrong) { let clonedQ = JSON.parse(JSON.stringify(q)); clonedQ.displayNum = newQCount++; wrongQuestions.push(clonedQ); }
    });
    if (wrongQuestions.length === 0) { alert("Tuyệt vời! Học sinh này đã làm đúng toàn bộ 100%."); return; }
    document.getElementById('admin-review-modal').style.display = 'none'; document.getElementById('screen-admin').classList.remove('active');
    document.getElementById('btn-report-open').style.display = 'none'; document.getElementById('btn-admin-open').style.display = 'none';
    state.currentExam = wrongQuestions; state.userAnswers = {}; state.currentIdx = 0; state.mode = 'practice'; state.isQuizRunning = true; state.timeLeft = state.practiceTimeLimit; state.hasSaved = false; 
    const elTimer = document.getElementById('timer'); if(elTimer) { elTimer.innerText = `${Math.floor(state.timeLeft/60)}:${(state.timeLeft%60).toString().padStart(2,'0')}`; }
    state.quizStartTime = Date.now(); document.getElementById('main-header').style.display = 'flex'; showScreen('screen-quiz'); renderQuestion(); startTimer();
};

// EXCEL IMPORT CHO DANH SÁCH HỌC SINH
document.getElementById('btn-download-template').onclick = () => downloadStudentTemplate();
document.getElementById('btn-trigger-import').onclick = () => { document.getElementById('file-import-students').click(); };

document.getElementById('btn-delete-all-students').onclick = () => { 
    state.pendingAuthAction = 'delete_all_students'; 
    if (getCurrentUser() && !getCurrentUser().isAnonymous) { executePendingAdminAction(); return; }
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
            
            state.importedStudentsCache = []; let duplicateCount = 0;
            
            json.forEach(row => {
                let name = (row["Họ và Tên"] || row["Họ tên"] || row["Name"] || "").toString().trim();
                let cls = (row["Lớp"] || row["Class"] || "").toString().trim();
                let sbd = (row["SBD"] || row["Số báo danh"] || "").toString().trim();
                let sch = (row["Trường"] || row["School"] || "THCS Thuỷ Phương").toString().trim();
                if(name) {
                    let isDupDB = state.globalStudentList.some(s => s.name === name && s.class === cls && s.school === sch);
                    let isDupCache = state.importedStudentsCache.some(s => s.name === name && s.class === cls && s.school === sch);
                    if(!isDupDB && !isDupCache) { state.importedStudentsCache.push({ name: name, class: cls, sbd: sbd, school: sch, timestamp: new Date().toISOString() }); } else { duplicateCount++; }
                }
            });
            
            if (state.importedStudentsCache.length > 0) {
                state.pendingAuthAction = 'import_students'; 
                if (getCurrentUser() && !getCurrentUser().isAnonymous) { executePendingAdminAction(); return; }
                let msg = "Xác nhận Import " + state.importedStudentsCache.length + " HS";
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
    state.pendingAuthAction = 'delete_all_questions'; 
    if (getCurrentUser() && !getCurrentUser().isAnonymous) { executePendingAdminAction(); return; }
    document.getElementById('auth-action-title').innerText = 'Xóa TOÀN BỘ Kho Đề'; 
    document.getElementById('delete-pw').value = ''; document.getElementById('delete-email').value = '';
    document.getElementById('delete-auth-modal').style.display = 'flex'; 
};

const normalizeWordHtml = (html) => {

    const file = e.target.files[0]; if (!file) return;
    const selectedTopic = document.getElementById('import-q-topic').value;
    if (!selectedTopic) { showCustomAlert('⚠️ Vui lòng CHỌN CHUYÊN ĐỀ trước khi Import!'); e.target.value = ''; return; }
    try {
        const data = await file.arrayBuffer();
        const parsed = await parseWordQuestionBank(data);
        state.importedQuestionsCache = {};
        state.importedQuestionsCache[selectedTopic] = parsed;
        const total = parsed.mcq.length + parsed.tf.length + parsed.short.length;
        if (total > 0) {
            state.pendingAuthAction = 'import_questions';
            if (getCurrentUser() && !getCurrentUser().isAnonymous) { executePendingAdminAction(); return; }
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
    state.pendingAuthAction = type === 'student' ? 'delete_student' : 'delete_result'; 
    state.currentDeleteId = id; 
    if (getCurrentUser() && !getCurrentUser().isAnonymous) { executePendingAdminAction(); return; }
    document.getElementById('auth-action-title').innerText = "Xác nhận Xoá"; 
    document.getElementById('delete-pw').value = ''; document.getElementById('delete-email').value = '';
    document.getElementById('delete-auth-modal').style.display = 'flex'; 
}

async function executePendingAdminAction() {
    if (state.pendingAuthAction === 'delete_result' && state.currentDeleteId) { 
        await deleteResult(state.currentDeleteId); 
        renderAdmin(); state.currentDeleteId = null; 
    } 
    else if (state.pendingAuthAction === 'delete_student' && state.currentDeleteId) { 
        await deleteStudent(state.currentDeleteId); 
        renderAdminStudents(); state.currentDeleteId = null; 
    } 
    else if (state.pendingAuthAction === 'delete_all_students') {
        showCustomAlert("Đang xóa toàn bộ học sinh, vui lòng đợi...");
        try {
            const snap = await getStudents();
            const deletePromises = []; snap.forEach(docSnap => { deletePromises.push(deleteStudent(docSnap.id)); });
            await Promise.all(deletePromises);
            showCustomAlert("✅ Đã làm sạch toàn bộ danh sách học sinh!"); renderAdminStudents();
        } catch(e) { showCustomAlert("Lỗi khi xóa dữ liệu!"); }
    }
    else if (state.pendingAuthAction === 'import_students' && state.importedStudentsCache.length > 0) {
        showCustomAlert("Đang tiến hành nhập dữ liệu, vui lòng đợi...");
        try {
            for(let i=0; i<state.importedStudentsCache.length; i++) { await addStudent( state.importedStudentsCache[i]); }
            showCustomAlert(`✅ Đã import thành công ${state.importedStudentsCache.length} học sinh!`);
            state.importedStudentsCache = []; renderAdminStudents();
        } catch(e) { showCustomAlert("Lỗi khi tải dữ liệu lên Server!"); }
    }
    else if (state.pendingAuthAction === 'import_questions' && Object.keys(state.importedQuestionsCache).length > 0) {
        showCustomAlert("Đang tiến hành đẩy kho đề lên Đám mây, vui lòng đợi...");
        try {
            const topics = Object.keys(state.importedQuestionsCache);
            for(let i = 0; i < topics.length; i++) {
                const tCode = topics[i];
                await saveQuestionBank(tCode, state.importedQuestionsCache[tCode]);
            }
            showCustomAlert(`✅ Đã đẩy thành công dữ liệu của ${topics.length} chuyên đề!`);
            state.importedQuestionsCache = {}; renderAdminQuestions();
        } catch(e) { showCustomAlert("Lỗi khi đẩy đề lên Server!"); console.error(e); }
    }
    else if (state.pendingAuthAction === 'delete_all_questions') {
        showCustomAlert("Đang xóa toàn bộ Ngân hàng đề, vui lòng đợi...");
        try {
            const snap = await getQuestionBanks();
            const deletePromises = []; snap.forEach(docSnap => { deletePromises.push(deleteQuestionBank(docSnap.id)); });
            await Promise.all(deletePromises);
            showCustomAlert("✅ Đã xóa sạch kho đề trên hệ thống!"); renderAdminQuestions();
        } catch(e) { showCustomAlert("Lỗi khi xóa dữ liệu đề!"); }
    }
    else if (state.pendingAuthAction === 'config') {
        const pTime = parseInt(document.getElementById('cfg-time-practice').value), tTime = parseInt(document.getElementById('cfg-time-test').value), mHints = parseInt(document.getElementById('cfg-max-hints').value);
        if(isNaN(pTime) || isNaN(tTime) || isNaN(mHints) || pTime <= 0 || tTime <= 0 || mHints < 0) { showCustomAlert("⚠️ Vui lòng nhập số hợp lệ!"); return; }
        try { await saveTimerConfig({ practice: pTime, test: tTime, maxHints: mHints, lastUpdated: new Date().toISOString() }); state.practiceTimeLimit = pTime * 60; state.testTimeLimit = tTime * 60; state.maxHintsAllowed = mHints; showCustomAlert("Đã cập nhật cấu hình thành công!"); } catch(e) { showCustomAlert("Lỗi khi lưu cấu hình!"); }
    } else if (state.pendingAuthAction === 'inbox') { renderAdminInbox(); }
    state.pendingAuthAction = null;
}


document.getElementById('btn-save-config').onclick = () => { 
    state.pendingAuthAction = 'config'; 
    if (getCurrentUser() && !getCurrentUser().isAnonymous) { executePendingAdminAction(); return; }
    document.getElementById('auth-action-title').innerText = "Lưu Cấu Hình"; 
    document.getElementById('delete-pw').value = ''; document.getElementById('delete-email').value = '';
    document.getElementById('delete-auth-modal').style.display = 'flex'; 
};

document.getElementById('btn-admin-inbox').onclick = () => { 
    state.pendingAuthAction = 'inbox'; 
    if (getCurrentUser() && !getCurrentUser().isAnonymous) { executePendingAdminAction(); return; }
    document.getElementById('auth-action-title').innerText = "Mở Hộp Thư 📩"; 
    document.getElementById('delete-pw').value = ''; document.getElementById('delete-email').value = '';
    document.getElementById('delete-auth-modal').style.display = 'flex'; 
};

document.getElementById('btn-delete-cancel').onclick = () => { document.getElementById('delete-auth-modal').style.display = 'none'; state.currentDeleteId = null; state.pendingAuthAction = null; state.importedStudentsCache = []; state.importedQuestionsCache = {};};

document.getElementById('btn-delete-confirm').onclick = async () => { 
    const email = document.getElementById('delete-email').value.trim();
    const pw = document.getElementById('delete-pw').value;
    if (!email || !pw) { showCustomAlert("Vui lòng nhập Email và Mật khẩu!"); return; }
    
    document.getElementById('btn-delete-confirm').innerText = "...";
    try {
        await signInAdmin(email, pw);
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
document.getElementById('btn-prev').onclick = () => { if(state.currentIdx > 0) { state.currentIdx--; renderQuestion(); window.scrollTo(0,0); } };
document.getElementById('btn-next').onclick = () => { if(!isCurrentQuestionComplete()) { showCustomAlert(); return; } if(state.currentIdx < state.currentExam.length - 1) { state.currentIdx++; renderQuestion(); window.scrollTo(0,0); } };
document.getElementById('btn-finish').onclick = () => { if(!isCurrentQuestionComplete()) { showCustomAlert(); return; } document.getElementById('confirm-finish-modal').style.display = 'flex'; };
document.getElementById('btn-modal-cancel').onclick = () => document.getElementById('confirm-finish-modal').style.display = 'none';
document.getElementById('btn-modal-confirm').onclick = () => { document.getElementById('confirm-finish-modal').style.display = 'none'; calculateResult(); };

document.getElementById('btn-admin-close').onclick = async () => { 
    if (getCurrentUser() && !getCurrentUser().isAnonymous) {
        await signOutFirebase();
        await signInAsGuest();
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
            state.reportImageBase64 = canvas.toDataURL('image/jpeg', 0.7); 
            document.getElementById('report-img-preview').src = state.reportImageBase64; 
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
        await addReport( { name: window.finalUserData?.name || "Học sinh Ẩn danh", question: qPos, detail: detail, image: state.reportImageBase64, timestamp: new Date().toISOString() });
        document.getElementById('report-modal').style.display = 'none'; showCustomAlert("Cảm ơn bạn đã gửi báo lỗi!");
        document.getElementById('report-question').value = ''; document.getElementById('report-detail').value = ''; document.getElementById('report-file').value = ''; document.getElementById('report-img-preview').style.display = 'none'; state.reportImageBase64 = "";
    } catch(e) { showCustomAlert("Có lỗi xảy ra, vui lòng thử lại sau!"); }
    btn.innerText = "GỬI PHẢN HỒI"; btn.disabled = false;
};

async function renderAdminInbox() {
    document.getElementById('admin-inbox-modal').style.display = 'flex'; const listBody = document.getElementById('inbox-list-body'); listBody.innerHTML = "<tr><td colspan='6'>Đang tải hộp thư...</td></tr>";
    try {
        const snap = await getReports();
        let reports = []; snap.forEach(d => reports.push({id: d.id, ...d.data()})); reports.sort((a,b) => new Date(b.timestamp) - new Date(a.timestamp));
        if (reports.length === 0) { listBody.innerHTML = "<tr><td colspan='6' style='text-align:center;'>Hộp thư trống. Chưa có báo cáo nào!</td></tr>"; return; }
        listBody.innerHTML = reports.map(r => `<tr><td><small>${new Date(r.timestamp).toLocaleString('vi-VN')}</small></td><td><b>${r.name}</b></td><td>${r.question || '-'}</td><td>${r.detail || '-'}</td><td>${r.image ? `<button class="btn btn-gray btn-view-img" data-img="${r.image}" style="padding:4px 8px; font-size:0.75rem;">Xem ảnh 🖼️</button>` : '-'}</td><td><button class="btn-del-report" data-id="${r.id}" style="background:var(--danger); color:white; border:none; padding:6px 10px; border-radius:4px; cursor:pointer; font-size: 0.8rem;">Xóa</button></td></tr>`).join('');
        listBody.querySelectorAll('.btn-del-report').forEach(b => { b.onclick = async () => { if (confirm("Xóa báo cáo lỗi này?")) { b.innerText = "..."; b.disabled = true; await deleteReport(b.dataset.id); renderAdminInbox(); } } });
        listBody.querySelectorAll('.btn-view-img').forEach(b => { b.onclick = () => { document.getElementById('image-viewer-img').src = b.dataset.img; document.getElementById('image-viewer-modal').style.display = 'flex'; } });
    } catch(e) {}
}
document.getElementById('btn-inbox-close').onclick = () => document.getElementById('admin-inbox-modal').style.display = 'none';

document.getElementById('btn-view-review').onclick = () => {
    const area = document.getElementById('review-area'), content = document.getElementById('review-content'), labels = ['A', 'B', 'C', 'D']; area.style.display = 'block'; let h = '';
    const norm = (s) => (s || "").toString().trim().replace(',','.');
    const pMCQ = 3.0 / (state.currentExam.filter(q=>q.type==='mcq').length||1), pTF = 2.0 / (state.currentExam.filter(q=>q.type==='tf').length||1), pShort = 2.0 / (state.currentExam.filter(q=>q.type==='short').length||1);
    const tfMapReview = {0:0, 1: pTF*0.1/0.5, 2: pTF*0.25/0.5, 3: pTF*0.35/0.5, 4: pTF};
    state.currentExam.forEach(q => {
        let qText = q.type === 'tf' ? `Câu ${q.displayNum} (Đúng/Sai)` : `Câu ${q.displayNum}. ${q.q}`; let itemScore = 0, scoreHTML = '';
        if(q.type === 'mcq') { itemScore = norm(state.userAnswers[q.id]||'') === norm(q.a) ? pMCQ : 0; scoreHTML = `<span class="score-badge ${itemScore > 0 ? 'score-plus' : 'score-zero'}">${itemScore > 0 ? '+'+itemScore.toFixed(2) : '0'}đ</span>`; } 
        else if(q.type === 'short') { itemScore = checkShortAns(state.userAnswers[q.id], q.a) ? pShort : 0; scoreHTML = `<span class="score-badge ${itemScore > 0 ? 'score-plus' : 'score-zero'}">${itemScore > 0 ? '+'+itemScore.toFixed(2) : '0'}đ</span>`; } 
        else if(q.type === 'tf') { let cp = 0; q.sts.forEach((st, si) => { if((state.userAnswers[q.id]||{})[si] === st.a) cp++; }); itemScore = tfMapReview[cp] || 0; scoreHTML = `<span class="score-badge ${itemScore > 0 ? 'score-plus' : 'score-zero'}">Đúng ${cp}/4 ý (${itemScore > 0 ? '+'+itemScore.toFixed(2) : '0'}đ)</span>`; }
        h += `<div class="card" style="border-left: 8px solid var(--primary)"><h3>${qText} ${scoreHTML}</h3>`;
        if(q.type === 'mcq') {
            (q.shuffledOptions || q.o).forEach((o, idx) => { const isC = norm(o) === norm(q.a), isU = state.userAnswers[q.id] === o; h += `<div class="option ${isC?'correct':(isU?'wrong':'')}"><b>${labels[idx]}.</b> ${o} ${isC?'✓':(isU?'✗':'')}</div>`; });
            if(norm(state.userAnswers[q.id]||'') !== norm(q.a)) h += `<div class="review-choice-box review-wrong" style="padding:10px; border-radius:8px; margin-top:10px; background:#fee2e2; border:1px solid #ef4444;">Bạn chọn: <b>${state.userAnswers[q.id]||'Chưa chọn'}</b>. Đáp án: <b style="color:#10b981">${q.a}</b></div>`;
        } else if(q.type === 'tf') {
            h += `<div style="background:#f1f5f9; padding:15px; border-radius:12px; margin-bottom:15px; font-style:italic;">${q.ctx}</div>`;
            q.sts.forEach((st, si) => { let uV = (state.userAnswers[q.id]||{})[si], isC = (uV === st.a); h += `<div class="tf-row" style="display:flex; justify-content:space-between; align-items:center; padding:10px 0; border-bottom:1px solid #f1f5f9;"><span>${st.l} ${st.t}</span><div style="font-size:0.8rem; text-align:right; width: max-content;"><span style="color:${isC?'#10b981':'#ef4444'}">Bạn: <b>${uV===true?'Đúng':(uV===false?'Sai':'?')}</b></span><br><span>Đáp án: <b>${st.a?'Đúng':'Sai'}</b> ${isC?'✓':'✗'}</span></div></div>`; });
        } else {
            const isC = checkShortAns(state.userAnswers[q.id], q.a); h += `<p>Bạn nhập: <b style="color:${isC?'#10b981':'#ef4444'}">${state.userAnswers[q.id]||'Trống'}</b></p><p>Đáp án đúng: <b style="color:#10b981">${q.a}</b> ${isC?'✓':'✗'}</p>`;
        }
        h += `<div class="explanation"><b>Giải thích:</b><br>${q.e}</div></div>`;
    });
    content.innerHTML = h; const target = document.getElementById('review-heading'); if (target) { setTimeout(async () => { const y = target.getBoundingClientRect().top + window.pageYOffset - 20; window.scrollTo({ top: y, behavior: 'smooth' }); if(window.MathJax) await MathJax.typesetPromise([content]); autoScaleApp(); }, 150); }
};

document.getElementById('btn-export-excel').onclick = () => exportResultsToExcel(window.currentFilteredData || [], showCustomAlert);

function showScreen(id) { document.querySelectorAll('.screen').forEach(s => s.classList.remove('active')); document.getElementById(id).classList.add('active'); setTimeout(autoScaleApp, 50); }
function shuffle(a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
function startTimer() { clearInterval(state.timerInt); state.timerInt = setInterval(() => { state.timeLeft--; const el = document.getElementById('timer'); if(el) el.innerText = `${Math.floor(state.timeLeft/60)}:${(state.timeLeft%60).toString().padStart(2,'0')}`; if(state.timeLeft <= 0) calculateResult(); }, 1000); }

const triggerCheat = () => { if (state.canCheckCheat && state.isQuizRunning && state.mode === 'test' && !state.isProcessingCheat) { state.isProcessingCheat = true; state.isQuizRunning = false; calculateResult(); document.getElementById('cheat-modal').style.display = 'flex'; } };

    document.getElementById('main-header').style.display = 'none'; 
};

setupAntiCheat(calculateResult);

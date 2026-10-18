import { initializeApp } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-app.js";
import { getAuth, signInWithEmailAndPassword, signInAnonymously, signOut } from "https://www.gstatic.com/firebasejs/12.11.0/firebase-auth.js";
import {
  getFirestore, collection, doc, getDoc, getDocs, setDoc, updateDoc, onSnapshot,
  serverTimestamp, Timestamp, runTransaction
} from "https://www.gstatic.com/firebasejs/12.11.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyCH-47CWu8DWwTmAT1QH3ua89LghT9TNIA",
  authDomain: "khtn-10.firebaseapp.com",
  projectId: "khtn-10",
  storageBucket: "khtn-10.firebasestorage.app",
  messagingSenderId: "259562457690",
  appId: "1:259562457690:web:414909df433ad291716663",
  measurementId: "G-XH9S9LTP65"
};
const app = initializeApp(firebaseConfig, "host-client-exam-room");
const auth = getAuth(app);
const db = getFirestore(app);
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
  // Thông báo nằm gần đầu trang; đưa người dùng lên để luôn nhìn thấy thông báo.
  window.scrollTo({ top: 0, behavior: "smooth" });
}
function clearMessage() { $("global-message").classList.add("hidden"); }
function show(el, yes = true) { $(el).classList.toggle("hidden", !yes); }
function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, c => ({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"}[c]));
}
function roomRef(id = roomId) { return doc(db, ROOT, id); }
function participantRef(uid, id = roomId) { return doc(db, ROOT, id, "participants", uid); }
function submissionsRef(id = roomId) { return collection(db, ROOT, id, "submissions"); }
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
function shuffle(items) {
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
  if (user && !user.isAnonymous) await signOut(auth);
  if (!auth.currentUser) {
    const credential = await signInAnonymously(auth);
    user = credential.user;
  } else user = auth.currentUser;
  if (!user.isAnonymous) throw new Error("Không tạo được phiên học sinh.");
}
async function getSelectedQuestions(topic) {
  const snap = await getDocs(collection(db, ...BANK_PATH));
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
  shuffle(bank.mcq || []).slice(0,12).forEach(q => picked.push({...q, type:"mcq"}));
  shuffle(bank.tf || []).slice(0,4).forEach(q => picked.push({...q, type:"tf"}));
  shuffle(bank.short || []).slice(0,4).forEach(q => picked.push({...q, type:"short"}));
  if (!picked.length) throw new Error("Chuyên đề này chưa có câu hỏi.");
  return shuffle(picked).map((q,i) => ({...q, id:"q_"+(i+1), displayNum:i+1}));
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
      hostUid: user.uid, hostEmail: user.email || "",
      status: "waiting", durationMinutes, readingMinutes: 5,
      publicQuestions, createdAt: serverTimestamp(), readingStartedAt: null,
      examEndsAt: null, finishedAt: null
    });
    await setDoc(doc(db, ROOT, code, "private", "answer_key"), { keys, createdAt: serverTimestamp() });
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
      rosterUnsub = rosterUnsub || onSnapshot(collection(db, ROOT, code, "participants"), s => {
        roster = s.docs.map(d => ({id:d.id,...d.data()})); renderRoster(); renderSubmissions();
      }, e => message("Không tải được danh sách: " + e.message, true));
      submissionsUnsub = submissionsUnsub || onSnapshot(submissionsRef(code), s => {
        submissions = s.docs.map(d => ({id:d.id,...d.data()})); renderSubmissions();
      }, e => message("Không tải được bài nộp: " + e.message, true));
    } else {
      // Theo dõi hồ sơ thí sinh theo thời gian thực để trạng thái duyệt/nộp bài
      // cập nhật ngay cả khi tài liệu phòng thi không thay đổi.
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
    await setDoc(doc(db, ROOT, roomId, "submissions", user.uid), {
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
  const keySnap = await getDoc(doc(db, ROOT, roomId, "private", "answer_key"));
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
    await setDoc(doc(db,ROOT,roomId,"grades",uid),{
      uid, autoScore:auto.autoScore, mcqScore:auto.mcqScore, tfScore:auto.tfScore,
      manualShortScore:Number(total.toFixed(2)), manualScores:scores,
      finalScore, gradedBy:user.uid, gradedAt:serverTimestamp()
    });
    await updateDoc(doc(db,ROOT,roomId,"submissions",uid),{
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
    const credential=await signInWithEmailAndPassword(auth,email,password);
    user=credential.user;
    await requireHost();
    show("host-login",false);show("host-create",true);
    message("Đăng nhập Host thành công.");
  } catch(e) {
    if(auth.currentUser && !auth.currentUser.isAnonymous) await signOut(auth).catch(()=>{});
    user=auth.currentUser;
    message(e.message?.includes("cấp quyền")?e.message:"Đăng nhập Host thất bại. Kiểm tra email, mật khẩu và cấu hình Firebase Auth.",true);
  } finally { $("host-login-btn").disabled=false; }
});
$("host-logout-btn").addEventListener("click",async()=>{try{await signOut(auth);user=null;show("host-create",false);show("host-login",true);message("Đã đăng xuất Host.");}catch(e){message(e.message,true);}});
$("create-room-btn").addEventListener("click",createRoom);
$("join-room-btn").addEventListener("click",joinRoom);
$("approve-all-btn").addEventListener("click",approveAll);
$("start-reading-btn").addEventListener("click",startReading);
$("finish-room-btn").addEventListener("click",finishRoom);
$("submit-exam-btn").addEventListener("click",submitExam);
$("leave-room-btn").addEventListener("click",leaveRoom);
$("join-code").addEventListener("input",e=>e.target.value=e.target.value.toUpperCase().replace(/[^A-HJ-NP-Z2-9]/g,"").slice(0,6));

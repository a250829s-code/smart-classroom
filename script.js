// ===== Firebase SDK =====
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.12.2/firebase-app.js";

import {
  getFirestore,
  collection,
  addDoc,
  serverTimestamp,
  query,
  where,
  orderBy,
  onSnapshot,
  doc,
  deleteDoc,
  updateDoc,
  runTransaction
} from "https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js";


// ===== Firebase設定 =====
const firebaseConfig = {
  apiKey: "AIzaSyBUyO6aAzGQp4QJpOHssoZ1sLGCY_3G71I",
  authDomain: "smart-classroom-e8dec.firebaseapp.com",
  projectId: "smart-classroom-e8dec",
  storageBucket: "smart-classroom-e8dec.firebasestorage.app",
  messagingSenderId: "643161739601",
  appId: "1:643161739601:web:8676805e3a2fd82d52c370"
};


// ===== Firebase初期化 =====
const app = initializeApp(firebaseConfig);
const db = getFirestore(app);


// ===== 実証実験ID =====
const SESSION_ID = "seminar-demo-001";


// ===== Firestore監視用 =====
let unsubscribeReports = null;
let unsubscribeVents = null;


// ===== STATE =====
const userId = localStorage.getItem("userId") || Math.random().toString(36).slice(2);
localStorage.setItem("userId", userId);

let currentRoom = "";
let selectedX = null;
let selectedY = null;
let lockUntil = Number(localStorage.getItem("comfortLockUntil") || 0);
let timerInterval = null;

let reports = [];
let replies = [];
let vents = [];


// ===== NAVIGATION =====
window.showScreen = function(id){
  document.querySelectorAll(".screen").forEach(screen => {
    screen.classList.remove("active");
  });

  document.getElementById(id).classList.add("active");
};

window.goTop = function(){
  showScreen("topPage");
};

window.openComfort = function(){
  showScreen("comfortPage");
  startTimerIfNeeded();
};

window.openCafeteria = function(){
  showScreen("cafeteriaPage");
};

window.openSlido = function(){
  window.open("https://app.sli.do/event/sCfvCB8rXFC13ASj1g8BSw", "_blank");
};


// ===== ROLE =====
window.showStudent = function(){
  document.getElementById("studentPage").style.display = "block";
  document.getElementById("teacherPage").style.display = "none";

  document.getElementById("roleStudent").classList.add("active");
  document.getElementById("roleTeacher").classList.remove("active");
};

window.showTeacher = function(){

  // すでにこのタブで教員認証済みなら、パスワード入力を省略する
  const isTeacherUnlocked = sessionStorage.getItem("teacherUnlocked");

  if(isTeacherUnlocked !== "true"){
    const password = prompt("教員用パスワードを入力してください");

    if(password === null){
      return;
    }

    if(password !== "250829"){
      alert("パスワードが違います");
      return;
    }

    // 認証成功をこのタブ内に保存
    sessionStorage.setItem("teacherUnlocked", "true");
  }

  document.getElementById("studentPage").style.display = "none";
  document.getElementById("teacherPage").style.display = "block";

  document.getElementById("roleTeacher").classList.add("active");
  document.getElementById("roleStudent").classList.remove("active");

  syncRoomSelects();
  redrawAll();
};


// ===== ROOM =====
window.changeRoom = function(room){
  currentRoom = room;

  syncRoomSelects();

  createRoom("studentRoomMap");
  createRoom("teacherRoomMap");

  selectedX = null;
  selectedY = null;

  redrawAll();

  if(room){
    showToast(`🏫 ${room}教室を表示中`);
  }
};

function syncRoomSelects(){
  document.getElementById("studentRoom").value = currentRoom;
  document.getElementById("teacherRoom").value = currentRoom;
}

function createRoom(roomId){
  const room = document.getElementById(roomId);

  room.innerHTML = `
    <canvas id="${roomId}Canvas" width="760" height="420"></canvas>
    <div class="board"></div>
    <div class="teacherText">教員</div>
    <div class="window"></div>
    <div class="door"></div>
  `;

  if(!currentRoom){
    return;
  }

  const targetRooms = [
    "3102A",
    "3102B",
    "3103",
    "3104",
    "3201",
    "3202",
    "3203",
    "3204"
  ];

  if(targetRooms.includes(currentRoom)){
    for(let r = 0; r < 6; r++){
      addDeskPercent(room, 28, 4, 65 + r * 58);
      addDeskPercent(room, 28, 36, 65 + r * 58);
      addDeskPercent(room, 28, 68, 65 + r * 58);
    }
  }

  if(roomId === "studentRoomMap"){
    room.onclick = function(e){
      if(!currentRoom){
        showToast("⚠️ 先に教室を選択してください");
        return;
      }

      const rect = room.getBoundingClientRect();

      selectedX = (e.clientX - rect.left) * (760 / rect.width);
      selectedY = (e.clientY - rect.top) * (420 / rect.height);

      drawStudentMarker();
    };
  }
}

function addDeskPercent(room, widthPercent, leftPercent, top){
  const desk = document.createElement("div");

  desk.className = "desk";
  desk.style.width = widthPercent + "%";
  desk.style.left = leftPercent + "%";
  desk.style.top = top + "px";

  room.appendChild(desk);
}

function drawStudentMarker(){
  const room = document.getElementById("studentRoomMap");

  const oldMarker = document.getElementById("seatMarker");

  if(oldMarker){
    oldMarker.remove();
  }

  if(selectedX === null || selectedY === null){
    return;
  }

  const marker = document.createElement("div");

  marker.id = "seatMarker";
  marker.className = "seat-marker";
  marker.style.left = (selectedX / 760 * 100) + "%";
  marker.style.top = (selectedY / 420 * 100) + "%";

  room.appendChild(marker);
}


// ===== OPTION STYLE =====
window.styleOption = function(radio, selectedClass){
  const group = radio.closest(".option-group");

  group.querySelectorAll(".option-label").forEach(label => {
    label.classList.remove(
      "selected-hot",
      "selected-cold",
      "selected-comfort",
      "selected-good",
      "selected-little",
      "selected-bad",
      "selected-warning"
    );
  });

  radio.closest(".option-label").classList.add(selectedClass);
};


// ===== SUBMIT =====
window.submitStudent = async function(){
  const room = currentRoom;
  const subject = document.getElementById("studentSubject").value;

  const comfort = document.querySelector('input[name="comfort"]:checked');
  const understanding = document.querySelector('input[name="understanding"]:checked');

  if(Date.now() < lockUntil){
    showToast("⏳ ロック中です。タイマーが終わるまでお待ちください");
    return;
  }

  if(!room){
    showToast("⚠️ 教室を選択してください");
    return;
  }

  if(!subject){
    showToast("⚠️ 科目を選択してください");
    return;
  }

  if(selectedX === null || selectedY === null){
    showToast("⚠️ 座席位置をタップしてください");
    return;
  }

  if(!comfort){
    showToast("⚠️ 快適度を選択してください");
    return;
  }

  if(!understanding){
    showToast("⚠️ 理解度を選択してください");
    return;
  }

  const already = reports.find(report => {
    return report.room === room &&
           report.subject === subject &&
           report.userId === userId;
  });

  if(already){
    showToast("⚠️ この端末ではこの教室・科目に投票済みです。リセット後に再投票できます");
    return;
  }

  const report = {
    sessionId: SESSION_ID,
    room: room,
    subject: subject,
    x: Math.round(selectedX),
    y: Math.round(selectedY),
    comfort: comfort.value,
    understanding: understanding.value,
    userId: userId,
    createdAt: serverTimestamp()
  };

  try{
    await addDoc(collection(db, "reports"), report);

    lockUntil = Date.now() + 5 * 60 * 1000;
    localStorage.setItem("comfortLockUntil", String(lockUntil));

    startTimer();

    showToast("✅ Firebaseに送信しました");
  }catch(error){
    console.error(error);
    showToast("⚠️ 送信に失敗しました。Firebase設定を確認してください");
  }
};

window.submitVent = async function(){
  const subject = document.getElementById("studentSubject").value;

  if(!currentRoom){
    showToast("⚠️ 教室を選択してください");
    return;
  }

  if(!subject){
    showToast("⚠️ 科目を選択してください");
    return;
  }

  const vent = {
    sessionId: SESSION_ID,
    room: currentRoom,
    subject: subject,
    text: "換気希望",
    userId: userId,
    createdAt: serverTimestamp()
  };

  try{
    await addDoc(collection(db, "vents"), vent);

    showToast("🪟 換気希望をFirebaseに送信しました");
  }catch(error){
    console.error(error);
    showToast("⚠️ 換気希望の送信に失敗しました");
  }
};


// ===== TIMER =====
function startTimerIfNeeded(){
  if(Date.now() < lockUntil){
    startTimer();
  }
}

function startTimer(){
  const banner = document.getElementById("timerBanner");
  const display = document.getElementById("timerDisplay");

  banner.classList.add("visible");

  if(timerInterval){
    clearInterval(timerInterval);
  }

  timerInterval = setInterval(function(){
    const remaining = lockUntil - Date.now();

    if(remaining <= 0){
      clearInterval(timerInterval);

      banner.classList.remove("visible");

      localStorage.removeItem("comfortLockUntil");

      showToast("✅ 再送信できるようになりました");

      return;
    }

    const minutes = Math.floor(remaining / 60000);
    const seconds = Math.floor((remaining % 60000) / 1000);

    display.textContent = `${minutes}:${String(seconds).padStart(2, "0")}`;
  }, 1000);
}


// ===== FIRESTORE REALTIME =====
function startFirestoreListener(){
  if(unsubscribeReports){
    unsubscribeReports();
  }

  if(unsubscribeVents){
    unsubscribeVents();
  }

  const reportsQuery = query(
    collection(db, "reports"),
    where("sessionId", "==", SESSION_ID),
  );

  unsubscribeReports = onSnapshot(reportsQuery, function(snapshot){
    reports = [];

    snapshot.forEach(function(doc){
      const data = doc.data();

      reports.push({
        id: doc.id,
        sessionId: data.sessionId,
        room: data.room,
        subject: data.subject,
        x: data.x,
        y: data.y,
        comfort: data.comfort,
        understanding: data.understanding,
        userId: data.userId,
        createdAt: data.createdAt
      });
    });

    redrawAll();
  }, function(error){
    console.error(error);
    showToast("⚠️ Firestoreの読み込みに失敗しました");
  });

  const ventsQuery = query(
    collection(db, "vents"),
    where("sessionId", "==", SESSION_ID),
  );

  unsubscribeVents = onSnapshot(ventsQuery, function(snapshot){
    vents = [];

    snapshot.forEach(function(doc){
      const data = doc.data();

      vents.push({
        id: doc.id,
        sessionId: data.sessionId,
        room: data.room,
        subject: data.subject,
        text: data.text,
        userId: data.userId,
        createdAt: data.createdAt
      });
    });
  }, function(error){
    console.error(error);
    showToast("⚠️ 換気希望の読み込みに失敗しました");
  });
}


// ===== DRAW =====
function redrawAll(){
  drawHeatmap("teacherRoomMapCanvas");
  drawHeatmap("studentRoomMapCanvas");

  drawCounts("teacherRoomMap");
  drawCounts("studentRoomMap");

  drawStudentMarker();

  updateGraph();
}

function drawHeatmap(canvasId){
  const canvas = document.getElementById(canvasId);

  if(!canvas){
    return;
  }

  const ctx = canvas.getContext("2d");

  ctx.clearRect(0, 0, 760, 420);

  reports.forEach(report => {
    if(report.room !== currentRoom){
      return;
    }

    const grad = ctx.createRadialGradient(
      report.x,
      report.y,
      0,
      report.x,
      report.y,
      100
    );

    if(report.comfort === "hot"){
      grad.addColorStop(0, "rgba(239,68,68,0.58)");
    }

    if(report.comfort === "ok"){
      grad.addColorStop(0, "rgba(34,197,94,0.55)");
    }

    if(report.comfort === "cold"){
      grad.addColorStop(0, "rgba(56,189,248,0.58)");
    }

    if(report.comfort === "sound"){
      grad.addColorStop(0, "rgba(245,158,11,0.58)");
    }

    if(report.comfort === "slide"){
      grad.addColorStop(0, "rgba(168,85,247,0.58)");
    }

    grad.addColorStop(1, "rgba(0,0,0,0)");

    ctx.fillStyle = grad;
    ctx.beginPath();
    ctx.arc(report.x, report.y, 100, 0, Math.PI * 2);
    ctx.fill();
  });
}

function drawCounts(roomId){
  const room = document.getElementById(roomId);

  if(!room){
    return;
  }

  room.querySelectorAll(".countBubble").forEach(element => {
    element.remove();
  });

  const grouped = {};

  reports.forEach(report => {
    if(report.room !== currentRoom){
      return;
    }

    const gx = Math.round(report.x / 60);
    const gy = Math.round(report.y / 60);
    const key = gx + "-" + gy;

    if(!grouped[key]){
      grouped[key] = {
        x: gx * 60,
        y: gy * 60,
        count: 0
      };
    }

    grouped[key].count++;
  });

  Object.values(grouped).forEach(group => {
    const bubble = document.createElement("div");

    bubble.className = "countBubble";
    bubble.textContent = group.count + "人";
    bubble.style.left = (group.x / 760 * 100) + "%";
    bubble.style.top = (group.y / 420 * 100) + "%";

    room.appendChild(bubble);
  });
}

function updateGraph(){
  const roomReports = reports.filter(report => {
    return report.room === currentRoom;
  });

  const good = roomReports.filter(report => {
    return report.understanding === "good";
  }).length;

  const bad = roomReports.filter(report => {
    return report.understanding === "bad";
  }).length;

  const max = Math.max(good, bad, 1);
  const maxHeight = 150;

  document.getElementById("goodBar").style.height = `${Math.max(20, good / max * maxHeight)}px`;
  document.getElementById("badBar").style.height = `${Math.max(20, bad / max * maxHeight)}px`;

  document.getElementById("goodBar").textContent = good;
  document.getElementById("badBar").textContent = bad;

  document.getElementById("goodCount").textContent = good;
  document.getElementById("badCount").textContent = bad;
}

window.resetHeatmap = async function(){
  const result = confirm(
    "この画面上のローカルデータをリセットしますか？\nFirebase上の過去データは削除されません。"
  );

  if(!result){
    return;
  }

  reports = reports.filter(report => {
    return report.room !== currentRoom;
  });

  replies = replies.filter(reply => {
    return reply.room !== currentRoom;
  });

  selectedX = null;
  selectedY = null;
  lockUntil = 0;

  localStorage.removeItem("comfortLockUntil");

  if(timerInterval){
    clearInterval(timerInterval);
  }

  document.getElementById("timerBanner").classList.remove("visible");

  createRoom("studentRoomMap");
  createRoom("teacherRoomMap");

  redrawAll();

  showToast("🔄 リセットしました");
};


// ===== UTIL =====
function showToast(message){
  const toast = document.getElementById("toast");

  toast.textContent = message;
  toast.classList.add("show");

  setTimeout(function(){
    toast.classList.remove("show");
  }, 3200);
}

function kbEsc(text){
  return String(text === undefined || text === null ? "" : text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}


// ===== スプレッドシート記録（Google Apps Script） =====
// ↓ あなたのWebアプリURL（https://script.google.com/macros/s/…/exec）に書き換える
const KB_GAS_URL = "https://script.google.com/macros/s/AKfycbwrZg-HyfQQhBDK1bJhxx8Ej40H5qVWJde5SASTukNsiVmqzdyDwCL1xOllJkD771hRUA/exec";

function kbLogToSheet(payload){
  if(!KB_GAS_URL || KB_GAS_URL.startsWith("ここに")){
    return;
  }

  // GASはCORSの都合で no-cors + text/plain で送る（結果は読めないが記録はされる）
  fetch(KB_GAS_URL, {
    method: "POST",
    mode: "no-cors",
    headers: { "Content-Type": "text/plain;charset=utf-8" },
    body: JSON.stringify(payload)
  }).catch(function(error){
    console.error("スプレッドシート記録エラー", error);
  });
}

// 1マス（15分）ごとに1行ずつ記録する
function kbLogSlots(type, date, port, vehicle, slots, name){
  slots.forEach(function(s){
    kbLogToSheet({
      type: type,
      date: date,
      port: port,
      vehicle: vehicle,
      startMin: s * KB_SLOT_MIN,
      endMin: (s + 1) * KB_SLOT_MIN,
      name: name,
      userId: userId
    });
  });
}


// ===== 電動キックボード予約 =====
// 車両は全ポート共通の3台。同じ車両は、日付・時間が同じなら別ポートでも予約できない
const KB_PORTS = ["正門前", "図書館前", "3号館前"];
const KB_VEHICLES = ["KB-01", "KB-02", "KB-03"];

const KB_SLOT_MIN = 15;                       // 1マスの長さ（分）
const KB_START_SLOT = 9 * 60 / KB_SLOT_MIN;   // 9:00 → 36
const KB_END_SLOT = 18 * 60 / KB_SLOT_MIN;    // 18:00 → 72（この枠は含まない）
const KB_MAX_SLOTS = 4;                       // 1回の予約で選べる最大マス数
const KB_WEEKLY_TOKENS = 10;                  // 1週間のトークン数（予約1回＝1トークン）

// true：他の人の予約の前後1マスも空ける／false：自分の予約の前後だけ空ける
const KB_GAP_APPLIES_TO_OTHERS = true;

let kbReservations = [];
let kbSelected = { vehicle: null, slots: [] };
let kbNeedScroll = false;
let unsubscribeKb = null;

function kbPad(n){
  return String(n).padStart(2, "0");
}

// スロット番号 → "HH:MM"（スロット72 → 18:00）
function kbSlotLabel(slot){
  const m = slot * KB_SLOT_MIN;
  return `${kbPad(Math.floor(m / 60))}:${kbPad(m % 60)}`;
}

function kbToday(){
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

// "2026-10-31" とスロット番号 → Date
function kbSlotToDate(date, slot){
  const p = date.split("-").map(Number);
  return new Date(p[0], p[1] - 1, p[2], 0, slot * KB_SLOT_MIN);
}

function kbIsPast(date, slot){
  return kbSlotToDate(date, slot + 1).getTime() <= Date.now();
}

function kbInit(){
  const portSelect = document.getElementById("kbPort");

  portSelect.innerHTML = KB_PORTS.map(port => {
    return `<option value="${port}">${port}</option>`;
  }).join("");

  const dateInput = document.getElementById("kbDate");
  dateInput.value = kbToday();
  dateInput.min = kbToday();

  const saved = localStorage.getItem("kbName");
  if(saved){
    document.getElementById("kbName").value = saved;
  }

  // 1分ごとに再描画（過ぎた時間帯・トークン復活の反映）
  setInterval(kbRender, 60000);
}

window.openKickboard = function(){
  showScreen("kickboardPage");
  kbNeedScroll = true;
  kbRender();
};

window.kbChangeFilter = function(){
  kbSelected = { vehicle: null, slots: [] };
  kbNeedScroll = true;
  kbRender();
};

// ポートを含めない：車両は全ポート共通なので「日付＋車両＋スロット」で一意
function kbDocId(date, vehicle, slot){
  return `${SESSION_ID}_${date}_${vehicle}_${slot}`;
}


// ----- 間隔（1マス空け）のルール -----
// 同じ車両・同じ日で、前後のマスに予約があるか
function kbNextToReserved(date, vehicle, slot){
  return kbReservations.some(r => {
    if(r.date !== date || r.vehicle !== vehicle){
      return false;
    }

    if(!KB_GAP_APPLIES_TO_OTHERS && r.userId !== userId){
      return false;
    }

    return r.slot === slot - 1 || r.slot === slot + 1;
  });
}

// いま選択中のマスの前後か
function kbNextToSelected(vehicle, slot){
  if(kbSelected.vehicle !== vehicle){
    return false;
  }

  return kbSelected.slots.some(s => Math.abs(s - slot) === 1);
}


// ----- トークン（週10、月曜0:00に復活） -----
function kbWeekStart(){
  const d = new Date();
  const diff = (d.getDay() + 6) % 7;  // 月曜=0
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - diff);
  return d;
}

function kbUsedTokens(){
  const start = kbWeekStart();
  const end = new Date(start);
  end.setDate(end.getDate() + 7);

  const ids = new Set();

  kbReservations.forEach(r => {
    if(r.userId !== userId){
      return;
    }

    // 書き込み直後でサーバー時刻が未確定のときは「今」とみなす
    const t = r.createdAtMs === null ? Date.now() : r.createdAtMs;

    if(t >= start.getTime() && t < end.getTime()){
      ids.add(r.bookingId);
    }
  });

  return ids.size;
}

function kbNextReset(){
  const next = kbWeekStart();
  next.setDate(next.getDate() + 7);

  return `${next.getMonth() + 1}/${next.getDate()}（月）0:00`;
}

function kbRenderTokens(){
  const box = document.getElementById("kbTokens");

  if(!box){
    return;
  }

  const left = Math.max(0, KB_WEEKLY_TOKENS - kbUsedTokens());

  box.classList.toggle("empty", left === 0);

  box.innerHTML = `
    🎫 今週のトークン <strong>${left}</strong> / ${KB_WEEKLY_TOKENS}
    <div class="small">予約1回につき1トークン消費。次回復活：${kbNextReset()}</div>
  `;
}


// ----- 予約のまとまり（1回の予約＝複数マス・飛び飛び） -----
function kbMyBookings(){
  const map = {};

  kbReservations.forEach(r => {
    if(r.userId !== userId){
      return;
    }

    if(!map[r.bookingId]){
      map[r.bookingId] = {
        id: r.bookingId,
        date: r.date,
        port: r.port,
        vehicle: r.vehicle,
        name: r.name,
        slots: [],
        docIds: [],
        completed: false
      };
    }

    map[r.bookingId].slots.push(r.slot);
    map[r.bookingId].docIds.push(r.id);

    if(r.completed){
      map[r.bookingId].completed = true;
    }
  });

  return Object.values(map).map(b => {
    b.slots.sort((x, y) => x - y);
    b.start = b.slots[0];                      // 最初のマスの開始
    b.end = b.slots[b.slots.length - 1] + 1;   // 最後のマスの終了
    return b;
  });
}

function kbTimesText(slots){
  return slots.map(s => `${kbSlotLabel(s)}〜${kbSlotLabel(s + 1)}`).join(" / ");
}


// ----- 描画 -----
function kbRender(){
  const port = document.getElementById("kbPort").value;
  const date = document.getElementById("kbDate").value;
  const grid = document.getElementById("kbGrid");

  kbRenderTokens();

  if(!port || !date){
    grid.innerHTML = "";
    return;
  }

  // 再描画してもスワイプ位置が戻らないよう、位置を覚えておく
  const prevScroll = grid.scrollLeft;

  // ポートに関係なく、その日の予約を「車両＋スロット」で引く
  const reserved = {};

  kbReservations.forEach(r => {
    if(r.date === date){
      reserved[r.vehicle + "|" + r.slot] = r;
    }
  });

  let html = `<table class="kb-table"><thead><tr><th class="kb-veh"></th>`;

  for(let s = KB_START_SLOT; s < KB_END_SLOT; s += 4){
    html += `<th class="kb-hour" colspan="4">${kbSlotLabel(s)}</th>`;
  }

  html += `</tr></thead><tbody>`;

  KB_VEHICLES.forEach(vehicle => {
    html += `<tr><th class="kb-veh">🛴 ${vehicle}</th>`;

    for(let s = KB_START_SLOT; s < KB_END_SLOT; s++){
      const r = reserved[vehicle + "|" + s];
      const isSelected = kbSelected.vehicle === vehicle && kbSelected.slots.includes(s);

      let cls = "free";
      let text = kbSlotLabel(s);

      if(r){
        if(r.userId === userId){
          cls = "mine";
          text = "予約中";
        }else{
          cls = "taken";
          text = "×";
        }
      }else if(kbIsPast(date, s)){
        cls = "past";
        text = "－";
      }else if(isSelected){
        cls = "selected";
        text = "選択";
      }else if(kbNextToReserved(date, vehicle, s) || kbNextToSelected(vehicle, s)){
        cls = "buffer";
        text = "間隔";
      }

      const hb = (s % 4 === 0) ? ` class="hb"` : "";

      html += `<td${hb} data-slot="${s}"><button class="kb-cell ${cls}" title="${kbSlotLabel(s)}〜${kbSlotLabel(s + 1)}" onclick="kbCellClick('${vehicle}', ${s})">${text}</button></td>`;
    }

    html += `</tr>`;
  });

  html += `</tbody></table>`;

  grid.innerHTML = html;

  if(kbNeedScroll){
    kbNeedScroll = false;
    kbScrollToNow(grid, date);
  }else{
    grid.scrollLeft = prevScroll;
  }

  kbRenderSummary();
  kbRenderMyList();
}

// 今日なら現在の時刻の位置へ、それ以外は9:00の位置へ
function kbScrollToNow(grid, date){
  let slot = KB_START_SLOT;

  if(date === kbToday()){
    const now = new Date();
    slot = Math.floor((now.getHours() * 60 + now.getMinutes()) / 60) * 60 / KB_SLOT_MIN;
  }

  slot = Math.min(Math.max(slot, KB_START_SLOT), KB_END_SLOT - 1);

  const td = grid.querySelector(`td[data-slot="${slot}"]`);
  const head = grid.querySelector("th.kb-veh");

  if(!td){
    grid.scrollLeft = 0;
    return;
  }

  grid.scrollLeft = Math.max(0, td.offsetLeft - (head ? head.offsetWidth : 0) - 6);
}

window.kbCellClick = function(vehicle, slot){
  const date = document.getElementById("kbDate").value;

  // ポートに関係なく、同じ日付・車両・スロットの予約を探す
  const existing = kbReservations.find(r => {
    return r.date === date && r.vehicle === vehicle && r.slot === slot;
  });

  if(existing){
    if(existing.userId === userId){
      kbCancelBooking(existing.bookingId);
    }else{
      showToast("⚠️ この枠は予約済みです");
    }
    return;
  }

  if(kbIsPast(date, slot)){
    showToast("⚠️ 過ぎた時間帯は予約できません");
    return;
  }

  // 別の車両を押したら、選択をその車両からやり直す
  const base = kbSelected.vehicle === vehicle ? kbSelected.slots : [];

  // 選択済みのマスをもう一度押したら解除
  if(base.includes(slot)){
    const rest = base.filter(s => s !== slot);

    kbSelected = rest.length === 0
      ? { vehicle: null, slots: [] }
      : { vehicle: vehicle, slots: rest };

    kbRender();
    return;
  }

  if(kbNextToReserved(date, vehicle, slot)){
    showToast("⚠️ 予約済みの枠の前後は、1マス空ける必要があります");
    return;
  }

  if(base.some(s => Math.abs(s - slot) === 1)){
    showToast("⚠️ 連続した2マス以上は予約できません。1マス空けて選んでください");
    return;
  }

  if(base.length >= KB_MAX_SLOTS){
    showToast(`⚠️ 1回の予約は最大${KB_MAX_SLOTS}マスまでです`);
    return;
  }

  kbSelected = {
    vehicle: vehicle,
    slots: base.concat([slot]).sort((a, b) => a - b)
  };

  kbRender();
};

function kbRenderSummary(){
  const box = document.getElementById("kbSummary");
  const port = document.getElementById("kbPort").value;
  const date = document.getElementById("kbDate").value;

  if(!kbSelected.vehicle || kbSelected.slots.length === 0){
    box.textContent = "枠を選択してください";
    return;
  }

  const minutes = kbSelected.slots.length * KB_SLOT_MIN;

  box.innerHTML = `
    📍 ${kbEsc(port)}<br>
    🗓️ ${kbEsc(date)}<br>
    🛴 ${kbEsc(kbSelected.vehicle)}<br>
    ⏰ ${kbTimesText(kbSelected.slots)}（計${minutes}分）<br>
    🎫 トークン1つ消費
  `;
}

function kbRenderMyList(){
  const list = document.getElementById("kbMyList");
  const now = Date.now();

  const mine = kbMyBookings()
    .filter(b => kbSlotToDate(b.date, b.end).getTime() > now - 24 * 3600 * 1000)
    .sort((a, b) => kbSlotToDate(a.date, a.start) - kbSlotToDate(b.date, b.start));

  if(mine.length === 0){
    list.innerHTML = `<div class="comment-empty">予約はありません</div>`;
    return;
  }

  list.innerHTML = mine.map(b => {
    const started = kbSlotToDate(b.date, b.start).getTime() <= now;
    const ended = kbSlotToDate(b.date, b.end).getTime() <= now;

    let badge = "";

    if(b.completed){
      badge = `<span class="kb-badge done">✅ 完了済み</span>`;
    }else if(ended){
      badge = `<span class="kb-badge warn">⚠️ 未完了</span>`;
    }else if(started){
      badge = `<span class="kb-badge using">利用中</span>`;
    }

    let actions = "";

    if(!b.completed && started){
      actions += `<button class="kb-complete-btn" onclick="kbCompleteBooking('${b.id}')">完了</button>`;
    }

    if(!b.completed && !ended){
      actions += `<button class="kb-cancel-btn" onclick="kbCancelBooking('${b.id}')">取り消す</button>`;
    }

    return `
      <div class="comment-item">
        <strong>${kbEsc(b.date)}</strong>${badge}<br>
        ${kbTimesText(b.slots)}<br>
        ${kbEsc(b.port)} ／ 🛴 ${kbEsc(b.vehicle)}
        <div class="comment-meta">${kbEsc(b.name)}</div>
        <div class="kb-item-actions">${actions}</div>
      </div>
    `;
  }).join("");
}


// ----- 予約 -----
window.kbReserve = async function(){
  const port = document.getElementById("kbPort").value;
  const date = document.getElementById("kbDate").value;
  const name = document.getElementById("kbName").value.trim();

  if(!kbSelected.vehicle || kbSelected.slots.length === 0){
    showToast("⚠️ 予約する枠を選択してください");
    return;
  }

  if(!name){
    showToast("⚠️ お名前を入力してください");
    return;
  }

  const used = kbUsedTokens();

  if(used >= KB_WEEKLY_TOKENS){
    showToast(`⚠️ 今週のトークンを使い切りました。${kbNextReset()}に復活します`);
    return;
  }

  localStorage.setItem("kbName", name);

  const vehicle = kbSelected.vehicle;
  const slots = kbSelected.slots.slice();
  const bookingId = "b" + Date.now() + Math.random().toString(36).slice(2, 7);

  // 念のため、送信直前にも「連続」になっていないか確認
  for(let i = 1; i < slots.length; i++){
    if(slots[i] - slots[i - 1] < 2){
      showToast("⚠️ 連続した2マス以上は予約できません");
      return;
    }
  }

  try{
    // 二重予約防止：取得→存在チェック→書き込みを1つのトランザクションで行う
    await runTransaction(db, async function(tx){
      // 読むのは「選んだマス」と「その前後のマス」
      const around = [];

      slots.forEach(s => {
        [s - 1, s, s + 1].forEach(x => {
          if(!around.includes(x)){
            around.push(x);
          }
        });
      });

      const snaps = {};

      for(const s of around){
        snaps[s] = await tx.get(doc(db, "kickboardReservations", kbDocId(date, vehicle, s)));
      }

      // 選んだマスがすでに予約されていないか
      if(slots.some(s => snaps[s].exists())){
        throw new Error("already-reserved");
      }

      // 前後のマスに予約がないか（1マス空けのルール）
      const neighbors = around.filter(x => !slots.includes(x));

      if(neighbors.some(x => snaps[x].exists())){
        const hit = neighbors.filter(x => snaps[x].exists());
        const mineOnly = hit.every(x => snaps[x].data().userId === userId);

        if(KB_GAP_APPLIES_TO_OTHERS || mineOnly){
          throw new Error("gap-violation");
        }
      }

      slots.forEach(s => {
        tx.set(doc(db, "kickboardReservations", kbDocId(date, vehicle, s)), {
          sessionId: SESSION_ID,
          bookingId: bookingId,
          port: port,
          date: date,
          vehicle: vehicle,
          slot: s,
          name: name,
          userId: userId,
          completed: false,
          createdAt: serverTimestamp()
        });
      });
    });

    // 予約成功後にスプレッドシートへ記録（1マス＝1行）
    kbLogSlots("kickboard", date, port, vehicle, slots, name);

    kbSelected = { vehicle: null, slots: [] };
    showToast(`✅ 予約しました（今週の残りトークン ${KB_WEEKLY_TOKENS - used - 1}）`);
  }catch(error){
    console.error(error);

    if(error.message === "already-reserved"){
      showToast("⚠️ 直前に他の人が予約しました。別の枠を選んでください");
    }else if(error.message === "gap-violation"){
      showToast("⚠️ 予約済みの枠の前後は1マス空ける必要があります。別の枠を選んでください");
    }else{
      showToast("⚠️ 予約に失敗しました。Firebase設定を確認してください");
    }
  }
};


// ----- 取り消し -----
window.kbCancelBooking = async function(bookingId){
  const b = kbMyBookings().find(x => x.id === bookingId);

  if(!b){
    return;
  }

  if(b.completed){
    showToast("⚠️ 完了済みの予約は取り消せません");
    return;
  }

  if(kbSlotToDate(b.date, b.end).getTime() <= Date.now()){
    showToast("⚠️ 終了した予約は取り消せません");
    return;
  }

  if(!confirm(`${b.date}\n${kbTimesText(b.slots)}\n${b.port} ${b.vehicle} の予約を取り消しますか？\n（今週消費したトークンは戻ります）`)){
    return;
  }

  try{
    await Promise.all(b.docIds.map(id => {
      return deleteDoc(doc(db, "kickboardReservations", id));
    }));

    kbLogSlots("kickboard_cancel", b.date, b.port, b.vehicle, b.slots, b.name);

    showToast("🗑️ 予約を取り消しました");
  }catch(error){
    console.error(error);
    showToast("⚠️ 取り消しに失敗しました");
  }
};


// ----- 完了（利用終了の記録） -----
window.kbCompleteBooking = async function(bookingId){
  const b = kbMyBookings().find(x => x.id === bookingId);

  if(!b || b.completed){
    return;
  }

  if(!confirm(`${b.date}\n${kbTimesText(b.slots)}\n${b.port} ${b.vehicle} の利用を完了しますか？`)){
    return;
  }

  try{
    await Promise.all(b.docIds.map(id => {
      return updateDoc(doc(db, "kickboardReservations", id), {
        completed: true,
        completedAt: serverTimestamp()
      });
    }));

    kbLogSlots("kickboard_done", b.date, b.port, b.vehicle, b.slots, b.name);

    showToast("✅ 利用完了を記録しました");
  }catch(error){
    console.error(error);
    showToast("⚠️ 完了の記録に失敗しました");
  }
};

// 予約ボタンの下の「完了」：利用開始時刻を過ぎた未完了の予約のうち、いちばん新しいものを完了にする
window.kbComplete = function(){
  const now = Date.now();

  const candidates = kbMyBookings()
    .filter(b => {
      return !b.completed &&
             kbSlotToDate(b.date, b.start).getTime() <= now &&
             kbSlotToDate(b.date, b.end).getTime() > now - 24 * 3600 * 1000;
    })
    .sort((a, b) => kbSlotToDate(b.date, b.start) - kbSlotToDate(a.date, a.start));

  if(candidates.length === 0){
    showToast("⚠️ 完了できる予約がありません（利用開始時刻を過ぎた予約が対象です）");
    return;
  }

  kbCompleteBooking(candidates[0].id);
};


// ----- Firestore監視 -----
function startKickboardListener(){
  if(unsubscribeKb){
    unsubscribeKb();
  }

  const kbQuery = query(
    collection(db, "kickboardReservations"),
    where("sessionId", "==", SESSION_ID)
  );

  unsubscribeKb = onSnapshot(kbQuery, function(snapshot){
    kbReservations = [];

    snapshot.forEach(function(d){
      const data = d.data();

      // 旧形式（1時間単位）のデータは読み飛ばす
      if(data.slot === undefined){
        return;
      }

      kbReservations.push({
        id: d.id,
        bookingId: data.bookingId || d.id,
        port: data.port,
        date: data.date,
        vehicle: data.vehicle,
        slot: data.slot,
        name: data.name,
        userId: data.userId,
        completed: !!data.completed,
        createdAtMs: (data.createdAt && data.createdAt.toMillis) ? data.createdAt.toMillis() : null
      });
    });

    kbRender();
  }, function(error){
    console.error(error);
    showToast("⚠️ キックボード予約の読み込みに失敗しました");
  });
}


// ===== 初期化 =====
createRoom("studentRoomMap");
createRoom("teacherRoomMap");
startTimerIfNeeded();
startFirestoreListener();
kbInit();
startKickboardListener();

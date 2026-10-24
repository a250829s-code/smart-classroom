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


// ===== スプレッドシート記録（Google Apps Script） =====
// ↓ ここをあなたのWebアプリURL（https://script.google.com/macros/s/…/exec）に書き換える
const KB_GAS_URL = "https://script.google.com/macros/s/AKfycbwrZg-HyfQQhBDK1bJhxx8Ej40H5qVWJde5SASTukNsiVmqzdyDWCL1xO|I…";

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


// ===== 電動キックボード予約 =====
const KB_PORTS = {
  "正門前":   ["KB-01", "KB-02", "KB-03"],
  "図書館前": ["KB-04", "KB-05", "KB-06"],
  "3号館前":  ["KB-07", "KB-08"]
};

const KB_START_HOUR = 9;   // 9:00〜
const KB_END_HOUR = 18;    // 〜18:00
const KB_MAX_SLOTS = 4;    // 1回の予約で取れる最大枠数

let kbReservations = [];
let kbSelected = { vehicle: null, slots: [] };
let unsubscribeKb = null;

function kbSlotLabel(hour){
  const h = String(hour).padStart(2, "0");
  return `${h}:00`;
}

function kbToday(){
  const d = new Date();
  d.setMinutes(d.getMinutes() - d.getTimezoneOffset());
  return d.toISOString().slice(0, 10);
}

function kbInit(){
  const portSelect = document.getElementById("kbPort");

  portSelect.innerHTML = Object.keys(KB_PORTS).map(port => {
    return `<option value="${port}">${port}</option>`;
  }).join("");

  const dateInput = document.getElementById("kbDate");
  dateInput.value = kbToday();
  dateInput.min = kbToday();

  const saved = localStorage.getItem("kbName");
  if(saved){
    document.getElementById("kbName").value = saved;
  }
}

window.openKickboard = function(){
  showScreen("kickboardPage");
  kbRender();
};

window.kbChangeFilter = function(){
  kbSelected = { vehicle: null, slots: [] };
  kbRender();
};

function kbDocId(date, vehicle, hour){
  return `${SESSION_ID}_${date}_${vehicle}_${hour}`;
}

function kbIsPast(date, hour){
  const today = kbToday();

  if(date < today){
    return true;
  }

  if(date === today){
    return hour + 1 <= new Date().getHours();
  }

  return false;
}

function kbRender(){
  const port = document.getElementById("kbPort").value;
  const date = document.getElementById("kbDate").value;
  const grid = document.getElementById("kbGrid");

  if(!port || !date){
    grid.innerHTML = "";
    return;
  }

  const vehicles = KB_PORTS[port];
  const hours = [];

  for(let h = KB_START_HOUR; h < KB_END_HOUR; h++){
    hours.push(h);
  }

  const reserved = {};

  kbReservations.forEach(r => {
    if(r.port === port && r.date === date){
      reserved[r.vehicle + "|" + r.hour] = r;
    }
  });

  let html = `<table class="kb-table"><thead><tr><th></th>`;

  hours.forEach(h => {
    html += `<th>${kbSlotLabel(h)}</th>`;
  });

  html += `</tr></thead><tbody>`;

  vehicles.forEach(vehicle => {
    html += `<tr><th>🛴 ${vehicle}</th>`;

    hours.forEach(h => {
      const r = reserved[vehicle + "|" + h];
      const isSelected = kbSelected.vehicle === vehicle && kbSelected.slots.includes(h);

      let cls = "free";
      let text = "空き";

      if(r){
        if(r.userId === userId){
          cls = "mine";
          text = "予約中";
        }else{
          cls = "taken";
          text = "×";
        }
      }else if(kbIsPast(date, h)){
        cls = "past";
        text = "－";
      }else if(isSelected){
        cls = "selected";
        text = "選択";
      }

      html += `<td><button class="kb-cell ${cls}" onclick="kbCellClick('${vehicle}', ${h})">${text}</button></td>`;
    });

    html += `</tr>`;
  });

  html += `</tbody></table>`;

  grid.innerHTML = html;

  kbRenderSummary();
  kbRenderMyList();
}

window.kbCellClick = function(vehicle, hour){
  const port = document.getElementById("kbPort").value;
  const date = document.getElementById("kbDate").value;

  const existing = kbReservations.find(r => {
    return r.port === port && r.date === date && r.vehicle === vehicle && r.hour === hour;
  });

  if(existing){
    if(existing.userId === userId){
      kbCancel(existing.id);
    }else{
      showToast("⚠️ この枠は予約済みです");
    }
    return;
  }

  if(kbIsPast(date, hour)){
    showToast("⚠️ 過ぎた時間帯は予約できません");
    return;
  }

  // 別の車両を押したら選択をリセット
  if(kbSelected.vehicle !== vehicle){
    kbSelected = { vehicle: vehicle, slots: [] };
  }

  const idx = kbSelected.slots.indexOf(hour);

  if(idx >= 0){
    kbSelected.slots.splice(idx, 1);
  }else{
    if(kbSelected.slots.length >= KB_MAX_SLOTS){
      showToast(`⚠️ 1回の予約は最大${KB_MAX_SLOTS}枠までです`);
      return;
    }
    kbSelected.slots.push(hour);
  }

  kbSelected.slots.sort((a, b) => a - b);

  if(kbSelected.slots.length === 0){
    kbSelected.vehicle = null;
  }

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

  const times = kbSelected.slots.map(h => `${kbSlotLabel(h)}〜${kbSlotLabel(h + 1)}`).join(" / ");

  box.innerHTML = `
    📍 ${port}<br>
    🗓️ ${date}<br>
    🛴 ${kbSelected.vehicle}<br>
    ⏰ ${times}
  `;
}

function kbRenderMyList(){
  const list = document.getElementById("kbMyList");

  const mine = kbReservations
    .filter(r => r.userId === userId && !kbIsPast(r.date, r.hour))
    .sort((a, b) => (a.date + String(a.hour).padStart(2, "0")).localeCompare(b.date + String(b.hour).padStart(2, "0")));

  if(mine.length === 0){
    list.innerHTML = `<div class="comment-empty">予約はありません</div>`;
    return;
  }

  list.innerHTML = mine.map(r => `
    <div class="comment-item">
      <strong>${r.date}　${kbSlotLabel(r.hour)}〜${kbSlotLabel(r.hour + 1)}</strong><br>
      ${r.port} ／ 🛴 ${r.vehicle}
      <div class="comment-meta">${r.name}</div>
      <button class="kb-cancel-btn" onclick="kbCancel('${r.id}')">取り消す</button>
    </div>
  `).join("");
}

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

  localStorage.setItem("kbName", name);

  const vehicle = kbSelected.vehicle;
  const slots = [...kbSelected.slots];

  try{
    // 二重予約防止：取得→存在チェック→書き込みを1つのトランザクションで行う
    await runTransaction(db, async function(tx){
      const refs = slots.map(h => doc(db, "kickboardReservations", kbDocId(date, vehicle, h)));
      const snaps = [];

      for(const ref of refs){
        snaps.push(await tx.get(ref));
      }

      if(snaps.some(s => s.exists())){
        throw new Error("already-reserved");
      }

      refs.forEach((ref, i) => {
        tx.set(ref, {
          sessionId: SESSION_ID,
          port: port,
          date: date,
          vehicle: vehicle,
          hour: slots[i],
          name: name,
          userId: userId,
          createdAt: serverTimestamp()
        });
      });
    });

    // 予約成功後にスプレッドシートへ記録
    kbLogToSheet({
      type: "kickboard",
      date: date,
      port: port,
      vehicle: vehicle,
      slots: slots,
      name: name,
      userId: userId
    });

    kbSelected = { vehicle: null, slots: [] };
    showToast("✅ 予約しました");
  }catch(error){
    console.error(error);

    if(error.message === "already-reserved"){
      showToast("⚠️ 直前に他の人が予約しました。別の枠を選んでください");
    }else{
      showToast("⚠️ 予約に失敗しました。Firebase設定を確認してください");
    }
  }
};

window.kbCancel = async function(id){
  const target = kbReservations.find(r => r.id === id);

  if(!target || target.userId !== userId){
    return;
  }

  if(!confirm(`${target.date} ${kbSlotLabel(target.hour)}〜 ${target.vehicle} の予約を取り消しますか？`)){
    return;
  }

  try{
    await deleteDoc(doc(db, "kickboardReservations", id));

    // 取消もスプレッドシートに記録
    kbLogToSheet({
      type: "kickboard_cancel",
      date: target.date,
      port: target.port,
      vehicle: target.vehicle,
      slots: [target.hour],
      name: target.name,
      userId: target.userId
    });

    showToast("🗑️ 予約を取り消しました");
  }catch(error){
    console.error(error);
    showToast("⚠️ 取り消しに失敗しました");
  }
};

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

      kbReservations.push({
        id: d.id,
        port: data.port,
        date: data.date,
        vehicle: data.vehicle,
        hour: data.hour,
        name: data.name,
        userId: data.userId
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

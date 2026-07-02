/* =========================================================
  Googleスプレッドシート保存用

  1. Google Apps Scriptを作る
  2. デプロイしてWebアプリURLを取得
  3. 下の GOOGLE_SCRIPT_URL に貼り付ける
========================================================= */

const USE_GOOGLE_SHEETS = true;

const GOOGLE_SCRIPT_URL = "https://script.google.com/macros/s/AKfycbwrZg-HyfQQhBDK1bJhxx8Ej40H5qVWJde5SASTukNsiVmqzdyDwCL1xOllJkD771hRUA/exec";

async function saveToGoogleSheet(data){
  if(!USE_GOOGLE_SHEETS) return;

  if(GOOGLE_SCRIPT_URL.includes("ここに")){
    console.warn("Google Apps ScriptのURLが未設定です");
    return;
  }

  try{
    await fetch(GOOGLE_SCRIPT_URL, {
      method: "POST",
      mode: "no-cors",
      headers: {
        "Content-Type": "text/plain;charset=utf-8"
      },
      body: JSON.stringify(data)
    });
  }catch(error){
    console.error(error);
    showToast("⚠️ スプレッドシート保存に失敗しました");
  }
}

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
  const password = prompt("教員用パスワードを入力してください");

  if(password === null){
    return;
  }

  if(password !== "250829"){
    alert("パスワードが違います");
    return;
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
    // 全教室共通：横3列・縦6段
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

  // 1端末1回制限
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
    id: makeId(),
    room: room,
    subject: subject,
    x: selectedX,
    y: selectedY,
    comfort: comfort.value,
    understanding: understanding.value,
    userId: userId,
    createdAt: Date.now()
  };

  // 画面表示用にブラウザ内にも保存
  reports.push(report);
  redrawAll();

  // Googleスプレッドシートへ保存
  await saveToGoogleSheet({
    type: "comfort_report",
    createdAt: new Date(report.createdAt).toLocaleString("ja-JP"),
    subject: report.subject,
    room: report.room,
    x: Math.round(report.x),
    y: Math.round(report.y),
    comfort: comfortText(report.comfort),
    understanding: understandingText(report.understanding),
    userId: report.userId
  });

  lockUntil = Date.now() + 5 * 60 * 1000;

  localStorage.setItem("comfortLockUntil", String(lockUntil));

  startTimer();

  showToast("✅ 送信しました");
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
    id: makeId(),
    room: currentRoom,
    subject: subject,
    text: "🪟 換気希望",
    userId: userId,
    createdAt: Date.now()
  };

  vents.push(vent);

  await saveToGoogleSheet({
    type: "vent",
    createdAt: new Date(vent.createdAt).toLocaleString("ja-JP"),
    subject: vent.subject,
    room: vent.room,
    x: "",
    y: "",
    comfort: "換気希望",
    understanding: "",
    userId: userId
  });

  showToast("🪟 換気希望を送信しました");
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
    "この画面上のローカルデータをリセットしますか？\nスプレッドシート上の過去データは削除されません。"
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

function makeId(){
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
}

function comfortText(value){
  if(value === "hot") return "暑い";
  if(value === "ok") return "快適";
  if(value === "cold") return "寒い";
  if(value === "sound") return "音が聞こえにくい";
  if(value === "slide") return "スライドが見えにくい";

  return value;
}

function understandingText(value){
  if(value === "good") return "分かった";
  if(value === "little") return "少し分かった";
  if(value === "bad") return "分からない";

  return value;
}

// ===== 初期化 =====
createRoom("studentRoomMap");
createRoom("teacherRoomMap");
startTimerIfNeeded();

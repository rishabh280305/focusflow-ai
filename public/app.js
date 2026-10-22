const $ = (selector) => document.querySelector(selector);
const video = $("#video");
const canvas = $("#overlay");
const ctx = canvas.getContext("2d");
const HISTORY_KEY = "focusflow.sessions.v1";

let stream;
let landmarker;
let animationId;
let sessionStartedAt;
let lastApiCall = 0;
let demoInterval;
let timerInterval;
let latest = { presence: 0, gazeStability: 0, eyeOpenness: 0, posture: 0, score: 0 };

const clamp = (n) => Math.max(0, Math.min(100, Math.round(n)));
const setStatus = (text, live = false) => {
  $("#cameraStatus").textContent = text;
  $("#cameraStatus").classList.toggle("live", live);
};

function updateMetrics(data) {
  latest = { ...latest, ...data };
  $("#presence").textContent = `${clamp(latest.presence)}%`;
  $("#gaze").textContent = `${clamp(latest.gazeStability)}%`;
  $("#eyes").textContent = `${clamp(latest.eyeOpenness)}%`;
  $("#posture").textContent = `${clamp(latest.posture)}%`;
  if (Number.isFinite(latest.score)) {
    $("#score").textContent = clamp(latest.score);
    $("#scoreBar").style.width = `${clamp(latest.score)}%`;
  }
}

async function askCoach() {
  const elapsedSeconds = sessionStartedAt ? Math.floor((Date.now() - sessionStartedAt) / 1000) : 0;
  try {
    const response = await fetch("/api/analyze", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ ...latest, elapsedSeconds })
    });
    const result = await response.json();
    updateMetrics({ score: result.score });
    $("#coachText").textContent = result.recommendation;
  } catch {
    $("#coachText").textContent = "The coach API is reconnecting. Local signals continue to run.";
  }
}

function startTimer() {
  sessionStartedAt = Date.now();
  clearInterval(timerInterval);
  timerInterval = setInterval(() => {
    const elapsed = Math.floor((Date.now() - sessionStartedAt) / 1000);
    const remaining = Math.max(0, 1500 - elapsed);
    $("#timer").textContent = `${String(Math.floor(remaining / 60)).padStart(2, "0")}:${String(remaining % 60).padStart(2, "0")}`;
  }, 1000);
  $("#endSession").disabled = false;
}

async function loadLandmarker() {
  $("#modelStatus").textContent = "Loading local model...";
  const vision = await import("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/+esm");
  const fileset = await vision.FilesetResolver.forVisionTasks("https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.22/wasm");
  landmarker = await vision.FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: "https://storage.googleapis.com/mediapipe-models/face_landmarker/face_landmarker/float16/1/face_landmarker.task", delegate: "GPU" },
    runningMode: "VIDEO",
    numFaces: 1,
    outputFaceBlendshapes: true,
    outputFacialTransformationMatrixes: true
  });
  $("#modelStatus").textContent = "MediaPipe ready";
}

function drawLandmarks(points) {
  canvas.width = video.videoWidth;
  canvas.height = video.videoHeight;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  ctx.fillStyle = "#ffd51f";
  for (let i = 0; i < points.length; i += 8) {
    ctx.beginPath();
    ctx.arc(points[i].x * canvas.width, points[i].y * canvas.height, 2.2, 0, Math.PI * 2);
    ctx.fill();
  }
}

async function detect(now) {
  if (!landmarker || video.readyState < 2) {
    animationId = requestAnimationFrame(detect);
    return;
  }
  const result = landmarker.detectForVideo(video, now);
  if (result.faceLandmarks?.length) {
    const points = result.faceLandmarks[0];
    drawLandmarks(points);
    const blend = Object.fromEntries((result.faceBlendshapes?.[0]?.categories || []).map(x => [x.categoryName, x.score]));
    const blink = ((blend.eyeBlinkLeft || 0) + (blend.eyeBlinkRight || 0)) / 2;
    const look = Math.max(blend.eyeLookOutLeft || 0, blend.eyeLookOutRight || 0, blend.eyeLookUpLeft || 0, blend.eyeLookDownLeft || 0);
    const nose = points[1];
    const posture = 100 - Math.min(100, Math.abs(nose.x - .5) * 170 + Math.abs(nose.y - .46) * 110);
    updateMetrics({ presence: 100, gazeStability: 100 - look * 95, eyeOpenness: 100 - blink * 100, posture });
  } else {
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    updateMetrics({ presence: 0, gazeStability: 0, eyeOpenness: 0, posture: 0 });
  }
  if (now - lastApiCall > 3000) { lastApiCall = now; askCoach(); }
  animationId = requestAnimationFrame(detect);
}

async function startCamera() {
  try {
    stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } }, audio: false });
    video.srcObject = stream;
    $("#cameraPlaceholder").hidden = true;
    setStatus("CAMERA LIVE", true);
    $("#startCamera").disabled = true;
    $("#demoMode").disabled = true;
    $("#stopCamera").disabled = false;
    startTimer();
    try { await loadLandmarker(); animationId = requestAnimationFrame(detect); }
    catch (error) { $("#modelStatus").textContent = "Camera ready, model unavailable"; $("#coachText").textContent = "Camera is active, but the landmark model could not load. Try demo mode."; console.error(error); }
  } catch {
    $("#coachText").textContent = "Camera permission was not granted. Demo mode remains available.";
  }
}

function startDemo() {
  setStatus("DEMO MODE", true);
  $("#cameraPlaceholder").innerHTML = "<b>Demo mode</b><span>Transparent synthetic numeric signals. No camera used.</span>";
  $("#startCamera").disabled = true;
  $("#demoMode").disabled = true;
  $("#stopCamera").disabled = false;
  startTimer();
  let t = 0;
  demoInterval = setInterval(() => {
    t += .35;
    updateMetrics({ presence: 98, gazeStability: 78 + Math.sin(t) * 14, eyeOpenness: 82 + Math.cos(t * .7) * 10, posture: 74 + Math.sin(t * .45) * 12 });
    askCoach();
  }, 3000);
  $("#modelStatus").textContent = "Synthetic signals";
}

function stopSession() {
  stream?.getTracks().forEach(track => track.stop());
  cancelAnimationFrame(animationId);
  clearInterval(demoInterval);
  clearInterval(timerInterval);
  video.srcObject = null;
  ctx.clearRect(0, 0, canvas.width, canvas.height);
  $("#cameraPlaceholder").hidden = false;
  $("#cameraPlaceholder").innerHTML = "<b>Your video stays here.</b><span>No frames are sent to the API.</span>";
  $("#startCamera").disabled = false;
  $("#demoMode").disabled = false;
  $("#stopCamera").disabled = true;
  setStatus("CAMERA OFF", false);
  $("#modelStatus").textContent = "Model idle";
}

function readHistory() { return JSON.parse(localStorage.getItem(HISTORY_KEY) || "[]"); }
function renderHistory() {
  const sessions = readHistory();
  const root = $("#history");
  if (!sessions.length) { root.innerHTML = '<p class="empty">No saved sessions yet.</p>'; return; }
  root.innerHTML = sessions.slice(-8).reverse().map(item => `<article class="history-item"><span>${new Date(item.date).toLocaleDateString()}</span><br><b>${item.score}</b> focus<div class="history-bar"><span style="width:${item.score}%"></span></div><p>${Math.max(1, Math.round(item.seconds / 60))} min session</p></article>`).join("");
}

$("#startCamera").addEventListener("click", startCamera);
$("#demoMode").addEventListener("click", startDemo);
$("#stopCamera").addEventListener("click", stopSession);
$("#endSession").addEventListener("click", () => {
  const sessions = readHistory();
  sessions.push({ date: new Date().toISOString(), score: clamp(latest.score), seconds: sessionStartedAt ? (Date.now() - sessionStartedAt) / 1000 : 0 });
  localStorage.setItem(HISTORY_KEY, JSON.stringify(sessions));
  renderHistory();
  stopSession();
  $("#endSession").disabled = true;
});
$("#clearHistory").addEventListener("click", () => { localStorage.removeItem(HISTORY_KEY); renderHistory(); });
renderHistory();

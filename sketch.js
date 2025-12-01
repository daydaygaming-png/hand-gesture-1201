/*
 * * 📱 FIXED Version: 修复按钮点击无反应的问题
 * * 修复点：调整事件拦截逻辑，只有拖拽照片时才阻止默认行为
 */

let handPose;
let video;
let hands = [];
let snapshots = []; 

// 交互变量
let hoverStartTime = 0;
let isHovering = false;
let hasSnapped = false;
let lastCenterX = 0;
let lastCenterY = 0;

// 拖拽变量
let draggedSnapshot = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

// ⚙️ 参数
let totalTime = 500;   // 定格时间
let margin = 35;       // 手指避让

// 📷 摄像头控制
let usingFrontCamera = true; 
let isCameraSwitching = false; 
let switchBtn;
let clearBtn;
let saveBtn;

function preload() {
  handPose = ml5.handPose();
}

function setup() {
  let c = createCanvas(windowWidth, windowHeight);
  pixelDensity(1);

  // --- 防滚动设置 (仅针对 touchmove) ---
  // 这行确保手指在画布上滑动时不会拖动整个网页
  c.elt.addEventListener("touchmove", function(event) {
    event.preventDefault();
  }, { passive: false });
  
  // 初始化摄像头
  initCamera();

  // --- UI 按钮 ---
  // 1. 切换按钮
  switchBtn = createButton('🔄 SWITCH');
  switchBtn.position(20, 20);
  switchBtn.mousePressed(toggleCamera); 
  styleButton(switchBtn);

  // 2. 清空按钮
  clearBtn = createButton('CLEAR');
  clearBtn.position(width - 100, 20);
  clearBtn.mousePressed(clearAllSnapshots);
  styleButton(clearBtn);
  clearBtn.style('color', '#d9534f');

  // 3. 下载按钮
  saveBtn = createButton('⬇️ DOWNLOAD');
  saveBtn.position(width / 2 - 75, height - 80);
  saveBtn.mousePressed(savePicture);
  styleButton(saveBtn);
}

// --- 清空功能 ---
function clearAllSnapshots() {
  snapshots = [];
  draggedSnapshot = null;
}

// --- 摄像头软切换 ---
function toggleCamera() {
  if (isCameraSwitching) return;
  isCameraSwitching = true;
  switchBtn.html('⌛...'); 

  if (video) {
    let stream = video.elt.srcObject;
    if (stream) {
      let tracks = stream.getTracks();
      tracks.forEach(track => track.stop());
    }
    video.remove();
    video = null;
  }

  usingFrontCamera = !usingFrontCamera;

  setTimeout(() => {
    initCamera();
    isCameraSwitching = false;
    switchBtn.html('🔄 SWITCH'); 
  }, 500); 
}

function initCamera() {
  let constraints = {
    audio: false,
    video: {
      facingMode: usingFrontCamera ? "user" : "environment",
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };

  video = createCapture(constraints, function(stream) {
    console.log("摄像头启动成功");
    handPose.detectStart(video, gotHands);
  });

  video.elt.setAttribute('playsinline', '');
  video.size(width, height);
  video.hide();
}

function draw() {
  background(0); 
  push();
  
  if (usingFrontCamera) {
    translate(width, 0); 
    scale(-1, 1);
  } else {
    translate(0, 0);
    scale(1, 1);
  }
  
  if (video) {
    image(video, 0, 0, width, height);
  }

  for (let i = 0; i < snapshots.length; i++) {
    let snap = snapshots[i];
    if (snap === draggedSnapshot) {
      stroke(255, 255, 0); 
      strokeWeight(5);
    } else {
      stroke(255); 
      strokeWeight(3);
    }
    noFill();
    rect(snap.x, snap.y, snap.w, snap.h);
    image(snap.img, snap.x, snap.y);
  }

  if (hands.length > 0) {
    let hand = hands[0];
    let thumb = hand.keypoints[4];
    let index = hand.keypoints[8];

    let rawX = min(thumb.x, index.x);
    let rawY = min(thumb.y, index.y);
    let rawW = abs(thumb.x - index.x);
    let rawH = abs(thumb.y - index.y);

    let x = rawX + margin;
    let y = rawY + margin;
    let w = rawW - margin * 2;
    let h = rawH - margin * 2;

    if (w < 0) w = 0;
    if (h < 0) h = 0;
    
    let currentCenterX = x + w / 2;
    let currentCenterY = y + h / 2;
    let movement = dist(currentCenterX, currentCenterY, lastCenterX, lastCenterY);
    
    if (draggedSnapshot === null && movement < 8 && w > 20 && h > 20) {
      if (!isHovering) {
        hoverStartTime = millis();
        isHovering = true;
      }
    } else {
      isHovering = false;
      hasSnapped = false; 
      hoverStartTime = 0;
    }

    lastCenterX = currentCenterX;
    lastCenterY = currentCenterY;

    if (isHovering) {
      let elapsedTime = millis() - hoverStartTime;
      let progress = constrain(elapsedTime / totalTime, 0, 1);
      let r = map(progress, 0, 1, 255, 0);
      let g = map(progress, 0, 1, 0, 255);
      
      stroke(r, g, 0);
      strokeWeight(4);
      noFill();
      rect(x, y, w, h);
      noStroke();
      fill(r, g, 0);
      rect(x, y - 15, w * progress, 8); 

      if (elapsedTime > totalTime && !hasSnapped) {
        if (w > 0 && h > 0) {
          let capturedImage = video.get(x, y, w, h);
          snapshots.push({
            img: capturedImage,
            x: x,
            y: y,
            w: w,
            h: h
          });
          hasSnapped = true; 
        }
      }
    } else if (draggedSnapshot === null && w > 0 && h > 0) {
       stroke(255, 0, 0);
       strokeWeight(1);
       noFill();
       rect(x, y, w, h);
    }
  }
  
  pop(); 
}

function gotHands(results) {
  hands = results;
}

// ==============================
// 🖱️ 交互逻辑 (关键修复区)
// ==============================

function handleInputStart() {
  let inputX = mouseX;
  if (usingFrontCamera) {
    inputX = width - mouseX; 
  }
  let inputY = mouseY;

  for (let i = snapshots.length - 1; i >= 0; i--) {
    let s = snapshots[i];
    if (inputX > s.x - 10 && inputX < s.x + s.w + 10 &&
        inputY > s.y - 10 && inputY < s.y + s.h + 10) {
      draggedSnapshot = s;
      dragOffsetX = inputX - s.x;
      dragOffsetY = inputY - s.y;
      snapshots.splice(i, 1);
      snapshots.push(s);
      
      // 命中照片：阻止默认行为（不让点击传透）
      return false; 
    }
  }
  
  // 【关键修复】：没命中照片（点的是按钮或空地），必须 return true！
  // 这样按钮才能收到点击事件
  return true;
}

function handleInputMove() {
  if (draggedSnapshot) {
    let inputX = mouseX;
    if (usingFrontCamera) {
      inputX = width - mouseX;
    }
    let inputY = mouseY;
    draggedSnapshot.x = inputX - dragOffsetX;
    draggedSnapshot.y = inputY - dragOffsetY;
    return false; // 拖拽时阻止滚动
  }
  // 没拖拽时，允许事件继续（虽然 setup 里已经防滚动了）
  return true; 
}

function handleInputEnd() {
  draggedSnapshot = null;
  return true; // 允许默认行为
}

function mousePressed() { return handleInputStart(); }
function mouseDragged() { return handleInputMove(); }
function mouseReleased() { return handleInputEnd(); }
function touchStarted() { return handleInputStart(); }
function touchMoved() { return handleInputMove(); }
function touchEnded() { return handleInputEnd(); }

// UI 样式
function styleButton(btn) {
  btn.style('font-size', '14px');
  btn.style('padding', '10px 15px');
  btn.style('background-color', 'white');
  btn.style('color', '#333');
  btn.style('border', 'none');
  btn.style('border-radius', '20px');
  btn.style('box-shadow', '0 2px 5px rgba(0,0,0,0.3)');
  btn.style('font-weight', 'bold');
  btn.style('touch-action', 'manipulation'); 
  btn.style('z-index', '100'); 
  btn.style('cursor', 'pointer'); // 鼠标手势
}

function savePicture() {
  saveCanvas('my_collage', 'jpg');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if(saveBtn) saveBtn.position(width / 2 - 75, height - 80);
  if(clearBtn) clearBtn.position(width - 100, 20);
  if(switchBtn) switchBtn.position(20, 20);
}

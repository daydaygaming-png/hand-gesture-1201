/*
 * * 📱 Ultimate Pro: 手勢定格 + 完美拖拽 + 清空功能
 * * 新增：右上角 CLEAR 按鈕，一鍵清空畫布
 */

let handPose;
let video;
let hands = [];
let snapshots = []; 

// 交互狀態
let hoverStartTime = 0;
let isHovering = false;
let hasSnapped = false;
let lastCenterX = 0;
let lastCenterY = 0;

// 拖拽變量
let draggedSnapshot = null;
let dragOffsetX = 0;
let dragOffsetY = 0;

// ⚙️ 參數
let totalTime = 500;   // 定格時間
let margin = 35;       // 手指避讓

// 📷 攝像頭控制
let usingFrontCamera = true; 
let switchBtn;
let saveBtn;
let clearBtn; // 新增：清空按鈕變量

function preload() {
  handPose = ml5.handPose();
}

function setup() {
  // 1. 創建畫布
  let c = createCanvas(windowWidth, windowHeight);
  pixelDensity(1);

  // --- 🔒 核彈級防滾動設置 ---
  c.elt.addEventListener("touchmove", function(event) {
    event.preventDefault();
  }, { passive: false });
  
  c.elt.style.touchAction = "none"; 
  document.body.style.overflow = "hidden"; 

  // --- URL 參數檢測 ---
  let params = getURLParams();
  let camMode = 'user'; 

  if (params.cam === 'environment') {
    camMode = 'environment';
    usingFrontCamera = false;
  } else {
    camMode = 'user';
    usingFrontCamera = true;
  }

  // --- 啟動攝像頭 ---
  let constraints = {
    audio: false,
    video: {
      facingMode: camMode,
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };

  video = createCapture(constraints, function(stream) {
    console.log("攝像頭啟動: " + camMode);
    handPose.detectStart(video, gotHands);
  });

  video.elt.setAttribute('playsinline', '');
  video.size(width, height);
  video.hide();

  // --- UI 按鈕區域 ---
  
  // 1. 左上角：切換鏡頭
  switchBtn = createButton('🔄 SWITCH');
  switchBtn.position(20, 20);
  switchBtn.mousePressed(switchCameraByReload); 
  styleButton(switchBtn);

  // 2. 右上角：清空畫布 (新增)
  clearBtn = createButton('CLEAR');
  clearBtn.position(width - 100, 20); // 放在右上角
  clearBtn.mousePressed(clearAllSnapshots);
  styleButton(clearBtn);
  // 給清空按鈕加個紅色文字提示危險操作 (可選)
  clearBtn.style('color', '#d9534f'); 

  // 3. 底部居中：下載
  saveBtn = createButton('⬇️ DOWNLOAD');
  saveBtn.position(width / 2 - 75, height - 80);
  saveBtn.mousePressed(savePicture);
  styleButton(saveBtn);
}

// --- 新增功能：清空所有照片 ---
function clearAllSnapshots() {
  snapshots = [];
  draggedSnapshot = null; // 確保沒有殘留的拖拽狀態
}

function switchCameraByReload() {
  let nextMode = usingFrontCamera ? 'environment' : 'user';
  let currentUrl = window.location.href.split('?')[0];
  window.location.href = currentUrl + "?cam=" + nextMode;
}

function draw() {
  background(0); 
  
  push();
  
  // 智能鏡像
  if (usingFrontCamera) {
    translate(width, 0); 
    scale(-1, 1);
  } else {
    translate(0, 0);
    scale(1, 1);
  }
  
  // 1. 背景視頻
  if (video) {
    image(video, 0, 0, width, height);
  }

  // 2. 照片
  for (let i = 0; i < snapshots.length; i++) {
    let snap = snapshots[i];
    
    // 選中狀態顯示黃框
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

  // 3. 手勢識別
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
    
    // 定格觸發
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

    // 視覺反饋
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
// 🖱️ 交互邏輯
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
      
      return false; 
    }
  }
  return false;
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
    
    return false; 
  }
}

function handleInputEnd() {
  draggedSnapshot = null;
  return false;
}

function mousePressed() { return handleInputStart(); }
function mouseDragged() { return handleInputMove(); }
function mouseReleased() { return handleInputEnd(); }
function touchStarted() { return handleInputStart(); }
function touchMoved() { return handleInputMove(); }
function touchEnded() { return handleInputEnd(); }


// ==============================
// 🎨 樣式與輔助
// ==============================

function styleButton(btn) {
  btn.style('font-size', '14px'); // 字稍微改小一點點，避免遮擋太多
  btn.style('padding', '10px 15px');
  btn.style('background-color', 'white');
  btn.style('color', '#333');
  btn.style('border', 'none');
  btn.style('border-radius', '20px');
  btn.style('box-shadow', '0 2px 5px rgba(0,0,0,0.3)');
  btn.style('font-weight', 'bold');
  btn.style('touch-action', 'manipulation'); 
  btn.style('z-index', '100'); 
}

function savePicture() {
  saveCanvas('my_collage', 'jpg');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  // 重新定位所有按鈕
  if(saveBtn) saveBtn.position(width / 2 - 75, height - 80);
  if(clearBtn) clearBtn.position(width - 100, 20);
  if(switchBtn) switchBtn.position(20, 20);
}

// 輔助函數：獲取 URL 參數
function getURLParams() {
  let params = {};
  let parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
    params[key] = value;
  });
  return params;
}

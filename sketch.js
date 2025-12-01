/*
 * * 📱 Ultimate Stable: 刷新式切换 + 默认前置
 * * 核心：利用网页刷新来清理摄像头占用，解决手势识别卡死问题
 */

let handPose;
let video;
let hands = [];
let snapshots = []; 

// 交互状态
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
let usingFrontCamera = true; // 标记当前是不是前置
let switchBtn;
let saveBtn;

function preload() {
  handPose = ml5.handPose();
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);

  // --- 1. 核心逻辑：检查 URL 参数决定开哪个摄像头 ---
  // 这种方式最稳定，每次都是全新的开始
  let params = getURLParams();
  let camMode = 'user'; // 默认：user (前置)

  // 如果网址里写了 ?cam=environment，那就开后置
  if (params.cam === 'environment') {
    camMode = 'environment';
    usingFrontCamera = false;
  } else {
    camMode = 'user';
    usingFrontCamera = true;
  }

  // --- 2. 启动摄像头 ---
  let constraints = {
    audio: false,
    video: {
      facingMode: camMode,
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };

  video = createCapture(constraints, function(stream) {
    console.log("摄像头启动成功: " + camMode);
    // 只有启动成功才开始识别
    handPose.detectStart(video, gotHands);
  });

  video.elt.setAttribute('playsinline', '');
  video.size(width, height);
  video.hide();

  // --- 3. UI 按钮 ---
  switchBtn = createButton('🔄 刷新切换');
  switchBtn.position(20, 20);
  switchBtn.mousePressed(switchCameraByReload); // 绑定新的切换函数
  styleButton(switchBtn);

  saveBtn = createButton('⬇️ DOWNLOAD');
  saveBtn.position(width / 2 - 75, height - 80);
  saveBtn.mousePressed(savePicture);
  styleButton(saveBtn);
}

// --- ♻️ 新的切换逻辑：刷新网页 ---
function switchCameraByReload() {
  // 如果当前是前置，就去后置；反之亦然
  let nextMode = usingFrontCamera ? 'environment' : 'user';
  
  // 修改 URL 并刷新页面
  // 例如：index.html?cam=environment
  let currentUrl = window.location.href.split('?')[0];
  window.location.href = currentUrl + "?cam=" + nextMode;
}

function draw() {
  background(0); 
  
  push();
  
  // 智能镜像：只有前置摄像头镜像
  if (usingFrontCamera) {
    translate(width, 0); 
    scale(-1, 1);
  } else {
    translate(0, 0);
    scale(1, 1);
  }
  
  // 1. 画背景视频
  if (video) {
    image(video, 0, 0, width, height);
  }

  // 2. 画出所有照片
  for (let snap of snapshots) {
    stroke(255);
    strokeWeight(3);
    noFill();
    rect(snap.x, snap.y, snap.w, snap.h);
    image(snap.img, snap.x, snap.y);
  }

  // 3. 手势识别逻辑
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
    
    // 定格触发
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

    // 视觉反馈
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

// --- 触摸拖拽逻辑 ---
function mousePressed() {
  let inputX = mouseX;
  if (usingFrontCamera) {
    inputX = width - mouseX; 
  }
  let inputY = mouseY;

  for (let i = snapshots.length - 1; i >= 0; i--) {
    let s = snapshots[i];
    if (inputX > s.x && inputX < s.x + s.w &&
        inputY > s.y && inputY < s.y + s.h) {
      draggedSnapshot = s;
      dragOffsetX = inputX - s.x;
      dragOffsetY = inputY - s.y;
      snapshots.splice(i, 1);
      snapshots.push(s);
      return false; 
    }
  }
}

function mouseDragged() {
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

function mouseReleased() {
  draggedSnapshot = null;
}

function styleButton(btn) {
  btn.style('font-size', '16px');
  btn.style('padding', '10px 20px');
  btn.style('background-color', 'white');
  btn.style('color', '#333');
  btn.style('border', 'none');
  btn.style('border-radius', '20px');
  btn.style('box-shadow', '0 2px 5px rgba(0,0,0,0.3)');
  btn.style('font-weight', 'bold');
  btn.style('touch-action', 'manipulation');
}

function savePicture() {
  saveCanvas('my_collage', 'jpg');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if(saveBtn) saveBtn.position(width / 2 - 75, height - 80);
}

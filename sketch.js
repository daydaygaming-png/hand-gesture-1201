/*
 * * 📱 手机版 Ultimate：手势定格 + 拖拽 + 切换前后摄
 * * 功能：全屏适配 + 智能镜像(前置镜/后置不镜) + 1秒定格 + 拖拽 + 下载
 */

// --- 1. 全局变量 ---
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

// ⚙️ 参数设置
let totalTime = 500;   // 定格时间：500毫秒 (0.5秒)
let margin = 35;       // 手指避让距离

// 📷 摄像头状态
let usingFrontCamera = true; // 默认为前置
let switchBtn;
let saveBtn;

function preload() {
  handPose = ml5.handPose();
}

function setup() {
  createCanvas(windowWidth, windowHeight);
  pixelDensity(1);

  // 初始化摄像头
  initCamera();

  // --- 创建 UI 按钮 ---
  
  // 1. 切换摄像头按钮 (放在左上角)
  switchBtn = createButton('🔄 切换镜头');
  switchBtn.position(20, 20);
  switchBtn.mousePressed(toggleCamera);
  styleButton(switchBtn);

  // 2. 下载按钮 (放在底部居中)
  saveBtn = createButton('⬇️ DOWNLOAD');
  saveBtn.position(width / 2 - 75, height - 80);
  saveBtn.mousePressed(savePicture);
  styleButton(saveBtn);
}

// --- 初始化/重置摄像头的核心函数 ---
function initCamera() {
  // 如果已经有视频在运行，先停止它 (防止手机发热/占用)
  if (video) {
    video.remove(); // 移除 DOM 元素
    video = null;
  }

  let constraints = {
    audio: false,
    video: {
      // 根据状态切换 facingMode
      facingMode: usingFrontCamera ? "user" : "environment",
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };

  video = createCapture(constraints, function(stream) {
    // 摄像头准备好后的回调
    console.log("Camera started");
  });
  
  video.elt.setAttribute('playsinline', '');
  video.size(width, height);
  video.hide();

  // 重新绑定手势识别到新的视频流
  handPose.detectStart(video, gotHands);
}

// 切换摄像头逻辑
function toggleCamera() {
  usingFrontCamera = !usingFrontCamera; // 切换状态
  snapshots = []; // (可选) 切换镜头时清空画布，防止视角混乱，如不想清空可注释掉这行
  initCamera();   // 重启摄像头
}

function draw() {
  background(0); // 黑色背景防闪烁
  
  // --- 智能镜像处理 ---
  push();
  
  if (usingFrontCamera) {
    // 前置：启用镜像 (原点移到右上角，x轴翻转)
    translate(width, 0); 
    scale(-1, 1);
  } else {
    // 后置：正常显示 (不需要翻转)
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

    // 坐标计算
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
    
    // 定格触发逻辑
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
  
  pop(); // 结束镜像/正常变换区域
}

function gotHands(results) {
  hands = results;
}

// --- 触摸拖拽逻辑 (需适配镜像状态) ---
function mousePressed() {
  // 根据摄像头模式，决定鼠标X轴是否需要翻转
  let inputX = mouseX;
  if (usingFrontCamera) {
    inputX = width - mouseX; // 镜像翻转坐标
  }
  let inputY = mouseY;

  // 倒序检查点击
  for (let i = snapshots.length - 1; i >= 0; i--) {
    let s = snapshots[i];
    if (inputX > s.x && inputX < s.x + s.w &&
        inputY > s.y && inputY < s.y + s.h) {
      
      draggedSnapshot = s;
      dragOffsetX = inputX - s.x;
      dragOffsetY = inputY - s.y;
      
      // 置顶
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

// 辅助函数：统一按钮样式
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
  // 重新定位底部按钮，顶部按钮不用动
  if(saveBtn) saveBtn.position(width / 2 - 75, height - 80);
  if(video) video.size(windowWidth, windowHeight);
}

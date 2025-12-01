/*
 * * 📱 Ultimate Final Fix: 彻底解决手机拖拽不动的问题
 * * 核心：使用原生事件监听器强行禁止 touchmove 默认行为
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
let usingFrontCamera = true; 
let switchBtn;
let saveBtn;

function preload() {
  handPose = ml5.handPose();
}

function setup() {
  // 1. 创建画布
  let c = createCanvas(windowWidth, windowHeight);
  pixelDensity(1);

  // --- 🔒 核弹级防滚动设置 (关键) ---
  // 强制禁止画布上的触摸滚动，确保拖拽流畅
  c.elt.addEventListener("touchmove", function(event) {
    event.preventDefault();
  }, { passive: false });
  
  c.elt.style.touchAction = "none"; 
  document.body.style.overflow = "hidden"; // 整个网页禁止滚动

  // --- URL 参数检测 ---
  let params = getURLParams();
  let camMode = 'user'; 

  if (params.cam === 'environment') {
    camMode = 'environment';
    usingFrontCamera = false;
  } else {
    camMode = 'user';
    usingFrontCamera = true;
  }

  // --- 启动摄像头 ---
  let constraints = {
    audio: false,
    video: {
      facingMode: camMode,
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };

  video = createCapture(constraints, function(stream) {
    console.log("摄像头启动: " + camMode);
    handPose.detectStart(video, gotHands);
  });

  video.elt.setAttribute('playsinline', '');
  video.size(width, height);
  video.hide();

  // --- UI 按钮 ---
  switchBtn = createButton('🔄 刷新切换');
  switchBtn.position(20, 20);
  switchBtn.mousePressed(switchCameraByReload); 
  styleButton(switchBtn);

  saveBtn = createButton('⬇️ DOWNLOAD');
  saveBtn.position(width / 2 - 75, height - 80);
  saveBtn.mousePressed(savePicture);
  styleButton(saveBtn);
}

function switchCameraByReload() {
  let nextMode = usingFrontCamera ? 'environment' : 'user';
  let currentUrl = window.location.href.split('?')[0];
  window.location.href = currentUrl + "?cam=" + nextMode;
}

function draw() {
  background(0); 
  
  push();
  
  // 智能镜像
  if (usingFrontCamera) {
    translate(width, 0); 
    scale(-1, 1);
  } else {
    translate(0, 0);
    scale(1, 1);
  }
  
  // 1. 背景视频
  if (video) {
    image(video, 0, 0, width, height);
  }

  // 2. 照片
  for (let i = 0; i < snapshots.length; i++) {
    let snap = snapshots[i];
    
    // 如果是正在拖拽的那张，画个黄色框提示用户“选中了”
    if (snap === draggedSnapshot) {
      stroke(255, 255, 0); // 黄色
      strokeWeight(5);
    } else {
      stroke(255); // 白色
      strokeWeight(3);
    }
    
    noFill();
    rect(snap.x, snap.y, snap.w, snap.h);
    image(snap.img, snap.x, snap.y);
  }

  // 3. 手势识别
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
    
    // 只有没在拖拽时才触发定格
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

// ==============================
// 🖱️ 交互逻辑 (强力修正版)
// ==============================

// 统一处理点击/触摸开始
function handleInputStart() {
  let inputX = mouseX;
  
  // 修正坐标：前置摄像头时，输入坐标需要镜像翻转
  if (usingFrontCamera) {
    inputX = width - mouseX; 
  }
  let inputY = mouseY;

  // 倒序检查（优先选中最上面的图）
  for (let i = snapshots.length - 1; i >= 0; i--) {
    let s = snapshots[i];
    
    // 稍微扩大一点点击范围 (+10px)，方便手指点击
    if (inputX > s.x - 10 && inputX < s.x + s.w + 10 &&
        inputY > s.y - 10 && inputY < s.y + s.h + 10) {
      
      draggedSnapshot = s;
      dragOffsetX = inputX - s.x;
      dragOffsetY = inputY - s.y;
      
      // 置顶
      snapshots.splice(i, 1);
      snapshots.push(s);
      
      return false; // 阻止默认行为
    }
  }
  return false;
}

// 统一处理拖拽/移动
function handleInputMove() {
  if (draggedSnapshot) {
    let inputX = mouseX;
    if (usingFrontCamera) {
      inputX = width - mouseX;
    }
    let inputY = mouseY;

    draggedSnapshot.x = inputX - dragOffsetX;
    draggedSnapshot.y = inputY - dragOffsetY;
    
    return false; // 防止拖拽时滚动页面
  }
}

function handleInputEnd() {
  draggedSnapshot = null;
  return false;
}

// 绑定 p5.js 的事件
function mousePressed() { return handleInputStart(); }
function mouseDragged() { return handleInputMove(); }
function mouseReleased() { return handleInputEnd(); }
function touchStarted() { return handleInputStart(); }
function touchMoved() { return handleInputMove(); }
function touchEnded() { return handleInputEnd(); }


// ==============================
// 🎨 样式与辅助
// ==============================

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
  btn.style('z-index', '100'); // 确保按钮在最上层
}

function savePicture() {
  saveCanvas('my_collage', 'jpg');
}

function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  if(saveBtn) saveBtn.position(width / 2 - 75, height - 80);
}

// 辅助函数：获取 URL 参数
function getURLParams() {
  let params = {};
  let parts = window.location.href.replace(/[?&]+([^=&]+)=([^&]*)/gi, function(m,key,value) {
    params[key] = value;
  });
  return params;
}

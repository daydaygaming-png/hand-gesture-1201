/*
 * * 📱 手机版：手势定格拼贴工具
 * * 功能：全屏适配 + iOS兼容 + 前置镜头 + 1秒定格 + 手指避让
 */

// --- 1. 全局变量声明 ---
let handPose;
let video;
let hands = [];
let snapshots = []; // 存储定格画面

// 交互逻辑变量
let hoverStartTime = 0;
let isHovering = false;
let hasSnapped = false;
let lastCenterX = 0;
let lastCenterY = 0;

// 参数设置
let totalTime = 1000; // 定格等待时间：1秒
let margin = 35;      // 手指避让距离：35像素

// 按钮变量
let saveBtn;

function preload() {
  // 加载模型
  handPose = ml5.handPose();
}

function setup() {
  // --- 适配手机屏幕尺寸 ---
  createCanvas(windowWidth, windowHeight);
  // 手机屏幕像素密度高，设为1可以防卡顿并提升性能
  pixelDensity(1);

  // --- 摄像头设置 ---
  let constraints = {
    audio: false,
    video: {
      facingMode: "user", // 强制使用前置摄像头
      // 请求适合手机的分辨率 (浏览器会自动调整)
      width: { ideal: 1280 },
      height: { ideal: 720 }
    }
  };

  video = createCapture(constraints);
  
  // 【关键】解决 iOS Safari 视频黑屏或自动全屏问题
  video.elt.setAttribute('playsinline', ''); 
  
  video.size(width, height); 
  video.hide();
  
  // 开始检测
  handPose.detectStart(video, gotHands);

  // --- 创建适合手机按的下载按钮 ---
  saveBtn = createButton('⬇️ DOWNLOAD');
  // 居中放在底部 (留出 80px 空间)
  saveBtn.position(width / 2 - 75, height - 80); 
  saveBtn.mousePressed(savePicture);
  
  // 手机端按钮样式优化
  saveBtn.style('font-size', '16px');
  saveBtn.style('padding', '12px 30px');
  saveBtn.style('background-color', 'white');
  saveBtn.style('color', '#333');
  saveBtn.style('border', 'none');
  saveBtn.style('border-radius', '30px'); // 圆角
  saveBtn.style('box-shadow', '0 4px 10px rgba(0,0,0,0.3)'); // 阴影
  saveBtn.style('font-weight', 'bold');
  saveBtn.style('touch-action', 'manipulation'); // 优化点击反应
}

function draw() {
  // --- 2. 镜像翻转处理 ---
  push(); 
  translate(width, 0); 
  scale(-1, 1);       
  
  // --- 3. 绘制背景视频 (拉伸填满屏幕) ---
  image(video, 0, 0, width, height);

  // --- 4. 绘制已定格的照片 ---
  for (let snap of snapshots) {
    stroke(255);
    strokeWeight(3);
    noFill();
    rect(snap.x, snap.y, snap.w, snap.h);
    image(snap.img, snap.x, snap.y);
  }

  // --- 5. 手势核心逻辑 ---
  if (hands.length > 0) {
    let hand = hands[0];
    let thumb = hand.keypoints[4]; // 大拇指尖
    let index = hand.keypoints[8]; // 食指尖

    // A. 计算原始手指构成的矩形
    let rawX = min(thumb.x, index.x);
    let rawY = min(thumb.y, index.y);
    let rawW = abs(thumb.x - index.x);
    let rawH = abs(thumb.y - index.y);

    // B. 计算避让手指后的实际截图矩形
    let x = rawX + margin;
    let y = rawY + margin;
    let w = rawW - margin * 2;
    let h = rawH - margin * 2;

    // 防止矩形太小出现负数
    if (w < 0) w = 0;
    if (h < 0) h = 0;
    
    // 计算中心点用于检测抖动
    let currentCenterX = x + w / 2;
    let currentCenterY = y + h / 2;

    // C. 检测手势是否稳定
    let movement = dist(currentCenterX, currentCenterY, lastCenterX, lastCenterY);
    
    // 只有当框足够大(w>20)且稳定时才进入倒计时
    if (movement < 8 && w > 20 && h > 20) { // 手机上稍微放宽移动阈值到8
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

    // D. 视觉反馈与截图执行
    if (isHovering) {
      // 计算进度
      let elapsedTime = millis() - hoverStartTime;
      let progress = constrain(elapsedTime / totalTime, 0, 1);

      // 颜色从红变绿
      let r = map(progress, 0, 1, 255, 0);
      let g = map(progress, 0, 1, 0, 255);
      
      // 画取景框
      stroke(r, g, 0);
      strokeWeight(4);
      noFill();
      rect(x, y, w, h);
      
      // 画顶部进度条
      noStroke();
      fill(r, g, 0);
      rect(x, y - 15, w * progress, 8); // 手机上进度条稍微粗一点

      // E. 时间到 -> 截图
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
    } else {
      // 不稳定状态：显示红色细框
      if (w > 0 && h > 0) {
        stroke(255, 0, 0);
        strokeWeight(1);
        noFill();
        rect(x, y, w, h);
      }
    }
  }
  
  pop(); // 结束镜像区域
}

function gotHands(results) {
  hands = results;
}

function savePicture() {
  saveCanvas('my_mobile_collage', 'jpg');
}

// 手机旋转屏幕时自动调整
function windowResized() {
  resizeCanvas(windowWidth, windowHeight);
  video.size(windowWidth, windowHeight);
  // 重新定位按钮
  if(saveBtn) saveBtn.position(width / 2 - 75, height - 80);
}
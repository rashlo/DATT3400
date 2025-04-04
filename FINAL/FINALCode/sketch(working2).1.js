let lines = [];
let shapes = [];
let synth;
let humSynth;
let lastFreq = null;

let video;
let videoBuffer;
let handpose;
let predictions = [];
let fingerX = 0;
let fingerY = 0;

let overlayBuffer;

function setup() {
  createCanvas(windowHeight, windowHeight, WEBGL);

  overlayBuffer = createGraphics(windowHeight, windowHeight); // match canvas size

  video = createCapture(VIDEO);
  video.size(width, height);
  video.hide();
  videoBuffer = createGraphics(width, height);

  handpose = ml5.handpose(video, () => console.log("Handpose model loaded"));
  handpose.on("predict", results => {
    predictions = results;
  });

  let colors = ['#00ff00', '#00cc66', '#009966', '#66ff99']; // terminal greens

  synth = new p5.MonoSynth();
  humSynth = new p5.Oscillator('sine');
  humSynth.freq(60);
  humSynth.amp(0.2);
  humSynth.start();
  userStartAudio();

  for (let i = 0; i < 35; i++) {
    let x1 = random(width) - width / 2;
    let y1 = random(height) - height / 2;
    let x2 = random(width) - width / 2;
    let y2 = random(height) - height / 2;
    let thickness = random(2, 14);
    let color = random(colors);
    let type = floor(random(3));
    lines.push({
      x1, y1, x2, y2,
      origX1: x1, origY1: y1,
      origX2: x2, origY2: y2,
      thickness, color, type, vibrate: false, timeout: 0
    });
  }

  for (let i = 0; i < 10; i++) {
    let type = random(['box', 'sphere', 'cone', 'cylinder']);
    let size = random(30, 130);
    let x = constrain(random(-width / 2, width / 2), -width / 2 + size, width / 2 - size);
    let y = constrain(random(-height / 2, height / 2), -height / 2 + size, height / 2 - size);
    let z = random(-200, 200);
    let color = random(colors);
    shapes.push({ type, size, x, y, z, color });
  }
}

function draw() {
  //background(255, 255, 255);
  background(0);
  trackHand();

  // Webcam buffer
  videoBuffer.push();
  videoBuffer.translate(width, 0);
  videoBuffer.scale(-1, 1);
  videoBuffer.image(video, 0, 0, width, height);
  
  // Convert to grayscale, reduce to 2 tones
  videoBuffer.filter(GRAY);
  videoBuffer.filter(POSTERIZE, 2);
  
  // bright = green
  videoBuffer.loadPixels();
  for (let i = 0; i < videoBuffer.pixels.length; i += 4) {
    let r = videoBuffer.pixels[i];
    if (r > 128) {
      // bright=green
      videoBuffer.pixels[i] = 0;     // R
      videoBuffer.pixels[i + 1] = 255; // G
      videoBuffer.pixels[i + 2] = 0;   // B
    } else {
      // dark=black
      videoBuffer.pixels[i] = 0;
      videoBuffer.pixels[i + 1] = 0;
      videoBuffer.pixels[i + 2] = 0;
    }
  }
  videoBuffer.updatePixels();
  
  videoBuffer.pop();
  
  

  // Draw webcam
  push();
  texture(videoBuffer);
  noStroke();
  translate(0, 0, -500);
  plane(width, height);
  pop();

  checkHandHover();

  for (let lineObj of lines) {
    let c = color(lineObj.color);
    // glow pass
    stroke(red(c), green(c), blue(c), 40);
    strokeWeight(lineObj.thickness * 1.8);
    drawTypedLine(lineObj);

    // main line pass
    stroke(c);
    strokeWeight(lineObj.thickness);
    drawTypedLine(lineObj);

    if (lineObj.vibrate) {
      lineObj.x1 += random(-2, 2);
      lineObj.y1 += random(-2, 2);
      lineObj.x2 += random(-2, 2);
      lineObj.y2 += random(-2, 2);
    }
  }

  ambientLight(150);
  directionalLight(0, 255, 100, 1.5, 0, 1);

  for (let shape of shapes) {
    push();
    translate(shape.x, shape.y, shape.z);
    ortho(random(20, 0));
    emissiveMaterial('#00ff00');
    noStroke();
    if (shape.type === 'box') box(shape.size);
    else if (shape.type === 'sphere') sphere(shape.size / 2);
    else if (shape.type === 'cone') cone(shape.size / 2, shape.size);
    else if (shape.type === 'cylinder') cylinder(shape.size / 2, shape.size);
    pop();
  }

  // scanlines 
  overlayBuffer.clear();
  overlayBuffer.stroke(0, 255, 0, 25);
  overlayBuffer.strokeWeight(8);
  let scanlineOffset = millis() * 0.1 % 20;
  for (let y = -20 + scanlineOffset; y < overlayBuffer.height; y += 20) {
    overlayBuffer.line(0, y, overlayBuffer.width, y);
  }

  resetMatrix(); // reset transforms
  image(overlayBuffer, -width / 2, -height / 2); // top layer
}

function drawTypedLine(l) {
  if (l.type === 0) drawLine(l);
  else if (l.type === 1) drawZigzagLine(l);
  else if (l.type === 2) drawArrowLine(l);
}

function drawLine(l) {
  line(l.x1, l.y1, l.x2, l.y2);
}

function drawZigzagLine(l) {
  let { x1, y1, x2, y2 } = l;
  let segments = 10;
  let dx = (x2 - x1) / segments;
  let dy = (y2 - y1) / segments;
  for (let i = 0; i < segments; i++) {
    let nx1 = x1 + dx * i;
    let ny1 = y1 + dy * i;
    let nx2 = x1 + dx * (i + 1);
    let ny2 = y1 + dy * (i + 1);
    if (i % 2 === 0) line(nx1, ny1, nx2, ny2 - 10);
    else line(nx1, ny1, nx2, ny2 + 10);
  }
}

function drawArrowLine(l) {
  line(l.x1, l.y1, l.x2, l.y2);
  let angle = atan2(l.y2 - l.y1, l.x2 - l.x1);
  let arrowSize = 10;
  push();
  translate(l.x2, l.y2);
  rotate(angle);
  line(0, 0, -arrowSize, -arrowSize / 2);
  line(0, 0, -arrowSize, arrowSize / 2);
  pop();
}

function trackHand() {
  if (predictions.length > 0) {
    let indexTip = predictions[0].landmarks[8];
    fingerX = (width - indexTip[0]) - width / 2;
    fingerY = indexTip[1] - height / 2;
  }
}

function checkHandHover() {
  let notePlayed = false;

  for (let lineObj of lines) {
    let d = pointToLineDistance(fingerX, fingerY, lineObj.x1, lineObj.y1, lineObj.x2, lineObj.y2);
    if (d < 20) {
      lineObj.vibrate = true;
      lineObj.timeout = millis();
      let lineLength = dist(lineObj.x1, lineObj.y1, lineObj.x2, lineObj.y2);
      let frequency = map(lineLength, 0, width, 900, 200);
      if (lastFreq === null || abs(lastFreq - frequency) > 5) {
        synth.triggerAttack(frequency);
        lastFreq = frequency;
      }
      notePlayed = true;
    }
  }

  let currentTime = millis();
  for (let lineObj of lines) {
    if (lineObj.vibrate && currentTime - lineObj.timeout > 200) {
      lineObj.vibrate = false;
      lineObj.x1 = lineObj.origX1;
      lineObj.y1 = lineObj.origY1;
      lineObj.x2 = lineObj.origX2;
      lineObj.y2 = lineObj.origY2;
    }
  }

  if (!notePlayed && lastFreq !== null) {
    synth.triggerRelease();
    lastFreq = null;
  }
}

function pointToLineDistance(px, py, x1, y1, x2, y2) {
  let A = px - x1;
  let B = py - y1;
  let C = x2 - x1;
  let D = y2 - y1;
  let dot = A * C + B * D;
  let len_sq = C * C + D * D;
  let param = -1;
  if (len_sq != 0) param = dot / len_sq;
  let xx, yy;
  if (param < 0) { xx = x1; yy = y1; }
  else if (param > 1) { xx = x2; yy = y2; }
  else { xx = x1 + param * C; yy = y1 + param * D; }
  let dx = px - xx;
  let dy = py - yy;
  return sqrt(dx * dx + dy * dy);
}


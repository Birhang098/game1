// ===================== Open World Explorer =====================
// A small top-down open-world 2D game. Move with WASD, talk to NPCs
// with E, collect treasures, and avoid wandering enemies.
// =================================================================

const canvas = document.getElementById("gameCanvas");
const ctx = canvas.getContext("2d");

const VIEW_W = canvas.width;
const VIEW_H = canvas.height;

const WORLD_W = 2700;
const WORLD_H = 1800;
const TILE = 45;

// ----------------------- Input -----------------------
const keys = { w: false, a: false, s: false, d: false };
let ePressedEdge = false; // true only on the frame E was first pressed
let rPressedEdge = false;
let keyEHeld = false;

window.addEventListener("keydown", (e) => {
  const k = e.key.toLowerCase();
  if (k === "w" || k === "arrowup") keys.w = true;
  if (k === "s" || k === "arrowdown") keys.s = true;
  if (k === "a" || k === "arrowleft") keys.a = true;
  if (k === "d" || k === "arrowright") keys.d = true;
  if (k === "e" && !keyEHeld) { ePressedEdge = true; keyEHeld = true; }
  if (k === "r") rPressedEdge = true;
});
window.addEventListener("keyup", (e) => {
  const k = e.key.toLowerCase();
  if (k === "w" || k === "arrowup") keys.w = false;
  if (k === "s" || k === "arrowdown") keys.s = false;
  if (k === "a" || k === "arrowleft") keys.a = false;
  if (k === "d" || k === "arrowright") keys.d = false;
  if (k === "e") keyEHeld = false;
});

// ----------------------- World data -----------------------
// Obstacles block movement: trees, rocks, water. rect = {x,y,w,h,type}
let obstacles = [];

function addForestCluster(cx, cy, count, spread) {
  for (let i = 0; i < count; i++) {
    const x = cx + (Math.random() - 0.5) * spread;
    const y = cy + (Math.random() - 0.5) * spread;
    obstacles.push({ x, y, w: 34, h: 34, type: "tree" });
  }
}

function buildWorld() {
  obstacles = [];

  // Lake (top-right region)
  obstacles.push({ x: 1900, y: 200, w: 500, h: 320, type: "water" });

  // Second smaller pond (bottom-left)
  obstacles.push({ x: 250, y: 1350, w: 300, h: 220, type: "water" });

  // Forest clusters scattered around, leaving the village (top-left)
  // and the center clear for easy navigation.
  addForestCluster(1200, 300, 22, 380);
  addForestCluster(2100, 1300, 26, 420);
  addForestCluster(600, 900, 18, 320);
  addForestCluster(1500, 1500, 20, 360);
  addForestCluster(2400, 700, 16, 260);

  // A few standalone rocks
  for (let i = 0; i < 20; i++) {
    obstacles.push({
      x: 200 + Math.random() * (WORLD_W - 400),
      y: 200 + Math.random() * (WORLD_H - 400),
      w: 26,
      h: 26,
      type: "rock",
    });
  }
}

// ----------------------- NPCs -----------------------
const npcs = [
  {
    name: "Old Man Rowan",
    x: 380,
    y: 320,
    color: "#8d6e63",
    lines: [
      "Welcome to the village, traveler.",
      "The forests east of here hide plenty of treasure, if you're brave.",
      "Watch yourself around the slimes though, they bite.",
    ],
  },
  {
    name: "Merchant Elsa",
    x: 520,
    y: 260,
    color: "#6a1b9a",
    lines: [
      "Fresh goods, fresh goods! ...well, if I had a shop built yet.",
      "Rumor says there's a hidden pond full of treasure to the south.",
    ],
  },
  {
    name: "Guard Tomas",
    x: 460,
    y: 460,
    color: "#37474f",
    lines: [
      "Stay alert out there. I've seen enemies patrolling near the lake.",
      "Bring back enough treasure and maybe I'll let you into the keep.",
    ],
  },
  {
    name: "Farmer Bree",
    x: 300,
    y: 520,
    color: "#558b2f",
    lines: [
      "My crops keep getting trampled by something out there at night.",
      "If you find any treasure near the eastern woods, it's finders keepers.",
    ],
  },
  {
    name: "Wanderer Finn",
    x: 2250,
    y: 1450,
    color: "#ef6c00",
    lines: [
      "You made it all the way out here? Impressive.",
      "This is the far edge of the map. Not much left to explore beyond this.",
    ],
  },
];

// ----------------------- Enemies -----------------------
function makeEnemy(homeX, homeY, leash, speed) {
  return {
    x: homeX,
    y: homeY,
    homeX,
    homeY,
    leash,
    speed,
    w: 32,
    h: 32,
    dirX: 0,
    dirY: 0,
    changeDirTimer: 0,
  };
}

const enemies = [
  makeEnemy(1300, 350, 260, 90),
  makeEnemy(2000, 350, 220, 110),
  makeEnemy(700, 950, 240, 95),
  makeEnemy(1600, 1550, 260, 100),
  makeEnemy(2350, 750, 200, 105),
];

// ----------------------- Treasures -----------------------
let treasures = [];
function buildTreasures() {
  treasures = [];
  const totalTreasures = 12;
  let placed = 0;
  while (placed < totalTreasures) {
    const x = 150 + Math.random() * (WORLD_W - 300);
    const y = 150 + Math.random() * (WORLD_H - 300);
    treasures.push({ x, y, w: 22, h: 22, collected: false });
    placed++;
  }
}

// ----------------------- Player -----------------------
let player;
function resetPlayer() {
  player = {
    x: 420,
    y: 400,
    w: 34,
    h: 34,
    speed: 220, // pixels per second
    health: 5,
    maxHealth: 5,
    invincibleTimer: 0,
  };
}

// ----------------------- Game state -----------------------
let gameState = "playing"; // "playing" | "gameover"
let activeDialogue = null; // { npc, lineIndex }
let nearbyNpc = null;
let score = 0;

function startGame() {
  buildWorld();
  buildTreasures();
  resetPlayer();
  enemies.forEach((en) => {
    en.x = en.homeX;
    en.y = en.homeY;
  });
  score = 0;
  gameState = "playing";
  activeDialogue = null;
  nearbyNpc = null;
}

// ----------------------- Collision helpers -----------------------
function rectsOverlap(ax, ay, aw, ah, bx, by, bw, bh) {
  return ax < bx + bw && ax + aw > bx && ay < by + bh && ay + ah > by;
}

function collidesWithObstacles(x, y, w, h) {
  for (const ob of obstacles) {
    if (rectsOverlap(x, y, w, h, ob.x, ob.y, ob.w, ob.h)) return true;
  }
  return false;
}

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

// ----------------------- Update -----------------------
let lastTime = performance.now();

function update(dt) {
  if (rPressedEdge) {
    rPressedEdge = false;
    if (gameState === "gameover") {
      startGame();
      return;
    }
  }

  if (gameState !== "playing") return;

  // If a dialogue is open, movement is paused; E advances/closes it.
  if (activeDialogue) {
    if (ePressedEdge) {
      ePressedEdge = false;
      activeDialogue.lineIndex++;
      if (activeDialogue.lineIndex >= activeDialogue.npc.lines.length) {
        activeDialogue = null;
      }
    }
    return;
  }

  // ---- Player movement (axis-separated so sliding along walls works) ----
  let dx = 0;
  let dy = 0;
  if (keys.w) dy -= 1;
  if (keys.s) dy += 1;
  if (keys.a) dx -= 1;
  if (keys.d) dx += 1;
  if (dx !== 0 && dy !== 0) {
    const norm = Math.SQRT1_2;
    dx *= norm;
    dy *= norm;
  }

  const moveX = dx * player.speed * dt;
  const moveY = dy * player.speed * dt;

  const newX = player.x + moveX;
  if (!collidesWithObstacles(newX, player.y, player.w, player.h)) {
    player.x = clamp(newX, 0, WORLD_W - player.w);
  }
  const newY = player.y + moveY;
  if (!collidesWithObstacles(player.x, newY, player.w, player.h)) {
    player.y = clamp(newY, 0, WORLD_H - player.h);
  }

  if (player.invincibleTimer > 0) player.invincibleTimer -= dt;

  // ---- Treasure collection ----
  for (const t of treasures) {
    if (!t.collected && rectsOverlap(player.x, player.y, player.w, player.h, t.x, t.y, t.w, t.h)) {
      t.collected = true;
      score++;
    }
  }

  // ---- NPC proximity ----
  nearbyNpc = null;
  for (const npc of npcs) {
    const distX = player.x + player.w / 2 - npc.x;
    const distY = player.y + player.h / 2 - npc.y;
    const dist = Math.sqrt(distX * distX + distY * distY);
    if (dist < 60) {
      nearbyNpc = npc;
      break;
    }
  }
  if (nearbyNpc && ePressedEdge) {
    ePressedEdge = false;
    activeDialogue = { npc: nearbyNpc, lineIndex: 0 };
  }
  ePressedEdge = false; // consume even if unused this frame

  // ---- Enemy AI: wander within a leash radius of home point ----
  for (const en of enemies) {
    en.changeDirTimer -= dt;
    if (en.changeDirTimer <= 0) {
      const angle = Math.random() * Math.PI * 2;
      en.dirX = Math.cos(angle);
      en.dirY = Math.sin(angle);
      en.changeDirTimer = 1 + Math.random() * 1.5;
    }

    let nx = en.x + en.dirX * en.speed * dt;
    let ny = en.y + en.dirY * en.speed * dt;

    // Stay within leash of home point
    const homeDist = Math.sqrt((nx - en.homeX) ** 2 + (ny - en.homeY) ** 2);
    if (homeDist > en.leash) {
      en.dirX = (en.homeX - en.x) / (homeDist || 1);
      en.dirY = (en.homeY - en.y) / (homeDist || 1);
      nx = en.x + en.dirX * en.speed * dt;
      ny = en.y + en.dirY * en.speed * dt;
      en.changeDirTimer = 1;
    }

    if (!collidesWithObstacles(nx, en.y, en.w, en.h)) en.x = nx;
    if (!collidesWithObstacles(en.x, ny, en.w, en.h)) en.y = ny;
  }

  // ---- Enemy collision with player ----
  if (player.invincibleTimer <= 0) {
    for (const en of enemies) {
      if (rectsOverlap(player.x, player.y, player.w, player.h, en.x, en.y, en.w, en.h)) {
        player.health--;
        player.invincibleTimer = 1.2;
        if (player.health <= 0) {
          gameState = "gameover";
        }
        break;
      }
    }
  }
}

// ----------------------- Camera -----------------------
function getCamera() {
  let camX = player.x + player.w / 2 - VIEW_W / 2;
  let camY = player.y + player.h / 2 - VIEW_H / 2;
  camX = clamp(camX, 0, WORLD_W - VIEW_W);
  camY = clamp(camY, 0, WORLD_H - VIEW_H);
  return { x: camX, y: camY };
}

// ----------------------- Drawing -----------------------
function drawGround(cam) {
  ctx.fillStyle = "#2e7d32";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.fillStyle = "#276b2b";
  const startCol = Math.floor(cam.x / TILE);
  const startRow = Math.floor(cam.y / TILE);
  const colsVisible = Math.ceil(VIEW_W / TILE) + 1;
  const rowsVisible = Math.ceil(VIEW_H / TILE) + 1;

  for (let c = 0; c < colsVisible; c++) {
    for (let r = 0; r < rowsVisible; r++) {
      const col = startCol + c;
      const row = startRow + r;
      if ((col + row) % 2 === 0) {
        const sx = col * TILE - cam.x;
        const sy = row * TILE - cam.y;
        ctx.fillRect(sx, sy, TILE, TILE);
      }
    }
  }
}

function drawObstacles(cam) {
  for (const ob of obstacles) {
    const sx = ob.x - cam.x;
    const sy = ob.y - cam.y;
    if (sx + ob.w < 0 || sx > VIEW_W || sy + ob.h < 0 || sy > VIEW_H) continue;

    if (ob.type === "water") {
      ctx.fillStyle = "#1565c0";
      ctx.fillRect(sx, sy, ob.w, ob.h);
      ctx.fillStyle = "#1e88e5";
      ctx.fillRect(sx + 6, sy + 6, ob.w - 12, ob.h - 12);
    } else if (ob.type === "tree") {
      ctx.fillStyle = "#4e342e";
      ctx.fillRect(sx + ob.w / 2 - 4, sy + ob.h / 2, 8, ob.h / 2);
      ctx.fillStyle = "#1b5e20";
      ctx.beginPath();
      ctx.arc(sx + ob.w / 2, sy + ob.h / 2, ob.w / 2, 0, Math.PI * 2);
      ctx.fill();
    } else {
      ctx.fillStyle = "#757575";
      ctx.fillRect(sx, sy, ob.w, ob.h);
    }
  }
}

function drawTreasures(cam) {
  for (const t of treasures) {
    if (t.collected) continue;
    const sx = t.x - cam.x;
    const sy = t.y - cam.y;
    if (sx + t.w < 0 || sx > VIEW_W || sy + t.h < 0 || sy > VIEW_H) continue;

    ctx.fillStyle = "#ffd700";
    ctx.beginPath();
    ctx.arc(sx + t.w / 2, sy + t.h / 2, t.w / 2, 0, Math.PI * 2);
    ctx.fill();
    ctx.strokeStyle = "#b8860b";
    ctx.stroke();
  }
}

function drawNpcs(cam) {
  for (const npc of npcs) {
    const sx = npc.x - cam.x;
    const sy = npc.y - cam.y;
    if (sx < -40 || sx > VIEW_W + 40 || sy < -40 || sy > VIEW_H + 40) continue;

    ctx.fillStyle = npc.color;
    ctx.beginPath();
    ctx.arc(sx, sy, 16, 0, Math.PI * 2);
    ctx.fill();

    ctx.fillStyle = "#ffffff";
    ctx.font = "12px Trebuchet MS";
    ctx.textAlign = "center";
    ctx.fillText(npc.name, sx, sy - 24);

    if (nearbyNpc === npc && !activeDialogue) {
      ctx.fillStyle = "#ffe082";
      ctx.fillText("Press E to talk", sx, sy + 32);
    }
  }
}

function drawEnemies(cam) {
  for (const en of enemies) {
    const sx = en.x - cam.x;
    const sy = en.y - cam.y;
    if (sx + en.w < 0 || sx > VIEW_W || sy + en.h < 0 || sy > VIEW_H) continue;

    ctx.fillStyle = "#8e24aa";
    ctx.fillRect(sx, sy, en.w, en.h);
    ctx.strokeStyle = "#4a148c";
    ctx.strokeRect(sx, sy, en.w, en.h);

    ctx.fillStyle = "#ffffff";
    ctx.fillRect(sx + 6, sy + 8, 6, 4);
    ctx.fillRect(sx + en.w - 12, sy + 8, 6, 4);
  }
}

function drawPlayer(cam) {
  const sx = player.x - cam.x;
  const sy = player.y - cam.y;

  const flickerHidden = player.invincibleTimer > 0 && Math.floor(player.invincibleTimer * 12) % 2 === 0;
  if (flickerHidden) return;

  ctx.fillStyle = "#e53935";
  ctx.beginPath();
  ctx.roundRect(sx, sy, player.w, player.h, 8);
  ctx.fill();

  ctx.fillStyle = "#ffffff";
  ctx.beginPath();
  ctx.arc(sx + 10, sy + 13, 3, 0, Math.PI * 2);
  ctx.arc(sx + player.w - 10, sy + 13, 3, 0, Math.PI * 2);
  ctx.fill();
}

function drawHUD() {
  ctx.fillStyle = "#ffffff";
  ctx.font = "bold 18px Trebuchet MS";
  ctx.textAlign = "left";
  ctx.fillText(`Treasures: ${score} / ${treasures.length}`, 16, 28);

  ctx.fillText("Health:", 16, 54);
  for (let i = 0; i < player.maxHealth; i++) {
    ctx.fillStyle = i < player.health ? "#e53935" : "#4a4a4a";
    ctx.beginPath();
    ctx.arc(100 + i * 24, 48, 8, 0, Math.PI * 2);
    ctx.fill();
  }
}

function drawMinimap() {
  const mmW = 160;
  const mmH = Math.round((mmW * WORLD_H) / WORLD_W);
  const mmX = VIEW_W - mmW - 14;
  const mmY = 14;
  const scaleX = mmW / WORLD_W;
  const scaleY = mmH / WORLD_H;

  ctx.fillStyle = "rgba(0,0,0,0.5)";
  ctx.fillRect(mmX - 4, mmY - 4, mmW + 8, mmH + 8);
  ctx.fillStyle = "#1b5e20";
  ctx.fillRect(mmX, mmY, mmW, mmH);

  ctx.fillStyle = "#ffd700";
  for (const t of treasures) {
    if (t.collected) continue;
    ctx.fillRect(mmX + t.x * scaleX, mmY + t.y * scaleY, 2, 2);
  }

  ctx.fillStyle = "#8e24aa";
  for (const en of enemies) {
    ctx.fillRect(mmX + en.x * scaleX, mmY + en.y * scaleY, 3, 3);
  }

  ctx.fillStyle = "#42a5f5";
  for (const npc of npcs) {
    ctx.fillRect(mmX + npc.x * scaleX, mmY + npc.y * scaleY, 3, 3);
  }

  ctx.fillStyle = "#e53935";
  ctx.fillRect(mmX + player.x * scaleX - 1, mmY + player.y * scaleY - 1, 4, 4);
}

function drawDialogue() {
  if (!activeDialogue) return;
  const boxH = 110;
  const boxY = VIEW_H - boxH - 20;
  ctx.fillStyle = "rgba(20, 20, 30, 0.92)";
  ctx.fillRect(30, boxY, VIEW_W - 60, boxH);
  ctx.strokeStyle = "#ffd700";
  ctx.lineWidth = 2;
  ctx.strokeRect(30, boxY, VIEW_W - 60, boxH);

  ctx.fillStyle = "#ffd700";
  ctx.font = "bold 16px Trebuchet MS";
  ctx.textAlign = "left";
  ctx.fillText(activeDialogue.npc.name, 50, boxY + 30);

  ctx.fillStyle = "#ffffff";
  ctx.font = "16px Trebuchet MS";
  ctx.fillText(activeDialogue.npc.lines[activeDialogue.lineIndex], 50, boxY + 60);

  ctx.fillStyle = "#bbbbbb";
  ctx.font = "13px Trebuchet MS";
  ctx.fillText("Press E to continue...", 50, boxY + 90);
}

function drawGameOver() {
  ctx.fillStyle = "rgba(0,0,0,0.7)";
  ctx.fillRect(0, 0, VIEW_W, VIEW_H);

  ctx.fillStyle = "#e53935";
  ctx.font = "bold 48px Trebuchet MS";
  ctx.textAlign = "center";
  ctx.fillText("YOU WERE DEFEATED", VIEW_W / 2, VIEW_H / 2 - 10);

  ctx.fillStyle = "#ffffff";
  ctx.font = "20px Trebuchet MS";
  ctx.fillText(`Treasures collected: ${score} / ${treasures.length}`, VIEW_W / 2, VIEW_H / 2 + 30);
  ctx.fillText("Press R to try again", VIEW_W / 2, VIEW_H / 2 + 60);
}

function draw() {
  const cam = getCamera();
  drawGround(cam);
  drawObstacles(cam);
  drawTreasures(cam);
  drawNpcs(cam);
  drawEnemies(cam);
  drawPlayer(cam);
  drawHUD();
  drawMinimap();
  drawDialogue();

  if (gameState === "gameover") {
    drawGameOver();
  }
}

// ----------------------- Main loop -----------------------
function loop(now) {
  const dt = Math.min((now - lastTime) / 1000, 0.05); // clamp to avoid big jumps
  lastTime = now;

  update(dt);
  draw();

  requestAnimationFrame(loop);
}

startGame();
requestAnimationFrame(loop);

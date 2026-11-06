(() => {
  const canvas = document.getElementById("c");
  const ctx = canvas.getContext("2d");

  const $ = id => document.getElementById(id);

  const betInput = $("bet");
  const panel = $("panel");
  const picks = $("picks");

  let width;
  let height;
  let pixelRatio;

  let dieSize;
  let ropeLength;
  let anchor;
  let wall;

  let balance = 100;
  let pick = 0; // 1 = Wiener, 2 = Bun
  let rolling = false;
  let history = [];
  let mood = 0;
  let pendingRoll = null;
  let targetRotation = null;
  let result = "";

  const ropeSegments = 14;
  let ropePoints = [];

  let rotation = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  let angularVelocity = [0, 0, 0];

  let rollTime = 0;
  let settling = false;
  let pulse = 0;
  let shake = 0;

  let flicker = 1;
  let flickerTarget = 1;
  let flickerTimer = 0;

  let floatingTexts = [];
  let spray = [];
  let splats = [];
  let sprayState = { on: false, t: 0, dur: 0, acc: 0, p: 0 };

  let lastFrame = 0;
  let accumulator = 0;

  // Audio

  let audio;

  function getAudio() {
    if (!audio) {
      try {
        audio = new (window.AudioContext || window.webkitAudioContext)();
      } catch (error) {
        return null;
      }
    }

    return audio;
  }

  function playTone(startFreq, endFreq, duration, type, volume, delay = 0) {
    const sound = getAudio();
    if (!sound) return;

    const start = sound.currentTime + delay;
    const oscillator = sound.createOscillator();
    const gain = sound.createGain();

    oscillator.type = type;
    oscillator.frequency.setValueAtTime(startFreq, start);
    oscillator.frequency.exponentialRampToValueAtTime(endFreq, start + duration);

    gain.gain.setValueAtTime(volume, start);
    gain.gain.exponentialRampToValueAtTime(.001, start + duration);

    oscillator.connect(gain);
    gain.connect(sound.destination);

    oscillator.start(start);
    oscillator.stop(start + duration + .02);
  }

  function playNoise(duration, volume, frequency) {
    const sound = getAudio();
    if (!sound) return;

    const sampleCount = sound.sampleRate * duration | 0;
    const buffer = sound.createBuffer(1, sampleCount, sound.sampleRate);
    const samples = buffer.getChannelData(0);

    for (let i = 0; i < sampleCount; i++) {
      samples[i] = (Math.random() * 2 - 1) * (1 - i / sampleCount);
    }

    const source = sound.createBufferSource();
    const filter = sound.createBiquadFilter();
    const gain = sound.createGain();

    source.buffer = buffer;
    filter.type = "lowpass";
    filter.frequency.value = frequency;
    gain.gain.value = volume;

    source.connect(filter);
    filter.connect(gain);
    gain.connect(sound.destination);

    source.start();
  }

  function playThunk(volume = 1) {
    playTone(150, 40, .18, "sine", .7 * volume);
    playNoise(.08, .35 * volume, 900);
  }

  function playCashierSquirt(power = 1) {
    playNoise(.22, .18 * power, 1200);
    playTone(170, 85, .28, "sawtooth", .08 * power);
    playTone(400, 120, .2, "sine", .04 * power, .04);
  }

  // Scene setup

  function buildScene() {
    pixelRatio = Math.min(devicePixelRatio || 1, 2);
    width = innerWidth;
    height = innerHeight;

    canvas.width = width * pixelRatio;
    canvas.height = height * pixelRatio;

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);

    dieSize = Math.max(26, Math.min(44, Math.min(width, height) * .055));

    anchor = {
      x: width / 2,
      y: Math.max(60, height * .1)
    };

    ropeLength = Math.min(height * .3, 270) + dieSize * 1.1;

    const segmentLength = ropeLength / (ropeSegments - 1);
    ropePoints = [];

    for (let i = 0; i < ropeSegments; i++) {
      const y = anchor.y + i * segmentLength;

      ropePoints.push({
        x: anchor.x,
        y,
        previousX: anchor.x,
        previousY: y,
        weight: i === 0 ? 0 : (i === ropeSegments - 1 ? 1 / 7 : 1)
      });
    }

    makeWall();
  }

  function makeWall() {
    wall = document.createElement("canvas");
    wall.width = width * pixelRatio;
    wall.height = height * pixelRatio;

    const wallCtx = wall.getContext("2d");
    wallCtx.scale(pixelRatio, pixelRatio);

    const gradient = wallCtx.createLinearGradient(0, 0, 0, height);
    gradient.addColorStop(0, "#343a38");
    gradient.addColorStop(1, "#1e2322");

    wallCtx.fillStyle = gradient;
    wallCtx.fillRect(0, 0, width, height);

    for (let i = 0; i < 2600; i++) {
      const shade = Math.random() < .5 ? 0 : 255;
      const alpha = Math.random() * .05;

      wallCtx.fillStyle = `rgba(${shade},${shade},${shade},${alpha})`;
      wallCtx.fillRect(
        Math.random() * width,
        Math.random() * height,
        1 + Math.random() * 3,
        1 + Math.random() * 3
      );
    }

    wallCtx.strokeStyle = "rgba(0,0,0,.35)";
    wallCtx.lineWidth = 1.2;

    for (let i = 0; i < 3; i++) {
      let x = Math.random() * width;
      let y = height * (.45 + Math.random() * .5);

      wallCtx.beginPath();
      wallCtx.moveTo(x, y);

      for (let j = 0; j < 8; j++) {
        x += (Math.random() - .5) * 30;
        y -= 8 + Math.random() * 18;
        wallCtx.lineTo(x, y);
      }

      wallCtx.stroke();
    }

    wallCtx.save();
    wallCtx.translate(
      width * .5,
      Math.max(height - 240, anchor.y + ropeLength + dieSize * 4)
    );
    wallCtx.rotate(-.045);

    const fontSize = Math.max(26, Math.min(64, width * .09));

    wallCtx.font = `${fontSize}px "Permanent Marker", "Brush Script MT", cursive`;
    wallCtx.textAlign = "center";
    wallCtx.fillStyle = "#d6262c";
    wallCtx.shadowColor = "rgba(214,38,44,.5)";
    wallCtx.shadowBlur = 6;
    wallCtx.fillText("Circle K Kasino", 0, 0);

    wallCtx.shadowBlur = 0;
    wallCtx.strokeStyle = "#d6262c";
    wallCtx.lineWidth = 4;
    wallCtx.lineCap = "round";

    wallCtx.beginPath();

    const signWidth = fontSize * 3.7;

    wallCtx.moveTo(-signWidth / 2, fontSize * .2);
    wallCtx.quadraticCurveTo(0, fontSize * .35, signWidth / 2, fontSize * .12);
    wallCtx.stroke();

    wallCtx.globalAlpha = .8;
    wallCtx.fillStyle = "#e9e2d0";
    wallCtx.font = `${fontSize * .34}px "Permanent Marker", cursive`;
    wallCtx.fillText("★ open 24 hrs ★", 0, fontSize * .75);

    wallCtx.restore();
  }

  addEventListener("resize", buildScene);

  // Rotation math

  function multiplyMatrices(a, b) {
    const result = [];

    for (let row = 0; row < 3; row++) {
      for (let col = 0; col < 3; col++) {
        result.push(
          a[row * 3] * b[col] +
          a[row * 3 + 1] * b[3 + col] +
          a[row * 3 + 2] * b[6 + col]
        );
      }
    }

    return result;
  }

  function transposeMatrix(matrix) {
    return [
      matrix[0], matrix[3], matrix[6],
      matrix[1], matrix[4], matrix[7],
      matrix[2], matrix[5], matrix[8]
    ];
  }

  function rotateMatrix(matrix, x, y, z, delta) {
    const speed = Math.hypot(x, y, z);
    const angle = speed * delta;

    if (angle < 1e-9) return matrix;

    x /= speed;
    y /= speed;
    z /= speed;

    const cosine = Math.cos(angle);
    const sine = Math.sin(angle);
    const t = 1 - cosine;

    const turn = [
      t * x * x + cosine,
      t * x * y - sine * z,
      t * x * z + sine * y,

      t * x * y + sine * z,
      t * y * y + cosine,
      t * y * z - sine * x,

      t * x * z - sine * y,
      t * y * z + sine * x,
      t * z * z + cosine
    ];

    return multiplyMatrices(turn, matrix);
  }

  function normalizeMatrix(matrix) {
    let x = matrix.slice(0, 3);
    let y = matrix.slice(3, 6);

    const normalize = vector => {
      const length = Math.hypot(...vector) || 1;
      return vector.map(value => value / length);
    };

    x = normalize(x);

    const dot = x[0] * y[0] + x[1] * y[1] + x[2] * y[2];

    y = normalize(y.map((value, i) => value - dot * x[i]));

    return [
      ...x,
      ...y,
      x[1] * y[2] - x[2] * y[1],
      x[2] * y[0] - x[0] * y[2],
      x[0] * y[1] - x[1] * y[0]
    ];
  }

  // Which side of the hot dog faces us: 1 = wiener side, 2 = bun back
  function getFacing(matrix) {
    return matrix[8] > 0 ? 1 : 2;
  }

  // Rope and hot dog physics

  const fixedStep = 1 / 120;
  const gravity = 2200;

  // The string is tied straight to the middle of the hot dog
  function getDieCenter() {
    const end = ropePoints[ropeSegments - 1];

    return { x: end.x, y: end.y };
  }

  function updatePhysics() {
    for (const point of ropePoints) {
      if (!point.weight) continue;

      const velocityX = (point.x - point.previousX) * .996;
      const velocityY = (point.y - point.previousY) * .996;

      point.previousX = point.x;
      point.previousY = point.y;

      point.x += velocityX;
      point.y += velocityY + gravity * fixedStep * fixedStep;
    }

    const segmentLength = ropeLength / (ropeSegments - 1);

    for (let iteration = 0; iteration < 18; iteration++) {
      ropePoints[0].x = anchor.x;
      ropePoints[0].y = anchor.y;

      for (let i = 0; i < ropeSegments - 1; i++) {
        const a = ropePoints[i];
        const b = ropePoints[i + 1];

        const dx = b.x - a.x;
        const dy = b.y - a.y;
        const distance = Math.hypot(dx, dy) || 1e-6;
        const difference = (distance - segmentLength) / distance;
        const totalWeight = a.weight + b.weight;

        a.x += dx * difference * a.weight / totalWeight;
        a.y += dy * difference * a.weight / totalWeight;

        b.x -= dx * difference * b.weight / totalWeight;
        b.y -= dy * difference * b.weight / totalWeight;
      }
    }

    const center = getDieCenter();
    const end = ropePoints[ropeSegments - 1];
    const limit = dieSize * 1.7; // hot dog is longer than a die

    if (center.x < limit || center.x > width - limit) {
      const hitLeft = center.x < limit;
      const velocityX = end.x - end.previousX;

      end.x += hitLeft ? limit - center.x : width - limit - center.x;
      end.previousX = end.x + velocityX * .65;

      if (Math.abs(velocityX) > 2.5) {
        playThunk(Math.min(1, Math.abs(velocityX) / 10) * .7);
        shake = Math.max(shake, 4);
      }

      angularVelocity[1] += hitLeft ? -6 : 6;
    }

    if (center.y > height - limit - 110) {
      end.y -= center.y - (height - limit - 110);
      end.previousY = end.y + (end.y - end.previousY) * .5;
    }

    if (rolling) {
      const damping = settling
        ? Math.exp(-9 * fixedStep)
        : Math.exp(-1.7 * fixedStep);

      angularVelocity = angularVelocity.map(value => value * damping);

      rotation = rotateMatrix(
        rotation,
        angularVelocity[0],
        angularVelocity[1],
        angularVelocity[2],
        fixedStep
      );
    }
  }

  function settleDie(delta) {
    if (!rolling) return;

    rollTime += delta;

    const spinSpeed = Math.hypot(...angularVelocity);

    if (!settling && (rollTime > .9 || (rollTime > .4 && spinSpeed < 6))) {
      settling = true;
      targetRotation = pickTarget(rotation, pendingRoll.face);
    }

    if (!settling) return;

    const difference = multiplyMatrices(targetRotation, transposeMatrix(rotation));
    const trace = difference[0] + difference[4] + difference[8];

    const angle = Math.acos(Math.max(-1, Math.min(1, (trace - 1) / 2)));

    if (angle < .02 && spinSpeed < .8) {
      rotation = targetRotation;
      finishRoll();
      return;
    }

    if (angle < 1e-4) return;

    let axis = [
      difference[7] - difference[5],
      difference[2] - difference[6],
      difference[3] - difference[1]
    ];

    let axisLength = Math.hypot(...axis);

    if (axisLength < 1e-2) {
      let bestLength = -1;

      for (let i = 0; i < 3; i++) {
        const candidate = [
          difference[i] + (i === 0 ? 1 : 0),
          difference[3 + i] + (i === 1 ? 1 : 0),
          difference[6 + i] + (i === 2 ? 1 : 0)
        ];

        const length = Math.hypot(...candidate);

        if (length > bestLength) {
          bestLength = length;
          axis = candidate;
        }
      }

      axisLength = bestLength || 1;
    }

    const amount = 1 - Math.exp(-12 * delta);

    rotation = normalizeMatrix(
      rotateMatrix(
        rotation,
        axis[0] / axisLength,
        axis[1] / axisLength,
        axis[2] / axisLength,
        angle * amount
      )
    );
  }

  // Odds

  function randomBell() {
    return (Math.random() + Math.random() + Math.random() - 1.5) / 1.5;
  }

  // Pick the nearest resting orientation where the wanted side (1 = wiener,
  // 2 = bun) faces us and the hot dog lies flat (long way across or up/down).
  function pickTarget(currentRotation, face) {
    const permutations = [[0, 1, 2], [1, 0, 2]];
    const wantZ = face === 1 ? 1 : -1;

    let best = null;
    let bestScore = -9;

    for (const permutation of permutations) {
      for (let signs = 0; signs < 8; signs++) {
        const sign = [
          signs & 1 ? -1 : 1,
          signs & 2 ? -1 : 1,
          signs & 4 ? -1 : 1
        ];

        if (sign[2] !== wantZ) continue;

        const candidate = new Array(9).fill(0);

        for (let i = 0; i < 3; i++) {
          candidate[i * 3 + permutation[i]] = sign[i];
        }

        const determinant =
          candidate[0] * (candidate[4] * candidate[8] - candidate[5] * candidate[7]) -
          candidate[1] * (candidate[3] * candidate[8] - candidate[5] * candidate[6]) +
          candidate[2] * (candidate[3] * candidate[7] - candidate[4] * candidate[6]);

        if (determinant < 0) continue;

        const difference = multiplyMatrices(candidate, transposeMatrix(currentRotation));
        const score = difference[0] + difference[4] + difference[8];

        if (score > bestScore) {
          bestScore = score;
          best = candidate;
        }
      }
    }

    return best;
  }

  function decideRoll(bet) {
    const betRatio = Math.min(1, bet / Math.max(balance, 1));

    let chance = .49 - .15 * Math.pow(betRatio, .8) - Math.min(.05, bet / 3000);

    let streakScore = 0;
    let weight = 1;

    for (let i = history.length - 1, count = 0; i >= 0 && count < 6; i--, count++) {
      streakScore += (history[i] ? 1 : -1) * weight;
      weight *= .75;
    }

    if (streakScore > 0) {
      chance -= .035 * streakScore;
    }

    if (balance > 150) {
      chance -= Math.min(.08, (balance - 150) / 2500);
    }

    let losses = 0;

    for (let i = history.length - 1; i >= 0 && !history[i]; i--) {
      losses++;
    }

    if (losses >= 3 && Math.random() < .2 + .04 * Math.min(losses, 6)) {
      chance += .14 + Math.random() * .12;
    }

    if (balance < 30 && Math.random() < .3) {
      chance += .04;
    }

    mood = mood * .8 + randomBell() * .03;
    chance += mood + randomBell() * .035;
    chance = Math.max(.1, Math.min(.62, chance));

    const won = Math.random() < chance;
    let multiplier = 1;

    if (won && Math.random() < .02 + .06 * betRatio + .01 * Math.min(1, bet / 100)) {
      const roll = Math.random();
      multiplier = roll < .4 ? 3 : roll < .7 ? 4 : roll < .9 ? 5 : 8;
    }

    history.push(won);

    if (history.length > 20) {
      history.shift();
    }

    // 1 = wiener faces us, 2 = bun faces us
    const face = won ? pick : (pick === 1 ? 2 : 1);

    return { won, multiplier, bet, face };
  }

  // Squirt effect

  function projectPoint(point, center, size) {
    const x = rotation[0] * point[0] + rotation[1] * point[1] + rotation[2] * point[2];
    const y = rotation[3] * point[0] + rotation[4] * point[1] + rotation[5] * point[2];
    const z = rotation[6] * point[0] + rotation[7] * point[1] + rotation[8] * point[2];
    const factor = 900 / (900 - z * size);

    return [center.x + x * size * factor, center.y + y * size * factor, z];
  }

  function getNozzle() {
    return { x: width * .12, y: Math.min(height - 105, height * .62) };
  }

  // p = relative bet strength, 0..1
  function fireBlast(p) {
    const power = .3 + p * 1.7;

    sprayState = { on: true, t: 0, dur: .35 + p * .4, acc: 0, p };

    playTone(120 + power * 35, 45, .16 + power * .13, "sawtooth", .08 + power * .09);
    playNoise(sprayState.dur + .1, .12 + power * .16, 500 + power * 1300);

    if (power > 1.2) {
      shake = Math.max(shake, power * 3);
    }
  }

  function emitSpray(count, p) {
    const target = getDieCenter();
    const nozzle = getNozzle();

    const speed = 650 + p * 1700;
    const gravityPull = 900;

    const dx = target.x - nozzle.x;
    const dy = target.y - nozzle.y;
    const distance = Math.hypot(dx, dy) || 1;
    const flightTime = distance / speed;

    // aim high enough to cancel gravity drop
    const aim = Math.atan2(dy - .5 * gravityPull * flightTime * flightTime, dx);
    const spread = .16 - p * .1;

    for (let i = 0; i < count; i++) {
      const angle = aim + (Math.random() - .5) * spread;
      const velocity = speed * (.85 + Math.random() * .3);

      spray.push({
        x: nozzle.x,
        y: nozzle.y,
        px: nozzle.x,
        py: nozzle.y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        r: 2 + Math.random() * (2 + p * 3),
        life: 2
      });
    }
  }

  function distanceToSegment(px, py, a, b) {
    const abx = b[0] - a[0];
    const aby = b[1] - a[1];
    const lengthSquared = abx * abx + aby * aby || 1e-6;

    let t = ((px - a[0]) * abx + (py - a[1]) * aby) / lengthSquared;
    t = Math.max(0, Math.min(1, t));

    return Math.hypot(px - (a[0] + abx * t), py - (a[1] + aby * t));
  }

  // Stick a blob of the stuff onto the nearest visible surface of the hot dog.
  // Nearby hits merge into one growing pool.
  function addSplat(x, y, radius, p, center, size) {
    let best = null;
    let bestDistance = Infinity;

    for (const quad of hotdogQuads) {
      const n = quad.normal;
      const normalZ = rotation[6] * n[0] + rotation[7] * n[1] + rotation[8] * n[2];

      if (normalZ <= .05) continue;

      const point = projectPoint(quad.mid, center, size);
      const distance = Math.hypot(point[0] - x, point[1] - y);

      if (distance < bestDistance) {
        bestDistance = distance;
        best = quad;
      }
    }

    if (!best) return;

    const pos = [
      best.mid[0] + (Math.random() - .5) * .25 + best.normal[0] * .03,
      best.mid[1] + best.normal[1] * .03,
      best.mid[2] + best.normal[2] * .03
    ];

    const r = radius * (1 + p * 1.2);

    for (const other of splats) {
      const dot =
        other.normal[0] * best.normal[0] +
        other.normal[1] * best.normal[1] +
        other.normal[2] * best.normal[2];

      if (dot < .5) continue;

      const d = Math.hypot(
        other.pos[0] - pos[0],
        other.pos[1] - pos[1],
        other.pos[2] - pos[2]
      );

      if (d < other.r / size * 1.1) {
        // pool them: more mass, thicker, slides further
        other.r = Math.min(size * .5, Math.sqrt(other.r * other.r + r * r * .45));
        other.mass += 1;
        other.slideMax = Math.min(size * 3.2, other.slideMax + r * .9);
        other.v += 5 + p * 9;
        other.life = other.maxLife;
        return;
      }
    }

    const life = 5 + Math.random() * 2;

    splats.push({
      pos,
      normal: best.normal,
      r,
      mass: 1,
      life,
      maxLife: life,
      slide: 0,
      v: 4 + Math.random() * 10,
      slideMax: r * (2.5 + Math.random() * 4),
      blobs: [
        { ox: (Math.random() - .5) * 1.5, oy: (Math.random() - .5) * 1.2, r: .45 + Math.random() * .35 },
        { ox: (Math.random() - .5) * 1.7, oy: (Math.random() - .5) * 1.3, r: .4 + Math.random() * .35 },
        { ox: (Math.random() - .5) * 1.3, oy: (Math.random() - .5) * 1.5, r: .35 + Math.random() * .3 }
      ]
    });

    if (splats.length > 260) {
      splats.splice(0, splats.length - 260);
    }
  }

  function updateBlast(delta) {
    const state = sprayState;

    if (state.on) {
      state.t += delta;
      state.acc += (60 + state.p * 420) * delta;

      const count = Math.floor(state.acc);
      state.acc -= count;

      emitSpray(count, state.p);

      if (state.t > state.dur) state.on = false;

      shake = Math.max(shake, state.p * 6);
    }

    const center = getDieCenter();
    const size = dieSize * (1 + pulse * .1);
    const endA = projectPoint([-1.5, 0, 0], center, size);
    const endB = projectPoint([1.5, 0, 0], center, size);
    const hitRadius = size * .95 + 6;
    const rope = ropePoints[ropeSegments - 1];

    const steps = 3;
    const h = delta / steps;

    for (const drop of spray) {
      for (let s = 0; s < steps && drop.life > 0; s++) {
        drop.px = drop.x;
        drop.py = drop.y;

        drop.vy += 900 * h;
        drop.x += drop.vx * h;
        drop.y += drop.vy * h;
        drop.life -= h;

        if (distanceToSegment(drop.x, drop.y, endA, endB) < hitRadius) {
          addSplat(drop.x, drop.y, drop.r, state.p, center, size);

          // each hit shoves the hot dog and spins it a touch
          const kick = .0009 * (.4 + state.p) * fixedStep;

          rope.previousX -= drop.vx * kick * 120;
          rope.previousY -= drop.vy * kick * 120;

          for (let i = 0; i < 3; i++) {
            angularVelocity[i] += (Math.random() - .5) * .12 * (.3 + state.p);
          }

          drop.life = 0;
        }
      }
    }

    spray = spray.filter(drop => drop.life > 0 && drop.y < height + 50);

    for (const splat of splats) {
      splat.life -= delta;

      // thick liquid creeps downward, slowing as it goes
      splat.slide = Math.min(splat.slideMax, splat.slide + splat.v * delta);
      splat.v *= Math.exp(-.5 * delta);
    }

    splats = splats.filter(splat => splat.life > 0);
  }

  // Goo is rendered as a height field: soft blobs are summed in a small
  // offscreen buffer, thresholded into one connected liquid surface, then
  // lit from the slope so it reads as thick, wet and glossy.
  const gooField = document.createElement("canvas");
  const gooFieldCtx = gooField.getContext("2d", { willReadFrequently: true });
  const gooOut = document.createElement("canvas");
  const gooOutCtx = gooOut.getContext("2d");
  const gooSprite = document.createElement("canvas");
  gooSprite.width = gooSprite.height = 64;

  {
    const g = gooSprite.getContext("2d");
    const gradient = g.createRadialGradient(32, 32, 0, 32, 32, 32);

    gradient.addColorStop(0, "rgba(255,255,255,1)");
    gradient.addColorStop(.45, "rgba(255,255,255,.6)");
    gradient.addColorStop(1, "rgba(255,255,255,0)");

    g.fillStyle = gradient;
    g.fillRect(0, 0, 64, 64);
  }

  function drawSplats() {
    if (!splats.length) return;

    const center = getDieCenter();
    const size = dieSize * (1 + pulse * .1);
    const G = .6;
    const E = Math.ceil(size * 2.7 + 100);
    const side = Math.ceil(2 * E * G);

    if (gooField.width !== side) {
      gooField.width = gooField.height = side;
      gooOut.width = gooOut.height = side;
    }

    gooFieldCtx.clearRect(0, 0, side, side);
    gooFieldCtx.globalCompositeOperation = "lighter";

    const stamp = (x, y, radius, strength) => {
      if (radius < .5 || strength <= 0) return;

      gooFieldCtx.globalAlpha = strength;
      gooFieldCtx.drawImage(gooSprite, x - radius, y - radius, radius * 2, radius * 2);
    };

    let any = false;

    for (const splat of splats) {
      const n = splat.normal;
      const normalZ = rotation[6] * n[0] + rotation[7] * n[1] + rotation[8] * n[2];

      if (normalZ <= .02) continue;

      const point = projectPoint(splat.pos, center, size);
      const x = (point[0] - center.x + E) * G;
      const y = (point[1] - center.y + E) * G;

      const age = splat.maxLife - splat.life;
      const spread = 1 - Math.exp(-age * 4);
      const R = splat.r * (.7 + .4 * spread) * (.85 + normalZ * .3) * G;
      const fade = Math.min(1, splat.life / 1.5);
      const k = .5 * fade;
      const slide = splat.slide * G;

      any = true;

      // pooled body
      stamp(x, y, R * 1.9, k);

      for (const blob of splat.blobs) {
        stamp(x + blob.ox * R, y + blob.oy * R * .8, R * 1.5 * blob.r * 1.6, k * .8);
      }

      // trail left behind: thin, slightly wobbly, then a fat leading bulge
      if (slide > 1) {
        const step = Math.max(1.5, R * .4);

        for (let t = step; t < slide; t += step) {
          const f = t / slide;
          const wobble = Math.sin(t * .35 + splat.pos[0] * 9) * R * .08;

          stamp(x + wobble, y + t, R * (1.05 - .3 * f), k * .55);
        }

        const head = R * (1.3 + Math.min(.6, splat.mass * .06));

        stamp(x, y + slide, head, k * 1.1);
      }
    }

    gooFieldCtx.globalAlpha = 1;
    gooFieldCtx.globalCompositeOperation = "source-over";

    if (!any) return;

    const input = gooFieldCtx.getImageData(0, 0, side, side);
    const field = input.data;
    const output = gooOutCtx.createImageData(side, side);
    const out = output.data;

    const height = (px, py) => {
      px = px < 0 ? 0 : px >= side ? side - 1 : px;
      py = py < 0 ? 0 : py >= side ? side - 1 : py;
      return field[(py * side + px) * 4 + 3] / 255;
    };

    for (let py = 0; py < side; py++) {
      for (let px = 0; px < side; px++) {
        const h = height(px, py);

        if (h < .2) continue;

        // sharp-but-smooth threshold = connected liquid edge
        let mask = (h - .2) / .1;
        mask = mask > 1 ? 1 : mask;
        mask = mask * mask * (3 - 2 * mask);

        const gx = height(px + 1, py) - height(px - 1, py);
        const gy = height(px, py + 1) - height(px, py - 1);

        // light from the upper left
        const slope = -gx * .8 - gy * 1.1;
        const lit = Math.max(.62, Math.min(1.08, .86 + slope * 2.6));
        const thick = Math.min(1, h * 1.1);

        // thicker liquid is creamier, thin edges are more translucent
        let r = 236 * lit + 10 * thick;
        let g = 231 * lit + 8 * thick;
        let b = 208 * lit;

        // wet specular glints on slopes facing the light
        const spec = Math.max(0, Math.min(1, slope * 9 - .45));

        r += spec * 160;
        g += spec * 160;
        b += spec * 170;

        const i = (py * side + px) * 4;

        out[i] = r > 255 ? 255 : r;
        out[i + 1] = g > 255 ? 255 : g;
        out[i + 2] = b > 255 ? 255 : b;
        out[i + 3] = mask * (.82 + .16 * thick) * 255;
      }
    }

    gooOutCtx.putImageData(output, 0, 0);

    ctx.save();
    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    // faint contact shadow so it sits on the hot dog
    ctx.globalAlpha = .35;
    ctx.shadowColor = "rgba(60,40,20,.9)";
    ctx.shadowBlur = 4;
    ctx.shadowOffsetX = 1.5;
    ctx.shadowOffsetY = 2;
    ctx.drawImage(gooOut, center.x - E, center.y - E, E * 2, E * 2);

    ctx.globalAlpha = 1;
    ctx.shadowColor = "transparent";
    ctx.shadowBlur = 0;
    ctx.shadowOffsetX = 0;
    ctx.shadowOffsetY = 0;
    ctx.drawImage(gooOut, center.x - E, center.y - E, E * 2, E * 2);
    ctx.restore();
  }

  function drawBlast() {
    if (!spray.length && !sprayState.on) return;

    ctx.save();
    ctx.lineCap = "round";
    ctx.shadowColor = "rgba(255,255,240,.6)";
    ctx.shadowBlur = 6 + sprayState.p * 10;
    ctx.strokeStyle = "rgba(252,250,238,.95)";

    for (const drop of spray) {
      ctx.lineWidth = drop.r;
      ctx.beginPath();
      ctx.moveTo(drop.px, drop.py);
      ctx.lineTo(drop.x, drop.y);
      ctx.stroke();
    }

    ctx.shadowBlur = 0;

    if (sprayState.on) {
      const nozzle = getNozzle();

      ctx.fillStyle = "#cfcfcf";
      ctx.beginPath();
      ctx.arc(nozzle.x, nozzle.y, 8 + sprayState.p * 6, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // String tail + knot drawn over the hot dog so it's visibly tied to it
  function drawRopeTail() {
    const end = ropePoints[ropeSegments - 1];

    ctx.save();
    ctx.lineCap = "round";
    ctx.lineJoin = "round";

    ctx.strokeStyle = "#d9d0bc";
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(ropePoints[ropeSegments - 4].x, ropePoints[ropeSegments - 4].y);

    for (let i = ropeSegments - 3; i < ropeSegments; i++) {
      ctx.lineTo(ropePoints[i].x, ropePoints[i].y);
    }

    ctx.stroke();

    // screw eye
    ctx.strokeStyle = "#8f8f8f";
    ctx.lineWidth = 2.2;
    ctx.beginPath();
    ctx.arc(end.x, end.y, 5, 0, Math.PI * 2);
    ctx.stroke();

    // knot
    ctx.fillStyle = "#cfc6b0";
    ctx.strokeStyle = "rgba(0,0,0,.45)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.arc(end.x, end.y - 4, 3.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.stroke();

    ctx.restore();
  }

  // Messages and balance

  function say(message, type = "") {
    const messageBox = $("msg");
    messageBox.textContent = message;
    messageBox.className = type;
  }

  function clampBet() {
    const amount = Math.max(1, Math.floor(Number(betInput.value) || 1));
    betInput.value = Math.min(amount, Math.max(1, balance));
  }

  function updateUI() {
    $("bal").textContent = balance.toLocaleString();
    $("beg").style.display = balance < 1 && !rolling ? "inline-block" : "none";

    if (balance > 0) {
      clampBet();
    }
  }

  function showFloatingText(message, x, y, color) {
    floatingTexts.push({
      message,
      x,
      y,
      color,
      life: 1.4
    });
  }

  function showError(message) {
    say(message);

    panel.classList.remove("shake");
    void panel.offsetWidth;
    panel.classList.add("shake");
  }

  // Starting and finishing a roll

  function startRoll() {
    getAudio();

    let bet = Math.max(1, Math.floor(Number(betInput.value) || 1));

    if (!pick) {
      showError("Pick Wiener or Bun first.");
      return;
    }

    if (balance < 1) {
      showError("You are broke. Beg the cashier for a squirt.");
      return;
    }

    if (bet > balance) {
      bet = balance;
      betInput.value = balance;
    }

    const betRatio = Math.min(1, bet / Math.max(balance, 1));
    const power = .3 + Math.pow(betRatio, .72) * 1.7;

    pendingRoll = decideRoll(bet);
    balance -= bet;

    rolling = true;
    settling = false;
    rollTime = 0;

    updateUI();

    if (power < .8) {
      say("A pathetic little squirt…");
    } else if (power < 1.35) {
      say("A decent blast!");
    } else if (power < 1.8) {
      say("A BIG SQUIRT!");
    } else {
      say("FULL BLAST!");
    }

    fireBlast(Math.max(.05, Math.pow(betRatio, .72)));

    const direction = Math.random() < .5 ? -1 : 1;
    const force = (3 + power * 8) * (.75 + Math.random() * .5);

    for (let i = 1; i <= 4; i++) {
      const point = ropePoints[ropeSegments - i];
      const amount = i === 1 ? 1 : .45 / i;

      point.previousX = point.x - direction * force * amount * (.7 + Math.random() * .6);
      point.previousY = point.y + (3 + power * 7 + Math.random() * power * 5) * amount;
    }

    const spin = 4 + power * 11 + Math.random() * power * 5;

    let x = Math.random() * 2 - 1;
    let y = Math.random() * 2 - 1;
    let z = Math.random() * 2 - 1;

    const length = Math.hypot(x, y, z) || 1;

    angularVelocity = [
      x / length * spin,
      y / length * spin,
      z / length * spin
    ];
  }

  function finishRoll() {
    rolling = false;
    settling = false;

    result = getFacing(rotation) === 1 ? "Wiener" : "Bun";
    angularVelocity = [0, 0, 0];

    playThunk();
    pulse = 1;
    shake = 7;

    const end = ropePoints[ropeSegments - 1];
    end.previousY = end.y - (Math.random() < .5 ? -1 : 1) * 2.2;

    const center = getDieCenter();
    const bet = pendingRoll.bet;

    if (pendingRoll.won) {
      const winnings = bet * pendingRoll.multiplier;
      const jackpot = pendingRoll.multiplier > 1;

      balance += bet + winnings;

      if (jackpot) {
        say(
          `JACKPOT! ${result}! ×${pendingRoll.multiplier} — a firehose of ${winnings} squirts!`,
          "win"
        );
      } else {
        say(`${result}! You won ${winnings} squirts.`, "win");
      }

      showFloatingText(
        `+${winnings} squirts`,
        center.x,
        center.y - dieSize * 1.8,
        "#f3c34a"
      );

      if (jackpot) {
        shake = 18;
      }

      const notes = jackpot
        ? [523, 659, 784, 1047, 1319, 1568]
        : [523, 659, 784, 1047];

      notes.forEach((frequency, i) => {
        playTone(
          frequency,
          frequency * 1.01,
          .22,
          "triangle",
          .18,
          i * (jackpot ? .07 : .09)
        );
      });
    } else {
      say(`It landed ${result}. The house keeps your ${bet} squirts.`, "lose");

      showFloatingText(
        `−${bet} squirts`,
        center.x,
        center.y - dieSize * 1.8,
        "#ff7b80"
      );

      playTone(130, 70, .35, "sawtooth", .12);
    }

    updateUI();
  }

  // Controls

  for (const [label, value] of [["WIENER", 1], ["BUN", 2]]) {
    const button = document.createElement("button");

    button.textContent = label;

    button.onclick = () => {
      pick = value;

      for (const other of picks.children) {
        other.classList.toggle("sel", other === button);
      }
    };

    picks.appendChild(button);
  }

  picks.firstChild.click();

  betInput.addEventListener("change", clampBet);

  document.querySelectorAll("[data-q]").forEach(button => {
    button.onclick = () => {
      const amount = button.dataset.q;

      if (amount === "max") {
        betInput.value = Math.max(1, balance);
      } else if (amount === "25%") {
        betInput.value = Math.max(1, Math.floor(balance * .25));
      } else if (amount === "50%") {
        betInput.value = Math.max(1, Math.floor(balance * .5));
      }

      clampBet();
    };
  });

  $("beg").onclick = () => {
    if (balance > 0 || rolling) return;

    balance += 100;
    playCashierSquirt(.8);
    updateUI();

    say("The cashier reluctantly squirts some cum into your wallet.");
  };

  canvas.addEventListener("pointerdown", event => {
    const center = getDieCenter();
    const distance = Math.hypot(event.clientX - center.x, event.clientY - center.y);

    if (distance < dieSize * 2.6 && !rolling) {
      startRoll();
    }
  });

  // Hot dog mesh (built once, in local units; long axis = X, wiener side = +Z)

  const BUN_TOP = [238, 190, 110];
  const BUN_SIDE = [226, 168, 88];
  const BUN_BACK = [190, 130, 62];
  const WIENER = [206, 70, 50];

  const hotdogQuads = [];

  function addTube(cy, cz, ry, rz, halfLen, colorFn, nu, nt) {
    const profile = u => Math.sqrt(Math.max(0, 1 - Math.pow(Math.abs(u), 6)));

    const vertex = (u, t) => {
      const s = profile(u);

      return [
        u * halfLen,
        cy + ry * s * Math.cos(t),
        cz + rz * s * Math.sin(t)
      ];
    };

    for (let i = 0; i < nu; i++) {
      const u0 = -1 + 2 * i / nu;
      const u1 = -1 + 2 * (i + 1) / nu;
      const um = (u0 + u1) / 2;

      for (let j = 0; j < nt; j++) {
        const t0 = j / nt * Math.PI * 2;
        const t1 = (j + 1) / nt * Math.PI * 2;
        const tm = (t0 + t1) / 2;

        const points = [
          vertex(u0, t0),
          vertex(u1, t0),
          vertex(u1, t1),
          vertex(u0, t1)
        ];

        let nx = Math.sign(um) * Math.pow(Math.abs(um), 5) * 8;
        let ny = Math.cos(tm) / ry;
        let nz = Math.sin(tm) / rz;

        const nl = Math.hypot(nx, ny, nz) || 1;

        const mid = [
          (points[0][0] + points[2][0]) / 2,
          (points[0][1] + points[2][1]) / 2,
          (points[0][2] + points[2][2]) / 2
        ];

        hotdogQuads.push({
          points,
          mid,
          normal: [nx / nl, ny / nl, nz / nl],
          color: colorFn(Math.sin(tm), Math.cos(tm))
        });
      }
    }
  }

  // bun
  addTube(0, -.1, .66, .5, 1.55, (sinT, cosT) => {
    if (sinT < -.35) return BUN_BACK;
    if (sinT > .45) return BUN_TOP;
    return BUN_SIDE;
  }, 14, 16);

  // wiener (sticks out of both ends)
  addTube(0, .42, .32, .3, 1.9, () => WIENER, 16, 14);

  const lightDirection = (() => {
    const vector = [-.4, -.7, .6];
    const length = Math.hypot(...vector);
    return vector.map(value => value / length);
  })();

  function drawTape(x, y, tapeWidth, tapeHeight, angle) {
    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(angle);

    ctx.fillStyle = "rgba(222,206,150,.62)";
    ctx.strokeStyle = "rgba(255,255,255,.18)";

    ctx.beginPath();
    ctx.moveTo(-tapeWidth / 2, -tapeHeight / 2);

    for (let i = 0; i <= 4; i++) {
      ctx.lineTo(
        tapeWidth / 2 + (i % 2 ? 3 : -1),
        -tapeHeight / 2 + i * tapeHeight / 4
      );
    }

    ctx.lineTo(-tapeWidth / 2, tapeHeight / 2);

    for (let i = 4; i >= 0; i--) {
      ctx.lineTo(
        -tapeWidth / 2 + (i % 2 ? -3 : 1),
        -tapeHeight / 2 + i * tapeHeight / 4
      );
    }

    ctx.closePath();
    ctx.fill();
    ctx.stroke();

    ctx.fillStyle = "rgba(255,255,255,.12)";
    ctx.fillRect(-tapeWidth / 2, -tapeHeight / 2, tapeWidth, tapeHeight * .3);

    ctx.restore();
  }

  function drawRope(offset, color, thickness) {
    ctx.beginPath();
    ctx.moveTo(
      ropePoints[0].x + offset,
      ropePoints[0].y + offset * 1.3
    );

    for (let i = 1; i < ropeSegments - 1; i++) {
      const a = ropePoints[i];
      const b = ropePoints[i + 1];

      ctx.quadraticCurveTo(
        a.x + offset,
        a.y + offset * 1.3,
        (a.x + b.x) / 2 + offset,
        (a.y + b.y) / 2 + offset * 1.3
      );
    }

    const end = ropePoints[ropeSegments - 1];

    ctx.lineTo(end.x + offset, end.y + offset * 1.3);
    ctx.strokeStyle = color;
    ctx.lineWidth = thickness;
    ctx.lineCap = "round";
    ctx.stroke();
  }

  function drawHotDog() {
    const center = getDieCenter();
    const scale = 1 + pulse * .1;
    const size = dieSize * scale;
    const perspective = 900;

    const project = point => {
      const x =
        rotation[0] * point[0] +
        rotation[1] * point[1] +
        rotation[2] * point[2];

      const y =
        rotation[3] * point[0] +
        rotation[4] * point[1] +
        rotation[5] * point[2];

      const z =
        rotation[6] * point[0] +
        rotation[7] * point[1] +
        rotation[8] * point[2];

      const factor = perspective / (perspective - z * size);

      return [
        center.x + x * size * factor,
        center.y + y * size * factor,
        z
      ];
    };

    const shadow = ctx.createRadialGradient(
      center.x + 10,
      center.y + 14,
      size * .3,
      center.x + 10,
      center.y + 14,
      size * 2.2
    );

    shadow.addColorStop(0, "rgba(0,0,0,.55)");
    shadow.addColorStop(1, "rgba(0,0,0,0)");

    ctx.fillStyle = shadow;
    ctx.fillRect(
      center.x - size * 4,
      center.y - size * 4,
      size * 8,
      size * 8
    );

    const visible = [];

    for (const quad of hotdogQuads) {
      const n = quad.normal;

      const normalZ =
        rotation[6] * n[0] + rotation[7] * n[1] + rotation[8] * n[2];

      if (normalZ <= 0) continue;

      const normalX =
        rotation[0] * n[0] + rotation[1] * n[1] + rotation[2] * n[2];

      const normalY =
        rotation[3] * n[0] + rotation[4] * n[1] + rotation[5] * n[2];

      const light = Math.max(
        0,
        normalX * lightDirection[0] +
        normalY * lightDirection[1] +
        normalZ * lightDirection[2]
      );

      const depth =
        rotation[6] * quad.mid[0] +
        rotation[7] * quad.mid[1] +
        rotation[8] * quad.mid[2];

      visible.push({ quad, light, depth });
    }

    visible.sort((a, b) => a.depth - b.depth);

    ctx.lineJoin = "round";
    ctx.lineWidth = 1.2;

    for (const { quad, light } of visible) {
      const brightness = (.35 + .75 * light) * (.55 + .45 * flicker);

      const r = Math.min(255, quad.color[0] * brightness | 0);
      const g = Math.min(255, quad.color[1] * brightness | 0);
      const b = Math.min(255, quad.color[2] * brightness | 0);

      const color = `rgb(${r},${g},${b})`;

      ctx.beginPath();

      for (let i = 0; i < 4; i++) {
        const point = project(quad.points[i]);

        if (i === 0) {
          ctx.moveTo(point[0], point[1]);
        } else {
          ctx.lineTo(point[0], point[1]);
        }
      }

      ctx.closePath();
      ctx.fillStyle = color;
      ctx.strokeStyle = color;
      ctx.fill();
      ctx.stroke();
    }
  }

  // Main drawing

  function draw(delta) {
    flickerTimer -= delta;

    if (flickerTimer <= 0) {
      if (Math.random() < .025) {
        flickerTarget = .25 + Math.random() * .45;
        flickerTimer = .03 + Math.random() * .12;
      } else {
        flickerTarget = .93 + Math.random() * .07;
        flickerTimer = .04;
      }
    }

    flicker += (flickerTarget - flicker) * Math.min(1, delta * 40);

    ctx.setTransform(pixelRatio, 0, 0, pixelRatio, 0, 0);
    ctx.clearRect(0, 0, width, height);

    ctx.save();

    if (shake > .1) {
      ctx.translate(
        (Math.random() - .5) * shake,
        (Math.random() - .5) * shake
      );

      shake *= .86;
    }

    ctx.drawImage(wall, 0, 0, width, height);

    drawRope(7, "rgba(0,0,0,.35)", 3);
    drawRope(0, "#d9d0bc", 2.6);

    drawTape(anchor.x, anchor.y - 2, 54, 20, -.2);
    drawTape(anchor.x + 3, anchor.y + 4, 46, 18, .35);

    drawHotDog();
    drawSplats();
    drawRopeTail();
    drawBlast();

    for (const text of floatingTexts) {
      text.life -= delta;
      text.y -= delta * 40;

      ctx.globalAlpha = Math.max(0, Math.min(1, text.life));
      ctx.fillStyle = text.color;
      ctx.font = "800 28px system-ui";
      ctx.textAlign = "center";
      ctx.fillText(text.message, text.x, text.y);
    }

    ctx.globalAlpha = 1;
    floatingTexts = floatingTexts.filter(text => text.life > 0);

    const lightX = width / 2;
    const lightY = -height * .05;
    const radius = Math.max(width, height) * .95;
    const darkness = 1 - flicker;

    const darknessGradient = ctx.createRadialGradient(
      lightX,
      lightY,
      radius * .05,
      lightX,
      lightY,
      radius
    );

    darknessGradient.addColorStop(0, `rgba(0,0,0,${.05 + darkness * .7})`);
    darknessGradient.addColorStop(.55, `rgba(0,0,0,${.55 + darkness * .4})`);
    darknessGradient.addColorStop(1, `rgba(0,0,0,${.93 + darkness * .07})`);

    ctx.fillStyle = darknessGradient;
    ctx.fillRect(-20, -20, width + 40, height + 40);

    ctx.globalCompositeOperation = "screen";

    const wallGlow = ctx.createRadialGradient(
      lightX,
      anchor.y + ropeLength * .5,
      0,
      lightX,
      anchor.y + ropeLength * .5,
      radius * .55
    );

    wallGlow.addColorStop(0, `rgba(255,226,150,${.12 * flicker})`);
    wallGlow.addColorStop(1, "rgba(255,226,150,0)");

    ctx.fillStyle = wallGlow;
    ctx.fillRect(0, 0, width, height);

    ctx.globalCompositeOperation = "source-over";
    ctx.restore();
  }

  // Animation loop

  function frame(time) {
    const delta = Math.min(.05, (time - lastFrame) / 1000 || 0);

    lastFrame = time;
    accumulator += delta;

    while (accumulator >= fixedStep) {
      updatePhysics();
      accumulator -= fixedStep;
    }

    settleDie(delta);
    updateBlast(delta);

    pulse *= Math.exp(-7 * delta);

    draw(delta);
    requestAnimationFrame(frame);
  }

  // Start

  buildScene();

  rotation = normalizeMatrix(
    rotateMatrix(
      [1, 0, 0, 0, 1, 0, 0, 0, 1],
      .5,
      .8,
      .2,
      1
    )
  );

  updateUI();
  requestAnimationFrame(frame);
})();
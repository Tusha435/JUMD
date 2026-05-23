// Weapon definitions: per-weapon move stats, signature special, and
// procedural drawing (no assets). Exposed globally as `Weapons`.
(function () {
  // Move stat shape: startup -> active -> recovery (frames), reach/top/h
  // describe the hitbox, dmg/kb/meter the effect, optional launch (juggle).
  const M = (startup, active, recovery, reach, top, h, dmg, kb, meter, extra) =>
    Object.assign({ startup, active, recovery, reach, top, h, dmg, kb, meter }, extra || {});

  const defs = {
    fists: {
      name: 'FISTS',
      moves: {
        light: M(4, 4, 9, 52, -48, 22, 7, 5, 7),
        heavy: M(6, 5, 14, 64, -30, 26, 11, 9, 9),
        launcher: M(5, 6, 18, 46, -64, 80, 9, 3, 14, { launch: 17 }),
      },
      special: null,
    },
    sword: {
      name: 'SWORD',
      reach: 44,
      moves: {
        light: M(5, 5, 11, 80, -56, 44, 11, 6, 8, { slash: true }),
        heavy: M(9, 6, 18, 88, -66, 66, 18, 11, 10, { slash: true }),
        launcher: M(6, 6, 18, 56, -72, 92, 12, 3, 12, { launch: 18, slash: true }),
      },
      // Blade wave: a crescent projectile launched forward.
      special: { kind: 'blade', frame: 8, dur: 28, cd: 34, air: false },
    },
    knife: {
      name: 'KNIFE',
      reach: 20,
      moves: {
        light: M(3, 3, 6, 42, -46, 18, 5, 3, 9, { fast: true }),
        heavy: M(5, 4, 10, 60, -46, 20, 9, 6, 9, { lunge: true }),
        launcher: M(5, 5, 16, 44, -66, 80, 8, 3, 12, { launch: 16 }),
      },
      // Throw: fast small projectile; usable in the air, short cooldown.
      special: { kind: 'knife', frame: 5, dur: 15, cd: 12, air: true },
    },
    staff: {
      name: 'STAFF',
      reach: 40,
      moves: {
        light: M(5, 5, 10, 86, -48, 26, 8, 6, 8),
        heavy: M(8, 7, 18, 94, -42, 52, 14, 13, 10, { sweep: true }),
        launcher: M(6, 6, 18, 50, -72, 96, 10, 3, 12, { launch: 19 }),
      },
      // Spin: 360 twirl that hits both sides and reflects projectiles.
      special: { kind: 'spin', dur: 30, active: [4, 26], cd: 28, air: false,
                 reach: 70, top: -64, h: 96, dmg: 6, kb: 8, meter: 3 },
    },
  };

  const order = ['fists', 'sword', 'knife', 'staff'];

  function next(weapon) {
    const i = order.indexOf(weapon);
    return order[(i + 1) % order.length];
  }

  // --- Drawing ---------------------------------------------------------
  // hand: world {x,y}; ang: blade orientation (radians); facing: +1/-1.
  // glow: 0..1 highlight when a special is active.
  function draw(ctx, weapon, hand, ang, facing, glow) {
    if (weapon === 'fists') return;
    ctx.save();
    ctx.translate(hand.x, hand.y);
    ctx.rotate(ang);
    if (glow) {
      ctx.shadowColor = '#bfe0ff';
      ctx.shadowBlur = 10 + glow * 12;
    }
    if (weapon === 'sword') drawSword(ctx);
    else if (weapon === 'knife') drawKnife(ctx);
    else if (weapon === 'staff') drawStaff(ctx);
    ctx.restore();
  }

  function blade(ctx, len, halfW, color) {
    ctx.fillStyle = color;
    ctx.beginPath();
    ctx.moveTo(-4, -halfW);
    ctx.lineTo(len - 8, -halfW * 0.6);
    ctx.lineTo(len, 0);          // pointed tip
    ctx.lineTo(len - 8, halfW * 0.6);
    ctx.lineTo(-4, halfW);
    ctx.closePath();
    ctx.fill();
    // Edge highlight.
    ctx.strokeStyle = '#ffffff';
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(-2, -halfW * 0.4);
    ctx.lineTo(len - 6, -halfW * 0.2);
    ctx.stroke();
  }

  function drawSword(ctx) {
    // Handle behind the hand.
    ctx.strokeStyle = '#5b3a1a';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-12, 0);
    ctx.stroke();
    // Cross-guard.
    ctx.strokeStyle = '#caa14a';
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.moveTo(0, -7);
    ctx.lineTo(0, 7);
    ctx.stroke();
    blade(ctx, 46, 4.5, '#dde7f3');
  }

  function drawKnife(ctx) {
    ctx.strokeStyle = '#3a2a1a';
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(0, 0);
    ctx.lineTo(-8, 0);
    ctx.stroke();
    blade(ctx, 20, 3.5, '#e6edf5');
  }

  function drawStaff(ctx) {
    // Pole centered on the hand, extending both directions.
    ctx.strokeStyle = '#b07a3c';
    ctx.lineWidth = 5;
    ctx.lineCap = 'round';
    ctx.beginPath();
    ctx.moveTo(-38, 0);
    ctx.lineTo(38, 0);
    ctx.stroke();
    // Metal end caps.
    ctx.fillStyle = '#cfd6df';
    for (const ex of [-38, 38]) {
      ctx.beginPath();
      ctx.arc(ex, 0, 3.2, 0, Math.PI * 2);
      ctx.fill();
    }
  }

  window.Weapons = { defs, order, next, draw };
})();

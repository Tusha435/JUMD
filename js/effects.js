// Lightweight visual FX: particles + afterimages. No assets.
// Capped arrays keep cost bounded. Exposed globally as `Effects`.
(function () {
  const MAX_PARTICLES = 220;
  const MAX_AFTERIMAGES = 60;

  const particles = [];
  const afterimages = [];

  // --- Particles (hit sparks, charge motes, dust) ---
  function spawnParticle(x, y, vx, vy, life, color, size, gravity) {
    if (particles.length >= MAX_PARTICLES) particles.shift();
    particles.push({ x, y, vx, vy, life, maxLife: life, color, size, gravity: gravity || 0 });
  }

  // Radial burst of sparks (used on impact).
  function burst(x, y, color, count, speed) {
    count = count || 12;
    speed = speed || 6;
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * (0.4 + Math.random() * 0.8);
      spawnParticle(
        x, y,
        Math.cos(a) * s, Math.sin(a) * s,
        14 + Math.random() * 12,
        Math.random() < 0.5 ? '#ffffff' : color,
        2 + Math.random() * 3,
        0.25
      );
    }
  }

  // Inward-swirling motes for beam charge.
  function chargeMotes(x, y, color) {
    for (let i = 0; i < 2; i++) {
      const a = Math.random() * Math.PI * 2;
      const r = 22 + Math.random() * 16;
      spawnParticle(
        x + Math.cos(a) * r, y + Math.sin(a) * r,
        -Math.cos(a) * 2.4, -Math.sin(a) * 2.4,
        12, color, 2 + Math.random() * 2, 0
      );
    }
  }

  // Soft ground dust on landing / dash.
  function dust(x, y, dir) {
    for (let i = 0; i < 6; i++) {
      spawnParticle(
        x, y,
        (dir || (Math.random() - 0.5)) * (1 + Math.random() * 3),
        -Math.random() * 2,
        16, 'rgba(255,255,255,0.5)', 2 + Math.random() * 3, 0.06
      );
    }
  }

  // --- Afterimages (motion trail during dash / fast moves) ---
  function addAfterimage(x, y, facing, pose, color) {
    if (afterimages.length >= MAX_AFTERIMAGES) afterimages.shift();
    afterimages.push({ x, y, facing, pose, color, life: 12, maxLife: 12 });
  }

  function update() {
    for (let i = particles.length - 1; i >= 0; i--) {
      const p = particles[i];
      p.vy += p.gravity;
      p.x += p.vx;
      p.y += p.vy;
      p.vx *= 0.96;
      if (--p.life <= 0) particles.splice(i, 1);
    }
    for (let i = afterimages.length - 1; i >= 0; i--) {
      if (--afterimages[i].life <= 0) afterimages.splice(i, 1);
    }
  }

  // Afterimages render *behind* fighters.
  function drawAfterimages(ctx) {
    for (const a of afterimages) {
      const alpha = (a.life / a.maxLife) * 0.4;
      Skeleton.draw(ctx, a.x, a.y, a.facing, a.pose, {
        color: a.color, hairColor: a.color, alpha,
      });
    }
  }

  // Particles render in front.
  function drawParticles(ctx) {
    ctx.save();
    for (const p of particles) {
      ctx.globalAlpha = Math.max(0, p.life / p.maxLife);
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  function clear() {
    particles.length = 0;
    afterimages.length = 0;
  }

  window.Effects = {
    burst, chargeMotes, dust, addAfterimage,
    update, drawAfterimages, drawParticles, clear,
  };
})();

// Energy beam projectile. Exposed globally as `Projectile`.
(function () {
  // Travelling projectile. Defaults to a ki blast; `opts` reskins it as a
  // sword blade-wave ('crescent') or a thrown knife ('knife').
  const PRESETS = {
    blast: { style: 'orb', speed: 12, r: 13, damage: 9, knockback: 8, life: 180 },
    blade: { style: 'crescent', speed: 13, r: 17, damage: 13, knockback: 9, life: 110 },
    knife: { style: 'knife', speed: 17, r: 9, damage: 6, knockback: 4, life: 120 },
  };

  class Projectile {
    constructor(x, y, dir, owner, kind) {
      const p = PRESETS[kind] || PRESETS.blast;
      this.kind = 'shot';        // collision category (vs the 'super' beam)
      this.style = p.style;
      this.x = x;
      this.y = y;
      this.dir = dir;            // +1 / -1
      this.vx = p.speed * dir;
      this.owner = owner;        // fighter that fired it
      this.r = p.r;
      this.dead = false;
      this.life = p.life;
      this.color = owner.hairColor;
      this.damage = p.damage;
      this.knockback = p.knockback;
      this.spin = 0;
    }

    hurtbox() {
      return { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 };
    }

    // Send it back the other way (staff spin reflect).
    reflect(newOwner) {
      this.dir *= -1;
      this.vx *= -1.15;
      this.owner = newOwner;
      this.color = newOwner.hairColor;
      this.damage = Math.round(this.damage * 1.2);
    }

    update(stageW) {
      this.x += this.vx;
      this.spin += 0.5 * this.dir;
      this.life--;
      if (this.life <= 0 || this.x < -40 || this.x > stageW + 40) this.dead = true;
    }

    draw(ctx) {
      if (this.style === 'crescent') return this.drawCrescent(ctx);
      if (this.style === 'knife') return this.drawKnife(ctx);
      this.drawOrb(ctx);
    }

    drawOrb(ctx) {
      ctx.save();
      const grd = ctx.createRadialGradient(this.x, this.y, 2, this.x, this.y, this.r + 8);
      grd.addColorStop(0, '#ffffff');
      grd.addColorStop(0.4, this.color);
      grd.addColorStop(1, 'rgba(120,180,255,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.ellipse(this.x - this.vx * 1.6, this.y, this.r * 1.4, this.r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }

    drawCrescent(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.scale(this.dir, 1);
      ctx.shadowColor = this.color;
      ctx.shadowBlur = 14;
      ctx.fillStyle = this.color;
      ctx.globalAlpha = 0.95;
      const r = this.r + 6;
      ctx.beginPath();
      ctx.arc(0, 0, r, -Math.PI * 0.7, Math.PI * 0.7);
      ctx.arc(-8, 0, r, Math.PI * 0.7, -Math.PI * 0.7, true);
      ctx.closePath();
      ctx.fill();
      ctx.fillStyle = '#ffffff';
      ctx.globalAlpha = 0.7;
      ctx.beginPath();
      ctx.arc(2, 0, r * 0.6, -Math.PI * 0.6, Math.PI * 0.6);
      ctx.arc(-4, 0, r * 0.6, Math.PI * 0.6, -Math.PI * 0.6, true);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }

    drawKnife(ctx) {
      ctx.save();
      ctx.translate(this.x, this.y);
      ctx.rotate(this.spin);
      ctx.fillStyle = '#e6edf5';
      ctx.beginPath();
      ctx.moveTo(14, 0);
      ctx.lineTo(-6, -4);
      ctx.lineTo(-10, 0);
      ctx.lineTo(-6, 4);
      ctx.closePath();
      ctx.fill();
      ctx.strokeStyle = '#3a2a1a';
      ctx.lineWidth = 3;
      ctx.beginPath();
      ctx.moveTo(-6, 0);
      ctx.lineTo(-12, 0);
      ctx.stroke();
      ctx.restore();
    }
  }

  // Full-meter Super Beam: a thick sustained beam that tracks the caster's
  // hand, sweeps across the stage, and multi-hits anything in its path.
  class SuperBeam {
    constructor(owner) {
      this.kind = 'super';
      this.owner = owner;
      this.dir = owner.facing;
      this.t = 0;
      this.dur = 42;           // total active frames
      this.dead = false;
      this.color = owner.hairColor;
      this.maxH = 54;
      this.dmgPerHit = 3;
      this.knockback = 11;
      this.syncOrigin();
    }

    syncOrigin() {
      this.x = this.owner.x + this.dir * 38;
      this.y = this.owner.y - 34;
    }

    // Growing height envelope: ramp up, hold, ramp down.
    height() {
      const ramp = 8;
      let k = 1;
      if (this.t < ramp) k = this.t / ramp;
      else if (this.t > this.dur - ramp) k = Math.max(0, (this.dur - this.t) / ramp);
      return this.maxH * k;
    }

    rect(stageW) {
      const h = this.height();
      const x = this.dir === 1 ? this.x : 0;
      const w = this.dir === 1 ? stageW - this.x : this.x;
      return { x, y: this.y - h / 2, w, h };
    }

    // Alias so collision code can treat all projectiles uniformly.
    hurtbox() { return this.rect(this._stageW || 960); }

    update(stageW) {
      this._stageW = stageW;
      this.t++;
      this.syncOrigin();
      if (this.t >= this.dur) this.dead = true;
    }

    draw(ctx, stageW) {
      const h = this.height();
      if (h < 1) return;
      const x = this.dir === 1 ? this.x : 0;
      const w = this.dir === 1 ? stageW - this.x : this.x;
      const cy = this.y;
      ctx.save();
      // Outer glow.
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = this.color;
      ctx.fillRect(x, cy - h / 2, w, h);
      // Bright core with a slight flicker.
      ctx.globalAlpha = 0.9;
      ctx.fillStyle = '#ffffff';
      const core = h * (0.45 + Math.random() * 0.1);
      ctx.fillRect(x, cy - core / 2, w, core);
      // Muzzle flash at the hand.
      ctx.globalAlpha = 0.9;
      const grd = ctx.createRadialGradient(this.x, cy, 2, this.x, cy, h);
      grd.addColorStop(0, '#ffffff');
      grd.addColorStop(0.5, this.color);
      grd.addColorStop(1, 'rgba(255,255,255,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(this.x, cy, h, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  window.Projectile = Projectile;
  window.SuperBeam = SuperBeam;
})();

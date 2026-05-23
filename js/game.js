// Game state machine: round flow, collisions, HUD. Exposed as `Game`.
(function () {
  const STAGE_W = 960;
  const STAGE_H = 540;
  const GROUND_Y = 470; // pelvis y when standing on the floor

  class Game {
    constructor(ctx) {
      this.ctx = ctx;
      this.projectiles = [];
      this.phase = 'intro';   // intro -> fight -> ko
      this.phaseTime = 0;
      this.winner = null;
      this.shake = 0;
      this.flash = 0;

      this.p1 = new Fighter({
        name: 'SPARK', color: '#cfe8ff', hairColor: '#29b6f6',
        x: 280, facing: 1, player: 'p1', groundY: GROUND_Y, stageW: STAGE_W,
      });
      this.p2 = new Fighter({
        name: 'BLAZE', color: '#ffdcd6', hairColor: '#ef5350',
        x: 680, facing: -1, player: 'p2', groundY: GROUND_Y, stageW: STAGE_W,
      });

      this.dom = {
        hp1: document.getElementById('hp1'),
        hp2: document.getElementById('hp2'),
        mt1: document.getElementById('mt1'),
        mt2: document.getElementById('mt2'),
        banner: document.getElementById('banner'),
        bannerText: document.getElementById('banner-text'),
      };

      this.setBanner('READY?');
    }

    setBanner(text) {
      if (!text) {
        this.dom.banner.classList.add('hidden');
      } else {
        this.dom.bannerText.textContent = text;
        this.dom.banner.classList.remove('hidden');
        // Re-trigger pop animation.
        this.dom.bannerText.style.animation = 'none';
        void this.dom.bannerText.offsetWidth;
        this.dom.bannerText.style.animation = '';
      }
    }

    rematch() {
      this.p1.reset();
      this.p2.reset();
      this.projectiles.length = 0;
      if (window.Effects) Effects.clear();
      this.flash = 0;
      this.winner = null;
      this.phase = 'intro';
      this.phaseTime = 0;
      this.setBanner('READY?');
    }

    // One fixed logic step (~60 Hz).
    step() {
      this.phaseTime++;
      if (this.shake > 0) this.shake *= 0.85;
      if (this.flash > 0) this.flash *= 0.88;
      if (window.Effects) Effects.update();

      if (this.phase === 'intro') {
        if (this.phaseTime === 60) this.setBanner('FIGHT!');
        if (this.phaseTime >= 90) { this.phase = 'fight'; this.setBanner(''); }
        // Fighters idle during intro.
        this.p1.update(this.p2, () => {});
        this.p2.update(this.p1, () => {});
        return;
      }

      if (this.phase === 'ko') {
        // Let bodies settle; allow rematch on any key.
        this.p1.update(this.p2, () => {});
        this.p2.update(this.p1, () => {});
        this.updateProjectiles();
        if (this.phaseTime > 40 && Input.anyPressed()) this.rematch();
        this.syncHud();
        return;
      }

      // ----- fight -----
      const spawn = (p) => {
        this.projectiles.push(p);
        if (p.kind === 'super') { this.flash = 1; this.shake = Math.max(this.shake, 14); }
      };

      this.p1.handleInput(Input.held('p1'), {
        punch: Input.pressed('p1', 'punch'),
        kick: Input.pressed('p1', 'kick'),
        beam: Input.pressed('p1', 'beam'),
        up: Input.pressed('p1', 'up'),
        left: Input.pressed('p1', 'left'),
        right: Input.pressed('p1', 'right'),
      });
      this.p2.handleInput(Input.held('p2'), {
        punch: Input.pressed('p2', 'punch'),
        kick: Input.pressed('p2', 'kick'),
        beam: Input.pressed('p2', 'beam'),
        up: Input.pressed('p2', 'up'),
        left: Input.pressed('p2', 'left'),
        right: Input.pressed('p2', 'right'),
      });

      this.p1.update(this.p2, spawn);
      this.p2.update(this.p1, spawn);

      this.resolveBodyOverlap();
      this.resolveMelee(this.p1, this.p2);
      this.resolveMelee(this.p2, this.p1);
      this.updateProjectiles();

      // KO check.
      if (this.p1.state === 'ko' || this.p2.state === 'ko') {
        this.phase = 'ko';
        this.phaseTime = 0;
        this.winner = this.p1.state === 'ko' ? this.p2 : this.p1;
        this.setBanner('K.O.\n' + this.winner.name + ' WINS!');
      }

      this.syncHud();
    }

    // Push fighters apart so they don't occupy the same column.
    resolveBodyOverlap() {
      const a = this.p1, b = this.p2;
      const minGap = 36;
      const dx = b.x - a.x;
      const dist = Math.abs(dx);
      if (dist < minGap && a.onGround && b.onGround) {
        const push = (minGap - dist) / 2;
        const dir = dx >= 0 ? 1 : -1;
        a.x -= push * dir;
        b.x += push * dir;
      }
    }

    resolveMelee(attacker, defender) {
      const hb = attacker.activeHitbox();
      if (!hb) return;
      const dhb = defender.hurtbox();
      if (!aabb(hb, dhb)) return;
      const fromDir = attacker.facing;
      const blocking = defender.state === 'block';
      const res = defender.takeHit(hb.atk.dmg, hb.atk.kb, fromDir, blocking, hb.atk.launch);
      if (res && res.hit) {
        attacker.hitConsumed = true;
        attacker.addMeter(hb.atk.meter);
        this.onImpact(defender, fromDir, res.blocked, hb.atk.launch ? 18 : 12);
      }
    }

    updateProjectiles() {
      for (const p of this.projectiles) {
        p.update(STAGE_W);
        if (p.dead) continue;
        const target = p.owner === this.p1 ? this.p2 : this.p1;

        if (p.kind === 'super') {
          // Multi-hit beam: tick damage on a cooldown while overlapping.
          p._cd = (p._cd || 0) - 1;
          if (aabb(p.rect(STAGE_W), target.hurtbox()) && p._cd <= 0) {
            const blocking = target.state === 'block';
            target.takeHit(p.dmgPerHit, p.knockback, p.dir, blocking);
            p.owner.addMeter(0);
            p._cd = 3;
            this.onImpact(target, p.dir, blocking, 10);
            this.shake = Math.max(this.shake, blocking ? 6 : 12);
          }
          continue;
        }

        if (aabb(p.hurtbox(), target.hurtbox())) {
          const blocking = target.state === 'block';
          const res = target.takeHit(p.damage, p.knockback, p.dir, blocking);
          p.owner.addMeter(6);
          p.dead = true;
          if (res && res.hit) this.onImpact(target, p.dir, res.blocked, 16);
        }
      }
      this.projectiles = this.projectiles.filter((p) => !p.dead);
    }

    // Shared hit reaction: sparks + screen shake.
    onImpact(defender, dir, blocked, count) {
      const ix = defender.x + dir * 10;
      const iy = defender.y - 38;
      const color = blocked ? '#bcd4ff' : defender.hairColor;
      if (window.Effects) Effects.burst(ix, iy, color, blocked ? 6 : count, blocked ? 4 : 7);
      this.shake = Math.max(this.shake, blocked ? 3 : 7);
    }

    syncHud() {
      this.dom.hp1.style.width = this.p1.hp + '%';
      this.dom.hp2.style.width = this.p2.hp + '%';
      this.dom.mt1.style.width = this.p1.meter + '%';
      this.dom.mt2.style.width = this.p2.meter + '%';
    }

    // Render (called every animation frame).
    render() {
      const ctx = this.ctx;
      ctx.save();
      if (this.shake > 0.5) {
        ctx.translate((Math.random() - 0.5) * this.shake, (Math.random() - 0.5) * this.shake);
      }
      ctx.clearRect(-20, -20, STAGE_W + 40, STAGE_H + 40);

      this.drawBackground(ctx);

      // Motion trails sit behind everything.
      if (window.Effects) Effects.drawAfterimages(ctx);

      this.p1.draw(ctx);
      this.p2.draw(ctx);

      for (const p of this.projectiles) p.draw(ctx, STAGE_W);

      // Impact sparks / motes on top.
      if (window.Effects) Effects.drawParticles(ctx);

      ctx.restore();

      // Full-screen flash for super beams (drawn untransformed).
      if (this.flash > 0.02) {
        ctx.save();
        ctx.globalAlpha = Math.min(0.6, this.flash);
        ctx.fillStyle = '#ffffff';
        ctx.fillRect(0, 0, STAGE_W, STAGE_H);
        ctx.restore();
      }
    }

    drawBackground(ctx) {
      // Floor.
      const fy = GROUND_Y + 42;
      ctx.fillStyle = 'rgba(255,255,255,0.06)';
      ctx.fillRect(0, fy, STAGE_W, STAGE_H - fy);
      ctx.strokeStyle = 'rgba(255,255,255,0.18)';
      ctx.lineWidth = 2;
      ctx.beginPath();
      ctx.moveTo(0, fy);
      ctx.lineTo(STAGE_W, fy);
      ctx.stroke();

      // Soft shadows under fighters.
      for (const f of [this.p1, this.p2]) {
        const onAir = !f.onGround ? 0.5 : 1;
        ctx.fillStyle = `rgba(0,0,0,${0.28 * onAir})`;
        ctx.beginPath();
        ctx.ellipse(f.x, fy + 2, 26, 7, 0, 0, Math.PI * 2);
        ctx.fill();
      }
    }
  }

  function aabb(a, b) {
    return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  }

  Game.STAGE_W = STAGE_W;
  Game.STAGE_H = STAGE_H;
  window.Game = Game;
})();

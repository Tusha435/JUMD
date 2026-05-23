// Fighter: physics, state machine, attacks, health & meter.
// Exposed globally as `Fighter`. Depends on Skeleton, Projectile.
(function () {
  const GRAVITY = 0.9;
  const WALK_SPEED = 4.2;
  const JUMP_V = 16;
  const FRICTION = 0.8;

  // Attack frame data (60 Hz): [startup, active, recovery].
  const ATTACKS = {
    punch: { startup: 4, active: 4, recovery: 9, reach: 52, top: -48, h: 22, dmg: 7, kb: 5, hitstun: 14, meter: 7 },
    kick: { startup: 6, active: 5, recovery: 14, reach: 64, top: -30, h: 26, dmg: 11, kb: 9, hitstun: 20, meter: 9 },
  };

  const BEAM_COST = 50;

  class Fighter {
    constructor(opts) {
      this.name = opts.name;
      this.color = opts.color;
      this.hairColor = opts.hairColor;
      this.startX = opts.x;
      this.facing = opts.facing; // +1 faces right
      this.player = opts.player; // 'p1' | 'p2'
      this.groundY = opts.groundY;
      this.stageW = opts.stageW;
      this.reset();
      this.disp = clonePose(Skeleton.getPose('idle'));
    }

    reset() {
      this.x = this.startX;
      this.y = this.groundY;
      this.vx = 0;
      this.vy = 0;
      this.facing = this.startX < this.stageW / 2 ? 1 : -1;
      this.hp = 100;
      this.meter = 0;
      this.state = 'idle';
      this.t = 0;            // frames in current state
      this.onGround = true;
      this.hitConsumed = false;
      this.beamFired = false;
      this.animClock = 0;
    }

    get busy() {
      return ['punch', 'kick', 'beam', 'hitstun', 'ko'].includes(this.state);
    }

    setState(s) {
      if (this.state === s) return;
      this.state = s;
      this.t = 0;
      this.hitConsumed = false;
      this.beamFired = false;
    }

    hurtbox() {
      const half = 22;
      const crouch = this.state === 'block' || this.state === 'crouch';
      const top = this.y - (crouch ? 50 : 74);
      const bottom = this.y + 42;
      return { x: this.x - half, y: top, w: half * 2, h: bottom - top };
    }

    // AABB of an active melee hitbox, or null.
    activeHitbox() {
      if (this.hitConsumed) return null;
      const a = ATTACKS[this.state];
      if (!a) return null;
      if (this.t < a.startup || this.t >= a.startup + a.active) return null;
      const x = this.facing === 1 ? this.x + 14 : this.x - 14 - a.reach;
      return { x, y: this.y + a.top, w: a.reach, h: a.h, atk: a };
    }

    // ---- Input-driven actions (only when grounded & not busy) ----
    handleInput(input, pressed) {
      if (this.state === 'ko' || this.busy) return;

      const blocking = input.down && this.onGround;

      if (this.onGround) {
        if (pressed.punch) return this.setState('punch');
        if (pressed.kick) return this.setState('kick');
        if (pressed.beam && this.meter >= BEAM_COST) {
          this.meter -= BEAM_COST;
          return this.setState('beam');
        }
        if (pressed.up) {
          this.vy = -JUMP_V;
          this.onGround = false;
          this.setState('jump');
          return;
        }
        if (blocking) {
          this.vx = 0;
          return this.setState('block');
        }
      }

      // Horizontal movement (air control allowed, reduced).
      const speed = this.onGround ? WALK_SPEED : WALK_SPEED * 0.7;
      if (input.left && !input.right) this.vx = -speed;
      else if (input.right && !input.left) this.vx = speed;
      else if (this.onGround) this.vx *= FRICTION;

      if (this.onGround) {
        this.setState(Math.abs(this.vx) > 0.4 ? 'walk' : 'idle');
      }
    }

    update(opponent, spawnProjectile) {
      this.animClock++;
      this.t++;

      // Physics.
      this.vy += GRAVITY;
      this.x += this.vx;
      this.y += this.vy;

      // Ground clamp.
      if (this.y >= this.groundY) {
        this.y = this.groundY;
        this.vy = 0;
        if (!this.onGround) {
          this.onGround = true;
          if (this.state === 'jump') this.setState('idle');
        }
      } else {
        this.onGround = false;
      }

      // Stage bounds.
      const margin = 30;
      if (this.x < margin) { this.x = margin; this.vx = 0; }
      if (this.x > this.stageW - margin) { this.x = this.stageW - margin; this.vx = 0; }

      // Face the opponent when grounded and not mid-action.
      if (this.onGround && !this.busy && opponent) {
        this.facing = opponent.x >= this.x ? 1 : -1;
      }

      // Attack / locked-state lifecycle.
      this.tickState(spawnProjectile);

      // Smooth the displayed pose toward the target (cheap easing).
      this.blendPose();
    }

    tickState(spawnProjectile) {
      const a = ATTACKS[this.state];
      if (a) {
        if (this.t >= a.startup + a.active + a.recovery) this.setState('idle');
        return;
      }
      if (this.state === 'beam') {
        if (this.t === 12 && !this.beamFired) {
          this.beamFired = true;
          const hx = this.x + this.facing * 38;
          const hy = this.y - 34;
          spawnProjectile(new Projectile(hx, hy, this.facing, this));
        }
        if (this.t >= 30) this.setState('idle');
        return;
      }
      if (this.state === 'hitstun') {
        this.vx *= 0.85;
        if (this.t >= this.hitstunDur) this.setState(this.onGround ? 'idle' : 'jump');
        return;
      }
    }

    takeHit(dmg, kb, fromDir, defenderBlocking) {
      if (this.state === 'ko') return false;
      const blocked = defenderBlocking && fromDir === this.facing;
      if (blocked) {
        this.hp -= Math.max(1, Math.round(dmg * 0.2)); // chip
        this.vx = 2 * fromDir;                          // small pushback
        this.meter = Math.min(100, this.meter + 3);
      } else {
        this.hp -= dmg;
        this.vx = kb * fromDir;
        this.vy = -kb * 0.5;
        this.hitstunDur = 10 + Math.round(kb);
        this.setState('hitstun');
        this.meter = Math.min(100, this.meter + 5);
      }
      if (this.hp <= 0) {
        this.hp = 0;
        this.setState('ko');
      }
      return true;
    }

    addMeter(v) { this.meter = Math.min(100, this.meter + v); }

    // ---- Rendering ----
    poseName() {
      switch (this.state) {
        case 'ko': return 'ko';
        case 'hitstun': return 'hitstun';
        case 'punch': return 'punch';
        case 'kick': return 'kick';
        case 'beam': return 'beam';
        case 'block': return 'block';
        case 'crouch': return 'crouch';
      }
      if (!this.onGround) return 'jump';
      if (this.state === 'walk') return 'walk';
      return 'idle';
    }

    blendPose() {
      const target = Skeleton.getPose(this.poseName());
      const k = 0.4;
      for (const key in target) {
        this.disp[key].x += (target[key].x - this.disp[key].x) * k;
        this.disp[key].y += (target[key].y - this.disp[key].y) * k;
      }
    }

    draw(ctx) {
      // Subtle idle/walk bob (kept tiny -> negligible cost).
      let bob = 0;
      if (this.state === 'idle') bob = Math.sin(this.animClock * 0.08) * 1.2;
      else if (this.state === 'walk') bob = Math.abs(Math.sin(this.animClock * 0.25)) * 2.5;

      const charge = this.state === 'beam' ? Math.min(1, this.t / 12) : 0;
      Skeleton.draw(ctx, this.x, this.y + bob, this.facing, this.disp, {
        color: this.color,
        hairColor: this.hairColor,
        charge,
      });
    }
  }

  function clonePose(p) {
    const out = {};
    for (const k in p) out[k] = { x: p[k].x, y: p[k].y };
    return out;
  }

  Fighter.ATTACKS = ATTACKS;
  Fighter.BEAM_COST = BEAM_COST;
  window.Fighter = Fighter;
})();

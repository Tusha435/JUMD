// Fighter: physics, state machine, attacks, health & meter.
// Exposed globally as `Fighter`. Depends on Skeleton, Projectile.
(function () {
  const GRAVITY = 0.9;
  const WALK_SPEED = 4.2;
  const JUMP_V = 16;
  const FRICTION = 0.8;
  const DASH_SPEED = 11;
  const DASH_FRAMES = 11;
  const DOUBLE_TAP_WINDOW = 11; // frames to register a double-tap dash

  // Attack frame data (60 Hz): startup -> active -> recovery.
  // `launch` applies upward velocity to the victim (juggle starter).
  const ATTACKS = {
    punch: { startup: 4, active: 4, recovery: 9, reach: 52, top: -48, h: 22, dmg: 7, kb: 5, hitstun: 14, meter: 7 },
    kick: { startup: 6, active: 5, recovery: 14, reach: 64, top: -30, h: 26, dmg: 11, kb: 9, hitstun: 20, meter: 9 },
    launcher: { startup: 5, active: 6, recovery: 18, reach: 46, top: -64, h: 80, dmg: 9, kb: 3, hitstun: 30, meter: 14, launch: 17, ground: true },
  };

  const BEAM_COST = 35;   // light ki blast
  const SUPER_COST = 100; // full-meter super beam

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
      this.dashTimer = 0;
      this.dashDir = 0;
      this.lastTapDir = 0;
      this.lastTapFrame = -100;
      this.airActed = false;   // limit to one air attack per jump
      this.weapon = 'fists';
      this.specialCd = 0;      // weapon-ability cooldown (frames)
    }

    get busy() {
      return ['punch', 'kick', 'launcher', 'beam', 'superbeam', 'special', 'spin', 'hitstun', 'ko'].includes(this.state);
    }

    weaponDef() { return Weapons.defs[this.weapon] || Weapons.defs.fists; }

    // Move stats for the current melee state, sourced from the equipped weapon.
    moveData() {
      const slot = this.state === 'punch' ? 'light'
        : this.state === 'kick' ? 'heavy'
        : this.state === 'launcher' ? 'launcher' : null;
      return slot ? this.weaponDef().moves[slot] : null;
    }

    switchWeapon() {
      this.weapon = Weapons.next(this.weapon);
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

      // Staff spin: a symmetric hitbox surrounding the fighter.
      if (this.state === 'spin') {
        const sp = this.weaponDef().special;
        if (this.t < sp.active[0] || this.t > sp.active[1]) return null;
        const atk = { dmg: sp.dmg, kb: sp.kb, meter: sp.meter };
        return { x: this.x - sp.reach, y: this.y + sp.top, w: sp.reach * 2, h: sp.h, atk };
      }

      const a = this.moveData();
      if (!a) return null;
      if (this.t < a.startup || this.t >= a.startup + a.active) return null;
      const x = this.facing === 1 ? this.x + 14 : this.x - 14 - a.reach;
      return { x, y: this.y + a.top, w: a.reach, h: a.h, atk: a };
    }

    // ---- Input-driven actions ----
    handleInput(input, pressed) {
      if (this.state === 'ko' || this.busy) return;

      // Cycle weapon (instant, no state change).
      if (pressed.switchWeapon) this.switchWeapon();

      // Weapon special ability.
      if (pressed.special && this.specialCd <= 0) {
        const sp = this.weaponDef().special;
        if (sp && (this.onGround || sp.air)) {
          this.specialCd = sp.cd + (sp.dur || 0);
          if (sp.kind === 'spin') return this.setState('spin');
          this.specialKind = sp.kind;
          if (this.onGround) this.vx = 0;
          return this.setState('special');
        }
      }

      // Double-tap dash (ground dash or air dash).
      if (pressed.left) this.tryDash(-1);
      if (pressed.right) this.tryDash(1);

      // Beam button: super at full meter, otherwise a light ki blast.
      if (pressed.beam) {
        if (this.meter >= SUPER_COST) {
          this.meter -= SUPER_COST;
          this.vx = 0;
          return this.setState('superbeam');
        }
        if (this.meter >= BEAM_COST) {
          this.meter -= BEAM_COST;
          if (this.onGround) this.vx = 0;
          return this.setState('beam');
        }
      }

      if (this.onGround) {
        // Down + Kick = launcher (anti-air / juggle starter).
        if (pressed.kick && input.down) return this.setState('launcher');
        if (pressed.punch) return this.setState('punch');
        if (pressed.kick) return this.setState('kick');
        if (pressed.up) {
          this.vy = -JUMP_V;
          this.onGround = false;
          this.airActed = false;
          this.setState('jump');
          return;
        }
        if (input.down) {
          this.vx = 0;
          return this.setState('block');
        }
      } else if (!this.airActed) {
        // One air attack per jump (enables juggles).
        if (pressed.punch) { this.airActed = true; return this.setState('punch'); }
        if (pressed.kick) { this.airActed = true; return this.setState('kick'); }
      }

      // Horizontal movement (skipped while dashing so the dash carries through).
      if (this.dashTimer <= 0) {
        const speed = this.onGround ? WALK_SPEED : WALK_SPEED * 0.7;
        if (input.left && !input.right) this.vx = -speed;
        else if (input.right && !input.left) this.vx = speed;
        else if (this.onGround) this.vx *= FRICTION;
      }

      if (this.onGround && this.dashTimer <= 0) {
        this.setState(Math.abs(this.vx) > 0.4 ? 'walk' : 'idle');
      }
    }

    tryDash(dir) {
      const recent = this.animClock - this.lastTapFrame <= DOUBLE_TAP_WINDOW;
      if (recent && this.lastTapDir === dir && this.dashTimer <= 0) {
        this.dashTimer = DASH_FRAMES;
        this.dashDir = dir;
        this.vx = DASH_SPEED * dir;
        if (this.onGround && Effects) Effects.dust(this.x, this.groundY + 42, -dir);
      }
      this.lastTapDir = dir;
      this.lastTapFrame = this.animClock;
    }

    update(opponent, spawnProjectile) {
      this.animClock++;
      this.t++;
      if (this.specialCd > 0) this.specialCd--;

      // Dash: hold speed for a few frames and trail afterimages.
      if (this.dashTimer > 0) {
        this.dashTimer--;
        this.vx = DASH_SPEED * this.dashDir * (0.5 + this.dashTimer / DASH_FRAMES);
        if (this.dashTimer % 2 === 0 && Effects) {
          Effects.addAfterimage(this.x, this.y, this.facing, clonePose(this.disp), this.hairColor);
        }
      }

      // Physics. Reduced gravity while launched upward feels floatier (juggle).
      const g = (this.state === 'hitstun' && this.vy < 0) ? GRAVITY * 0.7 : GRAVITY;
      this.vy += g;
      this.x += this.vx;
      this.y += this.vy;

      // Ground clamp.
      if (this.y >= this.groundY) {
        this.y = this.groundY;
        if (!this.onGround) {
          this.onGround = true;
          this.airActed = false;
          if (this.vy > 6 && Effects) Effects.dust(this.x, this.groundY + 42);
          if (this.state === 'jump') this.setState('idle');
        }
        this.vy = 0;
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
        if (this.t >= a.startup + a.active + a.recovery) {
          this.setState(this.onGround ? 'idle' : 'jump');
        }
        return;
      }
      if (this.state === 'beam') {
        const hx = this.x + this.facing * 38;
        const hy = this.y - 34;
        if (this.t < 12 && Effects) Effects.chargeMotes(hx, hy, this.hairColor);
        if (this.t === 12 && !this.beamFired) {
          this.beamFired = true;
          spawnProjectile(new Projectile(hx, hy, this.facing, this));
        }
        if (this.t >= 28) this.setState(this.onGround ? 'idle' : 'jump');
        return;
      }
      if (this.state === 'superbeam') {
        const hx = this.x + this.facing * 38;
        const hy = this.y - 34;
        if (this.t < 14 && Effects) Effects.chargeMotes(hx, hy, this.hairColor);
        if (this.t === 14 && !this.beamFired) {
          this.beamFired = true;
          spawnProjectile(new SuperBeam(this));
        }
        if (this.t >= 14 + 44) this.setState('idle');
        return;
      }
      if (this.state === 'special') {
        const sp = this.weaponDef().special;
        const hx = this.x + this.facing * 36;
        const hy = this.y - 36;
        if (this.t === sp.frame && !this.beamFired) {
          this.beamFired = true;
          spawnProjectile(new Projectile(hx, hy, this.facing, this, sp.kind));
          if (Effects) Effects.burst(hx, hy, this.hairColor, 8, 5);
        }
        if (this.t >= sp.dur) this.setState(this.onGround ? 'idle' : 'jump');
        return;
      }
      if (this.state === 'spin') {
        const sp = this.weaponDef().special;
        if (this.t >= sp.dur) this.setState('idle');
        return;
      }
      if (this.state === 'hitstun') {
        this.vx *= 0.9;
        if (this.t >= this.hitstunDur && this.onGround) this.setState('idle');
        return;
      }
    }

    takeHit(dmg, kb, fromDir, defenderBlocking, launch) {
      if (this.state === 'ko') return false;
      const blocked = defenderBlocking && fromDir === this.facing && this.onGround;
      if (blocked) {
        this.hp -= Math.max(1, Math.round(dmg * 0.2)); // chip
        this.vx = 2 * fromDir;                          // small pushback
        this.meter = Math.min(100, this.meter + 3);
      } else {
        this.hp -= dmg;
        this.vx = kb * fromDir;
        if (launch) {
          this.vy = -launch;          // pop into the air for a juggle
          this.onGround = false;
        } else {
          this.vy = Math.min(this.vy, -kb * 0.5);
        }
        this.hitstunDur = 10 + Math.round(kb + (launch || 0));
        this.setState('hitstun');
        this.meter = Math.min(100, this.meter + 5);
      }
      if (this.hp <= 0) {
        this.hp = 0;
        this.setState('ko');
      }
      return { hit: true, blocked };
    }

    addMeter(v) { this.meter = Math.min(100, this.meter + v); }

    // ---- Rendering ----
    poseName() {
      const armed = this.weapon !== 'fists';
      switch (this.state) {
        case 'ko': return 'ko';
        case 'hitstun': return 'hitstun';
        case 'punch': return 'punch';                       // thrust works for all
        case 'kick': return armed ? (this.weapon === 'staff' ? 'sweep' : 'slash') : 'kick';
        case 'launcher': return armed ? 'slash' : 'launcher';
        case 'special': return this.specialKind === 'knife' ? 'punch' : 'slash';
        case 'spin': return 'spin';
        case 'beam': return 'beam';
        case 'superbeam': return 'superbeam';
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

      const cy = this.y + bob;

      // Aura: pulsing glow that intensifies with meter (and full while charging).
      const charging = this.state === 'beam' || this.state === 'superbeam';
      const auraK = charging ? 1 : (this.meter >= 50 ? (this.meter - 50) / 50 : 0);
      if (auraK > 0.02) {
        const pulse = 0.85 + Math.sin(this.animClock * 0.3) * 0.15;
        const r = (38 + auraK * 26) * pulse;
        ctx.save();
        ctx.globalAlpha = 0.35 * auraK;
        const grd = ctx.createRadialGradient(this.x, cy - 30, 4, this.x, cy - 30, r);
        grd.addColorStop(0, this.hairColor);
        grd.addColorStop(1, 'rgba(255,255,255,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(this.x, cy - 30, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      }

      let charge = 0;
      if (this.state === 'beam') charge = Math.min(1, this.t / 12);
      else if (this.state === 'superbeam') charge = Math.min(1, this.t / 14);

      Skeleton.draw(ctx, this.x, cy, this.facing, this.disp, {
        color: this.color,
        hairColor: this.hairColor,
        charge,
      });

      // Weapon held in the front hand, oriented along the forearm.
      if (this.weapon !== 'fists') {
        const hand = Skeleton.worldPoint(this.x, cy, this.facing, this.disp, 'handF');
        const elbow = Skeleton.worldPoint(this.x, cy, this.facing, this.disp, 'elbowF');
        let ang = Math.atan2(hand.y - elbow.y, hand.x - elbow.x);
        if (this.state === 'spin') ang = this.t * 0.7 * this.facing;

        const swinging = this.activeHitbox() != null &&
          ['punch', 'kick', 'launcher', 'spin'].includes(this.state);
        const glow = (this.state === 'special' || this.state === 'spin') ? 1 : (swinging ? 0.6 : 0);

        if (swinging) this.drawSlashArc(ctx, hand, ang);
        Weapons.draw(ctx, this.weapon, hand, ang, this.facing, glow);
      }
    }

    drawSlashArc(ctx, hand, ang) {
      ctx.save();
      ctx.translate(hand.x, hand.y);
      ctx.rotate(ang);
      ctx.globalAlpha = 0.28;
      ctx.fillStyle = '#ffffff';
      ctx.beginPath();
      ctx.arc(0, 0, 56, -0.95, 0.95);
      ctx.arc(0, 0, 30, 0.95, -0.95, true);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function clonePose(p) {
    const out = {};
    for (const k in p) out[k] = { x: p[k].x, y: p[k].y };
    return out;
  }

  Fighter.ATTACKS = ATTACKS;
  Fighter.BEAM_COST = BEAM_COST;
  Fighter.SUPER_COST = SUPER_COST;
  window.Fighter = Fighter;
})();

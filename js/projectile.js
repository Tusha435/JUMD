// Energy beam projectile. Exposed globally as `Projectile`.
(function () {
  class Projectile {
    constructor(x, y, dir, owner) {
      this.x = x;
      this.y = y;
      this.dir = dir;          // +1 / -1
      this.vx = 11 * dir;
      this.owner = owner;      // fighter that fired it
      this.r = 14;             // collision radius
      this.dead = false;
      this.life = 180;         // frames before auto-expire
      this.color = owner.hairColor;
      this.damage = 12;
      this.knockback = 9;
    }

    hurtbox() {
      return { x: this.x - this.r, y: this.y - this.r, w: this.r * 2, h: this.r * 2 };
    }

    update(stageW) {
      this.x += this.vx;
      this.life--;
      if (this.life <= 0 || this.x < -40 || this.x > stageW + 40) this.dead = true;
    }

    draw(ctx) {
      ctx.save();
      const grd = ctx.createRadialGradient(this.x, this.y, 2, this.x, this.y, this.r + 8);
      grd.addColorStop(0, '#ffffff');
      grd.addColorStop(0.4, this.color);
      grd.addColorStop(1, 'rgba(120,180,255,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.r + 8, 0, Math.PI * 2);
      ctx.fill();

      // Trailing comet tail.
      ctx.globalAlpha = 0.5;
      ctx.fillStyle = this.color;
      ctx.beginPath();
      ctx.ellipse(this.x - this.vx * 1.6, this.y, this.r * 1.4, this.r * 0.6, 0, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    }
  }

  window.Projectile = Projectile;
})();

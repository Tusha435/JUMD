// Procedural stickman: pose tables + interpolation + drawing.
// No image assets. A "pose" is a map of joint -> {x,y} in LOCAL space,
// origin at the pelvis, +x = facing forward, -y = up (pixels).
// Exposed globally as `Skeleton`.
(function () {
  const HEAD_R = 11;

  // Joint keys every pose must define.
  // pelvis is implicitly {0,0}.
  function P(head, chest, elbowF, handF, elbowB, handB, kneeF, footF, kneeB, footB) {
    return { head, chest, elbowF, handF, elbowB, handB, kneeF, footF, kneeB, footB };
  }

  const POSES = {
    idle: P(
      { x: 0, y: -60 }, { x: 0, y: -40 },
      { x: 9, y: -24 }, { x: 11, y: -6 },   // front arm
      { x: -9, y: -24 }, { x: -11, y: -6 }, // back arm
      { x: 8, y: 16 }, { x: 11, y: 38 },    // front leg
      { x: -8, y: 16 }, { x: -11, y: 38 }   // back leg
    ),
    walk: P(
      { x: 0, y: -59 }, { x: 0, y: -39 },
      { x: 12, y: -22 }, { x: 16, y: -8 },
      { x: -12, y: -22 }, { x: -16, y: -4 },
      { x: 14, y: 14 }, { x: 20, y: 38 },
      { x: -14, y: 16 }, { x: -18, y: 38 }
    ),
    crouch: P(
      { x: 0, y: -42 }, { x: 0, y: -26 },
      { x: 10, y: -18 }, { x: 14, y: -8 },
      { x: -8, y: -18 }, { x: -12, y: -8 },
      { x: 12, y: 8 }, { x: 16, y: 28 },
      { x: -12, y: 8 }, { x: -16, y: 28 }
    ),
    block: P(
      { x: -2, y: -58 }, { x: -2, y: -39 },
      { x: 7, y: -34 }, { x: 4, y: -52 },   // front arm raised as guard
      { x: 4, y: -30 }, { x: 2, y: -46 },   // back arm raised
      { x: 7, y: 16 }, { x: 9, y: 38 },
      { x: -9, y: 16 }, { x: -13, y: 38 }
    ),
    jump: P(
      { x: 0, y: -58 }, { x: 0, y: -38 },
      { x: 12, y: -30 }, { x: 18, y: -36 },
      { x: -12, y: -30 }, { x: -18, y: -36 },
      { x: 10, y: 6 }, { x: 6, y: 22 },     // tucked legs
      { x: -10, y: 6 }, { x: -6, y: 22 }
    ),
    punch: P(
      { x: 1, y: -60 }, { x: 1, y: -40 },
      { x: 22, y: -34 }, { x: 40, y: -34 }, // front arm fully extended forward
      { x: -10, y: -22 }, { x: -14, y: -10 },
      { x: 8, y: 16 }, { x: 14, y: 38 },
      { x: -10, y: 16 }, { x: -16, y: 38 }
    ),
    kick: P(
      { x: -2, y: -58 }, { x: -2, y: -40 },
      { x: 4, y: -22 }, { x: 2, y: -6 },
      { x: -12, y: -22 }, { x: -16, y: -8 },
      { x: 18, y: 4 }, { x: 40, y: -2 },    // front leg extended forward
      { x: -10, y: 18 }, { x: -16, y: 38 }
    ),
    beam: P(
      { x: 0, y: -60 }, { x: 0, y: -40 },
      { x: 18, y: -34 }, { x: 34, y: -34 }, // both hands thrust forward together
      { x: 16, y: -36 }, { x: 32, y: -38 },
      { x: 6, y: 16 }, { x: 6, y: 38 },
      { x: -14, y: 16 }, { x: -20, y: 38 }  // braced rear leg
    ),
    hitstun: P(
      { x: -6, y: -58 }, { x: -4, y: -38 },
      { x: -6, y: -26 }, { x: -16, y: -18 }, // arms thrown back
      { x: -8, y: -24 }, { x: -18, y: -14 },
      { x: 4, y: 16 }, { x: 2, y: 38 },
      { x: -12, y: 14 }, { x: -18, y: 38 }
    ),
    ko: P(
      { x: -34, y: 30 }, { x: -18, y: 34 }, // collapsed / lying down
      { x: -8, y: 30 }, { x: 2, y: 38 },
      { x: -10, y: 36 }, { x: -2, y: 40 },
      { x: 14, y: 34 }, { x: 30, y: 38 },
      { x: 12, y: 38 }, { x: 28, y: 40 }
    ),
  };

  function lerp(a, b, t) { return a + (b - a) * t; }

  function lerpPoint(a, b, t) {
    return { x: lerp(a.x, b.x, t), y: lerp(a.y, b.y, t) };
  }

  // Interpolate between two named poses. Returns a fresh pose object.
  function lerpPose(nameA, nameB, t) {
    const a = POSES[nameA] || POSES.idle;
    const b = POSES[nameB] || POSES.idle;
    const out = {};
    for (const k in a) out[k] = lerpPoint(a[k], b[k], t);
    return out;
  }

  function getPose(name) { return POSES[name] || POSES.idle; }

  // Transform a local point to world coords given pelvis pos + facing.
  function tx(px, py, p, facing) {
    return { x: px + p.x * facing, y: py + p.y };
  }

  function line(ctx, a, b) {
    ctx.beginPath();
    ctx.moveTo(a.x, a.y);
    ctx.lineTo(b.x, b.y);
    ctx.stroke();
  }

  // Draw spiky hair as a fan of triangles around the top of the head circle.
  function drawHair(ctx, head, color, facing) {
    const spikes = [
      [-0.9, -0.5], [-0.5, -1.0], [0.0, -1.25],
      [0.5, -1.05], [0.95, -0.55], [-0.15, -0.6], [0.35, -0.7],
    ];
    ctx.fillStyle = color;
    for (const [dx, dy] of spikes) {
      const baseAngleX = dx * facing;
      // Two base points on the head rim + one outer tip.
      const bx1 = head.x + (baseAngleX - 0.28 * facing) * HEAD_R;
      const by1 = head.y + (dy * 0.55) * HEAD_R - 2;
      const bx2 = head.x + (baseAngleX + 0.28 * facing) * HEAD_R;
      const by2 = head.y + (dy * 0.55) * HEAD_R - 2;
      const tipx = head.x + baseAngleX * HEAD_R * 1.7;
      const tipy = head.y + dy * HEAD_R * 1.7;
      ctx.beginPath();
      ctx.moveTo(bx1, by1);
      ctx.lineTo(tipx, tipy);
      ctx.lineTo(bx2, by2);
      ctx.closePath();
      ctx.fill();
    }
  }

  // Main draw. opts: { color, hairColor, charge (0..1) }
  function draw(ctx, x, y, facing, pose, opts) {
    const o = opts || {};
    const bodyColor = o.color || '#e8eefc';

    const pelvis = { x, y };
    const head = tx(x, y, pose.head, facing);
    const chest = tx(x, y, pose.chest, facing);
    const elbowF = tx(x, y, pose.elbowF, facing);
    const handF = tx(x, y, pose.handF, facing);
    const elbowB = tx(x, y, pose.elbowB, facing);
    const handB = tx(x, y, pose.handB, facing);
    const kneeF = tx(x, y, pose.kneeF, facing);
    const footF = tx(x, y, pose.footF, facing);
    const kneeB = tx(x, y, pose.kneeB, facing);
    const footB = tx(x, y, pose.footB, facing);

    ctx.save();
    ctx.lineWidth = 4;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Back limbs first (slightly dimmer for depth).
    ctx.strokeStyle = shade(bodyColor, -0.25);
    line(ctx, chest, elbowB);
    line(ctx, elbowB, handB);
    line(ctx, pelvis, kneeB);
    line(ctx, kneeB, footB);

    // Torso + spine.
    ctx.strokeStyle = bodyColor;
    line(ctx, pelvis, chest);
    line(ctx, chest, { x: head.x, y: head.y + HEAD_R });

    // Front limbs.
    line(ctx, chest, elbowF);
    line(ctx, elbowF, handF);
    line(ctx, pelvis, kneeF);
    line(ctx, kneeF, footF);

    // Head.
    ctx.fillStyle = bodyColor;
    ctx.beginPath();
    ctx.arc(head.x, head.y, HEAD_R, 0, Math.PI * 2);
    ctx.fill();

    // Hair.
    drawHair(ctx, head, o.hairColor || bodyColor, facing);

    // Charging energy orb at the front hand.
    if (o.charge && o.charge > 0) {
      const r = 4 + o.charge * 12;
      const grd = ctx.createRadialGradient(handF.x, handF.y, 1, handF.x, handF.y, r);
      grd.addColorStop(0, '#ffffff');
      grd.addColorStop(0.5, o.hairColor || '#9cf');
      grd.addColorStop(1, 'rgba(120,180,255,0)');
      ctx.fillStyle = grd;
      ctx.beginPath();
      ctx.arc(handF.x, handF.y, r, 0, Math.PI * 2);
      ctx.fill();
    }

    ctx.restore();
  }

  // Lighten/darken a hex color by amount (-1..1).
  function shade(hex, amt) {
    const m = hex.replace('#', '');
    if (m.length !== 6) return hex;
    let r = parseInt(m.slice(0, 2), 16);
    let g = parseInt(m.slice(2, 4), 16);
    let b = parseInt(m.slice(4, 6), 16);
    const f = (c) => Math.max(0, Math.min(255, Math.round(c + 255 * amt)));
    r = f(r); g = f(g); b = f(b);
    return `rgb(${r},${g},${b})`;
  }

  window.Skeleton = { POSES, lerpPose, getPose, draw, HEAD_R };
})();

// Bootstrap: fixed-timestep loop driving Game logic + rendering.
(function () {
  const canvas = document.getElementById('game');
  const ctx = canvas.getContext('2d');

  const game = new Game(ctx);

  const STEP = 1000 / 60; // fixed logic step (ms)
  let last = performance.now();
  let acc = 0;

  function frame(now) {
    let dt = now - last;
    last = now;
    if (dt > 250) dt = 250; // clamp after tab-out
    acc += dt;

    while (acc >= STEP) {
      game.step();
      Input.endFrame(); // clear per-frame edge presses after logic consumes them
      acc -= STEP;
    }

    game.render();
    requestAnimationFrame(frame);
  }

  requestAnimationFrame(frame);
})();

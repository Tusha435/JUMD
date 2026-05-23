// Keyboard input: maps physical keys to per-player logical buttons.
// Exposed globally as `Input`.
(function () {
  // Logical buttons per player.
  const blank = () => ({
    left: false, right: false, up: false, down: false,
    punch: false, kick: false, beam: false,
    special: false, switchWeapon: false,
  });

  const state = { p1: blank(), p2: blank() };

  // Edge-trigger tracking: buttons that were pressed *this* logic frame.
  const pressedThisFrame = { p1: blank(), p2: blank() };
  let anyKeyPressedEdge = false; // for "press any key" rematch

  // physical code -> [player, button]
  const MAP = {
    // Player 1 (left hand cluster)
    KeyA: ['p1', 'left'],
    KeyD: ['p1', 'right'],
    KeyW: ['p1', 'up'],
    KeyS: ['p1', 'down'],
    KeyF: ['p1', 'punch'],
    KeyG: ['p1', 'kick'],
    KeyH: ['p1', 'beam'],
    KeyE: ['p1', 'special'],
    KeyQ: ['p1', 'switchWeapon'],

    // Player 2 (arrows + JKL)
    ArrowLeft: ['p2', 'left'],
    ArrowRight: ['p2', 'right'],
    ArrowUp: ['p2', 'up'],
    ArrowDown: ['p2', 'down'],
    KeyJ: ['p2', 'punch'],
    KeyK: ['p2', 'kick'],
    KeyL: ['p2', 'beam'],
    KeyO: ['p2', 'special'],
    KeyU: ['p2', 'switchWeapon'],
  };

  window.addEventListener('keydown', (e) => {
    anyKeyPressedEdge = true;
    const m = MAP[e.code];
    if (!m) return;
    const [p, btn] = m;
    if (!state[p][btn]) pressedThisFrame[p][btn] = true; // rising edge
    state[p][btn] = true;
    // Stop arrows / space from scrolling the page.
    if (e.code.startsWith('Arrow')) e.preventDefault();
  });

  window.addEventListener('keyup', (e) => {
    const m = MAP[e.code];
    if (!m) return;
    const [p, btn] = m;
    state[p][btn] = false;
  });

  // Clear lost focus -> release everything (avoid stuck keys).
  window.addEventListener('blur', () => {
    state.p1 = blank();
    state.p2 = blank();
  });

  window.Input = {
    // Held state for a player ('p1' | 'p2').
    held: (p) => state[p],
    // True only on the frame a button went down.
    pressed: (p, btn) => pressedThisFrame[p][btn],
    anyPressed: () => anyKeyPressedEdge,
    // Call once at the end of every fixed logic step.
    endFrame: () => {
      pressedThisFrame.p1 = blank();
      pressedThisFrame.p2 = blank();
      anyKeyPressedEdge = false;
    },
  };
})();

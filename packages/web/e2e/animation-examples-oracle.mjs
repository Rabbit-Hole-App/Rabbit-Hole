// Independent oracle for the hand-written /animation examples (src/animation3d/learning-examples.js), in the style of
// animation-oracle.mjs: every number here comes from the formula each example states in words, written by hand. Nothing here imports,
// runs or copies a scene's program. Used by src/animation3d/learning-examples.test.mjs.

// ---- projectile on flat ground, no air: range R = v^2 sin(2 theta) / g; path y = x tan(theta) - g x^2 / (2 v^2 cos^2 theta).
export const GRAVITY = 9.81;
const rad = degrees => degrees * Math.PI / 180;
export const projectileRange = (angle, speed) => speed * speed * Math.sin(rad(2 * angle)) / GRAVITY;
export const projectileHeightAt = (angle, speed, x) => x * Math.tan(rad(angle)) - GRAVITY * x * x / (2 * speed * speed * Math.cos(rad(angle)) ** 2);
// The same flight stepped in time (semi-implicit Euler, 0.1 ms): where it comes back to the ground, independent of the closed form.
export function projectileStepped(angle, speed, dt = 1e-4) {
  let x = 0, y = 0, vy = speed * Math.sin(rad(angle));
  const vx = speed * Math.cos(rad(angle));
  do { vy -= GRAVITY * dt; x += vx * dt; y += vy * dt; } while (y > 0);
  return x;
}
// The game: start at 30 degrees, 14 m/s; angle +-5 within 10..80, speed +-1 within 5..22; a launch inside 30 +- 1.5 m wins; 5 launches
// without one loses; after either, nothing changes.
export function projectileGame(actions) {
  let angle = 30, speed = 14, launches = 0, landed = null, status = 'playing';
  for (const action of actions) {
    if (status !== 'playing') continue;
    if (action === 'angleUp') angle = Math.min(80, angle + 5);
    else if (action === 'angleDown') angle = Math.max(10, angle - 5);
    else if (action === 'faster') speed = Math.min(22, speed + 1);
    else if (action === 'slower') speed = Math.max(5, speed - 1);
    else {
      landed = projectileRange(angle, speed);
      launches += 1;
      if (Math.abs(landed - 30) <= 1.5) status = 'won';
      else if (launches === 5) status = 'lost';
    }
  }
  return { angle, speed, launches, landed, status };
}

// ---- Lotka-Volterra: dx/dt = 1.1 x - 0.4 x y, dy/dt = 0.1 x y - 0.4 y, x(0) = 10, y(0) = 2. A much finer step than the scene's (Heun's
// method, not RK4), so an agreement is not the same arithmetic twice. Its conserved quantity is an independent check on both.
export const predatorInvariant = (x, y) => 0.1 * x - 0.4 * Math.log(x) + 0.4 * y - 1.1 * Math.log(y);
export function predatorPrey(time) {
  const rate = (x, y) => [x * (1.1 - 0.4 * y), y * (0.1 * x - 0.4)];
  const n = Math.max(1, Math.ceil(time / 5e-4)), h = time / n;
  let x = 10, y = 2;
  for (let i = 0; i < n; i += 1) {
    const a = rate(x, y), b = rate(x + h * a[0], y + h * a[1]);
    x += h / 2 * (a[0] + b[0]);
    y += h / 2 * (a[1] + b[1]);
  }
  return { x, y };
}

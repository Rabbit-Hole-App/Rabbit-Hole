
"use strict";

const GRAVITY = 9.8;
const LAUNCH_SPEED = 3;
const TOP_HEIGHT = LAUNCH_SPEED ** 2 / (2 * GRAVITY);
const START = -LAUNCH_SPEED / GRAVITY;
const END = -START;
const PLAYBACK_SLOWDOWN = 10;
const TOP_Y = 59;
const LAUNCH_Y = 189;
const HEIGHT_SCALE = (LAUNCH_Y - TOP_Y) / TOP_HEIGHT;
const VELOCITY_SCALE = 13;
const ACCELERATION_LENGTH = 34;
const MARKERS = [-0.10, 0, 0.10];

const byId = (id) => document.getElementById(id);
const scrubber = byId("time");
const playback = byId("playback");
const status = byId("experiment-status");

function getLane(name, x) {
  return {
    x,
    ball: byId(name + "-ball"),
    arrow: byId(name + "-v"),
    zero: byId(name + "-zero"),
    acceleration: byId(name + "-a"),
    velocity: byId(name + "-velocity"),
    state: byId(name + "-state")
  };
}

const toss = getLane("toss", 192);
const drop = getLane("drop", 435);
const moments = ["before", "top", "after"].map((name) => byId("moment-" + name));

let time = START;
let playing = false;
let previousFrame = null;
let animation = null;

function sample(t) {
  const height = Math.max(0, TOP_HEIGHT - 0.5 * GRAVITY * t * t);
  const velocity = t === 0 ? 0 : -GRAVITY * t;
  const held = t < 0;
  return {
    tossHeight: height,
    tossVelocity: velocity,
    dropHeight: held ? TOP_HEIGHT : height,
    dropVelocity: held ? 0 : velocity,
    held
  };
}

function signed(value, places) {
  const magnitude = Math.abs(value).toFixed(places);
  if (Number(magnitude) === 0) return "0";
  return (value < 0 ? "−" : "+") + magnitude;
}

function showLane(lane, height, velocity, free) {
  const y = LAUNCH_Y - height * HEIGHT_SCALE;
  const zeroVelocity = Math.abs(velocity) < 0.005;
  lane.ball.setAttribute("transform", "translate(" + lane.x + " " + y + ")");
  lane.arrow.setAttribute("y1", y);
  lane.arrow.setAttribute("y2", y - velocity * VELOCITY_SCALE);
  lane.arrow.setAttribute("visibility", zeroVelocity ? "hidden" : "visible");
  lane.zero.setAttribute("cy", y);
  lane.zero.setAttribute("visibility", zeroVelocity ? "visible" : "hidden");
  lane.acceleration.setAttribute("y1", y);
  lane.acceleration.setAttribute("y2", y + ACCELERATION_LENGTH);
  lane.acceleration.setAttribute("visibility", free ? "visible" : "hidden");
  lane.velocity.textContent = signed(velocity, 2) + " m/s";
}


function showNativePlayback(prefix, label) {
  document.getElementById(prefix + "playback-label").textContent = label;
  const icon = document.getElementById(prefix + "native-icon");
  const name = label === "Pause" ? "pause" : "play";
  if (icon.getAttribute("data-icon") === name) return;
  icon.setAttribute("data-icon", name);
  icon.setAttribute("class", "lucide lucide-" + name);
  icon.innerHTML = name === "pause" ? "<rect x=\"14\" y=\"3\" width=\"5\" height=\"18\" rx=\"1\"></rect><rect x=\"5\" y=\"3\" width=\"5\" height=\"18\" rx=\"1\"></rect>" : "<path d=\"M5 5a2 2 0 0 1 3.008-1.728l11.997 6.998a2 2 0 0 1 .003 3.458l-12 7A2 2 0 0 1 5 19z\" />";
}
function updateButton() {
  showNativePlayback("", playing ? "Pause" : time >= END ? "Replay" : "Play");
}

function render(t) {
  time = Math.max(START, Math.min(END, t));
  const state = sample(time);
  showLane(toss, state.tossHeight, state.tossVelocity, true);
  showLane(drop, state.dropHeight, state.dropVelocity, !state.held);
  toss.state.textContent = time < 0 ? "Rising" : time === 0 ? "At the top" : "Falling";
  drop.state.textContent = state.held ? "Held" : time === 0 ? "Released" : "Falling";
  byId("drop-acceleration").textContent = state.held ? "0 m/s²" : "9.8 m/s² ↓";
  byId("gate-left").setAttribute("d", state.held ? "M-29-16V7Q-29 12-24 12H-7" : "M-36-16V7Q-36 12-31 12H-22");
  byId("gate-right").setAttribute("d", state.held ? "M29-16V7Q29 12 24 12H7" : "M36-16V7Q36 12 31 12H22");
  scrubber.value = String(time);
  byId("time-value").textContent = signed(time, 3) + " s";
  scrubber.setAttribute("aria-valuetext", time === 0
    ? "Top, zero seconds"
    : Math.abs(time).toFixed(3) + " seconds " + (time < 0 ? "before" : "after") + " the top");
  moments.forEach((moment, index) => {
    moment.classList.toggle("current", Math.abs(time - MARKERS[index]) < 0.011);
  });
  updateButton();
}

function stopPlayback() {
  playing = false;
  previousFrame = null;
  if (animation !== null) cancelAnimationFrame(animation);
  animation = null;
  updateButton();
}

function animate(now) {
  if (!playing) return;
  if (previousFrame === null) previousFrame = now;
  const delta = (now - previousFrame) / (1000 * PLAYBACK_SLOWDOWN);
  previousFrame = now;
  const next = Math.min(END, time + delta);
  // Render the exact release state when playback passes through the apex.
  render(time < 0 && next >= 0 ? 0 : next);
  if (time >= END) {
    stopPlayback();
    status.textContent = "Both balls reached launch height together.";
  } else {
    animation = requestAnimationFrame(animate);
  }
}

playback.addEventListener("click", () => {
  if (playing) {
    stopPlayback();
    status.textContent = "Paused. " + scrubber.getAttribute("aria-valuetext") + ".";
    return;
  }
  if (time >= END) render(START);
  playing = true;
  previousFrame = null;
  updateButton();
  animation = requestAnimationFrame(animate);
});

function seek(value) {
  stopPlayback();
  const marker = MARKERS.find((point) => Math.abs(point - value) <= 0.006);
  render(marker === undefined ? value : marker);
}

scrubber.addEventListener("input", () => seek(Number(scrubber.value)));
scrubber.addEventListener("keydown", (event) => {
  const offsets = { ArrowLeft: -0.01, ArrowDown: -0.01, ArrowRight: 0.01, ArrowUp: 0.01, PageDown: -0.10, PageUp: 0.10 };
  if (event.key === "Home" || event.key === "End") {
    event.preventDefault();
    seek(event.key === "Home" ? START : END);
  } else if (Object.hasOwn(offsets, event.key)) {
    event.preventDefault();
    seek(time + offsets[event.key]);
  }
});

const snapshotY = 55 + (TOP_HEIGHT - sample(0.10).tossHeight) * HEIGHT_SCALE;
for (const name of ["before", "after"]) {
  byId(name + "-picture").setAttribute("transform", "translate(0 " + snapshotY + ")");
}
render(START);

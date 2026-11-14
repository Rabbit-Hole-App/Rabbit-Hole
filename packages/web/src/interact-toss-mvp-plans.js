// The plans the dev-only pin family `toss-mvp` answers with (INTERACT_DESIGN_FIXTURE=toss-mvp pins by the job's Depth; interact-design-pin.js). DATA ONLY, written by scripts/interact/pick-mvp-plans.mjs: the best passing plan per depth from /docs/features/interact/benchmarks/bench-design-mvp.jsonl.
// A depth with no plan here is not pinned (the real design runs for it). Each plan is a ScenePlan expanded from a plan brief (interact-plan-brief.js expandBrief); the pin binds it to the catalogue the job was offered.
// brief: gemini-3.5-flash-lite attempt 2026-11-14T06:44:45.669Z
// balanced: gemini-3.5-flash-lite attempt 2026-11-14T06:44:55.826Z
export const TOSS_MVP_PLANS = Object.freeze({
 "brief": {
  "schemaVersion": 1,
  "supportingVisuals": [],
  "limitations": [
   "An idealized vertical throw; real balls feel drag."
  ],
  "depth": "brief",
  "title": "At the Highest Point",
  "story": "You toss a tennis ball straight up into the air. As it climbs, it slows down until it hangs suspended for a single, motionless instant at its peak before falling back into your hand. It is easy to watch the ball stop and wonder: if its speed drops to zero at the top, does its acceleration also vanish for that brief moment? Galileo wrestled with how things speed up and slow down, realizing that gravity does not switch off just because a moving object pauses. Let us trace the motion from launch to return and see what happens to velocity and acceleration at the very top.",
  "cardDescription": "Explore a ball thrown straight up. See how velocity changes while acceleration stays constant at $-gravity$, even when the ball stops at the top.",
  "instructions": "Adjust the launch speed and press Play to watch the motion. Use the scrubber or At Top button to inspect the peak.",
  "learningGoal": "Say that gravity still pulls the ball down at the top of its throw, where it is still for an instant.",
  "scene": {
   "description": "One moving ball on a fixed height scale with a launch-height guide; the scale does not change with the launch speed, so a faster toss visibly rises higher. A blue Motion arrow beside the ball shortens on the way up, is absent at the top and points down on the way back. A separate dashed warm gravity arrow keeps the same direction and length throughout. Beside the ball a callout (frame object id callout.toss) names the motion and shows gravity. The scene starts at launch and runs the whole rise and fall. No second ball, graph, equation, number readout or comparison strip.",
   "runtime": {
    "renderer": "program",
    "schemaVersion": 1,
    "sdkVersion": "sdk-8",
    "programTuple": {
     "schemaVersion": 1,
     "sdkVersion": "sdk-8",
     "rendererVersion": "renderer-5",
     "runtimeVersion": "quickjs-release-sync@0.32.0",
     "runtimePolicyVersion": "policy-1",
     "permissionProfileVersion": "perm-1",
     "fingerprints": {
      "engine": "105c3bed22d457e43e3d1c3c1c6959fda62a8fe06f0fc8a985303c3a2be72232",
      "sdk": "023f97b3134cc738caadd6050680eb77e070e2a335312aa627bfec76db09196a",
      "renderer": "renderer-5"
     }
    },
    "requiredHelpers": [],
    "requiredCapabilities": [
     "time_playback",
     "number_inputs",
     "props",
     "figures"
    ],
    "catalogueHash": "34c0bff22e4392e6fc709fea6ffcbded20b3f46955314d3fd2b3fa1a43cd1c05"
   },
   "entities": [
    {
     "id": "ball",
     "label": "Ball",
     "purpose": "The tossed ball (frame object id ball.toss), an SVG glyph that starts at the launch mark."
    },
    {
     "id": "motionArrow",
     "label": "Motion arrow",
     "purpose": "Blue arrow showing the signed velocity (frame object id vec.v, labelled v); absent at the top."
    },
    {
     "id": "gravityArrow",
     "label": "Gravity arrow",
     "purpose": "Dashed warm arrow (frame object id vec.a, labelled a), the same downward length throughout."
    },
    {
     "id": "heightGuide",
     "label": "Launch-height guide",
     "purpose": "A fixed guide at the launch height on one height scale."
    }
   ],
   "quantities": [
    {
     "id": "launchSpeed",
     "label": "Launch speed",
     "unit": "m/s",
     "meaning": "Upward speed at the instant of the throw.",
     "reference": "Measured at the launch mark, up is positive.",
     "formula": "launchSpeed"
    },
    {
     "id": "gravity",
     "label": "Gravity",
     "unit": "m/s^2",
     "meaning": "Magnitude of the constant downward acceleration.",
     "reference": "Idealized, no air resistance.",
     "formula": "gravity"
    },
    {
     "id": "apexTime",
     "label": "Time of the top",
     "unit": "s",
     "meaning": "Elapsed time from launch at which the velocity is zero.",
     "reference": "Elapsed from launch.",
     "relation": "apexTime = launchSpeed / gravity",
     "formula": "launchSpeed / gravity"
    },
    {
     "id": "apexHeight",
     "label": "Height of the top",
     "unit": "m",
     "meaning": "Height of the ball at its top above the ground mark.",
     "reference": "Measured from the ground mark, up is positive.",
     "relation": "apexHeight = launchSpeed * launchSpeed / (2 * gravity)",
     "formula": "launchSpeed * launchSpeed / (2 * gravity)"
    },
    {
     "id": "velocity",
     "label": "Vertical velocity",
     "unit": "m/s",
     "meaning": "Signed rate of change of height, up positive; zero at the top.",
     "reference": "Zero at the top.",
     "relation": "velocity = launchSpeed - gravity * t",
     "formula": "launchSpeed - gravity * t"
    },
    {
     "id": "height",
     "label": "Height of the ball",
     "unit": "m",
     "meaning": "Height above the ground mark, up positive; the launch height is its value at t = 0.",
     "reference": "Measured from the ground mark, up is positive.",
     "relation": "height = 0 + launchSpeed * t - 0.5 * gravity * t^2",
     "formula": "0 + launchSpeed * t - 0.5 * gravity * t^2"
    },
    {
     "id": "acceleration",
     "label": "Vertical acceleration",
     "unit": "m/s^2",
     "meaning": "Signed rate of change of velocity: constant and negative (down), -gravity.",
     "reference": "Constant -gravity during flight.",
     "relation": "acceleration = 0 - gravity",
     "formula": "0 - gravity"
    }
   ],
   "template": "one-body",
   "slots": {
    "height": "height",
    "velocity": "velocity",
    "acceleration": "acceleration"
   },
   "words": {
    "lane": "Vertical Throw",
    "launch": "Launch Mark",
    "gravity_pulls": "Gravity pulls down",
    "gravity_none": "Gravity is constant",
    "motion_up": "Moving upward",
    "motion_top": "At the top for an instant",
    "motion_down": "Moving downward",
    "where_launch": "Thrown from launch",
    "where_top": "At the highest point",
    "where_end": "Returned to launch",
    "where_up": "Rising",
    "where_down": "Falling",
    "readout_motion": "Motion",
    "readout_gravity": "Gravity"
   },
   "observations": [
    {
     "id": "motionArrow",
     "text": "The Motion arrow shortens while the ball rises, is absent at the top and points down while it falls.",
     "quantityIds": [
      "velocity"
     ],
     "readoutIds": [
      "motionState"
     ]
    },
    {
     "id": "gravityConstant",
     "text": "The gravity arrow keeps the same direction and length, so gravity pulls down at the top too.",
     "quantityIds": [
      "acceleration"
     ],
     "readoutIds": [
      "gravityState"
     ]
    },
    {
     "id": "fasterHigher",
     "text": "A faster toss reaches its top later and higher on the same fixed height scale.",
     "quantityIds": [
      "apexTime",
      "apexHeight",
      "height"
     ],
     "readoutIds": []
    }
   ],
   "checkpoints": [
    {
     "id": "rising",
     "label": "Rising",
     "time": {
      "op": "multiply",
      "left": {
       "op": "literal",
       "value": 0.5
      },
      "right": {
       "op": "divide",
       "left": {
        "op": "input",
        "id": "launchSpeed"
       },
       "right": {
        "op": "literal",
        "value": 9.8
       }
      }
     },
     "inputOverrides": {},
     "actions": [],
     "expected": "Moving up: a short blue Motion arrow up, gravity arrow down."
    },
    {
     "id": "top",
     "label": "At the top",
     "time": {
      "op": "divide",
      "left": {
       "op": "input",
       "id": "launchSpeed"
      },
      "right": {
       "op": "literal",
       "value": 9.8
      }
     },
     "inputOverrides": {},
     "actions": [],
     "expected": "Still for an instant at the top: no Motion arrow, gravity arrow still down; playback pauses here."
    },
    {
     "id": "falling",
     "label": "Falling",
     "time": {
      "op": "multiply",
      "left": {
       "op": "literal",
       "value": 1.5
      },
      "right": {
       "op": "divide",
       "left": {
        "op": "input",
        "id": "launchSpeed"
       },
       "right": {
        "op": "literal",
        "value": 9.8
       }
      }
     },
     "inputOverrides": {},
     "actions": [],
     "expected": "Moving down: a short blue Motion arrow down, gravity arrow down."
    },
    {
     "id": "fastTop",
     "label": "Fastest toss at its top",
     "time": {
      "op": "divide",
      "left": {
       "op": "input",
       "id": "launchSpeed"
      },
      "right": {
       "op": "literal",
       "value": 9.8
      }
     },
     "inputOverrides": {
      "launchSpeed": 7
     },
     "actions": [],
     "expected": "At the fastest launch speed the top comes later and higher on the same height scale."
    }
   ],
   "readoutIds": [
    "motionState",
    "gravityState"
   ]
  },
  "mode": {
   "kind": "experiment",
   "initialState": "Launch speed 5 m/s; the ball at the launch mark, time 0.000 s, paused.",
   "fixedValues": {
    "gravity": 9.8
   },
   "adjustableIds": [
    "launchSpeed"
   ],
   "timeline": {
    "label": "Time since launch",
    "unit": "s",
    "start": 0,
    "end": {
     "op": "divide",
     "left": {
      "op": "multiply",
      "left": {
       "op": "literal",
       "value": 2
      },
      "right": {
       "op": "input",
       "id": "launchSpeed"
      }
     },
     "right": {
      "op": "literal",
      "value": 9.8
     }
    },
    "displayOffset": {
     "op": "literal",
     "value": 0
    },
    "markers": [
     {
      "id": "top",
      "label": "Top",
      "time": {
       "op": "divide",
       "left": {
        "op": "input",
        "id": "launchSpeed"
       },
       "right": {
        "op": "literal",
        "value": 9.8
       }
      },
      "pause": true
     }
    ],
    "initialTime": 0,
    "initialPlayback": "paused",
    "playbackRate": 0.3
   },
   "onInputChange": "reset_pause"
  },
  "controls": [
   {
    "id": "play",
    "label": "Play",
    "type": "playback",
    "purpose": "Run the motion and replay it.",
    "selectionReason": "Time explains the change, and the one supported transport drives every linked view.",
    "nativeControlId": "program.playback",
    "binding": {
     "kind": "timeline"
    },
    "labels": {
     "paused": "Play",
     "playing": "Pause",
     "ended": "Replay"
    },
    "affects": [
     {
      "scope": "main",
      "kind": "entity",
      "id": "ball"
     }
    ]
   },
   {
    "id": "scrub",
    "label": "Time since launch",
    "type": "scrubber",
    "purpose": "Inspect any instant of the motion.",
    "selectionReason": "A scrubber lets the learner stop on the instants the explanation compares.",
    "nativeControlId": "program.scrubber",
    "binding": {
     "kind": "timeline"
    },
    "unit": "s",
    "step": 0.01,
    "affects": [
     {
      "scope": "main",
      "kind": "entity",
      "id": "ball"
     },
     {
      "scope": "main",
      "kind": "readout",
      "id": "motionState"
     }
    ]
   },
   {
    "affects": [
     {
      "scope": "main",
      "kind": "entity",
      "id": "ball"
     },
     {
      "scope": "main",
      "kind": "quantity",
      "id": "apexTime"
     },
     {
      "scope": "main",
      "kind": "quantity",
      "id": "apexHeight"
     }
    ],
    "id": "speed",
    "label": "Launch speed",
    "type": "number",
    "purpose": "See how the speed of the toss moves the top without changing what gravity does there.",
    "selectionReason": "The speed varies continuously and intermediate speeds show that the top moves while the pull does not; two named cases would hide that.",
    "nativeControlId": "program.number",
    "binding": {
     "kind": "input",
     "id": "launchSpeed"
    },
    "unit": "m/s",
    "default": 5,
    "min": 3,
    "max": 7,
    "step": 0.5,
    "onChange": "reset_pause"
   },
   {
    "affects": [
     {
      "scope": "main",
      "kind": "entity",
      "id": "ball"
     },
     {
      "scope": "main",
      "kind": "readout",
      "id": "motionState"
     }
    ],
    "id": "atTop",
    "label": "At top",
    "type": "seek",
    "purpose": "Jump to the top of the toss and pause there.",
    "selectionReason": "The top is the one instant the explanation is about; a button reaches it exactly, which dragging the scrubber does not.",
    "nativeControlId": "program.seek",
    "binding": {
     "kind": "marker",
     "id": "top"
    },
    "effect": "Seeks the top marker and pauses."
   },
   {
    "affects": [
     {
      "scope": "main",
      "kind": "quantity",
      "id": "launchSpeed"
     }
    ],
    "id": "resetAll",
    "label": "Reset experiment",
    "type": "reset",
    "purpose": "Return to the defaults.",
    "selectionReason": "Replay keeps the settings; Reset restores them so the learner can start over.",
    "nativeControlId": "program.reset",
    "binding": {
     "kind": "reset"
    },
    "effect": "Restores launch speed 5 m/s and time 0, paused."
   }
  ],
  "claims": [
   {
    "id": "gravityAtTop",
    "text": "At the top the velocity is zero and the acceleration is still downward, so gravity keeps pulling.",
    "evidenceIds": [
     "kinematics_note"
    ],
    "check": "Differentiate v = u - g t: the slope is -g at every t, including the top."
   }
  ],
  "assumptions": [
   "Gravity fixed at 9.8 m/s^2, no air resistance, up is positive."
  ]
 },
 "balanced": {
  "schemaVersion": 1,
  "supportingVisuals": [],
  "limitations": [
   "An idealized vertical throw; real balls feel drag."
  ],
  "depth": "balanced",
  "title": "At the Highest Point",
  "story": "When you toss a ball straight up into the air, it slows down as it climbs, pauses for a fleeting instant at the very top, and then accelerates downward on its way back to your hand.\n\nIt is tempting to think that because the ball stops moving at the peak—meaning its velocity is zero for a split second—its acceleration must also be zero at that exact moment. After all, if gravity stopped pulling, the ball would just float up there.\n\nTo see why this isn't the case, we can track the ball alongside a second ball held at the apex by a gate and released just as the first ball arrives. By observing their velocities and accelerations side by side, we find that gravity never stops acting on the ball, even when its upward motion momentarily ceases.",
  "cardDescription": "Explore what happens to velocity $v$ and acceleration $a$ when a ball reaches the top of a vertical throw ($v = 0$ but $a \\neq 0$).",
  "instructions": "Adjust the launch speed and gravity, then press play to observe both balls.",
  "learningGoal": "Explain why the acceleration is not zero at the top, where the velocity is zero, by comparing the tossed ball with a ball released from rest.",
  "scene": {
   "description": "Two equal-width lanes side by side in one frame: a Toss lane (frame object id lane.toss) and a Drop lane (lane.drop), each with a heading and a state line. Both use the same fixed height scale and the same velocity-arrow and acceleration-arrow scales; zero height is the launch mark, up is positive. A release gate at the apex height holds the second ball (velocity and acceleration zero) until the top, then opens. Each ball (ball.toss, ball.drop) has a blue velocity arrow and a dashed warm acceleration arrow, and a callout (callout.toss, callout.drop) of two readings. After release faint outlines keep the shared starting height. No graph, no mass control, no snapshot strip.",
   "runtime": {
    "renderer": "program",
    "schemaVersion": 1,
    "sdkVersion": "sdk-8",
    "programTuple": {
     "schemaVersion": 1,
     "sdkVersion": "sdk-8",
     "rendererVersion": "renderer-5",
     "runtimeVersion": "quickjs-release-sync@0.32.0",
     "runtimePolicyVersion": "policy-1",
     "permissionProfileVersion": "perm-1",
     "fingerprints": {
      "engine": "105c3bed22d457e43e3d1c3c1c6959fda62a8fe06f0fc8a985303c3a2be72232",
      "sdk": "023f97b3134cc738caadd6050680eb77e070e2a335312aa627bfec76db09196a",
      "renderer": "renderer-5"
     }
    },
    "requiredHelpers": [],
    "requiredCapabilities": [
     "time_playback",
     "number_inputs",
     "props",
     "figures"
    ],
    "catalogueHash": "34c0bff22e4392e6fc709fea6ffcbded20b3f46955314d3fd2b3fa1a43cd1c05"
   },
   "entities": [
    {
     "id": "tossedBall",
     "label": "Tossed ball",
     "purpose": "The ball thrown upward from the launch mark in the Toss lane (frame object id ball.toss)."
    },
    {
     "id": "dropBall",
     "label": "Dropped ball",
     "purpose": "The second ball in the Drop lane (frame object id ball.drop), held by the gate until the top."
    },
    {
     "id": "gate",
     "label": "Release gate",
     "purpose": "Holds the second ball at the apex height, opens at the top."
    },
    {
     "id": "velocityArrow",
     "label": "Velocity arrow",
     "purpose": "Blue arrow with the signed velocity of each ball (frame object ids vec.v.toss, vec.v.drop)."
    },
    {
     "id": "accelerationArrow",
     "label": "Acceleration arrow",
     "purpose": "Dashed warm arrow with the net acceleration of each ball (frame object ids vec.a.toss, vec.a.drop)."
    }
   ],
   "quantities": [
    {
     "id": "launchSpeed",
     "label": "Launch speed",
     "unit": "m/s",
     "meaning": "Upward speed at the instant of the throw.",
     "reference": "Measured at the launch mark, up is positive.",
     "formula": "launchSpeed"
    },
    {
     "id": "gravity",
     "label": "Gravity",
     "unit": "m/s^2",
     "meaning": "Magnitude of the constant downward acceleration.",
     "reference": "Idealized, no air resistance.",
     "formula": "gravity"
    },
    {
     "id": "apexTime",
     "label": "Time of the top",
     "unit": "s",
     "meaning": "Elapsed time from launch at which the velocity is zero.",
     "reference": "Elapsed from launch.",
     "relation": "apexTime = launchSpeed / gravity",
     "formula": "launchSpeed / gravity"
    },
    {
     "id": "apexHeight",
     "label": "Height of the top",
     "unit": "m",
     "meaning": "Height of the ball at its top above the ground mark.",
     "reference": "Measured from the ground mark, up is positive.",
     "relation": "apexHeight = launchSpeed * launchSpeed / (2 * gravity)",
     "formula": "launchSpeed * launchSpeed / (2 * gravity)"
    },
    {
     "id": "tossedVelocity",
     "label": "Toss velocity",
     "unit": "m/s",
     "meaning": "Signed velocity of the tossed ball, up positive; zero at the top.",
     "reference": "Zero at the top.",
     "relation": "tossedVelocity = launchSpeed - gravity * t",
     "formula": "launchSpeed - gravity * t"
    },
    {
     "id": "tossedAcceleration",
     "label": "Toss acceleration",
     "unit": "m/s^2",
     "meaning": "Net acceleration of the tossed ball: -gravity.",
     "reference": "Constant -gravity during flight.",
     "relation": "tossedAcceleration = 0 - gravity",
     "formula": "0 - gravity"
    },
    {
     "id": "tossedHeight",
     "label": "Toss height",
     "unit": "m",
     "meaning": "Height of the tossed ball above the ground mark, up positive.",
     "reference": "Measured from the ground mark, up is positive.",
     "relation": "tossedHeight = launchSpeed * t - 0.5 * gravity * t^2",
     "formula": "launchSpeed * t - 0.5 * gravity * t^2"
    },
    {
     "id": "dropVelocity",
     "label": "Drop velocity",
     "unit": "m/s",
     "meaning": "Signed velocity of the second ball: zero while the gate holds it, then -gravity * (time from the top). Piecewise at the top.",
     "reference": "Up is positive.",
     "formula": "0",
     "switchAt": "launchSpeed / gravity",
     "formulaAfter": "0 - gravity * (t - launchSpeed / gravity)"
    },
    {
     "id": "dropAcceleration",
     "label": "Drop acceleration",
     "unit": "m/s^2",
     "meaning": "Net acceleration of the second ball: zero while the gate holds it, -gravity after the release. Piecewise at the top.",
     "reference": "Up is positive.",
     "formula": "0",
     "switchAt": "launchSpeed / gravity",
     "formulaAfter": "0 - gravity"
    },
    {
     "id": "dropHeight",
     "label": "Drop height",
     "unit": "m",
     "meaning": "Height of the second ball: the apex height while the gate holds it, then equal to the tossed ball. Piecewise at the top (switchAt = launchSpeed / gravity).",
     "reference": "Measured from the ground mark, up is positive.",
     "formula": "launchSpeed * launchSpeed / (2 * gravity)",
     "switchAt": "launchSpeed / gravity",
     "formulaAfter": "launchSpeed * launchSpeed / (2 * gravity) - 0.5 * gravity * (t - launchSpeed / gravity)^2"
    }
   ],
   "template": "two-lane",
   "slots": {
    "toss": {
     "height": "tossedHeight",
     "velocity": "tossedVelocity",
     "acceleration": "tossedAcceleration"
    },
    "drop": {
     "height": "dropHeight",
     "velocity": "dropVelocity",
     "acceleration": "dropAcceleration"
    }
   },
   "words": {
    "lane_first": "Tossed Ball",
    "lane_second": "Released Ball",
    "first_where_launch": "Launch",
    "first_where_top": "At Top",
    "first_where_end": "Returned",
    "first_where_up": "Rising",
    "first_where_down": "Falling",
    "second_where_held": "Held at Apex",
    "second_where_released": "Released",
    "second_where_end": "Landed",
    "second_where_falling": "Falling Together",
    "launch": "Launch Level",
    "axis_label": "Height (m)",
    "v": "v",
    "a": "a"
   },
   "observations": [
    {
     "id": "velocityFlips",
     "text": "The toss velocity changes sign at the top while the acceleration does not.",
     "quantityIds": [
      "tossedVelocity"
     ],
     "readoutIds": [
      "tossedVelocity"
     ]
    },
    {
     "id": "accelerationConstant",
     "text": "The toss acceleration stays at -gravity at every instant, including the top.",
     "quantityIds": [
      "tossedAcceleration"
     ],
     "readoutIds": [
      "tossedAcceleration"
     ]
    },
    {
     "id": "sameAfterRelease",
     "text": "After the release the dropped ball has the same height, velocity and acceleration as the tossed ball at every shared instant.",
     "quantityIds": [
      "tossedHeight",
      "dropVelocity",
      "dropHeight"
     ],
     "readoutIds": [
      "dropVelocity",
      "dropAcceleration"
     ]
    },
    {
     "id": "topMoves",
     "text": "A faster toss or a weaker gravity moves the top later and higher; the readings at the top do not change.",
     "quantityIds": [
      "apexTime",
      "apexHeight"
     ],
     "readoutIds": []
    }
   ],
   "checkpoints": [
    {
     "id": "before",
     "label": "0.10 s before the top",
     "time": {
      "op": "subtract",
      "left": {
       "op": "divide",
       "left": {
        "op": "input",
        "id": "launchSpeed"
       },
       "right": {
        "op": "input",
        "id": "gravity"
       }
      },
      "right": {
       "op": "literal",
       "value": 0.1
      }
     },
     "inputOverrides": {},
     "actions": [],
     "expected": "The toss velocity is positive and the acceleration is -gravity; the second ball is held, with velocity and acceleration zero."
    },
    {
     "id": "top",
     "label": "At the top",
     "time": {
      "op": "divide",
      "left": {
       "op": "input",
       "id": "launchSpeed"
      },
      "right": {
       "op": "input",
       "id": "gravity"
      }
     },
     "inputOverrides": {},
     "actions": [],
     "expected": "The toss velocity is zero and its acceleration is still -gravity; the gate opens and the second ball is released at zero velocity."
    },
    {
     "id": "after",
     "label": "0.10 s after the top",
     "time": {
      "op": "add",
      "left": {
       "op": "divide",
       "left": {
        "op": "input",
        "id": "launchSpeed"
       },
       "right": {
        "op": "input",
        "id": "gravity"
       }
      },
      "right": {
       "op": "literal",
       "value": 0.1
      }
     },
     "inputOverrides": {},
     "actions": [],
     "expected": "Both balls move down at the same velocity with acceleration -gravity."
    },
    {
     "id": "fastTop",
     "label": "Fast toss, weak gravity, at the top",
     "time": {
      "op": "divide",
      "left": {
       "op": "input",
       "id": "launchSpeed"
      },
      "right": {
       "op": "input",
       "id": "gravity"
      }
     },
     "inputOverrides": {
      "launchSpeed": 8,
      "gravity": 5
     },
     "actions": [],
     "expected": "At the fastest toss and the weakest gravity the top comes later and higher; both velocities read zero."
    }
   ],
   "readoutIds": [
    "tossedVelocity",
    "tossedAcceleration",
    "dropVelocity",
    "dropAcceleration"
   ]
  },
  "mode": {
   "kind": "experiment",
   "initialState": "Launch speed 5 m/s, gravity 9.8 m/s^2; both balls at launch height at the start, time 0.000 s, paused.",
   "fixedValues": {},
   "adjustableIds": [
    "launchSpeed",
    "gravity"
   ],
   "timeline": {
    "label": "Time from the top",
    "unit": "s",
    "start": 0,
    "end": {
     "op": "divide",
     "left": {
      "op": "multiply",
      "left": {
       "op": "literal",
       "value": 2
      },
      "right": {
       "op": "input",
       "id": "launchSpeed"
      }
     },
     "right": {
      "op": "input",
      "id": "gravity"
     }
    },
    "displayOffset": {
     "op": "multiply",
     "left": {
      "op": "literal",
      "value": -1
     },
     "right": {
      "op": "divide",
      "left": {
       "op": "input",
       "id": "launchSpeed"
      },
      "right": {
       "op": "input",
       "id": "gravity"
      }
     }
    },
    "markers": [
     {
      "id": "before",
      "label": "-0.10 s",
      "time": {
       "op": "subtract",
       "left": {
        "op": "divide",
        "left": {
         "op": "input",
         "id": "launchSpeed"
        },
        "right": {
         "op": "input",
         "id": "gravity"
        }
       },
       "right": {
        "op": "literal",
        "value": 0.1
       }
      },
      "pause": true
     },
     {
      "id": "top",
      "label": "Top",
      "time": {
       "op": "divide",
       "left": {
        "op": "input",
        "id": "launchSpeed"
       },
       "right": {
        "op": "input",
        "id": "gravity"
       }
      },
      "pause": true
     },
     {
      "id": "after",
      "label": "+0.10 s",
      "time": {
       "op": "add",
       "left": {
        "op": "divide",
        "left": {
         "op": "input",
         "id": "launchSpeed"
        },
        "right": {
         "op": "input",
         "id": "gravity"
        }
       },
       "right": {
        "op": "literal",
        "value": 0.1
       }
      },
      "pause": true
     }
    ],
    "initialTime": 0,
    "initialPlayback": "paused",
    "playbackRate": 0.3
   },
   "onInputChange": "reset_pause"
  },
  "controls": [
   {
    "id": "play",
    "label": "Play",
    "type": "playback",
    "purpose": "Run the motion and replay it.",
    "selectionReason": "Time explains the change, and the one supported transport drives every linked view.",
    "nativeControlId": "program.playback",
    "binding": {
     "kind": "timeline"
    },
    "labels": {
     "paused": "Play",
     "playing": "Pause",
     "ended": "Replay"
    },
    "affects": [
     {
      "scope": "main",
      "kind": "entity",
      "id": "tossedBall"
     },
     {
      "scope": "main",
      "kind": "entity",
      "id": "dropBall"
     }
    ]
   },
   {
    "id": "scrub",
    "label": "Time from the top",
    "type": "scrubber",
    "purpose": "Inspect any instant of the motion.",
    "selectionReason": "A scrubber lets the learner stop on the instants the explanation compares.",
    "nativeControlId": "program.scrubber",
    "binding": {
     "kind": "timeline"
    },
    "unit": "s",
    "step": 0.01,
    "affects": [
     {
      "scope": "main",
      "kind": "entity",
      "id": "tossedBall"
     },
     {
      "scope": "main",
      "kind": "entity",
      "id": "dropBall"
     },
     {
      "scope": "main",
      "kind": "readout",
      "id": "tossedVelocity"
     },
     {
      "scope": "main",
      "kind": "readout",
      "id": "dropVelocity"
     }
    ]
   },
   {
    "affects": [
     {
      "scope": "main",
      "kind": "entity",
      "id": "tossedBall"
     },
     {
      "scope": "main",
      "kind": "quantity",
      "id": "apexTime"
     },
     {
      "scope": "main",
      "kind": "quantity",
      "id": "apexHeight"
     }
    ],
    "id": "speed",
    "label": "Launch speed",
    "type": "number",
    "purpose": "See how the speed of the toss moves the top without changing what gravity does there.",
    "selectionReason": "The speed varies continuously and intermediate speeds show that the top moves while the pull does not; two named cases would hide that.",
    "nativeControlId": "program.number",
    "binding": {
     "kind": "input",
     "id": "launchSpeed"
    },
    "unit": "m/s",
    "default": 5,
    "min": 3,
    "max": 8,
    "step": 0.5,
    "onChange": "reset_pause"
   },
   {
    "affects": [
     {
      "scope": "main",
      "kind": "entity",
      "id": "accelerationArrow"
     },
     {
      "scope": "main",
      "kind": "quantity",
      "id": "apexTime"
     },
     {
      "scope": "main",
      "kind": "readout",
      "id": "tossedAcceleration"
     }
    ],
    "id": "gravityControl",
    "label": "Gravity",
    "type": "number",
    "purpose": "See that a different gravity changes the acceleration and the time to the top, not the idea.",
    "selectionReason": "Gravity varies continuously and the learner can compare nearby values; two planets would hide that.",
    "nativeControlId": "program.number",
    "binding": {
     "kind": "input",
     "id": "gravity"
    },
    "unit": "m/s^2",
    "default": 9.8,
    "min": 5,
    "max": 15,
    "step": 0.1,
    "onChange": "reset_pause"
   },
   {
    "affects": [
     {
      "scope": "main",
      "kind": "entity",
      "id": "gate"
     },
     {
      "scope": "main",
      "kind": "readout",
      "id": "tossedVelocity"
     }
    ],
    "id": "atTop",
    "label": "At top",
    "type": "seek",
    "purpose": "Jump to the top of the toss and pause there.",
    "selectionReason": "The top is the one instant the explanation is about; a button reaches it exactly, which dragging the scrubber does not.",
    "nativeControlId": "program.seek",
    "binding": {
     "kind": "marker",
     "id": "top"
    },
    "effect": "Seeks the top marker and pauses."
   },
   {
    "affects": [
     {
      "scope": "main",
      "kind": "quantity",
      "id": "launchSpeed"
     }
    ],
    "id": "resetAll",
    "label": "Reset experiment",
    "type": "reset",
    "purpose": "Return to the defaults.",
    "selectionReason": "Replay keeps the settings; Reset restores them so the learner can start over.",
    "nativeControlId": "program.reset",
    "binding": {
     "kind": "reset"
    },
    "effect": "Restores launch speed 5 m/s, gravity 9.8 m/s^2 and time 0, paused."
   }
  ],
  "claims": [
   {
    "id": "sameAfterRelease",
    "text": "After the release both balls share height, velocity and acceleration at every instant, and the toss acceleration is -gravity throughout.",
    "evidenceIds": [
     "kinematics_note"
    ],
    "check": "Toss: y = u t - g t^2 / 2 about its top equals y_top - g tau^2 / 2, the same as a ball released from rest at the top."
   }
  ],
  "assumptions": [
   "No air resistance, the same gravity for both balls, up is positive."
  ]
 }
});
// Where each plan came from, for the ledger's designModel / designKind / msFill columns (interact-ledger.js, jobs pinned to toss-mvp-<depth>): the model of the bench row, its fill time in ms, and the attempt's timestamp.
export const TOSS_MVP_META = Object.freeze({
 "brief": {
  "designModel": "stand-in",
  "msFill": null,
  "jobTs": null
 },
 "balanced": {
  "designModel": "stand-in",
  "msFill": null,
  "jobTs": null
 },
 "detailed": {
  "designModel": "stand-in",
  "msFill": null,
  "jobTs": null
 }
});

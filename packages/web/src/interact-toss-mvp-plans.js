// The plans the dev-only pin family `toss-mvp` answers with (INTERACT_DESIGN_FIXTURE=toss-mvp pins by the job's Depth; interact-design-pin.js). DATA ONLY, written by scripts/interact/pick-mvp-plans.mjs: the stand-in data (extractBrief -> expandBrief of the three pinned toss plans).
// A depth with no plan here is not pinned (the real design runs for it). Each plan is a ScenePlan expanded from a plan brief (interact-plan-brief.js expandBrief); the pin binds it to the catalogue the job was offered.
// brief: stand-in: extractBrief -> expandBrief of the pinned tossOverview
// balanced: stand-in: extractBrief -> expandBrief of the pinned tossStandard
// detailed: stand-in: extractBrief -> expandBrief of the pinned tossDeep
export const TOSS_MVP_PLANS = Object.freeze({
 "brief": {
  "schemaVersion": 1,
  "supportingVisuals": [],
  "limitations": [
   "An idealized vertical throw; real balls feel drag."
  ],
  "depth": "brief",
  "title": "The ball stops rising. Gravity doesn’t stop.",
  "story": "Maya tossed a tennis ball straight up for a serve. It seemed to hang above her. She swung and missed.\n\n\"I thought it was waiting up there,\" she said.\n\nShe tossed it again and watched. The ball rose more slowly, stopped for an instant at the top, and then started down.\n\n\"If it stopped, why did it come back down?\"\n\nAt the top of the throw, the ball had stopped moving upward. For that instant its velocity was zero. But nothing was holding it up.\n\nGravity was still pulling down. It had slowed the ball on the way up, and now it was speeding it up on the way down.\n\nOn her next toss, Maya started her swing a little earlier. This time she heard the ball pop against the strings.",
  "cardDescription": "Gravity slows the ball on the way up and speeds it up on the way down. At the top, the ball is still for an instant. Gravity is already pulling it downward.",
  "instructions": "Change launch speed, then press Play. At the top, playback pauses so you can inspect the arrows. Press Play again to watch the ball fall, or drag the timeline to inspect any moment.",
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
     "label": "Gravitational acceleration",
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
     "relation": "apexHeight = launchSpeed^2 / (2 * gravity)",
     "formula": "launchSpeed^2 / (2 * gravity)"
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
     "relation": "height = launchSpeed * t - gravity * t^2 / 2",
     "formula": "launchSpeed * t - gravity * t^2 / 2"
    },
    {
     "id": "acceleration",
     "label": "Vertical acceleration",
     "unit": "m/s^2",
     "meaning": "Signed rate of change of velocity: constant and negative (down), -gravity.",
     "reference": "Constant -gravity during flight.",
     "relation": "acceleration = -gravity",
     "formula": "-gravity"
    }
   ],
   "template": "one-body",
   "slots": {
    "height": "height",
    "velocity": "velocity",
    "acceleration": "acceleration"
   },
   "words": {
    "lane": "One toss",
    "launch": "Launch height",
    "gravity_pulls": "Gravity pulls down",
    "gravity_none": "No pull",
    "motion_up": "Moving up",
    "motion_top": "Still for an instant",
    "motion_down": "Moving down",
    "where_launch": "At launch",
    "where_top": "At the top",
    "where_end": "Back at launch height",
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
      "launchSpeed": 5
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
   "initialState": "Launch speed 4 m/s; the ball at the launch mark, time 0.000 s, paused.",
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
    "playbackRate": 0.2
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
    "default": 4,
    "min": 2,
    "max": 5,
    "step": 0.1,
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
    "effect": "Restores launch speed 4 m/s and time 0, paused."
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
  "title": "Zero velocity isn’t zero acceleration.",
  "story": "Maya tossed the ball straight up, waited for it to hang at the top, and swung. By then it had dropped below her racket.\n\n\"I don't get it,\" she said. \"If it stopped, how was it still accelerating?\"\n\nHer friend picked up the ball and held it at shoulder height. \"Watch what happens the moment I let go.\"\n\nHe opened his fingers. The ball began to fall. It started with zero velocity, and gravity immediately began giving it downward speed.\n\nMaya looked up. Her own ball had passed through that same moment. The difference was how it got there. Her hand had sent it upward, and gravity had been slowing its climb from the moment it left her fingers.\n\nShe pictured three instants around the top. A tenth of a second before, it was moving up at about a metre per second. At the top, its velocity was zero. A tenth of a second later, it was moving down at about a metre per second.\n\nVelocity tells you how fast something is moving and which way. Acceleration tells you how quickly that velocity changes. In each tenth of a second, the ball's velocity changed by about one metre per second downward. Zero was one of the values it passed through.\n\nMaya took another ball. She began her swing while it was still climbing and met it as it came down. This one cleared the net.",
  "cardDescription": "At the top, velocity is zero for an instant, but gravity keeps changing it: $a = -g$. The gate releases a second ball at that moment. Both then fall together from rest. No air resistance.",
  "instructions": "Change launch speed or gravity, then press Play. At each pause, compare velocity and acceleration. Press Play again to continue, or drag the timeline. At top jumps to the shared release.",
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
     "label": "Gravitational acceleration",
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
     "relation": "apexHeight = launchSpeed^2 / (2 * gravity)",
     "formula": "launchSpeed^2 / (2 * gravity)"
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
     "relation": "tossedAcceleration = -gravity",
     "formula": "-gravity"
    },
    {
     "id": "tossedHeight",
     "label": "Toss height",
     "unit": "m",
     "meaning": "Height of the tossed ball above the ground mark, up positive.",
     "reference": "Measured from the ground mark, up is positive.",
     "relation": "tossedHeight = launchSpeed * t - gravity * t^2 / 2",
     "formula": "launchSpeed * t - gravity * t^2 / 2"
    },
    {
     "id": "dropVelocity",
     "label": "Drop velocity",
     "unit": "m/s",
     "meaning": "Signed velocity of the second ball: zero while the gate holds it, then -gravity * (time from the top). Piecewise at the top.",
     "reference": "Up is positive.",
     "formula": "0",
     "switchAt": "launchSpeed / gravity",
     "formulaAfter": "-gravity * (t - launchSpeed / gravity)"
    },
    {
     "id": "dropAcceleration",
     "label": "Drop acceleration",
     "unit": "m/s^2",
     "meaning": "Net acceleration of the second ball: zero while the gate holds it, -gravity after the release. Piecewise at the top.",
     "reference": "Up is positive.",
     "formula": "0",
     "switchAt": "launchSpeed / gravity",
     "formulaAfter": "-gravity"
    },
    {
     "id": "dropHeight",
     "label": "Drop height",
     "unit": "m",
     "meaning": "Height of the second ball: the apex height while the gate holds it, then equal to the tossed ball. Piecewise at the top (switchAt = launchSpeed / gravity).",
     "reference": "Measured from the ground mark, up is positive.",
     "formula": "launchSpeed^2 / (2 * gravity)",
     "switchAt": "launchSpeed / gravity",
     "formulaAfter": "launchSpeed * t - gravity * t^2 / 2"
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
    "lane_first": "Toss",
    "lane_second": "Drop",
    "first_where_launch": "At launch",
    "first_where_top": "At the top",
    "first_where_end": "At launch height",
    "first_where_up": "Rising",
    "first_where_down": "Falling",
    "second_where_held": "Held in place",
    "second_where_released": "Just released",
    "second_where_end": "At launch height",
    "second_where_falling": "Falling together",
    "launch": "Launch height",
    "axis_label": "Height",
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
      "launchSpeed": 5,
      "gravity": 6
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
   "initialState": "Launch speed 4 m/s, gravity 9.8 m/s^2; both balls at launch height at the start, time 0.000 s, paused.",
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
    "playbackRate": 0.2
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
    "default": 4,
    "min": 2,
    "max": 5,
    "step": 0.1,
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
    "min": 6,
    "max": 12,
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
    "effect": "Restores launch speed 4 m/s, gravity 9.8 m/s^2 and time 0, paused."
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
 },
 "detailed": {
  "schemaVersion": 1,
  "supportingVisuals": [],
  "limitations": [
   "An idealized vertical throw; real balls feel drag."
  ],
  "depth": "detailed",
  "title": "Zero velocity. Nonzero acceleration.",
  "story": "Maya missed her serve again. The ball had looked still for just long enough to persuade her she could wait. She wanted to know how much time her eyes had actually seen.\n\nHer friend gave her a clue by dropping a ball from his hand. At the instant it came free, its velocity was zero. Gravity was already accelerating it downward. Maya wondered if she could use that same starting point to calculate what happened around the top of her throw.\n\nShe took upward as positive and set t = 0 at the highest point. For the calculation, she treated the throw as vertical and ignored air resistance. The ball's weight was F = -m g, so Newton's second law gave her a = F / m = -g, about -9.8 m/s^2. There was no special case in that calculation for the moment when the ball stopped rising.\n\nWith zero velocity at t = 0, she could write its velocity and height on either side of the top.\n\nv(t) = -g t, y(t) = y_top - g t^2 / 2.\n\nThe velocity told the story she expected. A tenth of a second before the top, it was moving up at about 0.98 m/s. A tenth after, it was moving down at the same speed. The velocity had changed by nearly two metres per second in just a fifth of a second.\n\nThe height surprised her. At both those instants, the ball was only 4.9 centimetres below the top. For that whole fifth of a second, it stayed within a space smaller than the width of the ball itself. That was enough to make it look as if it hung there.\n\nOn the next serve, she saw the same little hesitation in the air. This time she was already swinging.",
  "cardDescription": "At the top, $v = 0$, but the velocity–time slope stays $a = -g$. Gravity’s force is $F_g = mg$: more mass means more force, with the same acceleration. No air resistance.",
  "instructions": "Change launch speed or gravity, then press Play. Compare the readings at each pause near the top. Change mass while paused to compare force and acceleration. Press Play again or drag the timeline to continue.",
  "learningGoal": "Explain that the force of gravity is m g and the acceleration is -g at every instant, including the top, so a larger mass changes the force and not the motion.",
  "scene": {
   "description": "Two equal-width scenes side by side in one frame. Left, the motion: a ball (frame object id ball.toss) on a height ruler fixed to the highest top, zero at the launch mark, up positive, with a blue velocity arrow (vec.v), a separate dashed warm acceleration arrow (vec.a) and a callout (callout.toss) beside it reading velocity, acceleration and the downward gravitational force, plus a state line. Right, velocity over time (plot.vt): the line on fixed scales, a linked marker and a note with the slope. Ball, marker and readings move together. No snapshot strip.",
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
     "purpose": "The tossed ball on the height ruler (frame object id ball.toss)."
    },
    {
     "id": "velocityArrow",
     "label": "Velocity arrow",
     "purpose": "Blue arrow with the signed velocity (frame object id vec.v, labelled v)."
    },
    {
     "id": "accelerationArrow",
     "label": "Acceleration arrow",
     "purpose": "Dashed warm arrow with the constant -gravity (frame object id vec.a, labelled a)."
    },
    {
     "id": "velocityGraph",
     "label": "Velocity-time graph",
     "purpose": "The velocity line with a linked marker and the slope segment (frame object id plot.vt)."
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
     "label": "Gravitational acceleration",
     "unit": "m/s^2",
     "meaning": "Magnitude of the constant downward acceleration.",
     "reference": "Idealized, no air resistance.",
     "formula": "gravity"
    },
    {
     "id": "mass",
     "label": "Mass",
     "unit": "kg",
     "meaning": "Mass of the ball.",
     "reference": "Does not change the motion.",
     "formula": "mass"
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
     "relation": "apexHeight = launchSpeed^2 / (2 * gravity)",
     "formula": "launchSpeed^2 / (2 * gravity)"
    },
    {
     "id": "height",
     "label": "Height of the ball",
     "unit": "m",
     "meaning": "Height above the ground mark, up positive; the launch height is its value at t = 0.",
     "reference": "Measured from the ground mark, up is positive.",
     "relation": "height = launchSpeed * t - gravity * t^2 / 2",
     "formula": "launchSpeed * t - gravity * t^2 / 2"
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
     "id": "acceleration",
     "label": "Vertical acceleration",
     "unit": "m/s^2",
     "meaning": "Signed rate of change of velocity: constant and negative (down), -gravity.",
     "reference": "Constant -gravity during flight.",
     "relation": "acceleration = -gravity",
     "formula": "-gravity"
    },
    {
     "id": "force",
     "label": "Gravitational force",
     "unit": "N",
     "meaning": "Magnitude of the downward force of gravity on the ball (positive, the arrow draws it down).",
     "reference": "Downward.",
     "relation": "force = mass * gravity",
     "formula": "mass * gravity"
    }
   ],
   "template": "body-plot",
   "slots": {
    "height": "height",
    "velocity": "velocity",
    "acceleration": "acceleration",
    "force": "force",
    "plotted": "velocity"
   },
   "words": {
    "lane": "The motion",
    "launch": "Launch height",
    "axis_label": "Height",
    "v": "v",
    "a": "a",
    "force": "Fg",
    "where_launch": "Ready to toss",
    "where_top": "At the top",
    "where_end": "Back at launch height",
    "where_up": "Rising",
    "where_down": "Falling",
    "plot_heading": "Velocity over time",
    "plot_yLabel": "Velocity",
    "plot_line": "v = u − g t",
    "plot_now": "now",
    "plot_slope": "Slope a = ",
    "plot_eq": "v = ",
    "readout_motion": "Motion"
   },
   "observations": [
    {
     "id": "velocitySamples",
     "text": "The velocity follows the straight line v = u - g t and is zero at the top.",
     "quantityIds": [
      "velocity"
     ],
     "readoutIds": [
      "velocity"
     ]
    },
    {
     "id": "accelerationSlope",
     "text": "The slope of the velocity line is -gravity at every instant, so the acceleration is nonzero at the top.",
     "quantityIds": [
      "acceleration"
     ],
     "readoutIds": [
      "acceleration"
     ]
    },
    {
     "id": "forceByMass",
     "text": "The force at the top is mass times gravity, while the trajectory and the velocity graph stay identical.",
     "quantityIds": [
      "force",
      "height"
     ],
     "readoutIds": [
      "force"
     ]
    },
    {
     "id": "topMoves",
     "text": "A faster toss or a weaker gravity moves the top later and higher on the fixed scales.",
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
     "expected": "Velocity positive, acceleration -gravity, force mass times gravity."
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
     "expected": "The velocity is zero, the acceleration -gravity and the force mass times gravity, downward."
    },
    {
     "id": "heavyTop",
     "label": "At the top with the largest mass",
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
      "mass": 3
     },
     "actions": [],
     "expected": "The force is larger; velocity, acceleration and height are exactly as at the default mass."
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
      "launchSpeed": 5,
      "gravity": 6
     },
     "actions": [],
     "expected": "At the fastest toss and the weakest gravity the top comes later and higher; velocity zero, acceleration -gravity."
    }
   ],
   "readoutIds": [
    "velocity",
    "acceleration",
    "force",
    "motionState"
   ]
  },
  "mode": {
   "kind": "experiment",
   "initialState": "Launch speed 4 m/s, gravity 9.8 m/s^2, mass 1 kg; the ball at the launch mark, time 0.000 s, paused.",
   "fixedValues": {},
   "adjustableIds": [
    "launchSpeed",
    "gravity",
    "mass"
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
      "op": "input",
      "id": "gravity"
     }
    },
    "displayOffset": {
     "op": "literal",
     "value": 0
    },
    "markers": [
     {
      "id": "before",
      "label": "Top -0.10 s",
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
      "label": "Top +0.10 s",
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
    "playbackRate": 0.2
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
     },
     {
      "scope": "main",
      "kind": "entity",
      "id": "velocityGraph"
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
      "kind": "entity",
      "id": "velocityGraph"
     },
     {
      "scope": "main",
      "kind": "readout",
      "id": "velocity"
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
    "default": 4,
    "min": 2,
    "max": 5,
    "step": 0.1,
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
      "id": "acceleration"
     },
     {
      "scope": "main",
      "kind": "readout",
      "id": "force"
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
    "min": 6,
    "max": 12,
    "step": 0.1,
    "onChange": "reset_pause"
   },
   {
    "affects": [
     {
      "scope": "main",
      "kind": "readout",
      "id": "force"
     }
    ],
    "id": "massControl",
    "label": "Mass",
    "type": "number",
    "purpose": "See that mass changes the force of gravity and leaves the acceleration and the motion unchanged.",
    "selectionReason": "The mass varies continuously, and the learner changes it while paused at the top to compare force and acceleration at the same instant.",
    "nativeControlId": "program.number",
    "binding": {
     "kind": "input",
     "id": "mass"
    },
    "unit": "kg",
    "default": 1,
    "min": 0.2,
    "max": 3,
    "step": 0.1,
    "onChange": "recompute_still"
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
    "effect": "Restores launch speed 4 m/s, gravity 9.8 m/s^2, mass 1 kg and time 0, paused."
   }
  ],
  "claims": [
   {
    "id": "forceAndAcceleration",
    "text": "The gravitational force is m g and the acceleration is -g at every instant, so doubling the mass doubles the force and leaves the motion unchanged.",
    "evidenceIds": [
     "kinematics_note"
    ],
    "check": "a = F / m = -m g / m = -g; v = u - g t and y = u t - g t^2 / 2 do not contain m."
   }
  ],
  "assumptions": [
   "No air resistance, up is positive."
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

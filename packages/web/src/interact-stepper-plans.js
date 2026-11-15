// Pinned ScenePlan data, expanded from the approved Brief merge-sort composition.
// The pin rebinds the catalogue hash to the capabilities offered to its job.
// The design story is separate from the approved visible card copy.
// interact-stepper-pins.test.js proves exact expansion and typed ScenePlan admission.
export const STEPPER_PLANS = Object.freeze({
  "stepper-merge-sort-brief": {
    "schemaVersion": 1,
    "depth": "brief",
    "title": "Split first. Merge in order.",
    "story": "A learner watches merge sort handle a short row of values. Split exposes smaller groups; selecting Merge makes the already sorted groups feed one output row. Step back and forward to see that the whole row is not sorted in one jump: comparisons choose the next value from an ordered group. The rail holds each state until the learner changes it, so the merge is the evidence to inspect rather than a fleeting animation.",
    "cardDescription": "Input splits into Left half and Right half, then Singles. Merge left and Merge right put those small runs in order; Sorted output joins them by taking the smaller front value.",
    "instructions": "Use Next or the step slider. Pause at Merge small runs to see where ordering begins.",
    "learningGoal": "The merge creates order by taking the smaller head from two already ordered runs; splitting alone does not sort.",
    "supportingVisuals": [],
    "scene": {
      "description": "Family stepper-states. A rail, fixed picture and selected-state callout.\nA 640 px adjustable still scene with two to 4 ordered states per variant. No elapsed time or playback.\nChoose algorithm-over-collection, protocol-between-parties or cycle-of-phases and fill its closed typed data.",
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
          "inputs_v2"
        ],
        "catalogueHash": "94f0d79c050cb092691f6c937d8d00fd13bdaa1d28f50eec3cb213bbd8bcf06e"
      },
      "entities": [
        {
          "id": "rail",
          "label": "State rail",
          "purpose": "Show the state rail from the declared state data."
        },
        {
          "id": "picture",
          "label": "Teaching picture",
          "purpose": "Show the teaching picture from the declared state data."
        },
        {
          "id": "callout",
          "label": "Selected-state explanation",
          "purpose": "Show the selected-state explanation from the declared state data."
        }
      ],
      "quantities": [],
      "template": "stepper-brief",
      "slots": {},
      "words": {
        "heading": "Split and merge",
        "current": "Current",
        "previous": "Previous",
        "completed": "Completed"
      },
      "readoutIds": [],
      "data": {
        "schemaVersion": 1,
        "status": "reference-proposal",
        "id": "overview-stepper-merge-sort",
        "family": "stepper-states",
        "depth": "brief",
        "canonical": "algorithm-over-collection",
        "story": "Input splits into Left half and Right half, then Singles. Merge left and Merge right put those small runs in order; Sorted output joins them by taking the smaller front value.",
        "aha": {
          "stateId": "halves",
          "observation": "The merge creates order by taking the smaller head from two already ordered runs; splitting alone does not sort."
        },
        "layout": {
          "preset": "algorithm-over-collection",
          "width": 640
        },
        "parts": [
          {
            "id": "rail",
            "kind": "step-rail",
            "bind": {
              "items": "variant.states",
              "active": "inputs.step"
            }
          },
          {
            "id": "picture",
            "kind": "fixed-picture",
            "bind": {
              "regions": "variant.regions",
              "links": "variant.links",
              "active": "state.active"
            }
          },
          {
            "id": "callout",
            "kind": "active-callout",
            "bind": {
              "target": "state.calloutRegion",
              "text": "state.sentence"
            }
          }
        ],
        "controls": [
          {
            "id": "step",
            "kind": "index",
            "presentation": "slider",
            "items": "variant.states",
            "default": 0
          },
          {
            "id": "reset",
            "kind": "reset"
          }
        ],
        "data": {
          "variants": [
            {
              "label": "4, 1, 3, 2",
              "regions": [
                {
                  "id": "input",
                  "label": "Input",
                  "values": [
                    4,
                    1,
                    3,
                    2
                  ]
                },
                {
                  "id": "left",
                  "label": "Left half",
                  "values": [
                    4,
                    1
                  ]
                },
                {
                  "id": "right",
                  "label": "Right half",
                  "values": [
                    3,
                    2
                  ]
                },
                {
                  "id": "singles",
                  "label": "Singles",
                  "values": [
                    4,
                    1,
                    3,
                    2
                  ]
                },
                {
                  "id": "mergeLeft",
                  "label": "Merge left",
                  "values": [
                    1,
                    4
                  ]
                },
                {
                  "id": "mergeRight",
                  "label": "Merge right",
                  "values": [
                    2,
                    3
                  ]
                },
                {
                  "id": "output",
                  "label": "Sorted output",
                  "values": [
                    1,
                    2,
                    3,
                    4
                  ]
                }
              ],
              "links": [
                {
                  "from": "input",
                  "to": "left"
                },
                {
                  "from": "input",
                  "to": "right"
                },
                {
                  "from": "left",
                  "to": "singles"
                },
                {
                  "from": "right",
                  "to": "singles"
                },
                {
                  "from": "singles",
                  "to": "mergeLeft"
                },
                {
                  "from": "singles",
                  "to": "mergeRight"
                },
                {
                  "from": "mergeLeft",
                  "to": "output"
                },
                {
                  "from": "mergeRight",
                  "to": "output"
                }
              ],
              "states": [
                {
                  "id": "split",
                  "label": "Split in half",
                  "short": "Split",
                  "sentence": "Left half is a smaller sorting problem; Right half follows the same steps.",
                  "why": "Splitting preserves the values; it does not order them.",
                  "active": [
                    "left"
                  ],
                  "calloutRegion": "left",
                  "readouts": []
                },
                {
                  "id": "singles",
                  "label": "Reach singles",
                  "short": "Singles",
                  "sentence": "Singles need no sorting: each little run is already ordered.",
                  "why": "A run with only one value cannot be out of order.",
                  "active": [
                    "singles"
                  ],
                  "calloutRegion": "singles",
                  "readouts": []
                },
                {
                  "id": "halves",
                  "label": "Merge small runs",
                  "short": "Merge",
                  "sentence": "Merge left puts its small run in order; Merge right repeats the same operation.",
                  "why": "Choose the smaller front value next.",
                  "active": [
                    "mergeLeft"
                  ],
                  "calloutRegion": "mergeLeft",
                  "readouts": []
                },
                {
                  "id": "finish",
                  "label": "Finish merging",
                  "short": "Finish",
                  "sentence": "Sorted output takes the smaller front repeatedly, then any remaining tail.",
                  "why": "Once a run is empty, the other tail is already in order.",
                  "active": [
                    "output"
                  ],
                  "calloutRegion": "output",
                  "readouts": []
                }
              ],
              "calculations": {
                "left": {
                  "result": [
                    1,
                    4
                  ],
                  "comparisons": 1,
                  "decisions": [
                    {
                      "left": 4,
                      "right": 1,
                      "chosen": 1,
                      "result": [
                        1
                      ]
                    }
                  ]
                },
                "right": {
                  "result": [
                    2,
                    3
                  ],
                  "comparisons": 1,
                  "decisions": [
                    {
                      "left": 3,
                      "right": 2,
                      "chosen": 2,
                      "result": [
                        2
                      ]
                    }
                  ]
                },
                "final": {
                  "result": [
                    1,
                    2,
                    3,
                    4
                  ],
                  "comparisons": 3,
                  "decisions": [
                    {
                      "left": 1,
                      "right": 2,
                      "chosen": 1,
                      "result": [
                        1
                      ]
                    },
                    {
                      "left": 4,
                      "right": 2,
                      "chosen": 2,
                      "result": [
                        1,
                        2
                      ]
                    },
                    {
                      "left": 4,
                      "right": 3,
                      "chosen": 3,
                      "result": [
                        1,
                        2,
                        3
                      ]
                    }
                  ]
                },
                "total": 5
              }
            }
          ]
        }
      },
      "observations": [
        {
          "id": "aha",
          "text": "The merge creates order by taking the smaller head from two already ordered runs; splitting alone does not sort.",
          "quantityIds": [],
          "readoutIds": []
        }
      ],
      "checkpoints": [
        {
          "id": "state0",
          "label": "Split in half",
          "time": null,
          "inputOverrides": {
            "step": 0
          },
          "actions": [],
          "expected": "Left half is a smaller sorting problem; Right half follows the same steps."
        },
        {
          "id": "state1",
          "label": "Merge small runs",
          "time": null,
          "inputOverrides": {
            "step": 2
          },
          "actions": [],
          "expected": "Merge left puts its small run in order; Merge right repeats the same operation."
        },
        {
          "id": "state2",
          "label": "Finish merging",
          "time": null,
          "inputOverrides": {
            "step": 3
          },
          "actions": [],
          "expected": "Sorted output takes the smaller front repeatedly, then any remaining tail."
        }
      ]
    },
    "mode": {
      "kind": "static",
      "initialState": "The first selected state is Split in half.",
      "fixedValues": {},
      "adjustableIds": [
        "step"
      ],
      "timeline": null,
      "onInputChange": "recompute_still"
    },
    "controls": [
      {
        "id": "step",
        "label": "State",
        "type": "index",
        "nativeControlId": "program.index_slider",
        "binding": {
          "kind": "input",
          "id": "step"
        },
        "purpose": "Select one admitted integer position in the current variant state table.",
        "selectionReason": "An ordered index keeps the native selector and state rail on the same discrete position.",
        "default": 0,
        "dataRef": "states",
        "items": [
          {
            "id": "state0",
            "label": "Split in half"
          },
          {
            "id": "state1",
            "label": "Reach singles"
          },
          {
            "id": "state2",
            "label": "Merge small runs"
          },
          {
            "id": "state3",
            "label": "Finish merging"
          }
        ],
        "presentation": "slider",
        "affects": [
          {
            "scope": "main",
            "kind": "entity",
            "id": "rail"
          },
          {
            "scope": "main",
            "kind": "entity",
            "id": "picture"
          },
          {
            "scope": "main",
            "kind": "entity",
            "id": "callout"
          }
        ]
      },
      {
        "id": "reset",
        "label": "Reset",
        "type": "reset",
        "nativeControlId": "program.reset",
        "binding": {
          "kind": "reset"
        },
        "purpose": "Return to the first state and default variant.",
        "selectionReason": "One reset restores the linked state selection and parameter together.",
        "effect": "Selects state zero and the default variant.",
        "affects": [
          {
            "scope": "main",
            "kind": "entity",
            "id": "rail"
          },
          {
            "scope": "main",
            "kind": "entity",
            "id": "picture"
          },
          {
            "scope": "main",
            "kind": "entity",
            "id": "callout"
          }
        ]
      }
    ],
    "assumptions": [
      "The selector chooses an ordered discrete state; steps are not elapsed seconds."
    ],
    "limitations": [
      "The scene shows the admitted states and omits activity between them."
    ],
    "claims": []
  }
});

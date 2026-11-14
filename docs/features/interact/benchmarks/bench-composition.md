# bench-composition: can a model write the stepper scene composition?

One call per prompt, no correction. Set A: 44 stepper prompts (depths round robin 15/15/14); set B: the three reference subjects at three depths (9). A, B, D are code; C is claude-sonnet-5-5 on rubric lines 1, 2, 3, 4, 6, 7, 8 (lines 5, 9, 10 need a render: Unknown). Prompt 54 (water cycle) is outside the 53.

## claude-opus-5-5

| calls reached of 53 | scorecard scored | schema % | binds % | mean Yes of 7 | median ms | composer USD | scorecard USD | failed calls |
|---|---|---|---|---|---|---|---|---|
| 34 | 31 | 100 | 97 | 6.3 | 45140 | 4.3532 | 0.6557 | 19 |

| reference row | parts kinds | control kinds | state count ±1 | story names regions | aha index |
|---|---|---|---|---|---|
| merge-sort balanced | - | - | - | - | - |
| merge-sort brief | - | - | - | - | - |
| merge-sort detailed | - | - | - | - | - |
| mitosis balanced | - | - | - | - | - |
| mitosis brief | - | - | - | - | - |
| mitosis detailed | - | - | - | - | - |
| tcp-handshake balanced | - | - | - | - | - |
| tcp-handshake brief | - | - | - | - | - |
| tcp-handshake detailed | - | - | - | - | - |

## gpt-6.1-sol

| calls reached of 53 | scorecard scored | schema % | binds % | mean Yes of 7 | median ms | composer USD | scorecard USD | failed calls |
|---|---|---|---|---|---|---|---|---|
| 53 | 16 | 100 | 100 | 6.9 | 109672 | 3.3402 | 0.2673 | 0 |

| reference row | parts kinds | control kinds | state count ±1 | story names regions | aha index |
|---|---|---|---|---|---|
| merge-sort balanced | ✗ | ✗ | ✗ | ✗ | ✗ |
| merge-sort brief | ✗ | ✓ | ✗ | ✗ | ✗ |
| merge-sort detailed | ✗ | ✗ | ✗ | ✗ | ✗ |
| mitosis balanced | ✗ | ✗ | ✓ | ✗ | ✗ |
| mitosis brief | ✗ | ✓ | ✓ | ✗ | ✗ |
| mitosis detailed | ✗ | ✗ | ✗ | ✗ | ✓ |
| tcp-handshake balanced | ✗ | ✗ | ✓ | ✗ | ✗ |
| tcp-handshake brief | ✗ | ✓ | ✓ | ✗ | ✗ |
| tcp-handshake detailed | ✗ | ✗ | ✓ | ✗ | ✗ |

## claude-sonnet-5-5

| calls reached of 53 | scorecard scored | schema % | binds % | mean Yes of 7 | median ms | composer USD | scorecard USD | failed calls |
|---|---|---|---|---|---|---|---|---|
| 48 | 43 | 98 | 92 | 6.3 | 29682 | 2.6654 | 0.8245 | 5 |

| reference row | parts kinds | control kinds | state count ±1 | story names regions | aha index |
|---|---|---|---|---|---|
| merge-sort balanced | ✗ | ✗ | ✗ | ✗ | ✗ |
| merge-sort brief | ✗ | ✓ | ✗ | ✗ | ✗ |
| merge-sort detailed | ✗ | ✗ | ✗ | ✗ | ✗ |
| mitosis balanced | - | - | - | - | - |
| mitosis brief | - | - | - | - | - |
| mitosis detailed | - | - | - | - | - |
| tcp-handshake balanced | - | - | - | - | - |
| tcp-handshake brief | ✗ | ✓ | ✓ | ✗ | ✗ |
| tcp-handshake detailed | - | - | - | - | - |

## gemini-3.5-flash-lite

| calls reached of 53 | scorecard scored | schema % | binds % | mean Yes of 7 | median ms | composer USD | scorecard USD | failed calls |
|---|---|---|---|---|---|---|---|---|
| 53 | 53 | 0 | 89 | 3.7 | 3186 | 0.1837 | 0.7166 | 0 |

| reference row | parts kinds | control kinds | state count ±1 | story names regions | aha index |
|---|---|---|---|---|---|
| merge-sort balanced | ✗ | ✗ | ✗ | ✗ | ✗ |
| merge-sort brief | ✗ | ✗ | ✓ | ✗ | ✓ |
| merge-sort detailed | ✗ | ✗ | ✗ | ✗ | ✗ |
| mitosis balanced | ✗ | ✗ | ✓ | ✗ | ✓ |
| mitosis brief | ✗ | ✓ | ✓ | ✗ | ✓ |
| mitosis detailed | ✓ | ✗ | ✗ | ✗ | ✗ |
| tcp-handshake balanced | ✗ | ✗ | ✗ | ✗ | ✗ |
| tcp-handshake brief | ✗ | ✓ | ✓ | ✗ | ✓ |
| tcp-handshake detailed | ✗ | ✗ | ✗ | ✗ | ✗ |

## State per model (calls that returned, failed calls and their first error, last call saved)

| model | returned of 54 | failed calls | first error | last call saved |
|---|---|---|---|---|
| claude-opus-5-5 | 34 | 20 | api.anthropic.com http 400: {"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC."},"request_id":"req_011C | 2026-11-14T22:36:47.547Z |
| gpt-6.1-sol | 54 | 0 | - | 2026-11-14T23:12:31.336Z |
| claude-sonnet-5-5 | 48 | 6 | api.anthropic.com http 400: {"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC."},"request_id":"req_011C | 2026-11-14T22:36:31.268Z |
| gemini-3.5-flash-lite | 54 | 0 | - | 2026-11-14T22:24:40.628Z |

## "how does the water cycle work?" at balanced, each model, in full

### claude-opus-5-5

failed call: api.anthropic.com http 400: {"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC."},"request_id":"req_011Ch3cwJVNL7SpSt7DCYW9Q"}

### gpt-6.1-sol

A pass; B pass; Yes - of 7; 86632 ms; US$0.050976

```json
{
 "story": "Follow one water sample through Ocean, Water vapor, Cloud droplets, Rain, Runoff, and Ocean again. Use Previous and Next to compare its physical state and location. Sunlight powers evaporation; cooling forms droplets, and gravity returns water. Does the sample lose water along this route?",
 "aha": {
  "stateId": "ocean-return",
  "observation": "The same water returns to Ocean after changing phase and location; the tracked sample's total mass stays unchanged."
 },
 "layout": {
  "preset": "stepper-states",
  "width": 640
 },
 "parts": [
  {
   "id": "cycle-rail",
   "kind": "step-rail",
   "presentation": "Use the approved card shell with explanation and instructions above the experiment. The rail owns progress and highlights the current state. Indices represent states, not elapsed time.",
   "bind": {
    "active": "state.id",
    "items": "variant.states"
   }
  },
  {
   "id": "water-route",
   "kind": "fixed-picture",
   "presentation": "Use the canonical cycle arrangement with fixed, labeled regions and directional links. Highlight the active region without animated movement. Track an idealized closed sample through one possible route. Assume no mixing, splitting, losses, freezing, infiltration, or transpiration. Region phases determine the sample's physical state. Preserve readable labels at native card width. Reference capture shows ocean-return.",
   "bind": {
    "active": "state.active",
    "links": "variant.links",
    "regions": "variant.regions"
   }
  },
  {
   "id": "previous-location",
   "kind": "previous-state-ghost",
   "presentation": "Outline the previous state's active region for comparison. Hide the outline before the first transition and after Reset. Use the fixed picture's region geometry.",
   "bind": {
    "regions": "previous.active"
   }
  },
  {
   "id": "water-measurements",
   "kind": "value-readout",
   "presentation": "Show liquid mass, vapor mass, and total mass in one row. Place the bound Status entry beneath them. Fixed sample mass is ten grams. Precompute phase masses from the active region's phase: the entire sample is liquid or vapor. Total mass equals their sum. Units are grams, referenced only to the tracked sample, rounded to whole grams. No chart scale is used.",
   "bind": {
    "values": "state.readouts"
   }
  },
  {
   "id": "active-location-explanation",
   "kind": "active-callout",
   "presentation": "Anchor the callout to the active region with reserved label space. Text identifies where the sample is; reason explains the mechanism. Report numerical values only in readouts.",
   "bind": {
    "target": "state.calloutRegion",
    "text": "state.sentence",
    "reason": "state.why"
   }
  }
 ],
 "controls": [
  {
   "id": "cycle-state",
   "kind": "index",
   "label": "Cycle state",
   "items": "variant.states",
   "presentation": "Render Previous and Next buttons with those accessible names. Default index is zero; bounds are zero through five; increment is one. Each action changes the highlighted location, explanation, measurements, status, and previous-state outline. Disable boundary buttons without renaming them; do not wrap. Every state persists until learner action, including ocean-return. Provide visible focus and keyboard activation. Balanced parameter-control budget: zero; navigation and Reset are separate."
  },
  {
   "id": "reset",
   "kind": "reset",
   "label": "Reset",
   "presentation": "Restore the first state, fixed sample assumptions, and default controls. Clear the previous-state outline. Provide visible focus and keyboard activation."
  }
 ],
 "data": {
  "variants": [
   {
    "label": "Water cycle: an ocean-to-land route",
    "regions": [
     {
      "id": "ocean",
      "label": "Ocean",
      "phases": [
       "liquid"
      ]
     },
     {
      "id": "vapor",
      "label": "Water vapor",
      "phases": [
       "gas"
      ]
     },
     {
      "id": "cloud",
      "label": "Cloud droplets",
      "phases": [
       "liquid"
      ]
     },
     {
      "id": "rain",
      "label": "Rain",
      "phases": [
       "liquid"
      ]
     },
     {
      "id": "runoff",
      "label": "Runoff",
      "phases": [
       "liquid"
      ]
     }
    ],
    "links": [
     {
      "from": "ocean",
      "to": "vapor",
      "label": "Evaporation: sunlight supplies energy"
     },
     {
      "from": "vapor",
      "to": "cloud",
      "label": "Condensation: cooling forms droplets"
     },
     {
      "from": "cloud",
      "to": "rain",
      "label": "Precipitation: droplets grow and fall"
     },
     {
      "from": "rain",
      "to": "runoff",
      "label": "Collection: rain reaches land"
     },
     {
      "from": "runoff",
      "to": "ocean",
      "label": "Return: gravity drives downhill flow"
     }
    ],
    "states": [
     {
      "id": "ocean-start",
      "label": "Ocean: start",
      "short": "Start",
      "sentence": "Ocean holds the sample as liquid water.",
      "why": "This is the starting reservoir; follow the same tagged water throughout the route.",
      "active": [
       "ocean"
      ],
      "calloutRegion": "ocean",
      "readouts": [
       {
        "id": "liquid-mass",
        "label": "Liquid mass",
        "value": "10 g"
       },
       {
        "id": "vapor-mass",
        "label": "Vapor mass",
        "value": "0 g"
       },
       {
        "id": "total-mass",
        "label": "Total mass",
        "value": "10 g"
       },
       {
        "id": "status",
        "label": "Status",
        "value": "Liquid in Ocean; starting sample"
       }
      ]
     },
     {
      "id": "evaporation",
      "label": "Evaporation",
      "short": "Evaporate",
      "sentence": "The sample is now Water vapor in the air.",
      "why": "Sunlight supplies energy for evaporation; liquid becomes invisible water vapor, not tiny droplets.",
      "active": [
       "vapor"
      ],
      "calloutRegion": "vapor",
      "readouts": [
       {
        "id": "liquid-mass",
        "label": "Liquid mass",
        "value": "0 g"
       },
       {
        "id": "vapor-mass",
        "label": "Vapor mass",
        "value": "10 g"
       },
       {
        "id": "total-mass",
        "label": "Total mass",
        "value": "10 g"
       },
       {
        "id": "status",
        "label": "Status",
        "value": "Gas in the air; total unchanged"
       }
      ]
     },
     {
      "id": "condensation",
      "label": "Condensation",
      "short": "Condense",
      "sentence": "The sample forms Cloud droplets suspended in the air.",
      "why": "Cooling allows water vapor to condense into liquid droplets; clouds are not water vapor.",
      "active": [
       "cloud"
      ],
      "calloutRegion": "cloud",
      "readouts": [
       {
        "id": "liquid-mass",
        "label": "Liquid mass",
        "value": "10 g"
       },
       {
        "id": "vapor-mass",
        "label": "Vapor mass",
        "value": "0 g"
       },
       {
        "id": "total-mass",
        "label": "Total mass",
        "value": "10 g"
       },
       {
        "id": "status",
        "label": "Status",
        "value": "Liquid droplets; total unchanged"
       }
      ]
     },
     {
      "id": "precipitation",
      "label": "Precipitation",
      "short": "Fall",
      "sentence": "The sample falls toward land as Rain.",
      "why": "Cloud droplets grow large enough for gravity to pull them downward as rain.",
      "active": [
       "rain"
      ],
      "calloutRegion": "rain",
      "readouts": [
       {
        "id": "liquid-mass",
        "label": "Liquid mass",
        "value": "10 g"
       },
       {
        "id": "vapor-mass",
        "label": "Vapor mass",
        "value": "0 g"
       },
       {
        "id": "total-mass",
        "label": "Total mass",
        "value": "10 g"
       },
       {
        "id": "status",
        "label": "Status",
        "value": "Falling liquid; total unchanged"
       }
      ]
     },
     {
      "id": "surface-runoff",
      "label": "Surface runoff",
      "short": "Collect",
      "sentence": "The sample joins Runoff flowing downhill toward Ocean.",
      "why": "In this route, rain reaches land and joins surface flow instead of soaking into the ground.",
      "active": [
       "runoff"
      ],
      "calloutRegion": "runoff",
      "readouts": [
       {
        "id": "liquid-mass",
        "label": "Liquid mass",
        "value": "10 g"
       },
       {
        "id": "vapor-mass",
        "label": "Vapor mass",
        "value": "0 g"
       },
       {
        "id": "total-mass",
        "label": "Total mass",
        "value": "10 g"
       },
       {
        "id": "status",
        "label": "Status",
        "value": "Flowing liquid; total unchanged"
       }
      ]
     },
     {
      "id": "ocean-return",
      "label": "Ocean: return",
      "short": "Return",
      "sentence": "The same sample is back in Ocean as liquid water.",
      "why": "Water changed phase and location without being used up; sunlight can drive evaporation again.",
      "active": [
       "ocean"
      ],
      "calloutRegion": "ocean",
      "readouts": [
       {
        "id": "liquid-mass",
        "label": "Liquid mass",
        "value": "10 g"
       },
       {
        "id": "vapor-mass",
        "label": "Vapor mass",
        "value": "0 g"
       },
       {
        "id": "total-mass",
        "label": "Total mass",
        "value": "10 g"
       },
       {
        "id": "status",
        "label": "Status",
        "value": "Returned to Ocean; total matches the start"
       }
      ]
     }
    ]
   }
  ]
 }
}
```

### claude-sonnet-5-5

failed call: api.anthropic.com http 400: {"type":"error","error":{"type":"invalid_request_error","message":"You have reached your specified API usage limits. You will regain access on 2026-12-01 at 00:00 UTC."},"request_id":"req_011Ch3cv6VmfJdFYiQQM66i6"}

### gemini-3.5-flash-lite

A fail (exactly one index control bound to variant.states is required (found 1, bound to undefined)); B fail (part picture bind reason: "variant.states[inputs.stepIndex].why" does not resolve; part callout bind reason: "variant.states[inputs.stepIndex].why" does not resolve; part callout bind target: "variant.states[inputs.stepIndex].calloutRegion" does not resolve; part callout bind text: "variant.states[inputs.stepIndex].sentence" does not resolve; part readout bind values: "variant.states[inputs.stepIndex].readouts" does not resolve); Yes 5 of 7; 3382 ms; US$0.003616

```json
{
 "story": "Water moves endlessly through Earth's systems. Solar energy drives evaporation from oceans into vapor. Vapor cools and condenses into clouds, forming precipitation that returns water back to land.",
 "aha": {
  "stateId": "precipitation",
  "observation": "Condensed vapor falls as rain or snow, completing the continuous loop back to earth."
 },
 "layout": {
  "preset": "stepper-states",
  "width": 640
 },
 "parts": [
  {
   "id": "rail",
   "kind": "step-rail",
   "bind": {
    "active": "inputs.stepIndex",
    "items": "variant.states"
   }
  },
  {
   "id": "picture",
   "kind": "fixed-picture",
   "bind": {
    "active": "inputs.stepIndex",
    "regions": "variant.regions",
    "reason": "variant.states[inputs.stepIndex].why"
   }
  },
  {
   "id": "callout",
   "kind": "active-callout",
   "bind": {
    "reason": "variant.states[inputs.stepIndex].why",
    "target": "variant.states[inputs.stepIndex].calloutRegion",
    "text": "variant.states[inputs.stepIndex].sentence"
   }
  },
  {
   "id": "readout",
   "kind": "value-readout",
   "bind": {
    "values": "variant.states[inputs.stepIndex].readouts"
   }
  }
 ],
 "controls": [
  {
   "id": "stepIndex",
   "kind": "index",
   "label": "Cycle Step",
   "options": [
    "evaporation",
    "condensation",
    "precipitation",
    "collection"
   ]
  },
  {
   "id": "reset",
   "kind": "reset",
   "label": "Reset",
   "options": []
  }
 ],
 "data": {
  "variants": [
   {
    "label": "Water Cycle Phases",
    "regions": [
     {
      "id": "ocean",
      "label": "Ocean",
      "values": [
       "97% water storage"
      ]
     },
     {
      "id": "atmosphere",
      "label": "Atmosphere",
      "values": [
       "Vapor transport"
      ]
     },
     {
      "id": "clouds",
      "label": "Clouds",
      "values": [
       "Condensed droplets"
      ]
     },
     {
      "id": "mountains",
      "label": "Mountains",
      "values": [
       "Runoff source"
      ]
     }
    ],
    "states": [
     {
      "id": "evaporation",
      "label": "Evaporation",
      "short": "Evaporate",
      "sentence": "Sunlight warms ocean water, turning liquid into invisible gas.",
      "why": "Heat energy changes water state.",
      "active": [
       "ocean"
      ],
      "calloutRegion": "ocean",
      "readouts": [
       {
        "id": "r1",
        "label": "Phase",
        "value": "Liquid to Gas"
       },
       {
        "id": "r2",
        "label": "Energy Source",
        "value": "Solar"
       }
      ]
     },
     {
      "id": "condensation",
      "label": "Condensation",
      "short": "Condense",
      "sentence": "Rising water vapor cools in the upper air and forms clouds.",
      "why": "Cooling causes gas to group into droplets.",
      "active": [
       "clouds"
      ],
      "calloutRegion": "clouds",
      "readouts": [
       {
        "id": "r1",
        "label": "Phase",
        "value": "Gas to Liquid"
       },
       {
        "id": "r2",
        "label": "Altitude",
        "value": "High"
       }
      ]
     },
     {
      "id": "precipitation",
      "label": "Precipitation",
      "short": "Precipitate",
      "sentence": "Heavy droplets fall back down as rain, snow, or sleet.",
      "why": "Gravity pulls dense droplets downward.",
      "active": [
       "clouds",
       "mountains"
      ],
      "calloutRegion": "clouds",
      "readouts": [
       {
        "id": "r1",
        "label": "Phase",
        "value": "Falling Liquid/Solid"
       },
       {
        "id": "r2",
        "label": "Force",
        "value": "Gravity"
       }
      ]
     },
     {
      "id": "collection",
      "label": "Collection",
      "short": "Collect",
      "sentence": "Water flows across land back into oceans, restarting the cycle.",
      "why": "Runoff gathers in lower elevations.",
      "active": [
       "ocean",
       "mountains"
      ],
      "calloutRegion": "ocean",
      "readouts": [
       {
        "id": "r1",
        "label": "Phase",
        "value": "Surface Runoff"
       },
       {
        "id": "r2",
        "label": "Destination",
        "value": "Ocean"
       }
      ]
     }
    ]
   }
  ]
 }
}
```


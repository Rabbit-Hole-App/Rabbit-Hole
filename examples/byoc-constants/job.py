"""A configurable score check with deployment constants and one editable input."""
import json
import os
from pathlib import Path

constants = json.loads(os.environ["SMALL_CONSTANTS"])
score = float(os.environ["SMALL_INPUT_SCORE"])
assert isinstance(constants["threshold"], (int, float))
assert isinstance(constants["enabled"], bool)
result = {"score": score, "constants": constants,
          "accepted": constants["enabled"] and score >= constants["threshold"]}
(Path(os.environ["SMALL_OUTPUTS"]) / "result.json").write_text(json.dumps(result, indent=2))
print(f"Score {score}; threshold {constants['threshold']}; accepted: {result['accepted']}")

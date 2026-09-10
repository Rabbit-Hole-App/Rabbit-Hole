import json
import os
from pathlib import Path

count = int(float(os.environ.get("SMALL_INPUT_COUNT", "8")))
label = os.environ.get("SMALL_INPUT_LABEL", "Private AWS proof")
print(f"Computing {count} squares in the customer AWS account", flush=True)
result = {"label": label, "count": count, "sum_of_squares": sum(i * i for i in range(1, count + 1))}
destination = Path(os.environ["SMALL_OUTPUTS"]) / "report.json"
destination.write_text(json.dumps(result, indent=2) + "\n")
print("Wrote report.json", flush=True)

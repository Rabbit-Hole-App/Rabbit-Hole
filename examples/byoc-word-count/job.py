import json
import os
from pathlib import Path

words = os.environ.get("SMALL_INPUT_TEXT", "small apps run in your AWS account").split()
report = {"word_count": len(words), "unique_words": len({word.lower() for word in words})}
output = Path(os.environ.get("SMALL_OUTPUTS", "out"))
output.mkdir(parents=True, exist_ok=True)
(output / "report.json").write_text(json.dumps(report) + "\n", encoding="utf-8")
print(json.dumps(report), flush=True)

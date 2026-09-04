# yolo-job — detect objects in one input image, write results to $SMALL_OUTPUTS.
import json
import os

from ultralytics import YOLO

threshold = float(os.environ.get("SMALL_INPUT_THRESHOLD", "0.5"))
with open(os.path.join(os.environ["SMALL_INPUTS"], "inputs.json")) as f:
    image_path = json.load(f)["image"]
out_dir = os.environ["SMALL_OUTPUTS"]

model = YOLO("yolov8n.pt")  # bundled in the image, CPU inference
result = model(image_path, conf=threshold)[0]
boxes = [
    {"label": result.names[int(cls)], "conf": round(float(conf), 3)}
    for cls, conf in zip(result.boxes.cls, result.boxes.conf)
]

result.save(filename=os.path.join(out_dir, "annotated.jpg"))
with open(os.path.join(out_dir, "boxes.json"), "w") as f:
    json.dump(boxes, f)
print(f"{len(boxes)} detections at conf >= {threshold}")

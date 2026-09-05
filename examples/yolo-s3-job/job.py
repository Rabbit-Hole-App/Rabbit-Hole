# yolo-s3-job — fetch an image from S3, detect objects, write results to $SMALL_OUTPUTS.
# AWS creds come from the [aws] role in small.toml — per-run STS session in the env.
import json
import os

import boto3
from ultralytics import YOLO

source = os.environ["SMALL_INPUT_SOURCE"]  # s3://bucket/key
threshold = float(os.environ.get("SMALL_INPUT_THRESHOLD", "0.5"))
out_dir = os.environ["SMALL_OUTPUTS"]

bucket, key = source.removeprefix("s3://").split("/", 1)
image_path = os.path.join(out_dir, "..", os.path.basename(key))
boto3.client("s3").download_file(bucket, key, image_path)
print(f"fetched {source}")

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

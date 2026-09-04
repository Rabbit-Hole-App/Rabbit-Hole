# Lambda: base64 image in, YOLO boxes out. Weights pulled from private S3 on cold start.
import base64
import json
import os

import boto3

MODEL = None


def get_model():
    global MODEL
    if MODEL is None:
        path = "/tmp/yolov8n.pt"
        if not os.path.exists(path):
            boto3.client("s3").download_file(os.environ["WEIGHTS_BUCKET"], os.environ.get("WEIGHTS_KEY", "yolov8n.pt"), path)
        from ultralytics import YOLO

        MODEL = YOLO(path)
    return MODEL


def handler(event, context):
    user = event.get("user", "unknown")
    print(f"invoke user={user}")

    import cv2
    import numpy as np

    img = cv2.imdecode(np.frombuffer(base64.b64decode(event["image_b64"]), np.uint8), cv2.IMREAD_COLOR)
    result = get_model().predict(img, verbose=False)[0]
    boxes = [
        {
            "label": result.names[int(b.cls)],
            "conf": round(float(b.conf), 3),
            "xyxy": [round(float(v), 1) for v in b.xyxy[0]],
        }
        for b in result.boxes
    ]
    print(f"user={user} boxes={len(boxes)}")
    return {"boxes": boxes, "user": user}

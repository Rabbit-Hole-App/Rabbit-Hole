import base64
import io
import json
import os

import boto3
import gradio as gr
from PIL import Image, ImageDraw


def lambda_client():
    arn = os.environ["LAMBDA_ARN"]
    return boto3.client("lambda", region_name=arn.split(":")[3]), arn


def predict(img, request: gr.Request):
    user = (request.headers.get("x-small-user") if request else None) or "unknown"
    buf = io.BytesIO()
    img.convert("RGB").save(buf, format="JPEG")
    client, arn = lambda_client()
    resp = client.invoke(
        FunctionName=arn,
        Payload=json.dumps({"image_b64": base64.b64encode(buf.getvalue()).decode(), "user": user}),
    )
    out = json.loads(resp["Payload"].read())
    if "boxes" not in out:
        raise gr.Error(f"lambda error: {out}")
    draw = ImageDraw.Draw(img)
    for b in out["boxes"]:
        draw.rectangle(b["xyxy"], outline="red", width=3)
        draw.text((b["xyxy"][0], max(0, b["xyxy"][1] - 12)), f"{b['label']} {b['conf']}", fill="red")
    return img, out["boxes"]


demo = gr.Interface(predict, gr.Image(type="pil"), [gr.Image(), gr.JSON()], flagging_mode="never")

if __name__ == "__main__":
    demo.launch()

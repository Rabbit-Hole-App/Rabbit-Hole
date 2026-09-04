# yolo-gradio — upload an image, get it back with YOLOv8n boxes + detections list.
import gradio as gr
from ultralytics import YOLO

model = YOLO("yolov8n.pt")  # bundled in the image, CPU inference


def predict(image):
    result = model(image)[0]
    boxes = [
        {"label": result.names[int(cls)], "conf": round(float(conf), 3)}
        for cls, conf in zip(result.boxes.cls, result.boxes.conf)
    ]
    return result.plot()[:, :, ::-1], boxes  # plot() is BGR; flip to RGB


demo = gr.Interface(
    predict,
    gr.Image(type="numpy", label="input"),
    [gr.Image(label="detections"), gr.JSON(label="boxes")],
    title="YOLOv8n object detection",
    flagging_mode="never",
)

if __name__ == "__main__":
    demo.launch()  # host/port come from GRADIO_SERVER_NAME/GRADIO_SERVER_PORT

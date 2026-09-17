# How Object Detection Works: YOLOv8n and the yolo-s3-job Pipeline

## Module 1: The detection task and its input

### What an object detector produces

- Classification (one label per image) versus detection (several located objects)
- A detection = class label + bounding box + confidence score
- Confidence as the model's score for a prediction, not a verified probability of correctness
- Detectors recognize only the fixed set of classes present in their training data (the public YOLOv8 models are distributed as COCO-trained; the deployed class list is not confirmed by the supplied evidence)

### Images as numbers

- Pixels, a width × height grid, and red/green/blue channels
- Why a model needs a fixed input size: resizing / letterbox padding
- Coordinates in the resized image versus coordinates in the original image

## Module 2: Neural network ideas needed to read the model

### Weights, training, and a pretrained file

- A model as a fixed arrangement of arithmetic operations with adjustable numbers (weights)
- Training (weights are fitted on labelled images) versus inference (weights are frozen and applied)
- yolov8n.pt as a stored set of already-fitted weights the app loads; no learning happens per run
- The 'n' (nano) size variant: fewer parameters and less computation than larger YOLOv8 variants

### Convolution and feature maps

- A small filter scanned across the image to detect local patterns
- Stacked layers: edges and textures combined into larger part-like patterns
- Downsampling produces coarser grids, where each cell summarizes a region of the image
- Multiple grid resolutions so small and large objects are both represented

## Module 3: Inside YOLOv8 detection

### Backbone, neck, and detection head

- Backbone: extracts feature maps from the input image
- Neck: combines features across resolutions before prediction
- Split detection head: separate branches for class scores and box geometry
- Single-pass (one-stage) design: all candidates predicted in one forward pass
- Source: Ultralytics documentation for the YOLOv8 family, not an inspection of the deployed weights

### From dense predictions to a final detection list

- Every grid cell at every scale emits a candidate box and per-class scores
- Anchor-free prediction: box edges predicted directly from the cell's position (contrast: earlier anchor-based detectors regressed offsets from preset box shapes — taught only as contrast, not as this model's mechanism)
- Confidence thresholding: candidates scoring below the threshold are discarded
- Non-maximum suppression with IoU overlap: near-duplicate boxes for the same object are removed

## Module 4: Running yolo-s3-job and reading its results

### Inputs and controls

- S3 image path as the single input image; optional output bucket as the destination for results
- Confidence threshold (default 0.5): directly sets which candidate detections are kept after scoring; raising it removes lower-scoring detections and lowering it retains more — the effect on missed or spurious objects depends on the images and must be measured, not assumed
- CPU inference: no GPU required; runtime depends on image size and the model variant
- Objects outside the model's trained class list are not reported regardless of threshold

### Interpreting the two outputs

- annotated.jpg: the image with boxes drawn, so box geometry is visible even though it is rendered rather than tabulated
- boxes.json: label and confidence pairs, per the supplied description — coordinates are absent from this file, which does not mean the pipeline never computes them
- Choosing which output answers which question (what/how sure versus where)
- Limits: a high confidence value is a model score, not evidence of a correct detection

## Scope for approval

Duration: **needs-more-time**. The stated goal — a beginner understanding the principles of how the model works, plus running the app — requires the image-as-numbers, weights/pretraining, and convolution foundations before the backbone/neck/head material makes sense. Twenty minutes can deliver Modules 1 and 4 plus a compressed narrative of Modules 2–3, which is an overview rather than the promised mechanism-level understanding. The scope above is preserved as proposed; roughly a 45–60 minute session would be needed to cover it at beginner pace. These are planning judgments, not measured learning times.

- Prerequisite: Comfort with numbers, percentages, and reading a simple grid or table

- Prerequisite: No machine learning, computer vision, or programming background assumed

- Prerequisite: Basic idea of files stored in cloud object storage (buckets and paths); briefly restated in the final module

- How yolov8n.pt's weights were trained (datasets, loss functions, augmentation, evaluation metrics such as mAP) is out of scope; the model is treated as pretrained and frozen.

- The app description is supplied context, not an inspection of deployed source or weights: the exact class list, input resize size, NMS settings, invocation interface, and error handling are unconfirmed and will be taught as standard YOLOv8-family behavior with that caveat.

- Architecture details are taken from Ultralytics documentation for the YOLOv8 family; they describe the published model line rather than proving the contents of the deployed weight file.

- Owner decision: Extend the session to cover the full dependency chain (Modules 1–4 as written), or approve a 20-minute overview that compresses convolution and the head's internal structure into summary statements?

- Owner decision: How is the job actually invoked (CLI command, container run, scheduled trigger)? The supplied evidence lists inputs but not an invocation interface, which the 'knows how to run the app' goal requires.

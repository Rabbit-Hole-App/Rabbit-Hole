# How yolo-s3-job Sees Objects: YOLOv8n Object Detection from First Principles

## Module 1: Foundations: images and trained models

### An image as an array of numbers

- Pixels, width/height, and the three colour channels as a numeric grid
- Resizing and letterbox padding to a fixed input size (commonly 640) and why models need fixed input shapes
- Normalisation: scaling pixel values into the range a network expects

### What a 'pretrained model' actually is

- Parameters (weights) as numbers learned from labelled example images
- Training versus inference: the app only performs inference
- A weights file such as yolov8n.pt = architecture definition + learned parameter values
- Fixed class vocabulary: the model can only name categories present in its training labels

## Module 2: From recognising to locating

### The object detection task

- Classification (one label per image) versus detection (many labelled regions per image)
- Bounding box as four numbers; class label; confidence score as the model's per-detection score, not a calibrated probability of correctness
- Ground truth versus prediction, and why a detector can miss objects or invent them

### Convolutional feature extraction

- Convolution: a small filter swept over the image producing a feature map
- Stacking layers: edges and textures to larger object-like patterns
- Downsampling and stride: feature maps that are coarser but semantically richer
- Why multiple scales are needed to find both small and large objects

## Module 3: Inside YOLOv8n

### Backbone, neck, and anchor-free split head

- Single forward pass over the whole image producing dense predictions at several feature-map scales
- Backbone: convolutional feature extraction; neck: merging fine and coarse features for multi-scale detection
- Anchor-free split head: separate branches predicting class scores and box geometry per spatial location, without predefined anchor boxes
- The n/s/m/l/x family: 'nano' denotes the smallest parameter/compute configuration; accuracy and speed differences depend on data and hardware and must be measured, not assumed

### Raw network output to a final detection list

- Thousands of candidate predictions per image, most with low class scores
- Confidence thresholding: discarding candidates whose score falls below a cutoff
- Non-maximum suppression and Intersection over Union: collapsing overlapping duplicates of the same object
- Mapping box coordinates from the padded/resized input back onto the original image dimensions

## Module 4: The app: yolo-s3-job

### The pipeline end to end

- Inputs: an S3 image path, a confidence threshold, an optional output bucket
- Object storage as an addressed location for the input image and the written results
- Sequence: fetch image, preprocess, run YOLOv8n forward pass, post-process, render and write outputs
- CPU execution: the same computation as on a GPU, performed with different hardware and typically different latency

### Controls and what each output does and does not contain

- The confidence threshold (default 0.5 in this app) directly filters which candidate detections are kept; effects on missed or spurious detections vary by image and are not guaranteed improvements
- Optional output bucket: selects where results are written, not what is computed
- annotated.jpg: the source image with drawn boxes and labels — box positions are visible here as rendered graphics
- boxes.json as described: label and confidence pairs, without coordinate fields; coordinates are computed inside the model and used for drawing, so their absence applies to this file rather than to the system

## Scope for approval

Duration: **needs-more-time**. Twenty minutes can cover Module 1 and a narrative sketch of Module 4 — enough to run the job and read its outputs, but not enough to explain how the detector works. The clarification asks for the underlying mechanism, so the scope above is preserved rather than trimmed: the full dependency chain (images as arrays → pretrained weights → detection task → convolutional features → backbone/neck/split head → thresholding and NMS → the app) realistically needs a longer single session or two or three short sessions. The decision is yours: keep 20 minutes as an operations-only overview, or extend the time and keep the conceptual scope.

- Prerequisite: Comfort viewing digital images and the idea of a grid of numbers; no maths beyond arithmetic

- Prerequisite: Ability to run a supplied command or job with named arguments

- Prerequisite: No machine learning, computer vision, or cloud experience assumed — these are taught in the course

- The app behaviour (yolov8n.pt, CPU, 0.5 default threshold, annotated.jpg and boxes.json contents) comes from a supplied description, not from inspection of deployed source, weights, or run logs.

- The backbone/neck/anchor-free-split-head description and the n/s/m/l/x family come from Ultralytics documentation for the YOLOv8 model family; they do not confirm the identity or provenance of the weights file actually loaded by this deployment. The standard released yolov8n.pt detection weights are trained on the COCO dataset (80 classes); whether the deployed file is that stock artifact is unverified.

- Non-maximum suppression and coordinate rescaling are taught as the standard Ultralytics inference pipeline; the specific IoU and other post-processing settings used by this job are not evidenced. Training, fine-tuning, and accuracy benchmarking are out of scope.

- Owner decision: Extend beyond 20 minutes to keep Modules 2–3 (convolutional features and the YOLOv8n head), or cut them and deliver a 20-minute run-the-app overview that states the model is a black box?

- Owner decision: Should the course cover where the class vocabulary comes from (COCO-style labelled datasets and the training process at a conceptual level), or stay strictly inference-only?

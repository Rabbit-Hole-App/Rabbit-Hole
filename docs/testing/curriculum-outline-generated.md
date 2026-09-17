# How yolo-s3-job Sees: Object Detection with YOLOv8n from First Principles

## Module 1: The Problem and the Raw Material

### Images as numbers, detection as a task

- An image as a height×width×channel grid of pixel intensities
- Classification vs. detection: one label per image vs. many located objects
- What a detection actually is: class label + box + confidence score
- Why 'find every object' cannot be solved by one label per image

### Convolutional feature extraction

- Filters sliding over pixels to produce feature maps
- Stride and downsampling: fewer spatial cells, richer channels
- Feature hierarchy from edges to object-like patterns
- Receptive field: why deeper cells 'see' larger image regions

## Module 2: How YOLOv8 Turns Features into Detections

### Backbone and neck: multi-scale features

- Backbone: staged downsampling producing feature maps at several strides
- Why small and large objects surface at different scales
- Neck: top-down/bottom-up fusion so each scale carries context and detail
- Output of this stage: a set of feature grids, not yet boxes

### The anchor-free split detection head

- Dense prediction: every grid cell on every scale makes a candidate
- Split branches: separate class-score prediction and box-geometry prediction
- Anchor-free: predicting a box from the cell's own location instead of matching preset box shapes
- Teaching contrast only: earlier anchor-based detectors, and why YOLOv8's head differs

### From thousands of candidates to a clean answer

- Class scores as per-class confidence, and what a 0.5 threshold discards
- Intersection over Union (IoU) as a box-overlap measure
- Non-maximum suppression: collapsing duplicate boxes on one object
- Precision/recall intuition: raising or lowering the threshold

## Module 3: What a Pretrained Model Knows

### Training vs. inference, and what yolov8n.pt is

- Learned weights as the frozen result of past training; this app only runs inference
- A fixed, closed vocabulary of object classes (the COCO-style label set)
- The 'n' (nano) size: fewer parameters traded for speed, viable on CPU
- Failure modes: unseen object types, domain shift, confidence is a score not a guarantee

## Module 4: Connecting Concepts to the App

### The end-to-end path of one image

- Read image from the S3 input path, decode to pixels
- Preprocessing: resize/letterbox to the model's input size, scale pixel values
- Single CPU forward pass → threshold → NMS → final detections
- Rendering annotated.jpg: drawing the surviving boxes and labels

### Inputs, outputs, and their consequences

- Confidence threshold (default 0.5) as the one accuracy dial you control
- boxes.json stores label + confidence only, so location information is not persisted
- Optional output bucket; annotated.jpg as the only record of where objects were
- Running the job and reading its results sensibly

## Scope for approval

Duration: **needs-more-time**. The requested 20 minutes cannot carry this conceptual scope: reaching 'how the main model works' from no prior knowledge requires pixels → convolutional features → multi-scale fusion → dense anchor-free head → thresholding/NMS before the app makes sense. Two honest options: (a) keep the full scope and extend to a multi-session course, or (b) a 20-minute overview that states the pipeline stages and how to run the job, deliberately omitting the mechanism of feature extraction and the detection head. Option (b) will not deliver understanding of how the model works.

- Prerequisite: Comfort with basic arithmetic and the idea of a grid/table of numbers

- Prerequisite: No machine learning or computer vision background assumed

- Prerequisite: Ability to run a configured job and view its output files

- The app description is supplied context, not an inspection of deployed code or weights; the exact checkpoint, input size, and NMS settings are unverified.

- Backbone/neck/anchor-free-split-head structure comes from Ultralytics' documentation of the YOLOv8 family, which describes the standard architecture rather than this deployment's artifact.

- Training mechanics (loss functions, label assignment, dataset construction) are covered only as context for what pretrained weights represent, not taught as procedures.

- Owner decision: Extend the course to cover the full conceptual chain, or accept a 20-minute overview that drops the model-mechanism modules?

- Owner decision: Should the anchor-free head be explained at mechanism level (how a cell's prediction becomes box edges), or kept at 'the head outputs classes and boxes'?

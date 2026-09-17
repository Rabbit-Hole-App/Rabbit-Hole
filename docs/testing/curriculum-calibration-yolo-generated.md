Workflow status: **ready** (evaluator judgment; owner approval still required).

# How yolo-s3-job Detects Objects: From Pixels to Boxes

## Module 1: Images and the detection task

### A digital image as numbers

- Pixels, grid dimensions, and color channels
- Why a model needs a fixed input size: resizing and padding (letterboxing)
- Scaling pixel values before they enter the model

### What 'object detection' means

- Classification (what) versus localization (where)
- A detection = class label + bounding box + confidence score
- Fixed class vocabulary: the model can only name categories it was trained on

## Module 2: Pretrained models: where the behavior comes from

### Weights, training, and inference

- Parameters (weights) as numbers learned from labeled example images
- Training happens beforehand; the app performs inference only
- yolov8n.pt as a file of frozen weights; 'n' denotes the smallest size variant of the family (fewer parameters)
- Confidence as a model-produced score, not a verified probability of correctness

### Convolution and feature maps

- A filter sliding over the image to produce a feature map
- Stacked layers: edges and textures to larger object-like patterns
- Downsampling: smaller maps, larger receptive field, coarser spatial detail

## Module 3: Inside the YOLOv8 detector

### Backbone, neck, and detection head

- Backbone: extracting features from the whole image in one forward pass
- Neck: combining features across scales so small and large objects are both represented
- Anchor-free split head: separate branches predicting class scores and box geometry at each feature-map location (per Ultralytics documentation for the YOLOv8 family)

### From many raw predictions to a short list

- Dense candidate predictions across all feature-map locations and scales
- Discarding candidates whose class score falls below the confidence threshold
- Overlap measured by Intersection-over-Union (IoU)
- Non-maximum suppression: collapsing duplicate overlapping boxes for the same object

## Module 4: Running the app and reading its outputs

### Inputs and the controls they change

- S3 image path: the single image fetched and passed through the model
- Confidence threshold (default 0.5): the score cutoff deciding which candidate detections are kept; raising or lowering it shifts which detections survive, and its effect on misses or spurious boxes depends on the image and is not guaranteed
- Optional output bucket: destination for written artifacts, not a change to detection
- CPU execution: inference runs without a GPU; runtime depends on hardware and image size

### Interpreting annotated.jpg and boxes.json

- annotated.jpg: surviving boxes drawn on the image, so positions are visible there
- boxes.json: label and confidence pairs; coordinates are not present in this file per the supplied description, though the model computes them to draw the image
- Checking results against the model's fixed label set and the chosen threshold
- Limits: one image per run, and confidence values are not a measured accuracy claim

## Scope for approval

Duration: **needs-more-time**. The stated goal is understanding the principles, and a beginner needs the image representation, pretrained-weights, convolution, head, and NMS ideas before the app's controls make sense. Twenty minutes can deliver a narrative overview of this chain with the internals kept qualitative; the full conceptual scope above realistically needs a longer single session. The scope is preserved here rather than trimmed to button-pressing steps.

- Prerequisite: Basic arithmetic and comfort reading a chart or image

- Prerequisite: Ability to follow a file path and run a configured job (no cloud or ML background assumed)

- Training details (loss functions, label assignment, dataset construction) are out of scope: the app only runs inference with pretrained weights.

- The app description is supplied context, not an inspection of the deployed code or weights file; the exact class vocabulary and weights version of the deployed yolov8n.pt are unverified here.

- Whether the job exposes the NMS/IoU setting, input image size, or batch options is undocumented in the supplied description; only the image path, confidence threshold, and output bucket are documented.

- Owner decision: Approve a longer session (roughly 45-60 minutes) for the full conceptual chain, or approve a 20-minute overview that compresses Module 2's convolution material and Module 3's head details into a high-level summary?

- Owner decision: Should the course add evaluation concepts (precision/recall tradeoffs when choosing a threshold), which would require measured results or a test set and further extend the time?

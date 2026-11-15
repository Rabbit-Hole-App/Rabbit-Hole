# bench-pick, three registered families (2026-11-15, brief 27 task 2)

360 JEV calls (pickFamily, threshold 0, probabilities stored; thresholds applied offline), families vertical-throw, curve-sliders, stepper-states, depth balanced, 3 calls per prompt. Groups: (a) stepper prompts, both coverage votes stepper-states: 44; (b) toss and curve prompts of design-pick.json: 32; (c) both-vote none rows of bench-coverage.jsonl: 17; (d) the design-pick none prompts, an extra negative set: 27.

A wrong fit is a prompt where ANY call fits a family other than its label; a missed fit is a prompt with a family label where more than half of its calls come back gap. Threshold rule (brief 13): the HIGHEST value with 0 wrong fits.

Chosen threshold on groups a, b, c: **0.95**.

| Threshold | Wrong (a+b+c) | Missed (a+b+c) | Wrong (a+b+c+d) | Missed (a+b+c+d) |
|---|---|---|---|---|
| 0.5 | 1 | 10 | 10 | 10 |
| 0.55 | 1 | 13 | 9 | 13 |
| 0.6 | 1 | 16 | 9 | 16 |
| 0.65 | 1 | 19 | 8 | 19 |
| 0.7 | 1 | 20 | 7 | 20 |
| 0.75 | 1 | 24 | 6 | 24 |
| 0.8 | 1 | 27 | 6 | 27 |
| 0.85 | 0 | 35 | 5 | 35 |
| 0.9 | 0 | 42 | 3 | 42 |
| 0.95 | 0 | 44 | 3 | 44 |

Per prompt: top family of each call (`none` included) with its probability, then W wrong fit, m missed fit, ok right fit, - none prompt left at gap, at each threshold.

| Id | Group | Label | Prompt | Calls: top family (confidence) | 0.5 | 0.55 | 0.6 | 0.65 | 0.7 | 0.75 | 0.8 | 0.85 | 0.9 | 0.95 |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| st:aiml/gradient-descent | a | stepper-states | what is gradient descent? | stepper-states 0.83; stepper-states 0.84; stepper-states 0.86 | ok | ok | ok | ok | ok | ok | ok | m | m | m |
| st:aiml/tokenization | a | stepper-states | how does tokenization work? | stepper-states 0.91; stepper-states 0.89; stepper-states 0.89 | ok | ok | ok | ok | ok | ok | ok | ok | m | m |
| st:aiml/rag | a | stepper-states | how does RAG work? | stepper-states 0.78; stepper-states 0.79; stepper-states 0.75 | ok | ok | ok | ok | ok | ok | m | m | m | m |
| st:aiml/rlhf | a | stepper-states | how does RLHF work? | stepper-states 0.9; stepper-states 0.9; stepper-states 0.87 | ok | ok | ok | ok | ok | ok | ok | ok | ok | m |
| st:aiml/diffusion | a | stepper-states | how does a diffusion model generate an image? | stepper-states 0.86; stepper-states 0.84; stepper-states 0.86 | ok | ok | ok | ok | ok | ok | ok | ok | m | m |
| st:aiml/kv-cache | a | stepper-states | how does KV caching speed up inference? | none 0.5; none 0.5; stepper-states 0.49 | m | m | m | m | m | m | m | m | m | m |
| st:aiml/robot-arm | a | stepper-states | how does a robot arm pick up an object? | stepper-states 0.82; stepper-states 0.85; stepper-states 0.81 | ok | ok | ok | ok | ok | ok | ok | m | m | m |
| st:baseline/heart | a | stepper-states | how does the human heart pump blood? | stepper-states 0.9; stepper-states 0.88; stepper-states 0.87 | ok | ok | ok | ok | ok | ok | ok | ok | m | m |
| st:baseline/water-cycle | a | stepper-states | how does the water cycle work? | stepper-states 0.98; stepper-states 0.98; stepper-states 0.98 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| st:baseline/photosynthesis | a | stepper-states | how does photosynthesis work? | stepper-states 0.85; stepper-states 0.84; stepper-states 0.84 | ok | ok | ok | ok | ok | ok | ok | m | m | m |
| st:baseline/tcp-handshake | a | stepper-states | how does the TCP handshake work? | stepper-states 0.99; stepper-states 0.98; stepper-states 0.99 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| st:baseline/mitosis | a | stepper-states | what happens during mitosis? | stepper-states 0.99; stepper-states 0.99; stepper-states 0.99 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| st:baseline/bill-to-law | a | stepper-states | how does a bill become a law in the United States? | stepper-states 0.98; stepper-states 0.98; stepper-states 0.99 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| st:baseline/hash-table | a | stepper-states | how does a hash table work? | none 0.53; none 0.55; none 0.54 | m | m | m | m | m | m | m | m | m | m |
| st:baseline/merge-sort | a | stepper-states | how does merge sort work? | stepper-states 0.99; stepper-states 0.98; stepper-states 0.99 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| st:baseline/osi-model | a | stepper-states | explain the OSI model of networking | none 0.54; stepper-states 0.52; stepper-states 0.55 | ok | m | m | m | m | m | m | m | m | m |
| st:baseline/recursion | a | stepper-states | explain recursion | stepper-states 0.64; stepper-states 0.6; stepper-states 0.65 | ok | ok | ok | m | m | m | m | m | m | m |
| st:baseline/four-stroke | a | stepper-states | how does a four-stroke car engine work? | stepper-states 0.99; stepper-states 0.99; stepper-states 0.99 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| st:baseline/volcano | a | stepper-states | how does a volcano erupt? | stepper-states 0.87; stepper-states 0.88; stepper-states 0.86 | ok | ok | ok | ok | ok | ok | ok | ok | m | m |
| st:content/gan | a | stepper-states | how do the generator and discriminator in a GAN work together? | none 0.65; none 0.67; none 0.67 | m | m | m | m | m | m | m | m | m | m |
| st:demo-lesson04/ml-trees-decision-regions | a | stepper-states | how does a decision tree split a two-feature dataset into regions? | none 0.59; none 0.6; none 0.63 | m | m | m | m | m | m | m | m | m | m |
| st:demo-lesson04/ml-trees-gini-split | a | stepper-states | how do I compute the Gini impurity on both sides of a split and the information gain? | none 0.54; none 0.56; none 0.54 | m | m | m | m | m | m | m | m | m | m |
| st:demo-lesson04/ml-trees-threshold-search | a | stepper-states | how does a decision tree search for the best threshold on one feature? | stepper-states 0.62; stepper-states 0.57; stepper-states 0.57 | ok | ok | m | m | m | m | m | m | m | m |
| st:demo-lesson04/ml-trees-majority-vote | a | stepper-states | how does a random forest combine the predictions of its trees into one answer? | none 0.73; none 0.77; none 0.72 | m | m | m | m | m | m | m | m | m | m |
| st:illustrations/ml-llama-decoder-block | a | stepper-states | What happens inside one Llama-style decoder block? | none 0.52; none 0.59; none 0.51 | m | m | m | m | m | m | m | m | m | m |
| st:illustrations/cross-validation | a | stepper-states | how does cross-validation detect overfitting? | stepper-states 0.61; stepper-states 0.61; stepper-states 0.62 | ok | ok | ok | m | m | m | m | m | m | m |
| st:illustrations/ml-transformer-token-embeddings | a | stepper-states | How does a transformer turn the words in a sentence into embeddings? | none 0.7; none 0.7; none 0.69 | m | m | m | m | m | m | m | m | m | m |
| st:illustrations/ml-transformer-vocabulary-softmax | a | stepper-states | How does a transformer turn scores into a guess for the next word? | none 0.49; none 0.47; none 0.46 | m | m | m | m | m | m | m | m | m | m |
| st:phase02-batch/adaboost | a | stepper-states | What happens to the training weights after AdaBoost gets one example wrong? | stepper-states 0.87; stepper-states 0.9; stepper-states 0.89 | ok | ok | ok | ok | ok | ok | ok | ok | m | m |
| st:phase02-batch/stacking-oof | a | stepper-states | Where do the out-of-fold predictions for the stacking model come from? | none 0.53; stepper-states 0.52; stepper-states 0.52 | ok | m | m | m | m | m | m | m | m | m |
| st:phase02-batch/bayes-acquisition | a | stepper-states | How does Bayesian optimization decide which setting to try next? | stepper-states 0.73; stepper-states 0.75; stepper-states 0.69 | ok | ok | ok | ok | ok | m | m | m | m | m |
| st:phase02-batch/successive-halving | a | stepper-states | How does successive halving decide which trials get more training? | stepper-states 0.81; stepper-states 0.83; stepper-states 0.84 | ok | ok | ok | ok | ok | ok | ok | m | m | m |
| st:phase02-batch2c/rfe-refit | a | stepper-states | Why does recursive feature elimination refit after each drop? | stepper-states 0.96; stepper-states 0.98; stepper-states 0.96 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| st:review-batch-01/public-key-encryption | a | stepper-states | how does public-key encryption work? | stepper-states 0.89; stepper-states 0.9; stepper-states 0.88 | ok | ok | ok | ok | ok | ok | ok | ok | m | m |
| st:review-batch-01/k-means | a | stepper-states | how does k-means clustering work? | stepper-states 0.96; stepper-states 0.96; stepper-states 0.95 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| st:review-batch-01/k-means-p1 | a | stepper-states | how does the k-means algorithm group points into clusters? | stepper-states 0.96; stepper-states 0.95; stepper-states 0.96 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| st:review-batch-01/k-means-p2 | a | stepper-states | what happens to the centroids in k-means each iteration? | stepper-states 0.98; stepper-states 0.98; stepper-states 0.98 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| st:review-batch-01/k-means-p3 | a | stepper-states | explain k-means clustering with an example | stepper-states 0.89; stepper-states 0.86; stepper-states 0.86 | ok | ok | ok | ok | ok | ok | ok | ok | m | m |
| st:review-batch-01/bill-becomes-law | a | stepper-states | how does a bill become law in the United States? | stepper-states 0.99; stepper-states 0.98; stepper-states 0.98 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| st:review-batch-01/call-stack | a | stepper-states | how does the call stack work during recursion? | stepper-states 0.72; stepper-states 0.72; stepper-states 0.74 | ok | ok | ok | ok | ok | m | m | m | m | m |
| st:review-batch-01/call-stack-p1 | a | stepper-states | what happens on the stack when a function calls itself? | stepper-states 0.64; stepper-states 0.68; stepper-states 0.67 | ok | ok | ok | ok | m | m | m | m | m | m |
| st:review-batch-01/call-stack-p2 | a | stepper-states | how are stack frames pushed and popped in recursion? | stepper-states 0.8; stepper-states 0.81; stepper-states 0.81 | ok | ok | ok | ok | ok | ok | ok | m | m | m |
| st:review-batch-01/call-stack-p3 | a | stepper-states | explain the call stack and the base case in a recursive factorial | stepper-states 0.84; stepper-states 0.84; stepper-states 0.83 | ok | ok | ok | ok | ok | ok | ok | m | m | m |
| st:smoke/ref-t-account-cash | a | stepper-states | Explain post entries to cash | stepper-states 0.6; stepper-states 0.6; stepper-states 0.62 | ok | ok | ok | m | m | m | m | m | m | m |
| dp:1 | b | vertical-throw | At the highest point of a vertical throw, is acceleration zero because velocity is zero? | vertical-throw 1; vertical-throw 0.99; vertical-throw 0.99 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| dp:2 | b | vertical-throw | Why does a ball thrown straight up slow down on the way up? | vertical-throw 1; vertical-throw 1; vertical-throw 1 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| dp:3 | b | vertical-throw | I throw a ball straight up at 3 m/s. How high does it go? | vertical-throw 0.99; vertical-throw 0.99; vertical-throw 0.98 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| dp:4 | b | vertical-throw | Does a heavier ball thrown upward come down faster? | vertical-throw 0.7; vertical-throw 0.7; vertical-throw 0.68 | ok | ok | ok | ok | ok | m | m | m | m | m |
| dp:5 | b | vertical-throw | What happens to a ball thrown straight up on the Moon? | vertical-throw 0.99; vertical-throw 0.99; vertical-throw 1 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| dp:6 | b | vertical-throw | If I throw a ball up twice as fast, does it go twice as high? | vertical-throw 0.71; vertical-throw 0.75; vertical-throw 0.73 | ok | ok | ok | ok | ok | m | m | m | m | m |
| dp:7 | b | vertical-throw | Is a ball in free fall the moment it leaves my hand going up? | vertical-throw 1; vertical-throw 1; vertical-throw 1 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| dp:8 | b | vertical-throw | How long does a ball thrown upward stay in the air? | vertical-throw 0.98; vertical-throw 0.98; vertical-throw 0.98 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| dp:9 | b | vertical-throw | A ball is thrown up from a 2 m balcony. When does it pass the balcony again? | vertical-throw 0.98; vertical-throw 0.99; vertical-throw 0.99 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| dp:10 | b | vertical-throw | Why is the speed coming down the same as the speed going up at the same height? | vertical-throw 0.99; vertical-throw 0.98; vertical-throw 0.99 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| dp:12 | b | vertical-throw | On Mars, how much higher does a jump go? | vertical-throw 0.57; vertical-throw 0.57; vertical-throw 0.58 | ok | ok | m | m | m | m | m | m | m | m |
| dp:13 | b | vertical-throw | What is the acceleration of a ball at the top of its flight? | vertical-throw 0.99; vertical-throw 0.99; vertical-throw 0.99 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| dp:14 | b | vertical-throw | Does gravity turn off for a moment at the top of a throw? | vertical-throw 1; vertical-throw 1; vertical-throw 1 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| dp:15 | b | vertical-throw | Compare a ball dropped from rest with one at the top of a throw. | none 0.6; none 0.62; none 0.61 | m | m | m | m | m | m | m | m | m | m |
| dp:16 | b | vertical-throw | How does gravity's force on a ball change with its mass during a toss? | curve-sliders 0.76; curve-sliders 0.76; curve-sliders 0.83 | W | W | W | W | W | W | W | m | m | m |
| dp:17 | b | curve-sliders | Why does a sigmoid squash any number into 0 to 1? | curve-sliders 0.99; curve-sliders 1; curve-sliders 0.99 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| dp:18 | b | curve-sliders | What does the learning rate do to a loss curve? | curve-sliders 0.95; curve-sliders 0.95; curve-sliders 0.95 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| dp:19 | b | curve-sliders | How does the steepness parameter change a logistic curve? | curve-sliders 1; curve-sliders 1; curve-sliders 1 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| dp:20 | b | curve-sliders | What happens to a normal distribution when the standard deviation grows? | curve-sliders 0.99; curve-sliders 0.99; curve-sliders 0.99 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| dp:21 | b | curve-sliders | How does a capacitor's voltage rise over time as it charges? | curve-sliders 0.73; curve-sliders 0.77; curve-sliders 0.8 | ok | ok | ok | ok | ok | ok | m | m | m | m |
| dp:22 | b | curve-sliders | Show how exponential decay changes with the half-life. | curve-sliders 1; curve-sliders 0.99; curve-sliders 1 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| dp:23 | b | curve-sliders | What does ReLU look like compared with a sigmoid? | curve-sliders 0.6; curve-sliders 0.56; curve-sliders 0.55 | ok | ok | m | m | m | m | m | m | m | m |
| dp:24 | b | curve-sliders | How does the discount rate change the present value of a future payment? | curve-sliders 0.98; curve-sliders 0.98; curve-sliders 0.98 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| dp:25 | b | curve-sliders | Why does softmax temperature make the output flatter? | curve-sliders 0.98; curve-sliders 0.99; curve-sliders 0.98 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| dp:26 | b | curve-sliders | How does a parabola change when I change the coefficient of x squared? | curve-sliders 1; curve-sliders 1; curve-sliders 1 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| dp:27 | b | curve-sliders | What does a titration curve look like near the equivalence point? | curve-sliders 0.99; curve-sliders 0.99; curve-sliders 0.99 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| dp:28 | b | curve-sliders | How does the period of a sine wave change with frequency? | curve-sliders 0.78; curve-sliders 0.76; curve-sliders 0.78 | ok | ok | ok | ok | ok | ok | m | m | m | m |
| dp:29 | b | curve-sliders | How does compound interest grow with the rate? | curve-sliders 0.97; curve-sliders 0.98; curve-sliders 0.98 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| dp:30 | b | curve-sliders | What is the shape of the logistic growth of a population? | curve-sliders 0.99; curve-sliders 0.99; curve-sliders 0.99 | ok | ok | ok | ok | ok | ok | ok | ok | ok | ok |
| dp:31 | b | curve-sliders | How does a Gaussian kernel's width change the smoothing? | curve-sliders 0.79; curve-sliders 0.84; curve-sliders 0.82 | ok | ok | ok | ok | ok | ok | ok | m | m | m |
| dp:32 | b | curve-sliders | How does the tanh activation differ from a sigmoid? | none 0.51; curve-sliders 0.5; curve-sliders 0.5 | ok | m | m | m | m | m | m | m | m | m |
| dp:33 | b | curve-sliders | How does a pendulum's period depend on its length? | curve-sliders 0.9; curve-sliders 0.9; curve-sliders 0.89 | ok | ok | ok | ok | ok | ok | ok | ok | ok | m |
| no:aiml/vector-db | c | none | what is a vector database? | none 0.94; none 0.94; none 0.94 | - | - | - | - | - | - | - | - | - | - |
| no:aiml/gpu-look | c | none | what does a GPU look like? | none 1; none 1; none 1 | - | - | - | - | - | - | - | - | - | - |
| no:aiml/rack-look | c | none | what does a data-center rack look like? | none 1; none 1; none 1 | - | - | - | - | - | - | - | - | - | - |
| no:aiml/bio-neuron | c | none | what does a biological neuron look like? | none 1; none 1; none 1 | - | - | - | - | - | - | - | - | - | - |
| no:aiml/random-forest | c | none | what is a random forest? | none 0.81; none 0.78; none 0.8 | - | - | - | - | - | - | - | - | - | - |
| no:baseline/mesh-3d | c | none | explain a 3D mesh | none 0.96; none 0.96; none 0.96 | - | - | - | - | - | - | - | - | - | - |
| no:baseline/dna-helix | c | none | how is DNA shaped? | none 0.97; none 0.97; none 0.98 | - | - | - | - | - | - | - | - | - | - |
| no:baseline/castle | c | none | what are the parts of a medieval castle? | none 0.99; none 0.99; none 0.99 | - | - | - | - | - | - | - | - | - | - |
| no:baseline/dodecahedron | c | none | what is a dodecahedron? | none 0.99; none 0.99; none 1 | - | - | - | - | - | - | - | - | - | - |
| no:baseline/nebula | c | none | what is a nebula? | none 0.97; none 0.97; none 0.98 | - | - | - | - | - | - | - | - | - | - |
| no:baseline/leaf-venation | c | none | explain leaf venation | none 0.99; none 0.99; none 0.99 | - | - | - | - | - | - | - | - | - | - |
| no:baseline/coral-reef | c | none | what does a coral reef look like, and why? | none 0.95; none 0.96; none 0.97 | - | - | - | - | - | - | - | - | - | - |
| no:baseline/virus-vs-bacterium | c | none | how is a virus different from a bacterium? | none 1; none 1; none 0.99 | - | - | - | - | - | - | - | - | - | - |
| no:baseline/ww1-causes | c | none | what caused World War I? | none 0.74; none 0.75; none 0.74 | - | - | - | - | - | - | - | - | - | - |
| no:baseline/entropy | c | none | what is entropy? | none 0.74; none 0.7; none 0.69 | - | - | - | - | - | - | - | - | - | - |
| no:baseline/stack-vs-queue | c | none | compare a stack and a queue | none 0.98; none 0.99; none 0.98 | - | - | - | - | - | - | - | - | - | - |
| no:smoke/ml-stable-diffusion-image-caption-pairs | c | none | What does an image and caption pair look like in CLIP training data? | none 0.95; none 0.93; none 0.95 | - | - | - | - | - | - | - | - | - | - |
| dp:34 | d | none | A ball is thrown at 45 degrees. How far does it land? | none 0.66; none 0.63; none 0.61 | - | - | - | - | - | - | - | - | - | - |
| dp:35 | d | none | How does attention work in a transformer? | none 0.86; none 0.88; none 0.87 | - | - | - | - | - | - | - | - | - | - |
| dp:36 | d | none | Why does a skydiver reach terminal velocity? | none 0.67; none 0.65; none 0.67 | - | - | - | - | - | - | - | - | - | - |
| dp:37 | d | none | How does a mass on a spring oscillate? | none 0.62; none 0.65; none 0.64 | - | - | - | - | - | - | - | - | - | - |
| dp:38 | d | none | What is gradient descent? | stepper-states 0.83; stepper-states 0.86; stepper-states 0.84 | W | W | W | W | W | W | W | W | - | - |
| dp:39 | d | none | A block slides down a ramp with friction. How fast is it at the bottom? | none 0.7; none 0.71; none 0.71 | - | - | - | - | - | - | - | - | - | - |
| dp:40 | d | none | How do two carts collide elastically? | none 0.66; none 0.66; none 0.7 | - | - | - | - | - | - | - | - | - | - |
| dp:41 | d | none | What is a Punnett square? | none 0.99; none 0.99; none 0.99 | - | - | - | - | - | - | - | - | - | - |
| dp:42 | d | none | Why do satellites stay in orbit? | none 0.88; none 0.86; none 0.86 | - | - | - | - | - | - | - | - | - | - |
| dp:43 | d | none | How does a hash map work? | none 0.69; none 0.65; none 0.69 | - | - | - | - | - | - | - | - | - | - |
| dp:44 | d | none | What is a confusion matrix? | none 0.99; none 0.99; none 0.99 | - | - | - | - | - | - | - | - | - | - |
| dp:45 | d | none | How does TCP's three-way handshake work? | stepper-states 0.98; stepper-states 0.98; stepper-states 0.98 | W | W | W | W | W | W | W | W | W | W |
| dp:46 | d | none | What are the steps of the Krebs cycle? | stepper-states 0.99; stepper-states 0.99; stepper-states 0.99 | W | W | W | W | W | W | W | W | W | W |
| dp:47 | d | none | How does a decision tree split a dataset? | none 0.66; none 0.65; none 0.71 | - | - | - | - | - | - | - | - | - | - |
| dp:48 | d | none | How does a convolution slide over an image? | stepper-states 0.54; stepper-states 0.6; stepper-states 0.6 | W | W | W | - | - | - | - | - | - | - |
| dp:49 | d | none | A ball is dropped from a tower. How long until it hits the ground? | vertical-throw 0.51; vertical-throw 0.5; vertical-throw 0.5 | W | - | - | - | - | - | - | - | - | - |
| dp:50 | d | none | A ball is thrown downward from a bridge. How fast is it after one second? | vertical-throw 0.61; vertical-throw 0.63; vertical-throw 0.65 | W | W | W | W | - | - | - | - | - | - |
| dp:51 | d | none | Compare a binary tree and a linked list. | none 0.99; none 0.99; none 0.99 | - | - | - | - | - | - | - | - | - | - |
| dp:52 | d | none | How does DNS resolve a name? | stepper-states 0.84; stepper-states 0.85; stepper-states 0.89 | W | W | W | W | W | W | W | W | - | - |
| dp:53 | d | none | What is the difference between precision and recall? | none 0.93; none 0.95; none 0.95 | - | - | - | - | - | - | - | - | - | - |
| dp:54 | d | none | How does backpropagation assign blame to each weight? | none 0.65; none 0.67; none 0.62 | - | - | - | - | - | - | - | - | - | - |
| dp:55 | d | none | How does a transformer block stack its layers? | none 0.87; none 0.86; none 0.88 | - | - | - | - | - | - | - | - | - | - |
| dp:56 | d | none | Explain the water cycle. | stepper-states 0.98; stepper-states 0.98; stepper-states 0.98 | W | W | W | W | W | W | W | W | W | W |
| dp:57 | d | none | How does an electric field look around two charges? | none 0.97; none 0.96; none 0.96 | - | - | - | - | - | - | - | - | - | - |
| dp:58 | d | none | How does bootstrap sampling pick rows? | stepper-states 0.7; stepper-states 0.68; stepper-states 0.69 | W | W | W | W | W | - | - | - | - | - |
| dp:59 | d | none | Why does a bridge sway in wind? | none 0.85; none 0.83; none 0.87 | - | - | - | - | - | - | - | - | - | - |
| dp:60 | d | none | How does a neural network forward pass compute an output? | none 0.83; none 0.85; none 0.85 | - | - | - | - | - | - | - | - | - | - |

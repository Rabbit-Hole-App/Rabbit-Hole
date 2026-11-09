# 12 · Hyperparameter Tuning

[Curriculum lesson](https://raw.githubusercontent.com/rohitg00/ai-engineering-from-scratch/e7db050e64bde3be17a9381476f748da26d85692/phases/02-ml-fundamentals/12-hyperparameter-tuning/docs/en.md) · [Source inventory](../12-hyperparameter-tuning/manifest.json)

## Matching figures

| Figure | Teaching point |
| --- | --- |
| [5.6. Dropout · 01](../d2l-dropout/briefs.md#figure-01) | Training-time dropout temporarily disables some hidden activations and their paths while retaining the full network for inference. |
| [12.3. Gradient Descent · 04](../d2l-gd/briefs.md#figure-04) | Too small a rate can make every update move downhill yet leave the weight far from the minimum after the same budget. |
| [12.3. Gradient Descent · 05](../d2l-gd/briefs.md#figure-05) | Tiny updates make incremental progress while many useful steps remain before reaching the flat part of the loss. |
| [12.3. Gradient Descent · 06](../d2l-gd/briefs.md#figure-06) | Step size and gradient jointly determine how quickly a model crosses a steep section of the loss curve. |
| [12.3. Gradient Descent · 07](../d2l-gd/briefs.md#figure-07) | Excessive step size can bounce the weight across the optimum with each bounce going farther away. |
| [12.3. Gradient Descent · 08](../d2l-gd/briefs.md#figure-08) | A gradient can point downhill locally while a step along that direction lands at a higher loss. |
| [12.3. Gradient Descent · 09](../d2l-gd/briefs.md#figure-09) | Alternating sides of the minimum signals overshoot, and growing amplitudes distinguish divergence from convergence. |
| [12.3. Gradient Descent · 10](../d2l-gd/briefs.md#figure-10) | Gradient descent can settle in a nearby basin of a nonconvex loss even when a lower minimum exists elsewhere. |
| [12.3. Gradient Descent · 11](../d2l-gd/briefs.md#figure-11) | Reaching a point with nearly zero slope does not prove that the objective is globally minimized. |
| [12.3. Gradient Descent · 12](../d2l-gd/briefs.md#figure-12) | The initial weight can determine which valley a local gradient method finds. |
| [12.3. Gradient Descent · 16](../d2l-gd/briefs.md#figure-16) | A curvature-aware Newton update can rapidly approach the minimum on a smooth convex objective. |
| [12.3. Gradient Descent · 17](../d2l-gd/briefs.md#figure-17) | Newton's method divides the slope by local curvature to choose an update size. |
| [12.3. Gradient Descent · 18](../d2l-gd/briefs.md#figure-18) | On the convex example, large early Newton updates give way to smaller corrections close to the minimizer. |
| [12.3. Gradient Descent · 19](../d2l-gd/briefs.md#figure-19) | Newton's method can move uphill when a nonconvex objective has negative local curvature. |
| [12.3. Gradient Descent · 20](../d2l-gd/briefs.md#figure-20) | Local curvature does not always supply a safe descent direction for a nonconvex objective. |
| [12.3. Gradient Descent · 21](../d2l-gd/briefs.md#figure-21) | A curvature-scaled method may leave the nearby valley rather than refine its solution on a nonconvex loss. |
| [12.3. Gradient Descent · 22](../d2l-gd/briefs.md#figure-22) | Damping the Newton update can keep the same initial position from taking a destructive jump. |
| [12.3. Gradient Descent · 23](../d2l-gd/briefs.md#figure-23) | Multiplying the Newton step by a smaller rate can let this run settle into a nearby valley. |
| [12.3. Gradient Descent · 24](../d2l-gd/briefs.md#figure-24) | Damping changes the distance between Newton iterates without changing the loss curve itself. |
| [12.4. Stochastic Gradient Descent · 01](../d2l-sgd/briefs.md#figure-01) | A constant-rate stochastic gradient path can approach the optimum and keep jittering around it. |
| [12.4. Stochastic Gradient Descent · 02](../d2l-sgd/briefs.md#figure-02) | An unbiased noisy gradient can move the parameters downhill on average without making every step improve the loss. |
| [12.4. Stochastic Gradient Descent · 03](../d2l-sgd/briefs.md#figure-03) | A fixed step size keeps residual motion visible even once the average gradient becomes small. |
| [12.4. Stochastic Gradient Descent · 04](../d2l-sgd/briefs.md#figure-04) | Exponential decay reduces the size of late stochastic fluctuations but can stop useful movement before the optimum is reached. |
| [12.4. Stochastic Gradient Descent · 05](../d2l-sgd/briefs.md#figure-05) | When the rate drops quickly, the path can look smooth partly because later updates barely move the parameters. |
| [12.4. Stochastic Gradient Descent · 06](../d2l-sgd/briefs.md#figure-06) | Smaller late steps reduce noise without guaranteeing that the optimizer has reached the minimum. |
| [12.4. Stochastic Gradient Descent · 07](../d2l-sgd/briefs.md#figure-07) | A slower rate decay can preserve progress longer while allowing more residual jitter than a rapid decay. |
| [12.4. Stochastic Gradient Descent · 08](../d2l-sgd/briefs.md#figure-08) | A gradual schedule trades a larger late fluctuation for an endpoint that can be closer to the target in this example. |
| [12.4. Stochastic Gradient Descent · 09](../d2l-sgd/briefs.md#figure-09) | The choice of decay law influences both how long an SGD run keeps moving and how noisy its late updates remain. |
| [12.5. Minibatch Stochastic Gradient Descent · 01](../d2l-minibatch-sgd/briefs.md#figure-01) | Full-batch gradient descent makes one update per pass through the examples in this setup. |
| [12.5. Minibatch Stochastic Gradient Descent · 02](../d2l-minibatch-sgd/briefs.md#figure-02) | Looking only at epochs can hide how much computation goes into a full-batch update. |
| [12.5. Minibatch Stochastic Gradient Descent · 03](../d2l-minibatch-sgd/briefs.md#figure-03) | The full-batch loss history is a baseline for comparing alternative update frequencies on the same task. |
| [12.5. Minibatch Stochastic Gradient Descent · 04](../d2l-minibatch-sgd/briefs.md#figure-04) | One-example updates can reduce loss within a fraction of a data pass while adding late fluctuations. |
| [12.5. Minibatch Stochastic Gradient Descent · 05](../d2l-minibatch-sgd/briefs.md#figure-05) | A smaller gradient sample allows more updates per epoch but gives each update a noisier direction. |
| [12.5. Minibatch Stochastic Gradient Descent · 06](../d2l-minibatch-sgd/briefs.md#figure-06) | Fast loss reduction by epoch for sample-by-sample updates does not imply low wall-clock time. |
| [12.5. Minibatch Stochastic Gradient Descent · 07](../d2l-minibatch-sgd/briefs.md#figure-07) | A minibatch uses several examples per update while still making multiple updates in one data pass. |
| [12.5. Minibatch Stochastic Gradient Descent · 08](../d2l-minibatch-sgd/briefs.md#figure-08) | A moderate batch can retain frequent optimization steps while averaging over several example gradients. |
| [12.5. Minibatch Stochastic Gradient Descent · 09](../d2l-minibatch-sgd/briefs.md#figure-09) | A curve indexed by epochs can show similar convergence across batch sizes despite differences in the number of updates and runtime. |
| [12.5. Minibatch Stochastic Gradient Descent · 10](../d2l-minibatch-sgd/briefs.md#figure-10) | Reducing the minibatch size can leave the loss curve similar by epoch even though each epoch takes longer in the example. |
| [12.5. Minibatch Stochastic Gradient Descent · 11](../d2l-minibatch-sgd/briefs.md#figure-11) | Smaller batches expose a trade-off between more frequent updates and less efficient work per update. |
| [12.5. Minibatch Stochastic Gradient Descent · 12](../d2l-minibatch-sgd/briefs.md#figure-12) | Batch size changes the work performed between measured losses even when end-of-run losses are close. |
| [12.5. Minibatch Stochastic Gradient Descent · 13](../d2l-minibatch-sgd/briefs.md#figure-13) | Timing the methods can reverse the apparent ranking seen when loss is plotted only by data passes. |
| [12.5. Minibatch Stochastic Gradient Descent · 14](../d2l-minibatch-sgd/briefs.md#figure-14) | One-example SGD may take more time than a vectorized minibatch to reach similar loss. |
| [12.5. Minibatch Stochastic Gradient Descent · 15](../d2l-minibatch-sgd/briefs.md#figure-15) | Which batch size is fastest depends on both progress per update and cost per update. |
| [12.5. Minibatch Stochastic Gradient Descent · 16](../d2l-minibatch-sgd/briefs.md#figure-16) | A framework minibatch optimizer can reproduce the broad loss pattern of the hand-written update loop. |
| [12.5. Minibatch Stochastic Gradient Descent · 17](../d2l-minibatch-sgd/briefs.md#figure-17) | Similar loss ranges from a built-in optimizer do not require identical noisy updates. |
| [12.5. Minibatch Stochastic Gradient Descent · 18](../d2l-minibatch-sgd/briefs.md#figure-18) | A concise minibatch implementation can produce small loss fluctuations after the run has reached a low-loss region. |
| [12.6. Momentum · 01](../d2l-momentum/briefs.md#figure-01) | A narrow loss valley can make gradient descent bounce across the steep direction while advancing slowly along the shallow one. |
| [12.6. Momentum · 02](../d2l-momentum/briefs.md#figure-02) | Oscillations across the valley can shrink before the optimizer makes much progress along its length. |
| [12.6. Momentum · 03](../d2l-momentum/briefs.md#figure-03) | One shared rate must accommodate two very different curvature scales in ordinary gradient descent. |
| [12.6. Momentum · 04](../d2l-momentum/briefs.md#figure-04) | Raising the rate to move faster along the shallow direction can make the steep direction diverge. |
| [12.6. Momentum · 05](../d2l-momentum/briefs.md#figure-05) | One coordinate can move closer to its optimum while the joint parameter vector gets farther away. |
| [12.6. Momentum · 06](../d2l-momentum/briefs.md#figure-06) | Large late oscillations can dominate the scale and hide the initially modest instability. |
| [12.6. Momentum · 07](../d2l-momentum/briefs.md#figure-07) | Adding momentum can damp cross-valley motion and let the optimizer reach the neighborhood of the minimum at the rate that plain descent could not handle. |
| [12.6. Momentum · 08](../d2l-momentum/briefs.md#figure-08) | Remembering earlier gradients changes the path and permits continued progress along the valley. |
| [12.6. Momentum · 09](../d2l-momentum/briefs.md#figure-09) | Momentum does not eliminate the first bounce but can keep subsequent excursions bounded in this example. |
| [12.6. Momentum · 10](../d2l-momentum/briefs.md#figure-10) | A different rate and momentum pairing changes how long the optimizer oscillates before settling. |
| [12.6. Momentum · 11](../d2l-momentum/briefs.md#figure-11) | Repeated crossings of the valley can be compatible with convergence when each crossing becomes smaller. |
| [12.6. Momentum · 12](../d2l-momentum/briefs.md#figure-12) | The relative progress of two momentum settings can be assessed by comparing the same numbered iterates. |
| [12.6. Momentum · 13](../d2l-momentum/briefs.md#figure-13) | A larger momentum coefficient keeps older gradients influential for more updates. |
| [12.6. Momentum · 14](../d2l-momentum/briefs.md#figure-14) | A zero momentum coefficient keeps only the current gradient, while a positive coefficient assigns diminishing weights to older ones. |
| [12.6. Momentum · 15](../d2l-momentum/briefs.md#figure-15) | The coefficient of a gradient from several steps ago decays geometrically with age. |
| [12.6. Momentum · 16](../d2l-momentum/briefs.md#figure-16) | Momentum SGD can reduce regression training loss rapidly and then fluctuate around a lower region. |
| [12.6. Momentum · 17](../d2l-momentum/briefs.md#figure-17) | A short momentum training run separates the steep early improvement from the late low-loss behavior. |
| [12.6. Momentum · 18](../d2l-momentum/briefs.md#figure-18) | Small changes in late minibatch loss can remain after the optimizer has made most of its progress. |
| [12.6. Momentum · 19](../d2l-momentum/briefs.md#figure-19) | Increasing the momentum coefficient without coordinating the step size can make loss progress more uneven. |
| [12.6. Momentum · 20](../d2l-momentum/briefs.md#figure-20) | Stronger gradient memory can amplify a run's response even when the nominal learning rate stays fixed. |
| [12.6. Momentum · 21](../d2l-momentum/briefs.md#figure-21) | Early improvement under higher momentum does not guarantee a smooth low-loss region later. |
| [12.6. Momentum · 22](../d2l-momentum/briefs.md#figure-22) | Reducing the learning rate can make a higher-momentum run less erratic. |
| [12.6. Momentum · 23](../d2l-momentum/briefs.md#figure-23) | Rate and momentum should be evaluated together because the current step includes accumulated gradients. |
| [12.6. Momentum · 24](../d2l-momentum/briefs.md#figure-24) | In the lower-rate example, early descent is followed by a more stable low-loss region. |
| [12.6. Momentum · 25](../d2l-momentum/briefs.md#figure-25) | A built-in optimizer can implement momentum through the same learning-rate and memory settings as a hand-written update. |
| [12.6. Momentum · 26](../d2l-momentum/briefs.md#figure-26) | A built-in momentum run can match the overall convergence pattern without reproducing every minibatch fluctuation. |
| [12.6. Momentum · 27](../d2l-momentum/briefs.md#figure-27) | A short loss rebound after initial descent is compatible with useful optimization progress. |
| [12.6. Momentum · 28](../d2l-momentum/briefs.md#figure-28) | On a scalar quadratic, curvature and rate together determine whether plain gradient descent approaches zero monotonically or alternates in sign. |
| [12.6. Momentum · 29](../d2l-momentum/briefs.md#figure-29) | A near-zero update factor settles rapidly, while a negative factor flips the sign each step. |
| [12.6. Momentum · 30](../d2l-momentum/briefs.md#figure-30) | An alternating gradient-descent trajectory can still converge when the update factor's magnitude is below one. |
| [12.10. Adam · 01](../d2l-adam/briefs.md#figure-01) | An Adam training run can fall quickly toward a lower loss before settling into small minibatch fluctuations. |
| [12.10. Adam · 02](../d2l-adam/briefs.md#figure-02) | Adam's early reduction in training loss and its later plateau are two phases of the same run. |
| [12.10. Adam · 03](../d2l-adam/briefs.md#figure-03) | An adaptive optimizer can make most of its measured progress early while later minibatches still produce small variations. |
| [12.10. Adam · 04](../d2l-adam/briefs.md#figure-04) | A framework Adam optimizer gives a loss history with the same broad shape as the explicit update on this example. |
| [12.10. Adam · 05](../d2l-adam/briefs.md#figure-05) | A built-in Adam update should be evaluated from the loss history as well as checked for the intended settings. |
| [12.10. Adam · 06](../d2l-adam/briefs.md#figure-06) | A steep initial loss decline can give way to a stable low-loss region under the built-in adaptive optimizer. |
| [12.10. Adam · 07](../d2l-adam/briefs.md#figure-07) | Yogi's alternative second-moment update can train successfully in the example, even though the loss trace alone cannot identify the update rule. |
| [12.10. Adam · 08](../d2l-adam/briefs.md#figure-08) | Similar final losses can hide differences between Adam's and Yogi's internal gradient statistics. |
| [12.10. Adam · 09](../d2l-adam/briefs.md#figure-09) | The variant can keep a low training loss after its early descent without establishing a universal performance advantage. |
| [12.11. Learning Rate Scheduling · 01](../d2l-lr-scheduler/briefs.md#figure-01) | A fixed learning rate can keep improving the training metric after held-out accuracy levels off. |
| [12.11. Learning Rate Scheduling · 02](../d2l-lr-scheduler/briefs.md#figure-02) | The fixed-rate training run separates progress on seen examples from gains on examples the model has not seen. |
| [12.11. Learning Rate Scheduling · 03](../d2l-lr-scheduler/briefs.md#figure-03) | A declining training loss and a rising training accuracy do not imply a matching improvement on held-out data. |
| [12.11. Learning Rate Scheduling · 04](../d2l-lr-scheduler/briefs.md#figure-04) | An inverse-square-root rule takes large steps early and decreases the rate more gradually as updates accumulate. |
| [12.11. Learning Rate Scheduling · 05](../d2l-lr-scheduler/briefs.md#figure-05) | A scheduler computes a smaller rate from the update index without consulting the loss value. |
| [12.11. Learning Rate Scheduling · 06](../d2l-lr-scheduler/briefs.md#figure-06) | Inverse-square-root decay flattens without a discontinuity or a finite stopping point. |
| [12.11. Learning Rate Scheduling · 07](../d2l-lr-scheduler/briefs.md#figure-07) | Applying a shrinking step-size policy can change both the smoothness of training and the gap to held-out performance. |
| [12.11. Learning Rate Scheduling · 08](../d2l-lr-scheduler/briefs.md#figure-08) | A decaying schedule should be assessed on held-out outcomes as well as progress on the training set. |
| [12.11. Learning Rate Scheduling · 09](../d2l-lr-scheduler/briefs.md#figure-09) | The reported decay experiment shows one possible validation trajectory rather than a guarantee of better generalization. |
| [12.11. Learning Rate Scheduling · 10](../d2l-lr-scheduler/briefs.md#figure-10) | Repeated multiplication reduces the rate geometrically until a lower floor takes over. |
| [12.11. Learning Rate Scheduling · 11](../d2l-lr-scheduler/briefs.md#figure-11) | A floor in a factor schedule prevents arbitrarily small learning rates after many updates. |
| [12.11. Learning Rate Scheduling · 12](../d2l-lr-scheduler/briefs.md#figure-12) | A constant decay factor gives equal proportional drops before the minimum rate binds. |
| [12.11. Learning Rate Scheduling · 13](../d2l-lr-scheduler/briefs.md#figure-13) | A milestone schedule leaves the learning rate unchanged between chosen updates and drops it only at those milestones. |
| [12.11. Learning Rate Scheduling · 14](../d2l-lr-scheduler/briefs.md#figure-14) | In milestone decay, elapsed updates between drops do not change the current rate. |
| [12.11. Learning Rate Scheduling · 15](../d2l-lr-scheduler/briefs.md#figure-15) | Milestone decay differs from gradual decay because the full adjustment happens at the scheduled boundary. |
| [12.11. Learning Rate Scheduling · 16](../d2l-lr-scheduler/briefs.md#figure-16) | A model can continue improving after a planned drop, which is why schedules are evaluated over the whole run. |
| [12.11. Learning Rate Scheduling · 17](../d2l-lr-scheduler/briefs.md#figure-17) | Planned reductions provide smaller late updates even when a run's metrics fluctuate. |
| [12.11. Learning Rate Scheduling · 18](../d2l-lr-scheduler/briefs.md#figure-18) | A late improvement with milestone decay is an observed outcome of the example, and must be checked on unseen data. |
| [12.11. Learning Rate Scheduling · 19](../d2l-lr-scheduler/briefs.md#figure-19) | Cosine decay begins gently, decreases fastest in the middle, and approaches its final rate smoothly. |
| [12.11. Learning Rate Scheduling · 20](../d2l-lr-scheduler/briefs.md#figure-20) | A single cosine decay stops changing the rate once the selected horizon ends. |
| [12.11. Learning Rate Scheduling · 21](../d2l-lr-scheduler/briefs.md#figure-21) | A cosine schedule reduces the rate most rapidly around the middle of its decay period. |
| [12.11. Learning Rate Scheduling · 22](../d2l-lr-scheduler/briefs.md#figure-22) | A smooth cosine rate curve still needs a separate performance plot to judge what happened during training. |
| [12.11. Learning Rate Scheduling · 23](../d2l-lr-scheduler/briefs.md#figure-23) | Cosine annealing can give different train and held-out behavior even as the learning rate approaches a floor. |
| [12.11. Learning Rate Scheduling · 24](../d2l-lr-scheduler/briefs.md#figure-24) | The late metric region lets a learner compare whether a cosine-scheduled run kept improving on held-out examples. |
| [12.11. Learning Rate Scheduling · 25](../d2l-lr-scheduler/briefs.md#figure-25) | Warmup starts the optimizer cautiously, raises the rate, and only then starts the main decay. |
| [12.11. Learning Rate Scheduling · 26](../d2l-lr-scheduler/briefs.md#figure-26) | Combining warmup with cosine decay gives distinct ramp-up and cool-down phases. |
| [12.11. Learning Rate Scheduling · 27](../d2l-lr-scheduler/briefs.md#figure-27) | Warmup changes the earliest steps while leaving room for the same later annealing policy. |
| [12.11. Learning Rate Scheduling · 28](../d2l-lr-scheduler/briefs.md#figure-28) | The first few epochs show whether warmup gave the model a better start in this example. |
| [12.11. Learning Rate Scheduling · 29](../d2l-lr-scheduler/briefs.md#figure-29) | Training curves reveal the effect of the warmup phase separately from the later outcome. |
| [12.11. Learning Rate Scheduling · 30](../d2l-lr-scheduler/briefs.md#figure-30) | The warmup example tests initial learning behavior and does not make a claim that every later checkpoint improves. |
| [11.2. Attention Pooling by Similarity · 13](../d2l-attention-pooling/briefs.md#figure-13) | The same kernel can give a more responsive or a smoother fit depending on its bandwidth. |
| [11.2. Attention Pooling by Similarity · 14](../d2l-attention-pooling/briefs.md#figure-14) | The same kernel can give a more responsive or a smoother fit depending on its bandwidth. |
| [11.2. Attention Pooling by Similarity · 15](../d2l-attention-pooling/briefs.md#figure-15) | The same kernel can give a more responsive or a smoother fit depending on its bandwidth. |
| [11.2. Attention Pooling by Similarity · 16](../d2l-attention-pooling/briefs.md#figure-16) | The same kernel can give a more responsive or a smoother fit depending on its bandwidth. |
| [11.2. Attention Pooling by Similarity · 17](../d2l-attention-pooling/briefs.md#figure-17) | A narrower bandwidth concentrates normalized weight nearer each query and a broader one spreads it farther. |
| [11.2. Attention Pooling by Similarity · 18](../d2l-attention-pooling/briefs.md#figure-18) | A narrower bandwidth concentrates normalized weight nearer each query and a broader one spreads it farther. |
| [11.2. Attention Pooling by Similarity · 19](../d2l-attention-pooling/briefs.md#figure-19) | A narrower bandwidth concentrates normalized weight nearer each query and a broader one spreads it farther. |
| [11.2. Attention Pooling by Similarity · 20](../d2l-attention-pooling/briefs.md#figure-20) | A narrower bandwidth concentrates normalized weight nearer each query and a broader one spreads it farther. |

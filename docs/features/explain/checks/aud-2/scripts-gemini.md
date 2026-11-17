# Scripts, Gemini (one call per card, no retry)

Provider: google, requested model gemini-3.5-flash-lite; model that answered: gemini-3.5-flash-lite

## 1. Precision and Recall (precision-recall)
- Question: what is the difference between precision and recall?
- Depth: Brief (source depth field: overview)
- Model that answered: gemini-3.5-flash-lite via google
- Words: 197; speaking time 70 s at 170 wpm, 64 s at 185 wpm
- Tokens: prompt 942, completion 228 (total 1170); USD 0.000853; finish stop; 1568 ms

Precision and recall pull your model in opposite directions, which is why people often confuse them. Precision is about caution. When your model shouts yes, precision checks if it is crying wolf. If it makes ten positive guesses and nine are correct, its precision is ninety percent. It does not matter how many true items it missed elsewhere. Recall is about thoroughness. It looks at every single actual positive item hidden in the entire dataset and asks if you managed to catch it. If there are ten actual targets in total and you only found five, your recall is fifty percent, even if all five of your guesses were spot on. Think of a fisherman using a net. If the net catches only the target fish and nothing else, precision is high. If the net has huge holes and lets most of the fish swim away, recall is low. To get high recall, you could cast a massive net and drag up every fish in the lake. But now you have dragged up old boots and seaweed, so your precision plummets. Tuning a model means choosing the right balance between these two goals for your specific problem.

## 2. The TCP Handshake (tcp-handshake)
- Question: how does the TCP handshake work?
- Depth: Brief (source depth field: overview)
- Model that answered: gemini-3.5-flash-lite via google
- Words: 104; speaking time 37 s at 170 wpm, 34 s at 185 wpm
- Tokens: prompt 907, completion 124 (total 1031); USD 0.000582; finish stop; 1232 ms

People often think data starts flowing immediately after the server replies, but that is not quite right. The connection is only half open until the final acknowledgement is received. Think of it like shouting across a noisy room. You call out hello. The other person shouts hello back to prove they heard you. But until you wave back to confirm you heard their reply, neither of you starts talking. A common mix up is confusing the synchronization message with actual data packets. The sync message just sets up the sequence numbers. Watch out for blocked ports if your handshake gets stuck and times out.

## 3. Rise and Fall of the Roman Empire (roman-empire)
- Question: how did the Roman Empire rise and fall?
- Depth: Brief (source depth field: overview)
- Model that answered: gemini-3.5-flash-lite via google
- Words: 141; speaking time 50 s at 170 wpm, 46 s at 185 wpm
- Tokens: prompt 952, completion 165 (total 1117); USD 0.000698; finish stop; 1488 ms

People often think the Roman Empire fell because of a single sudden invasion, but the collapse actually took centuries of slow decay from within. Think of it like a giant tree rotting from the core until a mild wind finally knocks it over. The outside tribes only pushed down what was already hollow. Rome grew by absorbing its neighbors and offering them protection and trade, which made allies loyal. But as the territory grew too large, defending every border cost more money than the government could collect in taxes. Emperors tried to fix this by making coins with less silver in them, which caused prices to skyrocket. When money lost its value, trade slowed down, and people stopped trusting the system. Notice how economic health and strong leadership matter just as much as military might when a society grows too large.

## 4. What is gradient descent? (gradient-descent)
- Question: what is gradient descent?
- Depth: Brief (source depth field: overview)
- Model that answered: gemini-3.5-flash-lite via google
- Words: 138; speaking time 49 s at 170 wpm, 45 s at 185 wpm
- Tokens: prompt 909, completion 162 (total 1071); USD 0.000678; finish stop; 1236 ms

The hardest part of gradient descent is realizing that taking bigger steps does not always get you to the bottom faster. If you stride too far downhill in the fog, you might step right over the valley floor and land on the opposite slope, or even bounce higher than where you started. Think of adjusting the volume on a stereo by turning a dial. If the sound is too soft and you crank the knob all the way to the right, it becomes deafening. You overshot the target. Gradient descent uses a setting called the learning rate to control how big each step is. If your steps are too large, you bounce back and forth across the valley without ever settling in the lowest point. If your steps are too small, you might take forever to get there.

## 5. Bootstrap Coverage Limit (ml-trees-bootstrap-coverage)
- Question: why does a bootstrap sample contain only about 63% of the unique training rows?
- Depth: Balanced (source depth field: balanced)
- Model that answered: gemini-3.5-flash-lite via google
- Words: 250; speaking time 88 s at 170 wpm, 81 s at 185 wpm
- Tokens: prompt 1123, completion 282 (total 1405); USD 0.001042; finish stop; 1770 ms

The hardest part here is seeing how drawing with replacement guarantees that some rows appear multiple times while others disappear entirely. Think of it like rolling a die with six sides six times. You might hope to see all six numbers land at least once, but duplicates are bound to happen, and some faces will not show up at all. As the number of rows grows very large, this overlap settles into a steady mathematical rhythm. Imagine a dataset with one thousand rows. When you draw one row at a time with replacement, the chance that any single row is missed on one specific draw is nine hundred ninety-nine over one thousand. To find the chance that it is missed across all one thousand draws, you multiply that probability by itself one thousand times. That compound probability is what leads us to the number zero point three six eight, representing the proportion of rows left out. A common misconception is that sampling with replacement means you end up with a smaller version of your original dataset that still preserves every unique pattern equally. Notice instead that your bootstrap sample has the exact same total row count as the original, but roughly thirty seven percent of those slots are filled by duplicate copies of other rows, leaving the remaining sixty three percent as unique observations. When you train a model on this sample, it learns from a slightly scrambled view of your data, which is actually what helps us measure stability.

## 6. Quartiles, IQR, Whiskers & Outliers on One Scale (ref-box-plot-iqr-fences)
- Question: Explain quartiles, IQR fences, whiskers and outliers on one scale.
- Depth: Balanced (source depth field: balanced)
- Model that answered: gemini-3.5-flash-lite via google
- Words: 239; speaking time 84 s at 170 wpm, 78 s at 185 wpm
- Tokens: prompt 1029, completion 274 (total 1303); USD 0.000994; finish stop; 1818 ms

The hardest part of this setup is keeping track of what the whiskers actually show. People often think the whiskers always stretch out to touch the absolute minimum and maximum values in the entire data set. But they do not. The whiskers stop at the last data point that still sits inside the inner fence. Think of the fences as invisible walls set one and a half times the interquartile range beyond the first and third quartiles. If a data value falls inside those walls, the whisker extends out to meet it. If a data value falls outside those walls, it is left entirely on its own as an individual point, and the whisker pulls back to the last loyal neighbor inside the boundary. Imagine a row of houses where most homes have yards of similar size, but one house owns a massive sprawling ranch that spills way past the neighborhood gate. The gate is your fence. The houses with normal yards represent your whiskers, stretching as far as the gate allows. That far ranch house is your outlier, sitting out beyond the boundary all by itself. A common misconception is that outliers should be deleted because they are mistakes. But a point beyond the fence is not necessarily a bad data entry. It is just unusually distant from the bulk of the middle data. Notice where your fences fall before you decide what to do with the extremes.

## 7. Four-Stroke Engine Mechanics (four-stroke)
- Question: how does a four-stroke car engine work?
- Depth: Balanced (source depth field: balanced)
- Model that answered: gemini-3.5-flash-lite via google
- Words: 177; speaking time 62 s at 170 wpm, 57 s at 185 wpm
- Tokens: prompt 985, completion 205 (total 1190); USD 0.000808; finish stop; 1382 ms

The hardest part to picture is how up and down motion at the piston becomes rotation at the wheels. Think of riding a bicycle. Your legs move up and down in roughly straight lines, but they push against pedals arranged in a circle, turning your linear leg motion into spinning wheels. The crankshaft in an engine is the bicycle pedal, and the connecting rod is your leg. A common misconception is that the engine is producing power during all four strokes. In reality, the power stroke is the only time the engine is actually doing work. The other three strokes are just setting up for it or cleaning up after it, relying on the sheer momentum of a heavy metal wheel called the flywheel to keep the crankshaft spinning between power bursts. Notice how every fourth stroke is the only one pushing the car forward. To explore this further, listen to the distinct rhythm of an engine idling. You are hearing the repeating sequence of intake, compression, power, and exhaust happening dozens of times every single second.

## 8. Public-Key Encryption Mechanism (public-key-encryption)
- Question: how does public-key encryption work?
- Depth: Balanced (source depth field: balanced)
- Model that answered: gemini-3.5-flash-lite via google
- Words: 188; speaking time 66 s at 170 wpm, 61 s at 185 wpm
- Tokens: prompt 979, completion 220 (total 1199); USD 0.000844; finish stop; 1591 ms

The hardest part of public-key encryption is seeing how you can lock a box and yet be unable to unlock it with the exact same key. Think of it like a heavy padlock left open on a public desk. Anyone can snap the padlock shut on a donation box, locking it instantly. But once it clicks shut, the mechanism only opens with a specific key kept securely in Bob's pocket. The public key is that open padlock. The private key is the small metal key that reverses it. A common misconception is that the public key is just a weaker version of the private key that can be worked backward with enough time. In reality, the mathematics uses operations like multiplying two massive prime numbers together. Multiplying them takes a fraction of a second. But starting with the final product and figuring out which two prime numbers made it is like trying to unmix two distinct colors of paint after they have been stirred together. When you look at encryption protocols next, notice how they combine this public-key step with faster symmetric keys for the actual message body.

## 9. Softmax Transformation (softmax)
- Question: what does softmax do?
- Depth: Detailed (source depth field: deep)
- Model that answered: gemini-3.5-flash-lite via google
- Words: 199; speaking time 70 s at 170 wpm, 65 s at 185 wpm
- Tokens: prompt 946, completion 236 (total 1182); USD 0.000874; finish stop; 1628 ms

The hardest part of softmax is seeing how it stretches out the gap between scores. Exponentiating raw scores does not just make them positive. It turns linear differences into exponential ones. Imagine three raw scores of one, two, and three. Their exponentized values are roughly two point seven, seven point four, and twenty point zero. Notice how the jump from score one to two is small, but the jump from two to three is much larger. When you divide each by the total sum of thirty point one, you get probabilities of roughly nine percent, twenty four percent, and sixty six percent. The highest score gets an even bigger share of the total probability than it had in the raw scores. People often think softmax outputs true confidence levels for each class. It does not. It only measures relative dominance among the scores you give it. If you scale all your raw scores up by a factor of ten, the probabilities change drastically even though the underlying relationship between the classes is identical. Try feeding different sets of raw scores into a softmax calculation and watch how a larger maximum score rapidly starves the other categories of probability mass.

## 10. Binary Search Tree Operations (bst)
- Question: how does a binary search tree work?
- Depth: Detailed (source depth field: deep)
- Model that answered: gemini-3.5-flash-lite via google
- Words: 263; speaking time 93 s at 170 wpm, 85 s at 185 wpm
- Tokens: prompt 1019, completion 303 (total 1322); USD 0.001063; finish stop; 1748 ms

The hardest part to picture is not the comparison itself, but how the tree maintains its shape strictly through relative position rather than a rigid array index. Every time you cross a node, you are drawing a line through the entire remaining universe of possibilities. Think of playing a guessing game where someone picks a number between one and one hundred, and you are told higher or lower after every single guess. If you guess fifty and they say lower, you instantly throw away fifty numbers in one single step. That is what halving the search space means in practice. Suppose your tree has the root eight, with three to its left and ten to its right. You want to insert seven. You compare seven to eight. Seven is smaller, so you move left to three. Seven is larger than three, so you move right to six. Seven is larger than six, and the right child of six is empty. That empty slot is where seven settles. A common misconception is that any tree with two children per node is a binary search tree. But local branching is not enough. Every single node in the entire left subtree must be smaller than the root, not just the immediate left child. If a larger value slips down into a left branch out of order, the search invariant breaks entirely, and your logarithmic guarantees disappear. When you build or modify a tree by hand, always check that a new node respects the ordering constraints of every ancestor it passes beneath, not just its immediate parent.

## 11. The Water Cycle (water-cycle)
- Question: how does the water cycle work?
- Depth: Detailed (source depth field: deep)
- Model that answered: gemini-3.5-flash-lite via google
- Words: 227; speaking time 80 s at 170 wpm, 74 s at 185 wpm
- Tokens: prompt 955, completion 263 (total 1218); USD 0.000944; finish stop; 1708 ms

The hardest part to picture is not that water moves, but that the cycle has no single starting point. When solar energy heats surface water, evaporation turns liquid into invisible vapor, not visible steam. That vapor is as light as air, so it drifts upward until it meets colder air high above. As it cools, condensation forces the vapor back into liquid droplets or ice crystals, gathering around microscopic particles to form clouds. Precipitation does not fall because clouds get heavy and break. It falls because those tiny droplets collide and grow too large for rising air currents to support. Once rain or snow hits the ground, bulk aerodynamic formulas govern how fast the remaining surface water evaporates back into the wind, driven strictly by temperature differences and air speed. A common misconception is that runoff water flows mostly in underground rivers. In reality, most groundwater moves at a glacial pace through tiny pore spaces in soil and rock, taking months or years to seep into surface basins. Notice how thermal energy moves right along with this mass. When water evaporates, it absorbs heat from the surface. When it condenses miles away, it releases that exact same heat into the atmosphere. Next time you watch a storm, try tracing how energy absorbed from the sun in one hemisphere is released as heat when clouds form in another.

## 12. Gradient Descent Optimization (gradient-descent)
- Question: what is gradient descent?
- Depth: Detailed (source depth field: deep)
- Model that answered: gemini-3.5-flash-lite via google
- Words: 260; speaking time 92 s at 170 wpm, 84 s at 185 wpm
- Tokens: prompt 1021, completion 299 (total 1320); USD 0.001054; finish stop; 1565 ms

The hardest part of gradient descent is seeing why the gradient points uphill yet we subtract it. The gradient vector points in the direction of the steepest ascent, which means it tells you which way increases the loss the most. Since your goal is to find the minimum where the loss is lowest, you need to go in the exact opposite direction. That is why the update rule subtracts the gradient term instead of adding it. Imagine standing on a foggy hillside and wanting to reach the lowest valley. You cannot see the bottom, but you can feel the slope right beneath your feet. The slope tells you which way is steepest up. You turn around 180 degrees and take a step downhill. Suppose your current weight is five and the gradient at that point is positive four, meaning the loss rises as weight increases. If your learning rate is zero point one, you multiply the gradient by the learning rate to get zero point four. You subtract that from your current weight, moving it down to four point six. A common misconception is that the learning rate stays constant and guarantees a smooth path to the bottom. In practice, fixed step sizes can cause the algorithm to oscillate back and forth across a narrow valley or get stuck on a flat plateau where the gradient is near zero. When training stalls, notice if the loss curve flattens out or starts bouncing wildly. Next, try using adaptive learning rate methods that shrink the step size automatically when progress slows down.


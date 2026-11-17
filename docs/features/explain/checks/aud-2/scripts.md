# Scripts (one call per card, no retry)

Provider: fireworks, requested model accounts/fireworks/models/gpt-oss-120b

## 1. Precision and Recall (precision-recall)
- Question: what is the difference between precision and recall?
- Depth: Brief (source depth field: overview)
- Model that answered: accounts/fireworks/models/gpt-oss-120b via fireworks
- Words: 172; speaking time 61 s at 170 wpm, 56 s at 185 wpm
- Tokens: prompt 992, completion 254 (total 1246); USD 0.000301; finish stop; 1399 ms

The subtle point that trips most learners is that precision looks at the subset of cases you labeled positive, while recall looks at the whole set of actual positives. In other words, precision asks, “Of the items I claimed are yes, how many truly are yes?” Recall asks, “Of all the items that really are yes, how many did I manage to label as yes?” Imagine a spam filter that flags 100 emails as spam. If 80 of those are truly spam and 20 are legitimate mail, the precision is eighty percent. Now suppose there are actually 200 spam messages in the inbox. The filter caught 80 of them, so the recall is forty percent. This shows that a high precision does not guarantee that you have found most of the spam, and a high recall does not guarantee that the items you marked are correct. The key is to keep the two perspectives separate: precision measures correctness of your positive predictions, recall measures completeness of your coverage of the true positives.

## 2. The TCP Handshake (tcp-handshake)
- Question: how does the TCP handshake work?
- Depth: Brief (source depth field: overview)
- Model that answered: accounts/fireworks/models/gpt-oss-120b via fireworks
- Words: 221; speaking time 78 s at 170 wpm, 72 s at 185 wpm
- Tokens: prompt 956, completion 300 (total 1256); USD 0.000323; finish stop; 1619 ms

The part that trips most people is why the server sends back both a hello and a nod in a single step. Think of the first hello as a request to start a conversation, and the nod as the server saying it is ready and also telling the client which conversation slot it will use. In practice the client sends a SYN packet that contains an initial sequence number. The server replies with a SYN‑ACK packet that both acknowledges that number and supplies its own initial sequence number. That dual purpose is why the second message carries two pieces of information at once. Imagine you knock on a door and the person inside says, "Come in, and I’ll meet you at table three." The knock is the SYN, the reply confirming the knock and pointing to table three is the SYN‑ACK. Then the client steps inside and says, "I’m at table three," which is the final ACK. A common mistake is to think the server’s reply is just an acknowledgement and that the client must send a separate message to get the server’s sequence number. In reality the SYN‑ACK already includes that number, so the client can move straight to the ACK. If you notice the two numbers in the packet headers, you’ll see the handshake completing in just three steps.

## 3. Rise and Fall of the Roman Empire (roman-empire)
- Question: how did the Roman Empire rise and fall?
- Depth: Brief (source depth field: overview)
- Model that answered: accounts/fireworks/models/gpt-oss-120b via fireworks
- Words: 178; speaking time 63 s at 170 wpm, 58 s at 185 wpm
- Tokens: prompt 1003, completion 265 (total 1268); USD 0.000309; finish stop; 1566 ms

Many students think the shift from a republic to an empire was sudden, but it was a gradual erosion of shared power. Even after Augustus took the title of emperor, the Senate still existed and its members kept some authority, while the emperor quietly took control of the army and foreign policy. This overlapping of republican institutions with imperial rule meant that Rome did not flip a switch; it slid into a new system piece by piece. Think of it like a partnership that slowly hands over decision‑making to one partner who also brings in new staff and resources. The original partners remain on paper, but the dominant partner makes the real choices. A concrete illustration is the year 27 B.C., when Octavian was granted the title "princeps" and the power to command legions, yet the Senate still debated laws and appointed magistrates. Over time the titles changed, the emperor’s word became final, and the Senate’s role became mostly ceremonial. This slow blending explains why the early empire retained many republican forms while operating under an emperor’s authority.

## 4. What is gradient descent? (gradient-descent)
- Question: what is gradient descent?
- Depth: Brief (source depth field: overview)
- Model that answered: accounts/fireworks/models/gpt-oss-120b via fireworks
- Words: 170; speaking time 60 s at 170 wpm, 55 s at 185 wpm
- Tokens: prompt 959, completion 258 (total 1217); USD 0.000299; finish stop; 1411 ms

The trick that trips many learners is thinking the steps must be exactly the same size every time. In fact, gradient descent adapts the step length to the steepness of the slope. When the hill is steep, a short step keeps you from overshooting; when the ground is almost flat, a longer step lets you keep moving toward the bottom. Picture yourself on a very steep side of a hill. If you take a huge leap, you could tumble past the valley and end up on a higher ridge. By feeling the slope and choosing a modest step, you stay on a safe path. Now imagine a gentle slope near the valley floor. If you keep taking tiny steps, you will crawl forever. Increasing the step size a little lets you glide across the flat region and arrive at the lowest point more quickly. So the essence is not a fixed step size, but a step that follows the local steepness, allowing you to descend efficiently without missing the destination.

## 5. Bootstrap Coverage Limit (ml-trees-bootstrap-coverage)
- Question: why does a bootstrap sample contain only about 63% of the unique training rows?
- Depth: Balanced (source depth field: balanced)
- Model that answered: accounts/fireworks/models/gpt-oss-120b via fireworks
- Words: 310; speaking time 109 s at 170 wpm, 101 s at 185 wpm
- Tokens: prompt 1154, completion 407 (total 1561); USD 0.000417; finish stop; 2142 ms

The subtle point is that the 63 percent figure is an average expectation, not a guarantee for any single bootstrap sample. Each draw is independent, so the probability a given row never appears is the product of its miss chance on every draw, which is (one minus one over n) raised to the n‑th power. When n is large this product settles near one over e, about thirty‑six point eight percent. Because the omission probability stabilises, the complement – the chance that the row does appear at least once – settles near sixty‑two point two percent. That is why we say a bootstrap sample typically contains about sixty‑three percent of the distinct rows, even though any particular sample may contain more or fewer unique rows.

For a concrete illustration, take n equals one hundred. The chance a specific row is missed on a single draw is ninety‑nine over one hundred. Raising that to the hundredth power gives roughly thirty‑six point five percent. Subtracting from one yields sixty‑three point five percent expected coverage. If you actually draw a hundred rows with replacement, you might count, say, sixty‑nine distinct rows – a bit above the expectation – or you might end up with fifty‑seven distinct rows – a bit below. Over many repetitions the average will hover around sixty‑three percent.

A common misconception is to think that because we draw exactly n rows, we must see exactly n distinct rows, or that the 63 percent figure means a fixed proportion of rows will always be missing. In reality the number of distinct rows fluctuates around the expected value. To see this, try a small simulation: generate many bootstrap samples of size fifty from a data set of fifty rows, record the proportion of unique rows each time, and observe how the average converges toward sixty‑two point two percent while individual runs vary.

## 6. Quartiles, IQR, Whiskers & Outliers on One Scale (ref-box-plot-iqr-fences)
- Question: Explain quartiles, IQR fences, whiskers and outliers on one scale.
- Depth: Balanced (source depth field: balanced)
- Model that answered: accounts/fireworks/models/gpt-oss-120b via fireworks
- Words: 292; speaking time 103 s at 170 wpm, 95 s at 185 wpm
- Tokens: prompt 1075, completion 456 (total 1531); USD 0.000435; finish stop; 2136 ms

Many learners confuse the whisker ends with the fence values. The whiskers stop at the most extreme data point that still lies inside the fences, while the fences themselves are fixed positions calculated from the quartiles. In other words, the whisker is a data‑driven limit and the fence is a theoretical boundary. For a data set where Q1 equals six and Q3 equals twelve, the inter‑quartile range is six. Multiplying that by 1.5 gives nine, and subtracting nine from Q1 yields the lower fence at minus three, while adding nine to Q3 gives the upper fence at twenty‑one. Any observation below minus three or above twenty‑one would be marked as an outlier. Suppose the values in the set include 1, 4, 5, 6, 8, 10, 12, 14, and 18. Here the lower fence of minus three is well below the smallest value, so the lower whisker ends at 1, the minimum. The upper fence at twenty‑one is above the largest value, so the upper whisker ends at 18, the maximum, and no point is flagged as an outlier. If we added a value of 25, the upper fence would still be twenty‑one, but the whisker could only extend to the largest non‑outlier, which is 18, and the 25 would be shown as a separate outlier point. A common misconception is to think that any point beyond a whisker is automatically an outlier. In fact, whiskers may stop short of the fences if the data contain gaps, and points between the whisker end and the fence are still considered regular observations. To check your own plots, compute the fences first, then locate the most extreme data points that lie inside those limits; those become the whisker ends, and anything beyond remains an outlier.

## 7. Four-Stroke Engine Mechanics (four-stroke)
- Question: how does a four-stroke car engine work?
- Depth: Balanced (source depth field: balanced)
- Model that answered: accounts/fireworks/models/gpt-oss-120b via fireworks
- Words: 357; speaking time 126 s at 170 wpm, 116 s at 185 wpm
- Tokens: prompt 1034, completion 454 (total 1488); USD 0.000427; finish stop; 2342 ms

The part that trips most learners up is the way the four strokes are linked by the valves and the spark timing, not as four separate actions but as a continuous loop where each piston position determines which valve is open and when the spark fires. Imagine the cylinder as a hallway with two doors: an intake door and an exhaust door. When the piston is at the bottom during the intake stroke, the intake door opens and the exhaust door stays shut, allowing the fresh mixture to flow in. As the piston rises for compression, both doors are closed, so the mixture is trapped and compressed. At the top of this rise, the spark plug delivers a spark at just the right moment – not before compression is complete and not after the piston has started moving down – and the resulting explosion pushes the piston down, which is the power stroke. When the piston reaches the bottom again, the intake door closes and the exhaust door opens, letting the spent gases leave during the exhaust stroke. This seamless hand‑off is what makes the engine run smoothly.

Think of a bicycle pump that you push down and pull up repeatedly. If the inlet valve opened while you were pushing down, air would leak out and you would get no pressure. Similarly, in the engine the inlet must be closed during the power stroke, otherwise the explosion would just vent out instead of pushing the piston.

A common misunderstanding is to picture the spark as igniting the mixture the instant the piston reaches the top dead centre. In reality, the spark occurs a few degrees before that point, called advance timing, to ensure the explosion has reached peak pressure just as the piston begins its downward push. If you hear a knocking sound, it often means the spark is firing too early or too late, disturbing that precise timing.

Next time you watch an engine diagram, trace the piston’s path and note which valve is open and when the spark occurs. Seeing the loop in action will help you feel how each stroke depends on the others.

## 8. Public-Key Encryption Mechanism (public-key-encryption)
- Question: how does public-key encryption work?
- Depth: Balanced (source depth field: balanced)
- Model that answered: accounts/fireworks/models/gpt-oss-120b via fireworks
- Words: 261; speaking time 92 s at 170 wpm, 85 s at 185 wpm
- Tokens: prompt 1025, completion 361 (total 1386); USD 0.00037; finish stop; 1741 ms

The part that trips most people is the idea of a one‑way trapdoor function. Think of it as a lock that anyone can close easily, but only the holder of a special master key can open it. The public key lets Alice turn the lock, turning the plaintext into ciphertext, while the private key is the master key that lets Bob undo the lock. The lock is built on a mathematical problem that is easy to perform in one direction—like multiplying two large primes—but extremely hard to reverse without the secret factor information. 

For example, suppose Bob chooses two large prime numbers, fifty digits each, and multiplies them together. The product is his public modulus. Alice takes her message, turns it into a number, raises it to a public exponent, and reduces it modulo that product. She can do that quickly, even though the product hides the original primes. Bob, who knows the two primes, can use them to compute the private exponent and then reverse the operation, retrieving the original number. 

A common misconception is to think that the public key itself can somehow be used to decrypt if you try hard enough. In reality the public key is just the lock; without the private key the underlying mathematical problem—factoring the large product or solving the discrete logarithm—remains computationally infeasible. The cue to test your understanding is to ask whether the operation you are performing requires knowledge of the secret primes. If it does, you are on the decryption side; if it does not, you are on the encryption side.

## 9. Softmax Transformation (softmax)
- Question: what does softmax do?
- Depth: Detailed (source depth field: deep)
- Model that answered: accounts/fireworks/models/gpt-oss-120b via fireworks
- Words: 464; speaking time 164 s at 170 wpm, 150 s at 185 wpm
- Tokens: prompt 1000, completion 606 (total 1606); USD 0.000514; finish stop; 2768 ms

The step that trips most learners up is why we raise each score to an exponent before we normalise. It is not simply a mathematical trick to make the numbers larger; the exponential maps any real number onto a strictly positive scale and stretches differences non‑linearly. Small gaps in the raw scores become larger gaps after exponentiation, which sharpens the contrast between the highest‑scoring class and the rest. Think of a raw score of two versus one. Their exponentials are e to the two, about seven point three nine, and e to the one, about two point seven one. The ratio jumps from two‑to‑one in the raw space to roughly three‑to‑one after exponentiation, pulling the probability mass toward the larger score.

For a concrete example, suppose three classes have raw scores two point zero, one point zero, and zero point one. Compute e to the two point zero, which is about seven point three nine. Compute e to the one point zero, about two point seven one. Compute e to the zero point one, about one point one five. Add them together: the sum is roughly eleven point two five. Divide each exponentiated value by the sum. The first class gets seven point three nine divided by eleven point two five, roughly sixty six percent. The second gets two point seven one over eleven point two five, about twenty four percent. The third gets one point one five over eleven point two five, about ten percent. The probabilities now add up to one, and the class with the highest raw score dominates, but the others still retain a chance.

A common misconception is to think that softmax merely rescales the scores linearly into the [zero, one] interval. Because the operation uses exponentials, the transformation is highly non‑linear. If you change a raw score by a tiny amount, the resulting probability can shift dramatically, especially when the scores are close together. To see this, try adjusting the middle score from one point zero to one point five while holding the others fixed. Re‑compute the exponentials: e to the one point five is about four point five eight. The new sum becomes seven point three nine plus four point five eight plus one point one five, about thirteen point three two. The middle class probability rises to four point five eight divided by thirteen point three two, roughly thirty four percent, up from twenty four percent. Notice how a half‑point increase produced a ten‑point jump in probability.

When you experiment with softmax, watch the spacing of your raw scores. If they are all similar, the output distribution will be almost uniform. If one score stands out, its probability will dominate. Remember that the exponential step is what creates this sensitivity, not the final division step alone.

## 10. Binary Search Tree Operations (bst)
- Question: how does a binary search tree work?
- Depth: Detailed (source depth field: deep)
- Model that answered: accounts/fireworks/models/gpt-oss-120b via fireworks
- Words: 477; speaking time 168 s at 170 wpm, 155 s at 185 wpm
- Tokens: prompt 1072, completion 674 (total 1746); USD 0.000565; finish stop; 3046 ms

The trickiest part of a binary search tree is keeping the ordering invariant intact while the tree grows, because a single misplaced key can break the whole search guarantee. Think of the invariant as a rule that each node splits the universe of keys into two disjoint halves: everything smaller must live somewhere in the left subtree, everything larger must live somewhere in the right subtree. When you insert a new key you must follow that rule step by step, never jumping to a sibling or skipping a level, otherwise a later search might be sent down the wrong branch and miss the target entirely.

Consider a tree that currently holds the keys 8, 3, 10, 1, and 6, arranged with 8 at the root, 3 as its left child, 10 as its right child, 1 as the left child of 3, and 6 as the right child of 3. To insert the key 7 you start at the root. 7 is less than 8, so you move left to 3. It is greater than 3, so you move right to 6. It is greater than 6, and because 6 has no right child, you create a new node there and place 7. At each step the comparison respects the invariant, and the tree remains searchable.

Now imagine you tried to place 7 as the left child of 8 directly, ignoring the intermediate comparisons. The invariant would be violated because 7 is larger than 3, yet it would sit in a subtree that is supposed to contain only values smaller than 8 and, more importantly, smaller than any node on the path to it. A later search for 5 would go left from 8 to 7 and stop, never reaching the correct location under 3.

A common misconception is that every binary search tree automatically gives logarithmic performance. The O of log n holds only when the tree stays balanced, meaning the depths of left and right subtrees differ by at most a constant factor. If you insert keys in sorted order—say 1, 2, 3, 4, 5—the tree becomes a degenerate chain, and each search must walk through all n nodes, degrading to linear time. To notice this, watch the height of the tree as you add keys; if it starts to look like a linked list, the balance is lost.

What to try next is to build a small tree yourself, inserting keys in a random order such as 15, 8, 22, 5, 12, 19, 27. After each insertion, trace the path from the root to the new node, confirming that every comparison obeys the left‑smaller, right‑larger rule. Then deliberately unbalance the tree by inserting an already sorted sequence and observe how the search path length grows. This hands‑on comparison will make clear why the invariant and balance together are essential for the promised logarithmic efficiency.

## 11. The Water Cycle (water-cycle)
- Question: how does the water cycle work?
- Depth: Detailed (source depth field: deep)
- Model that answered: accounts/fireworks/models/gpt-oss-120b via fireworks
- Words: 398; speaking time 140 s at 170 wpm, 129 s at 185 wpm
- Tokens: prompt 1005, completion 527 (total 1532); USD 0.000467; finish stop; 2731 ms

The step that most students miss is that evaporation is not just a simple “water turns into vapor” because it is controlled by both temperature and wind speed in a quantitative way. Think of it as a heat engine: the sun supplies energy to warm the surface, but the actual amount of water that leaves the surface depends on how fast the air moves across it, pulling the vapor away. In the bulk‑aerodynamic formula the evaporation rate equals a coefficient times the wind speed times the difference between the saturated vapor pressure at the water temperature and the actual vapor pressure of the air. So a hot, still day may produce less evaporation than a cooler day with a strong breeze. 

Imagine a lake on a calm summer morning at twenty degrees Celsius. The saturated vapor pressure at that temperature is about twenty‑two millibars, while the ambient air might hold fifteen millibars. With a gentle breeze of one meter per second, the formula yields an evaporation flux of roughly one millimeter of water per day. Now picture the same lake in the afternoon with a brisk wind of five meters per second. Even though the temperature is only twenty‑two degrees, the increased wind multiplies the flux, raising the daily evaporation to around four millimeters. The extra water vapor climbs, cools, and turns into cloud droplets through condensation. 

A common misconception is to think that once water vapor reaches the clouds it will immediately fall as rain. In reality, the droplets must grow by colliding and coalescing, a process that can take hours to days depending on how much condensation occurs and how the air parcels move. If the air remains stable, the droplets may stay suspended and be transported far from their source before any precipitation occurs. 

To see the cycle in action, try a simple observation: place two identical shallow pans of water side by side, one covered with a lid and one uncovered, on a sunny balcony. After a day, the uncovered pan will have lost noticeably more water, showing how wind and open surface enhance evaporation. Then watch the clouds that form later and note when rain returns the water to the ground, eventually draining into the pan’s surroundings as runoff. This hands‑on experiment highlights how temperature, wind, condensation, and precipitation are linked in the continuous redistribution of thermal energy and mass across the planet.

## 12. Gradient Descent Optimization (gradient-descent)
- Question: what is gradient descent?
- Depth: Detailed (source depth field: deep)
- Model that answered: accounts/fireworks/models/gpt-oss-120b via fireworks
- Words: 366; speaking time 129 s at 170 wpm, 119 s at 185 wpm
- Tokens: prompt 1072, completion 622 (total 1694); USD 0.000534; finish stop; 2764 ms

The point that trips most learners is the idea that the gradient points directly toward the minimum. In fact the gradient points in the direction of steepest increase, so we move opposite to it. Imagine standing on a hillside covered in fog. The steepest uphill direction is given by the slope you feel under your feet. To get down, you must step directly downhill, which is the negative of that slope. That is what the update rule does: it subtracts the gradient, not adds it. 
Consider a simple quadratic loss L of one weight w defined as L(w)= (w‑3)². The gradient is 2 times (w‑3). Start at w₀ equals zero, and pick a learning rate η of 0.1. The first gradient at w₀ is –6, so the update is w₁ = 0 – 0.1·(–6) = 0.6. The second gradient at w₁ is 2·(0.6‑3)= –4.8, giving w₂ = 0.6 – 0.1·(–4.8)=1.08. A third step yields w₃ = 1.08 – 0.1·(2·(1.08‑3)) ≈1.464. Each step moves the weight closer to the true minimum at w equals three, but the movement shrinks as we approach the bottom. 
Now add a second weight and a bowl‑shaped loss surface L(w₁,w₂)= (w₁‑2)² + (w₂+1)². The gradient is the vector (2·(w₁‑2), 2·(w₂+1)). Starting at (0,0) with η equal to 0.2, the first update moves to (0.8, –0.4). The second update moves to (1.44, –0.72), and the third to (1.752, –0.876). The path traced on the contour plot shows a smooth spiral toward the centre of the bowl, illustrating how each component is adjusted simultaneously. 
A frequent misconception is to think that a larger learning rate always speeds up learning. In reality, if η exceeds a certain threshold, the update can jump past the minimum and start oscillating or diverging. On the quadratic example, a learning rate of 1.5 would send w₁ to 9, then back to –3, then to 9 again, never settling. To detect this, watch the loss values: if they start increasing dramatically after a few steps, the step size is too big. Try reducing η until the loss consistently declines, even if the descent becomes slower. This balance between speed and stability is the core practical skill when applying gradient descent.


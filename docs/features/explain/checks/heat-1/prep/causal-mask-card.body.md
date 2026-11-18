The decoder computes attention scores for each query token against all key tokens. To prevent using future information, a causal mask adds $-\,\infty$ to any score where the key index $j$ exceeds the query index $i$.

```rh-diagram
{"version":1,"diagram":{"kind":"heatmap","title":"Causal mask before softmax","caption":"Gray cells are blocked (‑∞) so later keys get zero weight.","rowLabel":"Query position","columnLabel":"Key position","columns":["1","2","3","4","5","6"],"rows":[{"label":"1","cells":[null,null,null,null,null,null]},{"label":"2","cells":[0,null,null,null,null,null]},{"label":"3","cells":[0,0,null,null,null,null]},{"label":"4","cells":[0,0,0,null,null,null]},{"label":"5","cells":[0,0,0,0,null,null]},{"label":"6","cells":[0,0,0,0,0,null]}],"range":{"min":0,"max":1}}}
```

After adding the mask, the softmax normalises only the allowed scores, yielding a probability distribution that sums to 1 for each row. Consequently, each token can attend only to itself and earlier tokens.

The mask is a binary matrix: entry $(i,j)$ is 0 (allowed) when $j\le i$ and $-\infty$ (blocked) otherwise. This simple rule enforces the autoregressive property required for language generation.
# C07 visual review

Coordinator inspected all 51 initially resolved views on nine production-renderer six-view pages, then regenerated and inspected all seven changed/new views after the correctness review: four corrected existing views plus three new/inherited role-product supporting views. The final 54 resolved views are covered. Official sheets have 18 views each at Overview, Standard and Deep.

Final outgoing code candidate: `350fdfc80e3ba4ad77d35ba1d1d663933cf4abd0`. Both packed projector triples, column orientations, B,A coefficient/value/product identity and same-case role product details are visible and consistent with their tensors. No clipping or unreadable matrix labels were found. The native 460px six-value-to-three-slices fork remains complete and readable at the 408px sheet scale; recurrent graph424, grouped bars420 and all-query415 are likewise readable. Other new native views use408. All 680px render requests fit680. Tall connected graphs are retained at full native width.

The shared key/query grids use common0–1 ranges, four ordered key rows and two query columns. Exact uniform control is0.25 per key. Numeric transformation operands/results, causal null masks/zero weights, layer/position identities, implicit probes and real graph handoffs were checked; column/row and layer identities survive each compact view. Rendering uses existing primitives without invented connectors or numeric text-box substitutes.

Changed/new compact spec hashes after the initial inspection:

```json
[
  {
    "name": "ml-attention-query-key-value-roles-brief-detail",
    "depth": "overview",
    "sha256": "127ed30ff385680c3f4fff9e3eb499fe5a98687a03b96611d5de3522c264b005",
    "previous": null
  },
  {
    "name": "ml-attention-causal-mask-and-weights-balanced",
    "depth": "standard",
    "sha256": "508fa5172b3ed3bdb518548770790ce26e475104b844b7e6c8b1dc1820f2020e",
    "previous": "e446e1395329ee6f237fefdffde728467cbe2c4e218f91121f153527e6494f60"
  },
  {
    "name": "ml-attention-packed-query-key-value-projections-balanced",
    "depth": "standard",
    "sha256": "cfe1b263ae7d14a5d7b666cca9197784df015751243c2083abe82a59131fbb2c",
    "previous": "e290fc7ca2829694051ac9b5d5ef50ff1eb62d6cd110af06119f78d0755cf543"
  },
  {
    "name": "ml-attention-query-key-value-roles-balanced-detail",
    "depth": "standard",
    "sha256": "127ed30ff385680c3f4fff9e3eb499fe5a98687a03b96611d5de3522c264b005",
    "previous": null
  },
  {
    "name": "ml-attention-packed-query-key-value-projections-detailed",
    "depth": "deep",
    "sha256": "51103ac88062d647bef89654702c199138c02b985ab1727781244b73dbeada66",
    "previous": "906b13cc82e720fae8b3ceb32a9d5eebe0a39eb977d1a296c375fdcfc31d72a5"
  },
  {
    "name": "ml-attention-query-key-value-roles-detailed-detail",
    "depth": "deep",
    "sha256": "c4891024e5a66cb99260a606a5ec4e5a8df1d24c76e876642e58bf4e75850caf",
    "previous": null
  },
  {
    "name": "ml-attention-weighted-vector-pooling-detailed",
    "depth": "deep",
    "sha256": "9d4a92c6b343d92bb99d28cff21ece795e11697de7a7606212d692711d7786e0",
    "previous": "32dc477c3ef8535088312ef519e267e401f6e90cff70f60c9e8c9844e77509d8"
  }
]
```

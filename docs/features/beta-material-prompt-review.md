# Material-turn prompt pin review

Only the shared create_material policy line changed. Budget, model, tool schema and request settings are unchanged. Existing pins are regenerated only after reproducing each previous pin by restoring that one line.

Before: create_material { command, request } adds a new card through the Learn commands: command is one of context.available_materials[].command; request says in plain words, with no backticks and no code, what the card should show. Several are allowed within the action limit only when the turn genuinely needs more than one, each with a different command; a paid one asks the learner first.

After: create_material { command, request } adds a card: command comes from context.available_materials[].command; request describes it in plain words, no backticks or code. Use multiple cards only when needed, with distinct commands, within the action limit. Paid cards ask first. When the card explains, do not repeat its explanation in respond_text.

| Previous hash | Current hash |
|---|---|
| b98775324236f08374562c57d49d0812dccd0b85857148ee9ad85f78ed7be12d | 8cceba67795ba399ca5fb70991b17e596a901fb5d47f83501c061ec6c6af33cf |
| b91cf3bb992759d516b29482bb18b7f8b14302d5aaff6a7a4340ced362b81a7d | 145fd4f4b4d0e0f3cebc3276d192a8a1a98ad93b4cdc0aba254e199d27378864 |
| a5bdef631bab271d3cf3ef0e8a84ced0a3fe287cb53641045a905287458b0b24 | 0d3bc1453d82b9a0692801ae48bc889d9daaaf239a68f7fc2af63c7ac386a3e7 |
| 8728fd7fb2e6d7168eb06b0c05c62be7e2201e99e215ec1d8fb996d7b2905fd7 | 585641c133c60bf5570bda021dff06ba26fa29dff4bd8e0782f22dd8074e3443 |
| e652127edfa18805a89718ca367aacdf0990d9ee71a08a9dda768fb62251470f | 71dfc50aaf050d6fd918c65538f40ef7370a0f410ed9eb63592142b618d17fab |
| 459e7d7ee77a3ec55087eacfc9f2fce4ca02e9df37028174097dc259e59c970d | d9e84d4fa249e0488c235338f70f5174d688c03f21b4a606ae4d6dffc40ded6f |

The same audited nanoGPT hashes are also pinned in learn-journey-prompts.test.js; those duplicate assertions use the current hashes above.

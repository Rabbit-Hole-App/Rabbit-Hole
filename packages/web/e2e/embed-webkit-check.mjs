// SHARE-04 embed in webkit: guest Chat, blocked storage, the hand-off. The whole check is embed-flows.mjs (read its header).
// Usage: BASE=http://127.0.0.1:8878 SMALL_CP=http://127.0.0.1:8879 node e2e/embed-webkit-check.mjs [shotsDir]
import { runEmbed } from './embed-flows.mjs';
await runEmbed('webkit');

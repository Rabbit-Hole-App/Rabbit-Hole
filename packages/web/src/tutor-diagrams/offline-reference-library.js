import { diagramReferences as registered } from './reference-library.js';
import { references as batch1Tree } from './ml-batch1-tree-references.js';
import { references as batch1Svm } from './ml-batch1-svm-references.js';
import { references as batch1Knn } from './ml-batch1-knn-references.js';
import { references as batch1Clustering } from './ml-batch1-clustering-references.js';
import { references as batch3Topology } from './ml-batch3-topology-references.js';
import { references as batch3Teaching } from './ml-batch3-teaching-references.js';
import priorSpecs from './offline-reference-overrides.json' with { type: 'json' };

// Keep the delivered offline specs for fixtures whose live counterparts use upstream labels or layouts.
const registeredIds = new Set(registered.map(ref => ref.id));
const shared = registered.map(ref => priorSpecs[ref.id] ? { ...ref, spec: priorSpecs[ref.id] } : ref);
const offline = [...batch1Tree, ...batch1Svm, ...batch1Knn, ...batch1Clustering, ...batch3Topology, ...batch3Teaching];
export const diagramReferences = Object.freeze([...shared, ...offline.filter(ref => !registeredIds.has(ref.id))]);

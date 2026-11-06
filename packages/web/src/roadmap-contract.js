// Read-only web facade for the shared roadmap enums and rules (v1.4 4.3: one module for server, client and tests). Re-exports only;
// never a second copy of an enum. The module is the State lane's roadmap/roadmap-contract.js.
export * from '../../control-plane/src/roadmap/roadmap-contract.js';

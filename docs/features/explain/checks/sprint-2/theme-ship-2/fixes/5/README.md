# 5: the Gemini unsteered-bundle size pin (a pin that release 149 left stale)

explanation-gemini-illustration-bundles.test.js pins the unsteered bundle at 134 properties and 9,832 characters. At 18cf9fce8 (main before release 149) it passes. Sprint 1's commit 7fcc07d0d (tree panels: title optional on a tree inside tree panels, in spec.js and ml-topology-spec.js) added schema properties, so main 74c4f68ae and the tip both measure 136 properties and 9,977 characters (the three questions in the test give the same). The preview's affected-tests step selects the file and refuses the record.
Pin only: the test's intent (the three illustration kinds add nothing to the unsteered bundle) is untouched; its other assertions pass. Before: 136 !== 134. After: 12 of 12 pass.

import fs from 'node:fs';
import { scriptSystem } from '../../audio-build/packages/control-plane/src/explanation-audio-script.js';
const E = 'C:/s/sprint2-evidence/audio-build/';
fs.writeFileSync(E + 'prompt-shipped-balanced-standard.txt', scriptSystem('balanced', 'standard') + '\n');
fs.writeFileSync(E + 'prompt-shipped-detailed-gemini.txt', scriptSystem('detailed', 'gemini') + '\n');
const v = fs.readFileSync('C:/s/sprint2-evidence/aud-2/prompt-v1.1.txt', 'utf8');
fs.writeFileSync(E + 'prompt-v1.1-section-A.txt', v.split('=== A. SYSTEM (same text for both models) ===')[1].split('=== B. USER')[0].trim() + '\n');

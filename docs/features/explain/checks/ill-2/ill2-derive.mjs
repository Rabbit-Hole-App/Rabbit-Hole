import fs from 'node:fs';
import { pathToFileURL } from 'node:url';
const blob = 'C:/s/spec/owner-local/persist/local/v3/r2/rabbit-hole-dev-learn-media/blobs/2054fe888174e9006857e1fbc21934aa858a7d384787c6de6b40ef9b61425a04000001a1f121519e';
const rec = JSON.parse(fs.readFileSync(blob, 'utf8'));
const { deriveVisualRequirements, requirementText, requiredMix } = await import(pathToFileURL('C:/s/r160-int/packages/control-plane/src/explanation-visuals.js').href);
const text = requirementText({ args: rec.request.args });
const vr = deriveVisualRequirements(text);
console.log(JSON.stringify({ argsLength: rec.request.args.length, requirementTextLength: text.length, items: vr.items?.map(i => ({ id: i.id, kind: i.kind, implied: !!i.implied, diagramKind: i.diagramKind ?? null })) ?? null, unsupported: vr.unsupported ? true : false, requiredMix: requiredMix(vr) }));
console.log(JSON.stringify({ bodyLength: rec.returned.body.length, figureSizeBytes: rec.returned.figures['pic-1'].fileRef.meta.size, altLength: rec.returned.figures['pic-1'].alt.length, captionLength: rec.returned.figures['pic-1'].caption.length, recordBytes: fs.statSync(blob).size, atUtc: rec.at, msTotal: rec.ms }));

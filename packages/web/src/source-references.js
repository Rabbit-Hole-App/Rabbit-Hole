const pathPattern=String.raw`[\w./-]+\.(?:py|pyi|js|jsx|ts|tsx|go|rs|java|c|h|cpp|rb|cs|sh|toml|txt|md|rst|json|csv|cfg|ini|yaml|yml|sql|css|html)|(?:[\w./-]+\/)?(?:LICENSE|Dockerfile|Makefile)`;
// The line part of a code reference, in the forms answers write (owner, 2026-10-08; repository-browser.md "Code references"):
// path:15-64, path:15–64, path:L15-L64, path#L15-L64 and path:15.
const linesPattern=String.raw`(?::L?|#L)\d+(?:[-–—]L?\d+)?`;
export const FILE_TOKEN=new RegExp(String.raw`^(${pathPattern})(?:(?::L?|#L)(\d+)(?:[-–—]L?(\d+))?)?$`);
export const INLINE_PARTS=new RegExp(String.raw`(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|\x60[^\x60]+\x60|\*\*[^*]+\*\*|\d+|(?:${pathPattern})${linesPattern}|\blines?\s+\d+(?:[-–—]\d+)?)`,'g');
export function sourceReference(value,defaultPath){
  const text=value.replace(/^`(.*)`$/,'$1');
  const file=text.match(FILE_TOKEN),relative=text.match(/^lines?\s+(\d+)(?:[-–—](\d+))?$/i);
  const path=file?.[1]||(relative&&defaultPath),start=Number(file?.[2]||relative?.[1]||1),end=Number(file?.[3]||relative?.[2]||start);
  return path&&start>0&&end>=start?{path,start,end}:null;
}
export function singleSourcePath(text){
  const paths=new Set();
  for(const match of text.matchAll(new RegExp(String.raw`(${pathPattern})${linesPattern}`,'g')))paths.add(match[1]);
  return paths.size===1?[...paths][0]:null;
}
// Every file citation in an answer, in order and once each: "model.py:29", "train.py:12-20", and the
// line lists models write as "model.py:29, 78" or one number per line ("prepare.py:4\n51"). Ask
// answers show them in a Sources dropdown (ask.jsx Md), each one opening its file.
export function citedSources(text){
  const seen=new Set(),out=[];
  const re=new RegExp(String.raw`(${pathPattern})(?::L?|#L)(\d+(?:[-–—]L?\d+)?)((?:[ \t]*[,\n][ \t]*\d+(?:[-–—]\d+)?(?=[ \t]*(?:[,\n\x60)]|$)))*)`,'g');
  for(const match of text.matchAll(re))for(const span of [match[2],...match[3].split(/[,\n]/).map(part=>part.trim()).filter(Boolean)]){
    const [start,end=start]=span.replace(/L/g,'').split(/[-–—]/).map(Number);
    const key=`${match[1]}:${start}-${end}`;
    if(start>0&&end>=start&&!seen.has(key)){seen.add(key);out.push({path:match[1],start,end});}
  }
  return out;
}
// The snapshot decides (owner, 2026-10-08): inside a repository context a reference is a link only when its path is a file of
// that repository's snapshot; any other path stays plain text, so there is no dead link. `has` is that test (CodeRefs, ask.jsx).
export const linkable=(reference,has)=>!!reference&&(!has||has(reference.path));
// A link's name, as a screen reader says it and the tooltip shows it: "Open signer.py lines 15–64", "Open model.py line 9".
export const referenceLabel=({path,start,end})=>`Open ${path.split('/').pop()} ${end>start?`lines ${start}–${end}`:`line ${start}`}`;

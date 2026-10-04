const pathPattern=String.raw`[\w./-]+\.(?:py|pyi|js|jsx|ts|tsx|go|rs|java|c|h|cpp|rb|cs|sh|toml|txt|md|rst|json|csv|cfg|ini|yaml|yml|sql|css|html)|(?:[\w./-]+\/)?(?:LICENSE|Dockerfile|Makefile)`;
export const FILE_TOKEN=new RegExp(`^(${pathPattern})(?::(\\d+)(?:[-–—](\\d+))?)?$`);
export const INLINE_PARTS=new RegExp(String.raw`(\[[^\]\n]+\]\(https?:\/\/[^\s)]+\)|\x60[^\x60]+\x60|\*\*[^*]+\*\*|\uE000\d+\uE001|(?:${pathPattern}):\d+(?:[-–—]\d+)?|\blines?\s+\d+(?:[-–—]\d+)?)`,'g');
export function sourceReference(value,defaultPath){
  const text=value.replace(/^`(.*)`$/,'$1');
  const file=text.match(FILE_TOKEN),relative=text.match(/^lines?\s+(\d+)(?:[-–—](\d+))?$/i);
  const path=file?.[1]||(relative&&defaultPath),start=Number(file?.[2]||relative?.[1]||1),end=Number(file?.[3]||relative?.[2]||start);
  return path&&start>0&&end>=start?{path,start,end}:null;
}
export function singleSourcePath(text){
  const paths=new Set();
  for(const match of text.matchAll(new RegExp(`(${pathPattern}):\\d+(?:[-–—]\\d+)?`,'g')))paths.add(match[1]);
  return paths.size===1?[...paths][0]:null;
}
// Every file citation in an answer, in order and once each: "model.py:29", "train.py:12-20", and the
// line lists models write as "model.py:29, 78" or one number per line ("prepare.py:4\n51"). Ask
// answers show them in a Sources dropdown (ask.jsx Md), each one opening its file.
export function citedSources(text){
  const seen=new Set(),out=[];
  const re=new RegExp(String.raw`(${pathPattern}):(\d+(?:[-–—]\d+)?)((?:[ \t]*[,\n][ \t]*\d+(?:[-–—]\d+)?(?=[ \t]*(?:[,\n\x60)]|$)))*)`,'g');
  for(const match of text.matchAll(re))for(const span of [match[2],...match[3].split(/[,\n]/).map(part=>part.trim()).filter(Boolean)]){
    const [start,end=start]=span.split(/[-–—]/).map(Number);
    const key=`${match[1]}:${start}-${end}`;
    if(start>0&&end>=start&&!seen.has(key)){seen.add(key);out.push({path:match[1],start,end});}
  }
  return out;
}

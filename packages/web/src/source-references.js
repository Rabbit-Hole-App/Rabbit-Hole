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

// Pure native-table proposal. The controller owns permission/source restrictions,
// frozen-content checks, preview and one-step Accept; this never edits a board.
const MAX_ROWS=10000,MAX_COLUMNS=200,MAX_CHARACTERS=2000000;
const fail=reason=>({ok:false,reason,changes:[],limitations:[]});
const record=value=>value!==null&&typeof value==='object'&&!Array.isArray(value);
const keys={sort:['operation','column','direction','sortType'],deduplicate:['operation','column'],scale:['operation','column','factor','unitFrom','unitTo']};
// Complete finite decimal cells only: no trimming, units, expressions, locale
// separators or coercion. BigInt coefficients avoid IEEE-754 rounding in results.
function decimal(text){
  if(typeof text!=='string'||text.length>128||!Number.isFinite(Number(text)))return null;
  const match=/^([+-]?)(\d+(?:\.\d*)?|\.\d+)(?:[eE]([+-]?\d+))?$/.exec(text);
  if(!match)return null;
  const [whole,fraction='']=match[2].split('.');
  const exponent=Number(match[3]||0)-fraction.length;
  if(Math.abs(exponent)>1000)return null;
  return{coefficient:BigInt(`${match[1]==='-'?'-':''}${whole||'0'}${fraction}`),exponent};
}
function compareNumbers(a,b){
  const exponent=Math.min(a.exponent,b.exponent);
  const left=a.coefficient*10n**BigInt(a.exponent-exponent),right=b.coefficient*10n**BigInt(b.exponent-exponent);
  return left<right?-1:left>right?1:0;
}
function multiply(a,b){
  const coefficient=a.coefficient*b.coefficient,exponent=a.exponent+b.exponent;
  if(coefficient===0n)return '0';
  const sign=coefficient<0n?'-':'',digits=(coefficient<0n?-coefficient:coefficient).toString();
  let result;
  if(exponent>=0)result=digits+'0'.repeat(exponent);
  else{const point=digits.length+exponent;result=point>0?`${digits.slice(0,point)}.${digits.slice(point)}`:`0.${'0'.repeat(-point)}${digits}`;result=result.replace(/0+$/,'').replace(/\.$/,'');}
  result=sign+result;
  return Number.isFinite(Number(result))?result:null;
}
function columnIndex(columns,column){
  if(Number.isInteger(column))return column>=0&&column<columns.length?column:-1;
  if(typeof column==='string'&&columns.filter(name=>name===column).length===1)return columns.indexOf(column);
  return -1;
}
// changes lists changed output row positions, with before/after copies (null for
// removed rows). It is preview evidence, not a patch to apply to a live table.
export function transformTable(table,spec){
  if(!record(table)||!Array.isArray(table.columns)||!table.columns.length||table.columns.length>MAX_COLUMNS||
    !Array.from(table.columns).every(cell=>typeof cell==='string')||!Array.isArray(table.rows)||table.rows.length>MAX_ROWS||
    !Array.from(table.rows).every(row=>Array.isArray(row)&&row.length===table.columns.length&&Array.from(row).every(cell=>typeof cell==='string')))
    return fail('Use a bounded native table with string columns and rectangular string rows.');
  if(table.columns.reduce((sum,cell)=>sum+cell.length,0)+table.rows.reduce((sum,row)=>sum+row.reduce((n,cell)=>n+cell.length,0),0)>MAX_CHARACTERS)
    return fail('This table is too large for a local transform.');
  if(!record(spec)||!Object.hasOwn(keys,spec.operation)||Object.keys(spec).some(key=>!keys[spec.operation].includes(key)))return fail('Unsupported table transform or options.');
  const operation=spec.operation,column=columnIndex(table.columns,spec.column);
  if((operation!=='deduplicate'||spec.column!==undefined)&&column<0)return fail('Choose an existing column by index or unique exact name.');
  let rows=table.rows.map(row=>[...row]);const limitations=[];
  if(operation==='sort'){
    const direction=spec.direction??'asc',sortType=spec.sortType??'numeric';
    if(!['asc','desc'].includes(direction)||!['numeric','text'].includes(sortType))return fail('Choose ascending/descending and numeric/text sorting.');
    const values=rows.map(row=>sortType==='numeric'?decimal(row[column]):row[column]);
    if(values.some(value=>value===null))return fail('Numeric sorting requires complete finite decimal cells; select text sorting explicitly for other values.');
    rows=rows.map((row,index)=>({row,index})).sort((a,b)=>{
      const comparison=sortType==='numeric'?compareNumbers(values[a.index],values[b.index]):values[a.index]<values[b.index]?-1:values[a.index]>values[b.index]?1:0;
      return comparison*(direction==='desc'?-1:1)||a.index-b.index;
    }).map(entry=>entry.row);
    if(sortType==='text')limitations.push('Text sorting uses literal, case-sensitive UTF-16 code-unit order; it does not infer numbers, dates or units.');
  }else if(operation==='deduplicate'){
    const seen=new Set();rows=rows.filter(row=>{const key=JSON.stringify(column<0?row:row[column]);if(seen.has(key))return false;seen.add(key);return true;});
    limitations.push(column<0?'Only exact duplicate rows are removed; the first occurrence is kept.':'Only exact selected-column duplicates are removed; the first row is kept even if other cells differ.');
  }else{
    if(typeof spec.factor!=='number'||!Number.isFinite(spec.factor)||!['unitFrom','unitTo'].every(key=>typeof spec[key]==='string'&&spec[key].trim().length>0&&spec[key].length<=80&&!/[\x00-\x1f\x7f]/.test(spec[key])))return fail('Scaling requires a finite numeric factor and explicit source and destination units.');
    const factor=decimal(String(spec.factor));
    for(const row of rows){const value=decimal(row[column]);if(!value||!factor)return fail('Scaling requires complete finite decimal cells, without unit suffixes or formulas.');const scaled=multiply(value,factor);if(scaled===null)return fail('The scaled value exceeds the finite numeric range.');row[column]=scaled;}
    limitations.push(`Applied the supplied factor ${spec.factor} from ${spec.unitFrom} to ${spec.unitTo}; unit compatibility and conversion correctness are not independently verified. Column labels are unchanged.`);
  }
  if(rows.reduce((sum,row)=>sum+row.reduce((n,cell)=>n+cell.length,0),0)>MAX_CHARACTERS)return fail('The transformed table exceeds the local size limit.');
  const changes=[];
  for(let index=0;index<Math.max(rows.length,table.rows.length);index++){
    const before=table.rows[index]??null,after=rows[index]??null;
    if(JSON.stringify(before)!==JSON.stringify(after))changes.push({row:index,before:before&&[...before],after:after&&[...after]});
  }
  return{ok:true,content:{columns:[...table.columns],rows},changes,limitations};
}

import type { CellFormat, DocumentTextField, LineItem, TextMark } from '../types';
export const documentTextFields: DocumentTextField[] = ['description','includedServices','inputs','outputs','unit','qty','unitPrice','total','number'];
export function cellFormat(item:LineItem, field:DocumentTextField):CellFormat {
  return {fontSize:item.fontSize || 7,align:['qty','unitPrice','total','number'].includes(field)?'center':item.textAlign || 'left',...item.formatting?.[field]};
}
export function textRuns(text:string, format:CellFormat) {
  const cuts=new Set([0,text.length]);
  for(const mark of format.marks || []){cuts.add(Math.max(0,Math.min(text.length,mark.start)));cuts.add(Math.max(0,Math.min(text.length,mark.end)));}
  const points=[...cuts].sort((a,b)=>a-b);
  return points.slice(0,-1).map((start,i)=>{
    const style={fontSize:format.fontSize || 7,bold:!!format.bold};
    for(const mark of format.marks || []) if(mark.start<=start && mark.end>start){if(mark.fontSize!==undefined)style.fontSize=mark.fontSize;if(mark.bold!==undefined)style.bold=mark.bold;}
    return {text:text.slice(start,points[i+1]),start,end:points[i+1],...style};
  });
}
export function formatSelection(text:string,format:CellFormat,start:number,end:number,patch:Pick<CellFormat,'fontSize'|'bold'>):CellFormat {
  if(start===end) return {...format,...patch,marks:(format.marks || []).map(m=>({...m,...patch}))};
  // Split existing ranges at the selection so repeated edits never accumulate overlaps.
  const marks:TextMark[]=[];
  const cuts=[...new Set([0,text.length,start,end,...(format.marks || []).flatMap(m=>[m.start,m.end])])].filter(n=>n>=0 && n<=text.length).sort((a,b)=>a-b);
  for(let i=0;i<cuts.length-1;i++){
    const a=cuts[i],b=cuts[i+1]; const run=textRuns(text,format).find(r=>r.start<=a && r.end>a);
    if(!run)continue;
    const style={fontSize:run.fontSize,bold:run.bold,...(a>=start && b<=end?patch:{})};
    const last=marks.at(-1);
    if(last && last.end===a && last.fontSize===style.fontSize && last.bold===style.bold)last.end=b;
    else marks.push({start:a,end:b,...style});
  }
  return {...format,marks};
}

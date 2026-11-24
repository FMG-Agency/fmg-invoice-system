import type {LineItem,DocumentTextField,CellFormat} from '../types';
import {cellFormat,textRuns} from '../lib/document-text';
function Text({value,format}:{value:string;format:CellFormat}){return <div style={{textAlign:format.align,whiteSpace:'pre-wrap'}}>{textRuns(value,format).map((run,i)=><span key={i} style={{fontSize:`${run.fontSize*.21}cqw`,fontWeight:run.bold?700:400}}>{run.text}</span>)}</div>}
export function DocumentTablePreview({items,type,media,currency,nameLabel='BUNDLE NAME'}:{items:LineItem[];type:'invoice'|'quotation';media:boolean;currency:string;nameLabel?:string}){
 const invoice=type==='invoice';const header=items[0]?.tableFormat;
 const labels=media?[...(invoice?['#']:[]),nameLabel,'INPUTS','OUTPUTS',`PRICE · ${currency}`]:['#','SERVICE / DELIVERABLE','QTY',...(invoice?[]:['UNIT']),'PRICE','TOTAL'];
 const widths=media?(invoice?[10,44,53,47,28]:[45,57,45,35]):invoice?[10,106,15,25,26]:[10,76,18,22,26,30];
 const cell=(item:LineItem,field:DocumentTextField,value:string)=><Text value={value} format={cellFormat(item,field)}/>;
 return <table className="formatted-document-preview"><colgroup>{widths.map((w,i)=><col key={i} style={{width:`${w/182*100}%`}}/>)}</colgroup><thead><tr>{labels.map((label,i)=><th key={i} style={{width:'auto',fontSize:`${(header?.fontSize || 6.5)*.21}cqw`,fontWeight:header?.bold===false?400:700,textAlign:header?.align || 'center'}}>{label}</th>)}</tr></thead><tbody>{items.map((item,index)=><tr key={item.id}>
 {(!media || invoice)&&<td>{cell(item,'number',String(index+1))}</td>}
 <td>{cell(item,'description',item.description || '—')}{!media&&!invoice&&item.includedServices.length>0&&cell(item,'includedServices',item.includedServices.join('\n'))}{media&&item.kind==='addon'&&item.appliesTo&&cell(item,'description',`For ${item.appliesTo}`)}{media&&item.kind==='addon'&&item.bundleTotal!=null&&cell(item,'description',`Bundle total: ${item.bundleTotal.toLocaleString()} EGP`)}</td>
 {media?<><td>{cell(item,'inputs',item.inputs.join('\n')||'—')}</td><td>{cell(item,'outputs',item.outputs.join('\n')||'—')}</td></>:<><td>{cell(item,'qty',String(item.qty))}</td>{!invoice&&<td>{cell(item,'unit',item.unit)}</td>}<td>{cell(item,'unitPrice',item.unitPrice.toLocaleString())}</td></>}
 <td>{cell(item,'total',(item.qty*item.unitPrice).toLocaleString())}</td></tr>)}</tbody></table>;
}

"use client";
import {useEffect,useLayoutEffect,useRef,useState} from 'react';
import {AlignLeft,AlignCenter,AlignRight,Bold,Minus,Plus,Trash2} from 'lucide-react';
import type {CellFormat,DocumentTextField,LineItem} from '../types';
import {cellFormat,documentTextFields,formatSelection,textRuns} from '../lib/document-text';

type SelectionInfo={id:string;field:DocumentTextField;start:number;end:number;text:string};
function selectionOffsets(root:HTMLElement){
 const selection=window.getSelection();if(!selection?.rangeCount)return null;
 const range=selection.getRangeAt(0);if(!root.contains(range.startContainer)||!root.contains(range.endContainer))return null;
 const before=range.cloneRange();before.selectNodeContents(root);before.setEnd(range.startContainer,range.startOffset);
 return {start:before.toString().length,end:before.toString().length+range.toString().length};
}
function restoreSelection(root:HTMLElement,start:number,end:number){
 const walker=document.createTreeWalker(root,NodeFilter.SHOW_TEXT);const nodes:Text[]=[];while(walker.nextNode())nodes.push(walker.currentNode as Text);
 if(!nodes.length)return;
 function point(offset:number):[Text,number]{for(const node of nodes){if(offset<=node.length)return [node,offset];offset-=node.length;}return [nodes[nodes.length-1],nodes[nodes.length-1].length];}
 const range=document.createRange();range.setStart(...point(start));range.setEnd(...point(end));const s=window.getSelection();s?.removeAllRanges();s?.addRange(range);
}
function RichCell({text,format,label,onChange,onSelect}:{text:string;format:CellFormat;label:string;onChange:(text:string,format:CellFormat)=>void;onSelect:(start:number,end:number)=>void}){
 const root=useRef<HTMLDivElement>(null);
 useLayoutEffect(()=>{
  const node=root.current!;const selected=selectionOffsets(node);
  const spans=textRuns(text,format).map(run=>{const span=document.createElement('span');span.textContent=run.text;span.dataset.size=String(run.fontSize);span.dataset.bold=String(run.bold);span.style.fontSize=`${run.fontSize*1.6}px`;span.style.fontWeight=run.bold?'700':'400';return span;});
  node.replaceChildren(...spans);if(selected)restoreSelection(node,selected.start,selected.end);
 },[text,JSON.stringify(format)]);
 const select=()=>{const s=selectionOffsets(root.current!);if(s)onSelect(s.start,s.end);};
 useEffect(()=>{document.addEventListener("selectionchange",select);return ()=>document.removeEventListener("selectionchange",select);});
 const change=()=>{
  const node=root.current!;let value='';const marks:NonNullable<CellFormat['marks']>=[];
  const walk=(n:Node)=>{if(n.nodeType===Node.TEXT_NODE){const str=n.textContent || '';const parent=n.parentElement?.closest<HTMLElement>('[data-size]');const start=value.length;value+=str;if(str.length)marks.push({start,end:value.length,fontSize:Number(parent?.dataset.size)||format.fontSize||7,bold:parent?parent.dataset.bold==='true':!!format.bold});}else if(n.nodeName==='BR'){value+='\n';}else n.childNodes.forEach(walk);};
  node.childNodes.forEach(walk);onChange(value,{...format,marks});select();
 };
 const insert=(text:string)=>{const s=window.getSelection();if(!s?.rangeCount)return;const range=s.getRangeAt(0);range.deleteContents();const node=document.createTextNode(text);range.insertNode(node);range.setStartAfter(node);range.collapse(true);s.removeAllRanges();s.addRange(range);change();};
 return <div ref={root} className="document-rich-cell" contentEditable suppressContentEditableWarning role="textbox" aria-label={label} aria-multiline="true" data-placeholder={label} style={{textAlign:format.align}} onInput={change} onFocus={select} onKeyUp={select} onMouseUp={select} onTouchEnd={select} onKeyDown={e=>{if(e.key==='Enter'){e.preventDefault();insert('\n');}}} onPaste={e=>{e.preventDefault();insert(e.clipboardData.getData('text/plain'));}} />;
}
export function DocumentItemsEditor({items,type,media,onChange,currency}:{items:LineItem[];type:'invoice'|'quotation';media:boolean;onChange:(items:LineItem[])=>void;currency:string}){
 const [selected,setSelected]=useState<SelectionInfo|null>(null);
 const [scope,setScope]=useState<'selection'|'table'>('table');
 const current=items.find(i=>i.id===selected?.id);
 const format=scope==='table'?{fontSize:items[0]?.tableFormat?.fontSize || items[0]?.fontSize || 7,bold:items[0]?.tableFormat?.bold || false,align:items[0]?.tableFormat?.align || 'left'} as CellFormat:current && selected ? cellFormat(current,selected.field):cellFormat(items[0] || {} as LineItem,'description');
 const selectedRun=scope==='selection' && selected && selected.start!==selected.end ? textRuns(selected.text,format).find(r=>r.start<=selected.start && r.end>selected.start):null;
 const size=selectedRun?.fontSize || format.fontSize || 7,bold=selectedRun?.bold ?? !!format.bold;
 const apply=(patch:Partial<CellFormat>)=>{
  if(scope==='table')onChange(items.map(item=>({...item,tableFormat:{...item.tableFormat,...patch},...(patch.fontSize?{fontSize:patch.fontSize}:{}),formatting:Object.fromEntries(documentTextFields.map(field=>{const f=cellFormat(item,field);return [field,{...f,...patch,marks:(f.marks || []).map(mark=>({...mark,...(patch.fontSize?{fontSize:patch.fontSize}:{}),...(patch.bold!==undefined?{bold:patch.bold}:{})}))}];}))})));
  else if(current && selected)onChange(items.map(item=>item.id!==current.id?item:{...item,formatting:{...item.formatting,[selected.field]:patch.align?{...format,align:patch.align}:formatSelection(selected.text,format,selected.start,selected.end,patch)}}));
 };
 const patch=(id:string,changes:Partial<LineItem>)=>onChange(items.map(item=>item.id===id?{...item,...changes}:item));
 const rich=(item:LineItem,field:'description'|'includedServices'|'inputs'|'outputs'|'unit',label:string)=>{
  const value=item[field],text=Array.isArray(value)?value.join('\n'):value;
  return <RichCell text={text} format={cellFormat(item,field)} label={label} onSelect={(start,end)=>{setSelected({id:item.id,field,start,end,text});setScope('selection');}} onChange={(value,format)=>patch(item.id,{[field]:Array.isArray(item[field])?value.split('\n'):value,formatting:{...item.formatting,[field]:format}})} />;
 };
 const numericStyle=(item:LineItem,field:DocumentTextField)=>{const f=cellFormat(item,field);return {fontSize:`${(f.fontSize || 7)*1.6}px`,fontWeight:f.bold?700:400,textAlign:f.align};};
 return <><div className="document-format-toolbar" role="toolbar" aria-label="Document text formatting" onMouseDown={e=>{if((e.target as HTMLElement).closest('button'))e.preventDefault();}}>
 <select aria-label="Formatting scope" value={scope} onChange={e=>{setScope(e.target.value as 'selection'|'table');if(e.target.value==='table')window.getSelection()?.removeAllRanges();}}><option value="table">Whole table</option><option value="selection" disabled={!selected}>Selected text / cell</option></select><i/>
 <button type="button" title="Decrease font size" aria-label="Decrease font size" onClick={()=>apply({fontSize:Math.max(6,size-1)})}><Minus size={15}/></button>
 <select aria-label="Font size" value={size} onChange={e=>apply({fontSize:Number(e.target.value)})}>{Array.from({length:19},(_,i)=>i+6).map(n=><option key={n} value={n}>{n} pt</option>)}</select>
 <button type="button" title="Increase font size" aria-label="Increase font size" onClick={()=>apply({fontSize:Math.min(24,size+1)})}><Plus size={15}/></button><i/>
 <button type="button" title="Bold" aria-label="Bold" aria-pressed={bold} onClick={()=>apply({bold:!bold})}><Bold size={18}/></button><i/>
 {([['left',AlignLeft],['center',AlignCenter],['right',AlignRight]] as const).map(([align,Icon])=><button type="button" key={align} aria-label={`Align ${align}`} title={`Align ${align}`} aria-pressed={format.align===align} onClick={()=>apply({align})}><Icon size={18}/></button>)}
 <small>{scope==='table'?'All table cells':'Select words to format · alignment applies to the cell'}</small></div>
 <div className="items-table-wrap" onKeyDown={e=>{if((e.ctrlKey || e.metaKey) && e.key.toLowerCase()==="b"){e.preventDefault();apply({bold:!bold});}}}><table className="items-table document-edit-table"><thead style={{fontSize:`${(items[0]?.tableFormat?.fontSize || 7)*1.6}px`,fontWeight:items[0]?.tableFormat?.bold===false?400:700,textAlign:items[0]?.tableFormat?.align}}><tr><th>#</th><th>Service / deliverable</th><th>Qty</th>{type==='quotation'&&<th>Unit</th>}<th>Unit price</th><th>Total</th><th/></tr></thead><tbody>{items.map((item,index)=><tr key={item.id}><td style={numericStyle(item,'number')}>{index+1}</td><td><div className="item-service-cell">{rich(item,'description','Describe the service')}{media?<div className="item-io-grid">{rich(item,'inputs','Inputs · one per line')}{rich(item,'outputs','Outputs · one per line')}</div>:type==='quotation'?rich(item,'includedServices','Included services · one per line'):null}{item.kind==='addon'&&item.appliesTo&&<small>Applies to {item.appliesTo}{item.bundleTotal!==null?` · Bundle total ${item.bundleTotal.toLocaleString()} ${currency}`:''}</small>}</div></td><td><input aria-label={`Quantity ${index+1}`} style={numericStyle(item,'qty')} type="number" min="0" step="0.01" value={item.qty} onChange={e=>patch(item.id,{qty:Number(e.target.value)})} onFocus={()=>{setSelected({id:item.id,field:'qty',start:0,end:0,text:String(item.qty)});setScope('selection');}}/></td>{type==='quotation'&&<td>{rich(item,'unit','Unit')}</td>}<td><input aria-label={`Unit price ${index+1}`} style={numericStyle(item,'unitPrice')} type="number" min={type==='quotation'?0:undefined} step="0.01" value={item.unitPrice} onChange={e=>patch(item.id,{unitPrice:Number(e.target.value)})} onFocus={()=>{setSelected({id:item.id,field:'unitPrice',start:0,end:0,text:String(item.unitPrice)});setScope('selection');}}/></td><td tabIndex={0} onFocus={()=>{setSelected({id:item.id,field:"total",start:0,end:0,text:String(item.qty*item.unitPrice)});setScope("selection");}} style={numericStyle(item,'total')}>{(item.qty*item.unitPrice).toLocaleString()} {currency}</td><td><button type="button" className="delete-item" aria-label={`Remove item ${index+1}`} disabled={items.length===1} onClick={()=>onChange(items.filter(i=>i.id!==item.id))}><Trash2 size={15}/></button></td></tr>)}</tbody></table></div></>;
}

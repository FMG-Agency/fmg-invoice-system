import test from 'node:test';
import assert from 'node:assert/strict';
import {readFile,writeFile,mkdir} from 'node:fs/promises';
import {build} from 'esbuild';
import {jsPDF} from 'jspdf';
import path from 'node:path';
test('quotation typography wraps within cells, aligns text, and paginates oversized rows',async()=>{
 await mkdir('work',{recursive:true});
 const source=await readFile('app/lib/pdf.ts','utf8');
 await build({stdin:{contents:source+'\nexport {itemLayout,drawItemSegment};',resolveDir:path.resolve('app/lib'),loader:'ts'},outfile:'work/pdf-format-test.mjs',bundle:true,platform:'node',format:'esm',packages:'external'});
 const {itemLayout,drawItemSegment,generateDocumentPdf}=await import('../work/pdf-format-test.mjs');
 const assets={logo:'data:image/png;base64,'+(await readFile('public/fmg-logo-pdf.png')).toString('base64'),regularFont:(await readFile('public/arial.ttf')).toString('base64'),boldFont:(await readFile('public/arial-bold.ttf')).toString('base64')};
 const doc=new jsPDF({unit:'mm'});doc.addFileToVFS('Arial.ttf',assets.regularFont);doc.addFont('Arial.ttf','FMGArial','normal');
 const base={id:'fixture',date:'2026-11-24',description:'A long description with words and line breaks\n'+'LongWord'.repeat(30),qty:1,unit:'Unit',unitPrice:500,kind:'custom',catalogId:null,includedServices:[],inputs:[],outputs:[],appliesTo:'',bundleTotal:null};
 const draft={type:'quotation',companyKey:'fmg',date:'2026-11-24',validUntil:'2026-12-24',preparedBy:'FMG',currency:'EGP',project:'Typography test',discount:0,tax:0,paymentTerms:'50% advance',notesExclusions:'',items:[base]};
 const widths=[10,76,18,22,26,30];
 for(const align of ['left','center','right'])for(const size of [6,10,14]){
 const layout=itemLayout(doc,draft,{...base,textAlign:align,fontSize:size},0,widths,false);
 assert.ok(layout.cells[1].lines.length>1);assert.equal(layout.fontSize,size);
 for(const [i,cell] of layout.cells.entries())for(const line of cell.lines) assert.ok(doc.getTextWidth(line)<=widths[i]-5+0.1,`cell ${i} overflow`);
 const calls=[];const fake={setFillColor(){},setDrawColor(){},rect(){},setFont(){},setFontSize(){},setTextColor(){},text(...args){calls.push(args)}};
 drawItemSegment(fake,layout,widths,0,50,0,layout.lineCount);
 const call=calls[1];assert.equal(call[3].align,align);assert.equal(call[1],align==='left'?26.5:align==='right'?97.5:62);
 }
 const category={name:'Agency Fees',footerText1:'FMG Agency',footerText2:'Thank you'};
 const client={name:'Test client',companyName:'Test Brand',ownerName:'Contact',email:'test@example.com',phone:'01000000000'};
 const regular=await generateDocumentPdf({...draft,items:['left','center','right'].map((textAlign,i)=>({...base,id:String(i),description:'Description alignment: '+textAlign+'\n'+'Creative direction and production details. '.repeat(9),textAlign,fontSize:[8,10,14][i]}))},client,category,'TEST-0001',assets);
 await writeFile('work/quotation-format-review.pdf',new Uint8Array(regular.output('arraybuffer')));
 const long=await generateDocumentPdf({...draft,items:[{...base,fontSize:14,includedServices:Array.from({length:30},(_,i)=>`Detail ${i+1}: `+'Production deliverable '.repeat(12))}]},client,category,'TEST-LONG',assets);
 assert.ok(long.getNumberOfPages()>2);await writeFile('work/quotation-format-long.pdf',new Uint8Array(long.output('arraybuffer')));
});

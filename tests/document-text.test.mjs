import test from 'node:test';
import assert from 'node:assert/strict';
import {build} from 'esbuild';
import {mkdir} from 'node:fs/promises';
test('text selections preserve surrounding styles and support overlapping edits',async()=>{
 await mkdir('work',{recursive:true});await build({entryPoints:['app/lib/document-text.ts'],outfile:'work/document-text-test.mjs',bundle:true,platform:'node',format:'esm'});
 const {formatSelection,textRuns}=await import('../work/document-text-test.mjs');
 const text='Normal bold ending';let style={fontSize:8};
 style=formatSelection(text,style,7,11,{bold:true,fontSize:16});
 assert.deepEqual(textRuns(text,style).map(({text,fontSize,bold})=>({text,fontSize,bold})),[{text:'Normal ',fontSize:8,bold:false},{text:'bold',fontSize:16,bold:true},{text:' ending',fontSize:8,bold:false}]);
 style=formatSelection(text,style,9,13,{bold:false});
 const runs=textRuns(text,style);assert.equal(runs.map(r=>r.text).join(''),text);assert.equal(runs.find(r=>r.start<=9&&r.end>9).bold,false);assert.equal(runs.find(r=>r.start<=7&&r.end>7).bold,true);
 style=formatSelection(text,style,0,0,{fontSize:12});assert.ok(textRuns(text,style).every(r=>r.fontSize===12));
});

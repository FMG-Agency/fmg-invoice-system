export function filteredDocumentTotals(documents:ReadonlyArray<{total:number;currency:string;deletedAt?:string|null}>){
 return documents.reduce<Record<string,number>>((totals,doc)=>{if(!doc.deletedAt&&Number.isFinite(doc.total)){const currency=doc.currency||'EGP';totals[currency]=(totals[currency]||0)+doc.total}return totals},{});
}

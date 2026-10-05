import { database } from "./database";

export function invoicePaymentSummary(total:number,status:string,paid:number,credited=0,refunded=0) {
  const inferred=status === "Paid" ? Math.max(0,total-paid-credited) : 0;
  return {paid:paid+inferred,remaining:Math.max(0,Math.round((total-paid-inferred-credited+refunded)*100)/100)};
}

// A single named ledger entry stores only the amount not already recorded by Finance.
// Re-saving the same paid total therefore never creates duplicate payments.
export async function setPartialInvoicePayment(id:number,paidAmount:number,userId:number,fullyPaid=false) {
  const document=await database.prepare("SELECT type,total,client_id,currency FROM documents WHERE id=?").bind(id).first();
  if(!document || document.type!=="invoice") throw new Error("Choose an existing invoice.");
  const key=`invoice-payment:${id}`;
  const snapshot=await database.prepare("SELECT json_group_array(json_array(id,type,amount,source_key)) AS fingerprint FROM (SELECT * FROM client_financial_transactions WHERE document_id=? ORDER BY id)").bind(id).first();
  const fingerprint=String(snapshot!.fingerprint);
  const rows={results:(JSON.parse(fingerprint) as [number,string,number,string][]).map(([id,type,amount,source_key])=>({id,type,amount,source_key}))};
  const otherPaid=rows.results.filter(r=>r.type==='payment' && r.source_key!==key).reduce((n,r)=>n+Number(r.amount),0);
  const credited=rows.results.filter(r=>r.type==='credit').reduce((n,r)=>n+Number(r.amount),0);
  const refunded=rows.results.filter(r=>r.type==='refund').reduce((n,r)=>n+Number(r.amount),0);
  if(fullyPaid) paidAmount=Number(document.total)-credited+refunded;
  const cents=(n:number)=>Math.round(n*100)/100;
  paidAmount=cents(paidAmount);
  const amount=cents(paidAmount-otherPaid);
  const remaining=cents(Number(document.total)-paidAmount-credited+refunded);
  if(!Number.isFinite(paidAmount)||(!fullyPaid && (paidAmount<=0||remaining<=0))||paidAmount>Number(document.total)+refunded) throw new Error("Enter a partial payment greater than zero with a remaining balance.");
  if(amount<0) throw new Error("This is less than payments already recorded in the client account. Correct those transactions first.");
  await database.prepare("CREATE TABLE IF NOT EXISTS invoice_payment_guard(value INTEGER CONSTRAINT invoice_payment_unchanged CHECK(value=1))").run();
  await database.batch([
    database.prepare(`INSERT INTO invoice_payment_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM documents WHERE id=? AND total=? AND client_id=? AND currency=?) AND
      (SELECT json_group_array(json_array(id,type,amount,source_key)) FROM (SELECT * FROM client_financial_transactions WHERE document_id=? ORDER BY id))=? THEN 1 ELSE 0 END`)
      .bind(id,document.total,document.client_id,document.currency,id,fingerprint),
    database.prepare("DELETE FROM client_financial_transactions WHERE source_key=? AND ?=0").bind(key,amount),
    database.prepare(`INSERT INTO client_financial_transactions(client_id,document_id,type,amount,currency,transaction_date,payment_method,source_key,created_by)
      SELECT ?,?,'payment',?,?,date('now'),'Invoice payment',?,? WHERE ?>0 ON CONFLICT(source_key) WHERE source_key<>'' DO UPDATE SET amount=excluded.amount,updated_at=CURRENT_TIMESTAMP`).bind(document.client_id,id,amount,document.currency,key,userId,amount),
    database.prepare("UPDATE documents SET status=?,updated_at=CURRENT_TIMESTAMP WHERE id=?").bind(fullyPaid?"Paid":"Partially paid",id),
    database.prepare("DELETE FROM invoice_payment_guard"),
  ]);
}

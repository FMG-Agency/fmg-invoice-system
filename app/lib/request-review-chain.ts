import {database} from './database';
import type {EmployeeRequest,RequestApprovalStep} from '../types';
import {requestOverlay,seedRequest,exchangeGuard,approvalConflictGuard} from './request-attendance';
import {administratorUserIds,notifyUsers} from './notifications';

export async function reviewPolicy(employeeId:number){
 return (await database.prepare(`SELECT p.user_id AS userId,u.display_name AS name FROM request_review_policy p JOIN auth_users u ON u.id=p.user_id WHERE p.employee_id=? ORDER BY p.user_id`).bind(employeeId).all<{userId:number;name:string}>()).results;
}
export async function decorateRequestReviews(requests:EmployeeRequest[],session:{userId:number;isAdmin:boolean}){
 const policies=(await database.prepare('SELECT p.employee_id AS employeeId,p.user_id AS userId,u.display_name AS name FROM request_review_policy p JOIN auth_users u ON u.id=p.user_id').all<{employeeId:number;userId:number;name:string}>()).results;
 const ids=requests.filter(r=>!r.isManual&&policies.some(p=>p.employeeId===r.employeeId)).map(r=>r.id);
 const votes=ids.length?(await database.prepare(`SELECT request_id AS requestId,reviewer_key AS key,approved_at AS approvedAt,note FROM request_review_votes WHERE request_id IN (${ids.map(()=>'?').join(',')})`).bind(...ids).all<{requestId:number;key:string;approvedAt:string;note:string}>()).results:[];
 for(const r of requests){
  const policy=r.isManual?[]:policies.filter(p=>p.employeeId===r.employeeId);
  r.approvalSteps=policy.length?[{key:'admin',name:'Administrator',userId:null},...policy.map(p=>({key:'user:'+p.userId,name:p.name,userId:p.userId}))].map(step=>({...step,approvedAt:votes.find(v=>v.requestId===r.id&&v.key===step.key)?.approvedAt||'',note:votes.find(v=>v.requestId===r.id&&v.key===step.key)?.note||''})):[];
  r.canReview=r.status==='pending'&&(r.approvalSteps.length?r.approvalSteps.some(step=>(session.isAdmin?step.key==='admin':step.userId===session.userId)&&!step.approvedAt):session.isAdmin);
 }
}
export async function approvalSteps(request:EmployeeRequest):Promise<RequestApprovalStep[]>{await decorateRequestReviews([request],{userId:0,isAdmin:false});return request.approvalSteps||[];}
export async function requestRecipients(employeeId:number,excludeId?:number){return [...new Set([...(await administratorUserIds(excludeId)),...(await reviewPolicy(employeeId)).map(p=>p.userId)])].filter(id=>id!==excludeId);}

// Optimistic version guard makes simultaneous approvals/rejection atomic. A stale
// reviewer retries against the current state; no partial vote or payroll effect is saved.
export async function decideReviewChain(request:EmployeeRequest,session:{userId:number;isAdmin:boolean},decision:'approved'|'rejected',note:string,paid:boolean){
 const steps=await approvalSteps(request);if(!steps.length)return null;
 const key=session.isAdmin?'admin':'user:'+session.userId;
 if(!steps.some(s=>s.key===key))return Response.json({error:'You are not a required reviewer for this request.'},{status:403});
 if(steps.find(s=>s.key===key)?.approvedAt)return Response.json({error:'Your approval is already recorded.'},{status:409});
 const adminVote=await database.prepare("SELECT paid FROM request_review_votes WHERE request_id=? AND reviewer_key='admin'").bind(request.id).first<{paid:number}>();
 const payrollPaid=session.isAdmin?paid:adminVote?Boolean(adminVote.paid):request.leavePaid??true;
 const final=decision==='rejected'?'rejected':steps.every(s=>s.key===key||s.approvedAt)?'approved':'pending';
 const overlay=requestOverlay(request,payrollPaid),token=crypto.randomUUID();
 const guard=database.prepare("INSERT INTO hr_manual_request_guard SELECT CASE WHEN EXISTS(SELECT 1 FROM employee_requests WHERE id=? AND status='pending' AND updated_at=?) THEN 1 ELSE 0 END").bind(request.id,request.updatedAt);
 const vote=database.prepare('INSERT INTO request_review_votes(request_id,reviewer_key,user_id,approved_at,note,paid) VALUES(?,?,?,CURRENT_TIMESTAMP,?,?)').bind(request.id,key,session.userId,note,payrollPaid?1:0);
 const update=database.prepare(`UPDATE employee_requests SET status=?,leave_paid=?,manual_data=?,reviewer_note=?,reviewed_by_user_id=?,reviewed_at=CASE WHEN ?='pending' THEN '' ELSE CURRENT_TIMESTAMP END,updated_at=?,decision_token=? WHERE id=? AND status='pending'`).bind(final,payrollPaid?1:0,JSON.stringify(overlay),note,session.userId,final,token,token,request.id);
 await database.batch([guard,...(decision==='approved'?[vote]:[]),...(final==='approved'?[exchangeGuard(request.employeeId,overlay,request.id),approvalConflictGuard(request.employeeId,overlay,request.id)]:[]),update,...(final==='approved'?seedRequest(request.employeeId,overlay):[]),database.prepare('DELETE FROM hr_manual_request_guard')]);
 await notifyUsers([request.requesterUserId,...await requestRecipients(request.employeeId,session.userId)],{type:final==='pending'?'employee_request_review_progress':`employee_request_${final}`,title:final==='pending'?'Request approval recorded':`Request ${final}`,message:`${request.employeeName} · ${request.dateFrom} · ${final==='pending'?'Waiting for remaining approvals':final==='approved'?'All required reviewers approved':'Rejected'}${note?' · '+note:''}`,targetView:'requests',entityId:request.id,actorUserId:session.userId});
 return true;
}

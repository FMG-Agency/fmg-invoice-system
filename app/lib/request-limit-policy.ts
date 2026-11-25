import type {EmployeeRequest,EmployeeRequestType,RequestLimitRule} from '../types';
export const requestLimitTypes:{type:EmployeeRequestType;label:string}[]=[
 {type:'early_leave',label:'Early departure · رحيل بدري'},{type:'late_arrival',label:'Late arrival · قدوم متأخر'},
 {type:'leave',label:'Absence permission · غياب'},{type:'overtime',label:'Extra overtime · أوفر تايم إضافي'},
 {type:'early_arrival',label:'Early overtime · أوفر تايم مبكر'},{type:'friday_work',label:'Friday work · شغل الجمعة'},
 {type:'friday_exchange',label:'Friday exchange · تبديل الجمعة'},{type:'mission',label:'Assignment / mission · مأمورية'},
];
export function monthlyRequestUsage(requests:EmployeeRequest[],employeeId:number,type:EmployeeRequestType,month:string,memberIds:number[]=[employeeId]){return requests.filter(r=>memberIds.includes(r.employeeId)&&r.type===type&&r.dateFrom.slice(0,7)===month&&!r.isManual&&['pending','approved'].includes(r.status)).length;}
export function requestAllowance(requests:EmployeeRequest[],rules:RequestLimitRule[],employeeId:number,type:EmployeeRequestType,month:string,sharedUsage?:{type:EmployeeRequestType;month:string;used:number}[]){
 const rule=rules.find(r=>r.employeeId===employeeId&&r.type===type);if(!rule)return null;
 const used=sharedUsage ? (sharedUsage.find(u=>u.type===type&&u.month===month)?.used||0) : monthlyRequestUsage(requests,employeeId,type,month,rule.memberIds);return {...rule,used,exceeded:used>=rule.maxRequests,blocked:rule.overflowMode==='block'&&used>=rule.maxRequests};
}

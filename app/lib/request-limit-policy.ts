import type {EmployeeRequest,EmployeeRequestType,RequestLimitRule} from '../types';
export const requestLimitTypes:{type:EmployeeRequestType;label:string}[]=[
 {type:'early_leave',label:'Early departure · رحيل بدري'},{type:'late_arrival',label:'Late arrival · قدوم متأخر'},
 {type:'leave',label:'Absence permission · غياب'},{type:'overtime',label:'Extra overtime · أوفر تايم إضافي'},
 {type:'early_arrival',label:'Early overtime · أوفر تايم مبكر'},{type:'friday_work',label:'Friday work · شغل الجمعة'},
 {type:'friday_exchange',label:'Friday exchange · تبديل الجمعة'},{type:'mission',label:'Assignment / mission · مأمورية'},
];
export function monthlyRequestUsage(requests:EmployeeRequest[],employeeId:number,type:EmployeeRequestType,month:string){return requests.filter(r=>r.employeeId===employeeId&&r.type===type&&r.dateFrom.slice(0,7)===month&&!r.isManual&&['pending','approved'].includes(r.status)).length;}
export function requestAllowance(requests:EmployeeRequest[],rules:RequestLimitRule[],employeeId:number,type:EmployeeRequestType,month:string){
 const rule=rules.find(r=>r.employeeId===employeeId&&r.type===type);if(!rule)return null;
 const used=monthlyRequestUsage(requests,employeeId,type,month);return {...rule,used,exceeded:used>=rule.maxRequests,blocked:rule.overflowMode==='block'&&used>=rule.maxRequests};
}

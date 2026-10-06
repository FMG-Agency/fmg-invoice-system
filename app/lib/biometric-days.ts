export type BiometricDay = {date:string;rawPunches:string[];punches:string[];firstIn:string;lastOut:string;lastOutNextDay:boolean;status:"present"|"incomplete"|"absent"|"friday"};
export function adjacentDate(date:string,offset:number) { const d=new Date(date+"T12:00:00Z");d.setUTCDate(d.getUTCDate()+offset);return d.toISOString().slice(0,10); }
export function normalizeBiometricDay(date:string,rawPunches:string[],nextDayPunches:string[]):BiometricDay {
  const normal=[...new Set(rawPunches.filter(p=>p>"06:00"))].sort();
  const overnight=[...new Set(nextDayPunches.filter(p=>p<="06:00"))].sort();
  const firstIn=normal.find(p=>p<="14:00") || "";
  const lastOut=overnight.at(-1) || normal.filter(p=>p>"14:00").at(-1) || "";
  const punches=[...normal,...overnight.map(p=>p+" (+1 day)")];
  return {date,rawPunches,punches,firstIn,lastOut,lastOutNextDay:overnight.length>0,status:!punches.length?(new Date(date+"T12:00:00Z").getUTCDay()===5?"friday":"absent"):firstIn&&lastOut?"present":"incomplete"};
}

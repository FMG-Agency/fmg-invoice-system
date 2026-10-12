// Existing production client, verified against the client directory.
export const ELEVE_CLIENT_ID = 1;
export const arrivalStatuses = {new:"New",seen:"Seen by FMG",scheduled:"Shoot scheduled",photographed:"Photographed"} as const;
export type ProductArrival = {id:number;title:string;quantity:number|null;album_url:string;notes:string;status:keyof typeof arrivalStatuses;created_at:string;updated_at:string};

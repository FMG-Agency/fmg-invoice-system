"use client";
import {useEffect,useRef,useState} from 'react';
import {ArrowLeft,Eye,LockKeyhole} from 'lucide-react';
export function AccountViewBanner({name}:{name:string}){
 const ref=useRef<HTMLElement>(null);
 const [error,setError]=useState(''),[busy,setBusy]=useState(false);
 useEffect(()=>{const root=document.documentElement;root.classList.add('account-view-active');const resize=new ResizeObserver(()=>root.style.setProperty('--account-view-height',`${ref.current?.offsetHeight||0}px`));if(ref.current)resize.observe(ref.current);return()=>{resize.disconnect();root.classList.remove('account-view-active');root.style.removeProperty('--account-view-height')}},[]);
 return <aside ref={ref} className="account-view-banner" role="status"><span className="account-view-icon"><Eye size={20}/></span><div className="account-view-copy"><small>ACCOUNT PREVIEW</small><strong>{name}</strong><span>Viewing this user’s workspace in this browser.</span></div><span className="account-view-readonly"><LockKeyhole size={13}/> Read only</span><button disabled={busy} onClick={async()=>{setBusy(true);setError('');try{const r=await fetch('/api/account-view',{method:'DELETE'});if(!r.ok)throw new Error();window.location.assign('/')}catch{setError('Could not exit. Please retry.');setBusy(false)}}}><ArrowLeft size={15}/>{busy?'Returning…':'Return to admin'}</button>{error&&<span className="account-view-error">{error}</span>}</aside>
}

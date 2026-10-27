"use client";
import {useState} from 'react';
export function AccountViewBanner({name}:{name:string}){
 const [error,setError]=useState('');
 return <aside className="account-view-banner" role="status"><strong>Account view · {name} · Read only</strong><span>Applies to this browser. Changes are blocked.</span><button onClick={async()=>{try{const r=await fetch('/api/account-view',{method:'DELETE'});if(!r.ok)throw new Error();window.location.assign('/')}catch{setError('Could not exit. Please retry.')}}}>Return to admin</button>{error&&<span>{error}</span>}</aside>
}

'use client';
import {useEffect} from 'react';
import {extractDocument} from './document-reader';
export default function Workspace(){
 useEffect(()=>{(window as any).studyReadDocument=extractDocument;const script=document.createElement('script');script.src='/app.js';script.defer=true;document.body.appendChild(script);return()=>script.remove();},[]);
 return <><div id="app"><div className="empty">Opening your study workspace…</div></div><dialog id="modal"><div id="modal-content"/></dialog><div id="toast" role="status" aria-live="polite"/></>;
}

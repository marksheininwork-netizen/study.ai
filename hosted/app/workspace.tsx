'use client';
import {useEffect} from 'react';
import {extractDocument} from './document-reader';
export default function Workspace(){
 useEffect(()=>{let disposed=false;const loaded:HTMLScriptElement[]=[];
 (async()=>{(window as any).studyReadDocument=extractDocument;
 for(const src of ['/guest-loader.mjs','/plus.js','/app.js']){if(disposed)return;await new Promise<void>((resolve,reject)=>{const script=document.createElement('script');script.src=src+'?release=guest50';if(src.endsWith('.mjs'))script.type='module';script.onload=()=>resolve();script.onerror=()=>reject(Error('Could not load Study.ai. Reload this page.'));loaded.push(script);document.body.appendChild(script);});}})().catch(e=>{const target=document.getElementById('app');if(target)target.textContent=e.message;});return()=>{disposed=true;loaded.forEach(s=>s.remove());};},[]);
 return <><div id="app"><div className="empty">Opening your study workspace…</div></div><dialog id="modal"><div id="modal-content"/></dialog><div id="toast" role="status" aria-live="polite"/></>;
}

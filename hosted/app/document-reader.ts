import {unzipSync,strFromU8} from 'fflate';
export async function extractDocument(file:File):Promise<string>{
 const bytes=new Uint8Array(await file.arrayBuffer());let content='';
 if(file.name.toLowerCase().endsWith('.docx')){
  const files=unzipSync(bytes,{filter:f=>f.name==='word/document.xml'&&f.originalSize<=2000000});
  if(!files['word/document.xml'])throw Error('This Word document is too large or unreadable.');
  const xml=new DOMParser().parseFromString(strFromU8(files['word/document.xml']),'application/xml');
  if(xml.querySelector('parsererror'))throw Error('Could not read this Word document.');
  content=Array.from(xml.getElementsByTagNameNS('http://schemas.openxmlformats.org/wordprocessingml/2006/main','p')).map(p=>p.textContent||'').join('\n');
 }else{
  const pdfjs=await import('pdfjs-dist/legacy/build/pdf.mjs');
  pdfjs.GlobalWorkerOptions.workerSrc='/pdf.worker.min.mjs';
  const doc=await pdfjs.getDocument({data:bytes,isEvalSupported:false,useSystemFonts:true}).promise;
  try{
   if(doc.numPages>100)throw Error('Use a PDF with at most 100 pages.');
   for(let n=1;n<=doc.numPages;n++){
    const page=await doc.getPage(n),text=await page.getTextContent();
    content+=text.items.map((item:any)=>item.str+(item.hasEOL?'\n':' ')).join('')+'\n';
    if(content.length>200000)throw Error('Extracted text exceeds 200,000 characters.');
   }
  }finally{await doc.destroy();}
 }
 if(!content.trim())throw Error('No readable text found. Scans need OCR first.');
 if(content.length>200000)throw Error('Extracted text exceeds 200,000 characters.');
 return content;
}

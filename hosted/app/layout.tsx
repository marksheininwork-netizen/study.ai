import type {Metadata} from 'next';
import './globals.css';
export const metadata:Metadata={title:'Study.ai — Your personal learning workspace',description:'Bring your coursework together, find learning patterns, and build study guides, flashcards, and quiz games.'};
export default function Layout({children}:{children:React.ReactNode}){return <html lang="en"><head><link rel="stylesheet" href="/style.css?release=guest50"/></head><body>{children}</body></html>;}

import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'森藏小樹苗活動｜活動紀錄',description:'領一株小樹，種下希望。森藏協會活動與樹苗領取紀錄。'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="zh-Hant"><body>{children}</body></html>;}

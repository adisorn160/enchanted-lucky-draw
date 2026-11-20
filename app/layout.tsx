import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Enchanted Kingdom Lucky Draw Live',robots:{index:false,follow:false},description:'เลือกรางวัล หมุนสุ่มชื่อผู้โชคดี และรับชมพร้อมกันทุกหน้าจอ พร้อมบันทึกชื่อ รางวัล และมูลค่าอัตโนมัติ'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="th"><body>{children}</body></html>}

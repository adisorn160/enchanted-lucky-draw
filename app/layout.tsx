import type { Metadata } from 'next';
import './globals.css';
export const metadata:Metadata={title:'Enchanted Kingdom Gift Exchange',robots:{index:false,follow:false},description:'จับฉลากว่าแต่ละคนจะให้ของขวัญกับใคร พร้อมรับชมการจับคู่สด'};
export default function RootLayout({children}:{children:React.ReactNode}){return <html lang="th"><body>{children}</body></html>}

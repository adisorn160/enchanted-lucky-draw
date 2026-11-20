# Enchanted Kingdom Lucky Draw Live

เว็บจับฉลากธีมปราสาทสำหรับผู้ควบคุมและผู้ชม ใช้เว็บแอป Next.js บน Vercel กับ Supabase Postgres และ Realtime โดยดัดแปลงจากชุดซอร์ส Lucky Live ที่ผู้ใช้ให้มา

## ตั้งค่าบริการ

1. สร้างโปรเจกต์ Supabase สำหรับกิจกรรม เปิด Data API และมี publication `supabase_realtime` ตั้งแต่เริ่มต้น
2. รัน `supabase/schema.sql` หนึ่งครั้งใน SQL Editor ของโปรเจกต์นั้น
3. ตั้งค่าตัวแปรด้านล่างบน Vercel สำหรับ Production แล้ว redeploy ตัวแปรที่มี `NEXT_PUBLIC_` ต้องมีตั้งแต่ตอน build

| ตัวแปร | ค่า |
| --- | --- |
| `SUPABASE_URL` | URL ของโปรเจกต์ Supabase |
| `SUPABASE_SECRET_KEY` | Secret key สำหรับเซิร์ฟเวอร์ หรือ legacy service_role key |
| `NEXT_PUBLIC_SUPABASE_URL` | URL ของโปรเจกต์เดียวกัน |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Publishable key สำหรับ Realtime |
| `ADMIN_ACCESS_KEY` | รหัสสุ่มสำหรับผู้ควบคุมอย่างน้อย 24 ตัวอักษร |

เก็บรหัสผู้ควบคุมไว้เป็นส่วนตัว เปิดหน้าหลักเพื่อสร้างห้อง แล้วส่งลิงก์จากปุ่มแชร์ให้ผู้ชม เบราว์เซอร์ที่สร้างห้องมีสิทธิ์ควบคุมเป็นเวลา 24 ชั่วโมง

หน้า Admin รับรายชื่อจาก CSV แบบ UTF-8 ใช้คอลัมน์ `username`, `name`, `participant`, `ชื่อ`, `รายชื่อ` หรือคอลัมน์แรกสำหรับไฟล์ไม่มีหัวตาราง กดบันทึกหลังนำเข้า ระบบเก็บหนึ่งสิทธิ์ต่อชื่อที่ปรับรูปแบบแล้ว และกันผู้ชนะจากการถูกเพิ่มกลับในห้องเดียวกัน ชื่อเต็มอยู่ในหน้า Admin และไฟล์ส่งออก ส่วนหน้าผู้ชมแสดงชื่อแบบปิดบางส่วน

## ทดสอบ

ใช้ Node.js 22 และรัน `npm ci`, `npm test`, `npm run build` ชุดทดสอบใช้ Postgres ในเครื่องและตัวเชื่อมจำลองสำหรับ PostgREST ครอบคลุมคำขอผู้ชมพร้อมกัน 20 รายและการสั่งสุ่มซ้อน ก่อนเริ่ม Live ให้สร้างห้องทดสอบบน Vercel เปิดหน้าผู้ชมแยก แล้วทดสอบการสุ่ม รับทราบผล และดาวน์โหลด CSV กับ Supabase จริง

เครดิตเสียงอยู่ที่ `public/audio/CREDITS.txt`

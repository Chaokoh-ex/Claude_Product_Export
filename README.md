# เทรนด์สินค้าน่าจับตา

เว็บแคตตาล็อกสินค้าเทรนด์จากทั่วโลก มีหน้าเข้าสู่ระบบ ฟอร์มเพิ่มสินค้า (รูปได้สูงสุด 5 รูป) สถานะของแต่ละไอเดีย โหวตและความเห็นจากทีม แผนที่ประเทศต้นทาง โหมดนำเสนอ (มีสไลด์เปิดและสรุป) และพิมพ์เป็น PDF

- **หน้าเว็บ** (`index.html`) เปิดด้วย GitHub Pages
- **ข้อมูล** เก็บใน Google Sheet และ**รูป**เก็บใน Google Drive ผ่าน Google Apps Script (`apps-script/Code.gs`)
- **รหัสผ่าน** มี 2 ตัว ผู้ดูแล (เพิ่ม แก้ ลบได้) และผู้ชม (ดูอย่างเดียว) เก็บไว้ฝั่ง Google ไม่อยู่ในโค้ดนี้

ถ้ายังไม่ได้ใส่ `API_URL` ใน `index.html` เว็บจะเปิดเป็นโหมดตัวอย่าง (รหัส `admin` / `view`)

## ติดตั้งฝั่ง Google (ทำครั้งเดียว)

1. สร้าง Google Sheet ใหม่ แล้วไปที่ **ส่วนขยาย → Apps Script**
2. ลบโค้ดเดิมในไฟล์ `Code.gs` แล้ววางเนื้อหาจาก `apps-script/Code.gs` จากนั้นกด Ctrl+S
3. ไปที่ **Project Settings (รูปเฟือง) → Script properties** เพิ่ม 2 ค่า
   - `ADMIN_PASSWORD` = รหัสผู้ดูแล
   - `VIEWER_PASSWORD` = รหัสผู้ชม
4. กลับไปที่หน้าโค้ด เลือกฟังก์ชัน `setup` แล้วกด **Run** และอนุญาตสิทธิ์ (ถ้าขึ้น "Google hasn't verified this app" ให้กด Advanced → Go to …)
5. กด **Deploy → New deployment → Web app** ตั้งค่า **Execute as: Me** และ **Who has access: Anyone** แล้วกด Deploy
6. คัดลอก **Web app URL** (ลงท้ายด้วย `/exec`)

## เชื่อมหน้าเว็บกับ Google

1. เปิดไฟล์ `index.html` ใน GitHub แล้วกดรูปดินสอ (Edit)
2. หาบรรทัด `const API_URL='';` แล้ววาง URL ระหว่างเครื่องหมายคำพูด เช่น `const API_URL='https://script.google.com/macros/s/xxxx/exec';`
3. กด **Commit changes** รอประมาณ 1 นาทีให้ GitHub Pages อัปเดต

## อัปเดตโค้ดฝั่ง Google

เมื่อ `apps-script/Code.gs` ใน repo นี้เปลี่ยน ให้คัดลอกไปวางทับใน Apps Script แล้ว
1. รันฟังก์ชัน `setup` อีกครั้ง (เพิ่มคอลัมน์ใหม่และชีต "ความเห็น" ให้อัตโนมัติ ข้อมูลเดิมไม่หาย)
2. **Deploy → Manage deployments → กดดินสอ → Version: New version → Deploy** (URL เดิม)

## หมายเหตุ

- repo นี้เป็นสาธารณะ (GitHub Pages แบบฟรีต้องเป็นสาธารณะ) ใครก็เห็นโค้ดและ URL ของ API ได้ แต่ดูข้อมูลไม่ได้ถ้าไม่มีรหัสผ่าน
- ห้ามใส่รหัสผ่านไว้ในไฟล์ใดๆ ใน repo นี้
- แก้ `Code.gs` แล้ว ต้องไปที่ **Deploy → Manage deployments → แก้ไข → Version: New version** ทุกครั้ง URL จะยังเป็นอันเดิม
- ใส่รหัสผิดเกิน 10 ครั้ง ระบบจะล็อก 10 นาที

# MIWVIE SHOP — Setup Guide

## 1. Google Apps Script (ทำครั้งเดียว ~5 นาที)

1. เปิด [script.google.com](https://script.google.com) → **New Project**
2. ลบโค้ดเดิมทั้งหมด → วางโค้ดจาก `apps-script/Code.gs`
3. **Deploy** → New deployment → Web App
   - Execute as: **Me**
   - Who has access: **Anyone**
   - คัดลอก URL ที่ได้
4. เปิด URL นั้น + `?action=setup` ในเบราว์เซอร์ ควรเห็น `{"success":true}`
5. ตั้ง Admin PIN: **Project Settings** → Script Properties
   - Key: `ADMIN_PIN` | Value: ใส่ PIN ที่ต้องการ

---

## 2. ติดตั้งและรันโปรเจกต์

```bash
cd miwvie-shop
npm install
cp .env.example .env.local
# แก้ไข .env.local → ใส่ URL จากขั้นตอนที่ 1
npm run dev
```

---

## 3. Deploy บน Vercel (ฟรี)

```bash
npx vercel --prod
# เพิ่ม Environment Variable:
# SCRIPT_URL = URL จาก Apps Script
```

---

## 4. ใส่รูปกล้อง

วางรูปกล้องใน `public/cameras/` และรูป mood ใน `public/mood/`

ชื่อไฟล์ตาม `src/lib/cameras.ts`:
- `ixy10s.jpg`, `ixy30s.jpg`, `ixy930is.jpg`, `ixy910is.jpg`, `ixy200.jpg`
- mood: `ixy10s-1.jpg`, `ixy10s-2.jpg`, ...

---

## หน้าต่างๆ

| URL | คำอธิบาย |
|-----|---------|
| `/` | หน้าหลัก |
| `/book` | จองกล้อง |
| `/booking/[id]` | เช็คสถานะการจอง |
| `/admin` | Admin dashboard |

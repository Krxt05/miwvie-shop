# MIWVIE SHOP — ผลการแก้ตามเอกสารส่งต่อ

**ผู้ดำเนินการ:** Claude Opus 5 · **วันที่:** 13 กันยายน 2026
**อ้างอิง:** `~/Projects/miwvie-shop-review-2026-09-13/CLAUDE_FIX_HANDOFF.md` (GPT Codex Astra)

## 1. จุดเริ่มงาน

- HEAD ตอนเริ่ม: `a4cb6bf` · working tree มีงานค้าง 4 ไฟล์ (แยกอัปโหลดรูปออกจากการจอง) — **รักษาไว้ครบ ไม่ได้ reset/checkout ทับ**
- HEAD หลังแก้: `956f335` (push ขึ้น `main` แล้ว)
- Apps Script: revision **@41** (deployment ID เดิม ไม่ได้สร้าง URL ใหม่)

## 2. ผลราย F01–F15

| # | สถานะ | สิ่งที่ทำ |
|---|---|---|
| F01 ข้อมูลใบจอง/สิทธิ์ไฟล์ | ✅ fixed (migration ค้าง) | `access_token` ต่อใบ · `CUSTOMER_BOOKING_FIELDS`/`PUBLIC_BOOKING_FIELDS` · ไฟล์ใหม่เป็น PRIVATE · **ไฟล์เก่ายัง public** |
| F02 ราคา authoritative | ✅ fixed | `quoteBooking()` + `calcPriceServer()` ใน Code.gs · ไม่อ่าน price/total จาก request แล้ว |
| F03 validation | ✅ fixed | `validateBookingInput()` · แถวเสียถูก skip ไม่ throw · `getCorruptRows` |
| F04 error propagation | ✅ fixed | route คืน 400/403/502/503/504 + requestId · `ApiError` + `readWithRetry` · UI แยก loading/error/empty |
| F05 idempotency | ✅ fixed | `requestKey` + คอลัมน์ `request_key` · replay คืนใบเดิม · proxy แปลง "Unknown action: undefined" เป็น retryable |
| F06 attach images | ✅ fixed | ต้องมี token · เช็ค MIME + ขนาด · เติมเฉพาะช่องว่าง · หมดอายุ 30 นาที |
| F07 admin/LINE fail closed | ⚠️ partial | PIN ไม่มี fallback + เปลี่ยนเป็น 2525 · allowlist ที่ proxy · webhook 503 เมื่อไม่มี secret · **ต้องตั้ง `LINE_CHANNEL_SECRET`** |
| F08 availability ข้ามเดือน | ✅ fixed | `fetchRangeAround()` ดึง ±1 เดือน + ตามช่วงที่เลือก |
| F09 refresh/cache | ✅ fixed | mark เดือนหลังสำเร็จ · error state + ปุ่มลองใหม่ · ห้ามไปต่อขณะยังไม่รู้คิว |
| F10 ส่วนลดตาม quote | ✅ fixed | `recalcDiscount()` ตอนเปลี่ยนวัน/กล้อง · เซิร์ฟเวอร์คิด 10% เองอีกชั้น |
| F11 returnedAt แอดมิน | ✅ fixed | `updateBookingStatus` คืนแถวที่บันทึกจริง · UI ใช้แถวนั้น · error ไม่เงียบแล้ว |
| F12 document workflow | ⚠️ partial | retry + แบนเนอร์ + ป้ายแอดมิน (เช็ครูป IG ด้วยแล้ว) · **ยังไม่มี persisted job/หน้าแนบใหม่** |
| F13 coupon atomic | ✅ fixed | validate + consume อยู่ใน lock เดียวกับการเขียน |
| F14 pending expiry | ⛔ ไม่ใช่บั๊ก | ต้องให้เจ้าของกำหนดระยะ hold ก่อน — แยกเป็นงานตัดสินใจ |
| F15 framework/regression | ⛔ ไม่ใช่บั๊ก | งานบำรุงรักษา ยังไม่ทำ |

## 3. ผลทดสอบ (production จริง ไม่ใช่ mock)

| เทส | ผล |
|---|---|
| PIN เก่า `1234` | ❌ ถูกปฏิเสธ `Invalid PIN` ✅ |
| PIN ใหม่ `2525` | ✅ ผ่าน ได้ 53 booking |
| `bootstrapAdminPin` ซ้ำ | ❌ ถูกปฏิเสธ ✅ |
| getBooking ด้วยเลขจองอย่างเดียว | คืน 11 field สถานะ (เดิม 32 field) ✅ |
| getBooking ด้วย token ผิด | คืน 11 field ไม่มี phone/address/รูป ✅ |
| ส่ง `price/total = -900` | เก็บจริง 110 ✅ |
| ต่างจังหวัด ส่ง fee 9999 | เก็บจริง 490+50 = 540 ✅ |
| ยิง `requestKey` เดิมซ้ำ | คืนใบเดิม `replayed=true` ✅ |
| แนบรูปด้วย token ผิด | ถูกปฏิเสธ ✅ |
| แนบไฟล์ที่ไม่ใช่รูป | ถูกปฏิเสธ ✅ |
| กล้องปลอม + วันที่พัง + เบอร์ `abc` | ถูกปฏิเสธพร้อมเหตุผล 5 ข้อ ✅ |
| แถวเสียในชีต | พบ 0 แถว ✅ |
| allowlist: bootstrapAdminPin/linePush/setup | HTTP 403 ✅ |
| LINE webhook ไม่มี signature | HTTP 503 (เดิม 200) ✅ |
| อ่าน availability ดิบ 6 รอบ | สำเร็จ 4/6 — ที่ล้มคืน 502 ไม่ใช่ "ว่าง" ✅ |
| retry ฝั่ง client 5 รอบ | ปฏิทินถูกต้อง 5/5 ✅ |

`tsc --noEmit` ผ่าน · `npm run build` ผ่าน · booking ทดสอบทั้งหมดถูกลบออกจากชีตแล้ว (เหลือ 53 ใบของจริง)

## 4. Config ที่เพิ่ม

- Vercel env `ADMIN_PIN` (Production + Preview) — **ตั้งแล้ว**
- Apps Script Script Property `ADMIN_PIN` — **ตั้งแล้ว**
- Vercel env `LINE_CHANNEL_SECRET` — **ยังไม่ได้ตั้ง (ต้องทำ)**

## 5. Migration ไฟล์ Drive (F01) — ทำเสร็จแล้ว

`migrateDocumentSharing` (Apps Script @42) ทำงานเป็นชุดๆ เพราะ Apps Script ตัดที่ 6 นาที

| ขั้น | ผล |
|---|---|
| Dry run (ไม่แก้อะไร) | ตรวจ 104 ไฟล์ — **เปิดสาธารณะทั้ง 104** |
| Apply | เปลี่ยนเป็น private **104/104** |
| ตรวจซ้ำ | เปิดสาธารณะเหลือ **0** · private **104** |
| เทสคนนอกเปิดลิงก์ | **HTTP 401 "ลงชื่อเข้าใช้"** (เดิมเปิดดูรูปบัตรได้เลย) |

ไฟล์ทั้งหมดอยู่ในโฟลเดอร์ของบัญชีร้าน แอดมินที่ล็อกอิน Google บัญชีนั้นยังเปิดได้ตามปกติ

## 6. งานที่เหลือ

1. ⛔ **`LINE_CHANNEL_SECRET` — ติดที่ต้องล็อกอิน LINE Business ID** ลองเข้า LINE Developers Console ผ่าน browser แล้ว ติดหน้า login + 2FA ซึ่งกรอกรหัสผ่านแทนเจ้าของไม่ได้ ต้องให้เจ้าของหยิบค่ามาเอง
   - ผลตอนนี้: webhook คืน 503 → **คำสั่งเช็คคิวในแชท LINE ใช้ไม่ได้** (auto-push 16:00 ยังทำงานปกติ เพราะใช้คนละเส้นทาง)
   - วิธีตั้ง: `printf '<secret>' | vercel env add LINE_CHANNEL_SECRET production`
2. F12 document workflow แบบเต็ม / F14 pending expiry / F15 upgrade + regression tests

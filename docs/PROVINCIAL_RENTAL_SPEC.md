# สเปกงาน: เปิดใช้ระบบเช่าต่างจังหวัด (MIWVIE SHOP)

> เอกสารนี้เขียนให้ AI/dev คนถัดไป implement ได้โดยไม่ต้องไล่โค้ดเองใหม่
> เขียนเมื่อ 2026-09-09 · repo `Krxt05/miwvie-shop` · HEAD ตอนเขียน = `3bf1b98`

---

## ✅ สถานะ: implement แล้ว 2026-09-09 (ยังไม่ deploy / ยังไม่ push · flag = true · เทสใน local)

- `git stash pop` + resolve conflict ครบทั้ง 5 ไฟล์แล้ว (stash ยังเก็บไว้เป็น backup)
- งาน A–E ทำครบ — โค้ดผ่าน `npm run build`, `tsc --noEmit`, `node --check`
- **ต่างจาก spec 1 จุด:** งาน A4 การปลดคิวเมื่อกด "รับคืนแล้ว" scope เฉพาะ `rental_area === 'provincial'` เท่านั้น — การเช่าในพื้นที่ยังใช้สูตรเดิม (tail = return_datetime + 1 ชม.)
- `PROVINCIAL_ENABLED = true` แล้ว (รันเทสใน local `npm run dev`) — production ยังไม่เห็นเพราะยังไม่ deploy Vercel

### รอบแก้เพิ่ม 2026-09-09 (round 2 — feedback เจ้าของ)
1. **หน้าเลือกวัน** สรุปวันของ provincial โชว์ 3 บรรทัด: ร้านส่งพัสดุ (= พัสดุถึงมือ − 3 วัน) / พัสดุถึงมือ / ส่งคืน (ทางไปรษณีย์) + "ก่อน 12:00 น." — เหมือนกันทั้งหน้ายืนยัน, ReceiptCard, หน้า `/booking/[id]`, หน้าแอดมิน, LINE notify
2. **รวม step** — provincial ไม่มี step "ที่อยู่จัดส่ง" แยกแล้ว ย้ายฟิลด์ที่อยู่ไปไว้หัว step "ข้อมูลผู้เช่า" (STEP_INFO) → provincial เหลือ 5 step, local ยัง 6 step
   - step index ย้ายจาก module-level const มาเป็น `stepMap` ใน component (คิดตาม `isProvincial`)

### รอบแก้เพิ่ม 2026-09-09 (round 3 — code review + ปรับคำ)
- **แก้บั๊ก deep link** — เดิม `/book?camera=X` (ปุ่มจากหน้าแรก) จะ set `rentalArea='local'` แล้วกระโดดข้าม step "พื้นที่เช่า" ไปหน้าปฏิทินเลย ⇒ **ลูกค้าที่กดจากการ์ดกล้องหน้าแรกจะไม่มีทางเห็นตัวเลือกต่างจังหวัดเลย** แก้เป็น: `rentalArea` เริ่มที่ `null` เสมอ + ไม่กระโดดข้าม step แล้ว (กระโดดเฉพาะตอน `PROVINCIAL_ENABLED = false`) — ลูกค้า deep link จะเสียเพิ่ม 2 แตะ แต่เห็นตัวเลือกครบ
- **ปรับคำที่ใช้ผิดความหมาย**
  | เดิม | ใหม่ | เหตุผล |
  |---|---|---|
  | ร้านส่งออก | ร้านส่งพัสดุ | "ส่งออก" = export ทางการค้า ไม่ใช่ส่งพัสดุ |
  | ข้อมูล + ที่อยู่ | ข้อมูลผู้เช่า | เครื่องหมาย + ไม่เหมาะกับ label ภาษาไทย |
  | กดเช่าเป็นวัน | คิดค่าเช่าเป็นรายวัน | ประโยคเดิมอ่านไม่รู้เรื่อง |
  | เริ่มเช่าวันนี้ได้ | เลือกเป็นวันเริ่มเช่าได้ | "วันนี้" ในคำอธิบายสัญลักษณ์ทำให้เข้าใจผิดว่าเป็น today |
  | ส่งคืน (ไปรษณีย์) | ส่งคืน (ทางไปรษณีย์) | ไวยากรณ์ |
  | แจ้งเลขพัสดุคืนก่อน | แจ้งเลขพัสดุภายใน | กระชับและตรงความหมายกว่า |
  | (ออกค่าส่งเอง) | โดยรับผิดชอบค่าส่งขากลับเอง | ระบุให้ชัดว่าเป็นขากลับ |
- **เลิก hardcode เลข 3 / 72 ในข้อความ** — ใช้ `MIN_PROVINCIAL_DURATION_HOURS / 24` และ `PROVINCIAL_SHIP_LEAD_DAYS` แทน ถ้าเปลี่ยนกติกาข้อความจะตามเอง

---

## ✅ รอบแก้เพิ่ม 2026-09-09 (round 4 — code review เสร็จหมด + deploy + เทสจริง)

ทำครบทั้ง R1–R4 แล้ว · Apps Script deploy ถึง **revision @37** · เทสด้วย test booking บน sheet จริง (สร้าง+ลบ 4 ครั้ง สะอาดแล้ว)

### R1 ✅ LINE bot รู้จักการเช่าต่างจังหวัดแล้ว
- **`Code.gs`** เพิ่ม helper `buildQueueItem(row, col)` ใช้ร่วมกันทั้ง `getDayQueue`/`getUpcomingQueue`
  - provincial: `pickupDate` = **วันส่งพัสดุ** (`pickup − PROVINCIAL_SHIP_BUFFER_MS`) ไม่ใช่วันพัสดุถึงมือ → บอทเตือนถูกวันที่ร้านต้องลงมือ
  - `pickupTime`/`returnTime` = `''` สำหรับ provincial (ไม่โชว์ `00:00`)
  - เพิ่ม field: `rentalArea`, `deliveredDate` (วันพัสดุถึงมือ), `shippingAddress` (รวมเป็นสตริงเดียว)
- **`route.ts`** เพิ่ม `rentalArea`/`deliveredDate`/`shippingAddress` ใน `QueueItem` + helper `isProvincial(it)`
  - `pickupBlock`: provincial → `🚚 ส่งพัสดุ` + ที่อยู่จัดส่ง + "ให้ถึงมือลูกค้า <วัน>"
  - `returnBlock`: provincial → `📦 ... | ลูกค้าส่งพัสดุคืน (ก่อน 12:00 น.)`
  - `formatUpcoming` + section "กำลังเช่าอยู่" แยก provincial ออก
  - **เทสแล้ว**: `13/9/2026` โชว์ 🚚 ส่งพัสดุ, `19/9/2026` โชว์ 📦 พัสดุคืน, `16/9` (วันถึงมือ) ไม่โชว่าเป็น pickup

### R2 + R3 ✅ heatmap แอดมิน (`src/app/admin/page.tsx` `occupancyRows` + `BookingHeatmap.tsx`)
- provincial: ขยายช่วง `±PROVINCIAL_SHIP_LEAD_DAYS` (9 วันจริง ไม่ใช่ 3) · returned + `returnedAt` → tail = `returnedAt + 1ชม.`
- **block `'ALL'`**: ไม่ตัดทิ้งแล้ว — กระจายเป็นแถวของทุกกล้อง
- **block `quantity`**: กระจาย N แถว (`Math.min(block.quantity, camera.quantity)`) → 930 IS บล็อกเต็มโชว์เต็มทั้ง 2 unit
- `OccupancyRow.kind` (`local`/`provincial`/`block`) → tooltip โชว์ "เริ่มกันคิว (ส่งพัสดุ)" / "บล็อกคิว" แทน `00:00`

### R3 ✅ บั๊กเดิม (`Code.gs`)
- **`generateBookingId()`** — เลิกใช้ `getLastRow()` เปลี่ยนเป็น counter ถาวรใน Script Properties (`seq_YYYYMMDD`) ครั้งแรกของวัน seed จาก max seq ที่มีบน sheet → **ID ไม่ซ้ำแม้ลบแถว**
- **`LockService`** — `createBooking` + `blockDates` ห่อ `LockService.getScriptLock().waitLock(20000)` รอบส่วน capacity-check→appendRow + `SpreadsheetApp.flush()` → กัน double-booking ตอน 2 คนจองพร้อมกัน
- **appendRow เขียนตามชื่อ header** ไม่ใช่ตามตำแหน่ง — sheet จริงมีคอลัมน์ว่างไม่มีชื่อแทรกอยู่ (ระหว่าง `admin_notes` กับ `discount_code`) การเขียนตามตำแหน่งทำให้ข้อมูลเลื่อนช่องทั้งแถว (**เจอตอนเทส booking แรก** — rental_area ไปลงช่อง discount_code)

### รอบแก้เพิ่ม 2026-09-09 (round 5)
- **บล็อกคิวหายจากปฏิทินลูกค้า** (บั๊กเก่า พบตอน review) — `readBlockedSlotsAll()` ให้ทุกบล็อก `bookingId: 'blocked'` เหมือนกัน แต่ frontend โหลดปฏิทินทีละเดือนแล้ว dedupe by id ⇒ บล็อกเดือนหลังๆ (เช่น 16-30 พ.ย. ของ IXY30s) โดนกรองทิ้ง ไม่เคยขึ้นเป็นสีแดง แก้: ใช้ `BLK-...` id จริง + suffix `@cameraId` สำหรับบล็อก ALL (deploy @38) — **แค่ refresh หน้า ก็เห็น**
- **lock กว้างเกิน** — ย้าย `uploadImage` (Drive 2 รอบ) ออกมาก่อน `LockService` เหลือแต่ capacity-check→write ในล็อก
- **heatmap returned ไม่ตรง backend** — sync ตรรกะ + clamp กันช่วงกลับหัว
- **step 4 (STEP_INFO) เรียงใหม่** — provincial: ชื่อ/เบอร์/IG ขึ้นก่อน → ที่อยู่จัดส่ง → หลักฐาน
- **เพิ่มช่อง `shipping_subdistrict`** (ตำบล/แขวง) + เปลี่ยน label อำเภอ → "อำเภอ/เขต" — คอลัมน์ใหม่ใน sheet, deploy @39, address string ทุกที่เป็น `<addr> ต.X อ./เขต Y จ.Z <zip>`

### R4 ✅ deploy แล้ว — Apps Script revision @39 (ล่าสุด)
เทสจริงผ่านหมด: createBooking provincial (คอลัมน์ตรง), returned → คิวว่างทันที, walk-back เคลียร์ `returned_at`, capacity check กัน 2 provincial ทับกัน (เว้น 6 วันจริง), LINE bot ทุกคำสั่ง

### ⚠️ ค้างไว้ (ไม่ได้แก้ — ไม่ควรแตะ production data โดยไม่ถาม)
- **คอลัมน์ว่างไม่มีชื่อใน sheet `bookings`** (ระหว่าง `admin_notes` กับ `discount_code`) — ตอนนี้ทุกฟังก์ชันอ่าน/เขียนตามชื่อ header แล้วเลยไม่กระทบ แต่ยังรกอยู่ ถ้าจะลบต้องเช็คว่า booking เก่าที่ใช้โค้ดส่วนลดไม่ได้เก็บข้อมูลไว้ในนั้น

---

## 🚦 เหลือขั้นตอนเดียว: deploy frontend ขึ้น production

โค้ด frontend ทั้งหมด commit ไว้ใน working tree แล้ว (ยังไม่ push ตามกฎ) · `PROVINCIAL_ENABLED = true`
- production Vercel ยังเสิร์ฟ build เก่า (ลูกค้ายังไม่เห็นตัวเลือกต่างจังหวัด)
- Apps Script backend @37 พร้อมแล้ว (backward-compatible — ไม่กระทบ booking ในพื้นที่)
- **ต้องการ**: `git push` (Vercel auto-deploy) หรือ `vercel --prod` — รอเจ้าของสั่ง

---

## 0. บริบทสำคัญ — อ่านก่อนแตะโค้ด

### 0.1 โค้ดฟีเจอร์นี้อยู่ที่ไหน

**ไม่ได้อยู่ใน `main`** — `main` สะอาด ไม่มีคำว่า `provincial` เลยสักบรรทัด
โค้ดทั้งหมดอยู่ใน **`git stash@{0}`** สร้างไว้เมื่อ 2026-08-11 จาก commit `945496b`

```
stash@{0}: On main: provincial rental feature + perf fixes + camera-switch fix (session 2026-08-10/11, paused for later)
```

ดูก่อนแตะ:
```bash
git stash show --stat stash@{0}                       # 12 ไฟล์ที่ถูกแก้
git show stash@{0}^3 --stat                           # ไฟล์ใหม่ (DayRangePicker.tsx)
git diff stash@{0}^1 stash@{0} -- apps-script/Code.gs # ดู diff ทีละไฟล์
```

> ⚠️ `DayRangePicker.tsx` เป็นไฟล์ **untracked** ตอน stash → อยู่ใน `stash@{0}^3` ไม่ใช่ `stash@{0}` เอง
> `git stash show --stat stash@{0}` จะ**ไม่แสดง**ไฟล์นี้ อย่าคิดว่าหาย

### 0.2 กฎเหล็กของโปรเจกต์นี้

| กฎ | รายละเอียด |
|---|---|
| **ห้าม `git push` เอง** | เจ้าของคุมการ push เอง รอคำสั่งชัดเจนว่า "gitpush"/"push github" เท่านั้น เคย push เองแล้วโดนสั่งให้ revert ทั้ง 2 commit |
| **Apps Script deploy ได้เลย** | คนละระบบกับ git ไม่ต้องขออนุญาต |
| **Deploy ต้องระบุ `-i`** | `clasp deploy -i AKfycbwEr6iVMUWtyQsv6JKSA_dgDpneTKY8lq8DYKXxvySatzuTujSoopXyLIn9Ff_2DZAx -d "..."` — ห้าม deploy แบบไม่ระบุ `-i` เพราะจะได้ URL ใหม่ที่เว็บไม่รู้จัก |
| **curl ทดสอบ ห้ามใส่ `-X POST`** | ใช้ `curl -sL <SCRIPT_URL> --data '...'` เพราะ `-X` จะพัง redirect dance ของ Apps Script |
| **ห้ามเอา `CacheService` กลับมา** | stash มี cache 30 วิ ติดมาด้วย แต่เจ้าของสั่ง revert ไปแล้ว (commit `69f814b`) ดูข้อ 6.1 |

### 0.3 กติกาธุรกิจ (ยืนยันจากเจ้าของร้านแล้ว 2026-09-09)

| หัวข้อ | ค่าที่ถูกต้อง |
|---|---|
| ขั้นต่ำ | 3 วัน (72 ชม.) |
| ค่าส่ง | **50฿ = ขาไปอย่างเดียว** ขากลับลูกค้าออกเอง |
| กันคิวหน้า-หลัง | 3 วัน/ขา |
| จองล่วงหน้า | 3 วัน |
| "วันเริ่มเช่า" ที่ลูกค้ากดในปฏิทิน | **= วันที่พัสดุถึงมือลูกค้า** (ร้านส่งออกก่อนหน้า 3 วัน) |
| ราคาเช่า | **เท่าเดิม** ใช้ตารางเดียวกับเช่าในพื้นที่ |
| มัดจำ | **ไม่มี** เหมือนเช่าในพื้นที่ |
| ปลดคิว | **กด "รับคืนแล้ว" ในแอดมิน → คิวว่างทันที ไม่ต้องรอ buffer 3 วันจนครบ** ← งานหลักของรอบนี้ |

---

## 1. ขั้นตอนที่ 0 — กู้โค้ดจาก stash

```bash
cd /Users/kati_tu/Projects/miwvie-shop
git status                  # ต้องสะอาดก่อน
git stash pop stash@{0}
```

### Conflict ที่จะเจอแน่ๆ และวิธีตัดสิน

`main` เดินไป 9 commits หลังจาก stash ถูกสร้าง ไฟล์ที่ทับกัน:

| ไฟล์ | สาเหตุ conflict | ตัดสินยังไง |
|---|---|---|
| `apps-script/Code.gs` | main เพิ่ม LINE bot + ที่อยู่ "ให้ร้านรับ" + perf refactor | **ใช้โครงของ `main` เป็นฐาน** แล้วหยิบเฉพาะส่วน provincial จาก stash มาใส่ (ดูข้อ 6.1) |
| `src/app/book/page.tsx` | main แก้ที่อยู่ "ให้ร้านรับ" | เก็บทั้งสองฝั่ง — ของ main คือ local flow, ของ stash คือ provincial flow |
| `src/app/booking/[id]/page.tsx`, `src/app/admin/page.tsx`, `src/components/ReceiptCard.tsx` | เหมือนกัน | เก็บทั้งสองฝั่ง |
| `public/mood/ixy510is-{1,2,3}.jpg` | main เปลี่ยนรูปใหม่ (`7178b26`) | **เอาของ `main` เสมอ** → `git checkout --ours public/mood/ixy510is-*.jpg` |

**ข่าวดี:** `main` มี `readBookingSlotsAll` / `readBlockedSlotsAll` / `slotsForCamera` และ `BLOCKED_HEADERS` ที่มี `quantity` อยู่แล้ว (จาก `aa4cd55` + `49db737`) → โครงสร้างตรงกับ stash แล้ว conflict ใน Code.gs จะน้อยกว่าที่กลัว

หลัง resolve เสร็จ ตรวจว่า build ผ่าน:
```bash
npm run build
```

---

## 2. 🔴 งาน A — กดรับคืนแล้วคิวว่างทันที (งานหลัก)

### ปัญหา
`readBookingSlotsAll()` (`apps-script/Code.gs:176`) pad ทุก booking ที่ไม่ใช่ `cancelled` ด้วย buffer เต็มเสมอ ไม่สนสถานะ
⇒ แอดมินกด "รับคืนแล้ว" ตั้งแต่วันที่ 13 แต่ระบบยังกันคิวถึงวันที่ 16

### หลักการที่ต้องการ
> buffer 3 วันท้าย = **เวลาที่พัสดุอยู่บนรถขนส่งขากลับ**
> พอกล้องถึงมือร้านจริงแล้ว transit จบ → ปลดคิวได้เลย เหลือแค่ 1 ชม. ไว้ชาร์จแบต

### A1 — เพิ่มคอลัมน์ `returned_at`

`apps-script/Code.gs:6` เพิ่มท้าย `BOOKING_HEADERS` (ต่อจาก 5 คอลัมน์ provincial ที่ stash เพิ่มไว้):

```js
const BOOKING_HEADERS = [
  'booking_id', 'created_at', 'camera_id', 'camera_name',
  'pickup_datetime', 'return_datetime', 'duration_hours',
  'price', 'delivery_fee', 'total_amount',
  'pickup_type', 'pickup_address', 'return_type', 'return_address',
  'customer_name', 'customer_phone', 'customer_ig',
  'id_card_url', 'ig_profile_url',
  'payment_status', 'booking_status', 'admin_notes',
  'discount_code', 'discount_amount',
  // ↓ จาก stash
  'rental_area', 'shipping_address', 'shipping_district', 'shipping_province', 'shipping_postal_code',
  // ↓ ใหม่รอบนี้
  'returned_at',
]
```

> **สำคัญ:** `createBooking()` ใช้ `sheet.appendRow([...])` เขียนค่าตามลำดับตำแหน่ง ไม่ได้ map ตามชื่อคอลัมน์
> `ensureColumns()` เติมคอลัมน์ที่ขาด **ต่อท้าย ตามลำดับใน `BOOKING_HEADERS`**
> ⇒ ตราบใดที่คอลัมน์ใหม่ถูกเพิ่ม**ท้ายอาร์เรย์เสมอ** ลำดับในชีทจริงจะตรงกับ `BOOKING_HEADERS` เอง
> ⇒ **ห้ามแทรกคอลัมน์ใหม่ตรงกลาง `BOOKING_HEADERS` เด็ดขาด** ไม่งั้นข้อมูลจะเขียนผิดช่องทั้งแถว
>
> `appendRow` จะส่ง 29 ค่า (ไม่รวม `returned_at`) → คอลัมน์ที่ 30 เว้นว่าง ถูกต้องแล้ว

### A2 — เอา `ensureColumns()` จาก stash มาใช้

`main` มีแค่ `ensureBlockedQuantityColumn()` (`Code.gs:654`) ที่ hardcode ไว้เฉพาะ `blocked_slots`
stash มีเวอร์ชัน generic แล้ว — เอามาใช้แล้วลบตัวเก่าทิ้ง:

```js
// เติมคอลัมน์ที่ header แถวแรกยังไม่มี ต่อท้ายให้อัตโนมัติ
// ปลอดภัยกับชีทที่สร้างไว้ก่อนคอลัมน์นั้นจะมีตัวตน
function ensureColumns(sheet, headers) {
  const lastCol = sheet.getLastColumn()
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
  const missing = headers.filter(function (h) { return existing.indexOf(h) === -1 })
  if (missing.length === 0) return
  sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing])
}
```

เรียกที่ต้นของ **`createBooking()`** และ **`updateBookingStatus()`**:
```js
ensureColumns(sheet, BOOKING_HEADERS)
```
และแทนที่ `ensureBlockedQuantityColumn(sheet)` ใน `blockDates()` ด้วย `ensureColumns(sheet, BLOCKED_HEADERS)`

### A3 — `updateBookingStatus()` บันทึกเวลารับคืน

`apps-script/Code.gs:586` แก้เป็น:

```js
function updateBookingStatus(bookingId, status, pin) {
  if (pin !== getAdminPin()) return { error: 'Invalid PIN' }

  const sheet = getSpreadsheet().getSheetByName('bookings')
  if (!sheet) return { error: 'Sheet not found' }

  ensureColumns(sheet, BOOKING_HEADERS)          // ← ใหม่: การันตีว่ามีคอลัมน์ returned_at

  const data = sheet.getDataRange().getValues()
  const h = data[0]
  const iId = h.indexOf('booking_id')
  const iStatus = h.indexOf('booking_status')
  const iPayment = h.indexOf('payment_status')
  const iReturnedAt = h.indexOf('returned_at')   // ← ใหม่

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][iId]) !== String(bookingId)) continue
    sheet.getRange(i + 1, iStatus + 1).setValue(status)

    if (status === 'confirmed') {
      sheet.getRange(i + 1, iPayment + 1).setValue('confirmed').setBackground('#d1fae5')
    }
    if (status === 'cancelled') {
      sheet.getRange(i + 1, iStatus + 1).setBackground('#fee2e2')
    }
    if (status === 'returned') {
      sheet.getRange(i + 1, iStatus + 1).setBackground('#ede9fe')
      // เวลาที่กล้องกลับถึงร้านจริง — ใช้ปลดคิวทันทีใน readBookingSlotsAll()
      if (iReturnedAt >= 0) {
        sheet.getRange(i + 1, iReturnedAt + 1).setValue(new Date().toISOString())
      }
    } else if (iReturnedAt >= 0 && data[i][iReturnedAt]) {
      // แอดมินถอยสถานะกลับ (เช่นกดผิด returned → active) ต้องล้างเวลาทิ้ง
      // ไม่งั้นคิวจะค้างว่างทั้งที่กล้องยังไม่กลับ
      sheet.getRange(i + 1, iReturnedAt + 1).setValue('')
    }

    return { success: true }
  }

  return { error: 'Booking not found' }
}
```

### A4 — `readBookingSlotsAll()` ปลดคิวตาม `returned_at` ⭐ หัวใจของงานนี้

`apps-script/Code.gs:176` — แก้ 2 จุด (`iArea`/`iReturnedAt` + สูตร `ret`):

```js
// ต่างจังหวัดต้องส่งพัสดุทั้งไปและกลับ กล้องเลยหายจากตลาดเพิ่มข้างละ 3 วัน
// ส่วนเช่าในพื้นที่ต้องการแค่ช่วงสั้นๆ ไว้ชาร์จแบต
const PROVINCIAL_SHIP_BUFFER_MS = 3 * 24 * 60 * 60 * 1000

function readBookingSlotsAll(month) {
  const sheet = getSpreadsheet().getSheetByName('bookings')
  const result = []
  if (!sheet || sheet.getLastRow() < 2) return result

  const data = sheet.getDataRange().getValues()
  const h = data[0]
  const iCamera = h.indexOf('camera_id')
  const iPickup = h.indexOf('pickup_datetime')
  const iReturn = h.indexOf('return_datetime')
  const iId = h.indexOf('booking_id')
  const iStatus = h.indexOf('booking_status')
  const iArea = h.indexOf('rental_area')        // ← ใหม่
  const iReturnedAt = h.indexOf('returned_at')  // ← ใหม่

  const [mYear, mMonth] = month ? month.split('-').map(Number) : [0, 0]
  const monthStart = mYear ? new Date(mYear, mMonth - 1, 1) : null
  const monthEnd = mYear ? new Date(mYear, mMonth, 1) : null

  for (let i = 1; i < data.length; i++) {
    const row = data[i]
    if (!row[iId]) continue
    if (row[iStatus] === 'cancelled') continue

    const isProvincial = iArea >= 0 && row[iArea] === 'provincial'
    const buffer = isProvincial ? PROVINCIAL_SHIP_BUFFER_MS : BATTERY_CHARGE_BUFFER_MS

    // หัวคิว: กันเวลาก่อนวันเริ่มเช่าไว้เสมอ (ขาส่งออก / กันชนกับคิวก่อนหน้า)
    // pad ทั้งสองฝั่งเพื่อให้ระยะห่างคงที่ ไม่ว่า booking ไหนถูกสร้างก่อน
    const pickup = new Date(new Date(row[iPickup]).getTime() - buffer)

    // ปลายคิว: ถ้าแอดมินกด "รับคืนแล้ว" = กล้องอยู่ในมือร้านจริงแล้ว
    // ขนส่งขากลับจบแล้ว → ปลดคิวตั้งแต่เวลานั้น เหลือแค่ 1 ชม. ไว้ชาร์จแบต
    // ไม่ต้องรอ buffer ขนส่งจนครบ 3 วัน
    const returnedAtRaw = iReturnedAt >= 0 ? row[iReturnedAt] : ''
    const ret = (row[iStatus] === 'returned' && returnedAtRaw)
      ? new Date(new Date(returnedAtRaw).getTime() + BATTERY_CHARGE_BUFFER_MS)
      : new Date(new Date(row[iReturn]).getTime() + buffer)

    if (monthStart && (ret <= monthStart || pickup >= monthEnd)) continue

    result.push({
      cameraId: row[iCamera],
      pickupDatetime: pickup.toISOString(),
      returnDatetime: ret.toISOString(),
      bookingId: row[iId],
    })
  }
  return result
}
```

**พฤติกรรมที่ได้ (ต้องเป็นแบบนี้):**

| กรณี | ปลายคิว |
|---|---|
| pending / confirmed / active (ต่างจังหวัด) | `return_datetime` + 3 วัน |
| pending / confirmed / active (ในพื้นที่) | `return_datetime` + 1 ชม. |
| **returned + มี `returned_at`** | **`returned_at` + 1 ชม.** (ทั้งสองพื้นที่) |
| returned แต่ไม่มี `returned_at` (ข้อมูลเก่า) | fallback = สูตรเดิม ✅ ปลอดภัย |

**ตัวอย่างจริง** — booking ต่างจังหวัด 10→13 ก.ย. กดรับคืน 13 ก.ย. 10:00 น.

| คิวถัดไป | ก่อนแก้ | หลังแก้ |
|---|---|---|
| ลูกค้าในพื้นที่ | 16 ก.ย. 00:00 | **13 ก.ย. 11:00** |
| ลูกค้าต่างจังหวัด | 19 ก.ย. | **17 ก.ย.** |

> ต่างจังหวัดยังต้องเว้นอีก 3 วันเพราะเป็น**ขาส่งออกให้ลูกค้าคนถัดไป** (candidate pad ตัวเอง −3 วัน) — ถูกต้องแล้ว ห้ามแก้ตรงนี้
>
> ถ้าพัสดุถึงเร็ว กดรับคืน 12 ก.ย. → คิวว่างตั้งแต่ 12 ก.ย. เลย ✅

**ไม่ต้องแก้ `createBooking()` และ frontend เพิ่ม** — ทั้งคู่ดึงข้อมูลผ่าน `readBookingSlotsAll()` → ได้ผลใหม่อัตโนมัติ

### A5 — เพิ่มปุ่ม "รับคืนแล้ว" ให้สถานะ `confirmed` ด้วย

`src/app/admin/page.tsx:21` — ตอนนี้ปุ่มรับคืนโผล่เฉพาะตอนสถานะ `active`
ถ้าแอดมินลืมกด "ส่งกล้องแล้ว" จะกดรับคืนไม่ได้ → คิวค้างตันทั้งที่กล้องกลับมาแล้ว

```ts
const STATUS_ACTIONS: Record<string, { next: BookingStatus; label: string; icon: React.ElementType }[]> = {
  pending: [{ next: 'confirmed', label: 'ยืนยันรับเงิน', icon: CheckCircle }],
  confirmed: [
    { next: 'active', label: 'ส่งกล้องแล้ว', icon: Package },
    { next: 'returned', label: 'รับคืนแล้ว', icon: RotateCcw },   // ← เพิ่ม
  ],
  active: [{ next: 'returned', label: 'รับคืนแล้ว', icon: RotateCcw }],
  returned: [],
  cancelled: [],
}
```

### A6 — เตือนแอดมินในหน้าเว็บ

ในหน้าแอดมิน ตรงปุ่ม "รับคืนแล้ว" ของ booking ที่ `rentalArea === 'provincial'` ให้ใส่ tooltip/ข้อความสั้นๆ:

> "กดเมื่อพัสดุถึงร้านจริง ไม่ใช่ตอนลูกค้าแจ้งเลขพัสดุ — กดแล้วคิวจะว่างทันที"

เหตุผล: ถ้ากดตอนลูกค้าแจ้งเลขพัสดุ คิวจะว่างทั้งที่กล้องยังอยู่บนรถขนส่ง → เสี่ยง double-book ของจริง

---

## 3. 🔴 งาน B — บั๊กวันแรกสุดในปฏิทินโดน backend ปฏิเสธ

### ปัญหา (พิสูจน์แล้ว ไม่ใช่การเดา)
- **Frontend** `src/components/DayRangePicker.tsx:45`
  `earliestStart = addDays(startOfDay(วันนี้), 3)` → วันนี้ 9 ก.ย. 14:00 น. ⇒ เปิดให้เลือก **12 ก.ย.**
  ค่าที่ส่งไป backend = **12 ก.ย. 00:00 น.**
- **Backend** (จาก stash) `createBooking()`
  `new Date(data.pickupDatetime).getTime() < Date.now() + PROVINCIAL_SHIP_BUFFER_MS`
  = `12 ก.ย. 00:00 < 12 ก.ย. 14:00` → **true → คืน error**

⇒ ลูกค้ากรอกครบทุก step อัปบัตรประชาชนแล้ว ค่อยโดนเด้งตอนกดยืนยัน
⇒ เกิดกับ**ทุกคน**ที่เลือกวันแรกสุดที่ปฏิทินเปิดให้ (ยกเว้นจองตอนเที่ยงคืนเป๊ะ)

### วิธีแก้
ให้ backend เทียบกับ **ต้นวันของวันนี้ตามเวลาไทย** ให้ตรงกับ frontend

`appsscript.json` ตั้ง `"timeZone": "Asia/Bangkok"` อยู่แล้ว ใช้ helper นี้ได้เลย:

```js
const PROVINCIAL_SHIP_LEAD_DAYS = 3

// ต้นวัน (00:00) ของ "วันนี้" ตามเวลาไทย
// ต้องเทียบจากต้นวัน ไม่ใช่ Date.now() เพราะปฏิทินฝั่ง frontend ส่งเวลา 00:00 มาเสมอ
// ถ้าเทียบจาก Date.now() ตรงๆ วันแรกสุดที่ปฏิทินเปิดให้เลือกจะถูกปฏิเสธทุกครั้ง
function startOfTodayBangkok() {
  return new Date(Utilities.formatDate(new Date(), 'Asia/Bangkok', "yyyy-MM-dd'T'00:00:00+07:00"))
}
```

แล้วใน `createBooking()` (guard ของ provincial):

```js
const isProvincial = data.rentalArea === 'provincial'

if (isProvincial && Number(data.durationHours) < MIN_PROVINCIAL_DURATION_HOURS) {
  return { error: 'เช่าต่างจังหวัดขั้นต่ำ 3 วัน' }
}
if (isProvincial) {
  const earliest = startOfTodayBangkok().getTime()
    + PROVINCIAL_SHIP_LEAD_DAYS * 24 * 60 * 60 * 1000
  if (new Date(data.pickupDatetime).getTime() < earliest) {
    return { error: 'เช่าต่างจังหวัดต้องจองล่วงหน้าอย่างน้อย 3 วัน เผื่อเวลาส่งพัสดุ' }
  }
}
```

> guard นี้ต้องอยู่ฝั่ง server ด้วย ห้ามพึ่ง frontend อย่างเดียว (กัน POST ตรงเข้า Apps Script)
> ค่าคงที่ `PROVINCIAL_SHIP_LEAD_DAYS` แยกจาก `PROVINCIAL_SHIP_BUFFER_MS` เผื่ออนาคตอยากให้ต่างกัน (ดูข้อ 7.2)

### ทดสอบ
```bash
# วันที่ = วันนี้ + 3 วัน เวลา 00:00 ตามเวลาไทย → ต้องผ่าน ไม่ใช่ error
curl -sL "$SCRIPT_URL" --data 'action=createBooking&...&rentalArea=provincial&pickupDatetime=<ISO>'
```

---

## 4. 🟡 งาน C — แก้ข้อความค่าส่ง (50฿ = ขาไปอย่างเดียว)

ตอนนี้ข้อความ**ขัดกันเอง**: บอกว่า "เหมาไป-กลับ" แต่อีกกล่องบอกว่า "ลูกค้าส่งพัสดุคืนเอง"
เจ้าของยืนยันแล้วว่า **50฿ = ขาไปอย่างเดียว ขากลับลูกค้าออกเอง**

| ไฟล์ | ข้อความเดิม | แก้เป็น |
|---|---|---|
| `src/app/book/page.tsx` การ์ด `OptionCard` "ส่งต่างจังหวัด" | `เช่าขั้นต่ำ 3 วัน · ค่าส่งเหมา 50฿ ไป-กลับ · กันคิวหน้า-หลัง 3 วัน...` | `เช่าขั้นต่ำ 3 วัน · ค่าส่งขาไป 50฿ (ขากลับลูกค้าส่งเอง) · จองล่วงหน้า 3 วัน` |
| `src/app/book/page.tsx` step ที่อยู่ กล่องสรุปราคา | `ค่าส่ง (เหมาไป-กลับ)` | `ค่าส่ง (ขาไป)` |
| `src/app/book/page.tsx` step ยืนยัน | `ค่าส่ง` | `ค่าส่ง (ขาไป)` |
| `src/components/ReceiptCard.tsx` | `ค่าจัดส่ง` | `ค่าส่ง (ขาไป)` |
| `src/app/book/page.tsx` กล่อง "การคืนเครื่อง" | `ลูกค้าส่งพัสดุคืนเองเมื่อครบกำหนด...` | เพิ่มคำว่า **"(ออกค่าส่งเอง)"** ให้ชัด |

ไม่ต้องแก้ค่าคงที่ `PROVINCIAL_SHIPPING_FEE = 50` — ตัวเลขถูกแล้ว แก้แค่ข้อความ

---

## 5. 🟡 งาน D — สื่อสารว่า "วันเริ่มเช่า = วันที่พัสดุถึงมือ"

โค้ดทำถูกอยู่แล้ว แต่**ไม่มีที่ไหนบอกใครเลย** ทั้งลูกค้าและแอดมิน

### D1 — ฝั่งลูกค้า
`src/app/book/page.tsx` ใต้ `<DayRangePicker />` เพิ่มข้อความ:

> 📦 วันที่เลือก = **วันที่พัสดุถึงมือคุณ** ร้านจะส่งออกล่วงหน้าประมาณ 3 วัน

### D2 — ฝั่งแอดมิน (LINE แจ้งเตือน)
`sendLineNotify()` ตอนนี้บอกแค่ `📅 รับ: 12/09/2026 → คืน: 15/09/2026`
แอดมินต้องมานั่งลบวันเองว่าต้องส่งออกวันไหน — เพิ่มบรรทัดนี้ในบล็อก `if (isProvincial)`:

```js
const shipOutBy = new Date(
  new Date(data.pickupDatetime).getTime() - PROVINCIAL_SHIP_BUFFER_MS
)
logisticsLines = [
  '🚚 ต่างจังหวัด (ส่งพัสดุ)',
  '📮 ต้องส่งออกภายใน ' + Utilities.formatDate(shipOutBy, 'Asia/Bangkok', 'dd/MM/yyyy'),
  '🏠 ' + (data.shippingAddress || '(ไม่ระบุที่อยู่)') +
    ' อ.' + (data.shippingDistrict || '-') +
    ' จ.' + (data.shippingProvince || '-') +
    ' ' + (data.shippingPostalCode || '-'),
  '⏰ ต้องแจ้งเลขพัสดุคืนในแชทก่อนเที่ยง ' + noticeDate,
]
```

### D3 — ป้ายวันคืนในปฏิทิน
ปฏิทินไฮไลต์วันที่ 10-11-12 แต่ใบสรุปเขียน "คืน 13 ก.ย." → ลูกค้างงว่าได้ใช้ถึงวันไหน
เปลี่ยนป้ายในใบสรุป/ใบจอง/หน้าแอดมิน จาก `คืน` เป็น **`ส่งคืน`** เฉพาะกรณี provincial
(ความหมายคือ "วันที่ต้องเอาไปส่งไปรษณีย์" ไม่ใช่ "วันสุดท้ายที่ได้ใช้")

---

## 6. 🟢 งาน E — เก็บกวาดตอน merge

### 6.1 ห้ามเอา `CacheService` กลับมา ⚠️
stash มี perf fix 2 ส่วนติดมาด้วย:

| ส่วน | เอาไหม | เหตุผล |
|---|---|---|
| อ่านชีทครั้งเดียว (`readBookingSlotsAll` / `slotsForCamera`) | **มีใน `main` อยู่แล้ว** | commit `aa4cd55` |
| `CacheService` TTL 30 วิ ใน `getAvailability`/`getAllAvailability` | ❌ **ห้ามเอากลับ** | เจ้าของสั่ง revert ไปแล้ว (`69f814b`) |

ตอน resolve conflict ใน `Code.gs` ให้ `getAvailability()` / `getAllAvailability()` **เหมือน `main` เป๊ะ** (บรรทัด 252-265) อย่าใส่ `cache.get`/`cache.put` กลับเข้าไป

### 6.2 เปิดสวิตช์
`src/app/book/page.tsx` — ในโค้ดจาก stash มี:
```ts
const PROVINCIAL_ENABLED = false
```
เปลี่ยนเป็น `true` **เป็นขั้นตอนสุดท้าย หลังทดสอบครบแล้ว**

โครงสร้าง step ผูกกับ flag นี้หมดแล้ว (`STEP_AREA`/`STEP_CAMERA`/`STEP_DATE`/`STEP_ADDRESS`/`STEP_INFO`/`STEP_CONFIRM`/`STEP_RECEIPT`) → เปลี่ยนค่าเดียวจบ ไม่ต้องแก้อย่างอื่น
ถ้าต้องปิดฉุกเฉินทีหลังก็เปลี่ยนกลับเป็น `false` ได้ทันที ไม่ต้องแตะ backend

### 6.3 Type เพิ่มเติม (ถ้าจะโชว์เวลารับคืนในแอดมิน)
`src/types/index.ts` เพิ่มใน `interface Booking`:
```ts
returnedAt?: string
```
`src/lib/api.ts` ใน `mapBooking()`:
```ts
returnedAt: r.returned_at ? String(r.returned_at) : undefined,
```
และ backend `getAdminBookings()` ต้องส่ง `returned_at` กลับมาด้วย (optional — ทำก็ได้ ไม่ทำก็ได้)

---

## 7. บั๊กเดิมที่ยังไม่ได้แก้ (ไม่ใช่ scope รอบนี้ แต่ต้องรู้)

### 7.1 `generateBookingId()` ออก ID ซ้ำได้จริง
ใช้ `sheet.getLastRow()` เป็น sequence แทนตัวนับถาวร → **พิสูจน์แล้วในข้อมูลจริง** ว่า `MIW-20260801-005` ถูกออกให้ 2 booking คนละคน (เกิดตอนลบ booking ทดสอบทิ้งแล้ว row count ลดลง)
ผลกระทบ: `getBookingById`/`updateBookingStatus`/`deleteBooking` loop หา match ตัวแรกจากบนลงล่าง → ถ้า ID ซ้ำตอนทั้งคู่ยัง active แอดมินกดยกเลิกจะไปโดนแถวเก่าแทน
แนวทางแก้: Script Properties counter หรือ `timestamp + random`

### 7.2 ไม่มี `LockService` เลยทั้งไฟล์
`createBooking` ไม่ lock ระหว่างเช็ค capacity กับ `appendRow` → 2 คนกดจองพร้อมกันอาจผ่านทั้งคู่ (double-booking จริง)
แนวทางแก้: ห่อด้วย `LockService.getScriptLock().waitLock(30000)`

> ⚠️ งาน A ในเอกสารนี้**ไม่ได้ทำให้ 2 ข้อนี้แย่ลง** แต่ก็ไม่ได้แก้ให้ ถ้าจะเปิดใช้ต่างจังหวัดจริงจัง ควรแก้ 7.2 ก่อน เพราะกล้องส่งไปต่างจังหวัดแล้วเรียกคืนยากกว่ามาก

### 7.3 ข้อจำกัดที่ยอมรับแล้ว (ไม่ต้องแก้)
- `returned_at` ใช้**เวลาที่แอดมินกดปุ่ม** ไม่ใช่เวลาที่พัสดุถึงจริง — ถ้ารับของตอนเย็นแต่มากดตอนดึก คิวจะว่างช้าไปไม่กี่ ชม. ยอมรับได้ (ถ้าอยากแม่นกว่านี้ต้องเพิ่มช่องให้แอดมินเลือกวัน-เวลาเอง)
- **หัวคิว (3 วันก่อนวันเริ่มเช่า) ปลดไม่ได้** เพราะอยู่ก่อนหน้าการเช่า ถ้าร้านส่งออกช้ากว่ากำหนดวันนั้นก็ยังโดนกันไว้อยู่ดี — ผลกระทบน้อย ไม่คุ้มแก้
- buffer เลือกจาก `rental_area` ของแต่ละแถว ไม่ใช่ max ของทั้งคู่ → local ติดกับ provincial คลาดเคลื่อนได้ ~1 ชม. (เล็กน้อยเทียบ 3 วัน)

---

## 8. Deploy

```bash
# 1) build ผ่านก่อน
npm run build

# 2) deploy Apps Script — ต้องระบุ -i เป็น deploymentId เดิมเท่านั้น
cd apps-script   # หรือ root แล้วแต่ .clasp.json
clasp push
clasp deploy -i AKfycbwEr6iVMUWtyQsv6JKSA_dgDpneTKY8lq8DYKXxvySatzuTujSoopXyLIn9Ff_2DZAx \
  -d "provincial rental: release queue on returned + fix lead-time guard"

# 3) git — commit ได้ แต่ *ห้าม push* จนกว่าเจ้าของจะสั่ง
```

Apps Script deploy ล่าสุดตอนเขียนเอกสาร = revision **@34**

---

## 9. แผนทดสอบ (ต้องผ่านทุกข้อก่อนเปิด `PROVINCIAL_ENABLED = true`)

### 9.1 งาน A — ปลดคิวเมื่อรับคืน
1. สร้าง booking ต่างจังหวัด 10→13 (ผ่านเว็บจริง)
2. เปิดปฏิทินกล้องรุ่นเดิม → วันที่ 7-16 ต้องเป็นสีแดง (คิวไม่ว่าง)
3. เข้าแอดมิน กด `ยืนยันรับเงิน` → `ส่งกล้องแล้ว` → `รับคืนแล้ว`
4. เช็ค sheet: คอลัมน์ `returned_at` ต้องมีเวลาปัจจุบัน
5. รีโหลดปฏิทิน → **วันที่ 14-16 ต้องกลับมาเขียว** สำหรับลูกค้าในพื้นที่
6. สลับเป็นโหมดต่างจังหวัด → วันแรกที่เลือกได้ต้องเลื่อนมาเป็นวันที่ 17 (จาก 19)
7. กดถอยสถานะกลับเป็น `active` → `returned_at` ต้องถูกล้าง และวันที่ 14-16 กลับเป็นแดง

### 9.2 งาน B — lead time
1. เลือกวันแรกสุดที่ปฏิทินเปิดให้ (= วันนี้ + 3 วัน)
2. กรอกครบทุก step แล้วกดยืนยัน
3. **ต้องจองสำเร็จ** ไม่ใช่ error "ต้องจองล่วงหน้าอย่างน้อย 3 วัน"
4. ยิง curl ตรงด้วย `pickupDatetime` = วันนี้ + 2 วัน → **ต้องได้ error** (server guard ยังทำงาน)

### 9.3 Regression — เช่าในพื้นที่ต้องไม่พัง
1. จองในพื้นที่ตามปกติ ทุก step
2. buffer 1 ชม. ยังทำงาน (จองชิดขอบ booking เดิมไม่ได้)
3. กด "รับคืนแล้ว" → คิวว่างหลังจากนั้น 1 ชม. (ไม่ใช่ 3 วัน)
4. IXY 930 IS (มี 2 ตัว) ยังจองซ้อนได้ 2 คิวพร้อมกัน
5. บล็อกคิว "ทุกรุ่น" ในแอดมินยังกันได้เต็มจำนวน

### 9.4 ข้อควรระวังตอนทดสอบด้วย browser automation
- หน้าแอดมินมี native `confirm()` ตอนลบ block/ยกเลิก booking → **ทำให้ CDP ค้างทั้งแท็บ**
  ถ้าจำเป็นต้องลบข้อมูลทดสอบ ให้ปิดแท็บแล้วยิง curl ตรงไปที่ Apps Script แทน
- `DayRangePicker`/`HourlyTimeline` มี `key={cameraId}` อยู่แล้วเพื่อบังคับ remount ตอนสลับกล้อง — **อย่าเอาออก** ไม่งั้นปฏิทินจะโชว์ข้อมูลกล้องเก่าค้าง (เคยเป็นบั๊กมาแล้ว)

---

## 10. สรุปลำดับงาน

| # | งาน | ไฟล์หลัก | ความเสี่ยง |
|---|---|---|---|
| 0 | `git stash pop` + resolve conflict | 13 ไฟล์ | ปานกลาง |
| A | ปลดคิวเมื่อกดรับคืน | `Code.gs`, `admin/page.tsx` | **สูง** — แตะ logic คิวหลัก ต้องเทสข้อ 9.3 ให้ครบ |
| B | fix lead-time guard | `Code.gs` | ต่ำ |
| C | แก้ข้อความค่าส่ง | `book/page.tsx`, `ReceiptCard.tsx` | ต่ำ |
| D | สื่อสารวันพัสดุถึง | `book/page.tsx`, `Code.gs` | ต่ำ |
| E | เก็บกวาด + เปิด flag | `Code.gs`, `book/page.tsx` | ต่ำ |

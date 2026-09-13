// ============================================================
// MIWVIE SHOP — Google Apps Script Backend
// Deploy as Web App: Execute as Me | Access: Anyone
// ============================================================

const BOOKING_HEADERS = [
  'booking_id', 'created_at', 'camera_id', 'camera_name',
  'pickup_datetime', 'return_datetime', 'duration_hours',
  'price', 'delivery_fee', 'total_amount',
  'pickup_type', 'pickup_address', 'return_type', 'return_address',
  'customer_name', 'customer_phone', 'customer_ig',
  'id_card_url', 'ig_profile_url',
  'payment_status', 'booking_status', 'admin_notes',
  'discount_code', 'discount_amount',
  'rental_area', 'shipping_address', 'shipping_subdistrict', 'shipping_district', 'shipping_province', 'shipping_postal_code',
  'returned_at',
  'access_token', 'request_key',
]

// Provincial rentals ship both ways, so the physical unit is off the market for
// 3 extra days on each side; local rentals only need a short battery-charge gap.
const PROVINCIAL_SHIP_BUFFER_MS = 3 * 24 * 60 * 60 * 1000
const MIN_PROVINCIAL_DURATION_HOURS = 72
// Days of lead time the shop needs to ship a unit out so it lands in the
// customer's hands on their chosen start day. Kept separate from the buffer
// constant above in case the two ever need to diverge.
const PROVINCIAL_SHIP_LEAD_DAYS = 3

const BLOCKED_HEADERS = ['id', 'camera_id', 'start_datetime', 'end_datetime', 'reason', 'created_at', 'quantity']
const DISCOUNT_HEADERS = ['code', 'source_booking_id', 'created_at', 'used_by_booking_id', 'used_at', 'status']

const CAMERA_NAMES = {
  IXY10s: 'Canon IXY 10s',
  IXY30s: 'Canon IXY 30s',
  IXY930IS: 'Canon IXY 930 IS',
  IXY510IS: 'Canon IXY 510 IS',
  IXY910IS: 'Canon IXY 910 IS',
  IXY200: 'Canon IXY 200 (IXUS 185)'
}

const CAMERA_QUANTITY = {
  IXY10s: 1,
  IXY30s: 1,
  IXY930IS: 2,
  IXY510IS: 1,
  IXY910IS: 1,
  IXY200: 1
}

// The browser computes prices too (src/lib/cameras.ts) so it can show a total
// before submitting, but it is never the source of truth: the server recomputes
// every figure it stores. Keep these tables in lock-step with cameras.ts.
const PRICE_TABLES = {
  A: { hourly6: 110, day1: 190, day2: 340, day3: 490, day4: 560, day5: 640, day6: 700, day7: 750 },
  B: { hourly6: 100, day1: 150, day2: 260, day3: 370, day4: 440, day5: 520, day6: 600, day7: 670 },
}
const EXTRA_DAY_RATE = { A: 100, B: 90 }
const CAMERA_GROUP = {
  IXY10s: 'A', IXY30s: 'A', IXY930IS: 'A', IXY510IS: 'A', IXY910IS: 'B', IXY200: 'B',
}
const PROVINCIAL_SHIPPING_FEE = 50
const LOCAL_DELIVERY_FEE = 20
const REVIEW_DISCOUNT_RATE = 0.1

// Input ceilings. A booking longer than two months or an image bigger than this
// is a malformed or hostile request, not a customer.
const MAX_DURATION_HOURS = 24 * 62
const MAX_IMAGE_CHARS = 4 * 1024 * 1024
const MAX_TEXT_LEN = 500

function calcPriceServer(group, durationHours) {
  const t = PRICE_TABLES[group] || PRICE_TABLES.A
  if (durationHours <= 6) return t.hourly6
  const days = Math.ceil(durationHours / 24)
  if (days <= 7) return t['day' + days]
  return t.day7 + (days - 7) * (EXTRA_DAY_RATE[group] || EXTRA_DAY_RATE.A)
}

function getAdminPin() {
  // Deliberately no fallback. An unset property must lock admin actions out
  // rather than hand every visitor a default PIN — the public /api/sheets proxy
  // forwards any action, so this string is the only gate in front of them.
  return PropertiesService.getScriptProperties().getProperty('ADMIN_PIN') || null
}

// Returns an error object to hand straight back, or null when the PIN is good.
function checkPin(pin) {
  const real = getAdminPin()
  if (!real) return { error: 'ระบบยังไม่ได้ตั้งรหัสแอดมิน' }
  if (String(pin || '') !== String(real)) return { error: 'Invalid PIN' }
  return null
}

// One-shot bootstrap so the very first PIN can be set on a script that has none.
// Closes itself permanently the moment a PIN exists.
function bootstrapAdminPin(newPin) {
  const props = PropertiesService.getScriptProperties()
  if (props.getProperty('ADMIN_PIN')) return { error: 'ตั้งรหัสไว้แล้ว ใช้ setAdminPin แทน' }
  if (!newPin || String(newPin).length < 4) return { error: 'รหัสต้องยาวอย่างน้อย 4 ตัว' }
  props.setProperty('ADMIN_PIN', String(newPin))
  return { success: true }
}

function setAdminPin(pin, newPin) {
  const authErr = checkPin(pin)
  if (authErr) return authErr
  if (!newPin || String(newPin).length < 4) return { error: 'รหัสต้องยาวอย่างน้อย 4 ตัว' }
  PropertiesService.getScriptProperties().setProperty('ADMIN_PIN', String(newPin))
  return { success: true }
}

// Names of the Script Properties that are set, for checking configuration
// without ever handing back a value.
function listConfigKeys(pin) {
  const authErr = checkPin(pin)
  if (authErr) return authErr
  return { keys: PropertiesService.getScriptProperties().getKeys().sort() }
}

// Documents uploaded before the private-by-default change are still shared
// ANYONE_WITH_LINK, so the Drive URL on an old booking row opens a photograph of
// someone's ID card for anybody holding it. Walks the rows, reports what it
// finds, and — only when `apply` is true — locks each one down.
//
// Runs in slices because Apps Script stops an execution at six minutes and Drive
// calls are slow: pass the returned `nextStart` back to continue.
function migrateDocumentSharing(pin, apply, start, limit) {
  const authErr = checkPin(pin)
  if (authErr) return authErr

  const sheet = getSpreadsheet().getSheetByName('bookings')
  if (!sheet || sheet.getLastRow() < 2) return { checked: 0, files: [], done: true }

  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
  const iId = header.indexOf('booking_id')
  const cols = [header.indexOf('id_card_url'), header.indexOf('ig_profile_url')]

  const first = Math.max(2, Number(start) || 2)
  const batch = Math.max(1, Math.min(Number(limit) || 40, 200))
  const lastRow = sheet.getLastRow()
  if (first > lastRow) return { checked: 0, files: [], done: true }

  const rows = sheet.getRange(first, 1, Math.min(batch, lastRow - first + 1), header.length).getValues()

  const out = { checked: 0, public: 0, changed: 0, alreadyPrivate: 0, missing: 0, files: [] }
  for (var r = 0; r < rows.length; r++) {
    for (var c = 0; c < cols.length; c++) {
      if (cols[c] < 0) continue
      const url = String(rows[r][cols[c]] || '')
      const m = url.match(/\/d\/([A-Za-z0-9_-]+)/)
      if (!m) continue
      out.checked++
      try {
        const file = DriveApp.getFileById(m[1])
        const access = file.getSharingAccess()
        const isPublic = access === DriveApp.Access.ANYONE ||
                         access === DriveApp.Access.ANYONE_WITH_LINK
        if (!isPublic) { out.alreadyPrivate++; continue }
        out.public++
        if (apply) {
          file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW)
          out.changed++
        }
        out.files.push({ booking: String(rows[r][iId]), fileId: m[1] })
      } catch (e) {
        out.missing++
      }
    }
  }

  const nextStart = first + rows.length
  out.done = nextStart > lastRow
  out.nextStart = nextStart
  out.scannedRows = first + '-' + (nextStart - 1)
  return out
}

// Unguessable per-booking secret. The booking ID is sequential and public, so it
// is the token — never the ID — that authorises seeing a customer's own details.
function generateAccessToken() {
  return (Utilities.getUuid() + Utilities.getUuid()).replace(/-/g, '').slice(0, 40)
}

// Everything the customer's own receipt page needs, and nothing more. Contact
// details, document links, admin notes and coupon codes are admin-only and are
// absent from both customer lists on purpose.
const CUSTOMER_BOOKING_FIELDS = [
  'booking_id', 'created_at', 'camera_id', 'camera_name',
  'pickup_datetime', 'return_datetime', 'duration_hours',
  'price', 'delivery_fee', 'total_amount', 'discount_amount',
  'pickup_type', 'pickup_address', 'return_type', 'return_address',
  'rental_area', 'shipping_address', 'shipping_subdistrict',
  'shipping_district', 'shipping_province', 'shipping_postal_code',
  'payment_status', 'booking_status', 'returned_at',
]

// What an old link with no token, or a wrong token, may still see: enough to
// check "is my booking confirmed yet", with no personal data attached.
const PUBLIC_BOOKING_FIELDS = [
  'booking_id', 'camera_id', 'camera_name', 'pickup_datetime', 'return_datetime',
  'duration_hours', 'total_amount', 'rental_area',
  'payment_status', 'booking_status', 'returned_at',
]

// Rejects a booking request before it can take a lock, upload anything, or write
// a row. The date checks matter beyond this request: a row whose dates don't
// parse makes readBookingSlotsAll throw on toISOString(), which takes down the
// calendar, createBooking and the LINE queue commands for everyone at once.
function validateBookingInput(data) {
  const errors = []

  if (!CAMERA_NAMES[data.cameraId]) errors.push('ไม่รู้จักกล้องรุ่นนี้')

  const area = data.rentalArea || 'local'
  if (area !== 'local' && area !== 'provincial') errors.push('พื้นที่เช่าไม่ถูกต้อง')

  const pickup = new Date(data.pickupDatetime)
  const ret = new Date(data.returnDatetime)
  if (isNaN(pickup.getTime())) errors.push('วันรับไม่ถูกต้อง')
  if (isNaN(ret.getTime())) errors.push('วันคืนไม่ถูกต้อง')
  if (!isNaN(pickup.getTime()) && !isNaN(ret.getTime())) {
    if (ret.getTime() <= pickup.getTime()) errors.push('วันคืนต้องอยู่หลังวันรับ')
    if ((ret.getTime() - pickup.getTime()) / 3600000 > MAX_DURATION_HOURS) {
      errors.push('ระยะเวลาเช่ายาวเกินที่ระบบรองรับ')
    }
  }

  const name = String(data.customerName == null ? '' : data.customerName).trim()
  if (name.length < 2 || name.length > 120) errors.push('กรุณากรอกชื่อ-นามสกุลให้ถูกต้อง')

  const phone = String(data.customerPhone == null ? '' : data.customerPhone).replace(/[^0-9]/g, '')
  if (phone.length < 9 || phone.length > 10) errors.push('เบอร์โทรไม่ถูกต้อง')

  if (area === 'provincial') {
    const required = [
      ['shippingAddress', 'ที่อยู่จัดส่ง'], ['shippingSubdistrict', 'ตำบล/แขวง'],
      ['shippingDistrict', 'อำเภอ/เขต'], ['shippingProvince', 'จังหวัด'],
    ]
    for (var i = 0; i < required.length; i++) {
      if (!String(data[required[i][0]] || '').trim()) errors.push('กรุณากรอก' + required[i][1])
    }
    if (String(data.shippingPostalCode || '').replace(/[^0-9]/g, '').length !== 5) {
      errors.push('รหัสไปรษณีย์ไม่ถูกต้อง')
    }
  }

  const textFields = ['pickupAddress', 'returnAddress', 'shippingAddress', 'customerIG',
                      'shippingSubdistrict', 'shippingDistrict', 'shippingProvince']
  for (var j = 0; j < textFields.length; j++) {
    if (String(data[textFields[j]] || '').length > MAX_TEXT_LEN) errors.push('ข้อมูลบางช่องยาวเกินกำหนด')
  }

  for (var k = 0, imgs = ['idCardImage', 'igProfileImage']; k < imgs.length; k++) {
    const img = data[imgs[k]]
    if (img && String(img).length > MAX_IMAGE_CHARS) errors.push('ไฟล์รูปใหญ่เกินไป')
  }

  return errors
}

// Server-authoritative money. Never reads price/deliveryFee/totalAmount off the
// request — a client that sends its own total can otherwise store any number.
function quoteBooking(data, durationHours) {
  const price = calcPriceServer(CAMERA_GROUP[data.cameraId], durationHours)
  const deliveryFee = data.rentalArea === 'provincial'
    ? PROVINCIAL_SHIPPING_FEE
    : ((data.pickupType === 'delivery' ? LOCAL_DELIVERY_FEE : 0) +
       (data.returnType === 'delivery' ? LOCAL_DELIVERY_FEE : 0))
  return { price: price, deliveryFee: deliveryFee }
}

// ── Spreadsheet helper ───────────────────────────────────────

function getSpreadsheet() {
  const props = PropertiesService.getScriptProperties()
  let ssId = props.getProperty('SPREADSHEET_ID')
  if (ssId) {
    try { return SpreadsheetApp.openById(ssId) } catch (e) {}
  }
  const ss = SpreadsheetApp.create('MIWVIE SHOP — Bookings')
  props.setProperty('SPREADSHEET_ID', ss.getId())
  return ss
}

// ── Entry points ────────────────────────────────────────────

function doGet(e) {
  try {
    const result = handleGet(e.parameter)
    return json(result)
  } catch (err) {
    return json({ error: err.message })
  }
}

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents || '{}')
    const result = handlePost(body)
    return json(result)
  } catch (err) {
    return json({ error: err.message })
  }
}

function json(data) {
  return ContentService.createTextOutput(JSON.stringify(data))
    .setMimeType(ContentService.MimeType.JSON)
}

// ── GET handlers ────────────────────────────────────────────

function handleGet(p) {
  switch (p.action) {
    case 'setup':              return setupSheets()
    case 'getAvailability':    return getAvailability(p.camera, p.month)
    case 'getAllAvailability':  return getAllAvailability(p.month)
    case 'getBooking':         return getBookingById(p.id, p.token)
    case 'validateDiscountCode': return validateDiscountCode(p.code)
    case 'getUpcomingQueue':    return getUpcomingQueue(p.pin)
    default: return { error: 'Unknown action: ' + p.action }
  }
}

// ── POST handlers ───────────────────────────────────────────

function handlePost(body) {
  switch (body.action) {
    case 'createBooking':        return createBooking(body)
    case 'getBooking':           return getBookingById(body.id, body.token)
    case 'attachImages':         return attachImages(body.bookingId, body.idCardImage, body.igProfileImage, body.token)
    case 'getAdminBookings':     return getAdminBookings(body.pin)
    case 'updateBookingStatus':  return updateBookingStatus(body.bookingId, body.status, body.pin)
    case 'deleteBooking':        return deleteBooking(body.bookingId, body.pin)
    case 'blockDates':           return blockDates(body.cameraId, body.start, body.end, body.reason, body.pin, body.quantity)
    case 'listBlockedSlots':     return listBlockedSlots(body.pin)
    case 'deleteBlockedSlot':    return deleteBlockedSlot(body.id, body.pin)
    case 'generateDiscountCode': return generateDiscountCode(body.bookingId, body.pin)
    case 'getDayQueue':          return getDayQueue(body.pin, body.date)
    case 'getUpcomingQueue':     return getUpcomingQueue(body.pin)
    case 'lineReply':            return lineReply(body.pin, body.replyToken, body.text, body.texts)
    case 'linePush':             return linePush(body.pin, body.text, body.texts)
    case 'bootstrapAdminPin':    return bootstrapAdminPin(body.newPin)
    case 'setAdminPin':          return setAdminPin(body.pin, body.newPin)
    case 'getCorruptRows':       return getCorruptRows(body.pin)
    case 'listConfigKeys':       return listConfigKeys(body.pin)
    case 'installPromoSchedule': return installPromoSchedule(body.pin)
    case 'sendPromoNow':         return sendPromoNow(body.pin, body.slot)
    case 'listTriggers':         return listTriggers(body.pin)
    case 'migrateDocumentSharing':
      return migrateDocumentSharing(body.pin, body.apply === true, body.start, body.limit)
    default: return { error: 'Unknown action: ' + body.action }
  }
}

// ── Setup ───────────────────────────────────────────────────

function setupSheets() {
  const ss = getSpreadsheet()

  if (!ss.getSheetByName('bookings')) {
    const s = ss.insertSheet('bookings')
    s.getRange(1, 1, 1, BOOKING_HEADERS.length).setValues([BOOKING_HEADERS])
      .setBackground('#d4a227').setFontColor('#ffffff').setFontWeight('bold')
    s.setFrozenRows(1)
    s.setColumnWidth(1, 160)
    s.setColumnWidth(5, 180)
    s.setColumnWidth(6, 180)
    const sheet1 = ss.getSheetByName('Sheet1')
    if (sheet1) ss.deleteSheet(sheet1)
  }

  if (!ss.getSheetByName('blocked_slots')) {
    const s = ss.insertSheet('blocked_slots')
    s.getRange(1, 1, 1, BLOCKED_HEADERS.length).setValues([BLOCKED_HEADERS])
      .setBackground('#374151').setFontColor('#ffffff').setFontWeight('bold')
    s.setFrozenRows(1)
  }

  if (!ss.getSheetByName('discount_codes')) {
    const s = ss.insertSheet('discount_codes')
    s.getRange(1, 1, 1, DISCOUNT_HEADERS.length).setValues([DISCOUNT_HEADERS])
      .setBackground('#b8860b').setFontColor('#ffffff').setFontWeight('bold')
    s.setFrozenRows(1)
    s.setColumnWidth(1, 140)
    s.setColumnWidth(2, 160)
  }

  const props = PropertiesService.getScriptProperties()
  let folderId = props.getProperty('DRIVE_FOLDER_ID')
  if (!folderId) {
    const folder = DriveApp.createFolder('MIWVIE SHOP Documents')
    folderId = folder.getId()
    props.setProperty('DRIVE_FOLDER_ID', folderId)
  }

  return {
    success: true,
    message: 'Setup complete!',
    spreadsheetId: ss.getId(),
    spreadsheetUrl: ss.getUrl()
  }
}

// ── Availability ─────────────────────────────────────────────

// Keep every booking off the market for an extra hour on both sides (to charge
// the battery after a return, and to guarantee the same 1hr gap before a pickup
// no matter which of two adjacent bookings was created first).
const BATTERY_CHARGE_BUFFER_MS = 60 * 60 * 1000

// Raw readers — each hits its sheet exactly once, no matter how many camera
// models are being checked. Used directly by getAvailability/getAllAvailability
// below and by createBooking's own capacity check, so every caller always
// sees a live read (no caching involved anywhere).

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
  const iArea = h.indexOf('rental_area')
  const iReturnedAt = h.indexOf('returned_at')

  const [mYear, mMonth] = month ? month.split('-').map(Number) : [0, 0]
  const monthStart = mYear ? new Date(mYear, mMonth - 1, 1) : null
  const monthEnd = mYear ? new Date(mYear, mMonth, 1) : null

  for (let i = 1; i < data.length; i++) {
    const row = data[i]
    if (!row[iId]) continue
    if (row[iStatus] === 'cancelled') continue

    // Buffer pads both sides so the gap holds regardless of which booking was
    // created first — only affects availability checks, not the stored times.
    // Provincial rentals ship both ways, so they need a much bigger buffer.
    const isProvincial = iArea >= 0 && row[iArea] === 'provincial'
    const buffer = isProvincial ? PROVINCIAL_SHIP_BUFFER_MS : BATTERY_CHARGE_BUFFER_MS
    const returnedAtRaw = iReturnedAt >= 0 ? row[iReturnedAt] : ''

    let pickup, ret
    if (isProvincial && row[iStatus] === 'returned' && returnedAtRaw) {
      // Provincial unit is physically back at the shop — both ship legs are done.
      // Collapse the whole window to a 1hr battery-charge gap from the actual
      // return moment, so the queue frees up right away instead of waiting out
      // the 3-day tail (and the ship-out reservation on the front is moot too).
      pickup = new Date(row[iPickup]) // keep the original start so past months still bucket right
      ret = new Date(new Date(returnedAtRaw).getTime() + BATTERY_CHARGE_BUFFER_MS)
      if (ret < pickup) pickup = ret // returned before the delivered date (shipped early) — collapse
    } else {
      // Head of the queue: reserve the lead time before the start day (ship-out
      // leg for provincial, shared 1hr gap for local).
      pickup = new Date(new Date(row[iPickup]).getTime() - buffer)
      // Tail: return time + the same buffer. Provincial rows that predate the
      // returned_at column fall back to this too.
      ret = new Date(new Date(row[iReturn]).getTime() + buffer)
    }

    // A row whose dates don't parse would throw on toISOString() below and take
    // out the calendar, createBooking and the LINE queue commands all at once.
    // Validation now stops such rows at the door, but older rows may already be
    // on the sheet: skip them and let getCorruptRows() report them to the admin.
    if (isNaN(pickup.getTime()) || isNaN(ret.getTime())) continue

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

function readBlockedSlotsAll() {
  const blocked = getSpreadsheet().getSheetByName('blocked_slots')
  const result = []
  if (!blocked || blocked.getLastRow() < 2) return result

  const bData = blocked.getDataRange().getValues()
  const bh = bData[0]
  const biCamera = bh.indexOf('camera_id')
  const biStart = bh.indexOf('start_datetime')
  const biEnd = bh.indexOf('end_datetime')
  const biQuantity = bh.indexOf('quantity')

  for (let i = 1; i < bData.length; i++) {
    const row = bData[i]
    if (!row[0]) continue
    result.push({
      cameraId: row[biCamera], // a specific model id, or 'ALL'
      pickupDatetime: new Date(row[biStart]).toISOString(),
      returnDatetime: new Date(row[biEnd]).toISOString(),
      // Must be UNIQUE: the booking page merges slots from every fetch and
      // de-dupes on this id, so a shared literal like 'blocked' made every block
      // after the first one silently vanish from the customer's calendar.
      bookingId: String(row[0]),
      // Older rows predate this column and default to 1 unit blocked
      quantity: biQuantity >= 0 ? (Number(row[biQuantity]) || 1) : 1,
    })
  }
  return result
}

function slotsForCamera(cameraId, bookingSlots, blockedSlots) {
  return bookingSlots
    .filter((s) => s.cameraId === cameraId)
    .concat(
      blockedSlots
        .filter((s) => s.cameraId === cameraId || s.cameraId === 'ALL')
        // An 'ALL' block is re-emitted once per camera — suffix the id so the two
        // copies stay distinct in the client's de-dupe map.
        .map((s) => Object.assign({}, s, { cameraId: cameraId, bookingId: s.bookingId + '@' + cameraId }))
    )
}

function getAvailability(cameraId, month) {
  const slots = slotsForCamera(cameraId, readBookingSlotsAll(month), readBlockedSlotsAll())
  return { slots }
}

function getAllAvailability(month) {
  const bookingSlots = readBookingSlotsAll(month)
  const blockedSlots = readBlockedSlotsAll()
  const cameras = {}
  Object.keys(CAMERA_NAMES).forEach((id) => {
    cameras[id] = slotsForCamera(id, bookingSlots, blockedSlots)
  })
  return { cameras }
}

// ── Create booking ───────────────────────────────────────────

// Midnight (00:00) of "today" in Bangkok, as a Date. The booking calendar sends
// start days at 00:00, so provincial lead-time checks must anchor here rather
// than to the current clock time.
function startOfTodayBangkok() {
  return new Date(Utilities.formatDate(new Date(), 'Asia/Bangkok', "yyyy-MM-dd'T'00:00:00+07:00"))
}

function createBooking(data) {
  const ss = getSpreadsheet()
  const sheet = ss.getSheetByName('bookings')
  if (!sheet) return { error: 'Run setup first via ?action=setup' }

  // Shape and sanity first: nothing below this point should ever see a value
  // that could not have come from the real booking form.
  const problems = validateBookingInput(data)
  if (problems.length) return { error: problems[0], errors: problems }

  const isProvincial = data.rentalArea === 'provincial'
  const pickupDate = new Date(data.pickupDatetime)
  const returnDate = new Date(data.returnDatetime)

  // Derived, not trusted. The form always sends a duration matching the window
  // it picked, but pricing keys off this number so it must come from the dates.
  const durationHours = Math.round((returnDate.getTime() - pickupDate.getTime()) / 3600000)

  if (isProvincial && durationHours < MIN_PROVINCIAL_DURATION_HOURS) {
    return { error: 'เช่าต่างจังหวัดขั้นต่ำ 3 วัน' }
  }
  if (isProvincial) {
    // Compare against the START of today (Bangkok), not Date.now(): the calendar
    // sends a 00:00 start day, so anchoring to the current clock time would
    // reject the very first day the picker offers on every booking made after
    // midnight. Keep this in lock-step with DayRangePicker's earliestStart.
    const earliest = startOfTodayBangkok().getTime()
      + PROVINCIAL_SHIP_LEAD_DAYS * 24 * 60 * 60 * 1000
    if (pickupDate.getTime() < earliest) {
      return { error: 'เช่าต่างจังหวัดต้องจองล่วงหน้าอย่างน้อย 3 วัน เผื่อเวลาส่งพัสดุ' }
    }
  }

  ensureColumns(sheet, BOOKING_HEADERS)

  const quote = quoteBooking(data, durationHours)
  const requestKey = String(data.requestKey || '').slice(0, 64)

  // The two Drive uploads used to run here, inside the booking request, and cost
  // ~8s of the ~12s the customer spent staring at a spinner — long enough that a
  // mobile connection would often drop before the response came back, showing
  // "Network error" for a booking that had in fact been written. The client now
  // books first and sends the images afterwards via `attachImages`, so this only
  // still runs for an older client that posts the images inline.
  const uploadKey = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd-HHmmss') +
    '-' + String(data.customerPhone || '').slice(-4)
  const idCardUrl = data.idCardImage ? uploadImage(data.idCardImage, uploadKey + '_id') : ''
  const igUrl = data.igProfileImage ? uploadImage(data.igProfileImage, uploadKey + '_ig') : ''

  // Everything from the duplicate check through the row write must be atomic:
  // two people submitting for the last unit at the same instant would otherwise
  // both read "1 free" and both get written. Serialise with a script lock.
  const lock = LockService.getScriptLock()
  try {
    lock.waitLock(20000)
  } catch (e) {
    return { error: 'ระบบกำลังยุ่ง มีคนกำลังจองพร้อมกัน กรุณาลองอีกครั้งใน 1-2 วินาที' }
  }

  let bookingId
  let accessToken
  let discountAmount = 0
  try {
    const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]

    // Idempotency. A reply that never reached the browser used to leave the
    // customer with an error and a booking they could not see, so they booked
    // again — and on a single-unit camera the retry was then refused as "full"
    // by their own first booking. Replaying the same key returns the original.
    if (requestKey) {
      const existing = findBookingByRequestKey(sheet, header, requestKey)
      if (existing) {
        return {
          success: true,
          bookingId: existing.bookingId,
          accessToken: existing.accessToken,
          replayed: true,
        }
      }
    }

    // Validate the coupon inside the lock and consume it in the same critical
    // section as the write, so two people cannot both spend a single-use code.
    if (data.discountCode) {
      const validation = validateDiscountCode(data.discountCode)
      if (!validation.valid) {
        return { error: 'โค้ดส่วนลดไม่ถูกต้อง: ' + validation.error }
      }
      discountAmount = Math.floor(quote.price * REVIEW_DISCOUNT_RATE)
    }

    // Validate capacity: count concurrent overlapping bookings/blocks
    // (including admin blocks) against how many physical units this model has.
    // A provincial candidate also needs its own window padded — it independently
    // needs lead time to ship out before pickup and transit time after return,
    // on top of whatever buffer the neighboring booking already carries.
    // Always reads the live sheet (no cache) so the check can't miss a booking
    // that landed a moment earlier.
    const existingSlots = slotsForCamera(data.cameraId, readBookingSlotsAll(null), readBlockedSlotsAll())
    const candidateBuffer = isProvincial ? PROVINCIAL_SHIP_BUFFER_MS : 0
    const newPickup = new Date(pickupDate.getTime() - candidateBuffer)
    const newReturn = new Date(returnDate.getTime() + candidateBuffer)
    const quantity = CAMERA_QUANTITY[data.cameraId] || 1

    const events = []
    for (const slot of existingSlots) {
      const slotPickup = new Date(slot.pickupDatetime)
      const slotReturn = new Date(slot.returnDatetime)
      if (slotPickup < newReturn && slotReturn > newPickup) {
        // A booking always ties up exactly 1 unit; an admin block can cover more
        const w = slot.quantity || 1
        events.push({ t: Math.max(slotPickup.getTime(), newPickup.getTime()), delta: w })
        events.push({ t: Math.min(slotReturn.getTime(), newReturn.getTime()), delta: -w })
      }
    }
    events.sort((a, b) => a.t - b.t || a.delta - b.delta)
    let concurrent = 0
    for (const e of events) {
      concurrent += e.delta
      if (concurrent >= quantity) {
        return { error: 'กล้องรุ่นนี้ถูกจองเต็มจำนวนในช่วงเวลาที่เลือกแล้ว' }
      }
    }

    bookingId = generateBookingId()
    accessToken = generateAccessToken()
    const now = new Date().toISOString()

    // Money is recomputed here, never copied from the request: a client that
    // posts its own price/total could otherwise store any number it liked.
    const totalAmount = quote.price - discountAmount + quote.deliveryFee

    // Write by header NAME, not by position — the live sheet has a stray unnamed
    // column, so a positional appendRow lands every field after it in the wrong
    // place. Map values onto whatever the actual header row says.
    const values = {
      booking_id: bookingId,
      created_at: now,
      camera_id: data.cameraId,
      camera_name: CAMERA_NAMES[data.cameraId] || data.cameraId,
      pickup_datetime: pickupDate.toISOString(),
      return_datetime: returnDate.toISOString(),
      duration_hours: durationHours,
      price: quote.price,
      delivery_fee: quote.deliveryFee,
      total_amount: totalAmount,
      pickup_type: data.pickupType === 'delivery' ? 'delivery' : 'self',
      pickup_address: String(data.pickupAddress || '').trim(),
      return_type: data.returnType === 'delivery' ? 'delivery' : 'self',
      return_address: String(data.returnAddress || '').trim(),
      customer_name: String(data.customerName || '').trim(),
      customer_phone: String(data.customerPhone || '').trim(),
      customer_ig: String(data.customerIG || '').trim(),
      id_card_url: idCardUrl,
      ig_profile_url: igUrl,
      payment_status: 'pending',
      booking_status: 'pending',
      admin_notes: '',
      discount_code: data.discountCode || '',
      discount_amount: discountAmount,
      rental_area: isProvincial ? 'provincial' : 'local',
      shipping_address: String(data.shippingAddress || '').trim(),
      shipping_subdistrict: String(data.shippingSubdistrict || '').trim(),
      shipping_district: String(data.shippingDistrict || '').trim(),
      shipping_province: String(data.shippingProvince || '').trim(),
      shipping_postal_code: String(data.shippingPostalCode || '').trim(),
      returned_at: '',
      access_token: accessToken,
      request_key: requestKey,
    }
    const rowArr = header.map(function (name) {
      return Object.prototype.hasOwnProperty.call(values, name) ? values[name] : ''
    })
    const newRow = sheet.getLastRow() + 1
    sheet.getRange(newRow, 1, 1, rowArr.length).setValues([rowArr])

    // Spend the coupon before the lock frees, so the booking and the code being
    // marked used cannot disagree if this execution dies a moment from now.
    if (data.discountCode && discountAmount > 0) {
      applyDiscountCode(data.discountCode, bookingId)
    }

    SpreadsheetApp.flush() // make sure the row is committed before the lock frees

    // Highlight pending row (booking_status column)
    const statusCol = header.indexOf('booking_status') + 1
    if (statusCol > 0) sheet.getRange(newRow, statusCol).setBackground('#fef3c7')
  } finally {
    lock.releaseLock()
  }

  // LINE notification — outside the lock, network call shouldn't block others
  sendLineNotify(bookingId, data, discountAmount)

  return { success: true, bookingId: bookingId, accessToken: accessToken }
}

// Looks up a previous booking written under the same idempotency key.
function findBookingByRequestKey(sheet, header, requestKey) {
  const iKey = header.indexOf('request_key')
  const iId = header.indexOf('booking_id')
  const iToken = header.indexOf('access_token')
  if (iKey < 0 || sheet.getLastRow() < 2) return null

  const rows = sheet.getRange(2, 1, sheet.getLastRow() - 1, header.length).getValues()
  for (var i = 0; i < rows.length; i++) {
    if (String(rows[i][iKey]) === String(requestKey)) {
      return {
        bookingId: String(rows[i][iId]),
        accessToken: iToken >= 0 ? String(rows[i][iToken] || '') : '',
      }
    }
  }
  return null
}

// Monotonic per-day sequence held in Script Properties, so an ID is never reused
// even if rows are later deleted (getLastRow-based numbering collided in prod).
// Callers hold the script lock, so the read-increment-write here is safe.
// Second leg of a booking: the ID card and IG profile shots, uploaded after the
// row already exists so the customer never waits on Drive. Called by the client
// straight after createBooking returns, and retried by it on failure.
//
// No PIN — the customer has to be able to call this. Two rules keep that safe:
// an empty cell is the only thing this will ever fill (a retry that arrives
// after a successful upload is a no-op, and nobody can swap out an existing
// document), and only a row created in the last half hour is eligible, so a
// leaked booking ID is not a way to attach anything later on.
function attachImages(bookingId, idCardImage, igProfileImage, token) {
  if (!bookingId) return { error: 'Missing bookingId' }

  for (var n = 0, imgs = [idCardImage, igProfileImage]; n < imgs.length; n++) {
    if (imgs[n] && String(imgs[n]).length > MAX_IMAGE_CHARS) return { error: 'ไฟล์รูปใหญ่เกินไป' }
    if (imgs[n] && !/^data:image\/(jpeg|jpg|png|webp);base64,/.test(String(imgs[n]))) {
      return { error: 'ไฟล์ต้องเป็นรูปภาพเท่านั้น' }
    }
  }

  const sheet = getSpreadsheet().getSheetByName('bookings')
  if (!sheet) return { error: 'Sheet not found' }

  const header = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0]
  const idCol = header.indexOf('id_card_url') + 1
  const igCol = header.indexOf('ig_profile_url') + 1
  const createdCol = header.indexOf('created_at') + 1
  const phoneCol = header.indexOf('customer_phone') + 1
  const tokenCol = header.indexOf('access_token') + 1
  if (!idCol || !igCol) return { error: 'Columns missing' }

  const ids = sheet.getRange(2, 1, Math.max(sheet.getLastRow() - 1, 1), 1).getValues()
  let row = 0
  for (let i = 0; i < ids.length; i++) {
    if (String(ids[i][0]) === String(bookingId)) { row = i + 2; break }
  }
  if (!row) return { error: 'Booking not found' }

  // The booking ID alone must not be enough to staple documents onto someone
  // else's rental — the token handed back by createBooking proves the caller is
  // the same person who just made this booking.
  if (tokenCol) {
    const stored = String(sheet.getRange(row, tokenCol).getValue() || '')
    if (!stored || !token || String(token) !== stored) return { error: 'ไม่มีสิทธิ์แนบรูปกับการจองนี้' }
  }

  const createdAt = createdCol ? new Date(sheet.getRange(row, createdCol).getValue()) : null
  if (createdAt && !isNaN(createdAt.getTime())) {
    if (Date.now() - createdAt.getTime() > 30 * 60 * 1000) {
      return { error: 'หมดเวลาแนบรูปแล้ว กรุณาส่งรูปให้ร้านทาง IG' }
    }
  }

  const uploadKey = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd-HHmmss') +
    '-' + String(phoneCol ? sheet.getRange(row, phoneCol).getValue() : '').slice(-4)

  const result = { success: true }
  const legs = [
    { image: idCardImage,     col: idCol, suffix: '_id', key: 'idCardUrl' },
    { image: igProfileImage,  col: igCol, suffix: '_ig', key: 'igProfileUrl' },
  ]
  for (const leg of legs) {
    const cell = sheet.getRange(row, leg.col)
    const existing = String(cell.getValue() || '')
    if (existing) { result[leg.key] = existing; continue }   // already uploaded — retry is a no-op
    if (!leg.image) continue
    const url = uploadImage(leg.image, uploadKey + leg.suffix)
    if (!url) { result[leg.key] = ''; result.partial = true; continue }
    cell.setValue(url)
    result[leg.key] = url
  }
  SpreadsheetApp.flush()

  return result
}

function generateBookingId() {
  const date = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd')
  const props = PropertiesService.getScriptProperties()
  const key = 'seq_' + date

  let current = Number(props.getProperty(key)) || 0
  if (current === 0) {
    // First booking of the day under the new scheme — seed from the highest
    // sequence already on the sheet for today so we never reuse an old ID.
    current = highestSeqForDate('MIW-' + date + '-')
  }

  const next = current + 1
  props.setProperty(key, String(next))
  return 'MIW-' + date + '-' + String(next).padStart(3, '0')
}

function highestSeqForDate(prefix) {
  const sheet = getSpreadsheet().getSheetByName('bookings')
  if (!sheet || sheet.getLastRow() < 2) return 0
  const ids = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues()
  let max = 0
  for (let i = 0; i < ids.length; i++) {
    const id = String(ids[i][0] || '')
    if (id.indexOf(prefix) === 0) {
      const n = parseInt(id.slice(prefix.length), 10)
      if (n > max) max = n
    }
  }
  return max
}

// ── Get booking ──────────────────────────────────────────────

// Booking IDs are sequential and handed out in availability responses, so this
// endpoint used to be a way to walk the whole customer list — phone numbers,
// addresses and the Drive links to their ID cards included. The ID alone now
// buys only the status view; the per-booking token unlocks the customer's own
// details, and contact info and document URLs are admin-only either way.
function getBookingById(id, token) {
  const sheet = getSpreadsheet().getSheetByName('bookings')
  if (!sheet || sheet.getLastRow() < 2) return { booking: null }

  const data = sheet.getDataRange().getValues()
  const headers = data[0]
  const iToken = headers.indexOf('access_token')

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== String(id)) continue

    const stored = iToken >= 0 ? String(data[i][iToken] || '') : ''
    const authorized = Boolean(stored) && Boolean(token) && String(token) === stored
    const allowed = authorized ? CUSTOMER_BOOKING_FIELDS : PUBLIC_BOOKING_FIELDS

    const booking = {}
    headers.forEach(function (h, j) {
      if (allowed.indexOf(h) >= 0) booking[h] = data[i][j]
    })
    return { booking: booking, limited: !authorized }
  }
  return { booking: null }
}

// Rows the sheet already holds that would break availability reads. Admin-only:
// it exists so a bad row can be found and repaired rather than silently skipped.
function getCorruptRows(pin) {
  const authErr = checkPin(pin)
  if (authErr) return authErr

  const sheet = getSpreadsheet().getSheetByName('bookings')
  if (!sheet || sheet.getLastRow() < 2) return { rows: [] }

  const data = sheet.getDataRange().getValues()
  const h = data[0]
  const iId = h.indexOf('booking_id')
  const iPickup = h.indexOf('pickup_datetime')
  const iReturn = h.indexOf('return_datetime')
  const bad = []
  for (let i = 1; i < data.length; i++) {
    if (!data[i][iId]) continue
    const p = new Date(data[i][iPickup])
    const r = new Date(data[i][iReturn])
    if (isNaN(p.getTime()) || isNaN(r.getTime())) {
      bad.push({ row: i + 1, bookingId: String(data[i][iId]),
                 pickup: String(data[i][iPickup]), return: String(data[i][iReturn]) })
    }
  }
  return { rows: bad }
}

// ── Admin ────────────────────────────────────────────────────

function getAdminBookings(pin) {
  const authErr = checkPin(pin)
  if (authErr) return authErr

  const sheet = getSpreadsheet().getSheetByName('bookings')
  if (!sheet || sheet.getLastRow() < 2) return { bookings: [] }

  const data = sheet.getDataRange().getValues()
  const headers = data[0]
  const bookings = []

  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue
    const b = {}
    headers.forEach((h, j) => { b[h] = data[i][j] })
    bookings.push(b)
  }

  return { bookings: bookings.reverse() }
}

// Build one queue row for the LINE bot. Provincial bookings need different
// "action days" than local ones: the shop physically ships the parcel out
// PROVINCIAL_SHIP_LEAD_DAYS before it lands in the customer's hands, so the
// pickup action belongs on that ship-out day, not the delivered-on day. Times
// are meaningless for provincial (the calendar only picks whole days), so they
// come back blank and the formatter omits them.
function buildQueueItem(row, col) {
  const pd = new Date(row[col['pickup_datetime']])
  const rd = new Date(row[col['return_datetime']])
  if (isNaN(pd.getTime()) || isNaN(rd.getTime())) return null

  const isProvincial = col['rental_area'] != null && row[col['rental_area']] === 'provincial'
  const shipOut = isProvincial
    ? new Date(pd.getTime() - PROVINCIAL_SHIP_BUFFER_MS)
    : pd

  const fmtDay = function (d) { return Utilities.formatDate(d, 'Asia/Bangkok', 'yyyy-MM-dd') }
  const fmtTime = function (d) { return Utilities.formatDate(d, 'Asia/Bangkok', 'HH:mm') }

  return {
    bookingId: row[col['booking_id']],
    cameraName: row[col['camera_name']] || row[col['camera_id']],
    rentalArea: isProvincial ? 'provincial' : 'local',
    // pickupDate/pickupTime = the day (and time) the shop must ACT on the pickup:
    // ship-out day for provincial, the booked pickup for local.
    pickupDate: fmtDay(shipOut),
    pickupTime: isProvincial ? '' : fmtTime(pd),
    // when the parcel is due to reach the customer (provincial only, else same)
    deliveredDate: fmtDay(pd),
    returnDate: fmtDay(rd),
    returnTime: isProvincial ? '' : fmtTime(rd),
    customerName: row[col['customer_name']],
    customerPhone: String(row[col['customer_phone']] || ''),
    customerIG: row[col['customer_ig']] || '',
    pickupType: isProvincial ? 'ship' : row[col['pickup_type']],
    returnType: isProvincial ? 'ship' : row[col['return_type']],
    pickupAddress: row[col['pickup_address']] || '',
    returnAddress: row[col['return_address']] || '',
    shippingAddress: col['shipping_address'] != null
      ? [row[col['shipping_address']],
         col['shipping_subdistrict'] != null && row[col['shipping_subdistrict']] ? ('ต.' + row[col['shipping_subdistrict']]) : '',
         row[col['shipping_district']] ? ('อ./เขต ' + row[col['shipping_district']]) : '',
         row[col['shipping_province']] ? ('จ.' + row[col['shipping_province']]) : '',
         row[col['shipping_postal_code']] || '']
        .filter(function (s) { return s }).join(' ')
      : '',
    status: row[col['booking_status']],
  }
}

// คิวของวันหนึ่ง (สำหรับ LINE bot คำสั่ง "วันนี้"/"พรุ่งนี้"/"5/9/26")
// date = 'yyyy-MM-dd' (โซนเวลา Asia/Bangkok)
function getDayQueue(pin, date) {
  const authErr = checkPin(pin)
  if (authErr) return authErr

  const sheet = getSpreadsheet().getSheetByName('bookings')
  if (!sheet || sheet.getLastRow() < 2) return { date: date, pickups: [], returns: [], active: [] }

  const data = sheet.getDataRange().getValues()
  const h = data[0]
  const col = {}
  h.forEach(function (name, i) { col[name] = i })

  const pickups = []
  const returns = []
  const active = []

  for (let i = 1; i < data.length; i++) {
    const row = data[i]
    if (!row[col['booking_id']]) continue
    if (row[col['booking_status']] === 'cancelled') continue

    const item = buildQueueItem(row, col)
    if (!item) continue

    if (item.pickupDate === date) pickups.push(item)
    if (item.returnDate === date) returns.push(item)
    if (item.pickupDate < date && item.returnDate > date) active.push(item)
  }

  pickups.sort(function (a, b) { return a.pickupTime < b.pickupTime ? -1 : 1 })
  returns.sort(function (a, b) { return a.returnTime < b.returnTime ? -1 : 1 })

  return { date: date, pickups: pickups, returns: returns, active: active }
}

// คิวทั้งหมดตั้งแต่วันนี้เป็นต้นไป — จัดกลุ่มตามวัน (สำหรับคำสั่ง "คิวทั้งหมด")
function getUpcomingQueue(pin) {
  const authErr = checkPin(pin)
  if (authErr) return authErr

  const today = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyy-MM-dd')
  const sheet = getSpreadsheet().getSheetByName('bookings')
  if (!sheet || sheet.getLastRow() < 2) return { today: today, days: [] }

  const data = sheet.getDataRange().getValues()
  const h = data[0]
  const col = {}
  h.forEach(function (name, i) { col[name] = i })

  const byDay = {}
  function bucket(d) {
    if (!byDay[d]) byDay[d] = { date: d, pickups: [], returns: [] }
    return byDay[d]
  }

  for (let i = 1; i < data.length; i++) {
    const row = data[i]
    if (!row[col['booking_id']]) continue
    if (row[col['booking_status']] === 'cancelled') continue

    const item = buildQueueItem(row, col)
    if (!item) continue

    if (item.pickupDate >= today) bucket(item.pickupDate).pickups.push(item)
    if (item.returnDate >= today) bucket(item.returnDate).returns.push(item)
  }

  const days = Object.keys(byDay).sort().map(function (k) {
    byDay[k].pickups.sort(function (a, b) { return a.pickupTime < b.pickupTime ? -1 : 1 })
    byDay[k].returns.sort(function (a, b) { return a.returnTime < b.returnTime ? -1 : 1 })
    return byDay[k]
  })
  return { today: today, days: days }
}

// ── LINE reply / push (ใช้ token ที่เก็บใน Script Properties) ──
// Vercel เรียกมา — Vercel ไม่ต้องรู้ token

function lineSend(kind, replyToken, msgs) {
  const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_TOKEN')
  if (!token) return { error: 'no LINE_CHANNEL_TOKEN' }

  const messages = msgs.filter(function (t) { return t }).slice(0, 5).map(function (t) {
    return { type: 'text', text: String(t).slice(0, 4999) }
  })
  if (!messages.length) return { error: 'no text' }

  let endpoint, payload
  if (kind === 'reply') {
    endpoint = 'https://api.line.me/v2/bot/message/reply'
    payload = { replyToken: replyToken, messages: messages }
  } else {
    const userIds = (PropertiesService.getScriptProperties().getProperty('LINE_USER_ID') || '')
      .split(',').map(function (s) { return s.trim() }).filter(function (s) { return s })
    if (!userIds.length) return { error: 'no recipients' }
    if (userIds.length === 1) {
      endpoint = 'https://api.line.me/v2/bot/message/push'
      payload = { to: userIds[0], messages: messages }
    } else {
      endpoint = 'https://api.line.me/v2/bot/message/multicast'
      payload = { to: userIds, messages: messages }
    }
  }

  const res = UrlFetchApp.fetch(endpoint, {
    method: 'post',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    payload: JSON.stringify(payload),
    muteHttpExceptions: true,
  })
  Logger.log('lineSend ' + kind + ' ' + res.getResponseCode() + ': ' + res.getContentText())
  return { ok: res.getResponseCode() === 200, code: res.getResponseCode() }
}

function lineReply(pin, replyToken, text, texts) {
  const authErr = checkPin(pin)
  if (authErr) return authErr
  if (!replyToken) return { error: 'missing replyToken' }
  return lineSend('reply', replyToken, texts && texts.length ? texts : [text])
}

function linePush(pin, text, texts) {
  const authErr = checkPin(pin)
  if (authErr) return authErr
  return lineSend('push', null, texts && texts.length ? texts : [text])
}

// ── แจ้งเตือนคิวพรุ่งนี้อัตโนมัติ ทุกวันเวลา ~16:00 ──────────
// รัน setupSchedule() ครั้งเดียวจาก editor เพื่อสร้าง trigger

var LINE_BOT_BASE = 'https://miwvie-shop.vercel.app'

function pushTomorrow() {
  const pin = getAdminPin()
  if (!pin) { Logger.log('pushTomorrow: ADMIN_PIN not set'); return }
  try {
    const res = UrlFetchApp.fetch(
      LINE_BOT_BASE + '/api/line-webhook?q=' + encodeURIComponent('พรุ่งนี้') + '&pin=' + encodeURIComponent(pin),
      { muteHttpExceptions: true }
    )
    const data = JSON.parse(res.getContentText())
    const texts = (data.texts && data.texts.length) ? data.texts : (data.text ? [data.text] : [])
    if (!texts.length) { Logger.log('pushTomorrow: no texts ' + res.getContentText()); return }
    linePush(pin, null, texts)
  } catch (e) {
    Logger.log('pushTomorrow error: ' + e.message)
  }
}

function setupSchedule() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    if (t.getHandlerFunction() === 'pushTomorrow') ScriptApp.deleteTrigger(t)
  })
  ScriptApp.newTrigger('pushTomorrow').timeBased().everyDays(1).atHour(16).inTimezone('Asia/Bangkok').create()
  return 'ok — pushTomorrow ตั้งเวลาทุกวัน ~16:00 แล้ว'
}

// Morning and evening nudges carrying the ready-made Facebook caption. Meta shut
// the Groups API down in 2024, so nothing can post to a group on the shop's
// behalf; what this can do is remove the writing from the job, leaving a paste.
//
// Both slots go to ONE recipient, not the admin multicast: the free LINE plan
// allows 500 pushes a month and every extra recipient is charged as its own
// message, so two slots a day to two people would eat 120 of them.
function pushPromoMorning() { pushPromo('morning') }
function pushPromoEvening() { pushPromo('evening') }

// Returns what actually happened rather than just logging it, so sendPromoNow
// can report a LINE rejection instead of a bare success.
function pushPromo(slot) {
  try {
    const res = UrlFetchApp.fetch(
      LINE_BOT_BASE + '/api/promo?slot=' + encodeURIComponent(slot),
      { muteHttpExceptions: true }
    )
    if (res.getResponseCode() !== 200) {
      return { error: 'promo endpoint HTTP ' + res.getResponseCode() }
    }
    const data = JSON.parse(res.getContentText())
    const texts = data.texts || []
    if (!texts.length) return { error: 'no texts' }
    const sent = linePushOne(texts)
    Logger.log('pushPromo ' + slot + ' -> ' + JSON.stringify(sent))
    return sent
  } catch (e) {
    Logger.log('pushPromo ' + slot + ' error: ' + e.message)
    return { error: e.message }
  }
}

// Push to the first configured recipient only. LINE bills a multicast per
// person, and the promo nudge only needs to reach whoever does the posting.
function linePushOne(texts) {
  const all = (PropertiesService.getScriptProperties().getProperty('LINE_USER_ID') || '')
    .split(',').map(function (s) { return s.trim() }).filter(function (s) { return s })
  if (!all.length) return { error: 'no recipients' }

  const token = PropertiesService.getScriptProperties().getProperty('LINE_CHANNEL_TOKEN')
  if (!token) return { error: 'no LINE_CHANNEL_TOKEN' }

  const messages = texts.filter(function (t) { return t }).slice(0, 5).map(function (t) {
    return { type: 'text', text: String(t).slice(0, 4999) }
  })
  const res = UrlFetchApp.fetch('https://api.line.me/v2/bot/message/push', {
    method: 'post',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    payload: JSON.stringify({ to: all[0], messages: messages }),
    muteHttpExceptions: true,
  })
  Logger.log('linePushOne ' + res.getResponseCode() + ': ' + res.getContentText())
  return { ok: res.getResponseCode() === 200, code: res.getResponseCode() }
}

// Apps Script fires a time trigger somewhere inside the hour it is given, so
// these land roughly 07:00-08:00 and 18:00-19:00 Bangkok.
function setupPromoSchedule() {
  ScriptApp.getProjectTriggers().forEach(function (t) {
    const h = t.getHandlerFunction()
    if (h === 'pushPromoMorning' || h === 'pushPromoEvening') ScriptApp.deleteTrigger(t)
  })
  ScriptApp.newTrigger('pushPromoMorning').timeBased().everyDays(1).atHour(7).inTimezone('Asia/Bangkok').create()
  ScriptApp.newTrigger('pushPromoEvening').timeBased().everyDays(1).atHour(18).inTimezone('Asia/Bangkok').create()
  return 'ok — ตั้ง pushPromoMorning ~07:00 และ pushPromoEvening ~18:00 แล้ว'
}

// Admin-triggered so the schedule can be (re)installed without opening the
// Apps Script editor.
function installPromoSchedule(pin) {
  const authErr = checkPin(pin)
  if (authErr) return authErr
  return { success: true, message: setupPromoSchedule() }
}

function sendPromoNow(pin, slot) {
  const authErr = checkPin(pin)
  if (authErr) return authErr
  const result = pushPromo(slot === 'evening' ? 'evening' : 'morning')
  if (result && result.error) return { error: result.error }
  return { success: Boolean(result && result.ok), lineStatus: result ? result.code : null }
}

function listTriggers(pin) {
  const authErr = checkPin(pin)
  if (authErr) return authErr
  return {
    triggers: ScriptApp.getProjectTriggers().map(function (t) {
      return { handler: t.getHandlerFunction(), type: String(t.getEventType()) }
    }),
  }
}

function updateBookingStatus(bookingId, status, pin) {
  const authErr = checkPin(pin)
  if (authErr) return authErr

  const sheet = getSpreadsheet().getSheetByName('bookings')
  if (!sheet) return { error: 'Sheet not found' }

  ensureColumns(sheet, BOOKING_HEADERS) // guarantee the returned_at column exists

  const data = sheet.getDataRange().getValues()
  const h = data[0]
  const iId = h.indexOf('booking_id')
  const iStatus = h.indexOf('booking_status')
  const iPayment = h.indexOf('payment_status')
  const iReturnedAt = h.indexOf('returned_at')

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
      // Timestamp the moment the unit is physically back — readBookingSlotsAll
      // uses this to free the queue right away instead of waiting out the buffer.
      if (iReturnedAt >= 0) {
        sheet.getRange(i + 1, iReturnedAt + 1).setValue(new Date().toISOString())
      }
    } else if (iReturnedAt >= 0 && data[i][iReturnedAt]) {
      // Admin walked the status back (e.g. returned → active by mistake): clear
      // the timestamp so the queue doesn't stay free while the unit is still out.
      sheet.getRange(i + 1, iReturnedAt + 1).setValue('')
    }
    SpreadsheetApp.flush()

    // Return the row as saved. The admin UI used to patch only the status in its
    // local state, so returned_at stayed stale and the heatmap kept a returned
    // provincial unit blocked for its full 3-day tail until a manual refresh.
    const saved = sheet.getRange(i + 1, 1, 1, h.length).getValues()[0]
    const booking = {}
    h.forEach(function (name, j) { if (name) booking[name] = saved[j] })
    return { success: true, booking: booking }
  }

  return { error: 'Booking not found' }
}

function deleteBooking(bookingId, pin) {
  const authErr = checkPin(pin)
  if (authErr) return authErr

  const sheet = getSpreadsheet().getSheetByName('bookings')
  if (!sheet) return { error: 'Sheet not found' }

  const data = sheet.getDataRange().getValues()
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(bookingId)) {
      sheet.deleteRow(i + 1)
      return { success: true }
    }
  }

  return { error: 'Booking not found' }
}

function blockDates(cameraId, start, end, reason, pin, requestedQuantity) {
  const authErr = checkPin(pin)
  if (authErr) return authErr

  const sheet = getSpreadsheet().getSheetByName('blocked_slots')
  if (!sheet) return { error: 'Sheet not found' }

  ensureColumns(sheet, BLOCKED_HEADERS)

  // 'ALL' always means "take every unit of every model off the market" —
  // must cover the model with the most units (930 IS has 2) or that model's
  // second unit stays bookable. For a specific model, the admin picks how
  // many of that model's own units this block covers (1..its stock count).
  const quantity = cameraId === 'ALL'
    ? Math.max.apply(null, Object.keys(CAMERA_QUANTITY).map(function (k) { return CAMERA_QUANTITY[k] }))
    : Math.max(1, Math.min(Number(requestedQuantity) || 1, CAMERA_QUANTITY[cameraId] || 1))

  // Same global lock createBooking uses — a block added mid-booking must be
  // visible to that booking's capacity check, not race past it.
  const lock = LockService.getScriptLock()
  try {
    lock.waitLock(20000)
  } catch (e) {
    return { error: 'ระบบกำลังยุ่ง กรุณาลองอีกครั้ง' }
  }
  try {
    const id = 'BLK-' + Date.now()
    sheet.appendRow([id, cameraId, start, end, reason || '', new Date().toISOString(), quantity])
    SpreadsheetApp.flush()
    return { success: true, id }
  } finally {
    lock.releaseLock()
  }
}

// Adds any header names from `headers` that the sheet's row 1 is missing yet,
// appended at the end — safe to run on live sheets created before a column existed.
function ensureColumns(sheet, headers) {
  const lastCol = sheet.getLastColumn()
  const existing = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
  const missing = headers.filter(function (h) { return existing.indexOf(h) === -1 })
  if (missing.length === 0) return
  sheet.getRange(1, lastCol + 1, 1, missing.length).setValues([missing])
}

function listBlockedSlots(pin) {
  const authErr = checkPin(pin)
  if (authErr) return authErr

  const sheet = getSpreadsheet().getSheetByName('blocked_slots')
  if (!sheet || sheet.getLastRow() < 2) return { slots: [] }

  const data = sheet.getDataRange().getValues()
  const headers = data[0]
  const slots = []

  for (let i = 1; i < data.length; i++) {
    if (!data[i][0]) continue
    const s = {}
    headers.forEach((h, j) => { s[h] = data[i][j] })
    slots.push(s)
  }

  return { slots: slots.reverse() }
}

function deleteBlockedSlot(id, pin) {
  const authErr = checkPin(pin)
  if (authErr) return authErr

  const sheet = getSpreadsheet().getSheetByName('blocked_slots')
  if (!sheet) return { error: 'Sheet not found' }

  const data = sheet.getDataRange().getValues()
  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) === String(id)) {
      sheet.deleteRow(i + 1)
      return { success: true }
    }
  }

  return { error: 'Not found' }
}

// ── Discount codes ───────────────────────────────────────────

function generateDiscountCode(bookingId, pin) {
  const authErr = checkPin(pin)
  if (authErr) return authErr

  const ss = getSpreadsheet()
  let sheet = ss.getSheetByName('discount_codes')
  if (!sheet) {
    sheet = ss.insertSheet('discount_codes')
    sheet.getRange(1, 1, 1, DISCOUNT_HEADERS.length).setValues([DISCOUNT_HEADERS])
      .setBackground('#b8860b').setFontColor('#ffffff').setFontWeight('bold')
    sheet.setFrozenRows(1)
  }

  // Return existing active code for this booking
  if (sheet.getLastRow() > 1) {
    const data = sheet.getDataRange().getValues()
    for (let i = 1; i < data.length; i++) {
      if (data[i][1] === bookingId && data[i][5] === 'active') {
        return { code: data[i][0] }
      }
    }
  }

  // Generate new unique code: MIW-XXXXXX
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'
  let code
  do {
    code = 'MIW-'
    for (let i = 0; i < 6; i++) code += chars[Math.floor(Math.random() * chars.length)]
  } while (codeExists(sheet, code))

  sheet.appendRow([code, bookingId, new Date().toISOString(), '', '', 'active'])
  return { code }
}

function codeExists(sheet, code) {
  if (sheet.getLastRow() < 2) return false
  const data = sheet.getDataRange().getValues()
  return data.slice(1).some(row => row[0] === code)
}

function validateDiscountCode(code) {
  if (!code) return { valid: false, error: 'ไม่ได้ระบุโค้ด' }

  const sheet = getSpreadsheet().getSheetByName('discount_codes')
  if (!sheet || sheet.getLastRow() < 2) return { valid: false, error: 'ไม่พบโค้ดนี้' }

  const data = sheet.getDataRange().getValues()
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] !== code) continue
    if (data[i][5] === 'used') return { valid: false, error: 'โค้ดนี้ถูกใช้แล้ว' }
    if (data[i][5] === 'expired') return { valid: false, error: 'โค้ดหมดอายุแล้ว' }
    if (data[i][5] === 'active') return { valid: true, discount: 10 }
  }
  return { valid: false, error: 'ไม่พบโค้ดนี้' }
}

function applyDiscountCode(code, usedByBookingId) {
  const sheet = getSpreadsheet().getSheetByName('discount_codes')
  if (!sheet || sheet.getLastRow() < 2) return false

  const data = sheet.getDataRange().getValues()
  for (let i = 1; i < data.length; i++) {
    if (data[i][0] === code && data[i][5] === 'active') {
      sheet.getRange(i + 1, 4).setValue(usedByBookingId)
      sheet.getRange(i + 1, 5).setValue(new Date().toISOString())
      sheet.getRange(i + 1, 6).setValue('used').setBackground('#d1fae5')
      return true
    }
  }
  return false
}

// ── LINE Messaging API notification ─────────────────────────
// Setup: Script Properties → LINE_CHANNEL_TOKEN + LINE_USER_ID
// Get token: developers.line.biz → your channel → Messaging API → Channel access token
// Get user ID: developers.line.biz → your channel → Basic settings → Your user ID
// LINE_USER_ID supports multiple recipients: comma-separated user IDs

function sendLineNotify(bookingId, data, discountAmount) {
  const props = PropertiesService.getScriptProperties()
  const token = props.getProperty('LINE_CHANNEL_TOKEN')
  const userIds = (props.getProperty('LINE_USER_ID') || '')
    .split(',')
    .map((id) => id.trim())
    .filter((id) => id)
  if (!token || userIds.length === 0) return

  const isProvincial = data.rentalArea === 'provincial'
  const dateFmt = isProvincial ? 'dd/MM/yyyy' : 'dd/MM HH:mm'
  const pickup = Utilities.formatDate(new Date(data.pickupDatetime), 'Asia/Bangkok', dateFmt)
  const ret = Utilities.formatDate(new Date(data.returnDatetime), 'Asia/Bangkok', dateFmt)
  const camName = CAMERA_NAMES[data.cameraId] || data.cameraId
  const discount = discountAmount > 0 ? `\n🏷️ ส่วนลด: -${discountAmount} ฿ (${data.discountCode})` : ''

  let logisticsLines
  if (isProvincial) {
    const noticeDeadline = new Date(new Date(data.returnDatetime).getTime() + 24 * 60 * 60 * 1000)
    const noticeDate = Utilities.formatDate(noticeDeadline, 'Asia/Bangkok', 'dd/MM/yyyy')
    const shipOutBy = new Date(new Date(data.pickupDatetime).getTime() - PROVINCIAL_SHIP_BUFFER_MS)
    const shipOutDate = Utilities.formatDate(shipOutBy, 'Asia/Bangkok', 'dd/MM/yyyy')
    logisticsLines = [
      '🚚 ต่างจังหวัด (ส่งพัสดุ)',
      '📮 ร้านต้องส่งพัสดุภายใน ' + shipOutDate,
      '🏠 ' + (data.shippingAddress || '(ไม่ระบุที่อยู่)') +
        (data.shippingSubdistrict ? ' ต.' + data.shippingSubdistrict : '') +
        ' อ./เขต ' + (data.shippingDistrict || '-') +
        ' จ.' + (data.shippingProvince || '-') +
        ' ' + (data.shippingPostalCode || '-'),
      '⏰ ต้องแจ้งเลขพัสดุคืนในแชทก่อนเที่ยง ' + noticeDate,
    ]
  } else {
    logisticsLines = [
      '🛵 รับ: ' + (data.pickupType === 'delivery'
        ? 'Delivery → ' + (data.pickupAddress || '(ไม่ระบุที่อยู่)')
        : 'รับเอง'),
      '📦 คืน: ' + (data.returnType === 'delivery'
        ? 'Delivery → ' + (data.returnAddress || '(ไม่ระบุที่อยู่)')
        : 'คืนเอง'),
    ]
  }

  const msg = [
    '📸 จองใหม่! ' + bookingId,
    '📷 ' + camName,
    isProvincial
      ? '📅 พัสดุถึงมือลูกค้า: ' + pickup + ' → ส่งคืน: ' + ret + ' (ก่อน 12:00 น.)'
      : '📅 รับ: ' + pickup + ' → คืน: ' + ret,
    '👤 ' + data.customerName + ' | ' + data.customerPhone +
      (data.customerIG ? ' | IG/LINE: ' + data.customerIG : ''),
    '💰 ' + data.totalAmount + ' ฿' + discount,
  ].concat(logisticsLines).join('\n')

  // Single recipient uses push; 2+ recipients use multicast
  const endpoint = userIds.length === 1
    ? 'https://api.line.me/v2/bot/message/push'
    : 'https://api.line.me/v2/bot/message/multicast'
  const payload = userIds.length === 1
    ? { to: userIds[0], messages: [{ type: 'text', text: msg }] }
    : { to: userIds, messages: [{ type: 'text', text: msg }] }

  try {
    const res = UrlFetchApp.fetch(endpoint, {
      method: 'post',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': 'Bearer ' + token,
      },
      payload: JSON.stringify(payload),
      muteHttpExceptions: true,
    })
    Logger.log('LINE notify response ' + res.getResponseCode() + ': ' + res.getContentText())
  } catch (e) {
    Logger.log('LINE notify error: ' + e.message)
  }
}

// ── Image upload ─────────────────────────────────────────────

function uploadImage(base64Data, filename) {
  try {
    const match = base64Data.match(/^data:([^;]+);base64,(.+)$/)
    if (!match) return ''

    const mimeType = match[1]
    const bytes = Utilities.base64Decode(match[2])
    const blob = Utilities.newBlob(bytes, mimeType, filename)

    const folderId = PropertiesService.getScriptProperties().getProperty('DRIVE_FOLDER_ID')
    const folder = folderId ? DriveApp.getFolderById(folderId) : DriveApp.getRootFolder()
    const file = folder.createFile(blob)
    // Private, not ANYONE_WITH_LINK: these are photographs of national ID cards.
    // The shop account owns the folder, so the admin still opens them while
    // signed in to that Google account; nobody holding the bare URL can.
    file.setSharing(DriveApp.Access.PRIVATE, DriveApp.Permission.VIEW)

    return 'https://drive.google.com/file/d/' + file.getId() + '/view'
  } catch (e) {
    Logger.log('Upload error: ' + e.message)
    return ''
  }
}

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
]

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

function getAdminPin() {
  return PropertiesService.getScriptProperties().getProperty('ADMIN_PIN') || '1234'
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
    case 'getBooking':         return getBookingById(p.id)
    case 'validateDiscountCode': return validateDiscountCode(p.code)
    default: return { error: 'Unknown action: ' + p.action }
  }
}

// ── POST handlers ───────────────────────────────────────────

function handlePost(body) {
  switch (body.action) {
    case 'createBooking':        return createBooking(body)
    case 'getAdminBookings':     return getAdminBookings(body.pin)
    case 'updateBookingStatus':  return updateBookingStatus(body.bookingId, body.status, body.pin)
    case 'deleteBooking':        return deleteBooking(body.bookingId, body.pin)
    case 'blockDates':           return blockDates(body.cameraId, body.start, body.end, body.reason, body.pin, body.quantity)
    case 'listBlockedSlots':     return listBlockedSlots(body.pin)
    case 'deleteBlockedSlot':    return deleteBlockedSlot(body.id, body.pin)
    case 'generateDiscountCode': return generateDiscountCode(body.bookingId, body.pin)
    case 'getDayQueue':          return getDayQueue(body.pin, body.date)
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

  const [mYear, mMonth] = month ? month.split('-').map(Number) : [0, 0]
  const monthStart = mYear ? new Date(mYear, mMonth - 1, 1) : null
  const monthEnd = mYear ? new Date(mYear, mMonth, 1) : null

  for (let i = 1; i < data.length; i++) {
    const row = data[i]
    if (!row[iId]) continue
    if (row[iStatus] === 'cancelled') continue

    // Buffer pads both sides so the 1hr gap holds regardless of which booking
    // was created first — only affects availability checks, not the stored times
    const pickup = new Date(new Date(row[iPickup]).getTime() - BATTERY_CHARGE_BUFFER_MS)
    const ret = new Date(new Date(row[iReturn]).getTime() + BATTERY_CHARGE_BUFFER_MS)

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
      bookingId: 'blocked',
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
        .map((s) => Object.assign({}, s, { cameraId }))
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

function createBooking(data) {
  const ss = getSpreadsheet()
  const sheet = ss.getSheetByName('bookings')
  if (!sheet) return { error: 'Run setup first via ?action=setup' }

  // Validate capacity: count concurrent overlapping bookings/blocks
  // (including admin blocks) against how many physical units this model has
  const existing = getAvailability(data.cameraId, null).slots
  const newPickup = new Date(data.pickupDatetime)
  const newReturn = new Date(data.returnDatetime)
  const quantity = CAMERA_QUANTITY[data.cameraId] || 1

  const events = []
  for (const slot of existing) {
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

  // Validate discount code if provided
  let discountAmount = 0
  if (data.discountCode) {
    const validation = validateDiscountCode(data.discountCode)
    if (!validation.valid) {
      return { error: 'โค้ดส่วนลดไม่ถูกต้อง: ' + validation.error }
    }
    discountAmount = data.discountAmount || 0
  }

  const bookingId = generateBookingId(sheet)
  const now = new Date().toISOString()

  const idCardUrl = data.idCardImage ? uploadImage(data.idCardImage, bookingId + '_id') : ''
  const igUrl = data.igProfileImage ? uploadImage(data.igProfileImage, bookingId + '_ig') : ''

  sheet.appendRow([
    bookingId, now,
    data.cameraId, CAMERA_NAMES[data.cameraId] || data.cameraId,
    data.pickupDatetime, data.returnDatetime, data.durationHours,
    data.price, data.deliveryFee, data.totalAmount,
    data.pickupType, data.pickupAddress || '',
    data.returnType, data.returnAddress || '',
    data.customerName, data.customerPhone, data.customerIG || '',
    idCardUrl, igUrl,
    'pending', 'pending', '',
    data.discountCode || '', discountAmount,
  ])

  // Mark discount code as used
  if (data.discountCode && discountAmount > 0) {
    applyDiscountCode(data.discountCode, bookingId)
  }

  // Highlight pending row
  const lastRow = sheet.getLastRow()
  sheet.getRange(lastRow, 21).setBackground('#fef3c7')

  // LINE notification
  sendLineNotify(bookingId, data, discountAmount)

  return { success: true, bookingId }
}

function generateBookingId(sheet) {
  const date = Utilities.formatDate(new Date(), 'Asia/Bangkok', 'yyyyMMdd')
  const seq = String(sheet.getLastRow()).padStart(3, '0')
  return 'MIW-' + date + '-' + seq
}

// ── Get booking ──────────────────────────────────────────────

function getBookingById(id) {
  const sheet = getSpreadsheet().getSheetByName('bookings')
  if (!sheet || sheet.getLastRow() < 2) return { booking: null }

  const data = sheet.getDataRange().getValues()
  const headers = data[0]

  for (let i = 1; i < data.length; i++) {
    if (String(data[i][0]) !== String(id)) continue
    const booking = {}
    headers.forEach((h, j) => { booking[h] = data[i][j] })
    return { booking }
  }
  return { booking: null }
}

// ── Admin ────────────────────────────────────────────────────

function getAdminBookings(pin) {
  if (pin !== getAdminPin()) return { error: 'Invalid PIN' }

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

// คิวของวันหนึ่ง (สำหรับ LINE bot คำสั่ง "วันนี้"/"พรุ่งนี้"/"5/9/26")
// date = 'yyyy-MM-dd' (โซนเวลา Asia/Bangkok)
function getDayQueue(pin, date) {
  if (pin !== getAdminPin()) return { error: 'Invalid PIN' }

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

    const pd = new Date(row[col['pickup_datetime']])
    const rd = new Date(row[col['return_datetime']])
    if (isNaN(pd.getTime()) || isNaN(rd.getTime())) continue

    const pDay = Utilities.formatDate(pd, 'Asia/Bangkok', 'yyyy-MM-dd')
    const rDay = Utilities.formatDate(rd, 'Asia/Bangkok', 'yyyy-MM-dd')

    const item = {
      bookingId: row[col['booking_id']],
      cameraName: row[col['camera_name']] || row[col['camera_id']],
      pickupTime: Utilities.formatDate(pd, 'Asia/Bangkok', 'HH:mm'),
      returnTime: Utilities.formatDate(rd, 'Asia/Bangkok', 'HH:mm'),
      pickupDate: pDay,
      returnDate: rDay,
      customerName: row[col['customer_name']],
      customerPhone: String(row[col['customer_phone']]),
      customerIG: row[col['customer_ig']] || '',
      pickupType: row[col['pickup_type']],
      returnType: row[col['return_type']],
      pickupAddress: row[col['pickup_address']] || '',
      returnAddress: row[col['return_address']] || '',
      status: row[col['booking_status']],
    }

    if (pDay === date) pickups.push(item)
    if (rDay === date) returns.push(item)
    if (pDay < date && rDay > date) active.push(item)
  }

  pickups.sort(function (a, b) { return a.pickupTime < b.pickupTime ? -1 : 1 })
  returns.sort(function (a, b) { return a.returnTime < b.returnTime ? -1 : 1 })

  return { date: date, pickups: pickups, returns: returns, active: active }
}

function updateBookingStatus(bookingId, status, pin) {
  if (pin !== getAdminPin()) return { error: 'Invalid PIN' }

  const sheet = getSpreadsheet().getSheetByName('bookings')
  if (!sheet) return { error: 'Sheet not found' }

  const data = sheet.getDataRange().getValues()
  const h = data[0]
  const iId = h.indexOf('booking_id')
  const iStatus = h.indexOf('booking_status')
  const iPayment = h.indexOf('payment_status')

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
    }
    return { success: true }
  }

  return { error: 'Booking not found' }
}

function deleteBooking(bookingId, pin) {
  if (pin !== getAdminPin()) return { error: 'Invalid PIN' }

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
  if (pin !== getAdminPin()) return { error: 'Invalid PIN' }

  const sheet = getSpreadsheet().getSheetByName('blocked_slots')
  if (!sheet) return { error: 'Sheet not found' }

  ensureBlockedQuantityColumn(sheet)

  // 'ALL' always means "take every unit of every model off the market" —
  // must cover the model with the most units (930 IS has 2) or that model's
  // second unit stays bookable. For a specific model, the admin picks how
  // many of that model's own units this block covers (1..its stock count).
  const quantity = cameraId === 'ALL'
    ? Math.max.apply(null, Object.keys(CAMERA_QUANTITY).map(function (k) { return CAMERA_QUANTITY[k] }))
    : Math.max(1, Math.min(Number(requestedQuantity) || 1, CAMERA_QUANTITY[cameraId] || 1))

  const id = 'BLK-' + Date.now()
  sheet.appendRow([id, cameraId, start, end, reason || '', new Date().toISOString(), quantity])
  return { success: true, id }
}

function ensureBlockedQuantityColumn(sheet) {
  const lastCol = sheet.getLastColumn()
  const headers = sheet.getRange(1, 1, 1, lastCol).getValues()[0]
  if (headers.indexOf('quantity') === -1) {
    sheet.getRange(1, lastCol + 1).setValue('quantity')
  }
}

function listBlockedSlots(pin) {
  if (pin !== getAdminPin()) return { error: 'Invalid PIN' }

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
  if (pin !== getAdminPin()) return { error: 'Invalid PIN' }

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
  if (pin !== getAdminPin()) return { error: 'Invalid PIN' }

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

  const pickup = Utilities.formatDate(new Date(data.pickupDatetime), 'Asia/Bangkok', 'dd/MM HH:mm')
  const ret = Utilities.formatDate(new Date(data.returnDatetime), 'Asia/Bangkok', 'dd/MM HH:mm')
  const camName = CAMERA_NAMES[data.cameraId] || data.cameraId
  const discount = discountAmount > 0 ? `\n🏷️ ส่วนลด: -${discountAmount} ฿ (${data.discountCode})` : ''

  const pickupLine = '🛵 รับ: ' + (data.pickupType === 'delivery'
    ? 'Delivery → ' + (data.pickupAddress || '(ไม่ระบุที่อยู่)')
    : 'รับเอง')
  const returnLine = '📦 คืน: ' + (data.returnType === 'delivery'
    ? 'Delivery → ' + (data.returnAddress || '(ไม่ระบุที่อยู่)')
    : 'คืนเอง')

  const msg = [
    '📸 จองใหม่! ' + bookingId,
    '📷 ' + camName,
    '📅 รับ: ' + pickup + ' → คืน: ' + ret,
    '👤 ' + data.customerName + ' | ' + data.customerPhone +
      (data.customerIG ? ' | IG/LINE: ' + data.customerIG : ''),
    '💰 ' + data.totalAmount + ' ฿' + discount,
    pickupLine,
    returnLine,
  ].join('\n')

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
    file.setSharing(DriveApp.Access.ANYONE_WITH_LINK, DriveApp.Permission.VIEW)

    return 'https://drive.google.com/file/d/' + file.getId() + '/view'
  } catch (e) {
    Logger.log('Upload error: ' + e.message)
    return ''
  }
}

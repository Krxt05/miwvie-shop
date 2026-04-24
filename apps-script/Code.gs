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
  'payment_status', 'booking_status', 'admin_notes'
]

const BLOCKED_HEADERS = ['id', 'camera_id', 'start_datetime', 'end_datetime', 'reason', 'created_at']

const CAMERA_NAMES = {
  IXY10s: 'Canon IXY 10s',
  IXY30s: 'Canon IXY 30s',
  IXY930IS: 'Canon IXY 930 IS',
  IXY910IS: 'Canon IXY 910 IS',
  IXY200: 'Canon IXY 200 (IXUS 185)'
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
  // Create new spreadsheet on first run
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
    case 'setup':             return setupSheets()
    case 'getAvailability':   return getAvailability(p.camera, p.month)
    case 'getAllAvailability': return getAllAvailability(p.month)
    case 'getBooking':        return getBookingById(p.id)
    default: return { error: 'Unknown action: ' + p.action }
  }
}

// ── POST handlers ───────────────────────────────────────────

function handlePost(body) {
  switch (body.action) {
    case 'createBooking':       return createBooking(body)
    case 'getAdminBookings':    return getAdminBookings(body.pin)
    case 'updateBookingStatus': return updateBookingStatus(body.bookingId, body.status, body.pin)
    case 'blockDates':          return blockDates(body.cameraId, body.start, body.end, body.reason, body.pin)
    default: return { error: 'Unknown action: ' + body.action }
  }
}

// ── Setup ───────────────────────────────────────────────────

function setupSheets() {
  const ss = getSpreadsheet()

  if (!ss.getSheetByName('bookings')) {
    const s = ss.insertSheet('bookings')
    s.getRange(1, 1, 1, BOOKING_HEADERS.length).setValues([BOOKING_HEADERS])
      .setBackground('#ff2d78').setFontColor('#ffffff').setFontWeight('bold')
    s.setFrozenRows(1)
    s.setColumnWidth(1, 160)
    s.setColumnWidth(5, 180)
    s.setColumnWidth(6, 180)
    // Remove default "Sheet1"
    const sheet1 = ss.getSheetByName('Sheet1')
    if (sheet1) ss.deleteSheet(sheet1)
  }

  if (!ss.getSheetByName('blocked_slots')) {
    const s = ss.insertSheet('blocked_slots')
    s.getRange(1, 1, 1, BLOCKED_HEADERS.length).setValues([BLOCKED_HEADERS])
      .setBackground('#374151').setFontColor('#ffffff').setFontWeight('bold')
    s.setFrozenRows(1)
  }

  // Create Drive folder for documents
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

function getAvailability(cameraId, month) {
  const ss = getSpreadsheet()
  const sheet = ss.getSheetByName('bookings')
  const blocked = ss.getSheetByName('blocked_slots')
  const slots = []

  if (sheet && sheet.getLastRow() > 1) {
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
      if (row[iCamera] !== cameraId) continue
      if (row[iStatus] === 'cancelled') continue

      const pickup = new Date(row[iPickup])
      const ret = new Date(row[iReturn])

      if (monthStart && (ret <= monthStart || pickup >= monthEnd)) continue

      slots.push({
        cameraId,
        pickupDatetime: pickup.toISOString(),
        returnDatetime: ret.toISOString(),
        bookingId: row[iId]
      })
    }
  }

  // Add blocked slots
  if (blocked && blocked.getLastRow() > 1) {
    const bData = blocked.getDataRange().getValues()
    const bh = bData[0]
    const biCamera = bh.indexOf('camera_id')
    const biStart = bh.indexOf('start_datetime')
    const biEnd = bh.indexOf('end_datetime')

    for (let i = 1; i < bData.length; i++) {
      const row = bData[i]
      if (!row[0]) continue
      if (row[biCamera] !== cameraId && row[biCamera] !== 'ALL') continue
      slots.push({
        cameraId,
        pickupDatetime: new Date(row[biStart]).toISOString(),
        returnDatetime: new Date(row[biEnd]).toISOString(),
        bookingId: 'blocked'
      })
    }
  }

  return { slots }
}

function getAllAvailability(month) {
  const cameras = {}
  Object.keys(CAMERA_NAMES).forEach(id => {
    cameras[id] = getAvailability(id, month).slots
  })
  return { cameras }
}

// ── Create booking ───────────────────────────────────────────

function createBooking(data) {
  const ss = getSpreadsheet()
  const sheet = ss.getSheetByName('bookings')
  if (!sheet) return { error: 'Run setup first via ?action=setup' }

  // Validate no conflict
  const existing = getAvailability(data.cameraId, null).slots
  const newPickup = new Date(data.pickupDatetime)
  const newReturn = new Date(data.returnDatetime)
  for (const slot of existing) {
    if (slot.bookingId === 'blocked') continue
    const slotPickup = new Date(slot.pickupDatetime)
    const slotReturn = new Date(slot.returnDatetime)
    if (newPickup < slotReturn && newReturn > slotPickup) {
      return { error: 'กล้องรุ่นนี้ถูกจองในช่วงเวลาที่เลือกแล้ว' }
    }
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
    'pending', 'pending', ''
  ])

  // Highlight pending payment row
  const lastRow = sheet.getLastRow()
  sheet.getRange(lastRow, 21).setBackground('#fef3c7')

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
    return { success: true }
  }

  return { error: 'Booking not found' }
}

function blockDates(cameraId, start, end, reason, pin) {
  if (pin !== getAdminPin()) return { error: 'Invalid PIN' }

  const sheet = getSpreadsheet().getSheetByName('blocked_slots')
  if (!sheet) return { error: 'Sheet not found' }

  const id = 'BLK-' + Date.now()
  sheet.appendRow([id, cameraId, start, end, reason || '', new Date().toISOString()])
  return { success: true, id }
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

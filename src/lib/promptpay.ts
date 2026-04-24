'use client'

function crc16(str: string): string {
  let crc = 0xffff
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i) << 8
    for (let j = 0; j < 8; j++) {
      crc = crc & 0x8000 ? (crc << 1) ^ 0x1021 : crc << 1
      crc &= 0xffff
    }
  }
  return crc.toString(16).toUpperCase().padStart(4, '0')
}

function tlv(tag: string, value: string): string {
  return tag + String(value.length).padStart(2, '0') + value
}

export function generatePromptPayPayload(phone: string, amount: number): string {
  const normalized = '0066' + phone.replace(/\D/g, '').replace(/^0/, '')
  const accountInfo = tlv('00', 'A000000677010111') + tlv('01', normalized)
  const merchantInfo = tlv('29', accountInfo)
  const amountStr = tlv('54', amount.toFixed(2))
  const payload =
    tlv('00', '01') +
    tlv('01', '12') +
    merchantInfo +
    tlv('53', '764') +
    amountStr +
    tlv('58', 'TH') +
    '6304'
  return payload + crc16(payload)
}

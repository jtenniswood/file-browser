import { Buffer } from 'node:buffer'
import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto'

const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'

export function newSecret() {
	let secret = ''
	for (let bits = 0, value = 0, i = 0, bytes = randomBytes(20); i < bytes.length; i++) {
		value = (value << 8) | bytes[i]
		bits += 8
		while (bits >= 5) {
			bits -= 5
			secret += alphabet[(value >>> bits) & 31]
		}
	}
	return secret
}

function decodeSecret(secret) {
	const bytes = []
	let bits = 0
	let value = 0
	for (const char of secret) {
		value = (value << 5) | alphabet.indexOf(char)
		bits += 5
		if (bits >= 8) {
			bits -= 8
			bytes.push((value >>> bits) & 255)
		}
	}
	return Buffer.from(bytes)
}

export function acceptedStep(secret, code, lastStep = -1, now = Date.now()) {
	if (typeof code !== 'string' || !/^\d{6}$/.test(code))
		return null
	const key = decodeSecret(secret)
	const supplied = Buffer.from(code)
	const current = Math.floor(now / 30_000)
	for (const step of [current, current - 1, current + 1]) {
		if (step < 0 || step <= lastStep)
			continue
		const counter = Buffer.alloc(8)
		counter.writeBigUInt64BE(BigInt(step))
		const digest = createHmac('sha1', key).update(counter).digest()
		const offset = digest.at(-1) & 15
		const value = (digest.readUInt32BE(offset) & 0x7FFFFFFF) % 1_000_000
		if (timingSafeEqual(supplied, Buffer.from(String(value).padStart(6, '0'))))
			return step
	}
	return null
}

import base58 = require('bs58')
import { Serialize } from 'eosjs'
import { PublicKey } from 'eosjs/dist/PublicKey'

export class Symbol {
  constructor(public name: string, public precision: number) {}
  toString() {
    return `${String(this.precision)},${this.name}`
  }
}

export class Asset {
  constructor(public amount: number, public symbol: Symbol) {}

  toString() {
    const withZeros = String(this.amount).padStart(this.symbol.precision, '0')
    const dotPos = withZeros.length - this.symbol.precision
    if (dotPos == withZeros.length) {
      return `${String(Math.round(this.amount))} ${this.symbol.name}`
    } else if (dotPos == 0) {
      return `0.${withZeros} ${this.symbol.name}`
    } else {
      return `${withZeros.substring(0, dotPos)}.${withZeros.substring(dotPos)} ${this.symbol.name}`
    }
  }
}

export function toUInt32ToBase58(n: number) {
  return base58.encode(numberToUInt32(n).reverse())
}

export function numberToUInt32(num: number) {
  const arr = new ArrayBuffer(4)
  const view = new DataView(arr)
  view.setUint32(0, num)
  return new Uint8Array(arr)
}

export function numberToUInt64(big_num: bigint) {
  const arr = new ArrayBuffer(8)
  const view = new DataView(arr)
  view.setBigUint64(0, big_num)
  return new Uint8Array(arr)
}

/**
 * Convert an Antelope name to a big integer
 * @param name Antelope name
 * @returns The number corresponding to the name
 */
export function nameToUint64(name: string) {
  const buffer = new Serialize.SerialBuffer()
  buffer.pushName(name)
  return Buffer.from(buffer.asUint8Array()).readBigUInt64BE()
}

/**
 * Convert an Antelope name to a hex string
 * @param name Antelope name
 * @returns The hex as string corresponding to the name
 */
export function nameToFromHex(name: string) {
  return nameToUint64(name).toString(16).padStart(16, '0')
}

export const stringToAsset = (asset_str: string): Asset => {
  if (typeof asset_str != 'string') {
    throw `Asset string is not defined`
  }
  let s = asset_str.indexOf('.')
  if (s == -1) {
    throw `Missing precision of asset string: ${asset_str}`
  }
  let e = asset_str.indexOf(' ', s)
  if (e == -1) {
    throw `Missing symbol of asset string: ${asset_str}`
  }
  let precision = e - s - 1
  let name = asset_str.substring(e + 1).trim()
  let amount = Number(BigInt(asset_str.substring(0, s) + asset_str.substring(s + 1, e)))
  return new Asset(amount, new Symbol(name, precision))
}

export function hexWithTypeOfPubKey(pubkey: PublicKey) {
  const hexType = pubkey.getType().toString(16).padStart(2, '0')
  const hexKey = pubkey.toElliptic().getPublic(true, 'hex')
  return hexKey + hexType
}

export function splitPubKeyToScopeAndTableVec(pubkey: PublicKey) {
  const hex = pubkey.toElliptic().getPublic(true, 'hex')
  const array = pubkey.toElliptic().getPublic(true, 'array')
  let scopeHex = '0x'
  for (let i = array.length - 1; i >= array.length - 8; i--) {
    scopeHex += array[i].toString(16).padStart(2, '0')
  }
  const scope = BigInt(scopeHex)
  const typehex = pubkey.getType().toString(16).padStart(2, '0')
  return { scope, tableVec: hex.substring(0, hex.length - 16) + typehex }
}

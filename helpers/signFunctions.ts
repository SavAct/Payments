import { ecc } from 'eosjs/dist/eosjs-ecc-migration'
import { Symbol } from './conversions'

/**
 * Get the signature to reject a payment
 *
 * @param privateKey Key which signs the message
 * @param chainId Id of the chain where the contarct is deployed to
 * @param contract_name Contract name
 * @param from Account name or public key in hex format
 * @param id Payment id
 * @param sigtime Current unix time of the signing
 * @returns
 */
export function signReject(privateKey: string, chainId: string, contract_name: string, from: string, id: string, sigtime: string) {
  const raw = `${chainId} ${contract_name} reject ${from} ${id} ${sigtime}`
  return { raw: raw, sig: ecc.sign(raw, privateKey) }
}

/**
 * Get the signature to extend a payment
 *
 * @param privateKey Key which signs the message
 * @param chainId Id of the chain where the contarct is deployed to
 * @param contract_name Contract name
 * @param time New time limit
 * @param to_hex Public key of the origin recipient in hex format
 * @param id Payment id
 * @param sigtime Current unix time of the signing
 * @returns
 */
export function signExtend(privateKey: string, chainId: string, contract_name: string, time: string, to_hex: string, id: string, sigtime: string) {
  const raw = `${chainId} ${contract_name} extend ${time} ${to_hex} ${id} ${sigtime}`
  return { raw: raw, sig: ecc.sign(raw, privateKey) }
}

/**
 * Get the signature to finalize a payment
 *
 * @param privateKey Key which signs the message
 * @param chainId Id of the chain where the contarct is deployed to
 * @param contract_name Contract name
 * @param to Account name or public key in hex format
 * @param id Payment id
 * @param sigtime Current unix time of the signing
 * @returns
 */
export function signFinalize(privateKey: string, chainId: string, contract_name: string, to: string, id: string, sigtime: string) {
  const raw = `${chainId} ${contract_name} finalize ${to} ${id} ${sigtime}`
  return { raw: raw, sig: ecc.sign(raw, privateKey) }
}

/**
 * Get the signature to invalidate a payment
 *
 * @param privateKey Key which signs the message
 * @param chainId Id of the chain where the contarct is deployed to
 * @param contract_name Contract name
 * @param to Account name or public key in hex format
 * @param id Payment id
 * @param sigtime Current unix time of the signing
 * @returns
 */
export function signInvalidate(privateKey: string, chainId: string, contract_name: string, to: string, id: string, sigtime: string) {
  const raw = `${chainId} ${contract_name} invalidate ${to} ${id} ${sigtime}`
  return { raw: raw, sig: ecc.sign(raw, privateKey) }
}

/**
 * Get the signature to payoff a payment
 *
 * @param privateKey Key which signs the message
 * @param chainId Id of the chain where the contarct is deployed to
 * @param contract_name Contract name
 * @param to Account name or public key in hex format
 * @param id Payment id
 * @param sigtime Current unix time of the signing
 * @returns
 */
export function signPayOff(privateKey: string, chainId: string, contract_name: string, to: string, recipient: string, id: string, sigtime: string) {
  const raw = `${chainId} ${contract_name} payoff ${to} ${recipient} ${id} ${sigtime}`
  return { raw: raw, sig: ecc.sign(raw, privateKey) }
}

/**
 * Get the signature to payoff all payments
 *
 * @param privateKey Key which signs the message
 * @param chainId Id of the chain where the contarct is deployed to
 * @param contract_name Contract name
 * @param token_contract_name Token contract name
 * @param token_symbol Symbol name of the token
 * @param recipient_name Account name of the recipient
 * @param memo Memo which will be used for the payment to the recipient
 * @param sigtime Current unix time of the signing
 * @returns
 */
export function signPayOffAll(privateKey: string, chainId: string, contract_name: string, token_contract_name: string, token_symbol: Symbol, recipient_name: string, memo: string, sigtime: string) {
  const raw = `${chainId} ${contract_name} payoff all ${token_contract_name} ${token_symbol.toString()} ${recipient_name} ${memo} ${sigtime}`
  return { raw: raw, sig: ecc.sign(raw, privateKey) }
}

/**
 * Get the signature to payoff all system tokens to a new account
 *
 * @param privateKey Key which signs the message
 * @param chainId Id of the chain where the contarct is deployed to
 * @param contract_name Contract name
 * @param pup_key_new_acc Public key of the new account in hex format
 * @param new_account Account name of the new account which will be created receives all payments
 * @param sigtime Current unix time of the signing
 * @returns
 */
export function signPayOffNewAcc(privateKey: string, chainId: string, contract_name: string, pup_key_new_acc: string, new_account: string, sigtime: string) {
  const raw = `${chainId} ${contract_name} payoff new acc ${pup_key_new_acc} ${new_account} ${sigtime}`
  return { raw: raw, sig: ecc.sign(raw, privateKey) }
}

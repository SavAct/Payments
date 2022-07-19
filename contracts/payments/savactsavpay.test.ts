/*  Attention: Even by setting skipSystemContracts to false, the test network seems not to provide all eosio.system actions like buyrambytes().
 *  Change "eosio" to "systemdummy" in eosioHandler.hpp to get around this provisionally and execute this test.
 *  Do not forget to set it back for production!
 */

import { ContractDeployer, assertRowsEqual, AccountManager, Account, Contract, assertEOSErrorIncludesMessage, assertMissingAuthority, EOSManager, debugPromise, assertRowsEqualStrict, assertRowCount, assertEOSException, assertEOSError, UpdateAuth, assertRowsContain, ContractLoader } from 'lamington'
import * as chai from 'chai'
import { Savactsavpay } from './savactsavpay'
import { EosioToken } from '../eosio.token/eosio.token'
import { Systemdummy } from '../systemdummy/systemdummy'
import base58 = require('bs58')
import { Serialize } from 'eosjs'

let contract: Savactsavpay
let sender1: Account, sender2: Account, sender3: Account
let nirvana: Account

class Symbol {
  constructor(public name: string, public precision: number) {}
  toString() {
    return `${String(this.precision)},${this.name}`
  }
}

class Asset {
  constructor(public amount: number, public symbol: Symbol) {}

  toString() {
    const withZeros = String(this.amount).padStart(this.symbol.precision, '0')
    const dotPos = withZeros.length - this.symbol.precision
    if (dotPos == withZeros.length) {
      return `${String(Math.round(this.amount))} ${this.symbol.name}`
    } else if (dotPos == 0) {
      return `0.${String(Math.round(this.amount))} ${this.symbol.name}`
    } else {
      return `${withZeros.substring(0, dotPos)}.${withZeros.substring(dotPos)} ${this.symbol.name}`
    }
  }

  static From(assetStr: string) {}
}

interface Token {
  contract: EosioToken
  symbol: Symbol
}

const savpay_contract_name = 'savactsavpay'
const nirvana_name = 'stake.savact'
const sys_token_acc_name = 'eosio.token'
const sys_token_symbol = new Symbol('EOS', 4)
let sys_token: Token
let custom_token: Token
let sys_token_acc: Account

describe('SavAct SavPay', () => {
  before(async () => {
    EOSManager.initWithDefaults()

    // Deploy and initialize system dummy contract
    const sys_contract = await ContractDeployer.deployWithName<Systemdummy>('contracts/systemdummy/systemdummy', 'systemdummy')
    sys_contract.setramstate('10000000000.0000 RAMCORE', '234396016922 RAM', '6016100.1948 EOS')

    // Create accounts
    nirvana = await AccountManager.createAccount(nirvana_name)
    sender1 = await AccountManager.createAccount('sender1')
    sender2 = await AccountManager.createAccount('sender2')

    // Issue system tokens
    sys_token_acc = new Account(sys_token_acc_name, EOSManager.adminAccount.privateKey, EOSManager.adminAccount.publicKey)
    sys_token = {
      contract: await ContractLoader.at<EosioToken>(sys_token_acc),
      symbol: sys_token_symbol,
    }
    await issueToken(sys_token, [sender1, sender2], 10000000, EOSManager.adminAccount)

    // Deploy, initialize and issue a custom token
    custom_token = {
      contract: await ContractDeployer.deployWithName<EosioToken>('contracts/eosio.token/eosio.token', 'fiat.token'),
      symbol: new Symbol('FIAT', 2),
    }
    await initToken(custom_token)
    await issueToken(custom_token, [sender1, sender2], 10000)

    // Deploy SavPay and set eosio.code permission
    contract = await ContractDeployer.deployWithName<Savactsavpay>('contracts/payments/savactsavpay', savpay_contract_name)
    await updateAuths(contract.account)
  })

  // Set system token to accepted list
  context('A/3 contract initialisation', async () => {
    context('set system token', async () => {
      it('should fail with auth error 1', async () => {
        await assertMissingAuthority(contract.settoken(sys_token.contract.account.name, sys_token.symbol.toString(), 240, { from: sys_token.contract.account }))
      })
      it('should succeed 2', async () => {
        await contract.settoken(sys_token.contract.account.name, sys_token.symbol.toString(), 240, { from: contract.account })
      })
      it('should update tokens table 3', async () => {
        let {
          rows: [item],
        } = await contract.tokensTable({ scope: sys_token.contract.account.name })
        chai.expect(item.token).equal(sys_token.symbol.toString(), 'Wrong token contract')
        chai.expect(item.openBytes).equal(240, 'Wrong byte number to open a token entry per user')
      })
    })
  })

  // Payment via on_notify transfer
  let inOneDay: number
  let inOneDayBs58: string
  let sendAsset: Asset
  let sendAssetString: string
  context('B/8 send token to name', async () => {
    before(async () => {
      inOneDay = Math.round(Date.now() / 1000 + 3600 * 24)
      inOneDayBs58 = base58.encode(numberTouInt32(inOneDay).reverse())
      sendAsset = new Asset(10000, sys_token.symbol)
      sendAssetString = sendAsset.toString()
    })
    context('from name', async () => {
      it('should fail with wrong auth 1', async () => {
        await assertMissingAuthority(sys_token.contract.transfer(sender1.name, contract.account.name, sendAssetString, `@${sender2.name}.${inOneDayBs58}`, { from: sender2 }))
      })
      it('should succeed with correct auth 2', async () => {
        await sys_token.contract.transfer(sender1.name, contract.account.name, sendAssetString, `@${sender2.name}!${inOneDayBs58}`, { from: sender1 })
      })
      it('should update pay2name table 3', async () => {
        let {
          rows: [item],
        } = await contract.pay2nameTable({ scope: sender2.name })
        chai.expect(item.contract).equal(sys_token.contract.account.name, 'Wrong token contract')
        chai.expect(item.from).equal(nameToFromHex(sender1.name), 'Wrong sender')
        chai.expect(stringToAsset(item.fund).amount).below(sendAsset.amount, 'Send amount is wrong')
        // chai.expect(String(item.id)).equal(, 'Wrong id')  // id = ((uint64_t)from.data()) ^ ((currentTime << 32)  & tapos_block_prefix()); if id is already taken then id-- until it is unused
        chai.expect(item.memo).equal('', 'There should no memo be defined')
        chai.expect(item.ramBy).equal(contract.account.name, 'Wrong RAM payer')
        chai.expect(item.time).equal(inOneDay, 'Wrong timestamp')
      })
      it('should succeed with several signs in the memo 4', async () => {
        await sys_token.contract.transfer(sender1.name, contract.account.name, sendAssetString, `@${sender2.name}!${inOneDayBs58};hello;!@$again`, { from: sender1 })
        chai.expect((await contract.pay2nameTable({ scope: sender2.name })).rows.length).equal(2)
      })
      it('should fail with spaces between the commands 5', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(sender1.name, contract.account.name, sendAssetString, `@${sender2.name} !${inOneDayBs58};withspaces`, { from: sender1 }), 'character is not in allowed character set for names')
      })
      it('should fail without time value 6', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(sender1.name, contract.account.name, sendAssetString, `@${sender2.name}`, { from: sender1 }), 'Missing time limit.')
      })
      it('should fail without recipient 7', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(sender1.name, contract.account.name, sendAssetString, `!${inOneDayBs58}`, { from: sender1 }), 'Recipient does not exists.')
      })
      it('should fail with a non existent recipient 8', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(sender1.name, contract.account.name, sendAssetString, `@nonexistent!${inOneDayBs58}`, { from: sender1 }), 'Recipient does not exists.')
      })
    })
    context('from public key', async () => {
      //TODO:
    })
  })
  context('C/? send token to public key', async () => {
    //TODO:
  })
  context('D/? deposited RAM', async () => {
    //TODO:
  })
  // TODO: ...
})

function numberTouInt32(num: number) {
  const arr = new ArrayBuffer(4)
  const view = new DataView(arr)
  view.setUint32(0, num) // setBigUint for uint64
  return new Uint8Array(arr)
}

function numberTouInt64(big_num: bigint) {
  const arr = new ArrayBuffer(8)
  const view = new DataView(arr)
  view.setBigUint64(0, big_num)
  return new Uint8Array(arr)
}

async function updateAuths(account: Account) {
  await UpdateAuth.execUpdateAuth(
    [{ actor: account.name, permission: 'owner' }],
    account.name,
    'active',
    'owner',
    UpdateAuth.AuthorityToSet.explicitAuthorities(
      1,
      [
        {
          permission: {
            actor: account.name,
            permission: 'eosio.code',
          },
          weight: 1,
        },
      ],
      [{ key: account.publicKey!, weight: 1 }]
    )
  )
}

async function initToken(token: Token) {
  const iniAssetString = new Asset(10000000000000, token.symbol).toString()

  try {
    await token.contract.create(token.contract.account.name, iniAssetString, {
      from: token.contract.account,
    })

    await token.contract.issue(token.contract.account.name, iniAssetString, 'initial deposit', { from: token.contract.account })
  } catch (e) {
    if ((e as { json: { error: { what: string } } }).json.error.what != 'eosio_assert_message assertion failure') {
      throw e
    }
  }
}

async function issueToken(token: Token, accounts: Array<Account>, amountPerAcc: number, sender?: Account) {
  const sharedAssetString = new Asset(amountPerAcc, token.symbol).toString()
  if (!sender) {
    sender = token.contract.account
  }
  for (let account of accounts) {
    await token.contract.transfer(sender.name, account.name, sharedAssetString, 'inital balance', { from: sender })
  }
}

/*
 * Convert an EOSIO name to a big integer
 * @param name EOSIO name
 * @returns The number corresponding to the name
 */
function nameToUint64(name: string) {
  const buffer = new Serialize.SerialBuffer()
  buffer.pushName(name)
  return Buffer.from(buffer.asUint8Array()).readBigUInt64BE()
}

function nameToFromHex(name: string) {
  return nameToUint64(name).toString(16).padStart(16, '0')
}

const stringToAsset = (asset_str: string): Asset => {
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

// TODO: Write tests for every case

// Actions for testing (TODO: Delete them from contract files):
// contract.clearallkey
// contract.clearallname
// contract.testaddpay
// contract.testdeposit
// contract.testmemo
// contract.testsetram

// Payments
// eosioToken.transfer(sender1.name, contract.account.name, `1.0000 ${token_symbol}`, '', {from: sender1})
// Memo parameters:
// from? @to !time ;memo? | :abstimmungen?
// RAM@to !time | .relative_time
// FIN@to_pub #id !sig_time ~sig
// OFF@to #id !sig_time ~sig +recipient
// ALL!sig_time ~sig +recipient #nuance
// ACC@to_pub !sig_time ~sig +recipient &recipient_key?

// Actions of the contract:
// contract.finalize
// contract.finalizesig
// contract.invalidate
// contract.invalisig
// contract.payoff
// contract.payoffall
// contract.payoffnewacc
// contract.payoffsig
// contract.payoffsigall
// contract.reject
// contract.rejectsig
// contract.removeram
// contract.settoken
// contract.removetoken

// Notes:
// Table parameter "ramBy" is the contract account if the recipient will get the RAM after the transaction is finalized.
// Table parameter "from" is the sender account name value as byte vector

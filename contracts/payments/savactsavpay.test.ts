import { ContractDeployer, assertRowsEqual, AccountManager, Account, assertEOSErrorIncludesMessage, assertMissingAuthority, EOSManager, debugPromise, assertRowsEqualStrict, assertRowCount, assertEOSException, assertEOSError, UpdateAuth, assertRowsContain } from 'lamington'
import * as chai from 'chai'
import { Savactsavpay } from './savactsavpay'
import { EosioToken } from '../eosio.token/eosio.token'
import base58 = require('bs58')

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
}

interface Token {
  contract: EosioToken
  symbol: Symbol
}

const savpay_contract_name = 'savactsavpay'
const nirvana_name = 'stake.savact'
let sys_token: Token
let custom_token: Token

describe('SavAct SavPay', () => {
  before(async () => {
    sys_token = {
      contract: await ContractDeployer.deployWithName<EosioToken>('contracts/eosio.token/eosio.token', 'eosio.token'),
      symbol: new Symbol('EOS', 4),
    }
    custom_token = {
      contract: await ContractDeployer.deployWithName<EosioToken>('contracts/eosio.token/eosio.token', 'usd.token'),
      symbol: new Symbol('USD', 2),
    }

    contract = await ContractDeployer.deployWithName<Savactsavpay>('contracts/payments/savactsavpay', savpay_contract_name)

    nirvana = await AccountManager.createAccount(nirvana_name)
    sender1 = await AccountManager.createAccount('sender1')
    sender2 = await AccountManager.createAccount('sender2')

    await issueTokens(sys_token, [sender1, sender2])
    await issueTokens(custom_token, [sender1, sender2])
    await updateAuths(contract.account)

    EOSManager.initWithDefaults() // TODO: Use system token with RAM management
  })

  // Set token to accepted list
  context('set system token', async () => {
    it('should fail with auth error', async () => {
      await assertMissingAuthority(contract.settoken(sys_token.contract.account.name, sys_token.symbol.toString(), 240, { from: sys_token.contract.account }))
    })
    it('should succeed', async () => {
      await contract.settoken(sys_token.contract.account.name, sys_token.symbol.toString(), 240, { from: contract.account })
    })
    it('should update tokens table', async () => {
      let {
        rows: [item],
      } = await contract.tokensTable({ scope: sys_token.contract.account.name })
      chai.expect(item.token).equal(sys_token.symbol.toString(), 'Wrong token contract')
      chai.expect(item.openBytes).equal(240, 'Wrong byte number to open a token entry per user')
    })
  })

  // Transfer
  console.log('Transfer')
  let inOneDay: number
  let inOneDayBs58: string
  let sendAsset: Asset
  let sendAssetString: string
  context('send token', async () => {
    before(async () => {
      inOneDay = Math.round(Date.now() / 1000 + 3600 * 24)
      inOneDayBs58 = base58.encode(numberTouInt32(inOneDay).reverse())
      sendAsset = new Asset(10000, sys_token.symbol)
      sendAssetString = sendAsset.toString()
    })
    context('without wrong auth', async () => {
      it('should fail with auth error', async () => {
        await assertMissingAuthority(sys_token.contract.transfer(sender1.name, contract.account.name, sendAssetString, `@${sender2.name}.${inOneDayBs58}`, { from: sender2 }))
      })
    })

    // context('with correct auth', async () => {
    //   it('should succeed', async () => {
    //     // The following function needs the action buyram of the system contract
    //     await sys_token.contract.transfer(sender1.name, contract.account.name, sendAssetString, `@${sender2.name}!${inOneDayBs58}`, { from: sender1 })
    //   })
    //   it('should update stats table', async () => {
    //     let {
    //       rows: [item],
    //     } = await contract.pay2nameTable()
    //     chai.expect(item.contract).equal(custom_token.contract.account.name, 'Wrong token contract')
    //     chai.expect(item.from).equal(sender1.name, 'Wrong sender')
    //     chai.expect(item.fund).equal(sendAssetString, 'Send amount is wrong')
    //     chai.expect(String(item.id)).equal('0', 'Wrong id')
    //     chai.expect(item.memo).equal('', 'There should no memo be defined')
    //     chai.expect(item.ramBy).equal(sender1.name, 'Wrong RAM payer') //-
    //     chai.expect(item.time).equal(inOneDay, 'Wrong timestamp')
    //   })
    // })
  })
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

async function issueTokens(token: Token, accounts: Array<Account>) {
  const iniAssetString = new Asset(10000000000000, token.symbol).toString()
  const sharedAssetString = new Asset(1000000000, token.symbol).toString()

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

  for (let account of accounts) {
    await token.contract.transfer(token.contract.account.name, account.name, sharedAssetString, 'inital balance', { from: token.contract.account })
  }
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

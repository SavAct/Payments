/*  Attention: Even by setting skipSystemContracts to false, the test network seems not to provide all eosio.system actions like buyrambytes().
 *  Change "eosio" to "systemdummy" in eosioHandler.hpp to get around this provisionally and execute this test.
 *  Do not forget to set it back for production!
 */

import { ContractDeployer, assertRowsEqual, AccountManager, Account, Contract, assertEOSErrorIncludesMessage, assertMissingAuthority, EOSManager, debugPromise, assertRowsEqualStrict, assertRowCount, assertEOSException, assertEOSError, UpdateAuth, assertRowsContain, ContractLoader, sleep } from 'lamington'
import * as chai from 'chai'
import { Savactsavpay, SavactsavpayPay2key, SavactsavpayPay2name } from './savactsavpay'
import { EosioToken } from '../eosio.token/eosio.token'
import { Systemdummy } from '../systemdummy/systemdummy'
import { Serialize } from 'eosjs'
import { ecc } from 'eosjs/dist/eosjs-ecc-migration'
import { PublicKey } from 'eosjs/dist/PublicKey'
import { PrivateKey } from 'eosjs/dist/PrivateKey'
import { KeyType, publicKeyToString } from 'eosjs/dist/eosjs-numeric'
import { Symbol, Asset, numberTouInt32, stringToAsset, splitPubKeyToScopeAndTableVec, nameToFromHex, hexWithTypeOfPubKey, numberTouInt64 } from '../../helpers/conversions'
import { getBalance, getBalances, initToken, issueToken, shouldFail, Token, updateAuths } from '../../helpers/chainHandle'
import { Check } from '../../helpers/contractHandle'
import base58 = require('bs58')

let contract: Savactsavpay
let user: Array<Account>
let nirvana: Account

const savpay_contract_name = 'savactsavpay'
const nirvana_name = 'stake.savact'
const sys_token_acc_name = 'eosio.token'
const sys_token_symbol = new Symbol('EOS', 4)
let sys_token: Token
let custom_token: Token
let sys_token_acc: Account
let check: Check

const priKey1K1 = PrivateKey.fromString('5KQwrPbwdL6PhXujxW37FSSQZ1JiwsST4cqQzDeyXtP79zkvFD3')
const pubKey1K1 = priKey1K1.getPublicKey()
const splitKey1K1 = splitPubKeyToScopeAndTableVec(pubKey1K1)
const priKey1R1 = PrivateKey.fromString('PVT_R1_22GrF17GDTkkdLG9FnqPAUJ8LNaqSK7aKbKxyVy9gxX795E8mQ')
const pubKey1R1 = priKey1R1.getPublicKey()
console.log('Legacy K1', pubKey1K1.toLegacyString())
console.log('K1', pubKey1K1.toString())
console.log('R1', pubKey1R1.toString())
const mainNetChainId = 'aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906'

describe('SavPay', () => {
  before(async () => {
    EOSManager.initWithDefaults()

    // Deploy and initialize system dummy contract
    const sys_contract = await ContractDeployer.deployWithName<Systemdummy>('contracts/systemdummy/systemdummy', 'systemdummy')
    sys_contract.setramstate('10000000000.0000 RAMCORE', '235437088517 RAM', '6048272.9978 EOS')

    // Create accounts
    nirvana = await AccountManager.createAccount(nirvana_name)
    user = [await AccountManager.createAccount('user.zero'), await AccountManager.createAccount('user.one'), await AccountManager.createAccount('user.two')]
    if (!user[0].publicKey || !user[0].privateKey || !user[1].publicKey || !user[1].privateKey || !user[2].publicKey || !user[2].privateKey) {
      throw 'No key for user'
    }

    // Issue system tokens
    sys_token_acc = new Account(sys_token_acc_name, EOSManager.adminAccount.privateKey, EOSManager.adminAccount.publicKey)
    sys_token = {
      contract: await ContractLoader.at<EosioToken>(sys_token_acc),
      symbol: sys_token_symbol,
    }
    await issueToken(sys_token, [nirvana, user[0], user[1]], 10000000, EOSManager.adminAccount)

    // Deploy, initialize and issue a custom token
    custom_token = {
      contract: await ContractDeployer.deployWithName<EosioToken>('contracts/eosio.token/eosio.token', 'fiat.token'),
      symbol: new Symbol('FIAT', 2),
    }
    await initToken(custom_token)
    await issueToken(custom_token, [user[2], user[1]], 10000)

    // Deploy SavPay and set eosio.code permission
    contract = await ContractDeployer.deployWithName<Savactsavpay>('contracts/payments/savactsavpay', savpay_contract_name)
    await updateAuths(contract.account)
    check = new Check(contract)
  })

  // Set system token to accepted list
  context('contract initialization', async () => {
    context('A/4 set system token', async () => {
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
      it('should open system token entry 4', async () => {
        await sys_token.contract.open(contract.account.name, sys_token.symbol.toString(), contract.account.name, { from: contract.account })
      })
    })
  })

  let inOneDay: number
  let inOneDayBs58: string
  let sendAsset: Asset
  let sendAssetString: string

  // Payment via on_notify transfer
  context('transfer via memo', async () => {
    before(async () => {
      inOneDay = Math.round(Date.now() / 1000 + 3600 * 24)
      inOneDayBs58 = base58.encode(numberTouInt32(inOneDay).reverse())
      sendAsset = new Asset(10000, sys_token.symbol)
      sendAssetString = sendAsset.toString()
    })
    context('B/10 from name to name', async () => {
      it('should fail with wrong auth 1', async () => {
        await assertMissingAuthority(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@${user[1].name}.${inOneDayBs58}`, { from: user[1] }))
      })
      it('should succeed with correct auth 2', async () => {
        const [contractAsset, users0Asset, users1Asset] = await getBalances([contract.account, user[0], user[1]], sys_token)

        await check.ramTrace(async () => {
          return await sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@${user[1].name}!${inOneDayBs58}`, { from: user[0] })
        }, false) // First use of scope "name" which will be paid by the contract

        const [newContractAsset, newusers0Asset, newusers1Asset] = await getBalances([contract.account, user[0], user[1]], sys_token)
        const sendAmount = users0Asset.amount - newusers0Asset.amount
        chai.expect(0).equal(users1Asset.amount - newusers1Asset.amount, 'Other user balance changed')
        chai.expect(sendAmount).equal(sendAsset.amount, 'User does not send the right amount of tokens')
        chai.expect(newContractAsset.amount - contractAsset.amount).equal(sendAsset.amount, 'Contract does not receive the right amount of tokens')
      })
      it('should update pay2name table 3', async () => {
        let {
          rows: [item],
        } = await contract.pay2nameTable({ scope: user[1].name })
        chai.expect(item.contract).equal(sys_token.contract.account.name, 'Wrong token contract')
        chai.expect(item.from).equal(nameToFromHex(user[0].name), 'Wrong sender')
        chai.expect(stringToAsset(item.fund).amount).below(sendAsset.amount, 'Send amount is wrong')
        chai.expect(String(item.id)).equal(String(0), 'Wrong id')
        chai.expect(item.memo).equal('', 'There should no memo be defined')
        chai.expect(item.ramBy).equal(contract.account.name, 'Wrong RAM payer')
        chai.expect(item.time).equal(inOneDay, 'Wrong timestamp')
      })
      it('should succeed with several signs in memo 4', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@${user[1].name}!${inOneDayBs58};hello;!@$again`, { from: user[0] })
        })
        chai.expect((await contract.pay2nameTable({ scope: user[1].name })).rows.length).equal(2)
      })
      it('should fail with spaces between the commands 5', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@${user[1].name} !${inOneDayBs58};withspaces`, { from: user[0] }), 'character is not in allowed character set for names')
      })
      it('should fail without time value 6', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@${user[1].name}`, { from: user[0] }), 'Missing time limit.')
      })
      it('should fail without recipient 7', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `!${inOneDayBs58}`, { from: user[0] }), 'Recipient does not exists.')
      })
      it('should fail with a non existent recipient 8', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@nonexistent!${inOneDayBs58}`, { from: user[0] }), 'Recipient does not exists.')
      })
      it('should fail with zero balance 9', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, '0.0000 EOS', `@${inOneDayBs58}!${inOneDayBs58}`, { from: user[0] }), 'must transfer positive quantity')
      })
      it('should fail with negative balance 10', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, '-' + sendAssetString, `@${inOneDayBs58}!${inOneDayBs58}`, { from: user[0] }), 'must transfer positive quantity')
      })
    })
    context('C/10 from key to name', async () => {
      it('should fail with invalid key length 1', async () => {
        const wrong_pubkeyLegacy = pubKey1K1.toLegacyString().substring(0, 10) + 'aa' + pubKey1K1.toLegacyString().substring(10)
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${wrong_pubkeyLegacy}@${user[2].name}!${inOneDayBs58}`, { from: user[0] }), 'Invalid length of public key.')
      })
      it('should fail with typo in legacy key 2', async () => {
        const wrong_pubkeyLegacy = pubKey1K1.toLegacyString().substring(0, 10) + 'aaaaaa' + pubKey1K1.toLegacyString().substring(16)
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${wrong_pubkeyLegacy}@${user[2].name}!${inOneDayBs58}`, { from: user[0] }), 'Wrong checksum, check the public key for typos.')
      })
      it('should succeed with legacy key 3', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${pubKey1K1.toLegacyString()}@${user[2].name}!${inOneDayBs58}`, { from: user[0] })
        })
      })
      it('should fail with typo in K1 key 4', async () => {
        const wrong_pubkeyk1 = pubKey1K1.toString().substring(0, 10) + 'aaaaaa' + pubKey1K1.toString().substring(16)
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${wrong_pubkeyk1}@${user[2].name}!${inOneDayBs58}`, { from: user[0] }), 'Wrong checksum, check the public key for typos.')
      })
      it('should succeed with K1 key 5', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${pubKey1K1.toString()}@${user[2].name}!${inOneDayBs58}`, { from: user[0] })
        })
      })
      it('should succeed with memo 6', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${pubKey1K1.toString()}@${user[2].name}!${inOneDayBs58};@new?key;format!`, { from: user[0] })
        })
      })
      it('should fail with R1 key 7', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${pubKey1R1.toString()}@${user[2].name}!${inOneDayBs58}`, { from: user[0] }), 'Please, use a public key that beginns with EOS or PUB_K1_.')
      })
      it('should update pay2name table 8', async () => {
        const Key1Hex = pubKey1K1.toElliptic().getPublic(true, 'hex') + '00'
        let {
          rows: [item1, item2, item3],
        } = await contract.pay2nameTable({ scope: user[2].name })

        const testPay2NameTable = (item: SavactsavpayPay2name, id: number) => {
          chai.expect(item.contract).equal(sys_token.contract.account.name, 'Wrong token contract')
          chai.expect(item.from).equal(Key1Hex, 'Wrong sender')
          chai.expect(stringToAsset(item.fund).amount).below(sendAsset.amount, 'Send amount is wrong')
          chai.expect(String(item.id)).equal(String(id), 'Wrong id') // id = ((uint64_t)from.data()) ^ ((currentTime << 32)  & tapos_block_prefix()); if id is already taken then id-- until it is unused
          if (item.memo) {
            chai.expect(item.memo).equal('@new?key;format!', 'The memo is wrong')
          } else {
            chai.expect(item.memo).equal('', 'There should no memo be defined')
          }
          chai.expect(item.ramBy).equal(contract.account.name, 'Wrong RAM payer')
          chai.expect(item.time).equal(inOneDay, 'Wrong timestamp')
        }
        testPay2NameTable(item1, 0)
        testPay2NameTable(item2, 1)
        testPay2NameTable(item3, 2)
      })
      it('should fail without time value 9', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${user[2].publicKey}@${user[2].name}`, { from: user[0] }), 'Missing time limit.')
      })
      it('should fail with a non existent recipient 10', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${user[2].publicKey}@nonexistent!${inOneDayBs58}`, { from: user[0] }), 'Recipient does not exists.')
      })
    })
    context('D/9 from name to key', async () => {
      it('should fail with invalid key length 1', async () => {
        const wrong_pubkeyLegacy = pubKey1K1.toLegacyString().substring(0, 10) + 'aa' + pubKey1K1.toLegacyString().substring(10)
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@${wrong_pubkeyLegacy}!${inOneDayBs58}`, { from: user[0] }), 'Invalid length of public key.')
      })
      it('should fail with typo in legacy key 2', async () => {
        const wrong_pubkeyLegacy = pubKey1K1.toLegacyString().substring(0, 10) + 'aaaaaa' + pubKey1K1.toLegacyString().substring(16)
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@${wrong_pubkeyLegacy}!${inOneDayBs58}`, { from: user[0] }), 'Wrong checksum, check the public key for typos.')
      })
      it('should succeed with legacy key 3', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@${pubKey1K1.toLegacyString()}!${inOneDayBs58}`, { from: user[0] })
        }, false) // First use of scope "key" which will be paid by the contract
      })
      it('should fail with typo in K1 key 4', async () => {
        const wrong_pubkeyk1 = pubKey1K1.toString().substring(0, 10) + 'aaaaaa' + pubKey1K1.toString().substring(16)
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@${wrong_pubkeyk1}!${inOneDayBs58}`, { from: user[0] }), 'Wrong checksum, check the public key for typos.')
      })
      it('should succeed with K1 key 5', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@${pubKey1K1.toString()}!${inOneDayBs58}`, { from: user[0] })
        })
      })
      it('should succeed with K1 memo 6', async () => {
        await check.ramTrace(async () => {
          return await sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@${pubKey1K1.toString()}!${inOneDayBs58};@new?key;format!`, { from: user[0] })
        })
      })
      it('should fail with R1 key 7', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@${pubKey1R1.toString()}!${inOneDayBs58}`, { from: user[0] }), 'Please, use a public key that beginns with EOS or PUB_K1_.')
      })
      it('should update pay2name table 8', async () => {
        let {
          rows: [item1, item2, item3],
        } = await contract.pay2keyTable({ scope: splitKey1K1.scope.toString() })

        const testPay2KeyTable = (item: SavactsavpayPay2key, id: number) => {
          chai.expect(item.contract).equal(sys_token.contract.account.name, 'Wrong token contract')
          chai.expect(item.from).equal(nameToFromHex(user[0].name), 'Wrong sender')
          chai.expect(stringToAsset(item.fund).amount).below(sendAsset.amount, 'Send amount is wrong')
          chai.expect(String(item.id)).equal(String(id), 'Wrong id')
          if (item.memo) {
            chai.expect(item.memo).equal('@new?key;format!', 'The memo is wrong')
          } else {
            chai.expect(item.memo).equal('', 'There should no memo be defined')
          }
          chai.expect(item.ramBy).equal(contract.account.name, 'Wrong RAM payer')
          chai.expect(item.time).equal(inOneDay, 'Wrong timestamp')
          chai.expect(item.to).equal(splitKey1K1.tableVec, 'Wrong recipient pub key')
        }
        testPay2KeyTable(item1, 0)
        testPay2KeyTable(item2, 1)
        testPay2KeyTable(item3, 2)
      })
      it('should fail without time value 9', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@${user[1].publicKey}`, { from: user[0] }), 'Missing time limit.')
      })
    })
    context('E/10 from key to key', async () => {
      let recipient2PubK1: PublicKey
      before(async () => {
        if (user[2].publicKey) {
          recipient2PubK1 = PublicKey.fromString(user[2].publicKey)
        }
      })
      it('should fail with invalid key length 1', async () => {
        const wrong_pubkeyLegacy = recipient2PubK1.toLegacyString().substring(0, 10) + 'aa' + recipient2PubK1.toLegacyString().substring(10)
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${wrong_pubkeyLegacy}@${recipient2PubK1.toLegacyString()}!${inOneDayBs58}`, { from: user[0] }), 'Invalid length of public key.')
      })
      it('should fail with typo in legacy key 2', async () => {
        const wrong_pubkeyLegacy = recipient2PubK1.toLegacyString().substring(0, 10) + 'aaaaaa' + recipient2PubK1.toLegacyString().substring(16)
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${wrong_pubkeyLegacy}@${recipient2PubK1.toLegacyString()}!${inOneDayBs58}`, { from: user[0] }), 'Wrong checksum, check the public key for typos.')
      })
      it('should succeed with legacy key 3', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${pubKey1K1.toLegacyString()}@${recipient2PubK1.toLegacyString()}!${inOneDayBs58}`, { from: user[0] })
        })
      })
      it('should fail with typo in K1 key 4', async () => {
        const wrong_pubkeyk1 = pubKey1K1.toString().substring(0, 10) + 'aaaaaa' + pubKey1K1.toString().substring(16)
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${wrong_pubkeyk1}@${recipient2PubK1.toString()}!${inOneDayBs58}`, { from: user[0] }), 'Wrong checksum, check the public key for typos.')
      })
      it('should succeed with K1 key 5', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${pubKey1K1.toString()}@${recipient2PubK1.toString()}!${inOneDayBs58}`, { from: user[0] })
        })
      })
      it('should succeed with memo 6', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${pubKey1K1.toString()}@${recipient2PubK1.toString()}!${inOneDayBs58};@new?key;format!`, { from: user[0] })
        })
      })
      it('should fail with R1 sender key 7', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${pubKey1R1.toString()}@${recipient2PubK1.toString()}!${inOneDayBs58}`, { from: user[0] }), 'Please, use a public key that beginns with EOS or PUB_K1_.')
      })
      it('should fail with R1 sender and receiver key 8', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${pubKey1R1.toString()}@${recipient2PubK1.toString()}!${inOneDayBs58}`, { from: user[0] }), 'Please, use a public key that beginns with EOS or PUB_K1_.')
      })
      it('should update pay2name table 9', async () => {
        const splitKey3K1 = splitPubKeyToScopeAndTableVec(recipient2PubK1)
        const Key1Hex = pubKey1K1.toElliptic().getPublic(true, 'hex') + '00'
        let {
          rows: [item1, item2, item3],
        } = await contract.pay2keyTable({ scope: splitKey3K1.scope.toString() })

        const testPay2KeyTable = (item: SavactsavpayPay2key, id: number) => {
          chai.expect(item.contract).equal(sys_token.contract.account.name, 'Wrong token contract')
          chai.expect(item.from).equal(Key1Hex, 'Wrong sender')
          chai.expect(stringToAsset(item.fund).amount).below(sendAsset.amount, 'Send amount is wrong')
          chai.expect(String(item.id)).equal(String(id), 'Wrong id')
          if (item.memo) {
            chai.expect(item.memo).equal('@new?key;format!', 'The memo is wrong')
          } else {
            chai.expect(item.memo).equal('', 'There should no memo be defined')
          }
          chai.expect(item.ramBy).equal(contract.account.name, 'Wrong RAM payer')
          chai.expect(item.time).equal(inOneDay, 'Wrong timestamp')
          chai.expect(item.to).equal(splitKey3K1.tableVec, 'Wrong recipient pub key')
        }
        testPay2KeyTable(item1, 0)
        testPay2KeyTable(item2, 1)
        testPay2KeyTable(item3, 2)
      })
      it('should fail without time value 10', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${pubKey1R1.toString()}@${user[1].publicKey}`, { from: user[0] }), 'Missing time limit.')
      })
    })
  })

  // Reject payments
  context('reject payment', async () => {
    let contractAsset: Asset
    let user0Asset: Asset
    let user1Asset: Asset
    let user2Asset: Asset
    let storedAsset: Asset
    before(async () => {
      ;[contractAsset, user0Asset, user1Asset, user2Asset] = await getBalances([contract.account, user[0], user[1], user[2]], sys_token)
      const {
        rows: [item],
      } = await contract.pay2nameTable({ scope: user[1].name, lowerBound: 0, limit: 1 })
      storedAsset = stringToAsset(item.fund)
    })
    context('F/5 name to name', async () => {
      it('should fail with auth error by sender auth 1', async () => {
        await assertMissingAuthority(contract.reject(user[1].name, 0, { from: user[0] }))
      })
      it('should fail with auth error by contract auth 2', async () => {
        await assertMissingAuthority(contract.reject(user[1].name, 0, { from: contract.account }))
      })
      it('should succeed 3', async () => {
        await check.ramTrace(async () => {
          return await contract.reject(user[1].name, 0, { from: user[1] })
        })
      })
      it('should update tables 4', async () => {
        await check.checkPayment2Name_NotExist(user[1].name, 0)
        const [newContractAsset, newuser0Asset, newuser1Asset] = await getBalances([contract.account, user[0], user[1]], sys_token)

        chai.expect(storedAsset.amount).greaterThan(0, 'No asset in pay2name table entry')
        const sendAmount = contractAsset.amount - newContractAsset.amount
        chai.expect(sendAmount).greaterThanOrEqual(storedAsset.amount, 'Wrong asset amount withdrawn')
        chai.expect(newuser0Asset.amount - user0Asset.amount).equal(sendAmount, 'User got wrong amount returned')
        chai.expect(newuser1Asset.amount - user1Asset.amount).equal(0, 'Changed balance of wrong user')
        user0Asset.amount = newuser0Asset.amount
        contractAsset.amount = newContractAsset.amount
      })
      it('should fail to reject a not existing id 5', async () => {
        await assertEOSErrorIncludesMessage(contract.reject(user[1].name, 0, { from: user[1] }), 'Entry does not exist.')
      })
    })
    context('G/5 key to name', async () => {
      it('should fail with auth error by sender auth 1', async () => {
        await assertMissingAuthority(contract.reject(user[2].name, 0, { from: user[0] }))
      })
      it('should fail with auth error by contract auth 2', async () => {
        await assertMissingAuthority(contract.reject(user[2].name, 0, { from: contract.account }))
      })
      it('should succeed 3', async () => {
        await check.ramTrace(async () => {
          return await contract.reject(user[2].name, 0, { from: user[2] })
        })
      })
      it('should update tables 4', async () => {
        const {
          rows: [item],
        } = await contract.pay2nameTable({ scope: user[2].name, lowerBound: '0', limit: 1 })
        chai.expect(item.time).equal(0, 'Payment is not marked as rejected')

        const [newContractAsset, newuser0Asset, newuser2Asset] = await getBalances([contract.account, user[0], user[2]], sys_token)
        chai.expect(contractAsset.amount - newContractAsset.amount).equal(0, 'Changed balance')
        chai.expect(newuser0Asset.amount - user0Asset.amount).equal(0, 'Changed balance')
        chai.expect(newuser2Asset.amount - newuser2Asset.amount).equal(0, 'Changed balance')
        user0Asset.amount = newuser0Asset.amount
        contractAsset.amount = newContractAsset.amount
      })
      it('should fail to reject a not existing id 5', async () => {
        await assertEOSErrorIncludesMessage(contract.reject(user[2].name, 0, { from: user[2] }), 'The payment has already been rejected.')
      })
    })
    context('H/7 name to key', async () => {
      let sig: string
      let currentTime: number
      before(async () => {
        currentTime = Math.round(Date.now() / 1000)
        sig = signReject(priKey1K1.toString(), mainNetChainId, contract.account.name, user[0].name, '0', currentTime.toString()).sig
      })
      it('should fail with other time than signed 1', async () => {
        await shouldFail(contract.rejectsig(pubKey1K1.toString(), 0, currentTime - 1, sig, { from: user[3] }))
      })
      it('should fail with wrong signed public key 2', async () => {
        const wrongSig = signReject(user[0].privateKey as string, mainNetChainId, contract.account.name, user[0].name, '0', currentTime.toString()).sig
        await shouldFail(contract.rejectsig(pubKey1K1.toString(), 0, currentTime, wrongSig, { from: user[3] }))
      })
      it('should fail with too old time 3', async () => {
        const oldTime = Math.round(Date.now() / 1000) - 24 * 3600
        const oldTimeSig = signReject(priKey1K1.toString(), mainNetChainId, contract.account.name, user[0].name, '0', currentTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.rejectsig(pubKey1K1.toString(), 0, oldTime, oldTimeSig, { from: user[3] }), 'The transaction is expired.')
      })
      it('should fail with future time 4', async () => {
        const futureTime = Math.round(Date.now() / 1000) + 100
        const futureTimeSig = signReject(priKey1K1.toString(), mainNetChainId, contract.account.name, user[0].name, '0', currentTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.rejectsig(pubKey1K1.toString(), 0, futureTime, futureTimeSig, { from: user[3] }), 'The transaction is expired.')
      })
      it('should fail with other id than signed 5', async () => {
        await shouldFail(contract.rejectsig(pubKey1K1.toString(), 1, currentTime, sig, { from: user[3] }))
      })
      it('should succeed with any account 6', async () => {
        await check.ramTrace(async () => {
          return await contract.rejectsig(pubKey1K1.toString(), 0, currentTime, sig, { from: user[3] })
        })
      })
      it('should fail to reject a not existing id 7', async () => {
        await assertEOSErrorIncludesMessage(contract.rejectsig(pubKey1K1.toString(), 0, currentTime, sig, { from: user[2] }), 'Entry does not exist.')
      })
    })
    context('I/7 key to key', async () => {
      let sig: string
      let currentTime: number
      let recipient2PubK1: PublicKey
      before(async () => {
        currentTime = Math.round(Date.now() / 1000)
        if (user[2].publicKey) {
          recipient2PubK1 = PublicKey.fromString(user[2].publicKey)
        }
        const fromhex = hexWithTypeOfPubKey(pubKey1K1)
        const sigData = signReject(user[2].privateKey as string, mainNetChainId, contract.account.name, fromhex, '0', currentTime.toString())
        sig = sigData.sig
      })
      it('should fail with other time than signed 1', async () => {
        await shouldFail(contract.rejectsig(recipient2PubK1.toString(), 0, currentTime - 1, sig, { from: user[1] }))
      })
      it('should fail with wrong signed public key 2', async () => {
        const wrongSig = signReject(user[0].privateKey as string, mainNetChainId, contract.account.name, user[0].name, '0', currentTime.toString()).sig
        await shouldFail(contract.rejectsig(recipient2PubK1.toString(), 0, currentTime, wrongSig, { from: user[1] }))
      })
      it('should fail with too old time 3', async () => {
        const oldTime = Math.round(Date.now() / 1000) - 24 * 3600
        const oldTimeSig = signReject(priKey1K1.toString(), mainNetChainId, contract.account.name, user[0].name, '0', currentTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.rejectsig(recipient2PubK1.toString(), 0, oldTime, oldTimeSig, { from: user[1] }), 'The transaction is expired.')
      })
      it('should fail with future time 4', async () => {
        const futureTime = Math.round(Date.now() / 1000) + 100
        const futureTimeSig = signReject(priKey1K1.toString(), mainNetChainId, contract.account.name, user[0].name, '0', currentTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.rejectsig(recipient2PubK1.toString(), 0, futureTime, futureTimeSig, { from: user[1] }), 'The transaction is expired.')
      })
      it('should fail with other id than signed 5', async () => {
        await shouldFail(contract.rejectsig(recipient2PubK1.toString(), 1, currentTime, sig, { from: user[1] }))
      })
      it('should succeed with any account 6', async () => {
        await check.ramTrace(async () => {
          return await contract.rejectsig(recipient2PubK1.toString(), 0, currentTime, sig, { from: user[1] })
        })
      })
      it('should fail to reject a not existing id 7', async () => {
        await assertEOSErrorIncludesMessage(contract.rejectsig(recipient2PubK1.toString(), 0, currentTime, sig, { from: user[2] }), 'The payment has already been rejected.')
      })
    })
  })

  // Finalize
  let contractAsset: Asset
  let nirvanaAsset: Asset
  let user0Asset: Asset
  let user1Asset: Asset
  let user2Asset: Asset
  context('finalize payment', async () => {
    let storedAsset: Asset
    before(async () => {
      ;[contractAsset, nirvanaAsset, user0Asset, user1Asset, user2Asset] = await getBalances([contract.account, nirvana, user[0], user[1], user[2]], sys_token)
      const {
        rows: [item],
      } = await contract.pay2nameTable({ scope: user[1].name, lowerBound: 1, limit: 1 })
      storedAsset = stringToAsset(item.fund)
    })
    context('J/5 name to name', async () => {
      it('should fail with auth error by sender auth 1', async () => {
        await assertMissingAuthority(contract.finalize(user[1].name, 1, { from: user[2] }))
      })
      it('should fail with auth error by contract auth 2', async () => {
        await assertMissingAuthority(contract.finalize(user[1].name, 1, { from: contract.account }))
      })
      it('should succeed 3', async () => {
        await check.ramTrace(async () => {
          return await contract.finalize(user[1].name, 1, { from: user[0] })
        })
      })
      it('should update tables 4', async () => {
        await check.checkPayment2Name_NotExist(user[1].name, 1)
        const [newContractAsset, newNirvanaAsset, newuser0Asset, newuser1Asset, newuser2Asset] = await getBalances([contract.account, nirvana, user[0], user[1], user[2]], sys_token)

        chai.expect(storedAsset.amount).greaterThan(0, 'No asset in pay2name table entry')
        const sendToNirvana = newNirvanaAsset.amount - nirvanaAsset.amount
        const reducedContractAmount = contractAsset.amount - newContractAsset.amount
        chai.expect(reducedContractAmount).greaterThanOrEqual(storedAsset.amount, 'Wrong asset amount withdrawn')
        chai.expect(newuser0Asset.amount - user0Asset.amount).equal(0, 'Changed balance of wrong user')
        chai.expect(newuser2Asset.amount - user2Asset.amount).equal(0, 'Changed balance of wrong user')
        chai.expect(newuser1Asset.amount - user1Asset.amount).greaterThanOrEqual(storedAsset.amount, 'User got less amount than noted in table')
        chai.expect(newuser1Asset.amount - user1Asset.amount).equal(reducedContractAmount - sendToNirvana, 'User got wrong amount returned')
        user1Asset.amount = newuser1Asset.amount
        contractAsset.amount = newContractAsset.amount
        nirvanaAsset.amount = newNirvanaAsset.amount
      })
      it('should fail to finalize a not existing id 5', async () => {
        await assertEOSErrorIncludesMessage(contract.finalize(user[1].name, 1, { from: user[0] }), 'Entry does not exist.')
      })
    })
    context('K/5 name to key', async () => {
      it('should fail with auth error by sender auth 1', async () => {
        await assertMissingAuthority(contract.finalize(pubKey1K1.toString(), 1, { from: user[2] }))
      })
      it('should fail with auth error by contract auth 2', async () => {
        await assertMissingAuthority(contract.finalize(pubKey1K1.toString(), 1, { from: contract.account }))
      })
      it('should succeed 3', async () => {
        await check.ramTrace(async () => {
          return await contract.finalize(pubKey1K1.toString(), 1, { from: user[0] })
        })
      })
      it('should update tables 4', async () => {
        const {
          rows: [item],
        } = await contract.pay2keyTable({ scope: splitKey1K1.scope.toString(), lowerBound: '1', limit: 1 })
        chai.expect(item.time).equal(1, 'Payment is not marked as finished')

        const [newContractAsset, newuser0Asset, newuser1Asset, newuser2Asset] = await getBalances([contract.account, user[0], user[1], user[2]], sys_token)
        chai.expect(contractAsset.amount - newContractAsset.amount).equal(0, 'Changed balance')
        chai.expect(newuser0Asset.amount - user0Asset.amount).equal(0, 'Changed balance')
        chai.expect(newuser1Asset.amount - user1Asset.amount).equal(0, 'Changed balance')
        chai.expect(newuser2Asset.amount - newuser2Asset.amount).equal(0, 'Changed balance')
        user0Asset.amount = newuser0Asset.amount
        contractAsset.amount = newContractAsset.amount
      })
      it('should fail to finalize a not existing id 5', async () => {
        await assertEOSErrorIncludesMessage(contract.finalize(pubKey1K1.toString(), 1, { from: user[0] }), 'Payment is already finalized.')
      })
    })
    context('L/8 key to name', async () => {
      let sig: string
      let currentTime: number
      before(async () => {
        currentTime = Math.round(Date.now() / 1000)
        sig = signFinalize(priKey1K1.toString(), mainNetChainId, contract.account.name, user[2].name, '1', currentTime.toString()).sig
      })
      it('should fail with other time than signed 1', async () => {
        await shouldFail(contract.finalizesig(user[2].name, 1, currentTime - 1, sig, { from: user[3] }))
      })
      it('should fail with wrong signed public key 2', async () => {
        const wrongSig = signFinalize(priKey1K1.toString() as string, mainNetChainId, contract.account.name, user[0].name, '1', currentTime.toString()).sig
        await shouldFail(contract.finalizesig(user[2].name, 1, currentTime, wrongSig, { from: user[3] }))
      })
      it('should fail with too old time 3', async () => {
        const oldTime = Math.round(Date.now() / 1000) - 24 * 3600
        const oldTimeSig = signFinalize(priKey1K1.toString(), mainNetChainId, contract.account.name, user[2].name, '1', oldTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.finalizesig(user[2].name, 1, oldTime, oldTimeSig, { from: user[3] }), 'The transaction is expired.')
      })
      it('should fail with future time 4', async () => {
        const futureTime = Math.round(Date.now() / 1000) + 100
        const futureTimeSig = signFinalize(priKey1K1.toString(), mainNetChainId, contract.account.name, user[2].name, '1', futureTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.finalizesig(user[2].name, 1, futureTime, futureTimeSig, { from: user[3] }), 'The transaction is expired.')
      })
      it('should fail with other id than signed 5', async () => {
        await shouldFail(contract.finalizesig(user[2].name, 2, currentTime, sig, { from: user[3] }))
      })
      it('should succeed with any account 6', async () => {
        await check.ramTrace(async () => {
          return await contract.finalizesig(user[2].name, 1, currentTime, sig, { from: user[3] })
        }, false) // user.two has no eosio.token entry, yet. So the RAM will be used to open an entry for 240 bytes
      })
      it('should update tables 7', async () => {
        await check.checkPayment2Name_NotExist(user[2].name, 1)
        const [newContractAsset, newNirvanaAsset, newuser0Asset, newuser1Asset, newuser2Asset] = await getBalances([contract.account, nirvana, user[0], user[1], user[2]], sys_token)

        chai.expect(storedAsset.amount).greaterThan(0, 'No asset in pay2name table entry')
        const sendToNirvana = newNirvanaAsset.amount - nirvanaAsset.amount
        const reducedContractAmount = contractAsset.amount - newContractAsset.amount
        chai.expect(reducedContractAmount).greaterThanOrEqual(storedAsset.amount, 'Wrong asset amount withdrawn')
        chai.expect(newNirvanaAsset.amount - nirvanaAsset.amount).equal(0, 'Changed balance of wrong user')
        chai.expect(newuser0Asset.amount - newuser0Asset.amount).equal(0, 'Changed balance of wrong user')
        chai.expect(newuser1Asset.amount - newuser1Asset.amount).equal(0, 'Changed balance of wrong user')
        chai.expect(newuser2Asset.amount - user2Asset.amount).equal(reducedContractAmount, 'User got wrong amount returned') // Released RAM is used for new Token entry of user.two
        user2Asset.amount = newuser2Asset.amount
        contractAsset.amount = newContractAsset.amount
      })
      it('should fail to finalize a not existing id 8', async () => {
        await assertEOSErrorIncludesMessage(contract.finalizesig(user[2].name, 1, currentTime, sig, { from: user[2] }), 'Entry does not exist.')
      })
    })
    context('M/8 key to key', async () => {
      let sig: string
      let currentTime: number
      let recipient2PubK1: PublicKey
      before(async () => {
        currentTime = Math.round(Date.now() / 1000)
        if (user[2].publicKey) {
          recipient2PubK1 = PublicKey.fromString(user[2].publicKey)
        }
        sig = signFinalize(priKey1K1.toString() as string, mainNetChainId, contract.account.name, recipient2PubK1.toString(), '1', currentTime.toString()).sig
      })
      it('should fail with other time than signed 1', async () => {
        await shouldFail(contract.finalizesig(recipient2PubK1.toString(), 1, currentTime - 1, sig, { from: user[1] }))
      })
      it('should fail with wrong signed public key 2', async () => {
        const wrongSig = signFinalize(user[0].privateKey as string, mainNetChainId, contract.account.name, recipient2PubK1.toString(), '1', currentTime.toString()).sig
        await shouldFail(contract.finalizesig(recipient2PubK1.toString(), 1, currentTime, wrongSig, { from: user[1] }))
      })
      it('should fail with too old time 3', async () => {
        const oldTime = Math.round(Date.now() / 1000) - 24 * 3600
        const oldTimeSig = signFinalize(priKey1K1.toString(), mainNetChainId, contract.account.name, recipient2PubK1.toString(), '1', currentTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.finalizesig(recipient2PubK1.toString(), 1, oldTime, oldTimeSig, { from: user[1] }), 'The transaction is expired.')
      })
      it('should fail with future time 4', async () => {
        const futureTime = Math.round(Date.now() / 1000) + 100
        const futureTimeSig = signFinalize(priKey1K1.toString(), mainNetChainId, contract.account.name, recipient2PubK1.toString(), '1', currentTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.finalizesig(recipient2PubK1.toString(), 1, futureTime, futureTimeSig, { from: user[1] }), 'The transaction is expired.')
      })
      it('should fail with other id than signed 5', async () => {
        await shouldFail(contract.finalizesig(recipient2PubK1.toString(), 2, currentTime, sig, { from: user[1] }))
      })
      it('should succeed with any account 6', async () => {
        await check.ramTrace(async () => {
          return await contract.finalizesig(recipient2PubK1.toString(), 1, currentTime, sig, { from: user[1] })
        })
      })
      it('should fail to finalize an already finalized payment 7', async () => {
        await assertEOSErrorIncludesMessage(contract.finalizesig(recipient2PubK1.toString(), 1, currentTime, sig, { from: user[2] }), 'Payment is already finalized.')
      })
      it('should succeed with legacy key 8', async () => {
        const sigLegacy = signFinalize(priKey1K1.toString() as string, mainNetChainId, contract.account.name, recipient2PubK1.toLegacyString(), '2', currentTime.toString()).sig
        await check.ramTrace(async () => {
          return await contract.finalizesig(recipient2PubK1.toLegacyString(), 2, currentTime, sigLegacy, { from: user[1] })
        })
      })
    })
  })

  // Check completed payments
  let in3Secs: { start: number; startBase58: string; end: number; endBase58: string }
  let recipient0PriK1: PrivateKey
  let recipient0PubK1: PublicKey
  let recipient0Split: { scope: bigint; tableVec: string }
  context('check completed payments', async () => {
    before(async () => {
      recipient0PriK1 = PrivateKey.fromString(user[0].privateKey as string)
      recipient0PubK1 = recipient0PriK1.getPublicKey()
      recipient0Split = splitPubKeyToScopeAndTableVec(recipient0PubK1)
      const timestampNow = Math.round(Date.now() / 1000)
      in3Secs = {
        start: timestampNow,
        startBase58: base58.encode(numberTouInt32(timestampNow).reverse()),
        end: Math.round(timestampNow + 3),
        endBase58: base58.encode(numberTouInt32(Math.round(timestampNow + 3)).reverse()),
      }
      sendAsset = new Asset(10000, sys_token.symbol)
      sendAssetString = sendAsset.toString()
    })
    context('N/4 set some further payments with "PAY" parameter', async () => {
      it('should succeed from name to name 1', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `PAY@${user[1].name}!${in3Secs.endBase58}`, { from: user[0] })
        })
      })
      it('should succeed from key to name and memo 2', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `PAY${user[0].publicKey}@${user[1].name}!${in3Secs.endBase58};hello;!@$again`, { from: user[0] })
        })
        chai.expect((await contract.pay2nameTable({ scope: user[1].name })).rows.length).equal(2)
      })
      it('should succeed from name to key 3', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `PAY${user[0].publicKey}@${recipient0PubK1.toString()}!${in3Secs.endBase58}`, { from: user[0] })
        })
      })
      it('should succeed from key to key and memo 4', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `PAY${user[0].publicKey}@${recipient0PubK1.toString()}!${in3Secs.endBase58};hello;!@$again`, { from: user[0] })
        })
        chai.expect((await contract.pay2keyTable({ scope: recipient0Split.scope.toString() })).rows.length).equal(2)
      })
    })
    context('O/3 finalize rejected payment', async () => {
      let recipient2PubK1: PublicKey
      let currentTime: number
      before(async () => {
        if (user[2].publicKey) {
          recipient2PubK1 = PublicKey.fromString(user[2].publicKey)
        }
        currentTime = Math.round(Date.now() / 1000)
      })
      it('should fail on key to name payment by finalize action 1', async () => {
        await assertEOSErrorIncludesMessage(contract.finalize(user[2].name, 0, { from: user[0] }), 'Payment is already rejected.')
      })
      it('should fail on key to name payment by finalizesig action 2', async () => {
        const sigToName = signFinalize(priKey1K1.toString(), mainNetChainId, contract.account.name, user[2].name, '0', currentTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.finalizesig(user[2].name, 0, currentTime, sigToName, { from: user[0] }), 'Payment is already rejected.')
      })
      it('should fail on key to key payment 3', async () => {
        const sigToKey = signFinalize(priKey1K1.toString(), mainNetChainId, contract.account.name, recipient2PubK1.toString(), '0', currentTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.finalizesig(recipient2PubK1.toString(), 0, currentTime, sigToKey, { from: user[0] }), 'Payment is already rejected.')
      })
    })
    context('P/3 invalidate rejected payment', async () => {
      let recipient2PubK1: PublicKey
      let currentTime: number
      before(async () => {
        if (user[2].publicKey) {
          recipient2PubK1 = PublicKey.fromString(user[2].publicKey)
        }
        currentTime = Math.round(Date.now() / 1000)
      })
      it('should fail on key to name payment by invalidate action 1', async () => {
        await assertEOSErrorIncludesMessage(contract.invalidate(user[2].name, 0, { from: user[0] }), 'Payment is already rejected.')
      })
      it('should fail on key to name payment by invalisig action 2', async () => {
        const sigToName = signInvalidate(priKey1K1.toString(), mainNetChainId, contract.account.name, user[2].name, '0', currentTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.invalisig(user[2].name, 0, currentTime, sigToName, { from: user[0] }), 'Payment is already rejected.')
      })
      it('should fail on key to key payment 3', async () => {
        const sigToKey = signInvalidate(priKey1K1.toString(), mainNetChainId, contract.account.name, recipient2PubK1.toString(), '0', currentTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.invalisig(recipient2PubK1.toString(), 0, currentTime, sigToKey, { from: user[0] }), 'Payment is already rejected.')
      })
    })
    context('Q/1 invalidate finalized payment', async () => {
      let recipient2PubK1: PublicKey
      let currentTime: number
      before(async () => {
        if (user[2].publicKey) {
          recipient2PubK1 = PublicKey.fromString(user[2].publicKey)
        }
        currentTime = Math.round(Date.now() / 1000)
      })
      it('should fail on key to key payment 1', async () => {
        const sigToKey = signInvalidate(priKey1K1.toString(), mainNetChainId, contract.account.name, recipient2PubK1.toString(), '1', currentTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.invalisig(recipient2PubK1.toString(), 1, currentTime, sigToKey, { from: user[0] }), 'Payment is already finalized.')
      })
    })
    context('R/6 time expired payment', async () => {
      let recipient2PubK1: PublicKey
      let currentTime: number
      before(async () => {
        if (user[2].publicKey) {
          recipient2PubK1 = PublicKey.fromString(user[2].publicKey)
        }
        const currentMsTime = Date.now()
        currentTime = Math.round(currentMsTime / 1000)
        if (currentTime < in3Secs.end) {
          console.log(`\nWait for ${in3Secs.end * 1000 - currentMsTime + 100} ms to reach time limit`)
          await sleep(in3Secs.end * 1000 - currentMsTime + 100)
        }
        const r_name = await contract.pay2nameTable({ scope: user[1].name })
        chai.expect(r_name.rows.length).equal(2, 'Wrong amount of entries')
        chai.expect(r_name.rows[0].id).equal(2, 'Wrong id')
        chai.expect(r_name.rows[0].time).equal(in3Secs.end, 'Wrong time limit')
        chai.expect(r_name.rows[0].time).lessThanOrEqual(Math.round(Date.now() / 1000), 'Time limit not reached, yet')
        const r_key = await contract.pay2keyTable({ scope: recipient0Split.scope.toString() })
        chai.expect(r_key.rows.length).equal(2, 'Wrong amount of entries')
        chai.expect(r_key.rows[0].id).equal(0, 'Wrong id')
        chai.expect(r_key.rows[0].time).equal(in3Secs.end, 'Wrong time limit')
        chai.expect(r_key.rows[0].time).lessThanOrEqual(Math.round(Date.now() / 1000), 'Time limit not reached, yet')
      })
      it('should fail to invalidate on pay2name by invalidate action 1', async () => {
        await assertEOSErrorIncludesMessage(contract.invalidate(user[1].name, 2, { from: user[0] }), 'Time limit is already expired.')
      })
      it('should fail to invalidate on pay2name by invalisig action 2', async () => {
        const sigToName = signInvalidate(priKey1K1.toString(), mainNetChainId, contract.account.name, user[1].name, '0', currentTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.invalisig(user[1].name, 2, currentTime, sigToName, { from: user[0] }), 'Sender is not a public key.')
      })
      it('should fail to invalidate on pay2key 3', async () => {
        const sigToKey = signInvalidate(priKey1K1.toString(), mainNetChainId, contract.account.name, recipient0PubK1.toString(), '0', currentTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.invalisig(recipient0PubK1.toString(), 0, currentTime, sigToKey, { from: user[0] }), 'Time limit is already expired.')
      })
      it('should fail to finalize on pay2name by finalize action 4', async () => {
        await assertEOSErrorIncludesMessage(contract.finalize(user[1].name, 2, { from: user[0] }), 'Time limit is already expired.')
      })
      it('should fail to finalize on pay2name by finalizesig action 5', async () => {
        const sigToName = signFinalize(priKey1K1.toString(), mainNetChainId, contract.account.name, user[1].name, '0', currentTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.finalizesig(user[1].name, 2, currentTime, sigToName, { from: user[0] }), 'Sender is not a public key.')
      })
      it('should fail to finalize on pay2key 6', async () => {
        const sigToKey = signFinalize(priKey1K1.toString(), mainNetChainId, contract.account.name, recipient0PubK1.toString(), '0', currentTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.finalizesig(recipient0PubK1.toString(), 0, currentTime, sigToKey, { from: user[0] }), 'Time limit is already expired.')
      })
    })
  })

  // Pay off
  context('payoff payment', async () => {
    let recipient2PriK1: PrivateKey
    let recipient2PubK1: PublicKey
    let recipient2Split: { scope: bigint; tableVec: string }
    let id1_Base58: string
    let id2_Base58: string
    let id3_Base58: string
    before(async () => {
      // Get recipient2 keys
      recipient2PriK1 = PrivateKey.fromString(user[2].privateKey as string)
      recipient2PubK1 = recipient2PriK1.getPublicKey()
      recipient2Split = splitPubKeyToScopeAndTableVec(recipient2PubK1)

      // GEt id as base58 value
      id1_Base58 = base58.encode(numberTouInt64(BigInt(1)).reverse())
      id2_Base58 = base58.encode(numberTouInt64(BigInt(2)).reverse())
      id3_Base58 = base58.encode(numberTouInt64(BigInt(3)).reverse())
    })
    context('S/5 on reached time', async () => {
      let sig: string
      let currentTime: number
      let nameTableAmount: number
      let keyTableAmount: number
      before(async () => {
        currentTime = Math.round(Date.now() / 1000)
        sig = signPayOff(recipient0PriK1.toString(), mainNetChainId, contract.account.name, recipient0PubK1.toString(), user[0].name, '0', currentTime.toString()).sig
        nameTableAmount = stringToAsset((await contract.pay2nameTable({ scope: user[1].name, limit: 1, lowerBound: 2 })).rows[0].fund).amount
        keyTableAmount = stringToAsset((await contract.pay2keyTable({ scope: recipient0Split.scope.toString(), limit: 1, lowerBound: 0 })).rows[0].fund).amount
        chai.expect(nameTableAmount).greaterThan(0, 'No asset in pay2name table entry')
        chai.expect(keyTableAmount).greaterThan(0, 'No asset in pay2key table entry')
        ;[contractAsset, nirvanaAsset, user0Asset, user1Asset, user2Asset] = await getBalances([contract.account, nirvana, user[0], user[1], user[2]], sys_token)
      })
      it('should succeed to name by any account 1', async () => {
        await check.ramTrace(() => {
          return contract.payoff(user[1].name, 2, { from: user[3] })
        })
      })
      it('should update tables 2', async () => {
        await check.checkPayment2Name_NotExist(user[1].name, 2)
        const [newContractAsset, newuser0Asset, newuser1Asset, newuser2Asset] = await getBalances([contract.account, user[0], user[1], user[2]], sys_token)

        const reducedAmount = contractAsset.amount - newContractAsset.amount
        chai.expect(Math.abs(nameTableAmount - reducedAmount)).lessThan(100, 'Wrong asset amount withdrawn')
        chai.expect(newuser0Asset.amount - user0Asset.amount).equal(0, 'Changed balance of wrong user')
        chai.expect(newuser1Asset.amount - user1Asset.amount).equal(reducedAmount, 'User got wrong amount returned')
        chai.expect(newuser2Asset.amount - user2Asset.amount).equal(0, 'Changed balance of wrong user')
        user1Asset.amount = newuser1Asset.amount
        contractAsset.amount = newContractAsset.amount
      })
      it('should fail to key without sign 3', async () => {
        await assertEOSErrorIncludesMessage(contract.payoff(recipient0PubK1.toString(), 0, { from: user[3] }), 'Payment is not rejected.')
      })
      it('should fail to key by wrong sig 4', async () => {
        const wrongsig = signPayOff(recipient0PriK1.toString(), mainNetChainId, contract.account.name, recipient0PubK1.toString(), user[0].name, '1', currentTime.toString()).sig
        await shouldFail(contract.payoffsig(recipient0PubK1.toString(), 0, user[0].name, currentTime, wrongsig, { from: user[3] }))
      })
      it('should fail to key by non existing recipient 5', async () => {
        const notExistingUser_Name = 'idonotexist'
        const notExistingUser_sig = signPayOff(recipient0PriK1.toString(), mainNetChainId, contract.account.name, recipient0PubK1.toString(), notExistingUser_Name, '0', currentTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.payoffsig(recipient0PubK1.toString(), 0, notExistingUser_Name, currentTime, notExistingUser_sig, { from: user[3] }), 'Account does not exist.')
      })
      it('should succeed to key by any account 6', async () => {
        await check.ramTrace(() => {
          return contract.payoffsig(recipient0PubK1.toString(), 0, user[0].name, currentTime, sig, { from: user[3] })
        })
      })
      it('should update tables 7', async () => {
        await check.checkPayment2Key_NotExist(recipient0Split.scope.toString(), 2)
        const [newContractAsset, newuser0Asset, newuser1Asset, newuser2Asset] = await getBalances([contract.account, user[0], user[1], user[2]], sys_token)

        const reducedAmount = contractAsset.amount - newContractAsset.amount
        chai.expect(Math.abs(nameTableAmount - reducedAmount)).lessThan(100, 'Wrong asset amount withdrawn')
        chai.expect(newuser0Asset.amount - user0Asset.amount).equal(reducedAmount, 'User got wrong amount returned')
        chai.expect(newuser1Asset.amount - user1Asset.amount).equal(0, 'Changed balance of wrong user')
        chai.expect(newuser2Asset.amount - user2Asset.amount).equal(0, 'Changed balance of wrong user')
        user0Asset.amount = newuser0Asset.amount
        contractAsset.amount = newContractAsset.amount
      })
    })
    context('T/6 on finalized', async () => {
      let currentTime: number
      let finalize2NameAmount: number
      let finalizedKey2KeyAmount: number
      let finaliedName2KeyAmount: number
      let currentTimeBase58: string
      before(async () => {
        // Get current time
        currentTime = Math.round(Date.now() / 1000)
        currentTimeBase58 = base58.encode(numberTouInt32(currentTime).reverse())

        // Get pay to name table entry of an uncompleted payment
        const nameTableEntry = (await contract.pay2nameTable({ scope: user[2].name, limit: 1, lowerBound: 2 })).rows[0]
        if (!nameTableEntry) {
          throw `No entry for ${user[2].name} and id ${2}`
        }
        chai.expect(nameTableEntry.time).greaterThan(currentTime, 'Time limit already over in pay2name table entry')
        finalize2NameAmount = stringToAsset(nameTableEntry.fund).amount
        chai.expect(finalize2NameAmount).greaterThan(0, 'No asset in pay2name table entry')

        // Get entries to the key which is setted by code above
        const keyTableOwn1Entries = (await contract.pay2keyTable({ scope: splitKey1K1.scope.toString() })).rows
        if (keyTableOwn1Entries.length == 0) {
          throw `No entry for ${splitKey1K1.tableVec}`
        }

        // Get from name to key table entry of a finalized payment
        const finalizedName2KeyPayment = keyTableOwn1Entries[0]
        chai.expect(finalizedName2KeyPayment.id).equal(1, 'Wrong id')
        chai.expect(finalizedName2KeyPayment.time).equal(1, 'Not finalized')
        chai.expect(finalizedName2KeyPayment.from.length).equal(16, 'Sender on finalized payment is not a name')
        finaliedName2KeyAmount = stringToAsset(finalizedName2KeyPayment.fund).amount
        chai.expect(finaliedName2KeyAmount).greaterThan(0, 'No asset in finalized key2key table entry')

        // Get from key to key table entry of a finalized payment
        const keyTableEntries = await contract.pay2keyTable({ scope: recipient2Split.scope.toString(), lowerBound: 0 })
        const finalizedKey2KeyPayment = keyTableEntries.rows[1]
        chai.expect(finalizedKey2KeyPayment.id).equal(1, 'Wrong id')
        chai.expect(finalizedKey2KeyPayment.from.length).equal(68, 'Sender is not a name')
        chai.expect(finalizedKey2KeyPayment.time).equal(1, 'Not finalized')
        finalizedKey2KeyAmount = stringToAsset(finalizedKey2KeyPayment.fund).amount
        chai.expect(finalizedKey2KeyAmount).greaterThan(0, 'No asset in finalized key2key table entry')
        ;[contractAsset, nirvanaAsset, user0Asset, user1Asset, user2Asset] = await getBalances([contract.account, nirvana, user[0], user[1], user[2]], sys_token)
      })
      it('should fail to payoff to name before the time limit 1', async () => {
        await assertEOSErrorIncludesMessage(contract.payoff(user[2].name, 2, { from: user[3] }), 'The time limit has not expired, yet.')
      })

      it('should fail from name to key with payoff action 2', async () => {
        await assertEOSErrorIncludesMessage(contract.payoff(pubKey1K1.toString(), 1, { from: user[3] }), 'Payment is not rejected.')
      })
      it('should succeed from key to key with "OFF" parameter 3', async () => {
        const paraAsset = new Asset(1000, sys_token.symbol)
        await check.ramTrace(() => {
          const sig = signPayOff(recipient2PriK1.toString(), mainNetChainId, contract.account.name, recipient2PubK1.toString(), user[2].name, '1', currentTime.toString()).sig
          return sys_token.contract.transfer(user[0].name, contract.account.name, paraAsset.toString(), `OFF@${recipient2PubK1.toString()}#${id1_Base58}!${currentTimeBase58}~${sig}+${user[2].name}`, { from: user[0] })
        })
        user0Asset.amount -= paraAsset.amount
        contractAsset.amount += paraAsset.amount
      })
      it('should succeed from name to key by anyone 4', async () => {
        const sig = signPayOff(priKey1K1.toString(), mainNetChainId, contract.account.name, pubKey1K1.toString(), user[2].name, '1', currentTime.toString()).sig
        await check.ramTrace(() => {
          return contract.payoffsig(pubKey1K1.toString(), 1, user[2].name, currentTime, sig, { from: user[3] })
        })
      })
      it('should succeed finalize by "FIN" parameter 5', async () => {
        const paraAsset = new Asset(1000, sys_token.symbol)
        await check.ramTrace(() => {
          const sig_fin = signFinalize(priKey1K1.toString(), mainNetChainId, contract.account.name, user[2].name, '2', currentTime.toString()).sig
          return sys_token.contract.transfer(user[0].name, contract.account.name, paraAsset.toString(), `FIN@${user[2].name}#${id2_Base58}!${currentTimeBase58}~${sig_fin}`, { from: user[0] })
        })
        user0Asset.amount -= paraAsset.amount
        contractAsset.amount += paraAsset.amount
      })
      it('should update tables 6', async () => {
        await check.checkPayment2Name_NotExist(user[2].name, 2)
        const [newContractAsset, newuser0Asset, newuser1Asset, newuser2Asset] = await getBalances([contract.account, user[0], user[1], user[2]], sys_token)

        const sendAmount = finaliedName2KeyAmount + finalizedKey2KeyAmount + finalize2NameAmount
        const reducedAmount = contractAsset.amount - newContractAsset.amount
        chai.expect(Math.abs(sendAmount - reducedAmount)).lessThan(200, 'Wrong asset amount withdrawn')
        chai.expect(newuser0Asset.amount - user0Asset.amount).equal(0, 'Changed balance of user 0')
        chai.expect(newuser1Asset.amount - user1Asset.amount).equal(0, 'Changed balance of user 1')
        chai.expect(newuser2Asset.amount - user2Asset.amount).equal(reducedAmount, 'User got wrong amount returned')
        user2Asset.amount = newuser2Asset.amount
        contractAsset.amount = newContractAsset.amount
      })
    })
    context('U/10 on rejected', async () => {
      let currentTime: number
      let currentTimeBase58: string
      let minAsset: Asset
      before(async () => {
        currentTime = Math.round(Date.now() / 1000)
        currentTimeBase58 = base58.encode(numberTouInt32(currentTime).reverse())
        minAsset = new Asset(1, sys_token.symbol)
        ;[contractAsset, user0Asset, user1Asset, user2Asset] = await getBalances([contract.account, user[0], user[1], user[2]], sys_token)
      })
      it('should succeed from key to name payment 1', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `PAY${pubKey1K1.toString()}@${user[2].name}!${inOneDayBs58}`, { from: user[0] })
        })
      })
      it('should succeed rejection from key to name payment 2', async () => {
        await check.ramTrace(() => {
          return contract.reject(user[2].name, 3, { from: user[2] })
        })
      })
      it('should fail payoff rejected from key to name payment with payoff action 3', async () => {
        await assertEOSErrorIncludesMessage(contract.payoff(user[2].name, 3, { from: user[2] }), 'Payment is rejected, but sender is not an account name.')
      })
      it('should succeed payoff rejected from key to name payment via "OFF" transfer parameter 4', async () => {
        const sig = signPayOff(priKey1K1.toString(), mainNetChainId, contract.account.name, user[2].name, user[0].name, '3', currentTime.toString()).sig
        await check.ramTrace(async () => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, minAsset.toString(), `OFF@${user[2].name}#${id3_Base58}!${currentTimeBase58}~${sig}+${user[0].name}`, { from: user[0] })
        })
        user0Asset.amount -= minAsset.amount
      })
      it('should update tables 5', async () => {
        await check.checkPayment2Name_NotExist(user[2].name, 3)
        const [newContractAsset, newuser0Asset, newuser1Asset, newuser2Asset] = await getBalances([contract.account, user[0], user[1], user[2]], sys_token)

        const contractDelta = contractAsset.amount - newContractAsset.amount
        const user0Delta = newuser0Asset.amount - user0Asset.amount
        chai.expect(contractDelta != 0).equal(true, 'No fees, contract balance has not changed')
        chai.expect(user0Delta != 0).equal(true, 'No fees, user balance has not changed')
        chai.expect(Math.abs(user0Delta)).lessThan(10, 'User got wrong amount returned')
        chai.expect(Math.abs(contractDelta)).lessThan(10, 'Wrong contract balance')
        chai.expect(Math.abs(newuser0Asset.amount - user0Asset.amount)).lessThan(10, 'User got wrong amount returned')
        chai.expect(newuser1Asset.amount - user1Asset.amount).equal(0, 'Changed balance of user 1')
        chai.expect(newuser2Asset.amount - user2Asset.amount).equal(0, 'Changed balance of user 2')
        user0Asset.amount = newuser0Asset.amount
        contractAsset.amount = newContractAsset.amount
      })
      // Key to key
      it('should succeed from key to key payment 6', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `PAY${pubKey1K1.toString()}@${recipient2PubK1.toString()}!${inOneDayBs58}:key_K1 to key_user_2`, { from: user[0] })
        })
      })
      it('should succeed rejection from key to key payment with "REJ" parameter 7', async () => {
        const sig = signReject(recipient2PriK1.toString(), mainNetChainId, contract.account.name, hexWithTypeOfPubKey(pubKey1K1), '3', currentTime.toString()).sig
        await check.ramTrace(() => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, minAsset.toString(), `REJ@${recipient2PubK1.toString()}#${id3_Base58}!${currentTimeBase58}~${sig}`, { from: user[0] })
        })
        user0Asset.amount -= minAsset.amount
      })
      it('should succeed payoff rejected from key to key payment 8', async () => {
        await assertEOSErrorIncludesMessage(contract.payoff(recipient2PubK1.toString(), 3, { from: user[2] }), 'Payment is rejected, but sender is not an account name.')
      })
      it('should succeed payoff rejected from key to key payment via "OFF" transfer parameter 9', async () => {
        const sig = signPayOff(priKey1K1.toString(), mainNetChainId, contract.account.name, recipient2PubK1.toString(), user[0].name, '3', currentTime.toString()).sig
        await check.ramTrace(async () => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, minAsset.toString(), `OFF@${recipient2PubK1.toString()}#${id3_Base58}!${currentTimeBase58}~${sig}+${user[0].name}`, { from: user[0] })
        })
        user0Asset.amount -= minAsset.amount
      })
      it('should update tables 10', async () => {
        await check.checkPayment2Name_NotExist(user[2].name, 3)
        const [newContractAsset, newuser0Asset, newuser1Asset, newuser2Asset] = await getBalances([contract.account, user[0], user[1], user[2]], sys_token)

        const contractDelta = contractAsset.amount - newContractAsset.amount
        const user0Delta = newuser0Asset.amount - user0Asset.amount
        chai.expect(contractDelta != 0).equal(true, 'No fees, contract balance has not changed')
        chai.expect(user0Delta != 0).equal(true, 'No fees, user balance has not changed')
        chai.expect(Math.abs(user0Delta)).lessThan(10, 'User got wrong amount returned')
        chai.expect(Math.abs(contractDelta)).lessThan(10, 'Wrong contract balance')
        chai.expect(Math.abs(newuser0Asset.amount - user0Asset.amount)).lessThan(10, 'User got wrong amount returned')
        chai.expect(newuser1Asset.amount - user1Asset.amount).equal(0, 'Changed balance of user 1')
        chai.expect(newuser2Asset.amount - user2Asset.amount).equal(0, 'Changed balance of user 2')
        user0Asset.amount = newuser0Asset.amount
        contractAsset.amount = newContractAsset.amount
      })
    })
  })

  // Invalidate
  context('?/? invalidate payment', async () => {
    //TODO: use "INV" parameter as well
  })

  // TODO: Pay off all
  // TODO: Pay off new account

  context('?/? deposited RAM', async () => {
    //TODO:
  })
  // TODO: ...
})

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
function signReject(privateKey: string, chainId: string, contract_name: string, from: string, id: string, sigtime: string) {
  const raw = `${chainId} ${contract_name} reject ${from} ${id} ${sigtime}`
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
function signFinalize(privateKey: string, chainId: string, contract_name: string, to: string, id: string, sigtime: string) {
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
function signInvalidate(privateKey: string, chainId: string, contract_name: string, to: string, id: string, sigtime: string) {
  const raw = `${chainId} ${contract_name} finalize ${to} ${id} ${sigtime}`
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
function signPayOff(privateKey: string, chainId: string, contract_name: string, to: string, recipient: string, id: string, sigtime: string) {
  const raw = `${chainId} ${contract_name} payoff ${to} ${recipient} ${id} ${sigtime}`
  return { raw: raw, sig: ecc.sign(raw, privateKey) }
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
// REJ@to_pub #id !sig_time ~sig
// INV@to_pub #id !sig_time ~sig
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

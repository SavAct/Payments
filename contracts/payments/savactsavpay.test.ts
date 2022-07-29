/*  Attention: Even by setting skipSystemContracts to false, the test network seems not to provide all eosio.system actions like buyrambytes().
 *  Change "eosio" to "systemdummy" in eosioHandler.hpp to get around this provisionally and execute this test.
 *  Do not forget to set it back for production!
 */

import { ContractDeployer, assertRowsEqual, AccountManager, Account, Contract, assertEOSErrorIncludesMessage, assertMissingAuthority, EOSManager, debugPromise, assertRowsEqualStrict, assertRowCount, assertEOSException, assertEOSError, UpdateAuth, assertRowsContain, ContractLoader } from 'lamington'
import * as chai from 'chai'
import { Savactsavpay, SavactsavpayPay2key, SavactsavpayPay2name } from './savactsavpay'
import { EosioToken } from '../eosio.token/eosio.token'
import { Systemdummy } from '../systemdummy/systemdummy'
import { Serialize } from 'eosjs'
import { ecc } from 'eosjs/dist/eosjs-ecc-migration'
import { PublicKey } from 'eosjs/dist/PublicKey'
import { PrivateKey } from 'eosjs/dist/PrivateKey'
import { KeyType, publicKeyToString } from 'eosjs/dist/eosjs-numeric'
import { Symbol, Asset, numberTouInt32, stringToAsset, splitPubKeyToScopeAndTableVec, nameToFromHex, hexWithTypeOfPubKey } from '../../helpers/conversions'
import { getBalances, initToken, issueToken, shouldFail, Token, updateAuths } from '../../helpers/chainHandle'
import { Check } from '../../helpers/contractHandle'
import base58 = require('bs58')

let contract: Savactsavpay
let users: Array<Account>
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
    sys_contract.setramstate('10000000000.0000 RAMCORE', '234396016922 RAM', '6016100.1948 EOS')

    // Create accounts
    nirvana = await AccountManager.createAccount(nirvana_name)
    users = [await AccountManager.createAccount('user.zero'), await AccountManager.createAccount('user.one'), await AccountManager.createAccount('user.two')]
    if (!users[0].publicKey || !users[0].privateKey || !users[1].publicKey || !users[1].privateKey || !users[2].publicKey || !users[2].privateKey) {
      throw 'No key for user'
    }

    // Issue system tokens
    sys_token_acc = new Account(sys_token_acc_name, EOSManager.adminAccount.privateKey, EOSManager.adminAccount.publicKey)
    sys_token = {
      contract: await ContractLoader.at<EosioToken>(sys_token_acc),
      symbol: sys_token_symbol,
    }
    await issueToken(sys_token, [nirvana, users[0], users[1]], 10000000, EOSManager.adminAccount)

    // Deploy, initialize and issue a custom token
    custom_token = {
      contract: await ContractDeployer.deployWithName<EosioToken>('contracts/eosio.token/eosio.token', 'fiat.token'),
      symbol: new Symbol('FIAT', 2),
    }
    await initToken(custom_token)
    await issueToken(custom_token, [users[2], users[1]], 10000)

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

  // Payment via on_notify transfer
  let inOneDay: number
  let inOneDayBs58: string
  let sendAsset: Asset
  let sendAssetString: string

  context('transfer via memo', async () => {
    before(async () => {
      inOneDay = Math.round(Date.now() / 1000 + 3600 * 24)
      inOneDayBs58 = base58.encode(numberTouInt32(inOneDay).reverse())
      sendAsset = new Asset(10000, sys_token.symbol)
      sendAssetString = sendAsset.toString()
    })
    context('B/10 from name to name', async () => {
      it('should fail with wrong auth 1', async () => {
        await assertMissingAuthority(sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `@${users[1].name}.${inOneDayBs58}`, { from: users[1] }))
      })
      it('should succeed with correct auth 2', async () => {
        const [contractAsset, users0Asset, users1Asset] = await getBalances([contract.account, users[0], users[1]], sys_token)

        await check.ramTrace(async () => {
          return await sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `@${users[1].name}!${inOneDayBs58}`, { from: users[0] })
        }, false) // First use of scope "name" which will be paid by the contract

        const [newContractAsset, newusers0Asset, newusers1Asset] = await getBalances([contract.account, users[0], users[1]], sys_token)
        const sendAmount = users0Asset.amount - newusers0Asset.amount
        chai.expect(0).equal(users1Asset.amount - newusers1Asset.amount, 'Other user balance changed')
        chai.expect(sendAmount).equal(sendAsset.amount, 'User does not send the right amount of tokens')
        chai.expect(newContractAsset.amount - contractAsset.amount).equal(sendAsset.amount, 'Contract does not receive the right amount of tokens')
      })
      it('should update pay2name table 3', async () => {
        let {
          rows: [item],
        } = await contract.pay2nameTable({ scope: users[1].name })
        chai.expect(item.contract).equal(sys_token.contract.account.name, 'Wrong token contract')
        chai.expect(item.from).equal(nameToFromHex(users[0].name), 'Wrong sender')
        chai.expect(stringToAsset(item.fund).amount).below(sendAsset.amount, 'Send amount is wrong')
        chai.expect(String(item.id)).equal(String(0), 'Wrong id')
        chai.expect(item.memo).equal('', 'There should no memo be defined')
        chai.expect(item.ramBy).equal(contract.account.name, 'Wrong RAM payer')
        chai.expect(item.time).equal(inOneDay, 'Wrong timestamp')
      })
      it('should succeed with several signs in memo 4', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `@${users[1].name}!${inOneDayBs58};hello;!@$again`, { from: users[0] })
        })
        chai.expect((await contract.pay2nameTable({ scope: users[1].name })).rows.length).equal(2)
      })
      it('should fail with spaces between the commands 5', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `@${users[1].name} !${inOneDayBs58};withspaces`, { from: users[0] }), 'character is not in allowed character set for names')
      })
      it('should fail without time value 6', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `@${users[1].name}`, { from: users[0] }), 'Missing time limit.')
      })
      it('should fail without recipient 7', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `!${inOneDayBs58}`, { from: users[0] }), 'Recipient does not exists.')
      })
      it('should fail with a non existent recipient 8', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `@nonexistent!${inOneDayBs58}`, { from: users[0] }), 'Recipient does not exists.')
      })
      it('should fail with zero balance 9', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, '0.0000 EOS', `@${inOneDayBs58}!${inOneDayBs58}`, { from: users[0] }), 'must transfer positive quantity')
      })
      it('should fail with negative balance 10', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, '-' + sendAssetString, `@${inOneDayBs58}!${inOneDayBs58}`, { from: users[0] }), 'must transfer positive quantity')
      })
    })
    context('C/10 from key to name', async () => {
      it('should fail with invalid key length 1', async () => {
        const wrong_pubkeyLegacy = pubKey1K1.toLegacyString().substring(0, 10) + 'aa' + pubKey1K1.toLegacyString().substring(10)
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `${wrong_pubkeyLegacy}@${users[2].name}!${inOneDayBs58}`, { from: users[0] }), 'Invalid length of public key.')
      })
      it('should fail with typo in legacy key 2', async () => {
        const wrong_pubkeyLegacy = pubKey1K1.toLegacyString().substring(0, 10) + 'aaaaaa' + pubKey1K1.toLegacyString().substring(16)
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `${wrong_pubkeyLegacy}@${users[2].name}!${inOneDayBs58}`, { from: users[0] }), 'Wrong checksum, check the public key for typos.')
      })
      it('should succeed with legacy key 3', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `${pubKey1K1.toLegacyString()}@${users[2].name}!${inOneDayBs58}`, { from: users[0] })
        })
      })
      it('should fail with typo in K1 key 4', async () => {
        const wrong_pubkeyk1 = pubKey1K1.toString().substring(0, 10) + 'aaaaaa' + pubKey1K1.toString().substring(16)
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `${wrong_pubkeyk1}@${users[2].name}!${inOneDayBs58}`, { from: users[0] }), 'Wrong checksum, check the public key for typos.')
      })
      it('should succeed with K1 key 5', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `${pubKey1K1.toString()}@${users[2].name}!${inOneDayBs58}`, { from: users[0] })
        })
      })
      it('should succeed with memo 6', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `${pubKey1K1.toString()}@${users[2].name}!${inOneDayBs58};@new?key;format!`, { from: users[0] })
        })
      })
      it('should fail with R1 key 7', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `${pubKey1R1.toString()}@${users[2].name}!${inOneDayBs58}`, { from: users[0] }), 'Please, use a public key that beginns with EOS or PUB_K1_.')
      })
      it('should update pay2name table 8', async () => {
        const Key1Hex = pubKey1K1.toElliptic().getPublic(true, 'hex') + '00'
        let {
          rows: [item1, item2, item3],
        } = await contract.pay2nameTable({ scope: users[2].name })

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
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `${users[2].publicKey}@${users[2].name}`, { from: users[0] }), 'Missing time limit.')
      })
      it('should fail with a non existent recipient 10', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `${users[2].publicKey}@nonexistent!${inOneDayBs58}`, { from: users[0] }), 'Recipient does not exists.')
      })
    })
    context('D/9 from name to key', async () => {
      it('should fail with invalid key length 1', async () => {
        const wrong_pubkeyLegacy = pubKey1K1.toLegacyString().substring(0, 10) + 'aa' + pubKey1K1.toLegacyString().substring(10)
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `@${wrong_pubkeyLegacy}!${inOneDayBs58}`, { from: users[0] }), 'Invalid length of public key.')
      })
      it('should fail with typo in legacy key 2', async () => {
        const wrong_pubkeyLegacy = pubKey1K1.toLegacyString().substring(0, 10) + 'aaaaaa' + pubKey1K1.toLegacyString().substring(16)
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `@${wrong_pubkeyLegacy}!${inOneDayBs58}`, { from: users[0] }), 'Wrong checksum, check the public key for typos.')
      })
      it('should succeed with legacy key 3', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `@${pubKey1K1.toLegacyString()}!${inOneDayBs58}`, { from: users[0] })
        }, false) // First use of scope "key" which will be paid by the contract
      })
      it('should fail with typo in K1 key 4', async () => {
        const wrong_pubkeyk1 = pubKey1K1.toString().substring(0, 10) + 'aaaaaa' + pubKey1K1.toString().substring(16)
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `@${wrong_pubkeyk1}!${inOneDayBs58}`, { from: users[0] }), 'Wrong checksum, check the public key for typos.')
      })
      it('should succeed with K1 key 5', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `@${pubKey1K1.toString()}!${inOneDayBs58}`, { from: users[0] })
        })
      })
      it('should succeed with K1 memo 6', async () => {
        await check.ramTrace(async () => {
          return await sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `@${pubKey1K1.toString()}!${inOneDayBs58};@new?key;format!`, { from: users[0] })
        })
      })
      it('should fail with R1 key 7', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `@${pubKey1R1.toString()}!${inOneDayBs58}`, { from: users[0] }), 'Please, use a public key that beginns with EOS or PUB_K1_.')
      })
      it('should update pay2name table 8', async () => {
        let {
          rows: [item1, item2, item3],
        } = await contract.pay2keyTable({ scope: splitKey1K1.scope.toString() })

        const testPay2KeyTable = (item: SavactsavpayPay2key, id: number) => {
          chai.expect(item.contract).equal(sys_token.contract.account.name, 'Wrong token contract')
          chai.expect(item.from).equal(nameToFromHex(users[0].name), 'Wrong sender')
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
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `@${users[1].publicKey}`, { from: users[0] }), 'Missing time limit.')
      })
    })
    context('E/10 from key to key', async () => {
      let recipient2PubK1: PublicKey
      before(async () => {
        if (users[2].publicKey) {
          recipient2PubK1 = PublicKey.fromString(users[2].publicKey)
        }
      })
      it('should fail with invalid key length 1', async () => {
        const wrong_pubkeyLegacy = recipient2PubK1.toLegacyString().substring(0, 10) + 'aa' + recipient2PubK1.toLegacyString().substring(10)
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `${wrong_pubkeyLegacy}@${recipient2PubK1.toLegacyString()}!${inOneDayBs58}`, { from: users[0] }), 'Invalid length of public key.')
      })
      it('should fail with typo in legacy key 2', async () => {
        const wrong_pubkeyLegacy = recipient2PubK1.toLegacyString().substring(0, 10) + 'aaaaaa' + recipient2PubK1.toLegacyString().substring(16)
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `${wrong_pubkeyLegacy}@${recipient2PubK1.toLegacyString()}!${inOneDayBs58}`, { from: users[0] }), 'Wrong checksum, check the public key for typos.')
      })
      it('should succeed with legacy key 3', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `${pubKey1K1.toLegacyString()}@${recipient2PubK1.toLegacyString()}!${inOneDayBs58}`, { from: users[0] })
        })
      })
      it('should fail with typo in K1 key 4', async () => {
        const wrong_pubkeyk1 = pubKey1K1.toString().substring(0, 10) + 'aaaaaa' + pubKey1K1.toString().substring(16)
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `${wrong_pubkeyk1}@${recipient2PubK1.toString()}!${inOneDayBs58}`, { from: users[0] }), 'Wrong checksum, check the public key for typos.')
      })
      it('should succeed with K1 key 5', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `${pubKey1K1.toString()}@${recipient2PubK1.toString()}!${inOneDayBs58}`, { from: users[0] })
        })
      })
      it('should succeed with memo 6', async () => {
        await check.ramTrace(() => {
          return sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `${pubKey1K1.toString()}@${recipient2PubK1.toString()}!${inOneDayBs58};@new?key;format!`, { from: users[0] })
        })
      })
      it('should fail with R1 sender key 7', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `${pubKey1R1.toString()}@${recipient2PubK1.toString()}!${inOneDayBs58}`, { from: users[0] }), 'Please, use a public key that beginns with EOS or PUB_K1_.')
      })
      it('should fail with R1 sender and receiver key 8', async () => {
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `${pubKey1R1.toString()}@${recipient2PubK1.toString()}!${inOneDayBs58}`, { from: users[0] }), 'Please, use a public key that beginns with EOS or PUB_K1_.')
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
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(users[0].name, contract.account.name, sendAssetString, `${pubKey1R1.toString()}@${users[1].publicKey}`, { from: users[0] }), 'Missing time limit.')
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
      ;[contractAsset, user0Asset, user1Asset, user2Asset] = await getBalances([contract.account, users[0], users[1], users[2]], sys_token)
      const {
        rows: [item],
      } = await contract.pay2nameTable({ scope: users[1].name, lowerBound: 0, limit: 1 })
      storedAsset = stringToAsset(item.fund)
    })
    context('F/5 name to name', async () => {
      it('should fail with auth error by sender auth 1', async () => {
        await assertMissingAuthority(contract.reject(users[1].name, 0, { from: users[0] }))
      })
      it('should fail with auth error by contract auth 2', async () => {
        await assertMissingAuthority(contract.reject(users[1].name, 0, { from: contract.account }))
      })
      it('should succeed 3', async () => {
        await check.ramTrace(async () => {
          return await contract.reject(users[1].name, 0, { from: users[1] })
        })
      })
      it('should update tables 4', async () => {
        await check.checkPayment2Name_NotExist(users[1].name, 0)
        const [newContractAsset, newuser0Asset, newuser1Asset] = await getBalances([contract.account, users[0], users[1]], sys_token)

        chai.expect(storedAsset.amount).greaterThan(0, 'No asset in pay2name table entry')
        const sendAmount = contractAsset.amount - newContractAsset.amount
        chai.expect(sendAmount).greaterThanOrEqual(storedAsset.amount, 'Wrong asset amount withdrawel')
        chai.expect(newuser0Asset.amount - user0Asset.amount).equal(sendAmount, 'User got wrong amount returned')
        chai.expect(newuser1Asset.amount - newuser1Asset.amount).equal(0, 'Changed balance of wrong user')
        user0Asset.amount = newuser0Asset.amount
        contractAsset.amount = newContractAsset.amount
      })
      it('should fail to reject a not existing id 5', async () => {
        await assertEOSErrorIncludesMessage(contract.reject(users[1].name, 0, { from: users[1] }), 'Entry does not exist.')
      })
    })
    context('G/5 key to name', async () => {
      it('should fail with auth error by sender auth 1', async () => {
        await assertMissingAuthority(contract.reject(users[2].name, 0, { from: users[0] }))
      })
      it('should fail with auth error by contract auth 2', async () => {
        await assertMissingAuthority(contract.reject(users[2].name, 0, { from: contract.account }))
      })
      it('should succeed 3', async () => {
        await check.ramTrace(async () => {
          return await contract.reject(users[2].name, 0, { from: users[2] })
        })
      })
      it('should update tables 4', async () => {
        const {
          rows: [item],
        } = await contract.pay2nameTable({ scope: users[2].name, lowerBound: '0', limit: 1 })
        chai.expect(item.time).equal(0, 'Payment is not marked as rejected')

        const [newContractAsset, newuser0Asset, newuser2Asset] = await getBalances([contract.account, users[0], users[2]], sys_token)
        chai.expect(contractAsset.amount - newContractAsset.amount).equal(0, 'Changed balance')
        chai.expect(newuser0Asset.amount - user0Asset.amount).equal(0, 'Changed balance')
        chai.expect(newuser2Asset.amount - newuser2Asset.amount).equal(0, 'Changed balance')
        user0Asset.amount = newuser0Asset.amount
        contractAsset.amount = newContractAsset.amount
      })
      it('should fail to reject a not existing id 5', async () => {
        await assertEOSErrorIncludesMessage(contract.reject(users[2].name, 0, { from: users[2] }), 'The payment has already been rejected.')
      })
    })
    context('H/7 name to key', async () => {
      let sig: string
      let currentTime: number
      before(async () => {
        currentTime = Math.round(Date.now() / 1000)
        sig = signReject(priKey1K1.toString(), mainNetChainId, contract.account.name, users[0].name, '0', currentTime.toString()).sig
      })
      it('should fail with other time than signed 1', async () => {
        await shouldFail(contract.rejectsig(pubKey1K1.toString(), 0, currentTime - 1, sig, { from: users[3] }))
      })
      it('should fail with wrong signed public key 2', async () => {
        const wrongSig = signReject(users[0].privateKey as string, mainNetChainId, contract.account.name, users[0].name, '0', currentTime.toString()).sig
        await shouldFail(contract.rejectsig(pubKey1K1.toString(), 0, currentTime, wrongSig, { from: users[3] }))
      })
      it('should fail with too old time 3', async () => {
        const oldTime = Math.round(Date.now() / 1000) - 24 * 3600
        const oldTimeSig = signReject(priKey1K1.toString(), mainNetChainId, contract.account.name, users[0].name, '0', currentTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.rejectsig(pubKey1K1.toString(), 0, oldTime, oldTimeSig, { from: users[3] }), 'The transaction is expired.')
      })
      it('should fail with future time 4', async () => {
        const futureTime = Math.round(Date.now() / 1000) + 100
        const futureTimeSig = signReject(priKey1K1.toString(), mainNetChainId, contract.account.name, users[0].name, '0', currentTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.rejectsig(pubKey1K1.toString(), 0, futureTime, futureTimeSig, { from: users[3] }), 'The transaction is expired.')
      })
      it('should fail with other id than signed 5', async () => {
        await shouldFail(contract.rejectsig(pubKey1K1.toString(), 1, currentTime, sig, { from: users[3] }))
      })
      it('should succeed with any account 6', async () => {
        await check.ramTrace(async () => {
          return await contract.rejectsig(pubKey1K1.toString(), 0, currentTime, sig, { from: users[3] })
        })
      })
      it('should fail to reject a not existing id 7', async () => {
        await assertEOSErrorIncludesMessage(contract.rejectsig(pubKey1K1.toString(), 0, currentTime, sig, { from: users[2] }), 'Entry does not exist.')
      })
    })
    context('I/7 key to key', async () => {
      let sig: string
      let currentTime: number
      let recipient2PubK1: PublicKey
      before(async () => {
        currentTime = Math.round(Date.now() / 1000)
        if (users[2].publicKey) {
          recipient2PubK1 = PublicKey.fromString(users[2].publicKey)
        }
        const fromhex = hexWithTypeOfPubKey(pubKey1K1)
        const sigData = signReject(users[2].privateKey as string, mainNetChainId, contract.account.name, fromhex, '0', currentTime.toString())
        sig = sigData.sig
      })
      it('should fail with other time than signed 1', async () => {
        await shouldFail(contract.rejectsig(recipient2PubK1.toString(), 0, currentTime - 1, sig, { from: users[1] }))
      })
      it('should fail with wrong signed public key 2', async () => {
        const wrongSig = signReject(users[0].privateKey as string, mainNetChainId, contract.account.name, users[0].name, '0', currentTime.toString()).sig
        await shouldFail(contract.rejectsig(recipient2PubK1.toString(), 0, currentTime, wrongSig, { from: users[1] }))
      })
      it('should fail with too old time 3', async () => {
        const oldTime = Math.round(Date.now() / 1000) - 24 * 3600
        const oldTimeSig = signReject(priKey1K1.toString(), mainNetChainId, contract.account.name, users[0].name, '0', currentTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.rejectsig(recipient2PubK1.toString(), 0, oldTime, oldTimeSig, { from: users[1] }), 'The transaction is expired.')
      })
      it('should fail with future time 4', async () => {
        const futureTime = Math.round(Date.now() / 1000) + 100
        const futureTimeSig = signReject(priKey1K1.toString(), mainNetChainId, contract.account.name, users[0].name, '0', currentTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.rejectsig(recipient2PubK1.toString(), 0, futureTime, futureTimeSig, { from: users[1] }), 'The transaction is expired.')
      })
      it('should fail with other id than signed 5', async () => {
        await shouldFail(contract.rejectsig(recipient2PubK1.toString(), 1, currentTime, sig, { from: users[1] }))
      })
      it('should succeed with any account 6', async () => {
        await check.ramTrace(async () => {
          return await contract.rejectsig(recipient2PubK1.toString(), 0, currentTime, sig, { from: users[1] })
        })
      })
      it('should fail to reject a not existing id 7', async () => {
        await assertEOSErrorIncludesMessage(contract.rejectsig(recipient2PubK1.toString(), 0, currentTime, sig, { from: users[2] }), 'The payment has already been rejected.')
      })
    })
  })

  // finish payment
  context('finish payment', async () => {
    let contractAsset: Asset
    let nirvanaAsset: Asset
    let user0Asset: Asset
    let user1Asset: Asset
    let user2Asset: Asset
    let storedAsset: Asset
    before(async () => {
      ;[contractAsset, nirvanaAsset, user0Asset, user1Asset, user2Asset] = await getBalances([contract.account, nirvana, users[0], users[1], users[2]], sys_token)
      const {
        rows: [item],
      } = await contract.pay2nameTable({ scope: users[1].name, lowerBound: 1, limit: 1 })
      storedAsset = stringToAsset(item.fund)
    })
    context('J/5 name to name', async () => {
      it('should fail with auth error by sender auth 1', async () => {
        await assertMissingAuthority(contract.finalize(users[1].name, 1, { from: users[2] }))
      })
      it('should fail with auth error by contract auth 2', async () => {
        await assertMissingAuthority(contract.finalize(users[1].name, 1, { from: contract.account }))
      })
      it('should succeed 3', async () => {
        await check.ramTrace(async () => {
          return await contract.finalize(users[1].name, 1, { from: users[0] })
        })
      })
      it('should update tables 4', async () => {
        await check.checkPayment2Name_NotExist(users[1].name, 1)
        const [newContractAsset, newNirvanaAsset, newuser0Asset, newuser1Asset, newuser2Asset] = await getBalances([contract.account, nirvana, users[0], users[1], users[1]], sys_token)

        chai.expect(storedAsset.amount).greaterThan(0, 'No asset in pay2name table entry')
        const sendToNirvana = newNirvanaAsset.amount - nirvanaAsset.amount
        const reducedContractAmount = contractAsset.amount - newContractAsset.amount
        chai.expect(reducedContractAmount).greaterThanOrEqual(storedAsset.amount, 'Wrong asset amount withdrawel')
        chai.expect(newuser0Asset.amount - newuser0Asset.amount).equal(0, 'Changed balance of wrong user')
        chai.expect(newuser2Asset.amount - newuser2Asset.amount).equal(0, 'Changed balance of wrong user')
        chai.expect(newuser1Asset.amount - user1Asset.amount).greaterThanOrEqual(storedAsset.amount, 'User got less amount than noted in table')
        chai.expect(newuser1Asset.amount - user1Asset.amount).equal(reducedContractAmount - sendToNirvana, 'User got wrong amount returned')
        user1Asset.amount = newuser1Asset.amount
        contractAsset.amount = newContractAsset.amount
        nirvanaAsset.amount = newNirvanaAsset.amount
      })
      it('should fail to finalize a not existing id 5', async () => {
        await assertEOSErrorIncludesMessage(contract.finalize(users[1].name, 1, { from: users[0] }), 'Entry does not exist.')
      })
    })
    context('K/5 name to key', async () => {
      it('should fail with auth error by sender auth 1', async () => {
        await assertMissingAuthority(contract.finalize(pubKey1K1.toString(), 1, { from: users[2] }))
      })
      it('should fail with auth error by contract auth 2', async () => {
        await assertMissingAuthority(contract.finalize(pubKey1K1.toString(), 1, { from: contract.account }))
      })
      it('should succeed 3', async () => {
        await check.ramTrace(async () => {
          return await contract.finalize(pubKey1K1.toString(), 1, { from: users[0] })
        })
      })
      it('should update tables 4', async () => {
        const {
          rows: [item],
        } = await contract.pay2keyTable({ scope: splitKey1K1.scope.toString(), lowerBound: '1', limit: 1 })
        chai.expect(item.time).equal(1, 'Payment is not marked as finished')

        const [newContractAsset, newuser0Asset, newuser1Asset, newuser2Asset] = await getBalances([contract.account, users[0], users[1], users[2]], sys_token)
        chai.expect(contractAsset.amount - newContractAsset.amount).equal(0, 'Changed balance')
        chai.expect(newuser0Asset.amount - user0Asset.amount).equal(0, 'Changed balance')
        chai.expect(newuser1Asset.amount - user1Asset.amount).equal(0, 'Changed balance')
        chai.expect(newuser2Asset.amount - newuser2Asset.amount).equal(0, 'Changed balance')
        user0Asset.amount = newuser0Asset.amount
        contractAsset.amount = newContractAsset.amount
      })
      it('should fail to finalize a not existing id 5', async () => {
        await assertEOSErrorIncludesMessage(contract.finalize(pubKey1K1.toString(), 1, { from: users[0] }), 'Time limit is already expired.')
      })
    })
    context('L/7 key to name', async () => {
      let sig: string
      let currentTime: number
      before(async () => {
        currentTime = Math.round(Date.now() / 1000)
        sig = signFinalize(priKey1K1.toString(), mainNetChainId, contract.account.name, users[2].name, '1', currentTime.toString()).sig
      })
      it('should fail with other time than signed 1', async () => {
        await shouldFail(contract.finalizesig(users[2].name, 1, currentTime - 1, sig, { from: users[3] }))
      })
      it('should fail with wrong signed public key 2', async () => {
        const wrongSig = signFinalize(priKey1K1.toString() as string, mainNetChainId, contract.account.name, users[0].name, '1', currentTime.toString()).sig
        await shouldFail(contract.finalizesig(users[2].name, 1, currentTime, wrongSig, { from: users[3] }))
      })
      it('should fail with too old time 3', async () => {
        const oldTime = Math.round(Date.now() / 1000) - 24 * 3600
        const oldTimeSig = signFinalize(priKey1K1.toString(), mainNetChainId, contract.account.name, users[2].name, '1', oldTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.finalizesig(users[2].name, 1, oldTime, oldTimeSig, { from: users[3] }), 'The transaction is expired.')
      })
      it('should fail with future time 4', async () => {
        const futureTime = Math.round(Date.now() / 1000) + 100
        const futureTimeSig = signFinalize(priKey1K1.toString(), mainNetChainId, contract.account.name, users[2].name, '1', futureTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.finalizesig(users[2].name, 1, futureTime, futureTimeSig, { from: users[3] }), 'The transaction is expired.')
      })
      it('should fail with other id than signed 5', async () => {
        await shouldFail(contract.finalizesig(users[2].name, 2, currentTime, sig, { from: users[3] }))
      })
      it('should succeed with any account 6', async () => {
        await check.ramTrace(async () => {
          return await contract.finalizesig(users[2].name, 1, currentTime, sig, { from: users[3] })
        }, false) // user.two has no eosio.token entry, yet. So the RAM will be used to open an entry for 240 bytes
      })
      it('should update tables 7', async () => {
        await check.checkPayment2Name_NotExist(users[2].name, 1)
        const [newContractAsset, newNirvanaAsset, newuser0Asset, newuser1Asset, newuser2Asset] = await getBalances([contract.account, nirvana, users[0], users[1], users[2]], sys_token)

        chai.expect(storedAsset.amount).greaterThan(0, 'No asset in pay2name table entry')
        const sendToNirvana = newNirvanaAsset.amount - nirvanaAsset.amount
        const reducedContractAmount = contractAsset.amount - newContractAsset.amount
        chai.expect(reducedContractAmount).greaterThanOrEqual(storedAsset.amount, 'Wrong asset amount withdrawel')
        chai.expect(newNirvanaAsset.amount - nirvanaAsset.amount).equal(0, 'Changed balance of wrong user')
        chai.expect(newuser0Asset.amount - newuser0Asset.amount).equal(0, 'Changed balance of wrong user')
        chai.expect(newuser1Asset.amount - newuser1Asset.amount).equal(0, 'Changed balance of wrong user')
        chai.expect(newuser2Asset.amount - user2Asset.amount).equal(reducedContractAmount, 'User got wrong amount returned') // Released RAM is used for new Token entry of user.two
        user2Asset.amount = newuser2Asset.amount
        contractAsset.amount = newContractAsset.amount
      })
      it('should fail to finalize a not existing id 8', async () => {
        await assertEOSErrorIncludesMessage(contract.finalizesig(users[2].name, 1, currentTime, sig, { from: users[2] }), 'Entry does not exist.')
      })
    })
    context('M/7 key to key', async () => {
      let sig: string
      let currentTime: number
      let recipient2PubK1: PublicKey
      before(async () => {
        currentTime = Math.round(Date.now() / 1000)
        if (users[2].publicKey) {
          recipient2PubK1 = PublicKey.fromString(users[2].publicKey)
        }
        sig = signFinalize(priKey1K1.toString() as string, mainNetChainId, contract.account.name, recipient2PubK1.toString(), '1', currentTime.toString()).sig
      })
      it('should fail with other time than signed 1', async () => {
        await shouldFail(contract.finalizesig(recipient2PubK1.toString(), 1, currentTime - 1, sig, { from: users[1] }))
      })
      it('should fail with wrong signed public key 2', async () => {
        const wrongSig = signFinalize(users[0].privateKey as string, mainNetChainId, contract.account.name, recipient2PubK1.toString(), '1', currentTime.toString()).sig
        await shouldFail(contract.finalizesig(recipient2PubK1.toString(), 1, currentTime, wrongSig, { from: users[1] }))
      })
      it('should fail with too old time 3', async () => {
        const oldTime = Math.round(Date.now() / 1000) - 24 * 3600
        const oldTimeSig = signFinalize(priKey1K1.toString(), mainNetChainId, contract.account.name, recipient2PubK1.toString(), '1', currentTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.finalizesig(recipient2PubK1.toString(), 1, oldTime, oldTimeSig, { from: users[1] }), 'The transaction is expired.')
      })
      it('should fail with future time 4', async () => {
        const futureTime = Math.round(Date.now() / 1000) + 100
        const futureTimeSig = signFinalize(priKey1K1.toString(), mainNetChainId, contract.account.name, recipient2PubK1.toString(), '1', currentTime.toString()).sig
        await assertEOSErrorIncludesMessage(contract.finalizesig(recipient2PubK1.toString(), 1, futureTime, futureTimeSig, { from: users[1] }), 'The transaction is expired.')
      })
      it('should fail with other id than signed 5', async () => {
        await shouldFail(contract.finalizesig(recipient2PubK1.toString(), 2, currentTime, sig, { from: users[1] }))
      })
      it('should succeed with any account 6', async () => {
        await check.ramTrace(async () => {
          return await contract.finalizesig(recipient2PubK1.toString(), 1, currentTime, sig, { from: users[1] })
        })
      })
      it('should fail to finalize an already finalized payment 7', async () => {
        await assertEOSErrorIncludesMessage(contract.finalizesig(recipient2PubK1.toString(), 1, currentTime, sig, { from: users[2] }), 'Time limit is already expired.')
      })
      it('should succeed with legacy key 8', async () => {
        const sigLegacy = signFinalize(priKey1K1.toString() as string, mainNetChainId, contract.account.name, recipient2PubK1.toLegacyString(), '2', currentTime.toString()).sig
        await check.ramTrace(async () => {
          return await contract.finalizesig(recipient2PubK1.toLegacyString(), 2, currentTime, sigLegacy, { from: users[1] })
        })
      })
    })
  })
  context('?/? invalidate payment', async () => {
    //TODO:
  })
  context('?/? deposited RAM', async () => {
    //TODO:
  })
  // TODO: ...
})

/**
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

/*  Attention: Even by setting skipSystemContracts to false, the test network seems not to provide all eosio.system actions like buyrambytes().
 *  Change "eosio" to "systemdummy" in eosioHandler.hpp by setting "#define dev" in "savactsavpay.hpp" to get around this provisionally and execute this test.
 *  Do not forget to remove "#define dev" for production mode!
 */

import { ContractDeployer, assertRowsEqual, AccountManager, Account, Contract, assertEOSErrorIncludesMessage, assertMissingAuthority, EOSManager, debugPromise, assertRowsEqualStrict, assertRowCount, assertEOSException, assertEOSError, UpdateAuth, assertRowsContain, ContractLoader, sleep } from 'lamington'
import * as chai from 'chai'
import { Savactsavpay, SavactsavpayLink, SavactsavpayOptionData, SavactsavpayPay2key, SavactsavpayPay2name, SavactsavpayRam, SavactsavpayVotes } from './savactsavpay'
import { EosioToken } from '../eosio.token/eosio.token'
import { Systemdummy } from '../systemdummy/systemdummy'
import { PublicKey } from 'eosjs/dist/PublicKey'
import { PrivateKey } from 'eosjs/dist/PrivateKey'
import { Symbol, Asset, numberToUInt32, stringToAsset, splitPubKeyToScopeAndTableVec, nameToFromHex, hexWithTypeOfPubKey, numberToUInt64, toUInt32ToBase58, nameToUint64 } from '../../helpers/conversions'
import { getBalance, getBalances, initToken, issueToken, shouldFail, Token, updateAuths } from '../../helpers/chainHandle'
import { Check } from '../../helpers/contractHandle'
import { signExtend, signFinalize, signInvalidate, signPayOff, signPayOffAll, signPayOffNewAcc, signReject } from '../../helpers/signFunctions'
import * as base58 from 'bs58'
import { Serialize } from 'eosjs'
import { SerialBuffer, arrayToHex, hexToUint8Array } from 'eosjs/dist/eosjs-serialize'

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
const mainNetChainId = '8be32650b763690b95b7d7e32d7637757a0a7392ad04f1c393872e525a2ce82b' // mainnet: 'aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906'

let inOneDay: number = Math.round(Date.now() / 1000 + 3600 * 24)
let inTwoDays: number = Math.round(Date.now() / 1000 + 3600 * 24 * 2)
let inOneDayBs58: string = toUInt32ToBase58(inOneDay)
let inTwoDaysBs58: string = toUInt32ToBase58(inTwoDays)
let sendAsset: Asset = new Asset(10000, sys_token_symbol)
let sendAssetString: string = sendAsset.toString()

function testContractIni() {
  describe('Initilaize system', () => {
    before(async () => {
      EOSManager.initWithDefaults()

      // Deploy and initialize system dummy contract
      const sys_contract = await ContractDeployer.deployWithName<Systemdummy>('contracts/systemdummy/systemdummy', 'systemdummy')
      await updateAuths(sys_contract.account)
      sys_contract.setramstate('10000000000.0000 RAMCORE', '235437088517 RAM', '6048272.9978 EOS')

      // Create accounts
      nirvana = await AccountManager.createAccount(nirvana_name)
      user = [
        await AccountManager.createAccount('user.zero', { privateKey: '5KUbBzUD3kDRSQ4riyCNqJePG7kGZqRdQUXN2z8WKaZXMWDTe6e' }),
        await AccountManager.createAccount('user.one', { privateKey: '5K4MTxjPbRhDJNsRf5VRmapmrLR67cs1ZpWmsT8vsFMgxA2k59q' }),
        await AccountManager.createAccount('user.two', { privateKey: '5JMCs2kv3gWv3FudmxWLuubDHjU15S4dNcNFeh4J9BBDXXBKUrq' }),
        await AccountManager.createAccount('user.three', { privateKey: '5HxyviT4hHpGEcLmMEjZvjkUdcawgBoz4hk1HKYnQjQ2hpvZ4pa' }),
        await AccountManager.createAccount('user.four', { privateKey: '5KSygi1NJHiMSxAdzfSNEsn7nscSAMpxKf9FgXnoAnsZZFWfYsS' }),
        await AccountManager.createAccount('user.five', { privateKey: '5JArry2Uua7TCbsRumzU9aXchA4K1v4MtcsDfhak4xPzb6TLMRQ' }),
        await AccountManager.createAccount('user.six', { privateKey: '5HrB5DZPxjzAYoD1LXn9vPMUkLaVbpyTaEC9ecabvyXzrLxLiCr' }),
        await AccountManager.createAccount('user.seven', { privateKey: '5KQPkDm1Whh6KnwNG3YD4sy4aMN62KjZQEjQap95xVizStbfMP3' }),
        await AccountManager.createAccount('user.eight', { privateKey: '5J3VMi3R477dXd9ieoVacV8JWf6fTrqX5whgHqAVQ1LWnwG8Fx1' }),
      ]
      // Check if all keys are available
      for (let u of user) {
        if (!u.publicKey || !u.privateKey) {
          throw 'No key for ' + u.name
        }
      }

      // Issue system tokens
      sys_token_acc = new Account(sys_token_acc_name, EOSManager.adminAccount.privateKey, EOSManager.adminAccount.publicKey)
      sys_token = {
        contract: await ContractLoader.at<EosioToken>(sys_token_acc),
        symbol: sys_token_symbol,
      }
      await issueToken(sys_token, [nirvana, user[0], user[1], user[3], user[4], user[6], user[7]], 10000000, EOSManager.adminAccount) // No tokens for user[2], user[5] and user[8] on purpose

      // Deploy SavPay and set eosio.code permission
      contract = await ContractDeployer.deployWithName<Savactsavpay>('contracts/payments/savactsavpay', savpay_contract_name)
      await updateAuths(contract.account)
      check = new Check(contract)
    })

    // Set system token to accepted list
    context('set system token to accepted list', async () => {
      it('should fail with auth error 1', async () => {
        await assertMissingAuthority(contract.settoken(sys_token.contract.account.name, sys_token.symbol.toString(), 240, true, { from: sys_token.contract.account }))
      })
      it('should succeed 2', async () => {
        await contract.settoken(sys_token.contract.account.name, sys_token.symbol.toString(), 240, true, { from: contract.account })
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
}

function testPaymentSystem() {
  describe('System token', () => {
    context('accept settings', async () => {
      context('A/6 add system token', async () => {
        it('should fail to deactivate with auth error 1', async () => {
          await assertMissingAuthority(contract.settoken(sys_token.contract.account.name, sys_token.symbol.toString(), 240, false, { from: sys_token.contract.account }))
        })
        it('should succeed to deactivate it 2', async () => {
          await contract.settoken(sys_token.contract.account.name, sys_token.symbol.toString(), 240, false, { from: contract.account })
        })
        it('should update tokens table 3', async () => {
          let {
            rows: [item],
          } = await contract.tokensTable({ scope: sys_token.contract.account.name })
          chai.expect(item.token).equal(sys_token.symbol.toString(), 'Wrong token contract')
          chai.expect(item.openBytes).equal(240, 'Wrong byte number to open a token entry per user')
          chai.expect(item.active).equal(false, 'Token is still accepted')
        })
        it('should fail to send payment 4', async () => {
          await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@${user[1].name}!${inOneDayBs58}`, { from: user[0] }), 'Token is not accepted.')
        })
        it('should fail to activate with auth error 5', async () => {
          await assertMissingAuthority(contract.settoken(sys_token.contract.account.name, sys_token.symbol.toString(), 240, true, { from: sys_token.contract.account }))
        })
        it('should succeed to activate it 6', async () => {
          await contract.settoken(sys_token.contract.account.name, sys_token.symbol.toString(), 240, true, { from: contract.account })
        })
        it('should update tokens table 7', async () => {
          let {
            rows: [item],
          } = await contract.tokensTable({ scope: sys_token.contract.account.name })
          chai.expect(item.token).equal(sys_token.symbol.toString(), 'Wrong token contract')
          chai.expect(item.openBytes).equal(240, 'Wrong byte number to open a token entry per user')
          chai.expect(item.active).equal(true, 'Token is still not accepted')
        })
      })
    })

    // Payment via on_notify transfer
    context('transfer via memo', async () => {
      context('B/10 from name to name', async () => {
        it('should fail with wrong auth 1', async () => {
          await assertMissingAuthority(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@${user[1].name}.${inOneDayBs58}`, { from: user[1] }))
        })
        it('should succeed with correct auth 2', async () => {
          const [contractAsset, users0Asset, users1Asset] = await getBalances([contract.account, user[0], user[1]], sys_token)

          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@${user[1].name}!${inOneDayBs58}`, { from: user[0] })
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
          chai.expect(item.orisent).equal(sendAsset.amount, 'Originally sent amount is wrong')
          chai.expect(String(item.id)).equal(String(0), 'Wrong id')
          chai.expect(item.memo).equal('', 'There should no memo be defined')
          chai.expect(item.ramBy).equal(contract.account.name, 'Wrong RAM payer')
          chai.expect(item.time).equal(inOneDay, 'Wrong timestamp')
          chai.expect(item.type).equal(0, 'Type is not payment type')
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
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${pubKey1K1.toString()}@${user[2].name}!${inOneDayBs58};@new?key;format! from k1 to user_2`, { from: user[0] })
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
            chai.expect(item.orisent).equal(sendAsset.amount, 'Originally sent amount is wrong')
            chai.expect(String(item.id)).equal(String(id), 'Wrong id') // id = ((uint64_t)from.data()) ^ ((currentTime << 32)  & tapos_block_prefix()); if id is already taken then id-- until it is unused
            if (item.memo) {
              chai.expect(item.memo).equal('@new?key;format! from k1 to user_2', 'The memo is wrong')
            } else {
              chai.expect(item.memo).equal('', 'There should no memo be defined')
            }
            chai.expect(item.ramBy).equal(contract.account.name, 'Wrong RAM payer')
            chai.expect(item.time).equal(inOneDay, 'Wrong timestamp')
            chai.expect(item.type).equal(0, 'Type is not payment type')
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
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@${pubKey1K1.toString()}!${inOneDayBs58};@new?key;format! from user_0 to k1`, { from: user[0] })
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
            chai.expect(item.orisent).equal(sendAsset.amount, 'Originally sent amount is wrong')
            chai.expect(String(item.id)).equal(String(id), 'Wrong id')
            if (item.memo) {
              chai.expect(item.memo).equal('@new?key;format! from user_0 to k1', 'The memo is wrong')
            } else {
              chai.expect(item.memo).equal('', 'There should no memo be defined')
            }
            chai.expect(item.ramBy).equal(contract.account.name, 'Wrong RAM payer')
            chai.expect(item.time).equal(inOneDay, 'Wrong timestamp')
            chai.expect(item.to).equal(splitKey1K1.tableVec, 'Wrong recipient pub key')
            chai.expect(item.type).equal(0, 'Type is not payment type')
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
          } else {
            console.error('No public key for user 2')
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
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${pubKey1K1.toString()}@${recipient2PubK1.toString()}!${inOneDayBs58};@new?key;format! from k1 to k1_2`, { from: user[0] })
          })
        })
        it('should fail with R1 sender key 7', async () => {
          await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${pubKey1R1.toString()}@${recipient2PubK1.toString()}!${inOneDayBs58}`, { from: user[0] }), 'Please, use a public key that beginns with EOS or PUB_K1_.')
        })
        it('should fail with R1 sender and receiver key 8', async () => {
          await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${pubKey1R1.toString()}@${recipient2PubK1.toString()}!${inOneDayBs58}`, { from: user[0] }), 'Please, use a public key that beginns with EOS or PUB_K1_.')
        })
        it('should update pay2key table 9', async () => {
          const splitKey3K1 = splitPubKeyToScopeAndTableVec(recipient2PubK1)
          const Key1Hex = pubKey1K1.toElliptic().getPublic(true, 'hex') + '00'
          let {
            rows: [item1, item2, item3],
          } = await contract.pay2keyTable({ scope: splitKey3K1.scope.toString() })

          const testPay2KeyTable = (item: SavactsavpayPay2key, id: number) => {
            chai.expect(item.contract).equal(sys_token.contract.account.name, 'Wrong token contract')
            chai.expect(String(item.id)).equal(String(id), 'Wrong id')
            chai.expect(item.from).equal(Key1Hex, 'Wrong sender on id ' + id)
            chai.expect(stringToAsset(item.fund).amount).below(sendAsset.amount, 'Send amount is wrong')
            chai.expect(item.orisent).equal(sendAsset.amount, 'Originally sent amount is wrong')
            if (item.memo) {
              chai.expect(item.memo).equal('@new?key;format! from k1 to k1_2', 'The memo is wrong')
            } else {
              chai.expect(item.memo).equal('', 'There should no memo be defined')
            }
            chai.expect(item.ramBy).equal(contract.account.name, 'Wrong RAM payer')
            chai.expect(item.time).equal(inOneDay, 'Wrong timestamp')
            chai.expect(item.to).equal(splitKey3K1.tableVec, 'Wrong recipient pub key')
            chai.expect(item.type).equal(0, 'Type is not payment type')
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
            return contract.reject(user[1].name, 0, { from: user[1] })
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
      context('G/6 key to name', async () => {
        it('should fail with auth error by sender auth 1', async () => {
          await assertMissingAuthority(contract.reject(user[2].name, 0, { from: user[0] }))
        })
        it('should fail with auth error by contract auth 2', async () => {
          await assertMissingAuthority(contract.reject(user[2].name, 0, { from: contract.account }))
        })
        it('should succeed 3', async () => {
          await check.ramTrace(async () => {
            return contract.reject(user[2].name, 0, { from: user[2] })
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
        it('should fail to reject an already rejected payment 5', async () => {
          await assertEOSErrorIncludesMessage(contract.reject(user[2].name, 0, { from: user[2] }), 'The payment has already been rejected.')
        })
        it('should fail to extend an already rejected payment 6', async () => {
          await assertEOSErrorIncludesMessage(contract.extend(user[2].name, 0, inTwoDays + 3600, { from: user[2] }), 'Payment is already rejected.')
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
            return contract.rejectsig(pubKey1K1.toString(), 0, currentTime, sig, { from: user[3] })
          })
        })
        it('should fail to reject a not existing id 7', async () => {
          await assertEOSErrorIncludesMessage(contract.rejectsig(pubKey1K1.toString(), 0, currentTime, sig, { from: user[2] }), 'Entry does not exist.')
        })
      })
      context('I/8 key to key', async () => {
        let sig: string
        let currentTime: number
        let recipient2PubK1: PublicKey
        let recipient2PriK1: PrivateKey
        before(async () => {
          currentTime = Math.round(Date.now() / 1000)
          if (user[2].publicKey) {
            recipient2PubK1 = PublicKey.fromString(user[2].publicKey)
          }
          if (user[2].privateKey) {
            recipient2PriK1 = PrivateKey.fromString(user[2].privateKey)
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
            return contract.rejectsig(recipient2PubK1.toString(), 0, currentTime, sig, { from: user[1] })
          })
        })
        it('should fail to reject payment an already rejected payment 7', async () => {
          await assertEOSErrorIncludesMessage(contract.rejectsig(recipient2PubK1.toString(), 0, currentTime, sig, { from: user[2] }), 'The payment has already been rejected.')
        })
        it('should fail to extend an already rejected payment 8', async () => {
          const cT = Math.round(Date.now() / 1000)
          const tSig = signExtend(recipient2PriK1.toString(), mainNetChainId, contract.account.name, (inTwoDays + 3600).toString(), hexWithTypeOfPubKey(recipient2PubK1), (0).toString(), cT.toString()).sig
          await assertEOSErrorIncludesMessage(contract.extendsig(recipient2PubK1.toString(), 0, inTwoDays + 3600, cT, tSig, { from: user[2] }), 'Payment is already rejected.')
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
            return contract.finalize(user[1].name, 1, { from: user[0] })
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
      context('K/6 name to key', async () => {
        it('should fail with auth error by sender auth 1', async () => {
          await assertMissingAuthority(contract.finalize(pubKey1K1.toString(), 1, { from: user[2] }))
        })
        it('should fail with auth error by contract auth 2', async () => {
          await assertMissingAuthority(contract.finalize(pubKey1K1.toString(), 1, { from: contract.account }))
        })
        it('should succeed 3', async () => {
          await check.ramTrace(async () => {
            return contract.finalize(pubKey1K1.toString(), 1, { from: user[0] })
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
        it('should fail to finalize an already finalized payment 5', async () => {
          await assertEOSErrorIncludesMessage(contract.finalize(pubKey1K1.toString(), 1, { from: user[0] }), 'Payment is already finalized.')
        })
        it('should fail to invalidate an already finalized payment 6', async () => {
          await assertEOSErrorIncludesMessage(contract.invalidate(pubKey1K1.toString(), 1, { from: user[0] }), 'Payment is already finalized.')
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
            return contract.finalizesig(user[2].name, 1, currentTime, sig, { from: user[3] })
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
            return contract.finalizesig(recipient2PubK1.toString(), 1, currentTime, sig, { from: user[1] })
          })
        })
        it('should fail to finalize an already finalized payment 7', async () => {
          await assertEOSErrorIncludesMessage(contract.finalizesig(recipient2PubK1.toString(), 1, currentTime, sig, { from: user[2] }), 'Payment is already finalized.')
        })
        it('should succeed with legacy key 8', async () => {
          const sigLegacy = signFinalize(priKey1K1.toString() as string, mainNetChainId, contract.account.name, recipient2PubK1.toLegacyString(), '2', currentTime.toString()).sig
          await check.ramTrace(async () => {
            return contract.finalizesig(recipient2PubK1.toLegacyString(), 2, currentTime, sigLegacy, { from: user[1] })
          })
        })
      })
    })

    // Check completed payments
    let in2Secs: { start: number; startBase58: string; end: number; endBase58: string }
    let recipient0PriK1: PrivateKey
    let recipient0PubK1: PublicKey
    let recipient0Split: { scope: bigint; tableVec: string }
    context('check completed payments', async () => {
      before(async () => {
        recipient0PriK1 = PrivateKey.fromString(user[0].privateKey as string)
        recipient0PubK1 = recipient0PriK1.getPublicKey()
        recipient0Split = splitPubKeyToScopeAndTableVec(recipient0PubK1)
        const timestampNow = Math.round(Date.now() / 1000)
        in2Secs = {
          start: timestampNow,
          startBase58: base58.encode(numberToUInt32(timestampNow).reverse()),
          end: Math.round(timestampNow + 2),
          endBase58: base58.encode(numberToUInt32(Math.round(timestampNow + 2)).reverse()),
        }
        sendAsset = new Asset(10000, sys_token.symbol)
        sendAssetString = sendAsset.toString()
      })
      context('N/4 set some further payments with "PAY" parameter', async () => {
        it('should succeed from name to name 1', async () => {
          await check.ramTrace(() => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `PAY@${user[1].name}!${in2Secs.endBase58}`, { from: user[0] })
          })
        })
        it('should succeed from key to name and memo 2', async () => {
          await check.ramTrace(() => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `PAY${user[0].publicKey}@${user[1].name}!${in2Secs.endBase58};hello;!@$again`, { from: user[0] })
          })
          chai.expect((await contract.pay2nameTable({ scope: user[1].name })).rows.length).equal(2)
        })
        it('should succeed from name to key 3', async () => {
          await check.ramTrace(() => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `PAY${user[0].publicKey}@${recipient0PubK1.toString()}!${in2Secs.endBase58}`, { from: user[0] })
          })
        })
        it('should succeed from key to key and memo 4', async () => {
          await check.ramTrace(() => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `PAY${user[0].publicKey}@${recipient0PubK1.toString()}!${in2Secs.endBase58};hello;!@$again from user_0 to k1_0`, { from: user[0] })
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
          currentTime = Math.floor(Date.now() / 1000)
          await waitUntil(in2Secs.end)

          const r_name = await contract.pay2nameTable({ scope: user[1].name })
          chai.expect(r_name.rows.length).equal(2, 'Wrong amount of entries')
          chai.expect(r_name.rows[0].id).equal(2, 'Wrong id')
          chai.expect(r_name.rows[0].time).equal(in2Secs.end, 'Wrong time limit')
          chai.expect(r_name.rows[0].time).lessThanOrEqual(Math.round(Date.now() / 1000), 'Time limit not reached, yet')
          const r_key = await contract.pay2keyTable({ scope: recipient0Split.scope.toString() })
          chai.expect(r_key.rows.length).equal(2, 'Wrong amount of entries')
          chai.expect(r_key.rows[0].id).equal(0, 'Wrong id')
          chai.expect(r_key.rows[0].time).equal(in2Secs.end, 'Wrong time limit')
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

        // Get id as base58 value
        id1_Base58 = base58.encode(numberToUInt64(BigInt(1)).reverse())
        id2_Base58 = base58.encode(numberToUInt64(BigInt(2)).reverse())
        id3_Base58 = base58.encode(numberToUInt64(BigInt(3)).reverse())
      })
      context('S/7 on reached time', async () => {
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
          currentTimeBase58 = base58.encode(numberToUInt32(currentTime).reverse())

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
          const paraAsset = new Asset(1, sys_token.symbol)
          const sig = signPayOff(recipient2PriK1.toString(), mainNetChainId, contract.account.name, recipient2PubK1.toString(), user[2].name, '1', currentTime.toString()).sig
          await check.ramTrace(() => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, paraAsset.toString(), `OFF@${recipient2PubK1.toString()}#${id1_Base58}=${currentTimeBase58}~${sig}+${user[2].name}`, { from: user[0] })
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
          const sig_fin = signFinalize(priKey1K1.toString(), mainNetChainId, contract.account.name, user[2].name, '2', currentTime.toString()).sig
          await check.ramTrace(() => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, paraAsset.toString(), `FIN@${user[2].name}#${id2_Base58}=${currentTimeBase58}~${sig_fin}`, { from: user[0] })
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
          currentTimeBase58 = base58.encode(numberToUInt32(currentTime).reverse())
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
            return sys_token.contract.transfer(user[0].name, contract.account.name, minAsset.toString(), `OFF@${user[2].name}#${id3_Base58}=${currentTimeBase58}~${sig}+${user[0].name}`, { from: user[0] })
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
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `PAY${pubKey1K1.toString()}@${recipient2PubK1.toString()}!${inOneDayBs58};key_K1 to key_user_2`, { from: user[0] })
          })
        })
        it('should succeed rejection from key to key payment with "REJ" parameter 7', async () => {
          const sig = signReject(recipient2PriK1.toString(), mainNetChainId, contract.account.name, hexWithTypeOfPubKey(pubKey1K1), '3', currentTime.toString()).sig
          await check.ramTrace(() => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, minAsset.toString(), `REJ@${recipient2PubK1.toString()}#${id3_Base58}=${currentTimeBase58}~${sig}`, { from: user[0] })
          })
          user0Asset.amount -= minAsset.amount
        })
        it('should succeed payoff rejected from key to key payment 8', async () => {
          await assertEOSErrorIncludesMessage(contract.payoff(recipient2PubK1.toString(), 3, { from: user[2] }), 'Payment is rejected, but sender is not an account name.')
        })
        it('should succeed payoff rejected from key to key payment via "OFF" transfer parameter 9', async () => {
          const sig = signPayOff(priKey1K1.toString(), mainNetChainId, contract.account.name, recipient2PubK1.toString(), user[0].name, '3', currentTime.toString()).sig
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, minAsset.toString(), `OFF@${recipient2PubK1.toString()}#${id3_Base58}=${currentTimeBase58}~${sig}+${user[0].name}`, { from: user[0] })
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
    context('invalidate payment', async () => {
      let currentTime: number
      let currentTimeBase58: string
      let minAsset: Asset
      let recipient2PriK1: PrivateKey
      let recipient2PubK1: PublicKey
      let recipient2Split: { scope: bigint; tableVec: string }
      let id6_Base58: string
      before(async () => {
        currentTime = Math.round(Date.now() / 1000)
        currentTimeBase58 = base58.encode(numberToUInt32(currentTime).reverse())
        minAsset = new Asset(1, sys_token.symbol)

        // Get recipient2 keys
        recipient2PriK1 = PrivateKey.fromString(user[2].privateKey as string)
        recipient2PubK1 = recipient2PriK1.getPublicKey()
        recipient2Split = splitPubKeyToScopeAndTableVec(recipient2PubK1)

        // Get id as base58 value
        id6_Base58 = base58.encode(numberToUInt64(BigInt(6)).reverse())
        ;[contractAsset, nirvanaAsset, user0Asset, user1Asset, user2Asset] = await getBalances([contract.account, nirvana, user[0], user[1], user[2]], sys_token)
      })
      context('V/4 from name to name', async () => {
        it('should succeed payment 1', async () => {
          await check.ramTrace(() => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `PAY${user[1].name}@${user[2].name}!${inOneDayBs58}`, { from: user[0] })
          })
          user0Asset.amount -= sendAsset.amount
        })
        it('should fail to invalidate without sender auth 2', async () => {
          await assertMissingAuthority(contract.invalidate(user[2].name, 4, { from: user[2] }))
        })
        it('should succeed invalidation payment 3', async () => {
          await check.ramTrace(() => {
            return contract.invalidate(user[2].name, 4, { from: user[1] })
          })
        })
        it('should update tables 4', async () => {
          await check.checkPayment2Name_NotExist(user[2].name, 4)
          const [newContractAsset, newNirvanaAsset, newuser1Asset, newuser2Asset] = await getBalances([contract.account, nirvana, user[1], user[2]], sys_token)

          const contractDelta = contractAsset.amount - newContractAsset.amount
          chai.expect(contractDelta != 0).equal(true, 'No fees, contract balance has not changed')
          chai.expect(Math.abs(contractDelta)).lessThan(10, 'Wrong contract balance')

          const nirvanaDelta = newNirvanaAsset.amount - nirvanaAsset.amount
          chai.expect(Math.abs(sendAsset.amount - nirvanaDelta)).lessThan(10, 'Nirvana got wrong amount')
          chai.expect(newuser1Asset.amount - user1Asset.amount).equal(0, 'Changed balance of user 1')
          chai.expect(newuser2Asset.amount - user2Asset.amount).equal(0, 'Changed balance of user 2')

          contractAsset.amount = newContractAsset.amount
          nirvanaAsset.amount = newNirvanaAsset.amount
        })
      })
      context('W/9 key to name', async () => {
        it('should succeed payment 1', async () => {
          await check.ramTrace(() => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `PAY${pubKey1K1.toString()}@${user[2].name}!${inOneDayBs58}`, { from: user[0] })
          })
          user0Asset.amount -= sendAsset.amount
        })
        it('should fail to invalidate without sign action 2', async () => {
          await assertEOSErrorIncludesMessage(contract.invalidate(user[2].name, 5, { from: user[2] }), 'Wrong sender.')
        })
        it('should fail to invalidate with wrong sign 3', async () => {
          const sig = signInvalidate(priKey1K1.toString(), mainNetChainId, contract.account.name, user[2].name, 'wrong', currentTime.toString()).sig
          await shouldFail(contract.invalisig(user[2].name, 5, currentTime, sig, { from: user[1] }))
        })
        it('should succeed invalidation payment 4', async () => {
          const sig = signInvalidate(priKey1K1.toString(), mainNetChainId, contract.account.name, user[2].name, '5', currentTime.toString()).sig
          await check.ramTrace(() => {
            return contract.invalisig(user[2].name, 5, currentTime, sig, { from: user[1] })
          })
        })
        it('should update tables 5', async () => {
          await check.checkPayment2Name_NotExist(user[2].name, 5)
          const [newContractAsset, newNirvanaAsset, newuser2Asset] = await getBalances([contract.account, nirvana, user[2]], sys_token)

          const contractDelta = contractAsset.amount - newContractAsset.amount
          chai.expect(contractDelta != 0).equal(true, 'No fees, contract balance has not changed')
          chai.expect(Math.abs(contractDelta)).lessThan(10, 'Wrong contract balance')

          const nirvanaDelta = newNirvanaAsset.amount - nirvanaAsset.amount
          chai.expect(Math.abs(sendAsset.amount - nirvanaDelta)).lessThan(10, 'Nirvana got wrong amount')
          chai.expect(newuser2Asset.amount - user2Asset.amount).equal(0, 'Changed balance of user 2')

          contractAsset.amount = newContractAsset.amount
          nirvanaAsset.amount = newNirvanaAsset.amount
        })

        // Send and invalidate payment from key to name with "INV" parameter
        it('should succeed payment 6', async () => {
          await check.ramTrace(() => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `PAY${pubKey1K1.toString()}@${user[2].name}!${inOneDayBs58}`, { from: user[0] })
          })
          user0Asset.amount -= sendAsset.amount
        })
        it('should fail to invalidate with wrong sign 7', async () => {
          const sig = signInvalidate(priKey1K1.toString(), mainNetChainId, contract.account.name, user[2].name, 'wrong', currentTime.toString()).sig
          await shouldFail(contract.invalisig(user[2].name, 6, currentTime, sig, { from: user[1] }))
        })
        it('should succeed invalidation with "INV" parameter 8', async () => {
          const paraAsset = new Asset(1, sys_token.symbol)
          const sig = signInvalidate(priKey1K1.toString(), mainNetChainId, contract.account.name, user[2].name, '6', currentTime.toString()).sig
          await check.ramTrace(() => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, paraAsset.toString(), `INV@${user[2].name}#${id6_Base58}=${currentTimeBase58}~${sig}`, { from: user[0] })
          })
          user0Asset.amount -= paraAsset.amount
          contractAsset.amount += paraAsset.amount
        })
        it('should update tables 9', async () => {
          await check.checkPayment2Name_NotExist(user[2].name, 6)
          const [newContractAsset, newNirvanaAsset, newuser2Asset] = await getBalances([contract.account, nirvana, user[2]], sys_token)

          const contractDelta = newContractAsset.amount - contractAsset.amount
          chai.expect(contractDelta != 0).equal(true, 'No fees, contract balance has not changed')
          chai.expect(Math.abs(contractDelta)).lessThan(10, 'Wrong contract balance')

          const nirvanaDelta = newNirvanaAsset.amount - nirvanaAsset.amount
          chai.expect(Math.abs(sendAsset.amount - nirvanaDelta)).lessThan(10, 'Nirvana got wrong amount')
          chai.expect(newuser2Asset.amount - user2Asset.amount).equal(0, 'Changed balance of user 2')

          contractAsset.amount = newContractAsset.amount
          nirvanaAsset.amount = newNirvanaAsset.amount
        })
      })
      context('X/4 name to key', async () => {
        // Send and invalidate payment from name to key
        it('should succeed from name to key payment 1', async () => {
          await check.ramTrace(() => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `PAY${user[1].name}@${recipient2PubK1}!${inOneDayBs58};user1 to K1_of_Recipient2`, { from: user[0] })
          })
          user0Asset.amount -= sendAsset.amount
        })
        it('should fail to invalidate name to key payment without sender auth 2', async () => {
          await assertMissingAuthority(contract.invalidate(recipient2PubK1.toString(), 4, { from: user[2] }))
        })
        it('should succeed invalidation from name to key payment 3', async () => {
          await check.ramTrace(() => {
            return contract.invalidate(recipient2PubK1.toString(), 4, { from: user[1] })
          })
        })
        it('should update tables 4', async () => {
          await check.checkPayment2Key_NotExist(recipient2Split.scope.toString(), 4)
          const [newContractAsset, newNirvanaAsset, newuser1Asset] = await getBalances([contract.account, nirvana, user[1]], sys_token)

          const contractDelta = contractAsset.amount - newContractAsset.amount
          chai.expect(contractDelta != 0).equal(true, 'No fees, contract balance has not changed')
          chai.expect(Math.abs(contractDelta)).lessThan(10, 'Wrong contract balance')

          const nirvanaDelta = newNirvanaAsset.amount - nirvanaAsset.amount
          chai.expect(Math.abs(sendAsset.amount - nirvanaDelta)).lessThan(10, 'Nirvana got wrong amount')
          chai.expect(newuser1Asset.amount - user1Asset.amount).equal(0, 'Changed balance of user 1')

          contractAsset.amount = newContractAsset.amount
          nirvanaAsset.amount = newNirvanaAsset.amount
        })
      })
      context('Y/5 key to key', async () => {
        it('should succeed from key to key payment 1', async () => {
          await check.ramTrace(() => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `PAY${pubKey1K1.toString()}@${recipient2PubK1.toString()}!${inOneDayBs58}`, { from: user[0] })
          })
          user0Asset.amount -= sendAsset.amount
        })
        it('should fail to invalidate key to key payment without sign action 2', async () => {
          await assertEOSErrorIncludesMessage(contract.invalidate(recipient2PubK1.toString(), 5, { from: user[2] }), 'Wrong sender.')
        })
        it('should fail to invalidate key to key payment with wrong sign 3', async () => {
          const sig = signInvalidate(priKey1K1.toString(), mainNetChainId, contract.account.name, recipient2PubK1.toString(), 'wrong', currentTime.toString()).sig
          await shouldFail(contract.invalisig(recipient2PubK1.toString(), 5, currentTime, sig, { from: user[1] }))
        })
        it('should succeed invalidation from key to key payment 4', async () => {
          const sig = signInvalidate(priKey1K1.toString(), mainNetChainId, contract.account.name, recipient2PubK1.toString(), '5', currentTime.toString()).sig
          await check.ramTrace(() => {
            return contract.invalisig(recipient2PubK1.toString(), 5, currentTime, sig, { from: user[1] })
          })
        })
        it('should update tables 5', async () => {
          await check.checkPayment2Key_NotExist(recipient2Split.scope.toString(), 5)
          const [newContractAsset, newNirvanaAsset] = await getBalances([contract.account, nirvana], sys_token)

          const contractDelta = contractAsset.amount - newContractAsset.amount
          chai.expect(contractDelta != 0).equal(true, 'No fees, contract balance has not changed')
          chai.expect(Math.abs(contractDelta)).lessThan(10, 'Wrong contract balance')

          const nirvanaDelta = newNirvanaAsset.amount - nirvanaAsset.amount
          chai.expect(Math.abs(sendAsset.amount - nirvanaDelta)).lessThan(10, 'Nirvana got wrong amount')

          contractAsset.amount = newContractAsset.amount
          nirvanaAsset.amount = newNirvanaAsset.amount
        })
      })
    })

    // Extend
    context('Extend', async () => {
      let contractAsset: Asset
      let user0Asset: Asset
      let user1Asset: Asset
      let user2Asset: Asset
      let currentTime: number
      let currentTimeBs58: string
      let in8Secs: { start: number; startBase58: string; end: number; endBase58: string }
      let paraAsset: Asset
      before(async () => {
        paraAsset = new Asset(1, sys_token.symbol)
        // Get times
        currentTime = Math.floor(Date.now() / 1000)
        currentTimeBs58 = base58.encode(numberToUInt32(currentTime).reverse())
        in8Secs = {
          start: currentTime,
          startBase58: base58.encode(numberToUInt32(currentTime).reverse()),
          end: Math.round(currentTime + 8),
          endBase58: base58.encode(numberToUInt32(Math.round(currentTime + 8)).reverse()),
        }
      })
      context('Z/5 payment', async () => {
        it('should succeed to set some payments 1', async () => {
          // Set some more payments
          await check.ramTrace(() => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `PAY${pubKey1K1.toString()}@${user[1].name}!${inOneDayBs58}; ex from user_0 to user_1 #4`, { from: user[0] })
          })
          await check.ramTrace(() => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `PAY@${user[1].name}!${in8Secs.endBase58}; ex from user_0 to user_1 #5`, { from: user[0] })
          })
          await check.ramTrace(() => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `PAY@${pubKey1K1.toString()}!${inOneDayBs58};ex from user_0 to k1 #3`, { from: user[0] })
          })
          await check.ramTrace(() => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `PAY@${pubKey1K1.toString()}!${in8Secs.endBase58};ex from user_0 to k1 #4`, { from: user[0] })
          })
          ;[contractAsset, user0Asset, user1Asset, user2Asset] = await getBalances([contract.account, user[0], user[1], user[2]], sys_token)
          const nameRows = (await contract.pay2nameTable({ scope: user[1].name })).rows
          let keyRows = (await contract.pay2keyTable({ scope: splitKey1K1.scope.toString() })).rows

          chai.expect(nameRows.length).equal(3, 'Wrong number of entries name table')
          chai.expect(nameRows[1].id).equal(4, 'Wrong id in name table')
          chai.expect(nameRows[2].id).equal(5, 'Wrong id in name table')
          chai.expect(keyRows.length).equal(3, 'Wrong number of entries key table')
          chai.expect(keyRows[1].id).equal(3, 'Wrong id in key table')
          chai.expect(keyRows[2].id).equal(4, 'Wrong id in key table')
        })

        it('should fail with auth error by sender auth 2', async () => {
          await assertMissingAuthority(contract.extend(user[1].name, 4, inTwoDays, { from: user[0] }))
        })
        it('should fail with auth error by contract auth 3', async () => {
          await assertMissingAuthority(contract.extend(user[1].name, 4, inTwoDays, { from: contract.account }))
        })
        it('should fail with lower than current time on name payment 4', async () => {
          await assertEOSErrorIncludesMessage(contract.extend(user[1].name, 4, currentTime - 1, { from: user[1] }), 'Time is below current time.')
        })
        it('should fail with lower than current time on key payment  5', async () => {
          const earlier = currentTime - 1
          const sig = signExtend(priKey1K1.toString(), mainNetChainId, contract.account.name, earlier.toString(), hexWithTypeOfPubKey(pubKey1K1), (4).toString(), currentTime.toString()).sig
          await assertEOSErrorIncludesMessage(contract.extendsig(pubKey1K1.toString(), 4, earlier, currentTime, sig, { from: user[2] }), 'Time is below current time.')
        })
        it('should fail with earlier time on name payment 6', async () => {
          await assertEOSErrorIncludesMessage(contract.extend(user[1].name, 4, currentTime + 7, { from: user[1] }), 'Cannot reduce the time limit.')
        })
        it('should fail with eralier time on key payment 7', async () => {
          const earlier = currentTime + 7
          const sig = signExtend(priKey1K1.toString(), mainNetChainId, contract.account.name, earlier.toString(), hexWithTypeOfPubKey(pubKey1K1), (4).toString(), currentTime.toString()).sig
          await assertEOSErrorIncludesMessage(contract.extendsig(pubKey1K1.toString(), 4, earlier, currentTime, sig, { from: user[2] }), 'Cannot reduce the time limit.')
        })
        it('should fail with negative time on name payment 8', async () => {
          await shouldFail(contract.extend(user[1].name, 4, -1, { from: user[1] }))
        })
        it('should fail with same time on name payment 9', async () => {
          await assertEOSErrorIncludesMessage(contract.extend(user[1].name, 4, inOneDay, { from: user[1] }), 'Mentioned time limit is equal to the current one.')
        })
        it('should fail with same time on key payment 10', async () => {
          const sig = signExtend(priKey1K1.toString(), mainNetChainId, contract.account.name, inOneDay.toString(), hexWithTypeOfPubKey(pubKey1K1), (3).toString(), currentTime.toString()).sig
          await assertEOSErrorIncludesMessage(contract.extendsig(pubKey1K1.toString(), 3, inOneDay, currentTime, sig, { from: user[2] }), 'Mentioned time limit is equal to the current one.')
        })
        it('should succeed on name table 11', async () => {
          contract.extend(user[1].name, 4, inTwoDays, { from: user[1] })
          const nameRows = (await contract.pay2nameTable({ scope: user[1].name })).rows
          chai.expect(nameRows[1].time).equal(inTwoDays, 'Wrong time value')
        })
        it('should fail with wrong signature 12', async () => {
          const wrong_sig = signExtend(priKey1K1.toString(), mainNetChainId, contract.account.name, inTwoDays.toString(), hexWithTypeOfPubKey(pubKey1K1), (4).toString(), currentTime.toString()).sig
          await shouldFail(contract.extendsig(pubKey1K1.toString(), 3, inTwoDays, currentTime, wrong_sig, { from: user[2] }))
        })
        it('should succeed on key table 13', async () => {
          const sig = signExtend(priKey1K1.toString(), mainNetChainId, contract.account.name, inTwoDays.toString(), hexWithTypeOfPubKey(pubKey1K1), (3).toString(), currentTime.toString()).sig
          await check.ramTrace(async () => {
            return contract.extendsig(pubKey1K1.toString(), 3, inTwoDays, currentTime, sig, { from: user[2] })
          })
        })

        it('should succeed to finalize and reject some payments 14', async () => {
          await check.ramTrace(async () => {
            return contract.reject(user[1].name, 4, { from: user[1] })
          })
          await check.ramTrace(async () => {
            return contract.finalize(pubKey1K1.toString(), 3, { from: user[0] })
          })
        })

        it('should fail to extend a rejected payment 15', async () => {
          await assertEOSErrorIncludesMessage(contract.extend(user[1].name, 4, inTwoDays, { from: user[1] }), 'Payment is already rejected.')
        })

        it('should succeed to extend a finalized payment with "EXT" parameter 16', async () => {
          const id3_Base58 = base58.encode(numberToUInt64(BigInt(3)).reverse())
          const sig = signExtend(priKey1K1.toString(), mainNetChainId, contract.account.name, inTwoDays.toString(), hexWithTypeOfPubKey(pubKey1K1), (3).toString(), currentTime.toString()).sig
          await check.ramTrace(() => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, paraAsset.toString(), `EXT@${pubKey1K1.toString()}#${id3_Base58}!${inTwoDaysBs58}=${currentTimeBs58}~${sig}`, { from: user[0] })
            // await contract.extendsig(pubKey1K1.toString(), 2, inTwoDays, currentTime, sig, { from: user[1] })
          })
        })

        it('should succeed on expired payment on name table 17', async () => {
          await waitUntil(in8Secs.end)
          await check.ramTrace(async () => {
            return contract.extend(user[1].name, 5, inOneDay, { from: user[1] })
          })
        })
        it('should succeed on expired payment on key table with "EXT" parameter 18', async () => {
          const id4_Base58 = base58.encode(numberToUInt64(BigInt(4)).reverse())
          const sig = signExtend(priKey1K1.toString(), mainNetChainId, contract.account.name, inTwoDays.toString(), hexWithTypeOfPubKey(pubKey1K1), (4).toString(), currentTime.toString()).sig

          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, paraAsset.toString(), `EXT@${pubKey1K1.toString()}#${id4_Base58}!${inTwoDaysBs58}=${currentTimeBs58}~${sig}`, { from: user[0] })
          })
        })
      })
    })

    // Pay off all
    context('Pay off all', async () => {
      let in2Secs: { start: number; startBase58: string; end: number; endBase58: string }
      let in3Secs: { start: number; startBase58: string; end: number; endBase58: string }
      let currentTime: number
      let currentTimeBase58: string
      let paraAsset: Asset
      before(async () => {
        currentTime = Math.round(Date.now() / 1000)
        in3Secs = {
          start: currentTime,
          startBase58: base58.encode(numberToUInt32(currentTime).reverse()),
          end: Math.round(currentTime + 3),
          endBase58: base58.encode(numberToUInt32(Math.round(currentTime + 3)).reverse()),
        }
        paraAsset = new Asset(1, sys_token.symbol)
      })
      context('AA/13', async () => {
        it('should succeed to set some payments 1', async () => {
          // Set payments
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${user[1].name}@${user[0].name}!${inOneDayBs58};from user1 0`, { from: user[0] })
          })
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${user[1].name}@${user[0].name}!${in3Secs.endBase58};from user1 1`, { from: user[0] })
          })
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${pubKey1K1.toString()}@${user[0].name}!${inOneDayBs58};from K1 key 2`, { from: user[0] })
          })
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${user[1].name}@${user[0].name}!${in3Secs.endBase58};from user1 3`, { from: user[0] })
          })
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${user[1].name}@${recipient0PubK1.toString()}!${inOneDayBs58};from user 1 to key_0 2`, { from: user[0] })
          })
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${user[1].name}@${recipient0PubK1.toString()}!${in3Secs.endBase58};from user 1 to key_0 3`, { from: user[0] })
          })
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${user[1].name}@${recipient0PubK1.toString()}!${inOneDayBs58};from user 1 to key_0 4`, { from: user[0] })
          })
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${pubKey1K1.toString()}@${recipient0PubK1.toString()}!${inOneDayBs58};from K1 to key_0 5`, { from: user[0] })
          })
        })
        it('should succeed to finalize and reject some payments 2', async () => {
          // Finalize and reject some payments
          await contract.reject(user[0].name, 2, { from: user[0] })
          await contract.finalize(recipient0PubK1.toString(), 4, { from: user[1] })
          const sig = signReject(recipient0PriK1.toString() as string, mainNetChainId, contract.account.name, hexWithTypeOfPubKey(pubKey1K1), '5', currentTime.toString()).sig
          await contract.rejectsig(recipient0PubK1.toString(), 5, currentTime, sig, { from: user[0] })
          const {
            rows: [item],
          } = await contract.pay2keyTable({ scope: recipient0Split.scope.toString(), limit: 1 })

          chai.expect(item.id).equal(1, 'Missing entry')
          chai.expect(stringToAsset(item.fund).amount).lessThanOrEqual(sendAsset.amount, 'Wrong amount')
        })
        it('should fail to a name with no expired entries 3', async () => {
          await assertEOSErrorIncludesMessage(contract.payoffall(user[2].name, sys_token.contract.account.name, sys_token.symbol.toString(), 'No expired entries.', { from: user[3] }), 'No expired entries.')
        })
        it('should succeed to a name with one expired entry 4', async () => {
          await check.ramTrace(async () => {
            return contract.payoffall(user[1].name, sys_token.contract.account.name, sys_token.symbol.toString(), 'Pay off all', { from: user[3] })
          })
        })
        it('should succeed to a name with finalized entry 5', async () => {
          // Get balances
          ;[contractAsset, nirvanaAsset, user0Asset, user1Asset, user2Asset] = await getBalances([contract.account, nirvana, user[0], user[1], user[2]], sys_token)

          // Wait until the time limits are expired
          await waitUntil(in3Secs.end)

          // Check table entries
          const r = await contract.pay2nameTable({ scope: user[0].name })
          chai.expect(r.rows.length).equal(4, 'Wrong amount of table entries')
          chai.expect(r.rows[1].id).equal(1, 'Wrong id')
          chai.expect(r.rows[1].time > 1 && r.rows[1].time < Date.now() / 1000).equal(true, 'Time limit is not expired, yet')

          // Execute pay off all
          await check.ramTrace(async () => {
            return contract.payoffall(user[0].name, sys_token.contract.account.name, sys_token.symbol.toString(), 'Pay off all', { from: user[3] })
          })
        })
        it('check name table 6', async () => {
          const r = await contract.pay2nameTable({ scope: user[0].name })
          chai.expect(r.rows.length).equal(2, 'Wrong number of entries remain')
          chai.expect(r.rows[0].id).equal(0, 'Unexpired entry not found')
          chai.expect(r.rows[1].id).equal(2, 'Rejected entry not found')
          const [newContractAsset, newNirvanaAsset, newuser0Asset, newuser1Asset, newuser2Asset] = await getBalances([contract.account, nirvana, user[0], user[1], user[2]], sys_token)

          const sendAmountOfTwo = 2 * sendAsset.amount
          const contractDelta = contractAsset.amount - newContractAsset.amount
          chai.expect(contractDelta != 0).equal(true, 'No fees, contract balance has not changed')
          chai.expect(Math.abs(contractDelta - sendAmountOfTwo)).lessThan(10, 'Wrong contract balance')

          chai.expect(newNirvanaAsset.amount - nirvanaAsset.amount).equal(0, 'Nirvana got wrong amount')

          const deltaUser0 = newuser0Asset.amount - user0Asset.amount
          chai.expect(sendAmountOfTwo - deltaUser0).lessThan(20, 'Changed balance of user 0')
          chai.expect(newuser1Asset.amount - user1Asset.amount).equal(0, 'Changed balance of user 1')
          chai.expect(newuser2Asset.amount - user2Asset.amount).equal(0, 'Changed balance of user 2')

          contractAsset.amount = newContractAsset.amount
          user0Asset.amount = newuser0Asset.amount
        })
        it('to key table 7', async () => {
          const sig = signPayOffAll(recipient0PriK1.toString(), mainNetChainId, contract.account.name, sys_token.contract.account.name, sys_token.symbol, 'nonexisting', 'Pay off all', currentTime.toString()).sig
          await assertEOSErrorIncludesMessage(contract.payoffallsig(recipient0PubK1.toString(), sys_token.contract.account.name, sys_token.symbol.toString(), 'nonexisting', 'Pay off all', currentTime, sig, { from: user[3] }), 'Account does not exist.')
        })
        it('to key table 8', async () => {
          const r = await contract.pay2keyTable({ scope: recipient0Split.scope.toString() })
          chai.expect(r.rows.length).equal(5, 'Wrong amount of table entries')
          chai.expect(r.rows[0].id).equal(1, 'Wrong id')
          chai.expect(r.rows[0].time > 1 && r.rows[0].time < Date.now() / 1000).equal(true, 'Time limit of id 1 is not expired, yet')
          chai.expect(r.rows[2].id).equal(3, 'Wrong id')
          chai.expect(r.rows[2].time > 1 && r.rows[2].time < Date.now() / 1000).equal(true, 'Time limit of id 3 is not expired, yet')
          const sig = signPayOffAll(recipient0PriK1.toString(), mainNetChainId, contract.account.name, sys_token.contract.account.name, sys_token.symbol, user[0].name, 'Pay off all', currentTime.toString()).sig
          await check.ramTrace(async () => {
            return contract.payoffallsig(recipient0PubK1.toString(), sys_token.contract.account.name, sys_token.symbol.toString(), user[0].name, 'Pay off all', currentTime, sig, { from: user[3] })
          })
        })
        it('check table 9', async () => {
          const r = await contract.pay2keyTable({ scope: recipient0Split.scope.toString() })
          chai.expect(r.rows.length).equal(2, 'Wrong number of entries remain')
          chai.expect(r.rows[0].id).equal(2, 'Unexpired entry not found')
          chai.expect(r.rows[1].id).equal(5, 'Rejected entry not found')
          const [newContractAsset, newNirvanaAsset, newuser0Asset, newuser1Asset, newuser2Asset] = await getBalances([contract.account, nirvana, user[0], user[1], user[2]], sys_token)

          const sendAmountOfThree = 3 * sendAsset.amount
          const contractDelta = contractAsset.amount - newContractAsset.amount
          chai.expect(contractDelta != 0).equal(true, 'No fees, contract balance has not changed')
          chai.expect(Math.abs(contractDelta - sendAmountOfThree)).lessThan(10, 'Wrong contract balance')

          chai.expect(newNirvanaAsset.amount - nirvanaAsset.amount).equal(0, 'Nirvana got wrong amount')

          const deltaUser0 = newuser0Asset.amount - user0Asset.amount
          chai.expect(sendAmountOfThree - deltaUser0).lessThan(20, 'Changed balance of user 0')
          chai.expect(newuser1Asset.amount - user1Asset.amount).equal(0, 'Changed balance of user 1')
          chai.expect(newuser2Asset.amount - user2Asset.amount).equal(0, 'Changed balance of user 2')

          contractAsset.amount = newContractAsset.amount
          user0Asset.amount = newuser0Asset.amount
        })
        // Payoff all with "ALL" parameter
        it('should succeed to set some payments and one finalized payment 10', async () => {
          currentTime = Math.round(Date.now() / 1000)
          in2Secs = {
            start: currentTime,
            startBase58: base58.encode(numberToUInt32(currentTime).reverse()),
            end: Math.round(currentTime + 2),
            endBase58: base58.encode(numberToUInt32(Math.round(currentTime + 2)).reverse()),
          }
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${user[1].name}@${recipient0PubK1.toString()}!${in2Secs.endBase58};from user 1 to key_0 6`, { from: user[0] })
          })
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${user[1].name}@${recipient0PubK1.toString()}!${inOneDayBs58};from user 1 to key_0 7`, { from: user[0] })
          })
          await check.ramTrace(async () => {
            return contract.finalize(recipient0PubK1.toString(), 7, { from: user[1] })
          })

          const r_key = await contract.pay2keyTable({ scope: recipient0Split.scope.toString() })
          chai.expect(r_key.rows.length).equal(4, 'Wrong amount of entries')
          chai.expect(r_key.rows[3].id).equal(7, 'Wrong id in key table')
          chai.expect(r_key.rows[3].time).equal(1, 'Entry is not finalized')
        })
        it('should fail to a non existing user 11', async () => {
          currentTimeBase58 = base58.encode(numberToUInt32(currentTime).reverse())

          // Wait until the time limits are expired
          await waitUntil(in2Secs.end)

          const sig = signPayOffAll(recipient0PriK1.toString(), mainNetChainId, contract.account.name, sys_token.contract.account.name, sys_token.symbol, 'newernewuser', 'Pay off all', currentTime.toString()).sig

          await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, paraAsset.toString(), `ALL@${recipient0PubK1.toString()}=${currentTimeBase58}~${sig}+newernewuser:Pay off all`, { from: user[0] }), 'Account does not exist.')
        })
        it('should fail with wrong signature 12', async () => {
          const sig = signPayOffAll(recipient0PriK1.toString(), mainNetChainId, contract.account.name, sys_token.contract.account.name, sys_token.symbol, 'newernewuser', 'Pay off all', currentTime.toString()).sig
          await shouldFail(sys_token.contract.transfer(user[0].name, contract.account.name, paraAsset.toString(), `ALL@${recipient0PubK1.toString()}=${currentTimeBase58}~${sig}+${user[1].name};Pay off all`, { from: user[0] }))
        })
        it('should succeed on key table with "ALL" parameter 13', async () => {
          const paraAsset = new Asset(1, sys_token.symbol)
          const sig = signPayOffAll(recipient0PriK1.toString(), mainNetChainId, contract.account.name, sys_token.contract.account.name, sys_token.symbol, user[1].name, 'Pay off all', currentTime.toString()).sig

          await check.ramTrace(() => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, paraAsset.toString(), `ALL@${recipient0PubK1.toString()}=${currentTimeBase58}~${sig}+${user[1].name};Pay off all`, { from: user[0] })
          })
          const r_key = await contract.pay2keyTable({ scope: recipient0Split.scope.toString() })
          chai.expect(r_key.rows.length).equal(2, 'Wrong amount of entries')
        })
      })
    })

    // Pay off new account
    context('Pay off new account', async () => {
      let in2Secs: { start: number; startBase58: string; end: number; endBase58: string }
      let currentTime: number
      let currentTimeBase58: string
      let paraAsset: Asset
      let newAccountName1: string
      let newAccountName2: string
      before(async () => {
        paraAsset = new Asset(1, sys_token.symbol)
        newAccountName1 = 'testtest1111'
        newAccountName2 = 'testtest2222'
        currentTime = Math.round(Date.now() / 1000)
        currentTimeBase58 = base58.encode(numberToUInt32(currentTime).reverse())
        in2Secs = {
          start: currentTime,
          startBase58: base58.encode(numberToUInt32(currentTime).reverse()),
          end: Math.round(currentTime + 2),
          endBase58: base58.encode(numberToUInt32(Math.round(currentTime + 2)).reverse()),
        }
      })
      context('AB/10', async () => {
        it('should succeed to set one expireing and one finalized payment 1', async () => {
          // Set payments
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${user[1].name}@${recipient0PubK1.toString()}!${inOneDayBs58};from user 1 to key_0 8`, { from: user[0] })
          })
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${user[1].name}@${recipient0PubK1.toString()}!${in2Secs.endBase58};from user 1 to key_0 9`, { from: user[0] })
          })
          await check.ramTrace(async () => {
            return contract.finalize(recipient0PubK1.toString(), 8, { from: user[1] })
          })

          const r = await contract.pay2keyTable({ scope: recipient0Split.scope.toString() })

          chai.expect(r.rows.length).equal(4, 'Wrong amount of entries')
          chai.expect(r.rows[2].id).equal(8, 'Missing entry')
          chai.expect(r.rows[2].time).equal(1, 'Not finalized')
        })
        it('should fail to a name with no expired entries 2', async () => {
          const sig = signPayOffNewAcc(priKey1K1.toString(), mainNetChainId, contract.account.name, hexWithTypeOfPubKey(pubKey1K1), newAccountName1, currentTime.toString()).sig
          await assertEOSErrorIncludesMessage(contract.payoffnewacc(pubKey1K1.toString(), pubKey1K1.toString(), newAccountName1, currentTime, sig, { from: user[3] }), 'No expired entries.')
        })
        it('should fail to a name with already existing account name 3', async () => {
          const sig = signPayOffNewAcc(recipient0PriK1.toString(), mainNetChainId, contract.account.name, hexWithTypeOfPubKey(pubKey1K1), user[0].name, currentTime.toString()).sig
          await assertEOSErrorIncludesMessage(contract.payoffnewacc(recipient0PubK1.toString(), pubKey1K1.toString(), user[0].name, currentTime, sig, { from: user[3] }), 'Account already exists.')
        })
        it('should succeed 4', async () => {
          // Wait until the time limits are expired
          await waitUntil(in2Secs.end)

          const sig = signPayOffNewAcc(recipient0PriK1.toString(), mainNetChainId, contract.account.name, hexWithTypeOfPubKey(pubKey1K1), newAccountName1, currentTime.toString()).sig
          await check.ramTrace(async () => {
            return contract.payoffnewacc(recipient0PubK1.toString(), pubKey1K1.toString(), newAccountName1, currentTime, sig, { from: user[3] }), true, false
          })
        })
        it('check table 5', async () => {
          const r = await contract.pay2keyTable({ scope: recipient0Split.scope.toString() })
          chai.expect(r.rows.length).equal(2, 'Wrong amount of remaining entries')

          const ramCostForUser = 1000 // Estimated for 4000 Bytes of RAM
          const netCostForUser = 5000 // Amount in system token
          const cpuCostForUser = 5000 // Amount in system token

          const newUserAsset = await getBalance(newAccountName1, sys_token)
          console.log('sendAsset.amount', sendAsset.amount)
          console.log('newUserAsset.amount', newUserAsset.amount)
          console.log('sum cost', netCostForUser + cpuCostForUser + ramCostForUser)

          chai.expect(sendAsset.amount * 2 - (newUserAsset.amount + netCostForUser + cpuCostForUser + ramCostForUser)).lessThan(100)
        })

        // Payoff new user with "ACC" parameter
        it('should succeed to set one expireing and one finalized payment 6', async () => {
          // Get current time values
          currentTime = Math.round(Date.now() / 1000)
          currentTimeBase58 = base58.encode(numberToUInt32(currentTime).reverse())
          in2Secs = {
            start: currentTime,
            startBase58: base58.encode(numberToUInt32(currentTime).reverse()),
            end: Math.round(currentTime + 2),
            endBase58: base58.encode(numberToUInt32(Math.round(currentTime + 2)).reverse()),
          }

          // Set payments
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${user[1].name}@${recipient0PubK1.toString()}!${inOneDayBs58};from user 1 to key_0 10`, { from: user[0] })
          })
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${user[1].name}@${recipient0PubK1.toString()}!${in2Secs.endBase58};from user 1 to key_0 11`, { from: user[0] })
          })
          await check.ramTrace(async () => {
            return contract.finalize(recipient0PubK1.toString(), 10, { from: user[1] })
          })

          const r = await contract.pay2keyTable({ scope: recipient0Split.scope.toString() })

          chai.expect(r.rows.length).equal(4, 'Wrong amount of entries')
          chai.expect(r.rows[2].id).equal(10, 'Missing entry')
          chai.expect(r.rows[2].time).equal(1, 'Not finalized')
        })
        it('should fail to a name with no expired entries 7', async () => {
          const sig = signPayOffNewAcc(priKey1K1.toString(), mainNetChainId, contract.account.name, hexWithTypeOfPubKey(pubKey1K1), newAccountName2, currentTime.toString()).sig
          await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, paraAsset.toString(), `ACC@${pubKey1K1.toString()}=${currentTimeBase58}~${sig}+${newAccountName2}&${pubKey1K1.toString()}`, { from: user[0] }), 'No expired entries.')
        })
        it('should fail to a name with already existing account name 8', async () => {
          const sig = signPayOffNewAcc(recipient0PriK1.toString(), mainNetChainId, contract.account.name, hexWithTypeOfPubKey(pubKey1K1), user[0].name, currentTime.toString()).sig
          await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, paraAsset.toString(), `ACC@${recipient0PubK1.toString()}=${currentTimeBase58}~${sig}+${user[0].name}&${pubKey1K1.toString()}`, { from: user[0] }), 'Account already exists.')
        })
        it('should succeed with "ACC" parameter 9', async () => {
          // Wait until the time limits are expired
          await waitUntil(in2Secs.end)

          const sig = signPayOffNewAcc(recipient0PriK1.toString(), mainNetChainId, contract.account.name, hexWithTypeOfPubKey(pubKey1K1), newAccountName2, currentTime.toString()).sig
          await check.ramTrace(
            async () => {
              return sys_token.contract.transfer(user[0].name, contract.account.name, paraAsset.toString(), `ACC@${recipient0PubK1.toString()}=${currentTimeBase58}~${sig}+${newAccountName2}&${pubKey1K1.toString()}`, { from: user[0] })
            },
            true,
            false
          )
        })
        it('check table 10', async () => {
          const r = await contract.pay2keyTable({ scope: recipient0Split.scope.toString() })
          chai.expect(r.rows.length).equal(2, 'Wrong amount of remaining entries')

          const ramCostForUser = 1000 // Estimated for 4000 Bytes of RAM
          const netCostForUser = 5000 // Amount in system token
          const cpuCostForUser = 5000 // Amount in system token

          const newUserAsset = await getBalance(newAccountName2, sys_token)
          console.log('sendAsset.amount', sendAsset.amount)
          console.log('newUserAsset.amount', newUserAsset.amount)
          console.log('sum cost', netCostForUser + cpuCostForUser + ramCostForUser)

          chai.expect(sendAsset.amount * 2 - (newUserAsset.amount + netCostForUser + cpuCostForUser + ramCostForUser)).lessThan(1000)
        })
      })
    })

    // Set some settings back t5to be compatible with further tests
    context('set settings back', async () => {
      context('AC/2', async () => {
        it('send balance of user 2 to user 0 1', async () => {
          const balance = await getBalance(user[2], sys_token)
          await sys_token.contract.transfer(user[2].name, user[0].name, balance.toString(), '', { from: user[2] })
        })
        it('close balance of system token for user 2 2', async () => {
          const balance = await getBalance(user[2], sys_token)
          await sys_token.contract.close(user[2].name, balance.symbol.toString(), { from: user[2] })
        })
      })
    })
  })
}

function testRAMSettings() {
  let sendAsset: Asset
  let inOneDay: number
  let inOneDayBs58: string
  let RamUser3: number
  let RamUser4: number
  let contractAsset: Asset, nirvanaAsset: Asset, user3Asset: Asset, user4Asset: Asset, user5Asset: Asset
  let smallAsset: Asset
  let inOneHour: number
  let inOneHourBs58: string
  let forOneHour: number
  let forOneHourBs58: string
  let forOneDay: number
  let forOneDayBs58: string
  let offerer3_ram: { amount: number; free: number }
  let offerer4_ram: { amount: number; free: number }
  describe('RAM', () => {
    before(async () => {
      sendAsset = new Asset(1000, sys_token.symbol)
      inOneHour = Math.floor(Date.now() / 1000) + 3600
      inOneHourBs58 = toUInt32ToBase58(inOneHour)
      inOneDay = Math.round(Date.now() / 1000) + 3600 * 24
      inOneDayBs58 = toUInt32ToBase58(inOneDay)
      forOneHour = 3600
      forOneHourBs58 = toUInt32ToBase58(forOneHour)
      forOneDay = 3600 * 24
      forOneDayBs58 = toUInt32ToBase58(forOneDay)
      smallAsset = new Asset(200, sendAsset.symbol)
      sendAssetString = sendAsset.toString()
    })

    // Set system token to accepted list
    context('offering', async () => {
      let for3Secs: number
      let for3SecsBs58: string
      before(async () => {
        for3Secs = 3
        for3SecsBs58 = toUInt32ToBase58(for3Secs)
      })
      // Set RAM
      context('A/11', async () => {
        it('should fail with auth error 1', async () => {
          await assertMissingAuthority(sys_token.contract.transfer(user[0].name, contract.account.name, sendAsset.toString(), `RAM@${user[5].name}!${inOneDayBs58}`, { from: user[4] }))
        })
        it('should succeed relative time by user 3 to user 5 2', async () => {
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[3].name, contract.account.name, sendAsset.toString(), `RAM@${user[5].name}/${for3SecsBs58}`, { from: user[3] })
          }, false)
        })
        it('should succeed absolut time by user 4 to user 4 3', async () => {
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[4].name, contract.account.name, sendAsset.toString(), `RAM@${user[5].name}!${inOneDayBs58}`, { from: user[4] })
          }, false)
        })
        it('should fail with expired time 4', async () => {
          let currentTime = Math.floor(Date.now() / 1000)
          assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[3].name, contract.account.name, sendAsset.toString(), `RAM@${user[5].name}!${toUInt32ToBase58(currentTime)}`, { from: user[3] }), 'Time stamp is already over.')
        })
        it('should fail with negative number time 5', async () => {
          assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[3].name, contract.account.name, sendAsset.toString(), `RAM@${user[5].name}/${-1}`, { from: user[3] }), 'Decoding of the time value failed.')
        })
        it('should update RAM table 6', async () => {
          const rows = (await contract.ramTable({ scope: user[5].name })).rows
          chai.expect(rows.length).equal(2, 'Wrong amount of input')
          chai.expect(rows[0].from).equal('user.four', 'Wrong user')
          chai.expect(rows[1].from).equal('user.three', 'Wrong user')
          chai.expect(rows[0].amount).greaterThan(0, 'Wrong amount by user 4')
          chai.expect(rows[1].amount).greaterThan(0, 'Wrong amount by user 3')
          chai.expect(rows[0].amount).equal(rows[0].free, 'Used RAM from user 4')
          chai.expect(rows[1].amount).equal(rows[1].free, 'USed RAM from user 3')
          chai.expect(rows[0].maxTime).equal(inOneDay, 'Wrong time stamp')
          chai.expect(rows[1].maxTime).equal(for3Secs, 'Wrong relative time')
          chai.expect(rows[0].relative).equal(false, 'Time is relative')
          chai.expect(rows[1].relative).equal(true, 'Time is not relative')
          RamUser4 = Number(rows[0].amount)
          RamUser3 = Number(rows[1].amount)
        })
        it('should fail to change user 3 to absolut time lower than current time 7', async () => {
          let currentTime = Math.floor(Date.now() / 1000)
          assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[3].name, contract.account.name, sendAsset.toString(), `RAM@${user[5].name}!${toUInt32ToBase58(currentTime)}`, { from: user[3] }), 'Time stamp is already over.')
        })
        it('should succeed to change user 3 to absolut time 8', async () => {
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[3].name, contract.account.name, sendAsset.toString(), `RAM@${user[5].name}!${inOneDayBs58}`, { from: user[3] })
          })
        })
        it('should update RAM table 9', async () => {
          const rows = (await contract.ramTable({ scope: user[5].name })).rows
          chai.expect(rows.length).equal(2, 'Wrong amount of input')
          chai.expect(rows[0].from).equal('user.four', 'Wrong user')
          chai.expect(rows[1].from).equal('user.three', 'Wrong user')
          chai.expect(rows[0].amount).equal(RamUser4, 'Wrong amount by user 4')
          chai.expect(rows[1].amount).greaterThan(RamUser3, 'Wrong amount by user 3')
          chai.expect(rows[0].amount).equal(rows[0].free, 'Used RAM from user 4')
          chai.expect(rows[1].amount).equal(rows[1].free, 'USed RAM from user 3')
          chai.expect(rows[0].maxTime).equal(inOneDay, 'Wrong time stamp')
          chai.expect(rows[1].maxTime).equal(inOneDay, 'Not changed to time stamp')
          chai.expect(rows[0].relative).equal(false, 'Time is not relative')
          chai.expect(rows[1].relative).equal(false, 'Time is not relative')
          RamUser3 = Number(rows[1].amount)
        })
        it('should succeed to change user 4 to relative time 10', async () => {
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[4].name, contract.account.name, sendAsset.toString(), `RAM@${user[5].name}/${for3SecsBs58}`, { from: user[4] })
          })
        })
        it('should update RAM table 11', async () => {
          const rows = (await contract.ramTable({ scope: user[5].name })).rows
          chai.expect(rows.length).equal(2, 'Wrong amount of input')
          chai.expect(rows[0].from).equal('user.four', 'Wrong user')
          chai.expect(rows[1].from).equal('user.three', 'Wrong user')
          chai.expect(rows[0].amount).greaterThan(RamUser4, 'Wrong amount by user 4')
          chai.expect(rows[1].amount).equal(RamUser3, 'Wrong amount by user 3')
          chai.expect(rows[0].amount).equal(rows[0].free, 'Used RAM from user 4')
          chai.expect(rows[1].amount).equal(rows[1].free, 'USed RAM from user 3')
          chai.expect(rows[0].maxTime).equal(for3Secs, 'Wrong time stamp')
          chai.expect(rows[1].maxTime).equal(inOneDay, 'Not changed to time stamp')
          chai.expect(rows[0].relative).equal(true, 'Time is not relative')
          chai.expect(rows[1].relative).equal(false, 'Time is not relative')
          RamUser4 = Number(rows[0].amount)
        })
      })
    })
    context('removing', async () => {
      // Remove RAM
      context('B/6', async () => {
        before(async () => {
          ;[nirvanaAsset, user3Asset, user4Asset, user5Asset] = await getBalances([nirvana, user[3], user[4], user[5]], sys_token)
        })
        it('should fail with auth error 1', async () => {
          await assertEOSErrorIncludesMessage(contract.removeram(user[3].name, user[5].name, { from: user[4] }), 'You have no right to remove this entry.')
        })
        it('should fail with auth error 2', async () => {
          await assertEOSErrorIncludesMessage(contract.removeram(user[3].name, user[5].name, { from: contract.account }), 'You have no right to remove this entry.')
        })
        it('should succeed by offerer 3', async () => {
          await check.ramTrace(async () => {
            return contract.removeram(user[3].name, user[5].name, { from: user[3] })
          })
        })
        it('should succeed by benificiary 4', async () => {
          await check.ramTrace(async () => {
            return contract.removeram(user[4].name, user[5].name, { from: user[5] })
          })
        })
        it('should fail to find an entry 5', async () => {
          await assertEOSErrorIncludesMessage(contract.removeram(user[3].name, user[5].name, { from: user[5] }), 'Entry does not exist.')
        })
        it('should be paid correctly 6', async () => {
          const [newNirvanaAsset, newuser3Asset, newuser4Asset, newuser5Asset] = await getBalances([nirvana, user[3], user[4], user[5]], sys_token)
          // chai.expect(newContractAsset.amount - contractAsset.amount).equal(0, 'Wrong contract amount')
          chai.expect(newNirvanaAsset.amount - nirvanaAsset.amount).lessThan(50, 'Wrong nirvana amount')
          chai.expect(user3Asset.amount + 2 * sendAsset.amount - newuser3Asset.amount).lessThan(100, 'Wrong user 3 amount')
          chai.expect(user4Asset.amount + 2 * sendAsset.amount - newuser4Asset.amount).lessThan(50, 'Wrong user 4 amount')
          chai.expect(newuser5Asset.amount - user5Asset.amount).equal(0, 'Wrong user 5 amount')
        })
      })
    })
    context('editing', async () => {
      // Edit used RAM
      context('C/2 use RAM', async () => {
        it('should succeed to add four different RAM offerer to user 5 1', async () => {
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, smallAsset.toString(), `RAM@${user[5].name}!${inOneHourBs58}`, { from: user[0] })
          }, false)
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[1].name, contract.account.name, smallAsset.toString(), `RAM@${user[5].name}/${forOneHourBs58}`, { from: user[1] })
          }, false)

          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[3].name, contract.account.name, smallAsset.toString(), `RAM@${user[5].name}!${inOneDayBs58}`, { from: user[3] })
          }, false)
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[4].name, contract.account.name, smallAsset.toString(), `RAM@${user[5].name}/${forOneDayBs58}`, { from: user[4] })
          }, false)
        })
        it('should succeed to execute four payments and lend RAM 2', async () => {
          let boughtTimes = 0
          let sumOfAllDeltaRAM = 0
          for (let i = 0; i < 4; i++) {
            const r = await check.ramTrace(async () => {
              return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@${user[5].name}!${inOneDayBs58};from user_0 to user_5 ${i}`, { from: user[0] })
            }, false)
            if (r.sum.bought > 0) {
              sumOfAllDeltaRAM += r.sum.bought
              boughtTimes++
            }
          }
          chai.expect(boughtTimes).equal(1, 'Wrong number of payments which uses offered RAM')
          const tr = await contract.ramTable({ scope: user[5].name })
          const used_e0 = Number(tr.rows[0].amount) - Number(tr.rows[0].free)
          const used_e1 = Number(tr.rows[1].amount) - Number(tr.rows[1].free)
          const used_e2 = Number(tr.rows[2].amount) - Number(tr.rows[2].free)
          const used_e3 = Number(tr.rows[3].amount) - Number(tr.rows[3].free)
          chai.expect(sumOfAllDeltaRAM).lessThanOrEqual(used_e0 + used_e1 + used_e2 + used_e3, 'Wrong number of payments which uses offered RAM')
          chai.expect(tr.rows[1].maxTime).greaterThanOrEqual(forOneHour, 'Wrong max time')
          chai.expect(tr.rows[3].maxTime).greaterThanOrEqual(inOneHour, 'Wrong max time')
          chai.expect(used_e1).equal(0, 'Wrong number of')
          chai.expect(used_e3).equal(0, 'Wrong number of')
          console.log(`Use of ${used_e0} RAM offered by ${tr.rows[0].from}`)
          console.log(`Use of ${used_e2} RAM offered by ${tr.rows[2].from}`)

          const rtp = await contract.pay2nameTable({ scope: user[5].name })
          chai.expect(rtp.rows[0].ramBy).equal(tr.rows[0].from, 'Wrong user mentioned for RAM in payment table')
          chai.expect(rtp.rows[1].ramBy).equal(tr.rows[2].from, 'Wrong user mentioned for RAM in payment table')
          chai.expect(rtp.rows[2].ramBy).equal(tr.rows[2].from, 'Wrong user mentioned for RAM in payment table')
          chai.expect(rtp.rows[3].ramBy).equal(contract.account.name, 'Contract account is not mentioned for RAM in payment table')

          chai.expect(rtp.rows[0].fund).equal(sendAssetString, 'Reduced token amount')
          chai.expect(rtp.rows[1].fund).equal(sendAssetString, 'Reduced token amount')
          chai.expect(rtp.rows[2].fund).equal(sendAssetString, 'Reduced token amount')
          chai.expect(stringToAsset(rtp.rows[3].fund).amount).lessThan(sendAsset.amount, 'Should have sold some token for RAM')
        })
      })
      context('D/3 edit entries', async () => {
        before(async () => {
          const {
            rows: [item],
          } = await contract.ramTable({ scope: user[5].name, limit: 1, lowerBound: user[3].name })
          offerer3_ram = { amount: Number(item.amount), free: Number(item.free) }
          chai.expect(offerer3_ram.amount - offerer3_ram.free != 0).equal(true, 'Equal RAM amount')
        })
        it('should succeed to change to a relative earlier time 1', async () => {
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[3].name, contract.account.name, sendAsset.toString(), `RAM@${user[5].name}/${forOneHourBs58}`, { from: user[3] })
          }, false)
          const {
            rows: [item],
          } = await contract.ramTable({ scope: user[5].name, limit: 1, lowerBound: user[3].name })
          chai.expect(item.maxTime).equal(forOneHour, 'Wrong time')
          chai.expect(item.relative).equal(true, 'Not relative')
          chai.expect(item.amount).greaterThan(offerer3_ram.amount, 'Got no new RAM')
          chai.expect(Number(item.amount) - offerer3_ram.amount).equal(Number(item.free) - offerer3_ram.free, 'Got unequal new RAM')
          offerer3_ram.amount = Number(item.amount)
          offerer3_ram.free = Number(item.free)
        })
        it('should succeed to change to a absolute earlier time 2', async () => {
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[3].name, contract.account.name, sendAsset.toString(), `RAM@${user[5].name}!${inOneHourBs58}`, { from: user[3] })
          }, false)
          const {
            rows: [item],
          } = await contract.ramTable({ scope: user[5].name, limit: 1, lowerBound: user[3].name })
          chai.expect(item.maxTime).equal(inOneHour, 'Wrong time')
          chai.expect(item.relative).equal(false, 'Is relative')
          chai.expect(item.amount).greaterThan(offerer3_ram.amount, 'Got no new RAM')
          chai.expect(Number(item.amount) - offerer3_ram.amount).equal(Number(item.free) - offerer3_ram.free, 'Got unequal new RAM')
          offerer3_ram.amount = Number(item.amount)
          offerer3_ram.free = Number(item.free)
        })
        it('should succeed to remove remaining free RAM 3', async () => {
          await check.ramTrace(async () => {
            return contract.removeram(user[3].name, user[5].name, { from: user[3] })
          })
          const {
            rows: [item],
          } = await contract.ramTable({ scope: user[5].name, limit: 1, lowerBound: user[3].name })
          chai.expect(item.maxTime).equal(inOneHour, 'Time changed')
          chai.expect(item.relative).equal(false, 'Relative changed')
          chai.expect(item.free).equal(0, 'Not sold any free RAM')
          chai.expect(item.amount).equal(offerer3_ram.amount - offerer3_ram.free, 'Sold not only used RAM')
          offerer3_ram.amount = Number(item.amount)
          offerer3_ram.free = Number(item.free)
        })
      })
      context('E/6 complete payments', async () => {
        before(async () => {
          const {
            rows: [item],
          } = await contract.ramTable({ scope: user[5].name, limit: 1, lowerBound: user[4].name })
          offerer4_ram = { amount: Number(item.amount), free: Number(item.free) }
          chai.expect(offerer4_ram.amount - offerer4_ram.free != 0).equal(true, 'Equal RAM amount')
          offerer4_ram.amount = Number(item.amount)
          offerer4_ram.free = Number(item.free)
        })
        it('should fail to finalize without token entry 1', async () => {
          await assertEOSErrorIncludesMessage(contract.finalize(user[5].name, 0, { from: user[0] }), 'The user has no entry for this token.')
        })
        it('should succeed to open a token entry 2', async () => {
          await sys_token.contract.open(user[5].name, sys_token.symbol.toString(), user[5].name, { from: user[5] })
        })
        it('should succeed to finalize and to return RAM excluded RAM for scope 3', async () => {
          await check.ramTrace(async () => {
            return contract.finalize(user[5].name, 0, { from: user[0] })
          })
          const {
            rows: [item],
          } = await contract.ramTable({ scope: user[5].name, limit: 1, lowerBound: user[4].name })
          chai.expect(item.free).greaterThan(offerer4_ram.free, 'Got no RAM back')
          chai.expect(Number(item.free) - Number(item.amount)).lessThan(0, 'Whole or more than available RAM is free')
          offerer4_ram.amount = Number(item.amount)
          offerer4_ram.free = Number(item.free)
        })
        it('should succeed to invalidate a payment and return the RAM to user 3 4', async () => {
          await check.ramTrace(async () => {
            return contract.invalidate(user[5].name, 1, { from: user[0] })
          })
          const {
            rows: [item],
          } = await contract.ramTable({ scope: user[5].name, limit: 1, lowerBound: user[3].name })
          chai.expect(item.free).greaterThan(offerer3_ram.free, 'Got no RAM back')
          chai.expect(Number(item.free) - Number(item.amount)).lessThan(0, 'Whole or more than available RAM is free')
          offerer3_ram.amount = Number(item.amount)
          offerer3_ram.free = Number(item.free)
          // Check by the way other entries as well of this offerer
          chai.expect(item.maxTime).equal(inOneHour, 'Time changed')
          chai.expect(item.relative).equal(false, 'Relative changed')
        })
        it('should succeed to reject a payment and return the RAM 5', async () => {
          await check.ramTrace(async () => {
            return contract.reject(user[5].name, 2, { from: user[5] })
          })
          const {
            rows: [item],
          } = await contract.ramTable({ scope: user[5].name, limit: 1, lowerBound: user[3].name })

          console.log('item.amount', item.amount)
          console.log('offerer3_ram.amount', offerer3_ram.amount)

          chai.expect(item.amount).equal(offerer3_ram.amount, 'Total RAM amount changed')
          chai.expect(Number(item.amount) - Number(item.free)).equal(0, 'Got not all offered RAM back')
          offerer3_ram.amount = Number(item.amount)
          offerer3_ram.free = Number(item.free)
          // Check by the way other entries as well of this offerer
          chai.expect(item.maxTime).equal(inOneHour, 'Time changed')
          chai.expect(item.relative).equal(false, 'Relative changed')
        })
        it('should succeed to finalize last payment and return RAM for scope 6', async () => {
          await check.ramTrace(async () => {
            return contract.finalize(user[5].name, 3, { from: user[0] })
          })
          const {
            rows: [item],
          } = await contract.ramTable({ scope: user[5].name, limit: 1, lowerBound: user[4].name })
          chai.expect(item.amount).equal(offerer4_ram.amount, 'Total RAM amount changed')
          chai.expect(Number(item.amount) - Number(item.free)).equal(0, 'Got not all offered RAM back')
        })
      })
      context('F/15 extend payment', async () => {
        let inTwoHours: number
        let ram_state: Array<SavactsavpayRam>
        let minAsset: Asset
        let balanceUser2: number
        let rejectedAmountE6: number
        let rejectedAmountE7: number
        before(async () => {
          minAsset = new Asset(1, sys_token.symbol)
          inTwoHours = inOneHour + 3600
        })
        it('should succeed to edit some RAM offerer 1', async () => {
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[4].name, contract.account.name, minAsset.toString(), `RAM@${user[5].name}!${inOneDayBs58}`, { from: user[4] })
          }, false)
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[3].name, contract.account.name, minAsset.toString(), `RAM@${user[5].name}/${forOneDayBs58}`, { from: user[3] })
          }, false)
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, minAsset.toString(), `RAM@${user[5].name}!${inTwoDaysBs58}`, { from: user[0] })
          }, false)
        })
        it('should succeed to execute two payments and lend RAM 2', async () => {
          const r1 = await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@${user[5].name}!${inOneHourBs58};from user_0 to user_5 ${4}`, { from: user[0] })
          }, false)
          const r2 = await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@${user[5].name}!${inOneHourBs58};from user_0 to user_5 ${5}`, { from: user[0] })
          }, false)
          chai.expect(r1.sum.bought == 0 && r2.sum.bought == 0).equal(true, 'Bought RAM instead of boworring it')
          const rtp = await contract.pay2nameTable({ scope: user[5].name })
          chai.expect(rtp.rows[0].ramBy).equal(user[4].name, 'Wrong RAM offerer')
          chai.expect(rtp.rows[1].ramBy).equal(user[1].name, 'Wrong RAM offerer')
          const tr = await contract.ramTable({ scope: user[5].name })
          ram_state = tr.rows
          chai.expect(tr.rows[0].from).equal(user[4].name, 'Not expected user in RAM table row')
          chai.expect(tr.rows[1].from).equal(user[1].name, 'Not expected user in RAM table row')
          chai.expect(tr.rows[2].from).equal(user[3].name, 'Not expected user in RAM table row')
          chai.expect(tr.rows[3].from).equal(user[0].name, 'Not expected user in RAM table row')
          chai.expect(ram_state[0].amount != ram_state[0].free).equal(true, 'Used another RAM offerer')
          chai.expect(ram_state[1].amount != ram_state[1].free).equal(true, 'Used another RAM offerer')
        })
        it('should succeed to extend payment by keep the RAM payer 3', async () => {
          const r = await check.ramTrace(async () => {
            return contract.extend(user[5].name, 4, inTwoHours, { from: user[5] })
          })
          chai.expect(r.sum.bought).equal(0, 'Bought RAM')
          const rtp = await contract.pay2nameTable({ scope: user[5].name })
          chai.expect(rtp.rows[0].ramBy).equal(user[4].name, 'Not the same offerer')
        })
        it('should succeed to extend payment by switching to a relative RAM payer 4', async () => {
          const r = await check.ramTrace(async () => {
            return contract.extend(user[5].name, 5, inTwoHours, { from: user[5] })
          })
          chai.expect(r.sum.bought).equal(0, 'Bought RAM')
          const rtp = await contract.pay2nameTable({ scope: user[5].name })
          chai.expect(rtp.rows[1].ramBy).equal(user[3].name, 'Wrong RAM offerer')
          const tr = await contract.ramTable({ scope: user[5].name })

          chai.expect(tr.rows[2].amount != tr.rows[2].free).equal(true, 'Not lend RAM')
          chai.expect(tr.rows[1].amount == tr.rows[1].free).equal(true, 'RAM was not given back')
        })
        it('should succeed to extend payment by switching to a absolute RAM payer 5', async () => {
          const r = await check.ramTrace(async () => {
            return contract.extend(user[5].name, 5, inTwoDays, { from: user[5] })
          })
          chai.expect(r.sum.bought).equal(0, 'Bought RAM')
          const rtp = await contract.pay2nameTable({ scope: user[5].name })
          chai.expect(rtp.rows[1].ramBy).equal(user[0].name, 'Wrong RAM offerer')
          const tr = await contract.ramTable({ scope: user[5].name })
          chai.expect(tr.rows[3].amount != tr.rows[3].free).equal(true, 'Not lend RAM')
          chai.expect(tr.rows[2].amount == tr.rows[2].free).equal(true, 'RAM was not given back')
        })
        it('should fail with not available time limit 6', async () => {
          assertEOSErrorIncludesMessage(contract.extend(user[5].name, 5, inTwoDays + 1, { from: user[5] }), 'No RAM payer for this time span.')
        })
        it('should succeed to set a key to name payment 7', async () => {
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${pubKey1K1.toString()}@${user[5].name}!${inOneHourBs58}; from k1 to user 5 6`, { from: user[0] })
          }, false)
          const rows = (await contract.pay2nameTable({ scope: user[5].name })).rows
          chai.expect(rows.length).equal(3, 'Wrong number of entries in pay2name table')
          chai.expect(rows[2].ramBy).equal(user[1].name, 'Wrong RAM offerer')
          chai.expect(stringToAsset(rows[2].fund).amount).equal(sendAsset.amount, 'Amount was reduces although the RAM is borrowed')
        })
        it('should succeed to set a key to name payment 8', async () => {
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `${pubKey1K1.toString()}@${user[5].name}!${inOneHourBs58}; from k1 to user 5 7`, { from: user[0] })
          }, false)
          const rows = (await contract.pay2nameTable({ scope: user[5].name })).rows
          chai.expect(rows.length).equal(4, 'Wrong number of entries in pay2name table')
          chai.expect(rows[3].ramBy).equal(user[1].name, 'Wrong RAM offerer')
        })
        it('should succeed to set a key to name payment with minimum fund amount 9', async () => {
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[0].name, contract.account.name, new Asset(1, sys_token.symbol).toString(), `${pubKey1K1.toString()}@${user[5].name}!${inOneHourBs58}; from k1 to user 5 8`, { from: user[0] })
          }, false)
          const rows = (await contract.pay2nameTable({ scope: user[5].name })).rows
          chai.expect(rows.length).equal(5, 'Wrong number of entries in pay2name table')
          chai.expect(rows[4].ramBy).equal(user[3].name, 'Wrong RAM offerer')
        })
        it('should succeed to reject key to name 10', async () => {
          await check.ramTrace(async () => {
            return contract.reject(user[5].name, 6, { from: user[5] })
          })
          const rows = (await contract.pay2nameTable({ scope: user[5].name })).rows
          chai.expect(rows.length).equal(5, 'Wrong number of entries in pay2name table')
          chai.expect(rows[2].time).equal(0, 'No rejection mark')
          chai.expect(rows[2].ramBy).equal(contract.account.name, 'Does not bought the RAM')
          rejectedAmountE6 = stringToAsset(rows[2].fund).amount
          chai.expect(rejectedAmountE6).lessThan(sendAsset.amount, 'No reduction of fund amount')
        })
        it('should succeed to reject key to name 11', async () => {
          await check.ramTrace(async () => {
            return contract.reject(user[5].name, 7, { from: user[5] })
          })
          const rows = (await contract.pay2nameTable({ scope: user[5].name })).rows
          chai.expect(rows.length).equal(5, 'Wrong number of entries in pay2name table')
          chai.expect(rows[3].time).equal(0, 'No rejection mark')
          chai.expect(rows[3].ramBy).equal(contract.account.name, 'Does not bought the RAM')
          chai.expect(stringToAsset(rows[3].fund).amount).lessThan(sendAsset.amount, 'No reduction of fund amount')
        })
        it('should fail to reject key to name with too small amount 12', async () => {
          await assertEOSErrorIncludesMessage(contract.reject(user[5].name, 8, { from: user[5] }), 'Fund is too small to buy the RAM for it.')
        })
        it('should succeed to payout rejected key to name for account without open token 13', async () => {
          balanceUser2 = (await getBalance(user[2], sys_token)).amount
          const sigtime = Math.floor(Date.now() / 1000)
          const sig = signPayOff(priKey1K1.toString(), mainNetChainId, contract.account.name, user[5].name, user[2].name, (6).toString(), sigtime.toString()).sig
          await check.ramTrace(async () => {
            return contract.payoffsig(user[5].name, 6, user[2].name, sigtime, sig, { from: user[0] })
          }, false)
          const rows = (await contract.pay2nameTable({ scope: user[5].name })).rows
          chai.expect(rows.length).equal(4, 'Wrong number of entries in pay2name table')
          const newBalanceUser2 = (await getBalance(user[2], sys_token)).amount
          chai.expect(newBalanceUser2 - balanceUser2).equal(rejectedAmountE6, 'No reduction of the rejected amount for opening a token entry')

          balanceUser2 = newBalanceUser2
          rejectedAmountE7 = stringToAsset(rows[2].fund).amount
        })
        it('should succeed to payout rejected key to name for account 14', async () => {
          const sigtime = Math.floor(Date.now() / 1000)
          const sig = signPayOff(priKey1K1.toString(), mainNetChainId, contract.account.name, user[5].name, user[2].name, (7).toString(), sigtime.toString()).sig
          await check.ramTrace(async () => {
            return contract.payoffsig(user[5].name, 7, user[2].name, sigtime, sig, { from: user[0] })
          }, false)
          const rows = (await contract.pay2nameTable({ scope: user[5].name })).rows
          chai.expect(rows.length).equal(3, 'Wrong number of entries in pay2name table')
          const newBalanceUser2 = (await getBalance(user[2], sys_token)).amount
          chai.expect(newBalanceUser2 - balanceUser2).greaterThan(rejectedAmountE7, 'No reduction of the rejected amount for opening a token entry')
          balanceUser2 = newBalanceUser2
        })
        it('should succeed to remove all RAM offerer 15', async () => {
          const sigtime = Math.floor(Date.now() / 1000)
          const sig = signFinalize(priKey1K1.toString(), mainNetChainId, contract.account.name, user[5].name, (8).toString(), sigtime.toString()).sig
          await check.ramTrace(async () => {
            return contract.finalizesig(user[5].name, 8, sigtime, sig, { from: user[0] })
          })
          await check.ramTrace(async () => {
            return contract.finalize(user[5].name, 4, { from: user[0] })
          })
          await check.ramTrace(async () => {
            return contract.finalize(user[5].name, 5, { from: user[0] })
          })
          await check.ramTrace(async () => {
            return contract.removeram(user[0].name, user[5].name, { from: user[0] })
          })
          await check.ramTrace(async () => {
            return contract.removeram(user[1].name, user[5].name, { from: user[1] })
          })
          await check.ramTrace(async () => {
            return contract.removeram(user[3].name, user[5].name, { from: user[5] })
          })
          await check.ramTrace(async () => {
            return contract.removeram(user[4].name, user[5].name, { from: user[5] })
          })
          const tr = await contract.ramTable({ scope: user[5].name })
          chai.expect(tr.rows.length).equal(0, 'There are still RAM offerer')
        })
      })
    })
  })
}

function testCustomToken() {
  let sendCustom: Asset
  let sendCustomString: string
  let sendAsset: Asset
  let inOneDay: number
  let inOneDayBs58: string
  let smallAsset: Asset
  let inOneHour: number
  let inOneHourBs58: string
  let forOneHour: number
  let forOneHourBs58: string
  let forOneDay: number
  let forOneDayBs58: string
  let ramBefore: SavactsavpayRam
  let inTwoSecs: number
  let inTwoSecsBs58: string
  let balanceUser0: { name: string; system: number; custom: number }
  let balanceUser8: { name: string; system: number; custom: number }
  describe('Custom token', () => {
    before(async () => {
      sendAsset = new Asset(1000, sys_token.symbol)
      inOneHour = Math.floor(Date.now() / 1000) + 3600
      inOneHourBs58 = toUInt32ToBase58(inOneHour)
      inOneDay = Math.round(Date.now() / 1000) + 3600 * 24
      inOneDayBs58 = toUInt32ToBase58(inOneDay)
      forOneHour = 3600
      forOneHourBs58 = toUInt32ToBase58(forOneHour)
      forOneDay = 3600 * 24
      forOneDayBs58 = toUInt32ToBase58(forOneDay)
      smallAsset = new Asset(200, sendAsset.symbol)
      sendAssetString = sendAsset.toString()

      // Deploy, initialize and issue a custom token called FIAT
      custom_token = {
        contract: await ContractDeployer.deployWithName<EosioToken>('contracts/eosio.token/eosio.token', 'custom.token'),
        symbol: new Symbol('FIAT', 2),
      }
      await initToken(custom_token)
      await issueToken(custom_token, [user[0], user[6], user[7]], 10000000)

      sendCustom = new Asset(100, custom_token.symbol)
      sendCustomString = sendCustom.toString()
    })
    context('A/9 add custom token', async () => {
      it('should fail to deactivate with auth error 1', async () => {
        await assertMissingAuthority(contract.settoken(custom_token.contract.account.name, custom_token.symbol.toString(), 240, false, { from: sys_token.contract.account }))
      })
      it('should succeed to deactivate it 2', async () => {
        await contract.settoken(custom_token.contract.account.name, custom_token.symbol.toString(), 240, false, { from: contract.account })
      })
      it('should update tokens table 3', async () => {
        let {
          rows: [item],
        } = await contract.tokensTable({ scope: custom_token.contract.account.name })
        chai.expect(item.token).equal(custom_token.symbol.toString(), 'Wrong token contract')
        chai.expect(item.openBytes).equal(240, 'Wrong byte number to open a token entry per user')
        chai.expect(item.active).equal(false, 'Token is still accepted')
      })
      it('should fail to send a payment 4', async () => {
        await assertEOSErrorIncludesMessage(custom_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@${user[1].name}!${inOneDayBs58}`, { from: user[0] }), 'unable to find key')
      })
      it('should fail to activate with auth error 5', async () => {
        await assertMissingAuthority(contract.settoken(custom_token.contract.account.name, custom_token.symbol.toString(), 240, true, { from: custom_token.contract.account }))
      })
      it('succeed to activate it with other token precision 6', async () => {
        const sym = new Symbol(custom_token.symbol.name, 3)
        await contract.settoken(custom_token.contract.account.name, sym.toString(), 240, true, { from: contract.account })
      })
      it('should fail to send a payment with this other token precision 7', async () => {
        await assertEOSErrorIncludesMessage(custom_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `@${user[1].name}!${inOneDayBs58}`, { from: user[0] }), 'unable to find key')
      })
      it('should succeed to activate it with right token precision 8', async () => {
        await contract.settoken(custom_token.contract.account.name, custom_token.symbol.toString(), 240, true, { from: contract.account })
      })
      it('should update tokens table 9', async () => {
        let {
          rows: [item],
        } = await contract.tokensTable({ scope: custom_token.contract.account.name })
        chai.expect(item.token).equal(custom_token.symbol.toString(), 'Wrong token contract')
        chai.expect(item.openBytes).equal(240, 'Wrong byte number to open a token entry per user')
        chai.expect(item.active).equal(true, 'Token is still not accepted')
      })
    })
    context('B/12 payment', async () => {
      let sendBigAssetString: string
      before(async () => {
        sendBigAssetString = new Asset(10000, sys_token.symbol).toString()
      })
      it('should succeed to open custom token entry of payments contract 1', async () => {
        await check.ramTrace(async () => {
          return custom_token.contract.open(contract.account.name, custom_token.symbol.toString(), user[0].name, { from: user[0] })
        })
      })
      it('should fail to send with no offered RAM 2', async () => {
        await assertEOSErrorIncludesMessage(custom_token.contract.transfer(user[0].name, contract.account.name, sendCustomString, `@${user[8].name}!${inOneDayBs58}`, { from: user[0] }), 'Not enough RAM offered for this recipient.')
      })
      it('should fail to add RAM via wrong contract RAM 3', async () => {
        await assertEOSErrorIncludesMessage(custom_token.contract.transfer(user[0].name, contract.account.name, sendAssetString, `RAM@${user[8].name}!${inTwoDaysBs58}`, { from: user[0] }), 'unable to find key')
      })
      it('should fail to add RAM via wrong symbol RAM 4', async () => {
        let sA = new Asset(sendAsset.amount, custom_token.symbol)
        await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, sA.toString(), `RAM@${user[8].name}!${inTwoDaysBs58}`, { from: user[0] }), 'unable to find key')
      })
      it('should fail to send a payment with no offered RAM 5', async () => {
        await assertEOSErrorIncludesMessage(custom_token.contract.transfer(user[0].name, contract.account.name, sendCustomString, `@${user[8].name}!${inOneDayBs58}`, { from: user[0] }), 'Not enough RAM offered for this recipient.')
      })
      it('should succed to add a small amount of RAM 6', async () => {
        await check.ramTrace(async () => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, new Asset(150, sys_token.symbol).toString(), `RAM@${user[8].name}!${inTwoDaysBs58}`, { from: user[0] })
        }, false)
      })
      it('should fail to send a payment with not enough offered RAM 7', async () => {
        await assertEOSErrorIncludesMessage(custom_token.contract.transfer(user[0].name, contract.account.name, sendCustomString, `@${user[8].name}!${inOneDayBs58}`, { from: user[0] }), 'Not enough RAM offered for this recipient.')
      })
      it('should succeed to add a big amount of RAM 8', async () => {
        await check.ramTrace(async () => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, sendBigAssetString, `RAM@${user[8].name}!${inTwoDaysBs58}`, { from: user[0] })
        }, false)
        ramBefore = (await contract.ramTable({ scope: user[8].name })).rows[0]
      })
      it('should succeed name to name 9', async () => {
        await check.ramTrace(async () => {
          return custom_token.contract.transfer(user[0].name, contract.account.name, sendCustomString, `@${user[8].name}!${inOneDayBs58}`, { from: user[0] })
        }, false)
        ramBefore = await checkAndLogRAM(ramBefore, true, user[8].name, user[0].name)

        const r_pay = await contract.pay2nameTable({ scope: user[8].name })
        chai.expect(r_pay.rows[0].fund).equal(sendCustomString, 'Wrong asset')
        chai.expect(r_pay.rows[0].ramBy).equal(user[0].name, 'Wrong RAM offerer')
      })
      it('should succeed name to name with short time limit 10', async () => {
        inTwoSecs = Math.floor(Date.now() / 1000) + 2
        inTwoSecsBs58 = toUInt32ToBase58(inTwoSecs)
        await check.ramTrace(async () => {
          return custom_token.contract.transfer(user[0].name, contract.account.name, sendCustomString, `@${user[8].name}!${inTwoSecsBs58};from user 0 to user 8 with time limit of two seconds 1`, { from: user[0] })
        }, false)
        ramBefore = await checkAndLogRAM(ramBefore, true, user[8].name, user[0].name)
      })
      it('should succeed key to name 11', async () => {
        const veryLongMemo = 'from k1 to user 8 2 | very looooooooooooooooooooooooooooooooooooooooooooooooooonnnnnnnnnnggggggg eeeeeeeeeeeeeeeeeeeeennnnnnnnnnnntttttttttttrrrrrrrrrrryyyyyyyyyyyyyyyyyyyy!!!!!!'
        await check.ramTrace(async () => {
          return custom_token.contract.transfer(user[0].name, contract.account.name, sendCustomString, `${pubKey1K1.toString()}@${user[8].name}!${inOneDayBs58};${veryLongMemo}`, { from: user[0] })
        }, false)
        ramBefore = await checkAndLogRAM(ramBefore, true, user[8].name, user[0].name)
      })
      it('should succeed key to name with short time limit 12', async () => {
        inTwoSecs = Math.floor(Date.now() / 1000) + 2
        inTwoSecsBs58 = toUInt32ToBase58(inTwoSecs)
        await check.ramTrace(async () => {
          return custom_token.contract.transfer(user[0].name, contract.account.name, sendCustomString, `${pubKey1K1.toString()}@${user[8].name}!${inTwoSecsBs58}; from k1 to user 8 3`, { from: user[0] })
        }, false)
        ramBefore = await checkAndLogRAM(ramBefore, true, user[8].name, user[0].name)
      })
    })
    context('C/9 complete to origin recipient', async () => {
      before(async () => {
        ramBefore = (await contract.ramTable({ scope: user[8].name })).rows[0]
        balanceUser8 = await getSystemAndCustomBalances(user[8].name)
      })
      it('should fail to finish without recipient token entry 1', async () => {
        await assertEOSErrorIncludesMessage(contract.finalize(user[8].name, 0, { from: user[0] }), 'The user has no entry for this token.')
      })
      it('should succeed to open custom token entry of the recipient 2', async () => {
        await check.ramTrace(async () => {
          return custom_token.contract.open(user[8].name, custom_token.symbol.toString(), user[0].name, { from: user[0] })
        })
      })
      it('should succeed to finish name to name 3', async () => {
        await check.ramTrace(async () => {
          return contract.finalize(user[8].name, 0, { from: user[0] })
        })
        ramBefore = await checkAndLogRAM(ramBefore, false, user[8].name, user[0].name)

        const rows = (await contract.pay2nameTable({ scope: user[8].name })).rows
        chai.expect(rows.length).equal(3, 'Wrong number of entries in pay2name table')

        await checkAndUpdateCustomBalance(balanceUser8, sendCustom.amount)
      })
      it('should succeed to finish key to name 4', async () => {
        const sigTime = Math.floor(Date.now() / 1000)
        const sig = signFinalize(priKey1K1.toString(), mainNetChainId, contract.name, user[8].name, (2).toString(), sigTime.toString()).sig
        await check.ramTrace(async () => {
          return contract.finalizesig(user[8].name, 2, sigTime, sig, { from: user[0] })
        })
        ramBefore = await checkAndLogRAM(ramBefore, false, user[8].name, user[0].name)

        const rows = (await contract.pay2nameTable({ scope: user[8].name })).rows
        chai.expect(rows.length).equal(2, 'Wrong number of entries in pay2name table')

        await checkAndUpdateCustomBalance(balanceUser8, sendCustom.amount)
      })
      it('should succeed to payout expired name to name 5', async () => {
        await waitUntil(inTwoSecs - Date.now() / 1000)
        await check.ramTrace(async () => {
          return contract.payoff(user[8].name, 1, { from: user[0] })
        })
        ramBefore = await checkAndLogRAM(ramBefore, false, user[8].name, user[0].name)

        const rows = (await contract.pay2nameTable({ scope: user[8].name })).rows
        chai.expect(rows.length).equal(1, 'Wrong number of entries in pay2name table')

        await checkAndUpdateCustomBalance(balanceUser8, sendCustom.amount)
      })
      it('should succeed to payout expired key to name 6', async () => {
        await check.ramTrace(async () => {
          return contract.payoff(user[8].name, 3, { from: user[0] })
        })
        ramBefore = await checkAndLogRAM(ramBefore, false, user[8].name, user[0].name, true)

        const rows = (await contract.pay2nameTable({ scope: user[8].name })).rows
        chai.expect(rows.length).equal(0, 'There is still an entries in pay2name table')

        await checkAndUpdateCustomBalance(balanceUser8, sendCustom.amount)
      })
      it('should succeed to make a payment 7', async () => {
        await check.ramTrace(async () => {
          return custom_token.contract.transfer(user[0].name, contract.account.name, sendCustomString, `@${user[8].name}!${inOneDayBs58}`, { from: user[0] })
        }, false)
        ramBefore = await checkAndLogRAM(ramBefore, true, user[8].name, user[0].name)
      })
      it('should succeed to finalize this last payment in table 8', async () => {
        await check.ramTrace(async () => {
          return contract.finalize(user[8].name, 4, { from: user[0] })
        })
        ramBefore = await checkAndLogRAM(ramBefore, false, user[8].name, user[0].name, true)

        await checkAndUpdateCustomBalance(balanceUser8, sendCustom.amount)
      })
    })
    context('D/8 reject', async () => {
      before(async () => {
        ramBefore = (await contract.ramTable({ scope: user[8].name })).rows[0]
        balanceUser0 = await getSystemAndCustomBalances(user[0].name)
      })
      it('should succeed two name to name 1', async () => {
        await check.ramTrace(async () => {
          return custom_token.contract.transfer(user[0].name, contract.account.name, sendCustomString, `@${user[8].name}!${inOneDayBs58};from user 0 to user 8 5`, { from: user[0] })
        }, false)
        ramBefore = await checkAndLogRAM(ramBefore, true, user[8].name, user[0].name)
        await check.ramTrace(async () => {
          return custom_token.contract.transfer(user[0].name, contract.account.name, sendCustomString, `@${user[8].name}!${inOneDayBs58};from user 0 to user 8 6`, { from: user[0] })
        }, false)
        ramBefore = await checkAndLogRAM(ramBefore, true, user[8].name, user[0].name)
        await checkAndUpdateCustomBalance(balanceUser0, -2 * sendCustom.amount)
      })
      it('should succeed two key to name 2', async () => {
        await check.ramTrace(async () => {
          return custom_token.contract.transfer(user[0].name, contract.account.name, sendCustomString, `${pubKey1K1.toString()}@${user[8].name}!${inOneDayBs58};from k1 to user 8 7`, { from: user[0] })
        }, false)
        ramBefore = await checkAndLogRAM(ramBefore, true, user[8].name, user[0].name)
        await check.ramTrace(async () => {
          return custom_token.contract.transfer(user[0].name, contract.account.name, sendCustomString, `${pubKey1K1.toString()}@${user[8].name}!${inOneDayBs58};from k1 to user 8 8`, { from: user[0] })
        }, false)
        ramBefore = await checkAndLogRAM(ramBefore, true, user[8].name, user[0].name)
        await checkAndUpdateCustomBalance(balanceUser0, -2 * sendCustom.amount)
      })
      it('should succeed to reject name to name 3', async () => {
        await check.ramTrace(async () => {
          return contract.reject(user[8].name, 5, { from: user[8] })
        })
        ramBefore = await checkAndLogRAM(ramBefore, false, user[8].name, user[0].name)
        await checkAndUpdateCustomBalance(balanceUser0, sendCustom.amount)
      })
      it('should succeed to reject name to name 4', async () => {
        await check.ramTrace(async () => {
          return contract.reject(user[8].name, 6, { from: user[8] })
        })
        ramBefore = await checkAndLogRAM(ramBefore, false, user[8].name, user[0].name)

        const rows = (await contract.pay2nameTable({ scope: user[8].name })).rows
        chai.expect(rows.length).equal(2, 'Wrong number of entries in pay2name table')

        await checkAndUpdateCustomBalance(balanceUser0, sendCustom.amount)
      })
      it('should fail to reject key to name 5', async () => {
        await assertEOSErrorIncludesMessage(contract.reject(user[8].name, 7, { from: user[8] }), 'Cannot extend this token for a public key payment sender.')
      })
      it('should succeed to finalize bothe key to name entries instead 6', async () => {
        const sigTime = Math.floor(Date.now() / 1000)
        const sig7 = signFinalize(priKey1K1.toString(), mainNetChainId, contract.account.name, user[8].name, (7).toString(), sigTime.toString()).sig
        await check.ramTrace(async () => {
          return contract.finalizesig(user[8].name, 7, sigTime, sig7, { from: user[0] })
        })
        const sig8 = signFinalize(priKey1K1.toString(), mainNetChainId, contract.account.name, user[8].name, (8).toString(), sigTime.toString()).sig
        await check.ramTrace(async () => {
          return contract.finalizesig(user[8].name, 8, sigTime, sig8, { from: user[0] })
        })
        ramBefore = await checkAndLogRAM(ramBefore, false, user[8].name, user[0].name)
      })
      it('should succeed to make a payment 7', async () => {
        await check.ramTrace(async () => {
          return custom_token.contract.transfer(user[0].name, contract.account.name, sendCustomString, `@${user[8].name}!${inOneDayBs58}`, { from: user[0] })
        }, false)
        ramBefore = await checkAndLogRAM(ramBefore, true, user[8].name, user[0].name)

        await checkAndUpdateCustomBalance(balanceUser0, -sendCustom.amount)
      })
      it('should succeed to reject this last payment in table 8', async () => {
        await check.ramTrace(async () => {
          return contract.reject(user[8].name, 9, { from: user[8] })
        })
        ramBefore = await checkAndLogRAM(ramBefore, false, user[8].name, user[0].name, true)
        const rows = (await contract.pay2nameTable({ scope: user[8].name })).rows
        chai.expect(rows.length).equal(0, 'There is still an entries in pay2name table')

        await checkAndUpdateCustomBalance(balanceUser0, sendCustom.amount)
      })
    })
    context('E/4 extend', async () => {
      before(async () => {
        ramBefore = (await contract.ramTable({ scope: user[8].name })).rows[0]
      })
      it('should succeed name to name payment 1', async () => {
        await check.ramTrace(async () => {
          return custom_token.contract.transfer(user[0].name, contract.account.name, sendCustomString, `@${user[8].name}!${inOneDayBs58};from user 0 to user 8 10`, { from: user[0] })
        }, false)
        ramBefore = await checkAndLogRAM(ramBefore, true, user[8].name, user[0].name)
      })
      it('should succeed key to name 2', async () => {
        await check.ramTrace(async () => {
          return custom_token.contract.transfer(user[0].name, contract.account.name, sendCustomString, `${pubKey1K1.toString()}@${user[8].name}!${inOneDayBs58};from k1 to user 8 11`, { from: user[0] })
        }, false)
        ramBefore = await checkAndLogRAM(ramBefore, true, user[8].name, user[0].name)
      })
      it('should succeed to extend name to name 3', async () => {
        await check.ramTrace(async () => {
          return contract.extend(user[8].name, 10, inTwoDays, { from: user[8] })
        })
        ramBefore = await checkRAMisConstant(ramBefore, user[8].name, user[0].name)
      })
      it('should succeed to extend key to name 4', async () => {
        await check.ramTrace(async () => {
          return contract.extend(user[8].name, 11, inTwoDays, { from: user[8] })
        })
        ramBefore = await checkRAMisConstant(ramBefore, user[8].name, user[0].name)

        const rows = (await contract.pay2nameTable({ scope: user[8].name })).rows
        chai.expect(rows.length).equal(2, 'Wrong number of entries in pay2name table')
      })
    })
    context('F/9 payoff all', async () => {
      it('should succeed name to name payment 1', async () => {
        inTwoSecs = Math.floor(Date.now() / 1000) + 2
        inTwoSecsBs58 = toUInt32ToBase58(inTwoSecs)
        await check.ramTrace(async () => {
          return custom_token.contract.transfer(user[0].name, contract.account.name, sendCustomString, `@${user[8].name}!${inTwoSecsBs58};from user 0 to user 8 12`, { from: user[0] })
        }, false)
        ramBefore = await checkAndLogRAM(ramBefore, true, user[8].name, user[0].name)
      })
      it('should succeed name to name payment 2', async () => {
        inTwoSecs = Math.floor(Date.now() / 1000) + 2
        inTwoSecsBs58 = toUInt32ToBase58(inTwoSecs)
        await check.ramTrace(async () => {
          return custom_token.contract.transfer(user[0].name, contract.account.name, sendCustomString, `@${user[8].name}!${inTwoSecsBs58};from user 0 to user 8 13`, { from: user[0] })
        }, false)
        ramBefore = await checkAndLogRAM(ramBefore, true, user[8].name, user[0].name)
        const rows = (await contract.pay2nameTable({ scope: user[8].name })).rows
        chai.expect(rows.length).equal(4, 'Wrong number of entries in pay2name table')
      })
      it('should succeed to finalize name to name 3', async () => {
        await check.ramTrace(async () => {
          return contract.finalize(user[8].name, 10, { from: user[0] })
        })
        ramBefore = await checkAndLogRAM(ramBefore, false, user[8].name, user[0].name)
      })
      it('should succeed to finalie key to name 4', async () => {
        const sigtime = Math.floor(Date.now() / 1000)
        const sig = signFinalize(priKey1K1.toString(), mainNetChainId, contract.account.name, user[8].name, (11).toString(), sigtime.toString()).sig
        await check.ramTrace(async () => {
          return contract.finalizesig(user[8].name, 11, sigtime, sig, { from: user[8] })
        })
        ramBefore = await checkAndLogRAM(ramBefore, false, user[8].name, user[0].name)
        const rows = (await contract.pay2nameTable({ scope: user[8].name })).rows
        chai.expect(rows.length).equal(2, 'Wrong number of entries in pay2name table')
      })
      it('should succeed to send all custom tokens from user 8 to user 0 5', async () => {
        const balance = (await custom_token.contract.accountsTable({ scope: user[8].name })).rows[0].balance
        console.log(`Balance of ${user[8].name}`, balance)

        await custom_token.contract.transfer(user[8].name, user[0].name, balance, 'My gift for you', { from: user[8] })
      })
      it('should succeed to close custom tokens entry of user 8 6', async () => {
        await custom_token.contract.close(user[8].name, custom_token.symbol.toString(), { from: user[8] })
        balanceUser8 = await getSystemAndCustomBalances(user[8].name)
      })
      it('should fail to payout all extended payments to user 8 which has no open custom token 7', async () => {
        await waitUntil(inTwoSecs)
        await assertEOSErrorIncludesMessage(contract.payoffall(user[8].name, custom_token.contract.account.name, custom_token.symbol.toString(), 'Hello from 11 and 12', { from: user[8] }), 'Not enough RAM to open token row.')
      })
      it('should succeed to close opem tokens entry of user 8 8', async () => {
        await custom_token.contract.open(user[8].name, custom_token.symbol.toString(), user[0].name, { from: user[0] })
      })
      it('should succeed to payout all extended to name 9', async () => {
        await check.ramTrace(async () => {
          return contract.payoffall(user[8].name, custom_token.contract.account.name, custom_token.symbol.toString(), 'Hello from 11 and 12', { from: user[0] })
        })
        ramBefore = await checkAndLogRAM(ramBefore, false, user[8].name, user[0].name, true)

        const rows = (await contract.pay2nameTable({ scope: user[8].name })).rows
        chai.expect(rows.length).equal(0, 'Wrong number of entries in pay2name table')

        await checkAndUpdateCustomBalance(balanceUser8, 2 * sendCustom.amount)
      })
    })
  })
}

function testVote() {
  let inOneDay: number
  let inOneDayBs58: string
  let smallAsset: Asset
  let smallAssetString: string
  let inOneHour: number
  let inOneHourBs58: string
  let ramBefore: SavactsavpayRam
  let votememo1: string
  let votememo2: string
  describe('Vote', () => {
    before(async () => {
      smallAsset = new Asset(200, sys_token.symbol)
      smallAssetString = smallAsset.toString()
      inOneHour = Math.floor(Date.now() / 1000) + 3600
      inOneHourBs58 = toUInt32ToBase58(inOneHour)
      inOneDay = Math.round(Date.now() / 1000) + 3600 * 24
      inOneDayBs58 = toUInt32ToBase58(inOneDay)

      const sb = new SerialBuffer()
      sb.pushArray([1, 127])
      sb.pushArray([4, 2])
      sb.pushUint32(inOneDay - 3600)
      const arr = sb.getUint8Array(8)
      votememo1 = base58.encode(arr)

      const sb2 = new SerialBuffer()
      sb2.pushArray([1, 127])
      sb2.pushArray([4, 2])
      sb2.pushUint32(inOneDay - 3600)
      sb2.pushString('Whats up?') // Contains byte for string length, but thta is not necessary

      const arr2 = sb2.getUint8Array(sb2.length)
      votememo2 = base58.encode(arr2)
    })
    context('A/6', async () => {
      before(async () => {
        ramBefore = (await contract.ramTable({ scope: user[8].name })).rows[0]
      })
      it('should succeed a vote from name to name 1', async () => {
        await check.ramTrace(async () => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, smallAssetString, `@${user[7].name}!${inOneDayBs58}:${votememo1}`, { from: user[0] })
        }, false)
      })
      it('should succeed a vote from name to name 2', async () => {
        await check.ramTrace(async () => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, smallAssetString, `${user[1].name}@${user[7].name}!${inOneDayBs58}:${votememo1}`, { from: user[0] })
        }, false)
      })
      it('should succeed a vote from key to name 3', async () => {
        await check.ramTrace(async () => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, smallAssetString, `@${user[7].name}!${inOneDayBs58}:${votememo2}`, { from: user[0] })
        }, false)
      })
      it('should succeed a vote from name to key 4', async () => {
        await check.ramTrace(async () => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, smallAssetString, `@${user[7].publicKey}!${inOneDayBs58}:${votememo2}`, { from: user[0] })
        }, false)
      })
      it('should succeed a vote from key to key 5', async () => {
        await check.ramTrace(async () => {
          return sys_token.contract.transfer(user[0].name, contract.account.name, smallAssetString, `PAY${priKey1K1.getPublicKey().toString()}@${user[7].publicKey}!${inOneDayBs58}:${votememo2}`, { from: user[0] })
        }, false)
      })
      it('check tables 6', async () => {
        const toNameRows = (await contract.pay2nameTable({ scope: user[7].name })).rows
        chai.expect(toNameRows.length).equal(3, 'Wrong amount of name table entries')
        const splitKeyUser7 = splitPubKeyToScopeAndTableVec(PublicKey.fromString(user[7].publicKey as string))
        const toKeyRows = (await contract.pay2keyTable({ scope: splitKeyUser7.scope.toString() })).rows
        chai.expect(toKeyRows.length).equal(2, 'Wrong amount of key table entries')
        for (let entry of toNameRows) {
          chai.expect(entry.type).equal(1, `Entry ${entry.id} of ${user[7].name} is not defined as simple vote`)
        }
        for (let entry of toKeyRows) {
          chai.expect(entry.type).equal(1, `Entry ${entry.id} of ${user[7].publicKey} is not defined as simple vote`)
        }
      })
    })
  })
}

function testPublicVote() {
  let inOneHour: number, inOneDay: number
  let voteId: number
  let recoAsset0: Asset
  let recoAssetZero: Asset
  let recoTokenContract: string
  let vote_options0: Array<string>, vote_options1: Array<string>, vote_options2: Array<string>, vote_options3: Array<string>
  let vote_optionsData0: Array<SavactsavpayOptionData>, vote_optionsData1: Array<SavactsavpayOptionData>, vote_optionsData2: Array<SavactsavpayOptionData>, vote_optionsData3: Array<SavactsavpayOptionData>
  let vote_links: Array<SavactsavpayLink>
  let inOneMin: number
  let in11min: number
  let in11minBs58: string
  let smallAsset: Asset
  let smallAssetString: string
  let votememo1: string
  let recipient6PubK1: PublicKey
  let recipient6PriK1: PrivateKey
  let totalActiveN2N: Asset
  let totalActiveK2K: Asset

  describe('Public vote', () => {
    before(async () => {
      voteId = 34
      inOneHour = Math.floor(Date.now() / 1000) + 3600
      inOneDay = Math.round(Date.now() / 1000) + 3600 * 24
      recoAsset0 = new Asset(0, sys_token.symbol)
      recoAssetZero = new Asset(1000, sys_token.symbol)
      recoTokenContract = sys_token.contract.account.name
      vote_options0 = ['A', 'B', 'C']
      vote_optionsData0 = voteOptionToInitalOptionData(vote_options0)
      vote_options1 = ['', '', 'C']
      vote_optionsData1 = voteOptionToInitalOptionData(vote_options1)
      vote_options2 = ['Cake', 'Candy', 'Clowns']
      vote_optionsData2 = voteOptionToInitalOptionData(vote_options2)
      vote_options3 = ['1', '2', '3']
      vote_optionsData3 = voteOptionToInitalOptionData(vote_options3)

      vote_links = [
        { note: 'Use this for comments', url: 't.me/savact' },
        { note: 'Here you find the live video', url: 'https://www.youtube.com/channel/UC13wgATCxJZWAsZc310rzRw' },
        { note: '', url: 'https://twitter.com/SavActHQ' },
      ]

      if (user[6].publicKey) {
        recipient6PubK1 = PublicKey.fromString(user[6].publicKey)
      }
      if (user[6].privateKey) {
        recipient6PriK1 = PrivateKey.fromString(user[6].privateKey)
      }
    })

    // Set system token to accepted list
    context('add', async () => {
      let ram_User0: number
      before(async () => {
        ram_User0 = (await EOSManager.api.rpc.get_account(user[0].name)).ram_usage
      })
      context('A/12', async () => {
        it('should fail with auth error 1', async () => {
          await assertMissingAuthority(contract.addvote(user[0].name, '', voteId, inOneHour, inOneDay, recoAsset0.toString(), recoTokenContract, 'test1', vote_options0, vote_links, { from: user[4] }))
        })
        it('should fail with too long title 2', async () => {
          await assertEOSErrorIncludesMessage(contract.addvote(user[0].name, '', voteId, inOneHour, inOneDay, recoAsset0.toString(), recoTokenContract, 'a'.repeat(81), vote_options0, vote_links, { from: user[0] }), 'Title is too long.')
        })
        it('should succeed with user 0 as holder 3', async () => {
          await check.ramTrace(
            async () => {
              return contract.addvote(user[0].name, '', voteId, inOneHour, inOneDay, recoAsset0.toString(), recoTokenContract, 'a'.repeat(80), vote_options0, vote_links, { from: user[0] })
            },
            true,
            true,
            user[0].name
          )
        })
        it('should succeed with user 1 as holder, zero recommended amount and minimum time limits 4', async () => {
          inOneMin = Math.round(Date.now() / 1000) + 60 + 3
          in11min = inOneMin + 600
          await check.ramTrace(
            async () => {
              return contract.addvote(user[1].name, '', voteId, inOneMin, in11min, recoAssetZero.toString(), recoTokenContract, 'test1', vote_options1, vote_links, { from: user[1] })
            },
            true,
            true,
            user[0].name
          )
        })
        it('should succeed with user 0 as ram payer and user 3 as holder 5', async () => {
          await check.ramTrace(
            async () => {
              return contract.addvote(user[0].name, user[3].name, voteId, inOneMin, in11min, recoAssetZero.toString(), recoTokenContract, 'test1', vote_options2, vote_links, { from: user[0] })
            },
            true,
            true,
            user[0].name
          )
        })
        it('should succeed with user 0 as ram payer and public key as holder 6', async () => {
          await check.ramTrace(
            async () => {
              return contract.addvote(user[0].name, recipient6PubK1.toString(), voteId, inOneMin, in11min, recoAssetZero.toString(), recoTokenContract, 'test1', vote_options3, vote_links, { from: user[0] })
            },
            true,
            true,
            user[0].name
          )
        })
        it('should update votes table 7', async () => {
          await assertRowsEqual(contract.votesTable({ scope: contract.account.name }), [
            {
              index: 0,
              ramBy: user[0].name,
              holder: '',
              t: inOneDay,
              vt: inOneHour,
              vid: voteId,
              rtoken: recoAsset0.toString(),
              rtcontract: recoTokenContract,
              title: 'a'.repeat(80),
              options: vote_optionsData0,
              links: vote_links,
              a: 0,
              f: 0,
              i: 0,
              r: 0,
            },
            {
              index: 1,
              ramBy: user[1].name,
              holder: '',
              vt: inOneMin,
              t: in11min,
              vid: voteId,
              rtoken: recoAssetZero.toString(),
              rtcontract: recoTokenContract,
              title: 'test1',
              options: vote_optionsData1,
              links: vote_links,
              a: 0,
              f: 0,
              i: 0,
              r: 0,
            },
            {
              index: 2,
              ramBy: user[0].name,
              holder: nameToFromHex(user[3].name),
              vt: inOneMin,
              t: in11min,
              vid: voteId,
              rtoken: recoAssetZero.toString(),
              rtcontract: recoTokenContract,
              title: 'test1',
              options: vote_optionsData2,
              links: vote_links,
              a: 0,
              f: 0,
              i: 0,
              r: 0,
            },
            {
              index: 3,
              ramBy: user[0].name,
              holder: hexWithTypeOfPubKey(recipient6PubK1),
              vt: inOneMin,
              t: in11min,
              vid: voteId,
              rtoken: recoAssetZero.toString(),
              rtcontract: recoTokenContract,
              title: 'test1',
              options: vote_optionsData3,
              links: vote_links,
              a: 0,
              f: 0,
              i: 0,
              r: 0,
            },
          ])
        })
        it('should fail with too short vote time 8', async () => {
          await assertEOSErrorIncludesMessage(contract.addvote(user[0].name, '', voteId, Math.round(Date.now() / 1000) + 55, inOneDay, recoAsset0.toString(), recoTokenContract, 'test1', vote_options0, vote_links, { from: user[0] }), 'The time for a vote has to be at least 1 min.')
        })
        it('should fail with too long finalize time 9', async () => {
          await assertEOSErrorIncludesMessage(contract.addvote(user[0].name, '', voteId, inOneHour, Math.round(Date.now() / 1000) + 4 * 365 * 24 * 3600 + 24 * 3600, recoAsset0.toString(), recoTokenContract, 'test1', vote_options0, vote_links, { from: user[0] }), 'The time for a vote should be less than 4 years.')
        })
        it('should fail with too short finalize time after vote time ends 10', async () => {
          const inOneMin = Math.round(Date.now() / 1000) + 60 + 3
          await assertEOSErrorIncludesMessage(contract.addvote(user[0].name, '', voteId, inOneMin, inOneMin + 599, recoAsset0.toString(), recoTokenContract, 'test1', vote_options0, vote_links, { from: user[0] }), 'Finalisation time has to be at least 10 min after the end of the vote.')
        })
        it('should fail with only one options 11', async () => {
          await assertEOSErrorIncludesMessage(contract.addvote(user[0].name, '', voteId, inOneHour, inOneDay, recoAsset0.toString(), recoTokenContract, 'test1', ['only one option'], vote_links, { from: user[0] }), 'Not enough options defined.')
        })
        it('should fail with no link 12', async () => {
          const vote_links_noUrl = [{ note: '', url: '' }]
          await assertEOSErrorIncludesMessage(contract.addvote(user[0].name, '', voteId, inOneHour, inOneDay, recoAsset0.toString(), recoTokenContract, 'test1', vote_options0, vote_links_noUrl, { from: user[0] }), 'URL is invalid.')
        })
      })
    })

    context('push', async () => {
      context('B/11', async () => {
        before(async () => {
          smallAsset = new Asset(200, sys_token.symbol)
          smallAssetString = smallAsset.toString()
          votememo1 = createPublicVoteMemo(2, voteId, vote_options1.length, 0, inOneMin, 1)
          in11minBs58 = toUInt32ToBase58(in11min)
        })
        it('should fail with wrong vote type 1', async () => {
          const wrong_type = createPublicVoteMemo(9, voteId, vote_options0.length, 0, inOneMin, 1)
          await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, smallAssetString, `@${user[1].name}!${in11minBs58}:${wrong_type}`, { from: user[0] }), 'Unknown vote type.')
        })
        it('should fail with wrong vote index 2', async () => {
          const wrong_index = createPublicVoteMemo(2, voteId, vote_options1.length, 0, inOneMin, 999999)
          await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, smallAssetString, `@${user[1].name}!${in11minBs58}:${wrong_index}`, { from: user[0] }), 'Entry is not on public list.')
        })
        it('should fail with vote time higher than finalize time 3', async () => {
          const wrong_time1 = createPublicVoteMemo(2, voteId + 12, vote_options1.length + 1, 0, inOneDay, 1)
          await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, smallAssetString, `@${user[1].name}!${in11minBs58}:${wrong_time1}`, { from: user[0] }), 'Vote time has to be lower than end time.')
        })
        it('should fail with wrong vote time 4', async () => {
          const wrong_time2 = createPublicVoteMemo(2, voteId + 12, vote_options1.length, 0, inOneMin + 1, 1)
          await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, smallAssetString, `@${user[1].name}!${in11minBs58}:${wrong_time2}`, { from: user[0] }), 'Wrong vote time.')
        })
        it('should fail with wrong vote id 5', async () => {
          const wrong_id = createPublicVoteMemo(2, voteId + 12, vote_options1.length + 1, 0, inOneMin, 1)
          await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, smallAssetString, `@${user[1].name}!${in11minBs58}:${wrong_id}`, { from: user[0] }), 'Wrong vote id.')
        })
        it('should fail with wrong vote options number 6', async () => {
          const wrong_optionsCount = createPublicVoteMemo(2, voteId, vote_options1.length + 1, 0, inOneMin, 1)
          await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, smallAssetString, `@${user[1].name}!${in11minBs58}:${wrong_optionsCount}`, { from: user[0] }), 'Wrong number of options.')
        })
        it('should fail with wrong vote selected 7', async () => {
          const wrong_selected = createPublicVoteMemo(2, voteId, vote_options1.length, vote_options0.length, inOneMin, 1)
          await assertEOSErrorIncludesMessage(sys_token.contract.transfer(user[0].name, contract.account.name, smallAssetString, `@${user[1].name}!${in11minBs58}:${wrong_selected}`, { from: user[0] }), 'Selected option is not available.')
        })
        it('should fail with wrong token 8', async () => {
          // If no custom token devined, then deploy, initialize, issue and add it
          if (custom_token === undefined) {
            custom_token = {
              contract: await ContractDeployer.deployWithName<EosioToken>('contracts/eosio.token/eosio.token', 'custom.token'),
              symbol: new Symbol('FIAT', 2),
            }
            await initToken(custom_token)
            await issueToken(custom_token, [user[0], user[6], user[7]], 10000000)
            await contract.settoken(custom_token.contract.account.name, custom_token.symbol.toString(), 240, true, { from: contract.account })
          }
          // Store some RAM for user 8
          await check.ramTrace(async () => {
            return sys_token.contract.transfer(user[3].name, contract.account.name, sendAsset.toString(), `RAM@${user[8].name}!${inOneDayBs58}`, { from: user[3] })
          }, false)
          const wrong_asset = new Asset(200, custom_token.symbol)
          await assertEOSErrorIncludesMessage(custom_token.contract.transfer(user[6].name, contract.account.name, wrong_asset.toString(), `@${user[8].name}!${in11minBs58}:${votememo1}`, { from: user[6] }), 'Wrong token.')
        })
        it('should succeed a few name to name public votes 9', async () => {
          const vmemo_n2n = [
            createPublicVoteMemo(2, voteId, vote_options2.length, 1, inOneMin, 2, 'user4 to user3 for inv'), // name to name for invalidation
            createPublicVoteMemo(2, voteId, vote_options2.length, 1, inOneMin, 2, 'user4 to user3 for rej'), // name to name for rejection
            createPublicVoteMemo(2, voteId, vote_options2.length, 1, inOneMin, 2, 'user4 to user3 for ext'), // name to name for extansion
            createPublicVoteMemo(2, voteId, vote_options2.length, 1, inOneMin, 2, 'user4 to user3 for fin'), // name to name for finalization
          ]
          totalActiveN2N = new Asset(smallAsset.amount * vmemo_n2n.length, smallAsset.symbol)
          vote_optionsData2[1].a = Number(vote_optionsData2[1].a) + totalActiveN2N.amount

          for (let vmemo of vmemo_n2n) {
            await check.ramTrace(async () => {
              return sys_token.contract.transfer(user[4].name, contract.account.name, smallAssetString, `@${user[3].name}!${in11minBs58}:${vmemo}`, { from: user[4] })
            }, false)
          }
        })
        it('should succeed a few key to key public votes 10', async () => {
          const vmemo_k2k = [
            createPublicVoteMemo(2, voteId, vote_options3.length, 1, inOneMin, 3, 'keyk1 to key6 for inv'), // key to key for invalidation
            createPublicVoteMemo(2, voteId, vote_options3.length, 1, inOneMin, 3, 'keyk1 to key6 for rej'), // key to key for rejection
            createPublicVoteMemo(2, voteId, vote_options3.length, 1, inOneMin, 3, 'keyk1 to key6 for ext'), // key to key for extansion
            createPublicVoteMemo(2, voteId, vote_options3.length, 1, inOneMin, 3, 'keyk1 to key6 for fin and rej'), // key to key for finalization and then rejection
            createPublicVoteMemo(2, voteId, vote_options3.length, 1, inOneMin, 3, 'keyk1 to key6 for fin and ext'), // key to key for finalization and then extantion
          ]
          totalActiveK2K = new Asset(smallAsset.amount * vmemo_k2k.length, smallAsset.symbol)
          vote_optionsData3[1].a = Number(vote_optionsData3[1].a) + totalActiveK2K.amount

          for (let vmemo of vmemo_k2k) {
            await check.ramTrace(
              async () => {
                return sys_token.contract.transfer(user[4].name, contract.account.name, smallAssetString, `${pubKey1K1.toLegacyString()}@${recipient6PubK1.toLegacyString()}!${in11minBs58}:${vmemo}`, { from: user[4] })
              },
              false,
              true,
              user[4].name
            )
          }
        })
        it('should update votes table 11', async () => {
          const { rows } = await contract.votesTable({ scope: contract.account.name })
          chai.expect(rows.length).equal(4, 'Wrong number of public vote table entries')

          checkVoteEntry(
            rows[2],
            {
              index: 2,
              ramBy: user[0].name,
              holder: nameToFromHex(user[3].name),
              vt: inOneMin,
              t: in11min,
              vid: voteId,
              rtoken: recoAssetZero.toString(),
              rtcontract: recoTokenContract,
              title: 'test1',
              options: vote_optionsData2,
              links: vote_links,
              a: totalActiveN2N.amount,
              f: 0,
              i: 0,
              r: 0,
            },
            ' row[2]'
          )
          checkVoteEntry(
            rows[3],
            {
              index: 3,
              ramBy: user[0].name,
              holder: hexWithTypeOfPubKey(recipient6PubK1),
              vt: inOneMin,
              t: in11min,
              vid: voteId,
              rtoken: recoAssetZero.toString(),
              rtcontract: recoTokenContract,
              title: 'test1',
              options: vote_optionsData3,
              links: vote_links,
              a: totalActiveK2K.amount,
              f: 0,
              i: 0,
              r: 0,
            },
            ' row[3]'
          )
        })
      })
    })
    context('action', async () => {
      context('C/8 n2n', async () => {
        // Invalidate
        it('should succeed invalidation 1', async () => {
          await check.ramTrace(async () => {
            return contract.invalidate(user[3].name, 0, { from: user[4] })
          })
        })
        it('should update votes table 2', async () => {
          const { rows } = await contract.votesTable({ scope: contract.account.name })
          chai.expect(rows.length).equal(4, 'Wrong number of public vote table entries')
          totalActiveN2N.amount -= smallAsset.amount
          vote_optionsData2[1].a = Number(vote_optionsData2[1].a) - smallAsset.amount
          vote_optionsData2[1].c = Number(vote_optionsData2[1].c) + smallAsset.amount
          checkVoteEntry(
            rows[2],
            {
              index: 2,
              ramBy: user[0].name,
              holder: nameToFromHex(user[3].name),
              vt: inOneMin,
              t: in11min,
              vid: voteId,
              rtoken: recoAssetZero.toString(),
              rtcontract: recoTokenContract,
              title: 'test1',
              options: vote_optionsData2,
              links: vote_links,
              a: totalActiveN2N.amount,
              f: 0,
              i: smallAsset.amount,
              r: 0,
            },
            ' row[2]'
          )
        })
        // Reject
        it('should succeed reject 3', async () => {
          await check.ramTrace(async () => {
            return contract.reject(user[3].name, 1, { from: user[3] })
          })
        })
        it('should update votes table 4', async () => {
          const { rows } = await contract.votesTable({ scope: contract.account.name })
          chai.expect(rows.length).equal(4, 'Wrong number of public vote table entries')
          totalActiveN2N.amount -= smallAsset.amount
          vote_optionsData2[1].a = Number(vote_optionsData2[1].a) - smallAsset.amount
          vote_optionsData2[1].r = Number(vote_optionsData2[1].r) + smallAsset.amount
          checkVoteEntry(
            rows[2],
            {
              index: 2,
              ramBy: user[0].name,
              holder: nameToFromHex(user[3].name),
              vt: inOneMin,
              t: in11min,
              vid: voteId,
              rtoken: recoAssetZero.toString(),
              rtcontract: recoTokenContract,
              title: 'test1',
              options: vote_optionsData2,
              links: vote_links,
              a: totalActiveN2N.amount,
              f: 0,
              i: smallAsset.amount,
              r: smallAsset.amount,
            },
            ' row[2]'
          )
        })
        // Extend
        it('should succeed extend 5', async () => {
          await check.ramTrace(async () => {
            return contract.extend(user[3].name, 2, inTwoDays + 3600, { from: user[3] })
          })
        })
        it('should nothing changed in votes table 6', async () => {
          const { rows } = await contract.votesTable({ scope: contract.account.name })
          chai.expect(rows.length).equal(4, 'Wrong number of public vote table entries')
          checkVoteEntry(
            rows[2],
            {
              index: 2,
              ramBy: user[0].name,
              holder: nameToFromHex(user[3].name),
              vt: inOneMin,
              t: in11min,
              vid: voteId,
              rtoken: recoAssetZero.toString(),
              rtcontract: recoTokenContract,
              title: 'test1',
              options: vote_optionsData2,
              links: vote_links,
              a: totalActiveN2N.amount,
              f: 0,
              i: smallAsset.amount,
              r: smallAsset.amount,
            },
            ' row[2]'
          )
        })
        // Finalize
        it('should succeed finalize 7', async () => {
          await check.ramTrace(async () => {
            return contract.finalize(user[3].name, 3, { from: user[4] })
          })
        })
        it('should update votes table 8', async () => {
          const { rows } = await contract.votesTable({ scope: contract.account.name })
          chai.expect(rows.length).equal(4, 'Wrong number of public vote table entries')
          totalActiveN2N.amount -= smallAsset.amount
          vote_optionsData2[1].a = Number(vote_optionsData2[1].a) - smallAsset.amount
          vote_optionsData2[1].c = Number(vote_optionsData2[1].c) + smallAsset.amount
          checkVoteEntry(
            rows[2],
            {
              index: 2,
              ramBy: user[0].name,
              holder: nameToFromHex(user[3].name),
              vt: inOneMin,
              t: in11min,
              vid: voteId,
              rtoken: recoAssetZero.toString(),
              rtcontract: recoTokenContract,
              title: 'test1',
              options: vote_optionsData2,
              links: vote_links,
              a: totalActiveN2N.amount,
              f: smallAsset.amount,
              i: smallAsset.amount,
              r: smallAsset.amount,
            },
            ' row[2]'
          )
        })
      })
      context('D/15 k2k', async () => {
        let sigTime: number
        let smallAssetAmount2X: number
        before(async () => {
          sigTime = Math.round(Date.now() / 1000)
          smallAssetAmount2X = smallAsset.amount + smallAsset.amount
        })
        // Invalidate
        it('should succeed invalidation 1', async () => {
          const sig = signInvalidate(priKey1K1.toString(), mainNetChainId, contract.account.name, recipient6PubK1.toString(), '0', sigTime.toString()).sig
          await check.ramTrace(async () => {
            return contract.invalisig(recipient6PubK1.toString(), 0, sigTime, sig, { from: user[4] })
          })
        })
        it('should update votes table 2', async () => {
          const { rows } = await contract.votesTable({ scope: contract.account.name })
          chai.expect(rows.length).equal(4, 'Wrong number of public vote table entries')
          totalActiveK2K.amount -= smallAsset.amount
          vote_optionsData3[1].a = Number(vote_optionsData3[1].a) - smallAsset.amount
          vote_optionsData3[1].c = Number(vote_optionsData3[1].c) + smallAsset.amount
          checkVoteEntry(
            rows[3],
            {
              index: 3,
              ramBy: user[0].name,
              holder: hexWithTypeOfPubKey(recipient6PubK1),
              vt: inOneMin,
              t: in11min,
              vid: voteId,
              rtoken: recoAssetZero.toString(),
              rtcontract: recoTokenContract,
              title: 'test1',
              options: vote_optionsData3,
              links: vote_links,
              a: totalActiveK2K.amount,
              f: 0,
              i: smallAsset.amount,
              r: 0,
            },
            ' row[3]'
          )
        })
        // Reject
        it('should succeed reject 3', async () => {
          await check.ramTrace(async () => {
            const sig = signReject(recipient6PriK1.toString(), mainNetChainId, contract.account.name, hexWithTypeOfPubKey(pubKey1K1), '1', sigTime.toString()).sig
            return contract.rejectsig(recipient6PubK1.toString(), 1, sigTime, sig, { from: user[3] })
          })
        })
        it('should update votes table 4', async () => {
          const { rows } = await contract.votesTable({ scope: contract.account.name })
          chai.expect(rows.length).equal(4, 'Wrong number of public vote table entries')
          totalActiveK2K.amount -= smallAsset.amount
          vote_optionsData3[1].a = Number(vote_optionsData3[1].a) - smallAsset.amount
          vote_optionsData3[1].r = Number(vote_optionsData3[1].r) + smallAsset.amount
          checkVoteEntry(
            rows[3],
            {
              index: 3,
              ramBy: user[0].name,
              holder: hexWithTypeOfPubKey(recipient6PubK1),
              vt: inOneMin,
              t: in11min,
              vid: voteId,
              rtoken: recoAssetZero.toString(),
              rtcontract: recoTokenContract,
              title: 'test1',
              options: vote_optionsData3,
              links: vote_links,
              a: totalActiveK2K.amount,
              f: 0,
              i: smallAsset.amount,
              r: smallAsset.amount,
            },
            ' row[3]'
          )
        })
        // Extend
        it('should succeed extend 5', async () => {
          const inTwoDaysAndTwoH = inTwoDays + 3600
          const sig = signExtend(recipient6PriK1.toString(), mainNetChainId, contract.account.name, inTwoDaysAndTwoH.toString(), hexWithTypeOfPubKey(recipient6PubK1), '2', sigTime.toString()).sig
          await check.ramTrace(async () => {
            return contract.extendsig(recipient6PubK1.toString(), 2, inTwoDaysAndTwoH, sigTime, sig, { from: user[3] })
          })
        })
        it('should nothing changed in votes table 6', async () => {
          const { rows } = await contract.votesTable({ scope: contract.account.name })
          chai.expect(rows.length).equal(4, 'Wrong number of public vote table entries')
          checkVoteEntry(
            rows[3],
            {
              index: 3,
              ramBy: user[0].name,
              holder: hexWithTypeOfPubKey(recipient6PubK1),
              vt: inOneMin,
              t: in11min,
              vid: voteId,
              rtoken: recoAssetZero.toString(),
              rtcontract: recoTokenContract,
              title: 'test1',
              options: vote_optionsData3,
              links: vote_links,
              a: totalActiveK2K.amount,
              f: 0,
              i: smallAsset.amount,
              r: smallAsset.amount,
            },
            ' row[3]'
          )
        })
        // Finalize
        it('should succeed finalize 7', async () => {
          await check.ramTrace(async () => {
            const sig = signFinalize(priKey1K1.toString(), mainNetChainId, contract.account.name, recipient6PubK1.toString(), '3', sigTime.toString()).sig
            return contract.finalizesig(recipient6PubK1.toString(), 3, sigTime, sig, { from: user[3] })
          }, false)
        })
        it('should succeed another finalize 8', async () => {
          await check.ramTrace(async () => {
            const sig = signFinalize(priKey1K1.toString(), mainNetChainId, contract.account.name, recipient6PubK1.toString(), '4', sigTime.toString()).sig
            return contract.finalizesig(recipient6PubK1.toString(), 4, sigTime, sig, { from: user[3] })
          }, false)
        })
        it('should update votes table 9', async () => {
          const { rows } = await contract.votesTable({ scope: contract.account.name })
          chai.expect(rows.length).equal(4, 'Wrong number of public vote table entries')
          totalActiveK2K.amount -= smallAssetAmount2X
          vote_optionsData3[1].a = Number(vote_optionsData3[1].a) - smallAssetAmount2X
          vote_optionsData3[1].c = Number(vote_optionsData3[1].c) + smallAssetAmount2X
          checkVoteEntry(
            rows[3],
            {
              index: 3,
              ramBy: user[0].name,
              holder: hexWithTypeOfPubKey(recipient6PubK1),
              vt: inOneMin,
              t: in11min,
              vid: voteId,
              rtoken: recoAssetZero.toString(),
              rtcontract: recoTokenContract,
              title: 'test1',
              options: vote_optionsData3,
              links: vote_links,
              a: totalActiveK2K.amount,
              f: smallAssetAmount2X,
              i: smallAsset.amount,
              r: smallAsset.amount,
            },
            ' row[3]'
          )
        })
        // Extend finalized
        it('should succeed extend finalized 10', async () => {
          const inTwoDaysAndTwoH = inTwoDays + 3600
          const sig = signExtend(recipient6PriK1.toString(), mainNetChainId, contract.account.name, inTwoDaysAndTwoH.toString(), hexWithTypeOfPubKey(recipient6PubK1), '3', sigTime.toString()).sig
          await check.ramTrace(async () => {
            return contract.extendsig(recipient6PubK1.toString(), 3, inTwoDaysAndTwoH, sigTime, sig, { from: user[3] })
          })
        })
        it('should update votes table 11', async () => {
          const { rows } = await contract.votesTable({ scope: contract.account.name })
          chai.expect(rows.length).equal(4, 'Wrong number of public vote table entries')
          totalActiveK2K.amount += smallAsset.amount
          vote_optionsData3[1].c = Number(vote_optionsData3[1].c) - smallAsset.amount
          vote_optionsData3[1].a = Number(vote_optionsData3[1].a) + smallAsset.amount
          checkVoteEntry(
            rows[3],
            {
              index: 3,
              ramBy: user[0].name,
              holder: hexWithTypeOfPubKey(recipient6PubK1),
              vt: inOneMin,
              t: in11min,
              vid: voteId,
              rtoken: recoAssetZero.toString(),
              rtcontract: recoTokenContract,
              title: 'test1',
              options: vote_optionsData3,
              links: vote_links,
              a: totalActiveK2K.amount,
              f: smallAsset.amount,
              i: smallAsset.amount,
              r: smallAsset.amount,
            },
            ' row[3]'
          )
        })
        // Reject finalized
        it('should succeed reject finalized 12', async () => {
          const sig = signReject(recipient6PriK1.toString(), mainNetChainId, contract.account.name, hexWithTypeOfPubKey(pubKey1K1), '4', sigTime.toString()).sig
          await check.ramTrace(async () => {
            return contract.rejectsig(recipient6PubK1.toString(), 4, sigTime, sig, { from: user[3] })
          })
        })
        it('should update votes table 13', async () => {
          const { rows } = await contract.votesTable({ scope: contract.account.name })
          chai.expect(rows.length).equal(4, 'Wrong number of public vote table entries')
          vote_optionsData3[1].c = Number(vote_optionsData3[1].c) - smallAsset.amount
          vote_optionsData3[1].r = Number(vote_optionsData3[1].r) + smallAsset.amount
          checkVoteEntry(
            rows[3],
            {
              index: 3,
              ramBy: user[0].name,
              holder: hexWithTypeOfPubKey(recipient6PubK1),
              vt: inOneMin,
              t: in11min,
              vid: voteId,
              rtoken: recoAssetZero.toString(),
              rtcontract: recoTokenContract,
              title: 'test1',
              options: vote_optionsData3,
              links: vote_links,
              a: totalActiveK2K.amount,
              f: 0,
              i: smallAsset.amount,
              r: smallAssetAmount2X,
            },
            ' row[3]'
          )
        })
        // Reject active
        it('should succeed reject active 14', async () => {
          const sig = signReject(recipient6PriK1.toString(), mainNetChainId, contract.account.name, hexWithTypeOfPubKey(pubKey1K1), '3', sigTime.toString()).sig
          await check.ramTrace(async () => {
            return contract.rejectsig(recipient6PubK1.toString(), 3, sigTime, sig, { from: user[3] })
          })
        })
        it('should update votes table 15', async () => {
          const { rows } = await contract.votesTable({ scope: contract.account.name })
          chai.expect(rows.length).equal(4, 'Wrong number of public vote table entries')
          totalActiveK2K.amount -= smallAsset.amount
          vote_optionsData3[1].a = Number(vote_optionsData3[1].a) - smallAsset.amount
          vote_optionsData3[1].r = Number(vote_optionsData3[1].r) + smallAsset.amount
          checkVoteEntry(
            rows[3],
            {
              index: 3,
              ramBy: user[0].name,
              holder: hexWithTypeOfPubKey(recipient6PubK1),
              vt: inOneMin,
              t: in11min,
              vid: voteId,
              rtoken: recoAssetZero.toString(),
              rtcontract: recoTokenContract,
              title: 'test1',
              options: vote_optionsData3,
              links: vote_links,
              a: totalActiveK2K.amount,
              f: 0,
              i: smallAsset.amount,
              r: smallAssetAmount2X + smallAsset.amount,
            },
            ' row[3]'
          )
        })
      })
    })
    context('secondary request', async () => {
      context('E/4', async () => {
        it('should get single specific entry with holder == ram payer 1', async () => {
          const hexTime = arrayToHex(numberToUInt32(inOneHour)).padStart(8, '0')
          const hexShortName = nameToFromHex(user[0].name).substring(8, 16)
          const hexShortDir = arrayToHex(hexToUint8Array(hexShortName).reverse())
          const hex = '0x' + arrayToHex(hexToUint8Array(hexTime + hexShortDir))
          const bint = BigInt(hex).toString()
          const lowerBound = bint
          const upperBound = lowerBound
          const { rows } = await contract.votesTable({ scope: contract.account.name, indexPosition: 2, keyType: 'i64', lowerBound, upperBound })

          chai.expect(rows.length).equal(1, 'Wrong number of entries found')
          chai.expect(rows[0].index).equal(0, 'Wrong index')
        })
        it('should get single specific entry with holder != ram payer 2', async () => {
          const hexTime = arrayToHex(numberToUInt32(inOneMin)).padStart(8, '0')
          const hexShortName = nameToFromHex(user[3].name).substring(8, 16)
          const hexShortDir = arrayToHex(hexToUint8Array(hexShortName).reverse())
          const hex = '0x' + arrayToHex(hexToUint8Array(hexTime + hexShortDir))
          const bint = BigInt(hex).toString()
          const lowerBound = bint
          const upperBound = lowerBound
          const { rows } = await contract.votesTable({ scope: contract.account.name, indexPosition: 2, keyType: 'i64', lowerBound, upperBound })

          chai.expect(rows.length).equal(1, 'Wrong number of entries found')
          chai.expect(rows[0].index).equal(2, 'Wrong index')
        })
        it('should get entry with specific key holder 3', async () => {
          const hexTime = arrayToHex(numberToUInt32(inOneMin)).padStart(8, '0')
          const hexKey = hexWithTypeOfPubKey(recipient6PubK1)
          const hexShortKey = hexKey.substring(8, 16)
          const hexShortDir = arrayToHex(hexToUint8Array(hexShortKey).reverse())
          const hex = '0x' + arrayToHex(hexToUint8Array(hexTime + hexShortDir))
          const bint = BigInt(hex).toString()
          const lowerBound = bint
          const upperBound = lowerBound
          const { rows } = await contract.votesTable({ scope: contract.account.name, indexPosition: 2, keyType: 'i64', lowerBound, upperBound })
          chai.expect(rows.length).equal(1, 'Wrong number of entries found')
          chai.expect(rows[0].index).equal(3, 'Wrong index')
        })
        it('should get all at a specific time 4', async () => {
          const hexTime = arrayToHex(numberToUInt32(inOneMin)).padStart(8, '0')
          const hex = '0x' + arrayToHex(hexToUint8Array(hexTime + '00000000'))
          const bint = BigInt(hex).toString()
          const lowerBound = bint

          const uhex = '0x' + arrayToHex(hexToUint8Array(hexTime + 'FFFFFFFF'))
          const ubint = BigInt(uhex).toString()
          const upperBound = ubint
          const { rows } = await contract.votesTable({ scope: contract.account.name, indexPosition: 2, keyType: 'i64', lowerBound, upperBound })
          chai.expect(rows.length).equal(3, 'Wrong number of entries found')
          chai.expect(rows[0].index).equal(1, 'Wrong index')
          chai.expect(rows[1].index).equal(2, 'Wrong index')
          chai.expect(rows[2].index).equal(3, 'Wrong index')
        })
      })
    })
    context('remove', async () => {
      context('F/10', async () => {
        it('should fail with auth error 1', async () => {
          await assertMissingAuthority(contract.removevote(user[1].name, 1, { from: user[0] }))
        })
        it('should fail on no existing entry 2', async () => {
          await assertEOSErrorIncludesMessage(contract.removevote(user[1].name, 9999, { from: user[1] }), 'Entry does not exist.')
        })
        it('should fail with wrong entry owner name 3', async () => {
          await assertEOSErrorIncludesMessage(contract.removevote(user[1].name, 0, { from: user[1] }), 'Wrong entry owner.')
        })
        it('should succeed on public vote where no one participated 4', async () => {
          await contract.removevote(user[0].name, 0, { from: user[0] })
        })
        it('should succeed on another public vote where no one participated 5', async () => {
          await contract.removevote(user[1].name, 1, { from: user[1] })
        })
        it('should fail because vote time is not over 6', async () => {
          await assertEOSErrorIncludesMessage(contract.removevote(user[0].name, 2, { from: user[0] }), 'Time is not over, yet.')
        })

        context('have to wait', async () => {
          it('12 min', async () => {
            await waitUntil(Date.now() / 1000 + 60)
          })
          it('11 min', async () => {
            await waitUntil(Date.now() / 1000 + 60)
          })
          it('10 min', async () => {
            await waitUntil(Date.now() / 1000 + 60)
          })
          it('9 min', async () => {
            await waitUntil(Date.now() / 1000 + 60)
          })
          it('8 min', async () => {
            await waitUntil(Date.now() / 1000 + 60)
          })
          it('7 min', async () => {
            await waitUntil(Date.now() / 1000 + 60)
          })
          it('6 min', async () => {
            await waitUntil(Date.now() / 1000 + 60)
          })
          it('5 min', async () => {
            await waitUntil(Date.now() / 1000 + 60)
          })
          it('4 min', async () => {
            await waitUntil(Date.now() / 1000 + 60)
          })
          it('3 min', async () => {
            await waitUntil(Date.now() / 1000 + 60)
          })
          it('2 min', async () => {
            await waitUntil(Date.now() / 1000 + 60)
          })
          it('1 min', async () => {
            await waitUntil(Date.now() / 1000 + 60)
          })
          it('should succeed to remove index 2 entry 7', async () => {
            await contract.removevote(user[0].name, 2, { from: user[0] })
          })
          it('should update votes table 8', async () => {
            const { rows } = await contract.votesTable({ scope: contract.account.name })
            chai.expect(rows.length).equal(1, 'Wrong number of entries left')
          })
          it('should succeed to remove index 3 entry 9', async () => {
            await contract.removevote(user[0].name, 3, { from: user[0] })
          })
          it('should update votes table 10', async () => {
            const { rows } = await contract.votesTable({ scope: contract.account.name })
            chai.expect(rows.length).equal(0, 'There are still entries left')
          })
        })
      })
    })
  })
}

function voteOptionToInitalOptionData(options: Array<string>) {
  return options.map((v) => {
    return { o: v, a: 0, c: 0, r: 0 }
  })
}

function checkVoteEntry(expect: SavactsavpayVotes, equal: SavactsavpayVotes, addedErrorMsg?: string) {
  chai.expect(expect.index).equal(equal.index, 'Wrong index' + addedErrorMsg)
  chai.expect(expect.ramBy).equal(equal.ramBy, 'Wrong Ram payer' + addedErrorMsg)
  chai.expect(expect.holder).equal(equal.holder, 'Wrong holder' + addedErrorMsg)
  chai.expect(expect.vt).equal(equal.vt, 'Wrong vote time' + addedErrorMsg)
  chai.expect(expect.t).equal(equal.t, 'Wrong time to finalize' + addedErrorMsg)
  chai.expect(expect.vid).equal(equal.vid, 'Wrong vote id' + addedErrorMsg)
  chai.expect(expect.rtoken).equal(equal.rtoken, 'Wrong recommended token' + addedErrorMsg)
  chai.expect(expect.rtcontract).equal(equal.rtcontract, 'Wrong token contract' + addedErrorMsg)
  chai.expect(expect.options.length).equal(equal.options.length, 'Wrong options length' + addedErrorMsg)
  for (let i = 0; i < expect.options.length; i++) {
    chai.expect(expect.options[i].o).equal(equal.options[i].o, `Wrong finalized amount before vote end at line ${i}` + addedErrorMsg)
    chai.expect(expect.options[i].a).equal(equal.options[i].a, `Wrong active amount at line ${i}` + addedErrorMsg)
    chai.expect(expect.options[i].c).equal(equal.options[i].c, `Wrong complete amount at line ${i}` + addedErrorMsg)
    chai.expect(expect.options[i].r).equal(equal.options[i].r, `Wrong rejected amount at line ${i}` + addedErrorMsg)
  }
  chai.expect(expect.links.length).equal(equal.links.length, 'Wrong links length' + addedErrorMsg)
  for (let i = 0; i < expect.links.length; i++) {
    chai.expect(expect.links[i].note).equal(equal.links[i].note, `Wrong note link at line ${i}` + addedErrorMsg)
    chai.expect(expect.links[i].url).equal(equal.links[i].url, `Wrong url link at line ${i}` + addedErrorMsg)
  }
  chai.expect(expect.a).equal(equal.a, 'Wrong active amount' + addedErrorMsg)
  chai.expect(expect.f).equal(equal.f, 'Wrong finalized amount' + addedErrorMsg)
  chai.expect(expect.i).equal(equal.i, 'Wrong invalidated amount' + addedErrorMsg)
  chai.expect(expect.r).equal(equal.r, 'Wrong rejected amount' + addedErrorMsg)
}

/**
 * Create the memo which is sent on a payment that relates to a public vote
 * @param type Vote type
 * @param id Vote id
 * @param optionsCount Number of vote options
 * @param selected Selected option number
 * @param voteTime Vote end time
 * @param index Primary key of the public votes table
 * @returns
 */
function createPublicVoteMemo(type: number, id: number, optionsCount: number, selected: number, voteTime: number, index: number, rest?: string) {
  const sb = new SerialBuffer()
  sb.pushArray([type, id, optionsCount, selected])
  sb.pushUint32(voteTime)
  sb.pushNumberAsUint64(index)
  if (rest !== undefined) {
    sb.pushString(rest)
  }
  return base58.encode(sb.getUint8Array(sb.length))
}

/**
 * Check if the system token balance of a user changed as expected and update the balance in the provided user object
 * @param userObj Object which contains the account name, and previous balances
 * @param expectDelta Expected difference between the balance before and after
 */
async function checkAndUpdateSystemBalance(userObj: { name: string; system: number; custom: number }, expectDelta: number) {
  const delta = (await getBalance(userObj.name, sys_token)).amount - userObj.system
  chai.expect(delta).equal(expectDelta, 'Wrong amount of system token for ' + userObj)
  userObj.system += delta
}

/**
 * Check if the custom token balance of a user changed as expected and update the balance in the provided user object
 * @param userObj Object which contains the account name, and previous balances
 * @param expectDelta Expected difference between the balance before and after
 */
async function checkAndUpdateCustomBalance(userObj: { name: string; system: number; custom: number }, expectDelta: number) {
  const delta = (await getBalance(userObj.name, custom_token)).amount - userObj.custom
  chai.expect(delta).equal(expectDelta, 'Wrong amount of custom token for ' + userObj)
  userObj.custom += delta
}

/**
 * Get the current balances of an account as an object
 * @param user Account name
 * @returns Object which contains the account name, and the previous balance of the system token and custom token
 */
async function getSystemAndCustomBalances(user: string) {
  return {
    name: user,
    system: (await getBalance(user, sys_token)).amount,
    custom: (await getBalance(user, custom_token)).amount,
  }
}

/**
 * Wait until a time stamp in seconds is reached + 100ms offset
 * @param timeStamp Unix time stamp in seconds
 */
async function waitUntil(timeStamp: number) {
  const msTime = timeStamp * 1000
  const currentMsTime = Date.now()
  const currentTimeForWait = Math.floor(currentMsTime / 1000)
  const deltaTime = (msTime - currentMsTime + 500) / 1000
  const deltaTimeStr = deltaTime > 60 ? `${Math.floor(deltaTime / 60)}m and ${Math.floor(deltaTime % 60)}s` : `${deltaTime}s`
  if (currentTimeForWait < timeStamp + 0.5) {
    console.log(`\nWait for ${deltaTimeStr} to reach time limit`)
    await sleep(msTime - currentMsTime + 500)
  }
}

/**
 * Check if the RAM keeps as it is
 * @param ramBeforeEntry Last RAM table entry
 * @param scope RAM recipient user
 * @param from RAM offerer
 * @returns
 */
async function checkRAMisConstant(ramBeforeEntry: SavactsavpayRam, scope: string, from: string | undefined = undefined) {
  const ramEntry = (await contract.ramTable({ scope, limit: 1, lowerBound: from })).rows[0]
  chai.expect(Number(ramBeforeEntry.amount)).equal(Number(ramEntry.amount), 'Consumed offered RAM')
  chai.expect(Number(ramBeforeEntry.free)).equal(Number(ramEntry.free), 'Used RAM changed')
  return ramEntry
}

/**
 * Check and log the used or consumed RAM
 * @param ramBeforeEntry Last RAM table entry
 * @param recduced Should the RAM be reduced (more used) or returned
 * @param scope RAM recipient user
 * @param from RAM offerer
 * @param nowEqual Should the amount be equal to the free RAM (no RAM is used anymore)
 * @returns
 */
async function checkAndLogRAM(ramBeforeEntry: SavactsavpayRam, recduced: boolean, scope: string, from: string | undefined = undefined, nowEqual: boolean = false) {
  const ramEntry = (await contract.ramTable({ scope, limit: 1, lowerBound: from })).rows[0]
  const foreverConsumed = Number(ramBeforeEntry.amount) - Number(ramEntry.amount)
  if (recduced) {
    console.log('For ever consumed RAM', foreverConsumed)
    console.log('Used RAM', Number(ramBeforeEntry.free) - foreverConsumed - Number(ramEntry.free))
    chai.expect(Number(ramEntry.free)).lessThan(Number(ramBeforeEntry.free), 'No RAM used')
  } else {
    console.log('For ever consumed RAM', foreverConsumed)
    console.log('Retuned RAM', Number(ramEntry.free) - Number(ramBeforeEntry.free) + foreverConsumed)
    chai.expect(Number(ramEntry.free)).greaterThan(Number(ramBeforeEntry.free), 'No RAM returned')
  }
  if (nowEqual) {
    chai.expect(Number(ramEntry.free)).equal(Number(ramEntry.amount), 'Not all RAM returned')
  }
  return ramEntry
}

testContractIni()

testPaymentSystem()
testRAMSettings()
testCustomToken()
testVote()
testPublicVote()

// Memo parameters on payments to the contract:
// from? @to !time ;memo? | :abstimmungen?
// RAM@to !time | /relative_time
// FIN@to_pub #id =sig_time ~sig
// REJ@to_pub #id =sig_time ~sig
// INV@to_pub #id =sig_time ~sig
// EXT@to #id !time =sig_time ~sig
// OFF@to #id =sig_time ~sig +recipient
// ALL@to_pub =sig_time ~sig +recipient
// ACC@to_pub =sig_time ~sig +recipient &recipient_key?

// Actions of the contract:
// contract.extend
// contract.extendsig
// contract.finalize
// contract.finalizesig
// contract.invalidate
// contract.invalisig
// contract.reject
// contract.rejectsig
// contract.payoff
// contract.payoffall
// contract.payoffnewacc
// contract.payoffsig
// contract.payoffallsig
// contract.removeram
// contract.settoken
// contract.removetoken
// contract.addvote
// contract.removevote

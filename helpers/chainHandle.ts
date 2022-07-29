import { Account, UpdateAuth } from 'lamington'
import { Asset, stringToAsset, Symbol } from './conversions'
import { EosioToken } from '../contracts/eosio.token/eosio.token'

export interface Token {
  contract: EosioToken
  symbol: Symbol
}

export async function getBalances(users: Array<Account>, token: Token) {
  let balances: Array<Asset> = []
  for (const user of users) {
    balances.push(await getBalance(user, token))
  }
  return balances
}

export async function getBalance(user: Account, token: Token) {
  const r = await token.contract.getTableRows('accounts', {
    scope: user.name,
  })
  if ('rows' in r && r.rows.length > 0) {
    return stringToAsset(r.rows[0].balance)
  }
  return new Asset(0, token.symbol)
}

export async function updateAuths(account: Account) {
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

export async function initToken(token: Token) {
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

export async function issueToken(token: Token, accounts: Array<Account>, amountPerAcc: number, sender?: Account) {
  const sharedAssetString = new Asset(amountPerAcc, token.symbol).toString()
  if (!sender) {
    sender = token.contract.account
  }
  for (let account of accounts) {
    await token.contract.transfer(sender.name, account.name, sharedAssetString, 'inital balance', { from: sender })
  }
}

export async function shouldFail(action: Promise<any>) {
  try {
    await action
  } catch (e) {
    return true
  }
  throw 'Transaction succeeded but it sould have failed.'
}

# Actions

Each action can be executed by a token transfer with specific parameters to operate from any exchanges or without an eosio account.

# Payment

A payment is done by sending a token amount to the SavPay contract account by mentioning specific data in the memo parameter. The memo parameters are written together and invalid parameters will result in a rejection of the whole payment. The typical eosio token contract allows only memos which are no longer than 256 characters.

## Memo parameters

The first parameter is `PAY` in upper case to introduce a SavPay payment. It is optional because it is a SavPay payment anyway if there is no other three upper case parameter.  
The second parameter is the `sender` account name or public key. If there is no sender mentioned the sender of the payment will be used instead. Currently only K1 keys are allowed in the lagacy or new string format.

The `recipient` can be an account name or a public key. It will be defined by an `@` sign in front of it.

The `deadline` until a payment will automatically be seen as finished is a unix time stamp. It is base 58 encoded and defined by a `!` sign in front of it. For example the timestamp for `Wed Jul 27 2022 19:21:40 GMT+0000` is `1658949700` and would be encoded to `2kepfK`.

```typescript
import base58 = require('bs58')
const inOneDay = Math.round(Date.now() / 1000 + 60 * 60 * 24)

function numberTouInt32(num: number) {
  const arr = new ArrayBuffer(4)
  const view = new DataView(arr)
  view.setUint32(0, num)
  return new Uint8Array(arr)
}

const memoTime = base58.encode(numberTouInt32(inOneDay).reverse())
```

It is optional to define a `memo` which will be used on withdrawing a successful payment. This parameter has to be the last paremeter and will be triggered by a `;` sign. After that arbitrary data is allowed.

### Memo examples

`PAYanna@peter!2kepfK;Hello Peter`

`anna@peter!2kepfK;Hello Peter`

`PAYanna@peter!2kepfK`

`@EOS6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5GDW5CV!absaadlk`

`EOS6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5GDW5CV@peter!2kepfK`

`@PUB_K1_6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5BoDq63!2kepfK`

# Finalize

Finalize a payment earlier than the time limit. This action can only be executed by the sender of the payment.
If the recipient is an account name, it will receive the payment directly. If the recipient is a public key, the time stamp will set to `1`. So the time limit is marked as over and the recipient can use the payoff function.

### Finalize "name to name" payment

| Action | `finalize(to, id)`                     |
| :----- | :------------------------------------- |
| `to`   | Origin recipient account name          |
| `id`   | Primary key of `paytoname` table entry |

### Finalize "key to name" payment

| Action    | `finalizesig(to, id, sigtime, sig)`                                                                                                              |
| :-------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| `to`      | Origin recipient public key                                                                                                                      |
| `id`      | Primary key of `paytokey` table entry                                                                                                            |
| `sigtime` | Unix time stamp of the signature                                                                                                                 |
| `sig`     | Signature of "{chain id} {name of this contract} finalize {public key of payment recipient to\*} {id} {sigtime}" by origin payment sender `from` |

### Finalize "name to key" payment

| Action | `finalize(to, id)`                     |
| :----- | :------------------------------------- |
| `to`   | Origin recipient account name          |
| `id`   | Primary key of `paytoname` table entry |

### Finalize "key to key" payment

| Action    | `finalizesig(to, id, sigtime, sig)`                                                                                                              |
| :-------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| `to`      | Origin recipient public key                                                                                                                      |
| `id`      | Primary key of `paytokey` table entry                                                                                                            |
| `sigtime` | Unix time stamp of the signature                                                                                                                 |
| `sig`     | Signature of "{chain id} {Name of this contract} finalize {public key of payment recipient to\*} {id} {sigtime}" by origin payment sender `from` |

\* The public key in string format with prefix (EOS or PUB_K1\_). It has to be in the same format as transmitted by the `to` value.

# Reject

Reject a payment. This action can only be executed by the mentioned recipient of the payment. If the final recipient (the payment sender) is an account name, it will receive the payment directly. If the final recipient is a public key, the time stamp will set to `0`. This marks the payment as rejected and the final recipient can use the payoff function.

### Reject "name to name" payment

| Action | `reject(to, id)`                       |
| :----- | :------------------------------------- |
| `to`   | Origin recipient account name          |
| `id`   | Primary key of `paytoname` table entry |

### Reject "key to name" payment

| Action | `reject(to, id)`                       |
| :----- | :------------------------------------- |
| `to`   | Origin recipient account name          |
| `id`   | Primary key of `paytoname` table entry |

### Reject "name to key" payment

| Action    | `rejectsig(to, id, sigtime, sig)`                                                                                                 |
| :-------- | :-------------------------------------------------------------------------------------------------------------------------------- |
| `to`      | Origin recipient public key                                                                                                       |
| `id`      | Primary key of `paytokey` table entry                                                                                             |
| `sigtime` | Unix time stamp of the signature                                                                                                  |
| `sig`     | Signature of "{chain id} {name of this contract} reject {name of payment sender} {id} {sigtime}" by origin payment recipient `to` |

### Reject "key to key" payment

| Action    | `rejectsig(to, id, sigtime, sig)`                                                                                                             |
| :-------- | :-------------------------------------------------------------------------------------------------------------------------------------------- |
| `to`      | Origin recipient public key                                                                                                                   |
| `id`      | Primary key of `paytokey` table entry                                                                                                         |
| `sigtime` | Unix time stamp of the signature                                                                                                              |
| `sig`     | Signature of "{chain id} {Name of this contract} reject {hex public key of payment sender\*} {id} {sigtime}" by origin payment recipient `to` |

\* The public key in lower case hex format with one added byte for the key type. For example, the value for `PUB_K1_6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5BoDq63` is "`02c0ded2bc1f1305fb0faac5e6c03ee3a1924234985427b6167ca569d13df435cf00`".

# Extend

Extend the time limit of a payment. This action can only be executed by the mentioned recipient of the payment.

### Extend "to name" payment

| Action | `extend(to, id, time)`                 |
| :----- | :------------------------------------- |
| `to`   | Origin recipient account name          |
| `id`   | Primary key of `paytoname` table entry |
| `time` | Unix time stamp of the new time limit  |

### Extend "to key" payment

| Action    | `extendsig(to, id, time, sigtime, sig)`                                                                                                                        |
| :-------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `to`      | Origin recipient public key                                                                                                                                    |
| `id`      | Primary key of `paytokey` table entry                                                                                                                          |
| `time`    | Unix time stamp of the new time limit                                                                                                                          |
| `sigtime` | Unix time stamp of the signature                                                                                                                               |
| `sig`     | Signature of "{chain id} {name of this contract} expand {time} {public key of origin recipient in hex format} {id} {sigtime}" by origin payment recipient `to` |

# Invalidate

Invalidate / burn a payment. This action can only be executed by the sender of the payment and within the time limit. It results in the recipient and sender not receiving the payment. Instead it will be send to the SavAct stake account and hence distributed among the SavAct token holders.

### Invalidate "name to name" payment

| Action | `invalidate(to, id)`                   |
| :----- | :------------------------------------- |
| `to`   | Origin recipient account name          |
| `id`   | Primary key of `paytoname` table entry |

### Invalidate "key to name" payment

| Action    | `invalisig(to, id, sigtime, sig)`                                                                                                                |
| :-------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| `to`      | Origin recipient public key                                                                                                                      |
| `id`      | Primary key of `paytokey` table entry                                                                                                            |
| `sigtime` | Unix time stamp of the signature                                                                                                                 |
| `sig`     | Signature of "{chain id} {name of this contract} finalize {public key of payment recipient to\*} {id} {sigtime}" by origin payment sender `from` |

### Invalidate "name to key" payment

| Action | `invalidate(to, id)`                   |
| :----- | :------------------------------------- |
| `to`   | Origin recipient account name          |
| `id`   | Primary key of `paytoname` table entry |

### Invalidate "key to key" payment

| Action    | `invalisig(to, id, sigtime, sig)`                                                                                                                |
| :-------- | :----------------------------------------------------------------------------------------------------------------------------------------------- |
| `to`      | Origin recipient public key                                                                                                                      |
| `id`      | Primary key of `paytokey` table entry                                                                                                            |
| `sigtime` | Unix time stamp of the signature                                                                                                                 |
| `sig`     | Signature of "{chain id} {Name of this contract} finalize {public key of payment recipient to\*} {id} {sigtime}" by origin payment sender `from` |

\* The public key in string format with prefix (EOS or PUB_K1\_). It has to be in the same format as transmitted by the `to` value.

# Payoff

All actions, after a payment, where the final recipient is an account name and the time limit is no longer relevant will directly paid off. If the final recipient of a payment is a public key or the time limit just reached a payoff action need to be executed to withdrawel the payment.

Action payoff

### Payoff "name to name" and "key to name" payment with reached tme limit

| Action | `payoff(to, id)`                           |
| :----- | :----------------------------------------- |
| `to`   | Origin recipient account name              |
| `id`   | Primary key of `paytoname` table entry     |
|        |                                            |
| Result | Origin recipient `to` receives the payment |

### Payoff finished "name to key" and "key to name" payment

| Action      | `payoffsig(to, id, recipient, sigtime, sig)`                                                                                                                 |
| :---------- | :----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `to`        | Origin recipient public key                                                                                                                                  |
| `id`        | Primary key of `paytokey` table entry                                                                                                                        |
| `recipient` | Account name of the final recipient                                                                                                                          |
| `sigtime`   | Unix time stamp of the signature                                                                                                                             |
| `sig`       | Signature of "{chain id} {name of this contract} payoff {origin recipient public key\*} {account name of recipient} {id} {sigtime}" by origin recipient `to` |
|             |                                                                                                                                                              |
| Result      | Origin payment sender `to` receives the payment                                                                                                              |

### Payoff invalidated "key to name"

| Action      | `payoffsig(to, id, recipient, sigtime, sig)`                                                                                                                        |
| :---------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `to`        | Origin recipient account name                                                                                                                                       |
| `id`        | Primary key of `paytokey` table entry                                                                                                                               |
| `recipient` | Account name of the final recipient                                                                                                                                 |
| `sigtime`   | Unix time stamp of the signature                                                                                                                                    |
| `sig`       | Signature of "{chain id} {name of this contract} payoff {origin recipient public key\*} {account name of recipient} {id} {sigtime}" by origin payment sender `from` |
|             |                                                                                                                                                                     |
| Result      | Origin recipient `from` receives the payment                                                                                                                        |

### Payoff invalidated "key to key"

| Action      | `payoffsig(to, id, recipient, sigtime, sig)`                                                                                                                        |
| :---------- | :------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `to`        | Origin recipient public key                                                                                                                                         |
| `id`        | Primary key of `paytokey` table entry                                                                                                                               |
| `recipient` | Account name of the final recipient                                                                                                                                 |
| `sigtime`   | Unix time stamp of the signature                                                                                                                                    |
| `sig`       | Signature of "{chain id} {name of this contract} payoff {origin recipient public key\*} {account name of recipient} {id} {sigtime}" by origin payment sender `from` |
|             |                                                                                                                                                                     |
| Result      | Origin recipient `from` receives the payment                                                                                                                        |

\* The public key in string format with prefix (EOS or PUB*K1*). It has to be in the same format as transmitted by the to value.

## Payoff all

Payoff all finished and expired payments of a specific token which regards to an account name recipient.

| Action           | `payoffall(to, token_contract, token_symbol, memo)`              |
| :--------------- | :--------------------------------------------------------------- |
| `to`             | Origin recipient account name                                    |
| `token_contract` | Contract of the token, like eosio.token for EOS                  |
| `token_symbol`   | Symbol type of the token "{precision},{symbol_name}"             |
| `memo`           | String that is used as memo on the payment to the recipient      |
|                  |                                                                  |
| Result           | Origin recipient `to` receives all finished and expired payments |

## Payoff all sig

Payoff all finished and expired payments of a specific token which regards to a public key recipient.

| Action           | `payoffallsig(to, token_contract, token_symbol, recipient, memo, sigtime, sig)`                                                                                                                |
| :--------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `to`             | Origin recipient public key                                                                                                                                                                    |
| `token_contract` | Contract of the token, like eosio.token for EOS                                                                                                                                                |
| `token_symbol`   | Symbol type of the token "{precision},{symbol_name}"                                                                                                                                           |
| `recipient`      | An existing account which should receive all payments                                                                                                                                          |
| `memo`           | String that is used as memo on the payment to the recipient                                                                                                                                    |
| `sigtime`        | Unix time stamp of the signature                                                                                                                                                               |
| `sig`            | String that is used as memo on the payment to the recipient                                                                                                                                    |
|                  |                                                                                                                                                                                                |
| Result           | Signature of "{chain id} {name of this contract} payoff all {token contract name} {token symbol precision,name} {account name of recipient} {memo} {sigtime}" by origin payment recipient `to` |

## Payoff new account

Use all finished and expired payments of sytem tokens which regards to a public key recipient to create a new account and pay him off the remaining token amount.

| Action         | `payoffnewacc(to, user_pub_key, user_name, sigtime, sig)`                                                                                                                           |
| :------------- | :---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `to`           | Origin recipient public key                                                                                                                                                         |
| `user_pub_key` | Public key of the new user account                                                                                                                                                  |
| `user_name`    | Account name of the new user                                                                                                                                                        |
| `sigtime`      | Unix time stamp of the signature                                                                                                                                                    |
| `sig`          | String that is used as memo on the payment to the recipient                                                                                                                         |
|                |                                                                                                                                                                                     |
| Result         | Signature of "{chain id} {name of this contract} payoff new acc {public key in hex format of the new account} {name of the new account} {sigtime}" by origin payment recipient `to` |

# Allowed token

The contract account can add and remove tokens. But these tokens have to be implemented in the code with on_notify before:

```cpp
[[eosio::on_notify("mytokencontr::transfer")]]
void deposit(const name& from, const name& to, const asset& fund, const string& memo)
{
    customDeposit(from, to, fund, memo, "mytokencontr"_n);
}

```

After the deployment of the contract the tokens can be activated with the `settoken` action.

## Add a token to accepted list

| Action          | `settoken(tokenContract, tokenSymbol, openBytes, active)`                                                                                            |
| :-------------- | :--------------------------------------------------------------------------------------------------------------------------------------------------- |
| `tokenContract` | Token contract account name                                                                                                                          |
| `tokenSymbol`   | Symbol of the token which cantains the symbol name and prescission number                                                                            |
| `openBytes`     | Number of RAM bytes which are needed to open a token entry of a new user. For example the open action on the eosio.token contract consumes 240 bytes |
| `active`        | Boolean to accept or dismiss incoming payments of this token                                                                                         |

## Remove a token from accepted list

| Action          | `removetoken(tokenContract, tokenSymbol)`                                 |
| :-------------- | :------------------------------------------------------------------------ |
| `tokenContract` | Token contract account name                                               |
| `tokenSymbol`   | Symbol of the token which cantains the symbol name and prescission number |

# EOSIO RAM management

EOSIO blockchains offer RAM. This is storage that smart contracts can access, but it is very limited and therefore expensive.
Usually, a user has to buy extra EOSIO RAM and make it available for contracts. For ease of use and to enable payments without an EOSIO account, the RAM is automatically booked by the SavAct contract. The RAM is automatically sold again when a payment is completed and additionally credited to the respective payee. However, a small network fee is charged when buying and selling RAM, therefore it only works on payments with the system token.
As alternative users can lend EOSIO RAM for payments to themselfs or to other accounts. Thus no fee is charged. The following actions are used to offer and remove RAM for specific accounts.

Action transfer of system token

Action removeram

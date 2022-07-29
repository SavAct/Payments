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

| Action    | `finalizesig(to, id, sigtime, sig)`                                                                              |
| :-------- | :--------------------------------------------------------------------------------------------------------------- |
| `to`      | Origin recipient public key                                                                                      |
| `id`      | Primary key of `paytokey` table entry                                                                            |
| `sigtime` | Uinix time stamp of the signature                                                                                |
| `sig`     | Signature of "{chain id} {name of this contract} finalize {public key of payment recipient to\*} {id} {sigtime}" |

### Finalize "name to key" payment

| Action | `finalize(to, id)`                     |
| :----- | :------------------------------------- |
| `to`   | Origin recipient account name          |
| `id`   | Primary key of `paytoname` table entry |

### Finalize "key to key" payment

| Action    | `finalizesig(to, id, sigtime, sig)`                                                                              |
| :-------- | :--------------------------------------------------------------------------------------------------------------- |
| `to`      | Origin recipient public key                                                                                      |
| `id`      | Primary key of `paytokey` table entry                                                                            |
| `sigtime` | Uinix time stamp of the signature                                                                                |
| `sig`     | Signature of "{chain id} {Name of this contract} finalize {public key of payment recipient to\*} {id} {sigtime}" |

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

| Action    | `rejectsig(to, id, sigtime, sig)`                                                                |
| :-------- | :----------------------------------------------------------------------------------------------- |
| `to`      | Origin recipient public key                                                                      |
| `id`      | Primary key of `paytokey` table entry                                                            |
| `sigtime` | Uinix time stamp of the signature                                                                |
| `sig`     | Signature of "{chain id} {name of this contract} reject {name of payment sender} {id} {sigtime}" |

### Reject "key to key" payment

| Action    | `rejectsig(to, id, sigtime, sig)`                                                                            |
| :-------- | :----------------------------------------------------------------------------------------------------------- |
| `to`      | Origin recipient public key                                                                                  |
| `id`      | Primary key of `paytokey` table entry                                                                        |
| `sigtime` | Uinix time stamp of the signature                                                                            |
| `sig`     | Signature of "{chain id} {Name of this contract} reject {hex public key of payment sender\*} {id} {sigtime}" |

\* The public key in lower case hex format with one added byte for the key type. For example, the value for `PUB_K1_6MRyAjQq8ud7hVNYcfnVPJqcVpscN5So8BhtHuGYqET5BoDq63` is "`02c0ded2bc1f1305fb0faac5e6c03ee3a1924234985427b6167ca569d13df435cf00`".

# Invalidate

Invalidate / burn a payment. This action can only be executed by the sender of the payment and within the time limit. It results in the recipient and sender not receiving the payment. Instead it will be send to the SavAct stake account and hence distributed among the SavAct token holders.

### Invalidate "name to name" payment

| Action | `invalidate(to, id)`                   |
| :----- | :------------------------------------- |
| `to`   | Origin recipient account name          |
| `id`   | Primary key of `paytoname` table entry |

### Invalidate "key to name" payment

| Action    | `invalisig(to, id, sigtime, sig)`                                                                                |
| :-------- | :--------------------------------------------------------------------------------------------------------------- |
| `to`      | Origin recipient public key                                                                                      |
| `id`      | Primary key of `paytokey` table entry                                                                            |
| `sigtime` | Uinix time stamp of the signature                                                                                |
| `sig`     | Signature of "{chain id} {name of this contract} finalize {public key of payment recipient to\*} {id} {sigtime}" |

### Invalidate "name to key" payment

| Action | `invalidate(to, id)`                   |
| :----- | :------------------------------------- |
| `to`   | Origin recipient account name          |
| `id`   | Primary key of `paytoname` table entry |

### Invalidate "key to key" payment

| Action    | `invalisig(to, id, sigtime, sig)`                                                                                |
| :-------- | :--------------------------------------------------------------------------------------------------------------- |
| `to`      | Origin recipient public key                                                                                      |
| `id`      | Primary key of `paytokey` table entry                                                                            |
| `sigtime` | Uinix time stamp of the signature                                                                                |
| `sig`     | Signature of "{chain id} {Name of this contract} finalize {public key of payment recipient to\*} {id} {sigtime}" |

\* The public key in string format with prefix (EOS or PUB_K1\_). It has to be in the same format as transmitted by the `to` value.

# Payoff

All actions, after a payment, where the final recipient is an account name and the time limit is no longer relevant will directly paid off. If the final recipient of a payment is a public key or the time limit just reached a payoff action need to be executed to withdrawel the payment.

Action payoff

Action payoffsig

Action payoffnewacc

Action payoffall

Action payoffsigall

# Allowed token

The contract account can add and remove tokens. These tokens have to be implemented in the code with on_notify.

Action settoken

Action removetoken

# EOSIO RAM management

EOSIO blockchains offer RAM. This is storage that smart contracts can access, but it is very limited and therefore expensive.
Usually, a user has to buy extra EOSIO RAM and make it available for contracts. For ease of use and to enable payments without an EOSIO account, the RAM is automatically booked by the SavAct contract. The RAM is automatically sold again when a payment is completed and additionally credited to the respective payee. However, a small network fee is charged when buying and selling RAM, therefore it only works on payments with the system token.
As alternative users can lend EOSIO RAM for payments to themselfs or to other accounts. Thus no fee is charged. The following actions are used to offer and remove RAM for specific accounts.

Action transfer of system token

Action removeram
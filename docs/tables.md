# Tables

## tokens

Payments are possible with all tokens which are listed in tokens table. To add a new tokens it has to be considered with eosio::on_notify in the code.

For `scope` the SavPay contract account name is used.

Each entry contains the token symbol `(token)` and the amount of bytes `(openBytes)` to open a new entry for a user in the token contract

## pay2name

Payments to a name are listed on the pay2name table. The `scope` is the recipient account name. The sender can be an account name or a public key and is stored in the `from` value as byte vector. The output of API requests is in a hex string format. The last byte of the public key of from is the key type. `0x00` for `K1` keys.

The value `byram` referres to the RAM offerer of the `ram` table. If it is the same account name as the contract account, the RAM was bought by reducing the payment amount. After the payment is completed this RAM will be unlocked on ram table or sold and withdrwan to the final recipient. But if the final recipient has no entry on the token contract this RAM will be used to open it instead.

Further more this table stores the `fund`, payment token `contract` account name, the deadline as fix unix `time` stamp and `memo`. The `memo` will be used as memo for the final token transfer on a successfull payment. Therefore it is limited to 256 bytes. The primary key is the continues upcounting `id`, see `data` table.

## pay2key

Payments to a public key are listed on the pay2key table. The `scope` are the last 8 bytes of the raw recipient public key. The remaining first bytes of the public key are stored in the `to` value as byte vector. The last byte of the `to` value is the key type. `0x00` for `K1` keys. All other data is exact like the `pay2name` table.

## data

This table stores the next free primary key from the pay2name and pay2key tables. For `pay2name` the scope name value is `name` and for the pay2key table it is `key`.

The primary key on the payment tables always count up. This value will never fall back to a previous value as long it reaches an overflow. Then it will start by 0, but the primary key is an unsigned 64 bit integer so it will never happen.

Side information: The prevention of fall backs is necessary to prevent the usage of an already used signature, within the timespan a signature is valid.

## ram

Everyone can offer RAM for payment recipients to make transactions free of any fees. This table stores the amount of RAM which is offeres to and from which user. The value `amount` is the total offerd RAM bytes from and to a user and the value `free` is the currently not used amount of RAM bytes. After a payment is completed the `free` value will be restored. Only if the recipient has no entry on `data` table yet, the RAM for it will not restored and therefore reduce the amount value as well.

There is also a time value `(maxTime)` to define the timespan how long the RAM can be used. The boolean `(relative)` defines if the time value is a relative time span `(true)` from the beginning of a payment or a fix unix time stamp `(false)`.

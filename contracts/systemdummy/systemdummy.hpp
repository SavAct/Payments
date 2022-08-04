#pragma once

#include <eosio/eosio.hpp>
#include <eosio/symbol.hpp>

#include <eosio/action.hpp>
#include <eosio/contract.hpp>
#include <eosio/crypto.hpp>
#include <eosio/fixed_bytes.hpp>
#include <eosio/ignore.hpp>
#include <eosio/print.hpp>
#include <eosio/privileged.hpp>
#include <eosio/producer_schedule.hpp>

#include <eosio/asset.hpp>
#include <eosio/multi_index.hpp>
#include <vector>

#include <eosio/system.hpp>
#include <eosio/transaction.hpp>

using eosio::checksum256;
using eosio::ignore;
using eosio::name;
using eosio::permission_level;
using eosio::public_key;

using namespace eosio;

/**
 * A weighted permission.
 *
 * Defines a weighted permission, that is a permission which has a weight associated.
 * A permission is defined by an account name plus a permission name.
 */
struct permission_level_weight {
   permission_level  permission;
   uint16_t          weight;

   // explicit serialization macro is not necessary, used here only to improve compilation time
   EOSLIB_SERIALIZE(permission_level_weight, (permission)(weight))
};

/**
 * Wait weight.
 *
 * A wait weight is defined by a number of seconds to wait for and a weight.
 */
struct wait_weight {
   uint32_t           wait_sec;
   uint16_t           weight;

   // explicit serialization macro is not necessary, used here only to improve compilation time
   EOSLIB_SERIALIZE(wait_weight, (wait_sec)(weight))
};

/**
 * Blockchain authority.
 *
 * An authority is defined by:
 * - a vector of key_weights (a key_weight is a public key plus a wieght),
 * - a vector of permission_level_weights, (a permission_level is an account name plus a permission name)
 * - a vector of wait_weights (a wait_weight is defined by a number of seconds to wait and a weight)
 * - a threshold value
 */
struct authority {
   uint32_t                              threshold = 0;
   std::vector<key_weight>               keys;
   std::vector<permission_level_weight>  accounts;
   std::vector<wait_weight>              waits;

   // explicit serialization macro is not necessary, used here only to improve compilation time
   EOSLIB_SERIALIZE(authority, (threshold)(keys)(accounts)(waits))
};

/**
 * Blockchain block header.
 *
 * A block header is defined by:
 * - a timestamp,
 * - the producer that created it,
 * - a confirmed flag default as zero,
 * - a link to previous block,
 * - a link to the transaction merkel root,
 * - a link to action root,
 * - a schedule version,
 * - and a producers' schedule.
 */
struct block_header {
   uint32_t                                  timestamp;
   name                                      producer;
   uint16_t                                  confirmed = 0;
   checksum256                               previous;
   checksum256                               transaction_mroot;
   checksum256                               action_mroot;
   uint32_t                                  schedule_version = 0;
   std::optional<eosio::producer_schedule>   new_producers;

   // explicit serialization macro is not necessary, used here only to improve compilation time
   EOSLIB_SERIALIZE(block_header, (timestamp)(producer)(confirmed)(previous)(transaction_mroot)(action_mroot)
      (schedule_version)(new_producers))
};


CONTRACT systemdummy : public eosio::contract{
  public:
    using eosio::contract::contract;

  private:

   TABLE exchange_state {
        eosio::asset    supply;

        struct connector {
            eosio::asset balance;
            double weight = .5;
        };
        uint64_t primary_key()const { return supply.symbol.raw(); }

        connector base;
        connector quote;
    };
    typedef eosio::multi_index<"rammarket"_n, exchange_state> rammarket;


   public:

      ACTION newaccount(const name& creator, const name& name, authority& owner, authority& active) {
         // Create account by this dummy contract instead
         action{
            permission_level{get_self(), "active"_n},
            "eosio"_n,
            "newaccount"_n,
            std::make_tuple(get_self(), name, owner, active)}
         .send();
      }

      ACTION setabi(const name& account, const std::vector<char>& abi) {
      }

      ACTION setcode(const name& account, uint8_t vmtype, uint8_t vmversion, const std::vector<char>& code) {
      }

      ACTION buyram(const name& payer, const name& receiver, const eosio::asset& quant) {
      }

      ACTION buyrambytes(const name& payer, const name& receiver, uint32_t bytes) {
      }

      ACTION sellram(const name& account, int64_t bytes) {
      }

      ACTION delegatebw(const name& from, const name& receiver, const eosio::asset& stake_net_quantity, const eosio::asset& stake_cpu_quantity, bool transfer) {
      }

      ACTION setramstate(eosio::asset supply, eosio::asset basebalance, eosio::asset quotebalance);

      ACTION deleteauth(ignore<name> account, ignore<name> permission) {
         eosio::check(false, "Hello World");
      }
};

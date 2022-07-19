#include "systemdummy.hpp"

ACTION systemdummy::setramstate(eosio::asset supply, eosio::asset basebalance, eosio::asset quotebalance){
  rammarket _rammarket(get_self(), get_self().value);
  _rammarket.emplace(get_self(), [&](auto& p) {
    p.supply = supply;
    p.base.balance = basebalance;
    p.quote.balance = quotebalance;
  });
}

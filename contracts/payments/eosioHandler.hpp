#pragma once

#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <eosio/symbol.hpp>
#include <eosio/crypto.hpp>

using namespace eosio;

#define System_Contract_CharArray "systemdummy"   // Has to be "eosio". Only while testing it is "systemdummy" 
    
static constexpr symbol System_Symbol("EOS", 4);
static constexpr name System_Token_Contract("eosio.token");

class EosioHandler 
{
public:
    /**
     * @brief Table definition of custom tokens.
     */
    struct [[eosio::table, eosio::contract(System_Contract_CharArray)]] token_accounts {
        asset balance;
        uint64_t primary_key()const { return balance.symbol.code().raw(); }
    };
    typedef eosio::multi_index< "accounts"_n, token_accounts > tokenAcc_table;

    // Structs from eosio.bios.hpp
    struct key_weight {
        public_key 	key;
        uint16_t 	weight;
        EOSLIB_SERIALIZE( key_weight, (key)(weight) )
    };
    struct wait_weight {
        uint32_t	wait_sec;
        uint16_t	weight;
        EOSLIB_SERIALIZE( wait_weight, (wait_sec)(weight) )
    };
    struct permission_level_weight {
        permission_level  permission;
        uint16_t          weight;
        EOSLIB_SERIALIZE( permission_level_weight, (permission)(weight) )
    };
    struct authority {
        uint32_t                              threshold = 0;
        std::vector<key_weight>               keys;
        std::vector<permission_level_weight>  accounts;
        std::vector<wait_weight>              waits;
        EOSLIB_SERIALIZE( authority, (threshold)(keys)(accounts)(waits) )
    };

    /** Deduced from eosio.system/src/From delegate_bandwidth.cpp function buyrambytes
    *   @brief Calculate the price for an amount of RAM bytes.
    * 
    *   @param bytes    Amount of bytes of the RAM
    *   @returns        Cost of RAM, including the fee
    */
    static int64_t calcRamPrice(const int32_t bytes);

    //- TODO: Test this function
    /**
     * @brief Calculate the amount of RAM bytes for an amount of system token.
     * 
     * @param amount 
     * @return int64_t 
     */
    static int64_t calcRamBytes(const int32_t amount);

    //- TODO: Test this function
    /**
     * @brief This function calculate the returned fund of system token by selling an amount of RAM bytes.
     * 
     * @param bytes     Amount of bytes of the RAM
     * @returns         Given amount of system token deducted by the fee
     */
    static int64_t calcSellRamPrice(const int32_t bytes);

    /** 
    *   @brief Stake NET and CPU for an account.
    *	@param self		    Executing account
	*	@param account		Name of the new account
	*	@param stake_net	Public key of the new account
	*/
    static void createAccount(const name& self, const name& account, const public_key& pubkey);
    
	/** Stake NET and CPU for an account
    *	@param self		    Executing account
	*	@param account		Account which gets the staked resources
	*	@param stake_net	Amount of system token to stake for NET
	*	@param stake_cpu 	Amount of system token to stake for CPU
	*/
	static void delegatebw(const name& self, const name& account, const asset& stake_net, const asset& stake_cpu);

    /** 
    *   @brief Transfer funds of system token.
    * 
	*	@param from		Name of the sender 
    *	@param to		Name of the recipient 
	*	@param funds	Amount of funds
	*	@param memo		Referring memo
	*/
	static void transfer(const name& from, const name& to, const asset& funds, const std::string& memo);

    /** 
    *   @brief Transfer funds of custom token.
    * 
	*	@param from		Name of the sender 
    *	@param to		Name of the recipient 
	*	@param funds	Amount of funds
	*	@param memo		Referring memo
    *   @param token_contract   Contract of the token
	*/
    static void transferCustom(const name& from, const name& to, const asset& funds, const std::string& memo, const name& token_contract);

    /**
     * @brief Open an entry for a token.
     * 
     * @param tokenContractName 
     * @param to 
     * @param fund_symbol 
     * @param ram_payer 
     */
    static void openToken(const name& token_contract, const name& to, const symbol& fund_symbol, const name& ram_payer);

    /**
     * @brief Test if a user has already an entry in the contract of a token.
     * 
     * @param token_contract Contract of the token
     * @param user User to check
     * @param fund_symbol Symbol of the token
     * @return True if there is an entry, otherwise false
     */
    static bool hasOpenTokenRow(const name& token_contract, const name& user, const symbol& fund_symbol);

    /**
     * @brief Check if a user has already an entry in the contract of a token.
     * 
     * @param token_contract Contract of the token
     * @param user User to check
     * @param fund_symbol Symbol of the token
     */
    static void checkOpenTokenRow(const name& token_contract, const name& user, const symbol& fund_symbol);

	/** 
    *   @brief Buy RAM by bytes.
	*	@param payer		Account who pays in system token for the RAM 
	*	@param receiver		Receier of the RAM
	*	@param bytes		Amount of bytes which should be bought
	*/
	static void buyrambytes(const name& payer, const name& receiver, const int32_t bytes);

    /**
     * @brief Buy amount of RAM for a given amount of system token.
     * @param payer 
     * @param receiver 
     * @param quant 
     */
    static void buyram(const name& payer, const name& receiver, const asset& quant);

    /** 
    *   @brief Buy RAM by bytes.
	*	@param account		Account who sells the RAM
	*	@param bytes		Amount of bytes which should be sold
	*/
	static void sellram(const name& account, const int32_t bytes);

private:
    // From eosio.system/src/exchange_state.cpp
    static int64_t get_bancor_input(const int64_t out_reserve, const int64_t inp_reserve, const int64_t out);
    static int64_t get_bancor_output(const int64_t inp_reserve, const int64_t out_reserve, const int64_t inp);

    // From eosio.system/include/exchange_state.hpp
    /**
    * Uses Bancor math to create a 50/50 relay between two asset types.
    *
    * The state of the bancor exchange is entirely contained within this struct.
    * There are no external side effects associated with using this API.
    */
    struct [[eosio::table, eosio::contract(System_Contract_CharArray)]] exchange_state {
        asset    supply;

        struct connector {
            asset balance;
            double weight = .5;
        };
        uint64_t primary_key()const { return supply.symbol.raw(); }

        connector base;
        connector quote;
    };
    typedef eosio::multi_index<"rammarket"_n, exchange_state> rammarket;

    struct [[eosio::table, eosio::contract(System_Contract_CharArray)]] user_resources {
      name          owner;
      asset         net_weight;
      asset         cpu_weight;
      int64_t       ram_bytes = 0;

      bool is_empty()const { return net_weight.amount == 0 && cpu_weight.amount == 0 && ram_bytes == 0; }
      uint64_t primary_key()const { return owner.value; }
   };
   typedef eosio::multi_index<"userres"_n, user_resources> user_resources_table;

    static constexpr name eosio_system = name(System_Contract_CharArray);
    static constexpr symbol ramcore_symbol = symbol(symbol_code("RAMCORE"), 4);
};


int64_t EosioHandler::calcRamPrice(const int32_t bytes) {
    rammarket _rammarket(eosio_system, eosio_system.value);
    auto itr = _rammarket.find(ramcore_symbol.raw());
    const int64_t ram_reserve   = itr->base.balance.amount;
    const int64_t eos_reserve   = itr->quote.balance.amount;
    const int64_t cost          = get_bancor_input( ram_reserve, eos_reserve, bytes );
    return cost / double(0.995);            // plus fee
}

int64_t EosioHandler::calcRamBytes(const int32_t amount) {
    rammarket _rammarket(eosio_system, eosio_system.value);
    auto itr = _rammarket.find(ramcore_symbol.raw());
    const int64_t ram_reserve   = itr->base.balance.amount;
    const int64_t eos_reserve   = itr->quote.balance.amount;
    const int64_t bytes         = get_bancor_input( eos_reserve, ram_reserve, amount);
    return bytes * double(0.995);
}

int64_t EosioHandler::calcSellRamPrice(const int32_t bytes) {
    rammarket _rammarket(eosio_system, eosio_system.value);
    auto itr = _rammarket.find(ramcore_symbol.raw());
    const int64_t ram_reserve   = itr->base.balance.amount;
    const int64_t eos_reserve   = itr->quote.balance.amount;
    const int64_t fund          = get_bancor_output( ram_reserve, eos_reserve, bytes );
    return fund * double(0.995);
}

void EosioHandler::buyrambytes(const name& payer, const name& receiver, const int32_t bytes){
	action {
	  permission_level{payer, "active"_n},
	  eosio_system,
	  "buyrambytes"_n,
	  std::make_tuple(payer, receiver, bytes)
	}.send();
}

void EosioHandler::buyram(const name& payer, const name& receiver, const asset& quant){
	action {
	  permission_level{payer, "active"_n},
	  eosio_system,
	  "buyram"_n,
	  std::make_tuple(payer, receiver, quant)
	}.send();
}

void EosioHandler::sellram(const name& account, const int32_t bytes){
	action {
	  permission_level{account, "active"_n},
	  eosio_system,
	  "sellram"_n,
	  std::make_tuple(account, bytes)
	}.send();
}

void EosioHandler::transfer(const name& from, const name& to, const asset& funds, const std::string& memo)
{
	check(funds.amount > 0, "No system token amount to transfer.");
	
	action {
	  permission_level{from, "active"_n},
	  System_Token_Contract,
	  "transfer"_n,
	  std::make_tuple(from, to, funds, memo)
	}.send();
}

void EosioHandler::transferCustom(const name& from, const name& to, const asset& funds, const std::string& memo, const name& token_contract)
{
	check(funds.amount > 0, "No token amount to transfer.");
	
	action {
	  permission_level{from, "active"_n},
	  token_contract,
	  "transfer"_n,
	  std::make_tuple(from, to, funds, memo)
	}.send();
}

void EosioHandler::openToken(const name& token_contract, const name& to, const symbol& fund_symbol, const name& ram_payer){
    action {
        permission_level{ram_payer, "active"_n},
        token_contract,
        "open"_n,
        std::make_tuple(to, fund_symbol, ram_payer)
    }.send();
}

void EosioHandler::checkOpenTokenRow(const name& token_contract, const name& user, const symbol& fund_symbol){
    check(hasOpenTokenRow(token_contract, user, fund_symbol), "The user has no entry for this token.");
}

bool EosioHandler::hasOpenTokenRow(const name& token_contract, const name& user, const symbol& fund_symbol){
    tokenAcc_table _acctable(token_contract, user.value);
    auto itr = _acctable.find(fund_symbol.code().raw());
    return itr != _acctable.end();
}

void EosioHandler::delegatebw(const name& self, const name& account, const asset& stake_net, const asset& stake_cpu){
    action{
        permission_level{ self, "active"_n},
        eosio_system,
        "delegatebw"_n,
        std::make_tuple(self, account, stake_net, stake_cpu, true)
    }.send();
}

void EosioHandler::createAccount(const name& self, const name& account, const public_key& pubkey){	
    // Create of the newAccount similar to this old contract: 				https://github.com/DeBankDeFi/signupeoseos/blob/master/signupeoseos.cpp

    key_weight pubkey_weight = key_weight{ pubkey, 1 };
    std::vector<key_weight> keys;
    keys.push_back(pubkey_weight);

    authority owner  = authority{ 1, keys, {}, {} };
    authority active = authority{ 1, keys, {}, {} };

    action{
        permission_level{self, "active"_n},
        eosio_system,
        "newaccount"_n,
        std::make_tuple(self, account, owner, active)
    }.send();
}

int64_t EosioHandler::get_bancor_input(const int64_t out_reserve, const int64_t inp_reserve, const int64_t out){
    const double ob = out_reserve;
    const double ib = inp_reserve;

    int64_t inp = (ib * out) / (ob - out);
    if ( inp < 0 ) inp = 0;
    return inp;
}

int64_t EosioHandler::get_bancor_output(const int64_t inp_reserve, const int64_t out_reserve, const int64_t inp){
    const double ib = inp_reserve;
    const double ob = out_reserve;
    const double in = inp;

    int64_t out = int64_t( (in * ob) / (ib + in) );
    if ( out < 0 ) out = 0;
    return out;
}
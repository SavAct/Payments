// #define dev // Attention: This activates the system contract for the test environment. It has to be undefined on release mode

#ifndef dev
// Production mode for EOS mainnet
#define chainIDAndContractName "aca376f206b8fc25a6ed44dbdc66547c36c6c33e3a119ffbeaef943642f0e906 savactsavpay"
#else
// Developer mode
#define chainIDAndContractName "8be32650b763690b95b7d7e32d7637757a0a7392ad04f1c393872e525a2ce82b savactsavpay"
#endif

#include <eosio/eosio.hpp>
#include <eosio/asset.hpp>
#include <vector>
#include <list>

#include <eosio/symbol.hpp>
#include <eosio/system.hpp>
#include <eosio/crypto.hpp>
#include <eosio/transaction.hpp>
#include "conversion.hpp"
#include "eosioHandler.hpp"

// Consumed RAM without scope and without memo
#define ram_pay2name_entry_from_name 174 // Name to name 54 + 120 bytes new entry
#define ram_pay2name_entry_from_key 200  // Key to name 80 + 120 bytes new entry
#define ram_pay2key_entry_from_name 201  // Name to key 81 + 120 bytes new entry
#define ram_pay2key_entry_from_key 227   // Key to key 107 bytes + 120 bytes new entry

#define ram_scope 112                   // Consumed RAM for a new scope with 8 byte scope value
#define ram_system_token_open_entry 240 // Consumed RAM to receive system tokens for the first time

#define ram_ram_entry 141 // 112 + 29 
#define ram_data_entry 128

#define expirationTime 86400 // 24h

using namespace std;
using namespace eosio;

constexpr name nirvana = name("stake.savact");
constexpr name receiveSellRamAccount = name("eosio.ram"); // Payments from this account to this contract will not be handled as SavPay transactions


// Parameters for account creation
static constexpr uint64_t ramForUser = 4000;     // Bytes of RAM
static constexpr uint64_t netCostForUser = 5000; // amount in system token
static constexpr uint64_t cpuCostForUser = 5000; // amount in system token

CONTRACT savactsavpay : public contract
{
public:

    struct Link {
        string url;
        string note;
    };

    struct OptionData {
        string o;     // options text
        uint64_t a;    // active
        uint64_t c;    // completed (finalized or invalidated)
        uint64_t r;    // rejected
    };

private:
    /**
     * @brief Table of all allowed tokens.
     * It contains the amount of RAM to open an entry.
     * Scope is the contract name
     */
    TABLE tokens
    {
        symbol token;
        uint32_t openBytes;
        bool active;
        auto primary_key() const { return token.raw(); }
    };
    typedef multi_index<name("tokens"), tokens> tokens_table;

    /**
     * @brief Converts vote time and the token holder name value to the secondary key
     *
     * @param vt Vote time
     * @param holderValue Holder value
     * @return uint64_t
     */
    static uint64_t toSecondary(const uint64_t vt, const vector<char>& holderValue) {
        return (vt << 32) | (*((const uint32_t*)(holderValue.data() + 4)));
    }

    TABLE votes{
        uint64_t index;
        name ramBy;
        vector<char> holder;
        uint8_t vid;
        uint32_t t;
        uint32_t vt;
        asset rtoken;
        name rtcontract;
        string title;
        vector<OptionData> options;
        vector<Link> links;

        uint64_t a;    // active
        uint64_t f;    // finalized
        uint64_t i;    // invalidated
        uint64_t r;    // rejected

        auto primary_key() const { return index; }
        uint64_t get_secondary() const { return toSecondary(vt, holder.size() == 0 ? Conversion::nameToVector(ramBy) : holder); }
        // uint128_t get_tertiary() const { return (((uint128_t)(rtcontract.value)) << 64) | rtoken.symbol.raw(); }
    };

    // typedef multi_index<name("votes"), votes> votes_table;
    typedef multi_index < name("votes"), votes, indexed_by<name("secondary"), const_mem_fun<votes, uint64_t, &votes::get_secondary>>> votes_table;
    // typedef multi_index < name("votes"), votes, indexed_by<name("secondary"), const_mem_fun<votes, uint64_t, &votes::get_secondary>>, indexed_by<name("tertiary"), const_mem_fun<votes, uint128_t, &votes::get_tertiary>>> votes_table;

    /**
     * @brief Table for all payments to an account name
     *
     */
    TABLE pay2name
    {
        uint64_t id;       // 8 bytes
        vector<char> from; // 35 bytes | 9 bytes
        asset fund;        // 16 bytes
        uint64_t orisent;  // 8 bytes
        name contract;     // 8 bytes
        uint32_t time;     // 4 bytes
        string memo;       // variable bytes
        name ramBy;        // 8 bytes
        uint8_t type;      // 1 byte
        auto primary_key() const { return id; }
    };
    typedef multi_index<name("pay2name"), pay2name> pay2name_table;

    /**
     * @brief Table for all payments to a public key
     *
     */
    TABLE pay2key
    {
        uint64_t id;       // 8 bytes
        vector<char> from; // 35 bytes | 9 bytes
        vector<char> to;   // 27 bytes
        asset fund;        // 16 bytes
        uint64_t orisent;  // 8 bytes
        name contract;     // 8 bytes
        uint32_t time;     // 4 bytes
        string memo;       // variable bytes
        name ramBy;        // 8 bytes
        uint8_t type;      // 1 byte
        auto primary_key() const { return id; }
    };
    typedef multi_index<name("pay2key"), pay2key> pay2key_table;

    /**
     * @brief Table to store the highest id
     * scope = "name" for pay2name table
     * scope = "key" for pay2key table
     */
    TABLE data
    {
        uint64_t scopeId; // 8 bytes
        uint64_t nextId;  // 8 bytes
        auto primary_key() const { return scopeId; }
    };
    typedef multi_index<name("data"), data> data_table;

    /**
     * @brief RAM storage for account recipients. Accounts can offer RAM for free under special conditions.
     * The scope is defined by the recipient number.
     */
    TABLE ram
    {
        name from;        // 8 bytes
        uint64_t amount;  // 8 bytes
        uint64_t free;    // 8 bytes
        uint32_t maxTime; // 4 bytes
        bool relative;    // 1 bytes
        auto primary_key() const { return from.value; }
    };
    typedef multi_index<name("ram"), ram> ram_table;

    public:
        using contract::contract;

        /**
         * @brief Set token to a accepted token list and define the amount of RAM which are needed to create an entry for a user.
         *
         * @param tokenContract Contract name of the token
         * @param tokenSymbol Symbol of the token
         * @param openBytes Bytes of RAM to open an entry for an account name. For the eosio.token contract of 2022 it is 240 Byte
         * @param active Should initial payments with this token be accepted
         */
        ACTION settoken(const name& tokenContract, const symbol& tokenSymbol, const uint32_t openBytes, bool active);

        /**
         * @brief Remove a token from accepted token list.
         *
         * @param tokenContract
         * @param tokenSymbol
         */
        ACTION removetoken(const name& tokenContract, const symbol& tokenSymbol);

        /**
         * @brief Buy ram for a given max time limit and a maximum of memo size. Each payer "from" can only set one max time definition per user "to".
         *
         * @param from Payer of the RAM
         * @param to The RAM will be spent for payments to this account
         * @param maxTime Maximum time the RAM can be spent
         * @param relative Is the maximum time a relative time span beginning at a payment or is it an absolute time stamp
         */
        void setRam(const name& from, const name& to, const asset& fund, const uint32_t maxTime, const bool relative);

        /**
         * @brief Sell the RAM and send the fund to the owner.
         *
         * @param from Owner of the RAM
         * @param to Account for which the RAM was offered
         */
        ACTION removeram(const name& from, const name& to);

        /**
         * @brief Set an amount of offered RAM as free to make it usable again for other payments.
         *
         * @param self This contract
         * @param from RAM offerer
         * @param to User for which the RAM was offered
         * @param free Amount of byte which should be market as available again
         */
        static void freeRamUsage(const name& self, const name& from, const name& to, const uint32_t free);

        /**
         * @brief Set an amount of offered RAM as free to make it usable again for other payments.
         *
         * @param self This contract
         * @param from RAM offerer
         * @param to User for which the RAM was offered
         * @param free Amount of byte which should be market as available again
         * @param _ram RAM table with the recipient as scope
         */
        inline static void freeRamUsage(const name& self, const name& from, const name& to, const uint32_t free, ram_table& _ram);

        /**
         * @brief Set an amount of offered RAM as free to make it usable again for other payments.
         *
         * @param self This contract
         * @param free Amount of byte which should be market as available again
         * @param _ram RAM table with the recipient as scope
         * @param itr Iterator to the RAM offerer
         */
        inline static void freeRamUsage(const name& self, const uint32_t free, ram_table& _ram, const ram_table::const_iterator& itr);


        /**
         * @brief Set an amount of offered RAM as used
         *
         * @param self This contract
         * @param used Amount of byte which should be market as used
         * @param _ram RAM table with the recipient as scope
         * @param itr Iterator to the RAM offerer
         */
        inline static void setRamUsage(const name& self, const uint32_t used, ram_table& _ram, const ram_table::const_iterator& itr);


        /**
         * @brief Check if the old offerer payer accept the new time limit otherwise use a new RAM offerer
         *
         * @param self This contract
         * @param to Origin recipient of the payment
         * @param itr Iterator of the payment
         * @return the name of the ram offerer
         */
        inline static name changeRamOfferer(const name& self, const name& to, const pay2name_table::const_iterator& itr, uint32_t time);

        /**
         * @brief Get the amount of RAM which is needed for a payment.
         *
         * @param self This contract
         * @param isName_From Is the sender of the payment an account name
         * @param isName_To Is the recipient of the payment an account name
         * @param token_contract Contract of the token
         * @param sym Symbol of the token
         * @param memo Memo entry
         */
        static uint32_t getRamForPayment(const name& self, bool isName_From, bool isName_To, const name& token_contract, const symbol& sym, const string& memo, const bool forPayIn = false);

        /**
         * @brief Make a payment where sender and recipent can be a name or a public key.
         *
         * @param fromc Account name of the sender as name parameter
         * @param to Name or public key of the recipient
         * @param fund Asset
         * @param token_contract Token contract of the asset
         * @param memo Memo
         * @param time Time limit
         * @param is_vote True if this transaction is a vote
         */
        void pay(const name& from, const string& to, asset fund, const name& token_contract, const string& memo, const uint32_t time, const bool is_vote = false);

        /**
         * @brief Make a payment where sender and recipent can be a name or a public key.
         *
         * @param from Name or public key of the sender as string
         * @param to Name or public key of the recipient
         * @param fund Asset
         * @param token_contract Token contract of the asset
         * @param memo Memo
         * @param time Time limit
         * @param is_vote True if this transaction is a vote
         */
        void pay(const string& from, const string& to, asset fund, const name& token_contract, const string& memo, const uint32_t time, const bool is_vote = false);

        /**
         * @brief Make a payment where sender and recipent can be a name or a public key.
         *
         * @param fromVec Name or public key of the sender as vector
         * @param to Name or public key of the recipient
         * @param fund Asset
         * @param token_contract Token contract of the asset
         * @param memo Memo
         * @param time Time limit
         * @param is_vote True if this transaction is a vote
         */
        void pay(const vector<char>& fromVec, const string& to, asset fund, const name& token_contract, const string* memo, const uint32_t time, const bool is_vote = false);

        /**
         * @brief Find a RAM payer. RAM cannot be sum up by several RAM payers.
         *
         * @param neededRam Amount of RAM which is needed
         * @param time Time stamp of the time limit for invalidation
         * @param currentTime Current unix time stamp
         * @param _ram RAM table with the recipient as scope
         * @return ram_table::const_iterator
         */
        static ram_table::const_iterator getFreeRAMPayer(const uint64_t neededRam, const uint32_t time, const uint32_t currentTime, const ram_table& _ram);

        /**
         * @brief Check if a RAM payer entry offers enough RAM
         *
         * @param neededRam Amount of RAM which is needed
         * @param time Time stamp of the time limit for invalidation
         * @param currentTime Current unix time stamp
         * @param _ram RAM table with the recipient as scope
         * @param itr Iterator of the entry
         * @return bool
         */
        inline static bool isFreeRAMPayer(const uint64_t neededRam, const uint32_t time, const uint32_t currentTime, const ram_table& _ram, const ram_table::const_iterator& itr);

        /**
         * @brief Add a payment to pay2name-table.
         *
         * @param table Table with selected scope
         * @param from Sender as account name or public key
         * @param to Recipient as name
         * @param fund Asset of the token involved
         * @param orisent Originally sent amount
         * @param token_contract Contract of the token
         * @param memo Memo which will be set on pay off of the recipient
         * @param time Time limit in which the payment can be invalidated
         * @param ram_payer Account name which pays the RAM
         */
        void addpayment(pay2name_table& table, const uint64_t index, const vector<char>& from, const name& to, const asset& fund, const uint64_t orisent, const name& token_contract, const string& memo, const uint32_t time, const name& ram_payer, const Conversion::PaymentType& type = Conversion::PaymentType::payment);
        /**
         * @brief Add a payment to pay2key-table.
         *
         * @param table Table with selected scope
         * @param from Sender as account name or public key
         * @param to_vec Recipient as public key without the part which is used as scope
         * @param fund Asset of the token involved
         * @param orisent Originally sent amount
         * @param token_contract Contract of the token
         * @param memo Memo which will be set on pay off of the recipient
         * @param time Time limit in which the payment can be invalidated
         * @param ram_payer Account name which pays the RAM
         */
        void addpayment(pay2key_table& table, const uint64_t index, const vector<char>& from, const vector<char>& to_key, const asset& fund, const uint64_t orisent, const name& token_contract, const string& memo, const uint32_t time, const name& ram_payer, const Conversion::PaymentType& type = Conversion::PaymentType::payment);

        /**
         * @brief Get the sender (user) as char vector and check if the sender is valid
         *
         * @param user Account name
         * @return vector<char> of the user
         */
        vector<char> getSenderVecFrom(const name& user);

        /**
         * @brief Get the sender (user) as char vector and check if the sender is valid
         *
         * @param user Account name or public key as string
         * @return vector<char> of the user
         */
        vector<char> getSenderVecFrom(const string& user);

        /**
         * @brief Check if the token is allowed for payout
         *
         * @param self This contract
         * @param token_contract Token contract name
         * @param tokensymbol Symbol of the token
         * @returns true if the token is allowed
         */
        static bool isTokenAcceptedPayOut(const name& self, const name& token_contract, const symbol& tokensymbol);
        /**
         * @brief Check if the token is allowed for payout and get the amount of needed RAM to open an entry on the token contract for a new user.
         *
         * @param self This contract
         * @param token_contract Token contract name
         * @param tokensymbol Symbol of the token
         * @param rambytes Obtains the amount of bytes to open an entry for a new user
         * @returns true if the token is allowed
         */
        static bool isTokenAcceptedPayOut(const name& self, const name& token_contract, const symbol& tokensymbol, uint32_t& rambytes);

        /**
         * @brief Check if the token is allowed for incoming payments and get the amount of needed RAM to open an entry on the token contract for a new user.
         *
         * @param self This contract
         * @param token_contract Token contract name
         * @param tokensymbol Symbol of the token
         * @param rambytes Obtains the amount of bytes to open an entry for a new user
         * @returns true if the token is allowed
         */
        static bool isTokenAcceptedPayIn(const name& self, const name& token_contract, const symbol& tokensymbol, uint32_t& rambytes);

        /**
         * @brief Get the eosio multi index storage size of a string (only up to 34,359,738,367 characters)
         *
         * @param s String
         * @return Size of the string
         */
        static std::size_t getStringStorageSize(const string& s);

        /**
         * @brief Check if a scope is already defined
         *
         * @param table Multi index table
         * @return true
         * @return false
         */
        static inline bool hasScope(const pay2name_table& table) {
            return table.begin() != table.end();
        }
        /**
         * @brief Check if a scope is already defined
         *
         * @param table Multi index table
         * @return true
         * @return false
         */
        static inline bool hasScope(const pay2key_table& table) {
            return table.begin() != table.end();
        }
        /**
         * @brief Check if a scope is already defined
         *
         * @param table Multi index table
         * @return true
         * @return false
         */
        static inline bool hasScope(const ram_table& table) {
            return table.begin() != table.end();
        }

        /**
         * @brief Check if there is only one entry in this table
         *
         * @param table Multi index table
         * @return true
         * @return false
         */
        static inline bool onlyOneEntry(const pay2name_table& table) {
            return table.begin() == --table.end();
        }
        /**
         * @brief Check if there is only one entry in this table
         *
         * @param table Multi index table
         * @return true
         * @return false
         */
        static inline bool onlyOneEntry(const pay2key_table& table) {
            return table.begin() == --table.end();
        }

        /**
         * @brief Get the current available primary key for pay2name table and set the next one
         *
         * @param self This contract
         * @param to_scope_name Scope of the recipients table
         * @return uint64_t Current free primary key
         */
        static uint64_t nextNameIndex(const name& self, const name& to_scope_name);
        /**
         * @brief Get the current available primary key for pay2key table and set the next one
         *
         * @param self This contract
         * @param to_scope_key Scope of the recipients table
         * @return uint64_t Current free primary key
         */
        static uint64_t nextKeyIndex(const name& self, const uint64_t to_scope_key);

        /**
         * @brief Check if time is already rejected, finalized or expired
         *
         * @param time Time stamp of a payment table
         */
        static void checkTime(uint32_t time);

        /**
         * @brief Extend a payment where the recipient is an account name.
         *
         * @param to Origin recipient
         * @param id Id of the payment
         * @param time New time limit for the payment
         */
        ACTION extend(const name& to, const uint64_t id, const uint32_t time) {
            require_auth(to);
            check(time > eosio::current_time_point().sec_since_epoch(), "Time is below current time.");

            // Find entry
            pay2name_table _pay2name(get_self(), to.value);
            auto itr = _pay2name.find(id);
            check(itr != _pay2name.end(), "Entry does not exist.");
            check(itr->time != 0, "Payment is already rejected.");
            check(itr->time != time, "Mentioned time limit is equal to the current one.");
            check(itr->time < time, "Cannot reduce the time limit.");

            // Find new RAM offerer if needed
            const name payer = changeRamOfferer(get_self(), to, itr, time);

            // Extend the payment
            _pay2name.modify(itr, get_self(), [&](auto& p) {
                p.time = time;
                p.ramBy = payer;
            });
        }

        /**
         * @brief Extend a payment where the recipient is a public key.
         *
         * @param to Origin recipient
         * @param id Id of the payment
         * @param extend New time limit for the payment
         * @param sigtime Time stamp of the signature
         * @param sig Signature of "{Chain id} {name of this contract} extend {extend time} {public key of origin recipient in hex format} {id} {sigtime}"
         */
        ACTION extendsig(const public_key& to, const uint64_t id, const uint32_t time, const uint32_t sigtime, const signature& sig) {
            uint32_t currentTime = eosio::current_time_point().sec_since_epoch();
            check(currentTime - sigtime < expirationTime, "The transaction is expired.");
            check(time > currentTime, "Time is below current time.");

            // Find entry
            uint64_t scope;
            auto to_vec = Conversion::GetVectorFromPubKeySplitFormat(to, scope);
            pay2key_table _pay2key(get_self(), scope);
            auto itr = _pay2key.find(id);

            // Check the parameters
            check(itr != _pay2key.end(), "Entry does not exist.");
            check(itr->to == to_vec, "Wrong public key.");          // Check the recipient
            check(itr->time != 0, "Payment is already rejected.");
            check(itr->time != time, "Mentioned time limit is equal to the current one.");
            check(itr->time < time, "Cannot reduce the time limit.");

            if (itr->type == Conversion::PaymentType::checked_vote && itr->time == 1) {
                // Change amount on public vote entry
                voteExtendFinalized(itr->memo, itr->orisent);
            }

            // Extend the payment
            _pay2key.modify(itr, get_self(), [&](auto& p) {
                p.time = time;
            });

            // Check the signature with the recipient of the payment
            auto to_hex = Conversion::vec_to_hex(Conversion::GetVectorFromPubKey(to));
            string checkStr;
            checkStr.append(chainIDAndContractName).append(" extend ").append(std::to_string(time)).append(" ").append(to_hex).append(" ").append(std::to_string(id)).append(" ").append(std::to_string(sigtime));
            const checksum256 digest = sha256(&checkStr[0], checkStr.size());
            assert_recover_key(digest, sig, to); // breaks if the signature doesn't match
        }

        /**
         * @brief Reject a payment to the sender where the recipient is an account name.
         * If the sender is an account name it will get the payment directly.
         * If the sender is a public key the payment will be marked as rejected by setting the time parameter to 0.
         *
         * @param to Origin recipient
         * @param id Id of the payment
         */
        ACTION reject(const name& to, const uint64_t id) {
            require_auth(to);

            // Find entry
            pay2name_table _pay2name(get_self(), to.value);
            auto itr = _pay2name.find(id);
            check(itr != _pay2name.end(), "Entry does not exist.");

            if (itr->type == Conversion::PaymentType::checked_vote) {
                // Change amount on public vote entry
                voteReject(itr->memo, itr->orisent);
            }

            // Reject the payment
            if (itr->from.size() == 8) {
                // Get name of the sender
                const uint64_t* nameValue = (const uint64_t*)(itr->from.data());
                name from(*nameValue);

                // Get released RAM amount
                auto freeRAM = getRamForPayment(get_self(), true, true, itr->contract, itr->fund.symbol, itr->memo);

                // Pay back and handle RAM
                sendTokenHandleRAM(get_self(), to, itr->ramBy, from, itr->contract, itr->fund, "Pay back", freeRAM);

                // Delete entry
                eraseItr(get_self(), _pay2name, itr, to);
            }
            else
            {
                check(itr->time != 0, "The payment has already been rejected.");    // Check only rejected, all other possibilities should still be available

                // Set the payment open to pay back
                if (itr->ramBy != get_self()) {
                    // Check if fund is system token, buy needed RAM and reduce the fund amount accordingly
                    if (itr->contract == System_Token_Contract && itr->fund.symbol == System_Symbol) {
                        // Get RAM for this entry
                        uint32_t neededRAM = getRamForPayment(get_self(), false, true, itr->contract, itr->fund.symbol, itr->memo, false);

                        // Return the RAM to the offerer and buy the needed RAM from the fund amount
                        asset fund = itr->fund;
                        freeRamUsage(get_self(), itr->ramBy, to, neededRAM);
                        buyRamAndReduceFund(get_self(), itr->contract, neededRAM, fund);

                        check(fund.amount > 0, "Fund is too small to buy the RAM for it.");

                        // Delete table entry if there are no funds left otherwise edit the entry
                        _pay2name.modify(itr, get_self(), [&](auto& p) {
                            p.time = 0;             // Set the payment open to pay back
                            p.fund = fund;
                            p.ramBy = get_self();
                        });
                    }
                    else
                    {
                        check(false, "Cannot extend this token for a public key payment sender.");
                    }
                }
                else
                {
                    _pay2name.modify(itr, get_self(), [&](auto& p) {
                        p.time = 0;             // Set the payment open to pay back
                    });
                }
            }
        }

        /**
         * @brief Reject a payment to the sender where the recipient is a public key.
         * If the sender is an account name it will get the payment directly.
         * If the sender is a public key the payment will be marked as rejected by setting the time parameter to 0.
         *
         * @param to Origin recipient
         * @param id Id of the payment
         * @param sigtime Time stamp of the signature
         * @param sig Signature of "{Chain id} {name of this contract} reject {name of from or public key in hex format of from} {id} {sigtime}"
         */
        ACTION rejectsig(const public_key& to, const uint64_t id, const uint32_t sigtime, const signature& sig) {
            check(eosio::current_time_point().sec_since_epoch() - sigtime < expirationTime, "The transaction is expired.");

            // Find entry
            uint64_t scope;
            auto to_vec = Conversion::GetVectorFromPubKeySplitFormat(to, scope);
            pay2key_table _pay2key(get_self(), scope);
            auto itr = _pay2key.find(id);

            // Check the parameters
            check(itr != _pay2key.end(), "Entry does not exist.");
            check(itr->to == to_vec, "Wrong public key."); // Check the recipient
            int32_t neededRam(0);
            string from_str;

            if (itr->type == Conversion::PaymentType::checked_vote) {
                // Change amount on public vote entry
                if (itr->time == 1) {
                    voteRejectFinalized(itr->memo, itr->orisent);   // If vote is already finalized
                }
                else {
                    voteReject(itr->memo, itr->orisent);
                }
            }

            // Reject the payment
            if (itr->from.size() == 8) {
                // Get name of the sender
                const uint64_t* nameValue = (const uint64_t*)(itr->from.data());
                name from(*nameValue);
                from_str = from.to_string();

                // Get released RAM amount
                auto freeRAM = getRamForPayment(get_self(), true, false, itr->contract, itr->fund.symbol, itr->memo);

                // Pay back including the RAM
                sendWithRAM(get_self(), from, itr->contract, itr->fund, "Pay back", freeRAM);

                // Delete entry
                eraseItr(get_self(), _pay2key, itr);
            }
            else
            {
                check(itr->time != 0, "The payment has already been rejected.");    // Check only rejected, all other possibilities should still be available

                // Set the payment open to pay back
                _pay2key.modify(itr, get_self(), [&](auto& p) {
                    p.time = 0;
                });

                from_str = Conversion::vec_to_hex(itr->from);
            }

            // Check the signature with the recipient of the payment
            string checkStr;
            checkStr.append(chainIDAndContractName).append(" reject ").append(from_str).append(" ").append(std::to_string(id)).append(" ").append(std::to_string(sigtime));
            const checksum256 digest = sha256(&checkStr[0], checkStr.size());
            assert_recover_key(digest, sig, to); // breaks if the signature doesn't match
        }

        /**
         * @brief Finalize a payment early where the sender is an account name.
         * If the recipient is an account name it will get the payment directly.
         * If the recipient is a public key the payment will be marked as finalized early by setting the time parameter to 1.
         *
         * @param to Origin recipient
         * @param id Id of the payment
         */
        ACTION finalize(const string& to, const uint64_t id) {
            if (to.size() <= 13) {
                // Recipient is a name
                name to_name(to);
                // Find entry
                pay2name_table _pay2name(get_self(), to_name.value);
                auto itr = _pay2name.find(id);

                // Check the parameters
                check(itr != _pay2name.end(), "Entry does not exist.");
                checkTime(itr->time);
                check(itr->from.size() == 8, "Wrong sender.");

                // Check authority of the sender
                require_auth(Conversion::vectorToName(itr->from));

                if (itr->type == Conversion::PaymentType::checked_vote) {
                    voteFinalize(itr->memo, itr->orisent);    // Change amount on public vote entry
                }

                // Get released RAM amount
                auto freeRAM = getRamForPayment(get_self(), true, true, itr->contract, itr->fund.symbol, itr->memo);

                // Pay back and handle RAM
                sendTokenHandleRAM(get_self(), to_name, itr->ramBy, to_name, itr->contract, itr->fund, itr->memo, freeRAM);

                // Delete entry
                eraseItr(get_self(), _pay2name, itr, to_name);
            }
            else
            {
                // Recipient is a public key
                public_key to_key = Conversion::String_to_public_key(to);

                // Find entry
                uint64_t scope;
                auto vec_to = Conversion::GetVectorFromPubKeySplitFormat(to_key, scope);
                pay2key_table _pay2key(get_self(), scope);
                auto itr = _pay2key.find(id);

                // Check the parmeters
                check(itr != _pay2key.end(), "Entry does not exist.");
                check(itr->to == vec_to, "Wrong public key."); // Check the recipient
                checkTime(itr->time);
                check(itr->from.size() == 8, "Wrong sender.");

                // Check authority of the sender
                require_auth(Conversion::vectorToName(itr->from));

                if (itr->type == Conversion::PaymentType::checked_vote) {
                    // Change amount on public vote entry
                    voteFinalize(itr->memo, itr->orisent);
                }

                // // Get released RAM amount
                // auto freeRAM = getRamForPayment(get_self(), true, false, itr->contract, itr->fund.symbol, itr->memo);

                // Set the payment as finalized to pay out the recipient.
                _pay2key.modify(itr, get_self(), [&](auto& p) {
                    p.time = 1;
                });
            }
        }

        /**
         * @brief Finalize a payment early where the sender is a public key.
         * If the recipient is an account name it will get the payment directly.
         * If the recipient is a public key the payment will be marked as finalized early by setting the time parameter to 1.
         *
         * @param to Recipient
         * @param id Id of the payment
         * @param sigtime Time stamp of the signature
         * @param sig Signature of "{Chain id} {name of this contract} finalize {name of to or public key of to} {id} {sigtime}"
         */
        ACTION finalizesig(const string& to, const uint64_t id, const uint32_t sigtime, const signature& sig) {
            auto currentTime = eosio::current_time_point().sec_since_epoch();
            check(currentTime - sigtime < expirationTime, "The transaction is expired.");

            public_key pubkey;
            if (to.size() <= 13) {
                // Origin recipient is a name
                name to_name(to);

                // Find entry
                pay2name_table _pay2name(get_self(), to_name.value);
                auto itr = _pay2name.find(id);

                // Check the parameters
                check(itr != _pay2name.end(), "Entry does not exist.");
                check(itr->from.size() == 34, "Sender is not a public key.");
                checkTime(itr->time);

                if (itr->type == Conversion::PaymentType::checked_vote) {
                    // Change amount on public vote entry
                    voteFinalize(itr->memo, itr->orisent);
                }

                // Get public key of the sender
                pubkey = Conversion::GetPubKeyFromVector(itr->from);

                // Get released RAM amount
                auto freeRAM = getRamForPayment(get_self(), false, true, itr->contract, itr->fund.symbol, itr->memo);

                // Burn the payment and handle RAM
                sendTokenHandleRAM(get_self(), to_name, itr->ramBy, to_name, itr->contract, itr->fund, "Burned", freeRAM);

                // Delete entry
                eraseItr(get_self(), _pay2name, itr, to_name);
            }
            else
            {
                // Recipient is a public key
                public_key to_key = Conversion::String_to_public_key(to);

                // Find entry
                uint64_t scope;
                auto vec_to = Conversion::GetVectorFromPubKeySplitFormat(to_key, scope);
                pay2key_table _pay2key(get_self(), scope);
                auto itr = _pay2key.find(id);

                // Check the parameters
                check(itr != _pay2key.end(), "Entry does not exist.");
                check(itr->from.size() == 34, "Wrong sender.");
                checkTime(itr->time);
                check(itr->to == vec_to, "Wrong public key.");

                if (itr->type == Conversion::PaymentType::checked_vote) {
                    // Change amount on public vote entry
                    voteFinalize(itr->memo, itr->orisent);
                }

                // Get public key of the sender
                pubkey = Conversion::GetPubKeyFromVector(itr->from);

                // // Get released RAM amount
                // auto freeRAM = getRamForPayment(get_self(), false, false, itr->contract, itr->fund.symbol, itr->memo);

                // Set the payment as finalized to pay out the recipient
                _pay2key.modify(itr, get_self(), [&](auto& p) {
                    p.time = 1;
                });
            }

            // Check the signature with the sender of the payment
            string checkStr;
            checkStr.append(chainIDAndContractName).append(" finalize ").append(to).append(" ").append(std::to_string(id)).append(" ").append(std::to_string(sigtime));
            assert_recover_key(sha256(&checkStr[0], checkStr.size()), sig, pubkey);
        }

        /**
         * @brief Invalidate a transaction where the sender is an account name
         *
         * @param to Origin recipient
         * @param id Id of the payment
         */
        ACTION invalidate(const string& to, const uint64_t id) {

            if (to.size() <= 13) {
                // Recipient is a name
                name to_name(to);
                // Find entry
                pay2name_table _pay2name(get_self(), to_name.value);
                auto itr = _pay2name.find(id);

                // Check the parameters. Note: It is nonesense to check the parameter "to" and "time != 0" here
                check(itr != _pay2name.end(), "Entry does not exist.");
                checkTime(itr->time);
                check(itr->from.size() == 8, "Wrong sender.");

                if (itr->type == Conversion::PaymentType::checked_vote) {
                    // Change amount on public vote entry
                    voteInvalidate(itr->memo, itr->orisent);
                }

                // Check authority of the sender
                require_auth(Conversion::vectorToName(itr->from));

                // Get released RAM amount
                auto freeRAM = getRamForPayment(get_self(), true, true, itr->contract, itr->fund.symbol, itr->memo);

                // Pay back and handle RAM
                sendTokenHandleRAM(get_self(), to_name, itr->ramBy, nirvana, itr->contract, itr->fund, "Burned", freeRAM);

                // Delete entry
                eraseItr(get_self(), _pay2name, itr, to_name);
            }
            else
            {
                // Recipient is a public key
                public_key to_key = Conversion::String_to_public_key(to);

                // Find entry
                uint64_t scope;
                auto vec_to = Conversion::GetVectorFromPubKeySplitFormat(to_key, scope);
                pay2key_table _pay2key(get_self(), scope);
                auto itr = _pay2key.find(id);

                // Check the parmeters
                check(itr != _pay2key.end(), "Entry does not exist.");
                check(itr->to == vec_to, "Wrong public key."); // Check the recipient
                checkTime(itr->time);
                check(itr->from.size() == 8, "Wrong sender.");

                if (itr->type == Conversion::PaymentType::checked_vote) {
                    // Change amount on public vote entry
                    voteInvalidate(itr->memo, itr->orisent);
                }

                // Check authority of the sender
                require_auth(Conversion::vectorToName(itr->from));

                // Get released RAM amount
                auto freeRAM = getRamForPayment(get_self(), true, false, itr->contract, itr->fund.symbol, itr->memo);

                // Burn the payment including the RAM
                sendWithRAM(get_self(), nirvana, itr->contract, itr->fund, "Burned", freeRAM);

                // Delete entry
                eraseItr(get_self(), _pay2key, itr);
            }
        }

        /**
         * @brief Sender invalidates a payment where the sender is a public key
         *
         * @param to Origin recipient
         * @param id Id of the payment
         * @param sigtime Time stamp of the signature
         * @param sig Signature of "{Chain id} {name of this contract} invalidate {name or public key of the origin recipient} {id} {sigtime}"
         */
        ACTION invalisig(const string& to, const uint64_t id, const uint32_t sigtime, const signature& sig) {
            auto currentTime = eosio::current_time_point().sec_since_epoch();
            check(currentTime - sigtime < expirationTime, "The transaction is expired.");

            public_key pubkey;
            if (to.size() <= 13) {
                // Origin recipient is a name
                name to_name(to);

                // Find entry
                pay2name_table _pay2name(get_self(), to_name.value);
                auto itr = _pay2name.find(id);

                // Check the parameters
                check(itr != _pay2name.end(), "Entry does not exist.");
                check(itr->from.size() == 34, "Sender is not a public key.");
                checkTime(itr->time);

                if (itr->type == Conversion::PaymentType::checked_vote) {
                    // Change amount on public vote entry
                    voteInvalidate(itr->memo, itr->orisent);
                }

                // Get public key of the sender
                pubkey = Conversion::GetPubKeyFromVector(itr->from);

                // Get released RAM amount
                auto freeRAM = getRamForPayment(get_self(), false, true, itr->contract, itr->fund.symbol, itr->memo);

                // Burn the payment and handle RAM
                sendTokenHandleRAM(get_self(), to_name, itr->ramBy, nirvana, itr->contract, itr->fund, "Burned", freeRAM);

                // Delete entry
                eraseItr(get_self(), _pay2name, itr, to_name);
            }
            else
            {
                // Recipient is a public key
                public_key to_key = Conversion::String_to_public_key(to);

                // Find entry
                uint64_t scope;
                auto vec_to = Conversion::GetVectorFromPubKeySplitFormat(to_key, scope);
                pay2key_table _pay2key(get_self(), scope);
                auto itr = _pay2key.find(id);

                // Check the parameters
                check(itr != _pay2key.end(), "Entry does not exist.");
                check(itr->from.size() == 34, "Wrong sender.");
                checkTime(itr->time);
                check(itr->to == vec_to, "Wrong public key.");

                if (itr->type == Conversion::PaymentType::checked_vote) {
                    // Change amount on public vote entry
                    voteInvalidate(itr->memo, itr->orisent);
                }

                // Get public key of the sender
                pubkey = Conversion::GetPubKeyFromVector(itr->from);

                // Get released RAM amount
                auto freeRAM = getRamForPayment(get_self(), false, false, itr->contract, itr->fund.symbol, itr->memo);

                // Burn the payment including the RAM
                sendWithRAM(get_self(), nirvana, itr->contract, itr->fund, "Burned", freeRAM);

                // Delete entry
                eraseItr(get_self(), _pay2key, itr);
            }

            // Check the signature with the sender of the payment
            string checkStr;
            checkStr.append(chainIDAndContractName).append(" invalidate ").append(to).append(" ").append(std::to_string(id)).append(" ").append(std::to_string(sigtime));
            assert_recover_key(sha256(&checkStr[0], checkStr.size()), sig, pubkey);
        }

        /**
         * @brief Pay off an account name if the time limit is over or the payment is marked as rejected
         * Note: Everyone can execute this transaction
         * @param to Name or public key of the origin recipient as string
         * @param id Id of the payment
         */
        ACTION payoff(const string& to, const uint64_t id) {
            if (to.size() <= 13) {
                name to_name(to);

                pay2name_table _pay2name(get_self(), to_name.value);
                auto itr = _pay2name.find(id);

                if (itr->time == 0) {
                    // Payoff a sender where the sender and recipient is an account name 
                    // Check if from is an account name
                    check(itr->from.size() == 8, "Payment is rejected, but sender is not an account name.");

                    // Get from name and set it as recipient of the payment
                    const uint64_t* nameValue = (const uint64_t*)(itr->from.data());
                    name from(*nameValue);

                    // Get released RAM amount
                    int32_t freeRAM = getRamForPayment(get_self(), true, true, itr->contract, itr->fund.symbol, itr->memo);

                    // Send the payment to the sender and handle RAM
                    sendTokenHandleRAM(get_self(), to_name, itr->ramBy, from, itr->contract, itr->fund, itr->memo, freeRAM);
                }
                else
                {
                    // Payoff a sender where the recipient account name where the sender is an account name or public key
                    // Check if the time has expired
                    check(eosio::current_time_point().sec_since_epoch() > itr->time, "The time limit has not expired, yet.");

                    // Get released RAM amount
                    int32_t freeRAM = getRamForPayment(get_self(), itr->from.size() == 8, true, itr->contract, itr->fund.symbol, itr->memo);

                    // Send the payment to the origin recipient and handle RAM
                    sendTokenHandleRAM(get_self(), to_name, itr->ramBy, to_name, itr->contract, itr->fund, itr->memo, freeRAM);
                }
                // Delete entry
                eraseItr(get_self(), _pay2name, itr, to_name);
            }
            else
            {
                // Payoff a sender where the sender is an account name and the recipient is a public key
                // Find entry
                uint64_t scope;
                public_key to_key = Conversion::String_to_public_key(to);
                auto to_vec = Conversion::GetVectorFromPubKeySplitFormat(to_key, scope);
                pay2key_table _pay2key(get_self(), scope);
                auto itr = _pay2key.find(id);

                check(itr->time == 0, "Payment is not rejected.");
                check(itr->from.size() == 8, "Payment is rejected, but sender is not an account name.");

                // Get from name
                const uint64_t* nameValue = (const uint64_t*)(itr->from.data());
                name from(*nameValue);

                // Get released RAM amount
                int32_t freeRAM = getRamForPayment(get_self(), true, false, itr->contract, itr->fund.symbol, itr->memo);

                // Send the payment to the sender including the RAM
                sendWithRAM(get_self(), from, itr->contract, itr->fund, "Rejected", freeRAM);

                // Delete entry
                eraseItr(get_self(), _pay2key, itr);
            }
        }

        /**
         * @brief Pay off a public key which can be the sender or the recipient
         * Note: Everyone can execute this transaction again for the expirationTime
         * @param to Name or public key of the origin recipient as string
         * @param id Id of the payment
         * @param recipient Recipient of the payment
         * @param sigtime Time stamp of the signature
         * @param sig Signature of "{Chain id} {name of this contract} payoff {name or public key of the origin recipient} {name of the recipient} {id} {sigtime}"
         */
        ACTION payoffsig(const string& to, const uint64_t id, const name& recipient, const uint32_t sigtime, const signature& sig) {
            check(is_account(recipient), "Account does not exist.");
            const uint32_t currentTime = eosio::current_time_point().sec_since_epoch();
            check(currentTime - sigtime < expirationTime, "The transaction is expired.");

            if (to.size() <= 13) {
                // Recipient is a name
                // Pay off the sender of a rejected payment, where the origin recipient is a name and the sender a public key
                name to_name(to);

                // Find entry
                pay2name_table _pay2name(get_self(), to_name.value);
                auto itr = _pay2name.find(id);

                check(itr->time == 0, "Transaction is not rejected.");
                check(itr->from.size() != 8, "Sender is not a key.");

                // Check the signature with the sender of the payment
                string checkStr;
                checkStr.append(chainIDAndContractName).append(" payoff ").append(to).append(" ").append(recipient.to_string()).append(" ").append(std::to_string(id)).append(" ").append(std::to_string(sigtime));
                assert_recover_key(sha256(&checkStr[0], checkStr.size()), sig, Conversion::GetPubKeyFromVector(itr->from));

                // Get released RAM amount
                int32_t freeRAM = getRamForPayment(get_self(), false, true, itr->contract, itr->fund.symbol, itr->memo);

                // Send the payment to the recipient and handle RAM
                sendTokenHandleRAM(get_self(), to_name, itr->ramBy, recipient, itr->contract, itr->fund, itr->memo, freeRAM);

                // Delete entry
                eraseItr(get_self(), _pay2name, itr, to_name);
            }
            else
            {
                // Recipient is a public key
                // Pay off the origin recipient of the payment if the time limit is over, but pay off the sender if the transaction is marked as rejected.
                public_key to_key = Conversion::String_to_public_key(to);

                // Find entry
                uint64_t scope;
                auto to_vec = Conversion::GetVectorFromPubKeySplitFormat(to_key, scope);
                pay2key_table _pay2key(get_self(), scope);
                auto itr = _pay2key.find(id);

                // Select which public key should be used for the signature
                public_key sign_pub_key;
                if (itr->time == 0) {
                    // Pay off sender
                    check(itr->from.size() != 8, "The sender is not a public key.");
                    sign_pub_key = Conversion::GetPubKeyFromVector(itr->from);
                }
                else
                {
                    // Pay off recipient
                    check(currentTime > itr->time, "Time limit is not over.");
                    sign_pub_key = to_key;
                }

                // Check the signature with the recipient of the payment
                string checkStr;
                checkStr.append(chainIDAndContractName).append(" payoff ").append(to).append(" ").append(recipient.to_string()).append(" ").append(std::to_string(id)).append(" ").append(std::to_string(sigtime));
                assert_recover_key(sha256(&checkStr[0], checkStr.size()), sig, sign_pub_key);

                // Get released RAM amount
                int32_t freeRAM = getRamForPayment(get_self(), itr->from.size() == 8, false, itr->contract, itr->fund.symbol, itr->memo);

                // Send payment to recipient including the RAM
                sendWithRAM(get_self(), recipient, itr->contract, itr->fund, itr->memo, freeRAM);

                // Delete entry
                eraseItr(get_self(), _pay2key, itr);
            }
        }

        /**
         * @brief Add vote data to a public list
         *
         * @param holder Vote holder
         * @param vid vote id
         * @param vt recommended time for a vote
         * @param t deadline for invalidations
         * @param rtoken recommended fund. If zero, them it recommends only the token
         * @param title Title of the vote
         * @param rtcontract Token contract of the recommended token
         * @param options Vote options
         * @param links Links to the channels of the vote holder
         */
        ACTION addvote(const name& ramBy, const string& holder, const uint8_t vid, const uint32_t vt, const uint32_t t, const asset& rtoken, const name rtcontract, const string& title, const vector<string>& voptions, const vector<Link>& links) {
            require_auth(ramBy);
            const name self = get_self();

            // check options
            check(voptions.size() > 1, "Not enough options defined.");
            check(title.length() <= 80, "Title is too long.");

            // check if rtoken with rtcontract is available
            uint32_t ramToOpenEntry(0);
            check(isTokenAcceptedPayIn(self, rtcontract, rtoken.symbol, ramToOpenEntry), "Token is not accepted.");

            // Check time limits
            check(t - vt >= 600, "Finalisation time has to be at least 10 min after the end of the vote.");
            const uint32_t currentTime = eosio::current_time_point().sec_since_epoch();
            check(vt - currentTime >= 60, "The time for a vote has to be at least 1 min.");
            check(t - currentTime <= 3600 * 24 * 365 * 4, "The time for a vote should be less than 4 years.");

            // Check if the links are valid
            for (Link link : links) {
                check(link.url.length() > 1 && (link.url[0] == '#' || link.url.find('.') != std::string::npos), "URL is invalid.");
            }

            // Create OptionData vector. On default, all int values are initialized with 0
            vector<OptionData> op(voptions.size());
            auto it1 = &voptions[0];
            for (auto opItr = op.begin(); opItr != op.end(); ++opItr) {
                opItr->o = *it1;
                ++it1;
            }

            vector<char> holderVec;

            if (holder.size() > 0) {
                if (holder.size() <= 13) {
                    // Holder is a name
                    name holderName(holder);
                    if (ramBy != holderName) {
                        holderVec = Conversion::nameToVector(holderName);
                    }
                }
                else
                {
                    // Holder is a public key
                    public_key holder_key = Conversion::String_to_public_key(holder);
                    holderVec = Conversion::GetVectorFromPubKey(holder_key);
                }
            }

            // Add entry, while the holder is the RAM payer
            votes_table _vote(self, self.value);
            _vote.emplace(ramBy, [&](auto& p) {
                p.index = _vote.available_primary_key();
                p.ramBy = ramBy;
                p.holder = holderVec;
                p.vt = vt;
                p.vid = vid;
                p.t = t;
                p.rtoken = rtoken;
                p.title = title;
                p.rtcontract = rtcontract;
                p.options = op;
                p.links = links;
            });
        }

        /**
         * @brief Remove vote from a public list. This can only be done after the deadline has end or if there is no active payment.
         *
         * @param ramBy Ram payer of this entry
         * @param index Primary key of the vote entry
         */
        ACTION removevote(const name& ramBy, const uint64_t index) {
            require_auth(ramBy);

            // Get entry
            votes_table _vote(get_self(), get_self().value);
            auto itr = _vote.find(index);

            // Check the parameters
            check(itr != _vote.end(), "Entry does not exist.");
            check(itr->ramBy == ramBy, "Wrong entry owner.");
            if (itr->a > 0) {
                const uint32_t currentTime = eosio::current_time_point().sec_since_epoch();
                check(itr->t < currentTime, "Time is not over, yet.");
            }

            // remove entry
            _vote.erase(itr);
        }

        /**
         * @brief Send system or/and contract token to the recipient.
         *
         * @param self Thsi contract
         * @param to Origin recipient of the payment
         * @param ramBy Offerer of the RAM which is listed on RAM table, otherwise it is this contract name
         * @param recipient Recipient of the funds
         * @param token_contract Contract of the token
         * @param fund System or contract token fpr the recipient
         * @param memo Memo for the transaction to the recipient
         * @param freeRAM Amount of RAM which will be available after erasing the payment entry
         */
        static void sendTokenHandleRAM(const name& self, const name& to, const name& ramBy, const name& recipient, const name& token_contract, const asset& fund, const string& memo, const int32_t freeRAM);

        /**
         * @brief Send system or/and contract token to the recipient. Open contract token entry if there is no one yet. Rest of free RAM will be sold and send as system token to the recipient.
         *
         * @param self This contract
         * @param recipient Recipient of the token and system token by RAM selling
         * @param token_contract Contract of the token
         * @param fund Token for the recipient
         * @param memo Memo for the transaction to the recipient
         * @param freeRAM Amount of RAM which will be available after erasing the payment entry
         */
        static void sendWithRAM(const name& self, const name& recipient, const name& token_contract, const asset& fund, const string& memo, int freeRAM);

        /**
         * @brief Send system token to the recipient with the fund from selling an amount of RAM
         *
         * @param self This contract
         * @param ramBytes Bytes of RAM which sould be sold
         * @param recipient Recipient of the funds
         * @param system_token_fund System token for the recipient without considering the RAM
         * @param memo Memo for the transaction to the recipient
         */
        static void sendRamAndSysFundDirect(const name& self, const uint32_t ramBytes, const name& recipient, asset system_token_fund, const string& memo) {
            if (ramBytes > 0) {
                system_token_fund.amount += EosioHandler::calcSellRamPrice(ramBytes);
                EosioHandler::sellram(self, ramBytes);
            }
            if (system_token_fund.amount > 0) {
                EosioHandler::transfer(self, recipient, system_token_fund, memo);
            }
        }

        /**
         * @brief Handle the RAM after deleting the last entry of a scope by sending it back to RAM table
         *
         * @param self This contract
         * @param to Origin recipient of the payment
         * @return true if the RAM was returned to the RAM offerer, false if no suitable offerer was found
         */
        static inline bool scopeRamForOfferer(const name& self, const name& to);

        /**
         * @brief Handle the RAM after deleting the last entry of a scope by sending it back to RAM table otherwise to nirvana
         *
         * @param self This contract
         * @param to Origin recipient of the payment
         */
        static void handleScopeRam(const name& self, const name& to);
        /**
         * @brief Send the RAM to nirvana after deleting the last entry of a scope
         *
         * @param self This contract
         */
        static void handleScopeRam(const name& self);

        /**
         * @brief Check if the table is empty and handle the remaining RAM
         *
         * @param self This contract
         * @param table Pay2name table with selected scope
         * @param itr Selected iterator
         * @param to Origin recipient of the payment
         */
        static inline void eraseItr(const name& self, pay2name_table& table, pay2name_table::const_iterator& itr, const name& to);
        /**
         * @brief Check if the table is empty and handle the remaining RAM
         *
         * @param self This contract
         * @param table Pay2key table with selected scope
         * @param itr Selected iterator
         */
        static inline void eraseItr(const name& self, pay2key_table& table, pay2key_table::const_iterator& itr);

        /**
         * @brief Payoff all system tokens to an public key by creating an account for the recipient.
         * Note: Because eos accounts cannot be deleted there is no further parameters for signature checking needed
         * @param to Public key of the origin recipient which is used for the signature as well
         * @param user_pub_key Public key of the new account
         * @param user_name Name of the new account already exists
         * @param sigtime Time stamp of the signature
         * @param sig Signature of "{Chain id} {name of this contract} payoff new acc {public key in hex format of the new account} {name of the new account} {sigtime}"
         */
        ACTION payoffnewacc(const public_key& to, const public_key& user_pub_key, const name& user_name, const uint32_t sigtime, const signature& sig) {
            check(!is_account(user_name), "Account already exists.");
            const uint32_t currentTime = eosio::current_time_point().sec_since_epoch();
            check(currentTime - sigtime < expirationTime, "The transaction is expired.");

            uint64_t scope;
            auto to_vec = Conversion::GetVectorFromPubKeySplitFormat(to, scope);
            pay2key_table _pay2key(get_self(), scope);

            // Check the signature with the recipient of the payment
            string checkStr;
            checkStr.append(chainIDAndContractName).append(" payoff new acc ").append(Conversion::vec_to_hex(Conversion::GetVectorFromPubKey(user_pub_key))).append(" ").append(user_name.to_string()).append(" ").append(std::to_string(sigtime));
            const checksum256 digest = sha256(&checkStr[0], checkStr.size());
            assert_recover_key(digest, sig, to); // breaks if the signature doesn't match

            // Get and remove all available system token balances for this key and get the free RAM
            asset fund(0, System_Symbol);
            int32_t freeRAM = getAndRemovesExpiredBalancesOfKey(to, System_Token_Contract, fund, currentTime, get_self());

            // RAM for recieving the first system token
            uint32_t ram_open_system_token(0);
            isTokenAcceptedPayOut(get_self(), System_Token_Contract, System_Symbol, ram_open_system_token);
            freeRAM -= ram_open_system_token;

            // Sell or buy RAM
            buyOrSellRam(get_self(), fund, freeRAM);

            // Create new account
            buyAccount(get_self(), user_pub_key, user_name, fund);

            // Send amount to new account
            EosioHandler::transfer(get_self(), user_name, fund, "Pay off all system tokens.");
    }

        /**
         * @brief Buy or sell RAM depending on the sign.
         *
         * @param self This contract
         * @param fund Amount of system token which will be added for selling the RAM amount or substracted for buying the RAM amount
         * @param bytes Positive amount of bytes to buy RAM, negative amount to sell RAM.
         */
        static void buyOrSellRam(const name& self, asset& fund, const int32_t bytes) {
            if (bytes > 0) {
                fund.amount += EosioHandler::calcSellRamPrice(bytes);
                EosioHandler::sellram(self, bytes);
            }
            else if (bytes < 0) {
                int32_t neededRAM(-bytes);
                fund.amount -= EosioHandler::calcRamPrice(neededRAM);
                EosioHandler::buyrambytes(self, self, neededRAM);
            }
        }

        /**
         * @brief Pay off all expired token
         *
         * @param to Recipient of the token
         * @param token_contract Contract of the token
         * @param token_symbol Symbol of the token
         * @param memo Memo on pay off
         */
        ACTION payoffall(const name& to, const name& token_contract, const symbol& token_symbol, const string& memo) {
            auto currentTime = eosio::current_time_point().sec_since_epoch();
            asset fund(0, token_symbol);
            int32_t freeRAM = getAndRemovesExpiredBalancesOfName(to, token_contract, fund, currentTime, get_self());
            sendWithRAM(get_self(), to, token_contract, fund, memo, freeRAM);
        }

        /**
         * @brief Payoff all tokens to the account of a public key.
         * Note: There are no id and sender in the signature considered and the recipient has to be an account that already exists. Therefor an timespan to expire the signature earlier is given.
         * @param to Public key of the origin recipient which is used for the signature as well
         * @param token_contract Contract of the token
         * @param token_symbol Symbol of the token
         * @param recipient Recipient of the payment
         * @param memo Memo on pay off
         * @param sigtime Time stamp of the signature
         * @param sig Signature of "{Chain id} {name of this contract} payoff all {token contract name} {token symbol precision,name} {name of the recipient} {memo} {sigtime}"
         */
        ACTION payoffallsig(const public_key& to, const name& token_contract, const symbol& token_symbol, const name& recipient, const string& memo, const uint32_t sigtime, const signature& sig) {
            check(is_account(recipient), "Account does not exist.");
            const uint32_t currentTime = eosio::current_time_point().sec_since_epoch();
            check(currentTime - sigtime < expirationTime, "The transaction is expired.");


            // Check the signature with the recipient of the payment
            string checkStr;
            checkStr.append(chainIDAndContractName).append(" payoff all ").append(token_contract.to_string()).append(" ").append(std::to_string(token_symbol.precision())).append(",").append(token_symbol.code().to_string()).append(" ").append(recipient.to_string()).append(" ").append(memo).append(" ").append(std::to_string(sigtime));
            const checksum256 digest = sha256(&checkStr[0], checkStr.size());
            assert_recover_key(digest, sig, to); // breaks if the signature doesn't match

            // Get and removes all available token balances for this key
            asset fund(0, token_symbol);
            int32_t freeRAM = getAndRemovesExpiredBalancesOfKey(to, token_contract, fund, currentTime, get_self());

            // Send amount to new account
            freeRAM -= openTokenRowAndGetRAM(token_contract, recipient, token_symbol, get_self());
            check(freeRAM >= 0, "Not enough RAM to open token row.");
            if (token_contract == System_Token_Contract) {
                // Token symbol is equal to system symbol. Sell RAM and add it to the payout amount
                fund.amount += EosioHandler::calcSellRamPrice(freeRAM);
                EosioHandler::sellram(get_self(), freeRAM);

                // Send system token to recipient
                EosioHandler::transfer(get_self(), recipient, fund, memo);
            }
            else
            {
                // Token symbol is not equal to system symbol. Sell RAM and send the token symbol and the revenue for the RAM
                freeRAM -= openTokenRowAndGetRAM(System_Token_Contract, recipient, System_Symbol, get_self());
                check(freeRAM >= 0, "Not enough RAM to open system token row.");

                asset sold(0, System_Symbol);
                sold.amount += EosioHandler::calcSellRamPrice(freeRAM);
                EosioHandler::sellram(get_self(), freeRAM);

                // Send system and custom token to recipient
                EosioHandler::transfer(get_self(), recipient, sold, "Pay off the RAM.");
                EosioHandler::transferCustom(get_self(), recipient, fund, memo, token_contract);
            }
        }

        /**
         * @brief Get and removes all available system token balances for a public key origin recipient.
         *
         * @param to_pub_key Key of the origin recipient of the payment
         * @param token_contract Contract of the token
         * @param fund Will be added with all expired payment tokens of its symbol
         * @param currenttime Current unix time stamp
         * @param self This contract
         * @return Amount of RAM which is free by erasing all the expired payments
         */
        static int32_t getAndRemovesExpiredBalancesOfKey(const public_key& to_pub_key, const name& token_contract, asset& fund, const uint32_t currenttime, const name& self);

        /**
         * @brief Get and removes all available system token balances for a name origin recipient.
         *
         * @param to Name of the origin recipient of the payment
         * @param token_contract Contract of the token
         * @param fund Will be added with all expired payment tokens of its symbol
         * @param currenttime Current unix time stamp
         * @param self This contract
         * @return Amount of RAM which is free by erasing all the expired payments without the borrowed RAM of the RAM table
         */
        static int32_t getAndRemovesExpiredBalancesOfName(const name& to, const name& token_contract, asset& fund, const uint32_t currenttime, const name& self);

        /**
         * @brief Open an entry in the contract of a token if it is not already there and return the consumed RAM.
         *
         * @param token_contract Contract of the token
         * @param user User to check
         * @param fund_symbol Symbol of the token
         * @param self This contract
         * @return The amount of RAM which was consumed
         */
        static int32_t openTokenRowAndGetRAM(const name& token_contract, const name& user, const symbol& fund_symbol, const name& self);

        /**
         * @brief Create a new account and buy enough resources for this account.
         *
         * @param self This contract
         * @param pubkey Public key of the new account
         * @param account Name of the new account
         * @param fund Available funds to buy the resources
         */
        void buyAccount(const name& self, const public_key& pubkey, const name& account, asset& fund);

        /**
         * @brief Buy a defined number of RAM bytes and reduce the fund amount accordingly
         *
         * @param self This contract
         * @param token_contract Token contract name of the fund token symbol
         * @param neededRAM Number of RAM bytes to buy
         * @param fund Available funds to buy the resources
         */
        static void buyRamAndReduceFund(const name& self, const name& token_contract, const int32_t neededRAM, asset& fund);


        /**
         * @brief Modify public vote entry for a finalization
         *
         * @param memo Memo form the payments table
         * @param oriSent Originally sent asset amount
         */
        void voteFinalize(const string& memo, uint64_t oriSent) {
            votes_table _vote(get_self(), get_self().value);
            auto vsp = Conversion::GetVoteIndexAndSelected(memo);
            auto v_itr = _vote.find(vsp.index);
            if (v_itr != _vote.end()) {
                _vote.modify(v_itr, same_payer, [&](auto& p) {
                p.a -= oriSent;
                p.f += oriSent;
                p.options[vsp.selected].a -= oriSent;
                p.options[vsp.selected].c += oriSent;
                });
            }
        }

        /**
         * @brief Modify public vote entry for an invalidation
         *
         * @param memo Memo form the payments table
         * @param oriSent Originally sent asset amount
         */
        void voteInvalidate(const string& memo, uint64_t oriSent) {
            votes_table _vote(get_self(), get_self().value);
            auto vsp = Conversion::GetVoteIndexAndSelected(memo);
            auto v_itr = _vote.find(vsp.index);
            if (v_itr != _vote.end()) {
                _vote.modify(v_itr, same_payer, [&](auto& p) {
                p.a -= oriSent;
                p.i += oriSent;
                p.options[vsp.selected].a -= oriSent;
                p.options[vsp.selected].c += oriSent;
                });
            }
        }

        /**
         * @brief Modify public vote entry for a rejection
         *
         * @param memo Memo form the payments table
         * @param oriSent Originally sent asset amount
         */
        void voteReject(const string& memo, uint64_t oriSent) {
            votes_table _vote(get_self(), get_self().value);
            auto vsp = Conversion::GetVoteIndexAndSelected(memo);
            auto v_itr = _vote.find(vsp.index);
            if (v_itr != _vote.end()) {
                _vote.modify(v_itr, same_payer, [&](auto& p) {
                p.a -= oriSent;
                p.r += oriSent;
                p.options[vsp.selected].a -= oriSent;
                p.options[vsp.selected].r += oriSent;
                });
            }
        }

        /**
         * @brief Modify public vote entry for a rejection after finalisation
         *
         * @param memo Memo form the payments table
         * @param oriSent Originally sent asset amount
         */
        void voteRejectFinalized(const string& memo, uint64_t oriSent) {
            votes_table _vote(get_self(), get_self().value);
            auto vsp = Conversion::GetVoteIndexAndSelected(memo);
            auto v_itr = _vote.find(vsp.index);
            if (v_itr != _vote.end()) {
                _vote.modify(v_itr, same_payer, [&](auto& p) {
                p.f -= oriSent;
                p.r += oriSent;
                p.options[vsp.selected].c -= oriSent;
                p.options[vsp.selected].r += oriSent;
                });
            }
        }
        /**
         * @brief Modify public vote entry for a extension after finalisation
         *
         * @param memo Memo form the payments table
         * @param oriSent Originally sent asset amount
         */
        void voteExtendFinalized(const string& memo, uint64_t oriSent) {
            votes_table _vote(get_self(), get_self().value);
            auto vsp = Conversion::GetVoteIndexAndSelected(memo);
            auto v_itr = _vote.find(vsp.index);
            if (v_itr != _vote.end()) {
                _vote.modify(v_itr, same_payer, [&](auto& p) {
                p.f -= oriSent;
                p.a += oriSent;
                p.options[vsp.selected].c -= oriSent;
                p.options[vsp.selected].a += oriSent;
                });
            }
        }

        // Notification of withdrawn and deposited tokens
        [[eosio::on_notify("*::transfer")]] void deposit_system(const name& from, const name& to, const asset& fund, const string& memo) {
            check(fund.is_valid(), "invalid quantity");
            check(fund.amount > 0, "must transfer positive quantity");
            customDeposit(from, to, fund, memo);
        }

        void customDeposit(const name& from, const name& to, const asset& fund, const string& memo) {
            // Filter everything except incoming
            if (from == get_self() || from == receiveSellRamAccount || to != get_self())
                return;

            check(memo.length() > 0, "Empty memo."); // Accept only payments with a memo

            const name& token_contract = get_first_receiver();

            auto p = Conversion::GetParams(memo); // Get all parameters of the memo
            switch (p.actionType) {
            case Conversion::ActionType::PAY:
                check(p.hasTime, "Missing time limit.");
                check(!p.isTimeRelative, "Need an absolute time stamp.");
                if (p.hasFrom) {
                    pay(p.from, p.to, fund, token_contract, p.memo, p.time, p.hasVote);
                }
                else
                {
                    pay(from, p.to, fund, token_contract, p.memo, p.time, p.hasVote);
                }
            break;
            case Conversion::ActionType::RAM:
                check(token_contract == System_Token_Contract && fund.symbol == System_Symbol, "RAM can only be bought via system token");
                check(p.hasTo, "Missing beneficiary.");
                check(p.hasTime, "Missing time parameter.");
                setRam(from, name(p.to), fund, p.time, p.isTimeRelative);
                break;
            case Conversion::ActionType::REJ:
                check(p.hasTo, "Missing origin recipient public key.");
                check(p.hasId, "Missing id.");
                check(p.hasSigTime, "Missing signature time.");
                check(p.hasSignature, "Missing signature.");
                rejectsig(Conversion::String_to_public_key(p.to), p.id, p.sigTime, p.sig);
                break;
            case Conversion::ActionType::FIN:
                check(p.hasTo, "Missing origin recipient.");
                check(p.hasId, "Missing id.");
                check(p.hasSigTime, "Missing signature time.");
                check(p.hasSignature, "Missing signature.");
                finalizesig(p.to, p.id, p.sigTime, p.sig);
                break;
            case Conversion::ActionType::INV:
                check(p.hasTo, "Missing origin recipient.");
                check(p.hasId, "Missing id.");
                check(p.hasSigTime, "Missing signature time.");
                check(p.hasSignature, "Missing signature.");
                invalisig(p.to, p.id, p.sigTime, p.sig);
                break;
            case Conversion::ActionType::OFF:
                check(p.hasTo, "Missing origin recipient.");
                check(p.hasId, "Missing id.");
                check(p.hasSigTime, "Missing signature time.");
                check(p.hasSignature, "Missing signature.");
                check(p.hasRecipient, "Missing recipient account.");
                payoffsig(p.to, p.id, p.recipient, p.sigTime, p.sig);
                break;
            case Conversion::ActionType::ALL:
                check(p.hasTo, "Missing origin recipient public key.");
                check(p.hasSigTime, "Missing signature time time.");
                check(!p.isTimeRelative, "Need an absolute time stamp.");
                check(p.hasSignature, "Missing signature.");
                check(p.hasRecipient, "Missing recipient account.");
                payoffallsig(Conversion::String_to_public_key(p.to), token_contract, fund.symbol, p.recipient, p.memo, p.sigTime, p.sig);
                break;
            case Conversion::ActionType::ACC:
                check(p.hasTo, "Missing origin recipient public key.");
                check(p.hasSigTime, "Missing signature time time.");
                check(p.hasSignature, "Missing signature.");
                check(p.hasRecipient, "Missing recipient account.");
                check(p.hasRecipientPublicKey, "Missing recipient public key.");
                payoffnewacc(Conversion::String_to_public_key(p.to), p.recipientPublicKey, p.recipient, p.sigTime, p.sig);
                break;
            case Conversion::ActionType::EXT:
                check(p.hasTo, "Missing origin recipient public key.");
                check(p.hasId, "Missing id.");
                check(p.hasTime, "Missing time parameter.");
                check(p.hasSigTime, "Missing signature time.");
                check(!p.isTimeRelative, "Need an absolute time stamp.");
                check(p.hasSignature, "Missing signature.");
                extendsig(Conversion::String_to_public_key(p.to), p.id, p.time, p.sigTime, p.sig);
                break;
            default:
                check(false, "Invalid memo.");
            }
        }
};

// Memo parameters ("?" sign for optional parameters):
// from? @to !time ;memo? | :votes?
// RAM@to !time | /relative_time
// FIN@to_pub #id =sig_time ~sig
// EXT@to #id !time =sig_time ~sig
// OFF@to #id =sig_time ~sig +recipient
// ALL@to_pub =sig_time ~sig +recipient
// ACC@to_pub =sig_time ~sig +recipient &recipient_key?

// For votes, the stored memo is predefined.
// It will be send in base58
// [vote type]         (uint8_t)
// [vote id]           (uint8_t)
// [options amount]    (uint8_t)
// [selected option]   (uint8_t)
// [endtime]           (uint32_t)
// [public vote index] (uint64_t)
// [option text] (optional string)
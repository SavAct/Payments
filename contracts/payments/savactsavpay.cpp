#include "savactsavpay.hpp"

void savactsavpay::setRam(const name& from, const name& to, const asset& fund, const uint32_t maxTime, const bool relative) {
    check(from != get_self(), "Can not buy RAM for the contract account.");
    check(is_account(from) && is_account(to), "Account does not exist.");
    require_auth(from);
    check(0 < maxTime, "Time hast to be greater than zero.");
    if (!relative) {
        check(eosio::current_time_point().sec_since_epoch() < maxTime, "Time stamp is already over.");
    }

    // Buy RAM
    int64_t amount = EosioHandler::calcRamBytes(fund.amount);
    EosioHandler::buyram(get_self(), get_self(), fund);


    // Reduce the RAM amount by the needed RAM for the scope of this user if it is the first entry
    ram_table _ram(get_self(), to.value);
    if (_ram.begin() == _ram.end()) {
        amount -= ram_scope;
    }

    auto itr = _ram.find(from.value);

    if (itr == _ram.end()) {
        amount -= ram_ram_entry;   // Remove the amount for this entry
        check(amount >= ram_system_token_open_entry, "The amount is too low.");   // Minimum amount for an entry in RAM table
        // Create a new entry
        _ram.emplace(get_self(), [&](auto& p) {
            p.from = from;
            p.amount = amount;
            p.free = amount;
            p.relative = relative;
            p.maxTime = maxTime;
            });
    }
    else
    {
        // Modify an entry
        _ram.modify(itr, get_self(), [&](auto& p) {
            p.amount += amount;
            p.free += amount;
            p.maxTime = maxTime;
            p.relative = relative;
            });
    }
}

ACTION savactsavpay::removeram(const name& from, const name& to) {
    check(has_auth(from) || has_auth(to), "You have no right to remove this entry.");

    // Find the entry
    ram_table _ram(get_self(), to.value);
    auto itr = _ram.find(from.value);
    check(itr != _ram.end(), "Entry does not exist.");

    // Remove the free amount from RAM table
    uint64_t ram_to_sell = itr->free;
    if (itr->amount != itr->free) {
        _ram.modify(itr, get_self(), [&](auto& p) {
            p.amount -= itr->free;
            p.free = 0;
            });
    }
    else
    {
        _ram.erase(itr);
        ram_to_sell += ram_ram_entry;
    }


    // Calc the nirvana amount for selling the RAM of the scope if this was the last entry
    asset refund(0, System_Symbol);
    if (!hasScope(_ram)) {
        ram_to_sell += ram_scope;
        refund.amount = EosioHandler::calcSellRamPrice(ram_to_sell);
        asset scope_refund((refund.amount * ram_scope) / ram_to_sell, System_Symbol);
        EosioHandler::transfer(get_self(), nirvana, scope_refund, "For last scope");
        refund.amount -= scope_refund.amount;
    }
    else {
        refund.amount = EosioHandler::calcSellRamPrice(ram_to_sell);
    }

    // Sell the RAM
    EosioHandler::sellram(get_self(), ram_to_sell);

    // Send to owner
    EosioHandler::checkOpenTokenRow(System_Token_Contract, from, refund.symbol);
    EosioHandler::transfer(get_self(), from, refund, "RAM sold");
}

ACTION savactsavpay::settoken(const name& tokenContract, const symbol& tokenSymbol, const uint32_t openBytes, bool active) {
    require_auth(get_self());
    check(is_account(tokenContract), "Contract does not exists.");
    tokens_table _tokens_table(get_self(), tokenContract.value);

    auto itr = _tokens_table.find(tokenSymbol.raw());

    if (itr == _tokens_table.end()) {
        // Create a new entry
        _tokens_table.emplace(get_self(), [&](auto& p) {
            p.token = tokenSymbol;
            p.openBytes = openBytes;
            p.active = active;
            });
    }
    else
    {
        // Modify an entry
        _tokens_table.modify(itr, get_self(), [&](auto& p) {
            p.openBytes = openBytes;
            p.active = active;
            });
    }
}

ACTION savactsavpay::removetoken(const name& tokenContract, const symbol& tokenSymbol) {
    require_auth(get_self());
    tokens_table _tokens_table(get_self(), tokenContract.value);

    auto itr = _tokens_table.find(tokenSymbol.raw());

    check(itr != _tokens_table.end(), "Token does not exists.");
    _tokens_table.erase(itr);
}

uint32_t savactsavpay::getRamForPayment(const name& self, bool isName_From, bool isName_To, const name& token_contract, const symbol& sym, const string& memo, const bool forPayIn) {
    uint32_t ramToOpenEntry(0);
    if (forPayIn) {
        check(isTokenAcceptedPayIn(self, token_contract, sym, ramToOpenEntry), "Token is not accepted.");
    }
    else {
        check(isTokenAcceptedPayOut(self, token_contract, sym, ramToOpenEntry), "Token is not accepted.");
    }

    uint32_t neededRAM(getStringStorageSize(memo));
    if (isName_To) {
        neededRAM += isName_From ? ram_pay2name_entry_from_name : ram_pay2name_entry_from_key;
    }
    else
    {
        neededRAM += isName_From ? ram_pay2key_entry_from_name : ram_pay2key_entry_from_key;
    }

    if (neededRAM < ramToOpenEntry) {
        neededRAM = ramToOpenEntry;
    }
    return neededRAM;
}

void savactsavpay::pay(const name& from, const string& to, asset fund, const name& token_contract, const string& memo, const uint32_t time, const bool is_vote) {
    pay(getSenderVecFrom(from), to, fund, token_contract, memo, time, is_vote);
}

void savactsavpay::pay(const string& from, const string& to, asset fund, const name& token_contract, const string& memo, const uint32_t time, const bool is_vote) {
    pay(getSenderVecFrom(from), to, fund, token_contract, memo, time, is_vote);
}

void savactsavpay::pay(const vector<char>& fromVec, const string& to, asset fund, const name& token_contract, const string& memo, const uint32_t time, const bool is_vote) {
    uint64_t orisent = fund.amount;
    auto currentTime = eosio::current_time_point().sec_since_epoch();
    check(time > currentTime, "The mentioned time is already over.");

    bool isName_To = to.length() <= 13;
    bool isName_From = fromVec.size() <= 13;

    // Consider the maximal amount of RAM which could be needed for all options and check if token is accepted
    auto neededRAM = getRamForPayment(get_self(), isName_From, isName_To, token_contract, fund.symbol, memo, true);

    PaymentType pT = is_vote ? PaymentType::vote : PaymentType::payment;

    // Switch between name or key recipient
    if (isName_To) {
        // Recipient is a name
        name to_name(to);
        uint64_t to_scope = to_name.value;
        check(is_account(to_name), "Recipient does not exists.");

        pay2name_table _pay2name(get_self(), to_name.value);
        ram_table _ram(get_self(), to_scope);

        // Add the extra RAM for the first entry
        if (!hasScope(_pay2name)) {
            neededRAM += ram_scope;
        }

        // Search for a free RAM payer for this recipient
        auto itr = getFreeRAMPayer(neededRAM, time, currentTime, _ram);

        // Get new index
        uint64_t index = nextNameIndex(get_self(), to_name);
        name ram_payer;
        if (itr == _ram.end()) {
            // The first entry on data table needs RAM which will never be withdrawel
            if (index == 0) {
                neededRAM += ram_data_entry;
            }

            // RAM will be payed by the funds
            ram_payer = get_self();
            // Check if fund is system token, buy needed RAM and reduce the fund amount accordingly
            buyRamAndReduceFund(get_self(), token_contract, neededRAM, fund);
        }
        else
        {
            // The first entry on data table needs RAM which will never be withdrawn
            if (index == 0) {
                auto itr_never_back = getFreeRAMPayer(ram_data_entry, currentTime, currentTime, _ram);
                _ram.modify(itr_never_back, get_self(), [&](auto& p) {
                    p.amount -= ram_data_entry;
                    p.free -= ram_data_entry;
                    });
            }

            // Set the recipient as RAM payer by mentioning the RAM offerer
            ram_payer = itr->from;

            // Set the needed RAM amount of the offerer as used
            setRamUsage(get_self(), neededRAM, _ram, itr);

            // neededRAM = 0; // Not necessary 
        }

        // Add payment to table
        addpayment(_pay2name, index, fromVec, to_name, fund, orisent, token_contract, memo, time, ram_payer, pT);
    }
    else
    {
        // Recipient is a key
        auto to_key = Conversion::String_to_public_key(to);

        // Get scope and rest of the key
        uint64_t to_scope;
        auto to_vec = Conversion::GetVectorFromPubKeySplitFormat(to_key, to_scope);
        pay2key_table _pay2key(get_self(), to_scope);

        // Add the extra RAM for the first entry
        if (!hasScope(_pay2key)) {
            neededRAM += ram_scope;
        }

        // Get new index
        uint64_t index = nextKeyIndex(get_self(), to_scope);

        // The first entry on data table needs RAM which will never be withdrawel
        if (index == 0) {
            neededRAM += ram_data_entry;
        }

        // Check if fund is system token, buy needed RAM and reduce the fund amount accordingly
        buyRamAndReduceFund(get_self(), token_contract, neededRAM, fund);

        // Add payment to table
        addpayment(_pay2key, index, fromVec, to_vec, fund, orisent, token_contract, memo, time, get_self(), pT);
    }
}

void savactsavpay::setRamUsage(const name& self, const uint32_t used, ram_table& _ram, const ram_table::const_iterator& itr) {
    _ram.modify(itr, self, [&](auto& p) {
        p.free -= used;
        });
}

void savactsavpay::sendTokenHandleRAM(const name& self, const name& to, const name& ramBy, const name& recipient, const name& token_contract, const asset& fund, const string& memo, const int32_t freeRAM) {
    if (ramBy == self) {
        sendWithRAM(self, recipient, token_contract, fund, memo, freeRAM);
    }
    else
    {
        // RAM which is offered by RAM table can not be used to open a token entry
        EosioHandler::checkOpenTokenRow(token_contract, recipient, fund.symbol);
        EosioHandler::transferCustom(self, recipient, fund, memo, token_contract);

        // Add RAM back to table
        freeRamUsage(self, ramBy, to, freeRAM);
    }
}

bool savactsavpay::scopeRamForOfferer(const name& self, const name& to) {
    // Find the last RAM offerer and send him this RAM amount
    ram_table _ram(self, to.value);
    for (auto itr = _ram.begin(); itr != _ram.end(); ++itr) {
        if (itr->amount - itr->free == ram_scope) {
            _ram.modify(itr, self, [&](auto& p) {
                p.free += ram_scope;
                });
            return true;
        }
    }
    return false;
}

void savactsavpay::handleScopeRam(const name& self, const name& to) {
    // Find the last RAM offerer and send him this RAM amount
    if (!scopeRamForOfferer(self, to)) {
        // Otherwise sell and send it to nirvana
        sendRamAndSysFundDirect(self, ram_scope, nirvana, asset(0, System_Symbol), std::string("Rest of RAM"));
    }
}

void savactsavpay::handleScopeRam(const name& self) {
    sendRamAndSysFundDirect(self, ram_scope, nirvana, asset(0, System_Symbol), std::string("Rest of RAM"));
}

void savactsavpay::eraseItr(const name& self, pay2name_table& table, pay2name_table::const_iterator& itr, const name& to) {
    table.erase(itr);
    if (!hasScope(table)) {
        handleScopeRam(self, to);
    }
}

void savactsavpay::eraseItr(const name& self, pay2key_table& table, pay2key_table::const_iterator& itr) {
    table.erase(itr);
    if (!hasScope(table)) {
        handleScopeRam(self);
    }
}

void savactsavpay::sendWithRAM(const name& self, const name& recipient, const name& token_contract, const asset& fund, const string& memo, int32_t freeRAM) {
    // If the account has not an entry for the token, then create one
    freeRAM -= openTokenRowAndGetRAM(token_contract, recipient, fund.symbol, self);
    check(freeRAM >= 0, "Not enough RAM to open token row.");

    if (token_contract != System_Token_Contract || fund.symbol != System_Symbol) {
        // Is not the system token
        // Send the fund of the custom token
        EosioHandler::transferCustom(self, recipient, fund, memo, token_contract);

        // Check if user has an accounts entry for the system token
        if (EosioHandler::hasOpenTokenRow(System_Token_Contract, recipient, System_Symbol)) {
            // User has a system token row already
            sendRamAndSysFundDirect(self, freeRAM, recipient, asset(0, System_Symbol), memo);
        }
        else
        {
            // User has no system token row, so create one if there is enough RAM
            uint32_t ram_open_system_token(0);
            isTokenAcceptedPayOut(self, System_Token_Contract, System_Symbol, ram_open_system_token);
            if (freeRAM >= ram_open_system_token) {
                // Create system token row for the recipient
                EosioHandler::openToken(System_Token_Contract, recipient, System_Symbol, self);
                freeRAM -= ram_open_system_token;
                check(freeRAM >= 0, "Not enough RAM to open token row.");

                // Send system token from RAM to recipient
                sendRamAndSysFundDirect(self, freeRAM, recipient, asset(0, System_Symbol), std::string("Amount for RAM"));
            }
            else
            {
                // RAM is to low to open a Token row, it will be send to nirvana
                sendRamAndSysFundDirect(self, freeRAM, nirvana, asset(0, System_Symbol), std::string("Rest of RAM"));
            }
        }
    }
    else
    {
        // Token is system token
        sendRamAndSysFundDirect(self, freeRAM, recipient, fund, memo);
    }
}

vector<char> savactsavpay::getSenderVecFrom(const name& user) {
    check(is_account(user), "Sender does not exist.");
    // Convert the name into a char array
    const char* _array = (const char*)&user.value;
    return vector<char>(_array, _array + 8);
}

vector<char> savactsavpay::getSenderVecFrom(const string& user) {
    // Get sender as vector
    if (user.size() <= 13) {
        // Sender is a name
        name _name(user);
        check(is_account(_name), "Sender does not exist.");
        return getSenderVecFrom(_name);
    }
    else
    {
        // Sender is a public key
        public_key _key = Conversion::String_to_public_key(user);
        return Conversion::GetVectorFromPubKey(_key);
    }
}

int32_t savactsavpay::openTokenRowAndGetRAM(const name& token_contract, const name& user, const symbol& fund_symbol, const name& self) {
    // Check if user has not an accounts entry for the contract token
    if (!EosioHandler::hasOpenTokenRow(token_contract, user, fund_symbol)) {
        EosioHandler::openToken(token_contract, user, fund_symbol, self);
        uint32_t bytes(0);
        isTokenAcceptedPayOut(self, token_contract, fund_symbol, bytes);
        return bytes;
    }
    return 0;
}

bool savactsavpay::isTokenAcceptedPayOut(const name& self, const name& token_contract, const symbol& tokensymbol) {
    tokens_table _tokens_table(self, token_contract.value);
    return _tokens_table.find(tokensymbol.raw()) != _tokens_table.end();
}

bool savactsavpay::isTokenAcceptedPayOut(const name& self, const name& token_contract, const symbol& tokensymbol, uint32_t& rambytes) {
    tokens_table _tokens_table(self, token_contract.value);
    auto itr = _tokens_table.find(tokensymbol.raw());
    if (itr != _tokens_table.end()) {
        rambytes = itr->openBytes;
        return true;
    }
    return false;
}

bool savactsavpay::isTokenAcceptedPayIn(const name& self, const name& token_contract, const symbol& tokensymbol, uint32_t& rambytes) {
    tokens_table _tokens_table(self, token_contract.value);
    auto itr = _tokens_table.find(tokensymbol.raw());
    if (itr != _tokens_table.end()) {
        rambytes = itr->openBytes;
        return itr->active;
    }
    return false;
}

void savactsavpay::addpayment(pay2name_table& table, const uint64_t index, const vector<char>& from, const name& to, const asset& fund, const uint64_t orisent, const name& token_contract, const string& memo, const uint32_t time, const name& ram_payer, const PaymentType& type) {
    check(memo.size() < 256, "Memo is too long.");
    check(fund.amount > 0, "Fund is too small.");

    // Create a new entry
    table.emplace(get_self(), [&](auto& p) {
        p.id = index;
        p.from = from;        // from = std::vector<char>(from_key.begin(), &from_key[PubKeyWithoutPrimarySize]);		
        p.fund = fund;
        p.orisent = orisent;
        p.contract = token_contract;
        p.time = time;
        p.memo = memo;
        p.ramBy = ram_payer;
        p.type = type;
        });
}

void savactsavpay::addpayment(pay2key_table& table, const uint64_t index, const vector<char>& from, const vector<char>& to_vec, const asset& fund, const uint64_t orisent, const name& token_contract, const string& memo, const uint32_t time, const name& ram_payer, const PaymentType& type) {
    check(memo.size() < 256, "Memo is too long.");
    check(fund.amount > 0, "Fund is too small.");

    // Create a new entry
    table.emplace(get_self(), [&](auto& p) {
        p.id = index;
        p.to = to_vec;
        p.from = from;        // from = std::vector<char>(from_key.begin(), &from_key[PubKeyWithoutPrimarySize]);		
        p.fund = fund;
        p.orisent = orisent;
        p.contract = token_contract;
        p.time = time;
        p.memo = memo;
        p.ramBy = ram_payer;
        p.type = type;
        });
}

bool savactsavpay::isFreeRAMPayer(const uint64_t neededRam, const uint32_t time, const uint32_t currentTime, const ram_table& _ram, const ram_table::const_iterator& itr) {
    if (neededRam <= itr->free) {
        if (itr->relative) {
            if (time - currentTime <= itr->maxTime) {
                return true;
            }
        }
        else
        {
            if (time <= itr->maxTime) {
                return true;
            }
        }
    }
    return false;
}

savactsavpay::ram_table::const_iterator savactsavpay::getFreeRAMPayer(const uint64_t neededRam, const uint32_t time, const uint32_t currentTime, const ram_table& _ram) {
    // Search for a free ram payer for this recipient
    auto itr = _ram.begin();
    while (itr != _ram.end()) {
        if (isFreeRAMPayer(neededRam, time, currentTime, _ram, itr)) {
            break;
        }
        ++itr;
    }
    return itr;
}

void savactsavpay::freeRamUsage(const name& self, const name& from, const name& to, const uint32_t free) {
    ram_table _ram(self, to.value);
    freeRamUsage(self, from, to, free, _ram);
}

void savactsavpay::freeRamUsage(const name& self, const name& from, const name& to, const uint32_t free, ram_table& _ram) {
    auto itr = _ram.find(from.value);
    check(itr != _ram.end(), "RAM entry does not exist!");  // This cannot happen, just for double checking
    freeRamUsage(self, free, _ram, itr);
}

void savactsavpay::freeRamUsage(const name& self, const uint32_t free, ram_table& _ram, const ram_table::const_iterator& itr) {
    _ram.modify(itr, self, [&](auto& p) {
        p.free += free;
        });
}

name savactsavpay::changeRamOfferer(const name& self, const name& to, const pay2name_table::const_iterator& itr, uint32_t time) {
    if (itr->ramBy != self) {
        // Get RAM amount
        auto usedRAM = getRamForPayment(self, itr->from.size() == 8, true, itr->contract, itr->fund.symbol, itr->memo);

        // Check time of old offerer (check for relative time and absolut time)
        ram_table _ram(self, to.value);
        auto byRam_itr = _ram.find(itr->ramBy.value);
        auto currentTime = eosio::current_time_point().sec_since_epoch();
        if (!isFreeRAMPayer(0, time, currentTime, _ram, byRam_itr))     // For the current offerer is the needed RAM 0 and just the time will be checked
        {
            // Search for a new free RAM payer for this recipient
            auto newRamBy_itr = getFreeRAMPayer(usedRAM, time, currentTime, _ram);
            check(newRamBy_itr != _ram.end(), "No RAM payer for this time span.");

            // Free RAM of previous RAM payer
            freeRamUsage(self, usedRAM, _ram, byRam_itr);
            // Set RAM of new RAM payer as in use 
            setRamUsage(self, usedRAM, _ram, newRamBy_itr);

            return newRamBy_itr->from;
        }
    }
    return itr->ramBy;
}

int32_t savactsavpay::getAndRemovesExpiredBalancesOfKey(const public_key& to_pub_key, const name& token_contract, asset& fund, const uint32_t currenttime, const name& self) {
    // Get table
    uint64_t scope;
    auto to_vec = Conversion::GetVectorFromPubKeySplitFormat(to_pub_key, scope);
    pay2key_table _pay2key(self, scope);

    // Find each expired entry and sum up the funds and RAM which will be free
    int32_t freeRAM(0);
    auto itr = _pay2key.begin();
    bool foundEntries = false;
    while (itr != _pay2key.end()) {
        if (std::equal(to_vec.begin(), to_vec.end(), itr->to.begin()) && itr->fund.symbol == fund.symbol && itr->time != 0 && itr->time < currenttime && itr->contract == token_contract) {
            fund += itr->fund;
            freeRAM += getRamForPayment(self, itr->from.size() == 8, false, token_contract, fund.symbol, itr->memo);
            foundEntries = true;

            itr = _pay2key.erase(itr);
            if (!hasScope(_pay2key)) {
                freeRAM += ram_scope;
            }
        }
        else
        {
            itr++;
        }
    }
    check(foundEntries, "No expired entries.");
    return freeRAM;
}

int32_t savactsavpay::getAndRemovesExpiredBalancesOfName(const name& to, const name& token_contract, asset& fund, const uint32_t currenttime, const name& self) {
    // Get table
    pay2name_table _pay2name(self, to.value);

    // Get RAM table
    ram_table _ram(self, to.value);

    // Find each expired entry and sum up the funds and RAM which will be free
    int32_t freeRAM(0);
    auto itr = _pay2name.begin();
    bool foundEntries = false;
    while (itr != _pay2name.end()) {
        if (itr->fund.symbol == fund.symbol && itr->time != 0 && itr->time < currenttime && itr->contract == token_contract) {
            int tempFree = getRamForPayment(self, itr->from.size() == 8, true, token_contract, fund.symbol, itr->memo);
            if (itr->ramBy != self) {
                auto ram_itr = _ram.find(itr->ramBy.value);
                check(ram_itr != _ram.end(), "RAM entry does not exist.");  // This cannot happen, just for double checking
                _ram.modify(ram_itr, self, [&](auto& p) {
                    p.free += tempFree;
                    });
                if (onlyOneEntry(_pay2name)) {
                    if (!scopeRamForOfferer(self, to)) {
                        freeRAM += ram_scope;
                    }
                }
            }
            else
            {
                freeRAM += tempFree;
                if (onlyOneEntry(_pay2name)) {
                    freeRAM += ram_scope;
                }
            }
            fund += itr->fund;
            itr = _pay2name.erase(itr);
            foundEntries = true;
        }
        else
        {
            itr++;
        }
    }
    check(foundEntries, "No expired entries.");
    return freeRAM;
}

void savactsavpay::buyAccount(const name& self, const public_key& pubkey, const name& account, asset& fund) {
    check(!is_account(account), "The account name is already taken.");

    // remove the cost for a new account
    int64_t ramCostForUser = EosioHandler::calcRamPrice(ramForUser);
    fund.amount -= (netCostForUser + cpuCostForUser + ramCostForUser);
    check(fund.amount > 0, "Not enough amount to create an account.");

    // Create the account
    EosioHandler::createAccount(self, account, pubkey);

    // Stake NET and CPU for the account
    EosioHandler::delegatebw(self, account, asset(netCostForUser, System_Symbol), asset(cpuCostForUser, System_Symbol));

    // Buy RAM for the account
    EosioHandler::buyrambytes(self, account, ramForUser);
}

std::size_t savactsavpay::getStringStorageSize(const string& s) {
    std::size_t len = s.length();
    if (len < 128) {
        return len + 1;
    }
    else if (len < 16384) {
        return len + 2;
    }
    else if (len < 2097151) {
        return len + 3;
    }
    else if (len < 268435455) {
        return len + 4;
    }
    return len + 5;
}

uint64_t savactsavpay::nextNameIndex(const name& self, const name& to_scope_name) {
    data_table _data_table(self, name("name").value);
    auto itr = _data_table.find(to_scope_name.value);
    if (itr == _data_table.end()) {
        _data_table.emplace(self, [&](auto& p) {
            p.scopeId = to_scope_name.value;
            p.nextId = 1;
            });
        return 0;
    }
    else
    {
        uint64_t index(itr->nextId);
        _data_table.modify(itr, self, [&](auto& p) {
            p.nextId++;
            });
        return index;
    }
}
uint64_t savactsavpay::nextKeyIndex(const name& self, const uint64_t to_scope_key) {
    data_table _data_table(self, name("key").value);
    auto itr = _data_table.find(to_scope_key);
    if (itr == _data_table.end()) {
        _data_table.emplace(self, [&](auto& p) {
            p.scopeId = to_scope_key;
            p.nextId = 1;
            });
        return 0;
    }
    else
    {
        uint64_t index(itr->nextId);
        _data_table.modify(itr, self, [&](auto& p) {
            p.nextId++;
            });
        return index;
    }
}

void savactsavpay::checkTime(uint32_t time) {
    if (eosio::current_time_point().sec_since_epoch() > time) {
        check(time != 0, "Payment is already rejected.");
        check(time != 1, "Payment is already finalized.");
        check(false, "Time limit is already expired.");
    }
}

void savactsavpay::buyRamAndReduceFund(const name& self, const name& token_contract, const int32_t neededRAM, asset& fund) {
    check(token_contract == System_Token_Contract && fund.symbol == System_Symbol, "Not enough RAM offered for this recipient.");
    // Buy needed RAM and reduce the fund amount accordingly
    fund.amount -= EosioHandler::calcRamPrice(neededRAM);
    EosioHandler::buyrambytes(self, self, neededRAM);
}
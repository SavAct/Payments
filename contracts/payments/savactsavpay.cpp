#include "savactsavpay.hpp"

void savactsavpay::setRam(const name& from, const name& to, const asset& fund, const uint32_t maxTime, const bool relative){
    check(from != get_self(), "Can not buy RAM for the contract account.");
    check(is_account(from) && is_account(to), "Account does not exist.");

    // Buy RAM
    int64_t amount = EosioHandler::calcRamBytes(fund.amount);
    EosioHandler::buyram(get_self(), get_self(), fund);

    ram_table _ram(get_self(), to.value);
    auto itr = _ram.find(from.value);

    if(!relative){
        check(eosio::current_time_point().sec_since_epoch() < maxTime, "Time stamp is already over.");
    }

    if(itr == _ram.end()) {
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
    } else {
        // Modify an entry
        _ram.modify(itr, get_self(), [&](auto& p) {
            p.amount += amount;
            p.maxTime = maxTime;
            p.relative = relative;
        });
    }
}

ACTION savactsavpay::removeram(const name& from, const name& to){
    check(has_auth(from) || has_auth(to), "You have no right to remove this entry.");

    // Find the entry
    ram_table _ram(get_self(), to.value);
    auto itr = _ram.find(from.value);
    check(itr != _ram.end(), "Entry does not exist.");

    // Remove the free amount from RAM table
    uint64_t ram_to_sell = itr->free;
    if(itr->amount != itr->free){        
        _ram.modify(itr, get_self(), [&](auto& p) {
            p.amount -= itr->free;
            p.free = 0;
        });
    } else {
        _ram.erase(itr);
        ram_to_sell += ram_ram_entry;
    }

    // Sell the RAM
    asset refund(EosioHandler::calcSellRamPrice(ram_to_sell), System_Symbol);
    EosioHandler::sellram(get_self(), ram_to_sell);

    // Send to owner
    EosioHandler::checkOpenTokenRow(System_Token_Contract, from, refund.symbol);
    EosioHandler::transfer(get_self(), from, refund, "RAM sold");
}

ACTION savactsavpay::settoken(name tokenContract, symbol tokenSymbol, uint32_t openBytes){
    require_auth(get_self());
    check(is_account(tokenContract), "Contract does not exists.");
    tokens_table _tokens_table(get_self(), tokenContract.value);

    auto itr = _tokens_table.find(tokenSymbol.raw());

    if(itr == _tokens_table.end()) {
    // Create a new entry
    _tokens_table.emplace(get_self(), [&](auto& p) {
        p.token = tokenSymbol;
        p.openBytes = openBytes;
    });
    } else {
    // Modify an entry
    _tokens_table.modify(itr, get_self(), [&](auto& p) {
        p.openBytes = openBytes;
    });
    }
}

ACTION savactsavpay::removetoken(name tokenContract, symbol tokenSymbol){
    require_auth(get_self());
    tokens_table _tokens_table(get_self(), tokenContract.value);

    auto itr = _tokens_table.find(tokenSymbol.raw());

    check(itr != _tokens_table.end(), "Token does not exists.");
    _tokens_table.erase(itr);
}

int32_t savactsavpay::getRamForPayment(const name& self, bool isName_From, bool isName_To, const name& token_contract, const symbol& sym){
    int32_t neededRAM;
    check(isTokenAccepted(self, token_contract, sym, neededRAM), "Token is not accepted.");
    if(neededRAM < ram_system_token_open_entry){
        neededRAM = ram_system_token_open_entry;
    }

    if(isName_To){
        if(isName_From){
            if(ram_pay2name_entry_from_name > neededRAM){
                return ram_pay2name_entry_from_name;
            }
        } else {
            if(ram_pay2name_entry_from_key > neededRAM){
                return ram_pay2name_entry_from_key;
            }
        }
    } else {
        if(isName_From){
            if(ram_pay2key_entry_from_name > neededRAM){
                return ram_pay2key_entry_from_name;
            }
        } else {
            if(ram_pay2key_entry_from_key > neededRAM){
                return ram_pay2key_entry_from_key;
            }
        }
    }
    return neededRAM;
}

void savactsavpay::pay(const name& from, const string& to, asset fund, const name token_contract, const string& memo, const uint32_t time){
    pay(getSenderVecFrom(from), to, fund, token_contract, memo, time);
}

void savactsavpay::pay(const string& from, const string& to, asset fund, const name token_contract, const string& memo, const uint32_t time){
    pay(getSenderVecFrom(from), to, fund, token_contract, memo, time);
}

void savactsavpay::pay(const vector<char>& fromVec, const string& to, asset fund, const name token_contract, const string& memo, const uint32_t time){
    auto currentTime = eosio::current_time_point().sec_since_epoch();
    check(time > currentTime, "The mentioned time is already over.");

    bool isName_To = to.length() <= 12;
    bool isName_From = fromVec.size() <= 12;

    // Consider the maximal amount of RAM which could be needed for all options and check if token is accepted
    auto neededRAM = getRamForPayment(get_self(), isName_From, isName_To, token_contract, fund.symbol);

    // Switch between name or key recipient
    if(isName_To){
        // Recipient is a name
        name to_name(to);
        uint64_t to_scope = to_name.value;
        check(is_account(to_name), "Recipient does not exists.");

        ram_table _ram(get_self(), to_scope);

        // Search for a free RAM payer for this recipient
        auto itr = getFreeRAMPayer(neededRAM, time, currentTime, _ram);

        name ram_payer;
        if(itr == _ram.end()) {
            // RAM will be payed by the funds
            ram_payer = get_self();

            // Buy needed RAM and reduce the fund amount accordingly
            fund.amount -= EosioHandler::calcRamBytes(neededRAM);
            EosioHandler::buyrambytes(get_self(), get_self(), neededRAM);
            
        } else {
            // Set the recipient as RAM payer by mentioning the RAM offerer
            ram_payer = itr->from;

            // Set the needed RAM amount of the offerer as used
            _ram.modify(itr, get_self(), [&](auto& p) {
                p.free -= neededRAM;
            });
            // neededRAM = 0; // Not necessary 
        }

        // Add payment to table
        addpayment(fromVec, to_name, fund, token_contract, memo, time, ram_payer);
    } else {
        // Recipient is a key
        auto to_key = Conversion::String_to_public_key(to);

        // Buy needed RAM and reduce the fund amount accordingly
        fund.amount -= EosioHandler::calcRamBytes(neededRAM);
        EosioHandler::buyrambytes(get_self(), get_self(), neededRAM);

        // Add payment to table
        addpayment(fromVec, to_key, fund, token_contract, memo, time, get_self());
    }
}

void savactsavpay::sendTokenHandleRAM(const name& self, const name& to, const name& ramBy, const name& recipient, const name& token_contract, const asset& fund, const string& memo, int32_t freeRAM){
    if(ramBy == self) {
        sendWithRAM(self, recipient, token_contract, fund, memo, freeRAM);
    } else {
        // RAM which is offered by RAM table can not be used to open a token entry
        EosioHandler::checkOpenTokenRow(token_contract, recipient, fund.symbol);
        EosioHandler::transferCustom(self, recipient, fund, memo, token_contract);

        // Add RAM back to table
        freeRamUsage(self, ramBy, to, freeRAM);
    }
}

void savactsavpay::sendWithRAM(const name& self, const name& recipient, const name& token_contract, const asset& fund, const string& memo, int32_t freeRAM){
    // If the account has not an entry for the token, then create one
    freeRAM -= openTokenRowAndGetRAM(token_contract, recipient, fund.symbol, self);

    if(token_contract != System_Token_Contract || fund.symbol != System_Symbol) {
        // Is not the system token
        // Send the fund of the custom token
        EosioHandler::transferCustom(self, recipient, fund, memo, token_contract);

        // Check if user has an accounts entry for the system token
        if(EosioHandler::hasOpenTokenRow(System_Token_Contract, recipient, System_Symbol)) {
            // User has a system token row already
            sendRamAndSysFundDirect(self, freeRAM, recipient, asset(0, System_Symbol), memo);
        } else {
             // User has no system token row, so create one if there is enough RAM
            uint32_t ram_open_system_token;
            isTokenAccepted(self, System_Token_Contract, System_Symbol, ram_open_system_token);
            if(freeRAM >= ram_open_system_token){
                // Create system token row for the recipient
                EosioHandler::openToken(System_Token_Contract, recipient, System_Symbol, self);
                freeRAM -= ram_open_system_token;

                // Send system token from RAM to recipient
                sendRamAndSysFundDirect(self, freeRAM, recipient, asset(0, System_Symbol), std::string("Amount for RAM"));
            } else {
                // RAM is to low to open a Token row, it will be send to nirvana
                sendRamAndSysFundDirect(self, freeRAM, nirvana, asset(0, System_Symbol), std::string("Rest of RAM"));
            }
        }
    } else {
        // Token is system token
        sendRamAndSysFundDirect(self, freeRAM, recipient, fund, memo);
    }
}

vector<char> savactsavpay::getSenderVecFrom(const name& user){
    check(is_account(user), "Sender does not exist.");
    // Convert the name into a char array
    const char* _array = (const char*)&user.value;
    return vector<char>(_array, _array + 8);
}

vector<char> savactsavpay::getSenderVecFrom(const string& user){
    // Get sender as vector
    if(user.size() == 8){
        // Sender is a name
        name _name(user);
        return getSenderVecFrom(_name);
    } else {
        // Sender is a public key
        public_key _key = Conversion::String_to_public_key(user);
        return Conversion::GetVectorFromPubKey(_key);
    }
}

int32_t savactsavpay::openTokenRowAndGetRAM(const name& token_contract, const name& user, const symbol& fund_symbol, const name& self){
    // Check if user has not an accounts entry for the contract token
    if(!EosioHandler::hasOpenTokenRow(token_contract, user, fund_symbol)){
        EosioHandler::openToken(token_contract, user, fund_symbol, self);
        uint32_t bytes;
        isTokenAccepted(self, token_contract, fund_symbol, bytes);
        return bytes;
    }
    return 0;
}

bool savactsavpay::isTokenAccepted(const name& self, const name& token_contract, const symbol& tokensymbol){
    tokens_table _tokens_table(self, token_contract.value);
    return _tokens_table.find(tokensymbol.raw()) != _tokens_table.end();
}

bool savactsavpay::isTokenAccepted(const name& self, const name& token_contract, const symbol& tokensymbol, uint32_t rambytes){
    tokens_table _tokens_table(self, token_contract.value);
    auto itr = _tokens_table.find(tokensymbol.raw());
    if(itr != _tokens_table.end()){
        rambytes = itr->openBytes;
        return true;
    }
    return false;
}

void savactsavpay::addpayment(const vector<char>& from, const name to, const asset& fund, const name token_contract, const string& memo, const uint32_t time, const name ram_payer){
    check(memo.size() < 256, "Memo is too long.");

    pay2name_table _pay2name(get_self(), to.value);

    // Create a new entry
    _pay2name.emplace(get_self(), [&](auto& p) {
        p.id = getIndividualPrimaryKey(_pay2name, from);
        p.from = from;        // from = std::vector<char>(from_key.begin(), &from_key[PubKeyWithoutPrimarySize]);		
        p.fund = fund;
        p.contract = token_contract;
        p.time = time;
        p.memo = memo;
        p.ramBy = ram_payer;
    });
}

void savactsavpay::addpayment(const vector<char>& from, const public_key& to_key, const asset& fund, const name token_contract, const string& memo, const uint32_t time, const name ram_payer){
    check(memo.size() < 256, "Memo is too long.");
    uint64_t to_scope;
    auto to_vec = Conversion::GetVectorFromPubKeySplitFormat(to_key, to_scope);

    pay2key_table _pay2key(get_self(), to_scope);

    // Create a new entry
    _pay2key.emplace(get_self(), [&](auto& p) {
        p.id = getIndividualPrimaryKey(_pay2key, from);
        p.to = to_vec;
        p.from = from;        // from = std::vector<char>(from_key.begin(), &from_key[PubKeyWithoutPrimarySize]);		
        p.fund = fund;
        p.contract = token_contract;
        p.time = time;
        p.memo = memo;
        p.ramBy = ram_payer;
    });
}

savactsavpay::ram_table::const_iterator savactsavpay::getFreeRAMPayer(const uint64_t neededRam, const uint32_t time, uint32_t currentTime, const ram_table& _ram){
    // Search for a free ram payer for this recipient
    auto itr = _ram.begin();
    while (itr != _ram.end()) {
        if(neededRam <= itr->free){
            if(itr->relative){
                if(time - currentTime <= itr->maxTime){
                    break;
                }
            }
            else {
                if(time <= itr->maxTime){
                    break;
                }
            }
        }
        ++itr;
    }
    return itr;
}

void savactsavpay::freeRamUsage(const name& self, const name& from, const name& to, const int32_t free){
    ram_table _ram(self, to.value);
    auto itr = _ram.find(from.value);
    check(itr != _ram.end(), "RAM entry does not exist.");  // This cannot happen, just for double checking

    _ram.modify(itr, self, [&](auto& p) {
        p.free += free;
    });
}

int32_t savactsavpay::getAndRemovesExpiredBalancesOfKey(const public_key& to_pub_key, const name& token_contract, asset& fund, const uint32_t currenttime, const name& self){
    // Get free RAM for each case
    auto _ram_from_name_to_key = getRamForPayment(self, true, false, token_contract, fund.symbol);
    auto _ram_from_key_to_key = getRamForPayment(self, false, false, token_contract, fund.symbol);
    
    // Get table
    uint64_t scope;
    auto to_vec = Conversion::GetVectorFromPubKeySplitFormat(to_pub_key, scope);
    pay2key_table _pay2key(self, scope);

    // Find each expired entry and sum up the funds and RAM which will be free
    int32_t freeRAM = 0;
    auto itr = _pay2key.begin();
    bool foundEntries = false;
    while(itr != _pay2key.end()){
        if(std::equal(to_vec.begin(), to_vec.end(), itr->to.begin()) && itr->fund.symbol == fund.symbol && itr->time < currenttime && itr->contract == token_contract){
            fund += itr->fund;
            itr = _pay2key.erase(itr);
            freeRAM += itr->from.size() == 8? _ram_from_name_to_key : _ram_from_key_to_key;
            foundEntries = true;
        } else {
            itr++;
        }
    }
    check(foundEntries, "No expired entries.");
    return freeRAM;
}

int32_t savactsavpay::getAndRemovesExpiredBalancesOfName(const name& to, const name& token_contract, asset& fund, const uint32_t currenttime, const name& self){
    // Get free RAM for each case
    auto _ram_from_name_to_name = getRamForPayment(self, true, true, token_contract, fund.symbol);
    auto _ram_from_key_to_name = getRamForPayment(self, false, true, token_contract, fund.symbol);

    // Get table
    pay2name_table _pay2name(self, to.value);
    
    // Get RAM table
    ram_table _ram(self, to.value);

    // Find each expired entry and sum up the funds and RAM which will be free
    int32_t freeRAM = 0;
    auto itr = _pay2name.begin();
    bool foundEntries = false;
    while(itr != _pay2name.end()) {
        if(itr->fund.symbol == fund.symbol && itr->time < currenttime && itr->contract == token_contract){
            int tempFree = itr->from.size() == 8? _ram_from_name_to_name : _ram_from_key_to_name;
            if(itr->ramBy != self){
                auto ram_itr = _ram.find(itr->ramBy.value);
                check(ram_itr != _ram.end(), "RAM entry does not exist.");  // This cannot happen, just for double checking
                _ram.modify(ram_itr, self, [&](auto& p) {
                    p.free += tempFree;
                });
            } else {
                freeRAM += tempFree;
            }
            fund += itr->fund;
            itr = _pay2name.erase(itr);
            foundEntries = true;
        } else {
            itr++;
        }
    }
    check(foundEntries, "No expired entries.");
    return freeRAM;
}

void savactsavpay::buyAccount(const name& self, public_key& pubkey, name account, asset& fund){
    check(!is_account(account), "The account name is already taken.");

    // remove the cost for a new account
    int64_t ramCostForUser = EosioHandler::calcRamPrice(ramForUser);
    fund.amount -= (netCostForUser + cpuCostForUser + ramCostForUser);
    check(fund.amount > 0, "Not enough amount to create an account");

    // Create the account
    EosioHandler::createAccount(self, account, pubkey);

    // Stake NET and CPU for the account
    EosioHandler::delegatebw(self, account, asset(netCostForUser, System_Symbol), asset(cpuCostForUser, System_Symbol));

    // Buy RAM for the account
    EosioHandler::buyrambytes(self, account, ramForUser);
}
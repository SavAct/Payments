#pragma once
#include "base58.hpp"

using namespace eosio;
using namespace std;
static constexpr int PubKeyWithoutScopeSize = 33 - sizeof(uint64_t);

class Conversion
{
public:
    enum KeyType
    {
        K1 = 0,
        R1 = 1,
        WebAuthN = 2
    };

    /** Convert the pulic key from string to public key type.
     *	@return The public key. Returns the type on public_key.index()
     */
    static public_key String_to_public_key(const string& public_key_str) {
        // Check the prefix currently for "K1" and "R1" key type
        KeyType keyType;
        bool legacy = false;
        string pubkey_prefix("EOS");
        auto result = mismatch(pubkey_prefix.begin(), pubkey_prefix.end(), public_key_str.begin());
        if (result.first == pubkey_prefix.end())
        {
            keyType = K1;
            legacy = true;
        }
        else
        {
            pubkey_prefix = string("PUB_K1_");
            result = mismatch(pubkey_prefix.begin(), pubkey_prefix.end(), public_key_str.begin());
            if (result.first == pubkey_prefix.end())
            {
                keyType = K1;
            }
            else
            {
                pubkey_prefix = string("PUB_R1_");
                result = mismatch(pubkey_prefix.begin(), pubkey_prefix.end(), public_key_str.begin());
                check(result.first == pubkey_prefix.end(), "Public key should be prefixed with 'EOS', 'PUB_K1_ or PUB_R1'.");
                keyType = R1;
            }
        }
        check(public_key_str.length() == 50 + pubkey_prefix.length(), "Invalid length of public key.");

        // Remove the prefix
        auto base58substr = public_key_str.substr(pubkey_prefix.length());

        // Decode the string with base 58
        vector<unsigned char> vch;
        check(Base58::decode_base58(base58substr, vch), "Decoding of public key failed.");
        check(vch.size() == 37, "Invalid public key.");

        // Store the first 33 byte in an array
        ecc_public_key pubkey_data; // array<unsigned char,33> pubkey_data;
        copy_n(vch.begin(), 33, pubkey_data.begin());

        // Check checksum
        checksum160 checksum;
        if (legacy)
        {
            checksum = ripemd160(reinterpret_cast<char*>(pubkey_data.data()), 33);
        }
        else
        {
            array<unsigned char, 35> pubkey_data_with_prefix;
            copy_n(vch.begin(), 33, pubkey_data_with_prefix.begin());
            switch (keyType)
            {
            case K1:
                pubkey_data_with_prefix[33] = 75; // K
                pubkey_data_with_prefix[34] = 49; // 1
                break;
            case R1:
                pubkey_data_with_prefix[33] = 82; // R
                pubkey_data_with_prefix[34] = 49; // 1
                break;
            default:
                check(vch.size() == 37, "Not supported public key type.");
            }
            checksum = ripemd160(reinterpret_cast<char*>(pubkey_data_with_prefix.data()), 35);
        }
        int res = memcmp(checksum.extract_as_byte_array().data(), &vch.end()[-4], 4);
        check(res == 0, "Wrong checksum, check the public key for typos.");

        return EccToPubKey(pubkey_data, keyType);
    }

    static signature String_to_signature(const string& sig_str) {
        check(sig_str.length() == 101, "Wrong lenght of signature.");
        string sig_prefix("SIG");
        check(mismatch(sig_prefix.begin(), sig_prefix.end(), sig_str.begin()).first == sig_prefix.end(), "No signature prefix.");

        KeyType sigType;
        string sig_type_str("_K1_");
        if (mismatch(sig_type_str.begin(), sig_type_str.end(), sig_str.begin() + 3).first == sig_type_str.end())
        {
            sigType = KeyType::K1;
        }
        else
        {
            sig_type_str = "_R1_";
            if (mismatch(sig_type_str.begin(), sig_type_str.end(), sig_str.begin() + 3).first == sig_type_str.end())
            {
                sigType = KeyType::R1;
            }
            else
            {
                check(false, "Signature should use the prefix 'SIG_K1_ or SIG_R1'.");
            }
        }

        // Remove the prefix
        auto base58substr = sig_str.substr(sig_prefix.length() + sig_type_str.length());
        // Decode the string with base 58
        vector<unsigned char> vecSig;
        check(Base58::decode_base58(base58substr, vecSig), "Decoding of signature failed.");
        check(vecSig.size() == 69, "Invalid signature.");

        // Store the first 65 byte as ecc_signature
        ecc_signature ecc_sig_data;
        copy_n(vecSig.begin(), 65, ecc_sig_data.begin());

        // Check the signature checksum
        checkSigCheckSum(ecc_sig_data, sigType, &vecSig.end()[-4]);

        return EccToSignature(ecc_sig_data, sigType);
    }

    /**
     * @brief Construct a new check Sig Check Sum object
     *
     * @param ecc_sig_data Ecc format of the signature
     * @param sigType Type of the signature
     * @param checkSum Char pointer of the checksum
     */
    static void checkSigCheckSum(const ecc_signature& ecc_sig_data, const KeyType& sigType, const unsigned char* checkSum) {
        // Create an 67 byte long array which starts with the signature data
        char sig_data[67];
        memcpy(sig_data, ecc_sig_data.data(), 65);

        // Fill the last two bytes with the key type
        switch (sigType)
        {
        case KeyType::K1:
            sig_data[65] = 'K';
            sig_data[66] = '1';
            break;
        case KeyType::R1:
            sig_data[65] = 'R';
            sig_data[66] = '1';
            break;
        default:
            check(false, "Not supported signature type.");
        }

        // Calculate the checksum
        checksum160 r_checksum = ripemd160(sig_data, 67);

        // Check the checksum
        check(0 == memcmp(r_checksum.extract_as_byte_array().data(), checkSum, 4), "Wrong checksum, check the signature for typos.");
    }

    /**
     * @brief Convert an ecc public key to a public key.
     *
     * @param ecc_key Ecc public key
     * @param keyType Type of the public key
     * @return Public key
     */
    static public_key EccToPubKey(const ecc_public_key ecc_key, const KeyType keyType) {
        public_key pubkey;
        switch (keyType)
        {
        case K1:
            pubkey.emplace<0>(ecc_key);
            break;
        case R1:
            pubkey.emplace<1>(ecc_key);
            check(false, "Please, use a public key that beginns with EOS or PUB_K1_.");
            break; // Because ECC of EOSJS is not able to sign R1 keys
        default:
            check(false, "Invalid public key type.");
            break;
        }
        return pubkey;
    }

    /**
     * @brief Convert an public key to a ecc public key.
     *
     * @param pub_key
     * @param keyType
     * @return ecc_public_key
     */
    static ecc_public_key PubKeyToEcc(const public_key pub_key, const KeyType keyType) {
        ecc_public_key ecc_key;
        switch (keyType)
        {
        case KeyType::K1:
            ecc_key = std::get<0>(pub_key);
            break;
        case KeyType::R1:
            ecc_key = std::get<1>(pub_key);
            check(false, "Please, use a public key that beginns with EOS or PUB_K1_.");
            break; // Because ECC of EOSJS is not able to sign R1 keys
        default:
            check(false, "This public key format is not considered.");
        }
        return ecc_key;
    }

    /**
     * @brief Convert an ecc signature to a signature.
     *
     * @param ecc_key Ecc signature
     * @param sigType Type of the signature
     * @return Signature
     */
    static signature EccToSignature(const ecc_signature ecc_sig, const KeyType sigType) {
        signature sig;
        switch (sigType)
        {
        case KeyType::K1:
            sig.emplace<0>(ecc_sig);
            break;
        case KeyType::R1:
            sig.emplace<1>(ecc_sig);
            check(false, "Please, use a signature that beginns with PUB_K1_.");
            break; // Because ECC of EOSJS is not able to sign R1 keys
        default:
            check(false, "Invalid signature type.");
            break;
        }
        return sig;
    }

    /**
     * @brief Get the public key splitted with in a vector and a scope part.
     *
     * @param pub_key
     * @param scope This value will be overwritten
     * @return Vector of the public key without the scope part but with the key type
     */
    static std::vector<char> GetVectorFromPubKeySplitFormat(const public_key& pub_key, uint64_t& scope) {
        auto keyType = pub_key.index();
        ecc_public_key ecc_key = PubKeyToEcc(pub_key, (KeyType)keyType);

        // Get the scope part
        const char* bytes = &(ecc_key.data()[PubKeyWithoutScopeSize]); // Get an iterator from the last sizeof(uint64_t) bytes
        std::memcpy(&scope, bytes, sizeof(uint64_t));

        // Get the rest with key type
        std::vector<char> v(ecc_key.begin(), &ecc_key[PubKeyWithoutScopeSize]);
        v.push_back((char)keyType);
        return v;
    }

    /**
     * @brief Get a vector of the public key with the type of the key.
     *
     * @param pub_key
     * @return std::vector<char>
     */
    static std::vector<char> GetVectorFromPubKey(const public_key& pub_key) {
        auto keyType = pub_key.index();
        ecc_public_key ecc_key = PubKeyToEcc(pub_key, (KeyType)keyType);

        std::vector<char> v(ecc_key.begin(), ecc_key.end());
        v.push_back((char)keyType);
        return v;
    }

    /**
     * @brief Get the public key from a vector which contains the full public key and the type at the end.
     *
     * @param vectorKey
     * @return public_key
     */
    static public_key GetPubKeyFromVector(const std::vector<char>& vectorKey) {
        auto typeItr = (vectorKey.end() - 1);
        ecc_public_key ecc_key;
        std::copy(vectorKey.begin(), typeItr, ecc_key.begin());

        return EccToPubKey(ecc_key, (KeyType)(*typeItr));
    }

    /**
     * @brief Get the public key which is splitted in a vector and a scope value.
     *
     * @param vectorKey
     * @param scope
     * @return public_key
     */
    static public_key GetPubKeyFromVector(const std::vector<char>& vectorKey, const uint64_t scope) {
        // Get the scope part
        char restkey[sizeof(uint64_t)];
        std::memcpy(restkey, &scope, sizeof(uint64_t));

        auto typeItr = (vectorKey.end() - 1);
        ecc_public_key ecc_key;
        std::copy(vectorKey.begin(), typeItr, ecc_key.begin());
        std::copy(vectorKey.begin() + PubKeyWithoutScopeSize, vectorKey.end(), std::begin(restkey));

        return EccToPubKey(ecc_key, (KeyType)(*typeItr));
    }

    /**
     * @brief Convert vector to hex string.
     *
     * @param vec Char vector
     * @returns Hex string
     */
    template <class T>
    static string vec_to_hex(vector<T> vec) {
        const char hex_chars[16] = {'0', '1', '2', '3', '4', '5', '6', '7', '8', '9', 'a', 'b', 'c', 'd', 'e', 'f'};
        char hexArray[vec.size() * 2];
        char* hex_c = hexArray;
        for (auto c = vec.begin(); c != vec.end(); ++c)
        {
            *hex_c = hex_chars[(*c & 0xF0) >> 4];
            hex_c++;
            *hex_c = hex_chars[(*c & 0x0F) >> 0];
            hex_c++;
        }
        return string(hexArray, vec.size() * 2);
    }

    /**
     * @brief Convert a char vector to a name.
     *
     * @param nameVec Char vector of a name
     * @return The name
     */
    static name vectorToName(const vector<char>& nameVec) {
        // Get the name value of the sender
        const uint64_t* nameValue = (const uint64_t*)(nameVec.data());
        return name(*nameValue);
    }

    enum ActionType {
        PAY,
        RAM,
        REJ,
        FIN,
        OFF,
        ALL,
        ACC,
        INV,
        EXT,
    };

    struct PaymentParams {
        bool hasFrom = false;
        bool hasTo = false;
        bool hasMemo = false;
        bool hasVote = false;
        bool hasTime = false;
        bool relativeTime = false;
        bool hasId = false;
        bool hasSignature = false;
        bool hasSigTime = false;
        bool hasRecipient = false;
        bool hasRecipientPublicKey = false;
        ActionType actionType = ActionType::PAY;
        string from;
        string to;
        string memo;
        uint32_t time;
        uint64_t id;
        signature sig;
        uint32_t sigTime;
        name recipient;
        public_key recipientPublicKey;
    };

    /**
     * @brief Assert wrong input
     */
    static void assertWrongInput() {
        check(false, "Wrong input.");
    }

    /** The signs to seperate the memo. The sequence of the chars are importend. */
    inline static const string parasigns = "@/!;:#~=+&";

    /** Set a parameter from string
     *	@param parameter	Parameter as string
     *	@param type 		The type of the parameter
     */
    static void GetParameter(PaymentParams& p, const string& parameter, int type) {
        // Switch between the order of chars in parasigns
        switch (type)
        {
        case -1:
            // First parameter From name or key or ACTION
            if (parameter.size() == 3)
            {
                switch (parameter[0])
                {
                case 'P':
                    if ((parameter[1] == 'A' && parameter[2] == 'Y') || (parameter[1] == 'U' && parameter[2] == 'B')) {
                        p.actionType = ActionType::PAY;
                    }
                    else {
                        assertWrongInput();
                    }
                    break;
                case 'R':
                    if (parameter[1] == 'A' && parameter[2] == 'M') {
                        p.actionType = ActionType::RAM;
                    }
                    else if (parameter[1] == 'E' && parameter[2] == 'J') {
                        p.actionType = ActionType::REJ;
                    }
                    else {
                        assertWrongInput();
                    }
                    break;
                case 'F':
                    if (parameter[1] == 'I' && parameter[2] == 'N') {
                        p.actionType = ActionType::FIN;
                    }
                    else {
                        assertWrongInput();
                    }
                    break;
                case 'I':
                    if (parameter[1] == 'N' && parameter[2] == 'V') {
                        p.actionType = ActionType::INV;
                    }
                    else {
                        assertWrongInput();
                    }
                    break;
                case 'O':
                    if (parameter[1] == 'F' && parameter[2] == 'F') {
                        p.actionType = ActionType::OFF;
                    }
                    else {
                        assertWrongInput();
                    }
                    break;
                case 'A':
                    if (parameter[1] == 'C' && parameter[2] == 'C') {
                        p.actionType = ActionType::ACC;
                    }
                    else if (parameter[1] == 'L' && parameter[2] == 'L') {
                        p.actionType = ActionType::ALL;
                    }
                    else {
                        assertWrongInput();
                    }
                    break;
                case 'E':
                    if (parameter[1] == 'X' && parameter[2] == 'T') {
                        p.actionType = ActionType::EXT;
                    }
                    else {
                        assertWrongInput();
                    }
                    break;
                default:
                    p.from = parameter;
                    p.hasFrom = true;
                    break;
                }
            }
            else if (parameter.size() > 0)
            {
                if (parameter.size() > 3 && parameter[0] == 'P' && parameter[1] == 'A' && parameter[2] == 'Y')
                {
                    p.actionType = ActionType::PAY;
                    p.from = parameter.substr(3);
                }
                else
                {
                    p.from = parameter;
                }
                p.hasFrom = true;
            }
            break;
        case 0:
            // To name or key
            p.to = parameter;
            p.hasTo = true;
            break;
        case 1:
            // Relative time
            p.relativeTime = true;
        case 2:
            // Time
            uint32_t time;
            check(!p.hasTime, "Two time parameters.");
            check(Base58::decode_base58(parameter, time), "Decoding of the time value failed.");
            p.time = time;
            p.hasTime = true;
            break;
        case 3:
            // Memo
            p.memo = parameter;
            p.hasMemo = true;
            break;
        case 4:
            // Vote
            p.memo = parameter;
            p.hasVote = true;
            break;
        case 5:
            // Id
            uint64_t id;
            check(Base58::decode_base58(parameter, id), "Decoding of the id failed.");
            p.id = id;
            p.hasId = true;
            break;
        case 6:
            // Signature
            p.sig = String_to_signature(parameter);
            p.hasSignature = true;
            break;
        case 7:
            // Signature time
            uint32_t sigTime;
            check(Base58::decode_base58(parameter, sigTime), "Decoding of the signature time value failed.");
            p.sigTime = sigTime;
            p.hasSigTime = true;
            break;
        case 8:
            // Recipient name
            p.recipient = name(parameter);
            p.hasRecipient = true;
            break;
        case 9:
            // Recipient public key
            p.recipientPublicKey = Conversion::String_to_public_key(parameter);
            p.hasRecipientPublicKey = true;
            break;
        }
    }

    /**
     * @brief Get all parameters of a memo
     *
     * @param memo Memo of a payment
     * @return PaymentParams
     */
    static PaymentParams GetParams(const string& memo) {
        PaymentParams p;
        int type, lastType = -1;
        string::const_iterator it = memo.begin();
        string::const_iterator last_it = memo.begin();
        // Trim front
        while (*it == ' ')
        {
            it++;
        }
        // Get all parameters
        while (it != memo.end())
        {
            type = parasigns.find(*it);
            if (type != string::npos)
            {
                GetParameter(p, string(last_it, it), lastType);
                last_it = it + 1;
                lastType = type;
                // Memo or vote should be the last parameter
                if (lastType == 3 || lastType == 4)
                {
                    it = memo.end();
                    break;
                }
            }
            it++;
        }
        GetParameter(p, std::string(last_it, it), lastType);
        return p;
    }
};
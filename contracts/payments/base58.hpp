#pragma once

using namespace std;

class Base58
{
private:
	Base58() {}

	// All alphanumeric characters except for "0", "I", "O", and "l"
	static constexpr char pszBase58[] = "123456789ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnopqrstuvwxyz";
#pragma warning disable format // @formatter:off
	static constexpr int8_t mapBase58[256] = {
			-1,-1,-1,-1,-1,-1,-1,-1, -1,-1,-1,-1,-1,-1,-1,-1,
			-1,-1,-1,-1,-1,-1,-1,-1, -1,-1,-1,-1,-1,-1,-1,-1,
			-1,-1,-1,-1,-1,-1,-1,-1, -1,-1,-1,-1,-1,-1,-1,-1,
			-1, 0, 1, 2, 3, 4, 5, 6,  7, 8,-1,-1,-1,-1,-1,-1,
			-1, 9,10,11,12,13,14,15, 16,-1,17,18,19,20,21,-1,
			22,23,24,25,26,27,28,29, 30,31,32,-1,-1,-1,-1,-1,
			-1,33,34,35,36,37,38,39, 40,41,42,43,-1,44,45,46,
			47,48,49,50,51,52,53,54, 55,56,57,-1,-1,-1,-1,-1,
			-1,-1,-1,-1,-1,-1,-1,-1, -1,-1,-1,-1,-1,-1,-1,-1,
			-1,-1,-1,-1,-1,-1,-1,-1, -1,-1,-1,-1,-1,-1,-1,-1,
			-1,-1,-1,-1,-1,-1,-1,-1, -1,-1,-1,-1,-1,-1,-1,-1,
			-1,-1,-1,-1,-1,-1,-1,-1, -1,-1,-1,-1,-1,-1,-1,-1,
			-1,-1,-1,-1,-1,-1,-1,-1, -1,-1,-1,-1,-1,-1,-1,-1,
			-1,-1,-1,-1,-1,-1,-1,-1, -1,-1,-1,-1,-1,-1,-1,-1,
			-1,-1,-1,-1,-1,-1,-1,-1, -1,-1,-1,-1,-1,-1,-1,-1,
			-1,-1,-1,-1,-1,-1,-1,-1, -1,-1,-1,-1,-1,-1,-1,-1,
	};
#pragma warning restore format // @formatter:on

public:
	static bool DecodeBase58(const char* psz, std::vector<unsigned char>& vch) {
		// Skip leading spaces.
		while (*psz && isspace(*psz))
			psz++;
		// Skip and count leading '1's.
		int zeroes = 0;
		int length = 0;
		while (*psz == '1')
		{
			zeroes++;
			psz++;
		}
		// Allocate enough space in big-endian base256 representation.
		int size = strlen(psz) * 733 / 1000 + 1; // log(58) / log(256), rounded up.
		std::vector<unsigned char> b256(size);
		// Process the characters.
		static_assert(sizeof(mapBase58) / sizeof(mapBase58[0]) == 256, "mapBase58.size() should be 256"); // guarantee not out of range
		while (*psz && !isspace(*psz))
		{
			// Decode base58 character
			int carry = mapBase58[(uint8_t)*psz];
			if (carry == -1) // Invalid b58 character
				return false;
			int i = 0;
			for (std::vector<unsigned char>::reverse_iterator it = b256.rbegin(); (carry != 0 || i < length) && (it != b256.rend()); ++it, ++i)
			{
				carry += 58 * (*it);
				*it = carry % 256;
				carry /= 256;
			}
			assert(carry == 0);
			length = i;
			psz++;
		}
		// Skip trailing spaces.
		while (isspace(*psz))
			psz++;
		if (*psz != 0)
			return false;
		// Skip leading zeroes in b256.
		std::vector<unsigned char>::iterator it = b256.begin() + (size - length);
		while (it != b256.end() && *it == 0)
			it++;
		// Copy result into output vector.
		vch.reserve(zeroes + (b256.end() - it));
		vch.assign(zeroes, 0x00);
		while (it != b256.end())
			vch.push_back(*(it++));
		return true;
	}

	static bool decode_base58(const string& str, vector<unsigned char>& vch) {
		return DecodeBase58(str.c_str(), vch);
	}

	template <class T>
	static bool decode_base58(const string& str, T& value) {
		vector<unsigned char> vch(sizeof(value), 0x00);
		bool noErr = DecodeBase58(str.c_str(), vch);
		value = *reinterpret_cast<const T*>(vch.data());
		return noErr;
	}
};
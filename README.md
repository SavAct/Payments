# Compilation
Install EOSIO environment and run the following command in the contract folder
```
sudo eosio-cpp -abigen -o teleporteos.wasm teleporteos.cpp
```

# Deployment and initialization

0. The EOSIO account of the contract needs the `eosio.code` permission activated
1. Replace the value of `TOKEN_CONTRACT_STR` and `TOKEN_SYMBOL` in the `teleporteos.hpp` file with your token specific data
2. Deploy the contract
3. Run the ini action of the contract with the following parameters
```
ACTION ini(asset min, uint64_t fixfee, double varfee, bool freeze, uint32_t threshold);
```
- ***min*** Minimum amount for a deposit and teleport
- ***fixfee*** Fix fee for teleports and receipts. Together with the variable fee (varfee) the resulting fee has to be less than the minimum transfer amount (min).
- ***varfee*** Variable fee for teleports and receipts. This has to be between 0 and 0.20 which equals to 0% and 20%.
- ***freeze*** True to freeze the contract until you unfreeze it with the freeze action.
- ***threshold*** Amount of needed oracle confirmations for a receiving teleport

4. Add the allowed Ethereum chains 
```
  ACTION addchain(string name, uint8_t chain_id, string teleaddr, string tokenaddr, uint64_t completed_index);
```
- ***name*** Name of the chain to bridge
- ***abbreviation*** Short name of the chain (like ETH or BSC)
- ***chain_id*** Identification number for this new chain (have to match the self given chain id of that contract)
- ***net_id*** Unique network id to distinguish different chains. See "ChainID" for Ethereum based chains on https://chainlist.org/ 
- ***teleaddr*** Teleport contract address
- ***tokenaddr*** Token contract address (may be the same as ***teleaddr***)
 * ***completed_index*** Current index of received teleports from this chain (Should be zero if there are no transactions on that contract to this contract account)

With the freeze action you can freeze and unfreeze specific parts of the contract
```
ACTION freeze(const bool in, const bool out, const bool oracles, const bool cancel);
```
- ***in*** True to freeze incoming funds, false to unfreeze 
- ***out*** True to freeze outgoing funds, false to unfreeze
- ***oracles*** True to freeze oracles, false to unfreeze
- ***cancel*** True to freeze cancel action, false to unfreeze

Register oracles with regoracle
- ***oracle_name*** EOSIO account name of the oracle
```
ACTION regoracle(name oracle_name);
```

**Note:** This version 2 has breaking changes. You need to clear status and teleport tables before upgrading your version 1 contract. It is also not compatible to the old ETH token contract.

## Maintenance

To pay off collected fees to the oracles run payoracles
```
ACTION payoracles();
```

Use delteles to free the EOSIO RAM of completed and canceled teleports
***to_id*** Delete all entries until this id
```
ACTION delteles(uint64_t to_id);
```

**Note:** You can use the [SavAct WebApp](https://savact.app/#/_trx_/teleport/setup) in combination with the [Anchor Wallet by Greymass](https://greymass.com/en/anchor/) to execute these actions.


# Install test suite on windows

You need to activate the windows feature Hyper-V, but it is not available on Windows 10 Home. You might need to upgrade your Windows to Windows Pro.

## Activate WSL 2
Start windows PowerShell as administrator and run the following commands
```
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
```

```
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
```

```
wsl --set-default-version 2
```

## Setup Linux environment
Install Debian from Microsoft store, start it, create your user account and run the following commands
```
sudo apt-get update
```
```
sudo apt-get upgrade
```
For yarn installation via npm
```
sudo apt-get install npm
```
Install yarn globally
```
sudo npm install --global yarn
```
Navigate in the console to the folder teleporteos in which you can install the modules (**run the following command again if it fails**)
```
sudo yarn install
```

## Set up docker
Install and start Docker, check for updates and install them. Open the Dockers menu by double clicking the icon in the task bar and go to settings ??????.

Check "Use the WSL 2 based engine"

Enable Debian in the settings at Resources / WSL INTEGRATION

## Run tests

Docker must be running. Start the tests with the following command in the debian console
```
sudo yarn test 
```
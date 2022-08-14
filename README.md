# Fraud protection for payments

This contract enables a fraud protection, which does not need middlemen or oracles to judge in problem cases. Payments can be made from almost every exchange. An EOS account is not needed to send or receive payments and the usage is completely free of charges.

# Guid to run the test suite also on windows

You need to activate the windows feature Hyper-V, but it is not available on Windows 10 Home. You might need to upgrade your Windows to Windows Pro.

## Activate WSL 2

Start windows PowerShell as administrator and run the following commands

```sh
dism.exe /online /enable-feature /featurename:Microsoft-Windows-Subsystem-Linux /all /norestart
```

```sh
dism.exe /online /enable-feature /featurename:VirtualMachinePlatform /all /norestart
```

```sh
wsl --set-default-version 2
```

## Setup Linux environment

Install Debian from Microsoft store, start it, create your user account and run the following commands

```sh
sudo apt-get update
```

```sh
sudo apt-get upgrade
```

For yarn installation via npm

```sh
sudo apt-get install npm
```

Install yarn globally

```sh
sudo npm install --global yarn
```

Navigate in the console to the folder teleporteos in which you can install the modules (**run the following command again if it fails**)

```sh
sudo yarn install
```

## Set up docker

Install and start Docker, check for updates and install them. Open the Dockers menu by double clicking the icon in the task bar and go to settings ⚙️.

Check "Use the WSL 2 based engine"

Enable Debian in the settings at Resources / WSL INTEGRATION

## Activate the dev mode

Set the following line at the top of the main contract file savactsavpay.hpp

```
#define dev
```

(Do not forget to remove this line, befor you deploy the contract beyond the test environment)

## Run tests

Docker must be running. Start the tests with the following command in the debian console

```sh
sudo yarn test
```

# License

The underlying principle has been submitted for patent. Nevertheless, the contract is freely usable under the following condition:

A payment sender designates a payee who receives the payment at least after the expiry of a given time limit.
All payments have to be send back to the sender, directed to the mentioned payee or distributed to all SavAct token owners in proportion to their staked token amount. The same applies to possible fees and burned funds.
Charges incurred solely through the use of native network resources are excluded from this condition.
For other networks, a bridge to the SavAct token has to be created first in order to involve the SavAct token owners.

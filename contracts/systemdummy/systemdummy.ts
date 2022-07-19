// =====================================================
// WARNING: GENERATED FILE
//
// Any changes you make will be overwritten by Lamington
// =====================================================

import { Account, Contract, GetTableRowsOptions, ExtendedAsset, ExtendedSymbol, ActorPermission, TableRowsResult } from 'lamington';

// Table row types
export interface SystemdummyAuthority {
	threshold: number;
	keys: Array<SystemdummyKeyWeight>;
	accounts: Array<SystemdummyPermissionLevelWeight>;
	waits: Array<SystemdummyWaitWeight>;
}

export interface SystemdummyBuyram {
	payer: string|number;
	receiver: string|number;
	quant: string;
}

export interface SystemdummyBuyrambytes {
	payer: string|number;
	receiver: string|number;
	bytes: number;
}

export interface SystemdummyConnector {
	balance: string;
	weight: string;
}

export interface SystemdummyDelegatebw {
	from: string|number;
	receiver: string|number;
	stake_net_quantity: string;
	stake_cpu_quantity: string;
	transfer: boolean;
}

export interface SystemdummyDeleteauth {
	account: string|number;
	permission: string|number;
}

export interface SystemdummyExchangeState {
	supply: string;
	base: SystemdummyConnector;
	quote: SystemdummyConnector;
}

export interface SystemdummyKeyWeight {
	key: string;
	weight: number;
}

export interface SystemdummyNewaccount {
	creator: string|number;
	name: string|number;
	owner: SystemdummyAuthority;
	active: SystemdummyAuthority;
}

export interface SystemdummyPermissionLevel {
	actor: string|number;
	permission: string|number;
}

export interface SystemdummyPermissionLevelWeight {
	permission: SystemdummyPermissionLevel;
	weight: number;
}

export interface SystemdummySellram {
	account: string|number;
	bytes: number;
}

export interface SystemdummySetabi {
	account: string|number;
	abi: string;
}

export interface SystemdummySetcode {
	account: string|number;
	vmtype: number;
	vmversion: number;
	code: string;
}

export interface SystemdummySetramstate {
	supply: string;
	basebalance: string;
	quotebalance: string;
}

export interface SystemdummyWaitWeight {
	wait_sec: number;
	weight: number;
}

// Added Types

// Variants

export interface Systemdummy extends Contract {
	// Actions
	buyram(payer: string|number, receiver: string|number, quant: string, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	buyrambytes(payer: string|number, receiver: string|number, bytes: number, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	delegatebw(from: string|number, receiver: string|number, stake_net_quantity: string, stake_cpu_quantity: string, transfer: boolean, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	deleteauth(account: string|number, permission: string|number, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	newaccount(creator: string|number, name: string|number, owner: SystemdummyAuthority, active: SystemdummyAuthority, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	sellram(account: string|number, bytes: number, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	setabi(account: string|number, abi: string, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	setcode(account: string|number, vmtype: number, vmversion: number, code: string, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	setramstate(supply: string, basebalance: string, quotebalance: string, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	// Actions with object params. (This is WIP and not ready for use)
	buyram_object_params(params: {payer: string|number, receiver: string|number, quant: string}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	buyrambytes_object_params(params: {payer: string|number, receiver: string|number, bytes: number}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	delegatebw_object_params(params: {from: string|number, receiver: string|number, stake_net_quantity: string, stake_cpu_quantity: string, transfer: boolean}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	deleteauth_object_params(params: {account: string|number, permission: string|number}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	newaccount_object_params(params: {creator: string|number, name: string|number, owner: SystemdummyAuthority, active: SystemdummyAuthority}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	sellram_object_params(params: {account: string|number, bytes: number}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	setabi_object_params(params: {account: string|number, abi: string}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	setcode_object_params(params: {account: string|number, vmtype: number, vmversion: number, code: string}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	setramstate_object_params(params: {supply: string, basebalance: string, quotebalance: string}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	
	// Tables
	rammarketTable(options?: GetTableRowsOptions): Promise<TableRowsResult<SystemdummyExchangeState>>;
}


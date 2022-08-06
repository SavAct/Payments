// =====================================================
// WARNING: GENERATED FILE
//
// Any changes you make will be overwritten by Lamington
// =====================================================

import { Account, Contract, GetTableRowsOptions, ExtendedAsset, ExtendedSymbol, ActorPermission, TableRowsResult } from 'lamington';

// Table row types
export interface SavactsavpayClearallkey {
	scopevalue: number|string;
}

export interface SavactsavpayClearallname {
	scope: string|number;
}

export interface SavactsavpayData {
	scopeId: number|string;
	nextId: number|string;
}

export interface SavactsavpayExtend {
	to: string|number;
	id: number|string;
	token_contract: string|number;
	time: number;
}

export interface SavactsavpayExtendsig {
	to: string;
	id: number|string;
	time: number;
	sigtime: number;
	sig: string;
}

export interface SavactsavpayFinalize {
	to: string;
	id: number|string;
}

export interface SavactsavpayFinalizesig {
	to: string;
	id: number|string;
	sigtime: number;
	sig: string;
}

export interface SavactsavpayInvalidate {
	to: string;
	id: number|string;
}

export interface SavactsavpayInvalisig {
	to: string;
	id: number|string;
	sigtime: number;
	sig: string;
}

export interface SavactsavpayPay2key {
	id: number|string;
	from: string;
	to: string;
	fund: string;
	contract: string|number;
	time: number;
	memo: string;
	ramBy: string|number;
}

export interface SavactsavpayPay2name {
	id: number|string;
	from: string;
	fund: string;
	contract: string|number;
	time: number;
	memo: string;
	ramBy: string|number;
}

export interface SavactsavpayPayoff {
	to: string;
	id: number|string;
}

export interface SavactsavpayPayoffall {
	to: string|number;
	token_contract: string|number;
	token_symbol: string;
	memo: string;
}

export interface SavactsavpayPayoffallsig {
	to: string;
	token_contract: string|number;
	token_symbol: string;
	recipient: string|number;
	memo: string;
	sigtime: number;
	sig: string;
}

export interface SavactsavpayPayoffnewacc {
	to: string;
	user_pub_key: string;
	user_name: string|number;
	sigtime: number;
	sig: string;
}

export interface SavactsavpayPayoffsig {
	to: string;
	id: number|string;
	recipient: string|number;
	sigtime: number;
	sig: string;
}

export interface SavactsavpayRam {
	from: string|number;
	amount: number|string;
	free: number|string;
	maxTime: number;
	relative: boolean;
}

export interface SavactsavpayReject {
	to: string|number;
	id: number|string;
}

export interface SavactsavpayRejectsig {
	to: string;
	id: number|string;
	sigtime: number;
	sig: string;
}

export interface SavactsavpayRemoveram {
	from: string|number;
	to: string|number;
}

export interface SavactsavpayRemovetoken {
	tokenContract: string|number;
	tokenSymbol: string;
}

export interface SavactsavpaySettoken {
	tokenContract: string|number;
	tokenSymbol: string;
	openBytes: number;
}

export interface SavactsavpayTestaddpay {
	from: string;
	to: string;
	fund: string;
	token_contract: string|number;
	memo: string;
	time: number;
}

export interface SavactsavpayTestdeposit {
	from: string|number;
	to: string|number;
	fund: string;
	memo: string;
}

export interface SavactsavpayTestmemo {
	memo: string;
}

export interface SavactsavpayTestsetram {
	from: string|number;
	to: string|number;
	fund: string;
	maxTime: number;
	relative: boolean;
}

export interface SavactsavpayTokens {
	token: string;
	openBytes: number;
}

// Added Types

// Variants

export interface Savactsavpay extends Contract {
	// Actions
	clearallkey(scopevalue: number|string, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	clearallname(scope: string|number, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	extend(to: string|number, id: number|string, token_contract: string|number, time: number, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	extendsig(to: string, id: number|string, time: number, sigtime: number, sig: string, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	finalize(to: string, id: number|string, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	finalizesig(to: string, id: number|string, sigtime: number, sig: string, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	invalidate(to: string, id: number|string, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	invalisig(to: string, id: number|string, sigtime: number, sig: string, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	payoff(to: string, id: number|string, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	payoffall(to: string|number, token_contract: string|number, token_symbol: string, memo: string, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	payoffallsig(to: string, token_contract: string|number, token_symbol: string, recipient: string|number, memo: string, sigtime: number, sig: string, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	payoffnewacc(to: string, user_pub_key: string, user_name: string|number, sigtime: number, sig: string, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	payoffsig(to: string, id: number|string, recipient: string|number, sigtime: number, sig: string, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	reject(to: string|number, id: number|string, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	rejectsig(to: string, id: number|string, sigtime: number, sig: string, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	removeram(from: string|number, to: string|number, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	removetoken(tokenContract: string|number, tokenSymbol: string, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	settoken(tokenContract: string|number, tokenSymbol: string, openBytes: number, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	testaddpay(from: string, to: string, fund: string, token_contract: string|number, memo: string, time: number, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	testdeposit(from: string|number, to: string|number, fund: string, memo: string, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	testmemo(memo: string, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	testsetram(from: string|number, to: string|number, fund: string, maxTime: number, relative: boolean, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	// Actions with object params. (This is WIP and not ready for use)
	clearallkey_object_params(params: {scopevalue: number|string}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	clearallname_object_params(params: {scope: string|number}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	extend_object_params(params: {to: string|number, id: number|string, token_contract: string|number, time: number}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	extendsig_object_params(params: {to: string, id: number|string, time: number, sigtime: number, sig: string}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	finalize_object_params(params: {to: string, id: number|string}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	finalizesig_object_params(params: {to: string, id: number|string, sigtime: number, sig: string}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	invalidate_object_params(params: {to: string, id: number|string}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	invalisig_object_params(params: {to: string, id: number|string, sigtime: number, sig: string}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	payoff_object_params(params: {to: string, id: number|string}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	payoffall_object_params(params: {to: string|number, token_contract: string|number, token_symbol: string, memo: string}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	payoffallsig_object_params(params: {to: string, token_contract: string|number, token_symbol: string, recipient: string|number, memo: string, sigtime: number, sig: string}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	payoffnewacc_object_params(params: {to: string, user_pub_key: string, user_name: string|number, sigtime: number, sig: string}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	payoffsig_object_params(params: {to: string, id: number|string, recipient: string|number, sigtime: number, sig: string}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	reject_object_params(params: {to: string|number, id: number|string}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	rejectsig_object_params(params: {to: string, id: number|string, sigtime: number, sig: string}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	removeram_object_params(params: {from: string|number, to: string|number}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	removetoken_object_params(params: {tokenContract: string|number, tokenSymbol: string}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	settoken_object_params(params: {tokenContract: string|number, tokenSymbol: string, openBytes: number}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	testaddpay_object_params(params: {from: string, to: string, fund: string, token_contract: string|number, memo: string, time: number}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	testdeposit_object_params(params: {from: string|number, to: string|number, fund: string, memo: string}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	testmemo_object_params(params: {memo: string}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	testsetram_object_params(params: {from: string|number, to: string|number, fund: string, maxTime: number, relative: boolean}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	
	// Tables
	dataTable(options?: GetTableRowsOptions): Promise<TableRowsResult<SavactsavpayData>>;
	pay2keyTable(options?: GetTableRowsOptions): Promise<TableRowsResult<SavactsavpayPay2key>>;
	pay2nameTable(options?: GetTableRowsOptions): Promise<TableRowsResult<SavactsavpayPay2name>>;
	ramTable(options?: GetTableRowsOptions): Promise<TableRowsResult<SavactsavpayRam>>;
	tokensTable(options?: GetTableRowsOptions): Promise<TableRowsResult<SavactsavpayTokens>>;
}


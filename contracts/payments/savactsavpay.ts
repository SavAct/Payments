// =====================================================
// WARNING: GENERATED FILE
//
// Any changes you make will be overwritten by Lamington
// =====================================================

import { Account, Contract, GetTableRowsOptions, ExtendedAsset, ExtendedSymbol, ActorPermission, TableRowsResult } from 'lamington';

// Table row types
export interface SavactsavpayLink {
	platform: string;
	url: string;
	note: string;
}

export interface SavactsavpayAddvote {
	holder: string|number;
	vid: number;
	vt: number;
	t: number;
	rtoken: string;
	rtcontract: string|number;
	options: Array<string>;
	links: Array<SavactsavpayLink>;
}

export interface SavactsavpayData {
	scopeId: number|string;
	nextId: number|string;
}

export interface SavactsavpayExtend {
	to: string|number;
	id: number|string;
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
	orisent: number|string;
	contract: string|number;
	time: number;
	memo: string;
	ramBy: string|number;
	type: number;
}

export interface SavactsavpayPay2name {
	id: number|string;
	from: string;
	fund: string;
	orisent: number|string;
	contract: string|number;
	time: number;
	memo: string;
	ramBy: string|number;
	type: number;
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

export interface SavactsavpayRemovevote {
	holder: string|number;
	index: number|string;
}

export interface SavactsavpaySettoken {
	tokenContract: string|number;
	tokenSymbol: string;
	openBytes: number;
	active: boolean;
}

export interface SavactsavpayTokens {
	token: string;
	openBytes: number;
	active: boolean;
}

export interface SavactsavpayVotes {
	index: number|string;
	holder: string|number;
	vid: number;
	t: number;
	vt: number;
	rtoken: string;
	rtcontract: string|number;
	options: Array<string>;
	links: Array<SavactsavpayLink>;
}

// Added Types

// Variants

export interface Savactsavpay extends Contract {
	// Actions
	addvote(holder: string|number, vid: number, vt: number, t: number, rtoken: string, rtcontract: string|number, options: Array<string>, links: Array<SavactsavpayLink>, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	extend(to: string|number, id: number|string, time: number, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
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
	removevote(holder: string|number, index: number|string, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	settoken(tokenContract: string|number, tokenSymbol: string, openBytes: number, active: boolean, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	// Actions with object params. (This is WIP and not ready for use)
	addvote_object_params(params: {holder: string|number, vid: number, vt: number, t: number, rtoken: string, rtcontract: string|number, options: Array<string>, links: Array<SavactsavpayLink>}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	extend_object_params(params: {to: string|number, id: number|string, time: number}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
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
	removevote_object_params(params: {holder: string|number, index: number|string}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	settoken_object_params(params: {tokenContract: string|number, tokenSymbol: string, openBytes: number, active: boolean}, options?: { from?: Account, auths?: ActorPermission[] }): Promise<any>;
	
	// Tables
	dataTable(options?: GetTableRowsOptions): Promise<TableRowsResult<SavactsavpayData>>;
	pay2keyTable(options?: GetTableRowsOptions): Promise<TableRowsResult<SavactsavpayPay2key>>;
	pay2nameTable(options?: GetTableRowsOptions): Promise<TableRowsResult<SavactsavpayPay2name>>;
	ramTable(options?: GetTableRowsOptions): Promise<TableRowsResult<SavactsavpayRam>>;
	tokensTable(options?: GetTableRowsOptions): Promise<TableRowsResult<SavactsavpayTokens>>;
	votesTable(options?: GetTableRowsOptions): Promise<TableRowsResult<SavactsavpayVotes>>;
}


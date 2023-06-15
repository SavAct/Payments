import { Account, EOSManager } from 'lamington'
import * as chai from 'chai'
import { Savactsavpay } from '../contracts/payments/savactsavpay'

export class Check {
  constructor(private contract: Savactsavpay) {}
  public async existPay2NameEntry(scope: string, id: number) {
    const r = await this.contract.pay2nameTable({
      scope,
      lowerBound: id,
      limit: 1,
    })
    if ('rows' in r.rows && r.rows.length == 1) {
      return true
    } else {
      return false
    }
  }
  public async existPay2KeyEntry(scope: string, id: number) {
    const r = await this.contract.pay2keyTable({
      scope,
      lowerBound: id,
      limit: 1,
    })
    if ('rows' in r.rows && r.rows.length == 1) {
      return true
    } else {
      return false
    }
  }

  public async checkPayment2Name_Exist(scope: string, id: number) {
    if (!(await this.existPay2NameEntry(scope, 0))) {
      throw `Entry ${id} of recipient name ${scope} does not exist`
    }
  }
  public async checkPayment2Name_NotExist(scope: string, id: number) {
    if (await this.existPay2NameEntry(scope, 0)) {
      throw `Entry ${id} of recipient name ${scope} does exist`
    }
  }
  public async checkPayment2Key_Exist(user: Account, scope: string, id: number) {
    if (!(await this.existPay2KeyEntry(user.name, 0))) {
      throw `Entry ${id} of recipient scope key ${scope} does not exist`
    }
  }
  public async checkPayment2Key_NotExist(scope: string, id: number) {
    if (await this.existPay2KeyEntry(scope, 0)) {
      throw `Entry ${id} of recipient scope key ${scope} does exist`
    }
  }

  public async ramTrace(action: () => Promise<any>, checkless = true, checksamereceiver = true, traceUser?: string) {
    const ram_before = (await EOSManager.api.rpc.get_account(this.contract.account.name)).ram_usage
    let ram_user_before: number = 0
    if(traceUser){
      ram_user_before = (await EOSManager.api.rpc.get_account(traceUser)).ram_usage
    }
    const r = await action()
    const ram_after = (await EOSManager.api.rpc.get_account(this.contract.account.name)).ram_usage
    const ram_delta = ram_after - ram_before
    let ramlog = `RAM delta ${ram_delta}`

    if(traceUser){
      const ram_user_after = (await EOSManager.api.rpc.get_account(traceUser)).ram_usage
      ramlog += ` (${traceUser} ${ram_user_after - ram_user_before})`
    }

    // console.log('action_traces...', r.processed.action_traces)
    // console.log('account_ram_deltas...', r.processed.action_traces[0].account_ram_deltas)
    // let sumDeltaRAM = 0
    // for (let a of r.processed.action_traces[0].account_ram_deltas) {
    //   sumDeltaRAM += a.delta
    // }
    // ramlog += ` Sum ${sumDeltaRAM}`
    // console.log('inline_traces', r.processed.action_traces[0].inline_traces)

    let sum = {
      bought: 0,
      sold: 0,
    }
    if (r.processed) {
      if ('action_traces' in r.processed && r.processed.action_traces.length > 0 && 'inline_traces' in r.processed.action_traces[0]) {
        for (let t of r.processed.action_traces[0].inline_traces) {
          if ('act' in t && 'name' in t.act) {
            if (t.act.name == 'buyrambytes') {
              chai.expect(t.act.data.payer).equal(this.contract.account.name, 'Wrong RAM payer')
              if (checksamereceiver) {
                chai.expect(t.act.data.receiver).equal(this.contract.account.name, 'Wrong RAM receiver')
              }
              sum.bought += t.act.data.bytes
              ramlog += ` Bought ${t.act.data.bytes}`
            } else if (t.act.name == 'sellram') {
              chai.expect(t.act.data.account).equal(this.contract.account.name, 'Wrong RAM seller')
              sum.sold += t.act.data.bytes
              ramlog += ` Sold ${t.act.data.bytes}`
            } else if (t.act.name == 'buyram') {
              ramlog += ` bought_for ${t.act.data.quant}`
            }
          }
        }
      }

      console.log(ramlog)
      if (checkless) {
        chai.expect(ram_delta).lessThanOrEqual(sum.bought, 'More RAM consumed than expected')
      }
    }

    return { sum, ramlog }
  }
}

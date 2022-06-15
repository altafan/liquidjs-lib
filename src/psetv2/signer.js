'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.Signer = void 0;
const transaction_1 = require('../transaction');
const updater_1 = require('./updater');
const utils_1 = require('./utils');
class Signer {
  constructor(pset) {
    pset.sanityCheck();
    this.pset = pset;
  }
  signInput(inIndex, data, validator) {
    if (inIndex < 0 || inIndex >= this.pset.globals.inputCount) {
      throw new Error('input index out of range');
    }
    const input = this.pset.inputs[inIndex];
    if (input.isFinalized()) {
      return this;
    }
    if (!input.sighashType) {
      throw new Error('missing input sighash type');
    }
    if ((input.sighashType & 0x1f) === transaction_1.Transaction.SIGHASH_ALL) {
      if (
        this.pset.outputs.some(out => out.isBlinded() && !out.isFullyBlinded())
      ) {
        throw new Error('pset must be fully blinded');
      }
    }
    if (input.isTaproot()) {
      return this._signTaprootInput(inIndex, data, validator);
    }
    return this._signInput(inIndex, data, validator);
  }
  _signInput(inIndex, data, validator) {
    const input = this.pset.inputs[inIndex];
    const pset = this.pset.copy();
    const sighashType = input.sighashType;
    const { psig, witnessScript, redeemScript } = data;
    if (!psig) {
      throw new Error('missing partial signature for input');
    }
    if (psig.signature.slice(-1)[0] !== sighashType) {
      throw new Error('input and signature sighash types must match');
    }
    // in case a witness script is passed, we make sure that the input witness
    // utxo is set and we eventually unset the non-witness one if necessary.
    const u = new updater_1.Updater(pset);
    if (witnessScript && witnessScript.length > 0) {
      u.addInWitnessScript(inIndex, witnessScript);
      if (!input.witnessUtxo) {
        u.addInWitnessUtxo(
          inIndex,
          input.nonWitnessUtxo.outs[input.previousTxIndex],
        );
        pset.inputs[inIndex].nonWitnessUtxo = undefined;
      }
    }
    // in case a redeem script is passed and it's a native segwit one, again,
    // we make sure that the input witness utxo is set.
    if (redeemScript && redeemScript.length > 0) {
      u.addInRedeemScript(inIndex, redeemScript);
      const isSegwit =
        (0, utils_1.isP2WPKH)(redeemScript) ||
        (0, utils_1.isP2WSH)(redeemScript);
      if (isSegwit && !input.witnessUtxo) {
        u.addInWitnessUtxo(
          inIndex,
          input.nonWitnessUtxo.outs[input.previousTxIndex],
        );
        pset.inputs[inIndex].nonWitnessUtxo = undefined;
      }
    }
    // at this point, if the input non-witness utxo is still set, we make sure to
    // transform it to a witness one if it's native segwit.
    if (pset.inputs[inIndex].nonWitnessUtxo) {
      const script = input.nonWitnessUtxo.outs[input.previousTxIndex].script;
      const isSegwit =
        (0, utils_1.isP2WPKH)(script) || (0, utils_1.isP2WSH)(script);
      if (isSegwit) {
        u.addInWitnessUtxo(
          inIndex,
          input.nonWitnessUtxo.outs[input.previousTxIndex],
        );
        pset.inputs[inIndex].nonWitnessUtxo = undefined;
      }
    }
    u.addInPartialSignature(inIndex, psig, validator);
    pset.sanityCheck();
    this.pset.globals = pset.globals;
    this.pset.inputs = pset.inputs;
    this.pset.outputs = pset.outputs;
    return this;
  }
  _signTaprootInput(inIndex, data, validator) {
    const pset = this.pset.copy();
    const { tapKeySig, tapScriptSigs, genesisBlockHash } = data;
    if (!tapKeySig && (!tapScriptSigs || !tapScriptSigs.length)) {
      throw new Error('missing taproot signature');
    }
    const u = new updater_1.Updater(pset);
    if (!!tapKeySig) {
      u.addInTapKeySig(inIndex, tapKeySig, genesisBlockHash, validator);
    }
    if (!!tapScriptSigs) {
      tapScriptSigs.forEach(tapScriptSig => {
        u.addInTapScriptSig(inIndex, tapScriptSig, genesisBlockHash, validator);
      });
    }
    pset.sanityCheck();
    this.pset.globals = pset.globals;
    this.pset.inputs = pset.inputs;
    this.pset.outputs = pset.outputs;
    return this;
  }
}
exports.Signer = Signer;

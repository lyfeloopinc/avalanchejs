import type { OutputOwners } from '../../../../serializable';
import { Input } from '../../../../serializable/fxs/secp256k1';
import {
  type BaseTx,
  type TransferableInput,
  type TransferableOutput,
} from '../../../../serializable/avax';
import type {
  AddPermissionlessDelegatorTx,
  AddPermissionlessValidatorTx,
  AddSubnetValidatorTx,
  BaseTx as PvmBaseTx,
  CreateChainTx,
  CreateSubnetTx,
  ExportTx,
  ImportTx,
  RemoveSubnetValidatorTx,
  Signer,
  TransferSubnetOwnershipTx,
} from '../../../../serializable/pvm';
import {
  SignerEmpty,
  isAddPermissionlessDelegatorTx,
  isAddPermissionlessValidatorTx,
  isAddSubnetValidatorTx,
  isCreateChainTx,
  isCreateSubnetTx,
  isExportTx,
  isImportTx,
  isPvmBaseTx,
  isRemoveSubnetValidatorTx,
  isTransferSubnetOwnershipTx,
} from '../../../../serializable/pvm';
import {
  isStakeableLockIn,
  isStakeableLockOut,
  isTransferOut,
} from '../../../../utils';
import type { Dimensions } from '../../../common/fees/dimensions';
import {
  FeeDimensions,
  addDimensions,
  createEmptyDimensions,
  createDimensions,
} from '../../../common/fees/dimensions';
import type { Serializable } from '../../../common/types';
import type { Transaction } from '../../../common';
import {
  ID_LEN,
  INTRINSIC_ADD_PERMISSIONLESS_DELEGATOR_TX_COMPLEXITIES,
  INTRINSIC_ADD_PERMISSIONLESS_VALIDATOR_TX_COMPLEXITIES,
  INTRINSIC_ADD_SUBNET_VALIDATOR_TX_COMPLEXITIES,
  INTRINSIC_BASE_TX_COMPLEXITIES,
  INTRINSIC_CREATE_CHAIN_TX_COMPLEXITIES,
  INTRINSIC_CREATE_SUBNET_TX_COMPLEXITIES,
  INTRINSIC_EXPORT_TX_COMPLEXITIES,
  INTRINSIC_IMPORT_TX_COMPLEXITIES,
  INTRINSIC_INPUT_BANDWIDTH,
  INTRINSIC_INPUT_DB_READ,
  INTRINSIC_INPUT_DB_WRITE,
  INTRINSIC_OUTPUT_BANDWIDTH,
  INTRINSIC_OUTPUT_DB_WRITE,
  INTRINSIC_POP_BANDWIDTH,
  INTRINSIC_REMOVE_SUBNET_VALIDATOR_TX_COMPLEXITIES,
  INTRINSIC_SECP256K1_FX_INPUT_BANDWIDTH,
  INTRINSIC_SECP256K1_FX_OUTPUT_BANDWIDTH,
  INTRINSIC_SECP256K1_FX_OUTPUT_OWNERS_BANDWIDTH,
  INTRINSIC_SECP256K1_FX_SIGNATURE_BANDWIDTH,
  INTRINSIC_SECP256K1_FX_TRANSFERABLE_INPUT_BANDWIDTH,
  INTRINSIC_STAKEABLE_LOCKED_INPUT_BANDWIDTH,
  INTRINSIC_STAKEABLE_LOCKED_OUTPUT_BANDWIDTH,
  INTRINSIC_TRANSFER_SUBNET_OWNERSHIP_TX_COMPLEXITIES,
  SHORT_ID_LEN,
} from './constants';

/**
 * Returns the complexity outputs add to a transaction.
 */
export const getOutputComplexity = (
  transferableOutputs: TransferableOutput[],
): Dimensions => {
  let complexity = createEmptyDimensions();

  for (const transferableOutput of transferableOutputs) {
    // outputComplexity logic
    const outComplexity: Dimensions = {
      [FeeDimensions.Bandwidth]:
        INTRINSIC_OUTPUT_BANDWIDTH + INTRINSIC_SECP256K1_FX_OUTPUT_BANDWIDTH,
      [FeeDimensions.DBRead]: 0,
      [FeeDimensions.DBWrite]: INTRINSIC_OUTPUT_DB_WRITE,
      [FeeDimensions.Compute]: 0,
    };

    let numberOfAddresses = 0;

    if (isStakeableLockOut(transferableOutput.output)) {
      outComplexity[FeeDimensions.Bandwidth] +=
        INTRINSIC_STAKEABLE_LOCKED_OUTPUT_BANDWIDTH;
      numberOfAddresses =
        transferableOutput.output.getOutputOwners().addrs.length;
    } else if (isTransferOut(transferableOutput.output)) {
      numberOfAddresses = transferableOutput.output.outputOwners.addrs.length;
    }

    const addressBandwidth = numberOfAddresses * SHORT_ID_LEN;

    outComplexity[FeeDimensions.Bandwidth] += addressBandwidth;

    // Finish with OutputComplexity logic
    complexity = addDimensions(complexity, outComplexity);
  }

  return complexity;
};

/**
 * Returns the complexity inputs add to a transaction.
 *
 * It includes the complexity that the corresponding credentials will add.
 */
export const getInputComplexity = (
  transferableInputs: TransferableInput[],
): Dimensions => {
  let complexity = createEmptyDimensions();

  for (const transferableInput of transferableInputs) {
    const inputComplexity: Dimensions = {
      [FeeDimensions.Bandwidth]:
        INTRINSIC_INPUT_BANDWIDTH +
        INTRINSIC_SECP256K1_FX_TRANSFERABLE_INPUT_BANDWIDTH,
      [FeeDimensions.DBRead]: INTRINSIC_INPUT_DB_READ,
      [FeeDimensions.DBWrite]: INTRINSIC_INPUT_DB_WRITE,
      [FeeDimensions.Compute]: 0, // TODO: Add compute complexity.
    };

    if (isStakeableLockIn(transferableInput.input)) {
      inputComplexity[FeeDimensions.Bandwidth] +=
        INTRINSIC_STAKEABLE_LOCKED_INPUT_BANDWIDTH;
    }

    const numberOfSignatures = transferableInput.sigIndicies().length;

    const signatureBandwidth =
      numberOfSignatures * INTRINSIC_SECP256K1_FX_SIGNATURE_BANDWIDTH;

    inputComplexity[FeeDimensions.Bandwidth] += signatureBandwidth;

    // Finalize
    complexity = addDimensions(complexity, inputComplexity);
  }

  return complexity;
};

export const getSignerComplexity = (
  signer: Signer | SignerEmpty,
): Dimensions => {
  if (signer instanceof SignerEmpty) {
    return createEmptyDimensions();
  }

  return createDimensions(
    INTRINSIC_POP_BANDWIDTH,
    0,
    0,
    0, // TODO: Add compute complexity.
  );
};

export const getOwnerComplexity = (outputOwners: OutputOwners): Dimensions => {
  const numberOfAddresses = outputOwners.addrs.length;
  const addressBandwidth = numberOfAddresses * SHORT_ID_LEN;

  const bandwidth =
    addressBandwidth + INTRINSIC_SECP256K1_FX_OUTPUT_OWNERS_BANDWIDTH;

  return createDimensions(bandwidth, 0, 0, 0);
};

/**
 * Returns the complexity an authorization adds to a transaction.
 * It does not include the typeID of the authorization.
 * It does include the complexity that the corresponding credential will add.
 * It does not include the typeID of the credential.
 */
export const getAuthComplexity = (input: Serializable): Dimensions => {
  // TODO: Not a fan of this. May be better to re-type `subnetAuth` as `Input` in `AddSubnetValidatorTx`?
  if (!(input instanceof Input)) {
    throw new Error(
      'Unable to calculate auth complexity of transaction. Expected Input as subnet auth.',
    );
  }

  const numberOfSignatures = input.values().length;

  const signatureBandwidth =
    numberOfSignatures * INTRINSIC_SECP256K1_FX_SIGNATURE_BANDWIDTH;

  const bandwidth = signatureBandwidth + INTRINSIC_SECP256K1_FX_INPUT_BANDWIDTH;

  return createDimensions(
    bandwidth,
    0,
    0,
    0, // TODO: Add compute complexity.
  );
};

const getBaseTxComplexity = (baseTx: BaseTx): Dimensions => {
  const outputsComplexity = getOutputComplexity(baseTx.outputs);
  const inputsComplexity = getInputComplexity(baseTx.inputs);

  const complexity = addDimensions(outputsComplexity, inputsComplexity);

  complexity[FeeDimensions.Bandwidth] += baseTx.memo.length;

  return complexity;
};

const addPermissionlessValidatorTx = (
  tx: AddPermissionlessValidatorTx,
): Dimensions => {
  return addDimensions(
    INTRINSIC_ADD_PERMISSIONLESS_VALIDATOR_TX_COMPLEXITIES,
    getBaseTxComplexity(tx.baseTx),
    getSignerComplexity(tx.signer),
    getOutputComplexity(tx.stake),
    getOwnerComplexity(tx.getValidatorRewardsOwner()),
    getOwnerComplexity(tx.getDelegatorRewardsOwner()),
  );
};

const addPermissionlessDelegatorTx = (
  tx: AddPermissionlessDelegatorTx,
): Dimensions => {
  return addDimensions(
    INTRINSIC_ADD_PERMISSIONLESS_DELEGATOR_TX_COMPLEXITIES,
    getBaseTxComplexity(tx.baseTx),
    getOwnerComplexity(tx.getDelegatorRewardsOwner()),
    getOutputComplexity(tx.stake),
  );
};

const addSubnetValidatorTx = (tx: AddSubnetValidatorTx): Dimensions => {
  return addDimensions(
    INTRINSIC_ADD_SUBNET_VALIDATOR_TX_COMPLEXITIES,
    getBaseTxComplexity(tx.baseTx),
    getAuthComplexity(tx.subnetAuth),
  );
};

const baseTx = (tx: PvmBaseTx): Dimensions => {
  return addDimensions(
    INTRINSIC_BASE_TX_COMPLEXITIES,
    getBaseTxComplexity(tx.baseTx),
  );
};

const createChainTx = (tx: CreateChainTx): Dimensions => {
  let bandwidth: number = tx.fxIds.length * ID_LEN;
  bandwidth += tx.chainName.value().length;
  bandwidth += tx.genesisData.length;

  const dynamicComplexity = createDimensions(bandwidth, 0, 0, 0);

  return addDimensions(
    INTRINSIC_CREATE_CHAIN_TX_COMPLEXITIES,
    dynamicComplexity,
    getBaseTxComplexity(tx.baseTx),
    getAuthComplexity(tx.subnetAuth),
  );
};

const createSubnetTx = (tx: CreateSubnetTx): Dimensions => {
  return addDimensions(
    INTRINSIC_CREATE_SUBNET_TX_COMPLEXITIES,
    getBaseTxComplexity(tx.baseTx),
    getOwnerComplexity(tx.getSubnetOwners()),
  );
};

const exportTx = (tx: ExportTx): Dimensions => {
  return addDimensions(
    INTRINSIC_EXPORT_TX_COMPLEXITIES,
    getBaseTxComplexity(tx.baseTx),
    getOutputComplexity(tx.outs),
  );
};

const importTx = (tx: ImportTx): Dimensions => {
  return addDimensions(
    INTRINSIC_IMPORT_TX_COMPLEXITIES,
    getBaseTxComplexity(tx.baseTx),
    getInputComplexity(tx.ins),
  );
};

const removeSubnetValidatorTx = (tx: RemoveSubnetValidatorTx): Dimensions => {
  return addDimensions(
    INTRINSIC_REMOVE_SUBNET_VALIDATOR_TX_COMPLEXITIES,
    getBaseTxComplexity(tx.baseTx),
    getAuthComplexity(tx.subnetAuth),
  );
};

const transferSubnetOwnershipTx = (
  tx: TransferSubnetOwnershipTx,
): Dimensions => {
  return addDimensions(
    INTRINSIC_TRANSFER_SUBNET_OWNERSHIP_TX_COMPLEXITIES,
    getBaseTxComplexity(tx.baseTx),
    getAuthComplexity(tx.subnetAuth),
    getOwnerComplexity(tx.getSubnetOwners()),
  );
};

export const getTxComplexity = (tx: Transaction): Dimensions => {
  if (isAddPermissionlessValidatorTx(tx)) {
    return addPermissionlessValidatorTx(tx);
  } else if (isAddPermissionlessDelegatorTx(tx)) {
    return addPermissionlessDelegatorTx(tx);
  } else if (isAddSubnetValidatorTx(tx)) {
    return addSubnetValidatorTx(tx);
  } else if (isCreateChainTx(tx)) {
    return createChainTx(tx);
  } else if (isCreateSubnetTx(tx)) {
    return createSubnetTx(tx);
  } else if (isExportTx(tx)) {
    return exportTx(tx);
  } else if (isImportTx(tx)) {
    return importTx(tx);
  } else if (isRemoveSubnetValidatorTx(tx)) {
    return removeSubnetValidatorTx(tx);
  } else if (isTransferSubnetOwnershipTx(tx)) {
    return transferSubnetOwnershipTx(tx);
  } else if (isPvmBaseTx(tx)) {
    return baseTx(tx);
  } else {
    throw new Error('Unsupported transaction type.');
  }
};

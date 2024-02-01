import type { BaseContract, BigNumber, BigNumberish, BytesLike, CallOverrides, ContractTransaction, Overrides, PopulatedTransaction, Signer, utils } from "ethers";
import type { FunctionFragment, Result } from "@ethersproject/abi";
import type { Listener, Provider } from "@ethersproject/providers";
import type { TypedEventFilter, TypedEvent, TypedListener, OnEvent } from "./common";
export interface BSAILPZapInterface extends utils.Interface {
    functions: {
        "addLiquidity(uint256,uint256,uint256)": FunctionFragment;
        "addLiquidityAndStake(uint256,uint256,uint256)": FunctionFragment;
        "bSAIGauge()": FunctionFragment;
        "bSAISAI3CRVLPToken()": FunctionFragment;
        "bSAISAI3CRVPool()": FunctionFragment;
        "bSAIToken()": FunctionFragment;
        "getMinLPTokens(uint256,uint256)": FunctionFragment;
        "getMinWithdrawBalanced(uint256)": FunctionFragment;
        "getMinWithdrawSAI(uint256)": FunctionFragment;
        "sai3CRVPool()": FunctionFragment;
        "saiToken()": FunctionFragment;
        "removeLiquidityBalanced(uint256,uint256,uint256)": FunctionFragment;
        "removeLiquiditySAI(uint256,uint256)": FunctionFragment;
    };
    getFunction(nameOrSignatureOrTopic: "addLiquidity" | "addLiquidityAndStake" | "bSAIGauge" | "bSAISAI3CRVLPToken" | "bSAISAI3CRVPool" | "bSAIToken" | "getMinLPTokens" | "getMinWithdrawBalanced" | "getMinWithdrawSAI" | "sai3CRVPool" | "saiToken" | "removeLiquidityBalanced" | "removeLiquiditySAI"): FunctionFragment;
    encodeFunctionData(functionFragment: "addLiquidity", values: [BigNumberish, BigNumberish, BigNumberish]): string;
    encodeFunctionData(functionFragment: "addLiquidityAndStake", values: [BigNumberish, BigNumberish, BigNumberish]): string;
    encodeFunctionData(functionFragment: "bSAIGauge", values?: undefined): string;
    encodeFunctionData(functionFragment: "bSAISAI3CRVLPToken", values?: undefined): string;
    encodeFunctionData(functionFragment: "bSAISAI3CRVPool", values?: undefined): string;
    encodeFunctionData(functionFragment: "bSAIToken", values?: undefined): string;
    encodeFunctionData(functionFragment: "getMinLPTokens", values: [BigNumberish, BigNumberish]): string;
    encodeFunctionData(functionFragment: "getMinWithdrawBalanced", values: [BigNumberish]): string;
    encodeFunctionData(functionFragment: "getMinWithdrawSAI", values: [BigNumberish]): string;
    encodeFunctionData(functionFragment: "sai3CRVPool", values?: undefined): string;
    encodeFunctionData(functionFragment: "saiToken", values?: undefined): string;
    encodeFunctionData(functionFragment: "removeLiquidityBalanced", values: [BigNumberish, BigNumberish, BigNumberish]): string;
    encodeFunctionData(functionFragment: "removeLiquiditySAI", values: [BigNumberish, BigNumberish]): string;
    decodeFunctionResult(functionFragment: "addLiquidity", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "addLiquidityAndStake", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "bSAIGauge", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "bSAISAI3CRVLPToken", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "bSAISAI3CRVPool", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "bSAIToken", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "getMinLPTokens", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "getMinWithdrawBalanced", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "getMinWithdrawSAI", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "sai3CRVPool", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "saiToken", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "removeLiquidityBalanced", data: BytesLike): Result;
    decodeFunctionResult(functionFragment: "removeLiquiditySAI", data: BytesLike): Result;
    events: {};
}
export interface BSAILPZap extends BaseContract {
    connect(signerOrProvider: Signer | Provider | string): this;
    attach(addressOrName: string): this;
    deployed(): Promise<this>;
    interface: BSAILPZapInterface;
    queryFilter<TEvent extends TypedEvent>(event: TypedEventFilter<TEvent>, fromBlockOrBlockhash?: string | number | undefined, toBlock?: string | number | undefined): Promise<Array<TEvent>>;
    listeners<TEvent extends TypedEvent>(eventFilter?: TypedEventFilter<TEvent>): Array<TypedListener<TEvent>>;
    listeners(eventName?: string): Array<Listener>;
    removeAllListeners<TEvent extends TypedEvent>(eventFilter: TypedEventFilter<TEvent>): this;
    removeAllListeners(eventName?: string): this;
    off: OnEvent<this>;
    on: OnEvent<this>;
    once: OnEvent<this>;
    removeListener: OnEvent<this>;
    functions: {
        addLiquidity(_bSAIAmount: BigNumberish, _saiAmount: BigNumberish, _minLPTokens: BigNumberish, overrides?: Overrides & {
            from?: string | Promise<string>;
        }): Promise<ContractTransaction>;
        addLiquidityAndStake(_bSAIAmount: BigNumberish, _saiAmount: BigNumberish, _minLPTokens: BigNumberish, overrides?: Overrides & {
            from?: string | Promise<string>;
        }): Promise<ContractTransaction>;
        bSAIGauge(overrides?: CallOverrides): Promise<[string]>;
        bSAISAI3CRVLPToken(overrides?: CallOverrides): Promise<[string]>;
        bSAISAI3CRVPool(overrides?: CallOverrides): Promise<[string]>;
        bSAIToken(overrides?: CallOverrides): Promise<[string]>;
        getMinLPTokens(_bSAIAmount: BigNumberish, _saiAmount: BigNumberish, overrides?: CallOverrides): Promise<[BigNumber] & {
            bSAISAI3CRVTokens: BigNumber;
        }>;
        getMinWithdrawBalanced(_lpAmount: BigNumberish, overrides?: CallOverrides): Promise<[
            BigNumber,
            BigNumber
        ] & {
            bSAIAmount: BigNumber;
            saiAmount: BigNumber;
        }>;
        getMinWithdrawSAI(_lpAmount: BigNumberish, overrides?: CallOverrides): Promise<[BigNumber] & {
            saiAmount: BigNumber;
        }>;
        sai3CRVPool(overrides?: CallOverrides): Promise<[string]>;
        saiToken(overrides?: CallOverrides): Promise<[string]>;
        removeLiquidityBalanced(_lpAmount: BigNumberish, _minBSAI: BigNumberish, _minSAI: BigNumberish, overrides?: Overrides & {
            from?: string | Promise<string>;
        }): Promise<ContractTransaction>;
        removeLiquiditySAI(_lpAmount: BigNumberish, _minSAI: BigNumberish, overrides?: Overrides & {
            from?: string | Promise<string>;
        }): Promise<ContractTransaction>;
    };
    addLiquidity(_bSAIAmount: BigNumberish, _saiAmount: BigNumberish, _minLPTokens: BigNumberish, overrides?: Overrides & {
        from?: string | Promise<string>;
    }): Promise<ContractTransaction>;
    addLiquidityAndStake(_bSAIAmount: BigNumberish, _saiAmount: BigNumberish, _minLPTokens: BigNumberish, overrides?: Overrides & {
        from?: string | Promise<string>;
    }): Promise<ContractTransaction>;
    bSAIGauge(overrides?: CallOverrides): Promise<string>;
    bSAISAI3CRVLPToken(overrides?: CallOverrides): Promise<string>;
    bSAISAI3CRVPool(overrides?: CallOverrides): Promise<string>;
    bSAIToken(overrides?: CallOverrides): Promise<string>;
    getMinLPTokens(_bSAIAmount: BigNumberish, _saiAmount: BigNumberish, overrides?: CallOverrides): Promise<BigNumber>;
    getMinWithdrawBalanced(_lpAmount: BigNumberish, overrides?: CallOverrides): Promise<[
        BigNumber,
        BigNumber
    ] & {
        bSAIAmount: BigNumber;
        saiAmount: BigNumber;
    }>;
    getMinWithdrawSAI(_lpAmount: BigNumberish, overrides?: CallOverrides): Promise<BigNumber>;
    sai3CRVPool(overrides?: CallOverrides): Promise<string>;
    saiToken(overrides?: CallOverrides): Promise<string>;
    removeLiquidityBalanced(_lpAmount: BigNumberish, _minBSAI: BigNumberish, _minSAI: BigNumberish, overrides?: Overrides & {
        from?: string | Promise<string>;
    }): Promise<ContractTransaction>;
    removeLiquiditySAI(_lpAmount: BigNumberish, _minSAI: BigNumberish, overrides?: Overrides & {
        from?: string | Promise<string>;
    }): Promise<ContractTransaction>;
    callStatic: {
        addLiquidity(_bSAIAmount: BigNumberish, _saiAmount: BigNumberish, _minLPTokens: BigNumberish, overrides?: CallOverrides): Promise<BigNumber>;
        addLiquidityAndStake(_bSAIAmount: BigNumberish, _saiAmount: BigNumberish, _minLPTokens: BigNumberish, overrides?: CallOverrides): Promise<BigNumber>;
        bSAIGauge(overrides?: CallOverrides): Promise<string>;
        bSAISAI3CRVLPToken(overrides?: CallOverrides): Promise<string>;
        bSAISAI3CRVPool(overrides?: CallOverrides): Promise<string>;
        bSAIToken(overrides?: CallOverrides): Promise<string>;
        getMinLPTokens(_bSAIAmount: BigNumberish, _saiAmount: BigNumberish, overrides?: CallOverrides): Promise<BigNumber>;
        getMinWithdrawBalanced(_lpAmount: BigNumberish, overrides?: CallOverrides): Promise<[
            BigNumber,
            BigNumber
        ] & {
            bSAIAmount: BigNumber;
            saiAmount: BigNumber;
        }>;
        getMinWithdrawSAI(_lpAmount: BigNumberish, overrides?: CallOverrides): Promise<BigNumber>;
        sai3CRVPool(overrides?: CallOverrides): Promise<string>;
        saiToken(overrides?: CallOverrides): Promise<string>;
        removeLiquidityBalanced(_lpAmount: BigNumberish, _minBSAI: BigNumberish, _minSAI: BigNumberish, overrides?: CallOverrides): Promise<void>;
        removeLiquiditySAI(_lpAmount: BigNumberish, _minSAI: BigNumberish, overrides?: CallOverrides): Promise<void>;
    };
    filters: {};
    estimateGas: {
        addLiquidity(_bSAIAmount: BigNumberish, _saiAmount: BigNumberish, _minLPTokens: BigNumberish, overrides?: Overrides & {
            from?: string | Promise<string>;
        }): Promise<BigNumber>;
        addLiquidityAndStake(_bSAIAmount: BigNumberish, _saiAmount: BigNumberish, _minLPTokens: BigNumberish, overrides?: Overrides & {
            from?: string | Promise<string>;
        }): Promise<BigNumber>;
        bSAIGauge(overrides?: CallOverrides): Promise<BigNumber>;
        bSAISAI3CRVLPToken(overrides?: CallOverrides): Promise<BigNumber>;
        bSAISAI3CRVPool(overrides?: CallOverrides): Promise<BigNumber>;
        bSAIToken(overrides?: CallOverrides): Promise<BigNumber>;
        getMinLPTokens(_bSAIAmount: BigNumberish, _saiAmount: BigNumberish, overrides?: CallOverrides): Promise<BigNumber>;
        getMinWithdrawBalanced(_lpAmount: BigNumberish, overrides?: CallOverrides): Promise<BigNumber>;
        getMinWithdrawSAI(_lpAmount: BigNumberish, overrides?: CallOverrides): Promise<BigNumber>;
        sai3CRVPool(overrides?: CallOverrides): Promise<BigNumber>;
        saiToken(overrides?: CallOverrides): Promise<BigNumber>;
        removeLiquidityBalanced(_lpAmount: BigNumberish, _minBSAI: BigNumberish, _minSAI: BigNumberish, overrides?: Overrides & {
            from?: string | Promise<string>;
        }): Promise<BigNumber>;
        removeLiquiditySAI(_lpAmount: BigNumberish, _minSAI: BigNumberish, overrides?: Overrides & {
            from?: string | Promise<string>;
        }): Promise<BigNumber>;
    };
    populateTransaction: {
        addLiquidity(_bSAIAmount: BigNumberish, _saiAmount: BigNumberish, _minLPTokens: BigNumberish, overrides?: Overrides & {
            from?: string | Promise<string>;
        }): Promise<PopulatedTransaction>;
        addLiquidityAndStake(_bSAIAmount: BigNumberish, _saiAmount: BigNumberish, _minLPTokens: BigNumberish, overrides?: Overrides & {
            from?: string | Promise<string>;
        }): Promise<PopulatedTransaction>;
        bSAIGauge(overrides?: CallOverrides): Promise<PopulatedTransaction>;
        bSAISAI3CRVLPToken(overrides?: CallOverrides): Promise<PopulatedTransaction>;
        bSAISAI3CRVPool(overrides?: CallOverrides): Promise<PopulatedTransaction>;
        bSAIToken(overrides?: CallOverrides): Promise<PopulatedTransaction>;
        getMinLPTokens(_bSAIAmount: BigNumberish, _saiAmount: BigNumberish, overrides?: CallOverrides): Promise<PopulatedTransaction>;
        getMinWithdrawBalanced(_lpAmount: BigNumberish, overrides?: CallOverrides): Promise<PopulatedTransaction>;
        getMinWithdrawSAI(_lpAmount: BigNumberish, overrides?: CallOverrides): Promise<PopulatedTransaction>;
        sai3CRVPool(overrides?: CallOverrides): Promise<PopulatedTransaction>;
        saiToken(overrides?: CallOverrides): Promise<PopulatedTransaction>;
        removeLiquidityBalanced(_lpAmount: BigNumberish, _minBSAI: BigNumberish, _minSAI: BigNumberish, overrides?: Overrides & {
            from?: string | Promise<string>;
        }): Promise<PopulatedTransaction>;
        removeLiquiditySAI(_lpAmount: BigNumberish, _minSAI: BigNumberish, overrides?: Overrides & {
            from?: string | Promise<string>;
        }): Promise<PopulatedTransaction>;
    };
}

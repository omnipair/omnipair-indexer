



use super::OmnipairDecoder;
pub mod add_collateral;
pub mod add_collateral_and_borrow;
pub mod add_liquidity;
pub mod bootstrap_pair;
pub mod borrow;
pub mod init_futarchy_authority;
pub mod init_pair_config;
pub mod initialize_pair;
pub mod liquidate;
pub mod remove_collateral;
pub mod remove_liquidity;
pub mod repay;
pub mod swap;
pub mod view_pair_data;
pub mod view_user_position_data;
pub mod adjust_collateral_event;
pub mod adjust_debt_event;
pub mod adjust_liquidity_event;
pub mod burn_event;
pub mod mint_event;
pub mod pair_created_event;
pub mod swap_event;
pub mod update_pair_event;
pub mod user_position_created_event;
pub mod user_position_liquidated_event;
pub mod user_position_updated_event;

#[derive(carbon_core::InstructionType, serde::Serialize, serde::Deserialize, PartialEq, Eq, Debug, Clone, Hash)]
pub enum OmnipairInstruction {
    AddCollateral(add_collateral::AddCollateral),
    AddCollateralAndBorrow(add_collateral_and_borrow::AddCollateralAndBorrow),
    AddLiquidity(add_liquidity::AddLiquidity),
    BootstrapPair(bootstrap_pair::BootstrapPair),
    Borrow(borrow::Borrow),
    InitFutarchyAuthority(init_futarchy_authority::InitFutarchyAuthority),
    InitPairConfig(init_pair_config::InitPairConfig),
    InitializePair(initialize_pair::InitializePair),
    Liquidate(liquidate::Liquidate),
    RemoveCollateral(remove_collateral::RemoveCollateral),
    RemoveLiquidity(remove_liquidity::RemoveLiquidity),
    Repay(repay::Repay),
    Swap(swap::Swap),
    ViewPairData(view_pair_data::ViewPairData),
    ViewUserPositionData(view_user_position_data::ViewUserPositionData),
    AdjustCollateralEvent(adjust_collateral_event::AdjustCollateralEvent),
    AdjustDebtEvent(adjust_debt_event::AdjustDebtEvent),
    AdjustLiquidityEvent(adjust_liquidity_event::AdjustLiquidityEvent),
    BurnEvent(burn_event::BurnEvent),
    MintEvent(mint_event::MintEvent),
    PairCreatedEvent(pair_created_event::PairCreatedEvent),
    SwapEvent(swap_event::SwapEvent),
    UpdatePairEvent(update_pair_event::UpdatePairEvent),
    UserPositionCreatedEvent(user_position_created_event::UserPositionCreatedEvent),
    UserPositionLiquidatedEvent(user_position_liquidated_event::UserPositionLiquidatedEvent),
    UserPositionUpdatedEvent(user_position_updated_event::UserPositionUpdatedEvent),
}

impl<'a> carbon_core::instruction::InstructionDecoder<'a> for OmnipairDecoder {
    type InstructionType = OmnipairInstruction;

    fn decode_instruction(
        &self,
        instruction: &solana_instruction::Instruction,
    ) -> Option<carbon_core::instruction::DecodedInstruction<Self::InstructionType>> {
        carbon_core::try_decode_instructions!(instruction,
            OmnipairInstruction::AddCollateral => add_collateral::AddCollateral,
            OmnipairInstruction::AddCollateralAndBorrow => add_collateral_and_borrow::AddCollateralAndBorrow,
            OmnipairInstruction::AddLiquidity => add_liquidity::AddLiquidity,
            OmnipairInstruction::BootstrapPair => bootstrap_pair::BootstrapPair,
            OmnipairInstruction::Borrow => borrow::Borrow,
            OmnipairInstruction::InitFutarchyAuthority => init_futarchy_authority::InitFutarchyAuthority,
            OmnipairInstruction::InitPairConfig => init_pair_config::InitPairConfig,
            OmnipairInstruction::InitializePair => initialize_pair::InitializePair,
            OmnipairInstruction::Liquidate => liquidate::Liquidate,
            OmnipairInstruction::RemoveCollateral => remove_collateral::RemoveCollateral,
            OmnipairInstruction::RemoveLiquidity => remove_liquidity::RemoveLiquidity,
            OmnipairInstruction::Repay => repay::Repay,
            OmnipairInstruction::Swap => swap::Swap,
            OmnipairInstruction::ViewPairData => view_pair_data::ViewPairData,
            OmnipairInstruction::ViewUserPositionData => view_user_position_data::ViewUserPositionData,
            OmnipairInstruction::AdjustCollateralEvent => adjust_collateral_event::AdjustCollateralEvent,
            OmnipairInstruction::AdjustDebtEvent => adjust_debt_event::AdjustDebtEvent,
            OmnipairInstruction::AdjustLiquidityEvent => adjust_liquidity_event::AdjustLiquidityEvent,
            OmnipairInstruction::BurnEvent => burn_event::BurnEvent,
            OmnipairInstruction::MintEvent => mint_event::MintEvent,
            OmnipairInstruction::PairCreatedEvent => pair_created_event::PairCreatedEvent,
            OmnipairInstruction::SwapEvent => swap_event::SwapEvent,
            OmnipairInstruction::UpdatePairEvent => update_pair_event::UpdatePairEvent,
            OmnipairInstruction::UserPositionCreatedEvent => user_position_created_event::UserPositionCreatedEvent,
            OmnipairInstruction::UserPositionLiquidatedEvent => user_position_liquidated_event::UserPositionLiquidatedEvent,
            OmnipairInstruction::UserPositionUpdatedEvent => user_position_updated_event::UserPositionUpdatedEvent,
        )
    }
}
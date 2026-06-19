// This V2 decoder code is generated from
// packages/program-interface/src/idl_v2.json.
pub mod add_liquidity_args;
pub mod borrow_args;
pub mod buffer_ledger;
pub mod claim_fees_args;
pub mod claim_hedge_fees_args;
pub mod claim_market_fees_args;
pub mod claim_token_ledger;
pub mod close_hedge_args;
pub mod daily_limit_book;
pub mod debt_book;
pub mod deposit_collateral_args;
pub mod deposit_insurance_args;
pub mod fee_ledger;
pub mod hedge_position;
pub mod initialize_market_args;
pub mod insurance_reserve;
pub mod liquidate_args;
pub mod liquidity_added;
pub mod liquidity_removed;
pub mod margin_position;
pub mod market;
pub mod market_asset;
pub mod market_collateral_deposited;
pub mod market_collateral_withdrawn;
pub mod market_config;
pub mod market_created;
pub mod market_debt_updated;
pub mod market_event_metadata;
pub mod market_fee_claim_kind;
pub mod market_fee_liability_claimed;
pub mod market_fees_claimed;
pub mod market_health;
pub mod market_health_updated;
pub mod market_hedge_closed;
pub mod market_hedge_fees_claimed;
pub mod market_hedge_opened;
pub mod market_insurance_funded;
pub mod market_side;
pub mod market_stake_updated;
pub mod market_updated;
pub mod open_hedge_args;
pub mod position_liquidated;
pub mod recognition_ledger;
pub mod remove_liquidity_args;
pub mod repay_args;
pub mod reserve_ledger;
pub mod risk_book;
pub mod set_market_reduce_only_args;
pub mod stake_args;
pub mod stake_position;
pub mod swap_args;
pub mod swap_executed;
pub mod unstake_args;
pub mod update_market_config_args;
pub mod withdraw_collateral_args;
pub use {
    add_liquidity_args::AddLiquidityArgs, borrow_args::BorrowArgs, buffer_ledger::BufferLedger,
    claim_fees_args::ClaimFeesArgs, claim_hedge_fees_args::ClaimHedgeFeesArgs,
    claim_market_fees_args::ClaimMarketFeesArgs, claim_token_ledger::ClaimTokenLedger,
    close_hedge_args::CloseHedgeArgs, daily_limit_book::DailyLimitBook, debt_book::DebtBook,
    deposit_collateral_args::DepositCollateralArgs, deposit_insurance_args::DepositInsuranceArgs,
    fee_ledger::FeeLedger, hedge_position::HedgePosition,
    initialize_market_args::InitializeMarketArgs, insurance_reserve::InsuranceReserve,
    liquidate_args::LiquidateArgs, liquidity_added::LiquidityAdded,
    liquidity_removed::LiquidityRemoved, margin_position::MarginPosition, market::Market,
    market_asset::MarketAsset, market_collateral_deposited::MarketCollateralDeposited,
    market_collateral_withdrawn::MarketCollateralWithdrawn, market_config::MarketConfig,
    market_created::MarketCreated, market_debt_updated::MarketDebtUpdated,
    market_event_metadata::MarketEventMetadata, market_fee_claim_kind::MarketFeeClaimKind,
    market_fee_liability_claimed::MarketFeeLiabilityClaimed,
    market_fees_claimed::MarketFeesClaimed, market_health::MarketHealth,
    market_health_updated::MarketHealthUpdated, market_hedge_closed::MarketHedgeClosed,
    market_hedge_fees_claimed::MarketHedgeFeesClaimed, market_hedge_opened::MarketHedgeOpened,
    market_insurance_funded::MarketInsuranceFunded, market_side::MarketSide,
    market_stake_updated::MarketStakeUpdated, market_updated::MarketUpdated,
    open_hedge_args::OpenHedgeArgs, position_liquidated::PositionLiquidated,
    recognition_ledger::RecognitionLedger, remove_liquidity_args::RemoveLiquidityArgs,
    repay_args::RepayArgs, reserve_ledger::ReserveLedger, risk_book::RiskBook,
    set_market_reduce_only_args::SetMarketReduceOnlyArgs, stake_args::StakeArgs,
    stake_position::StakePosition, swap_args::SwapArgs, swap_executed::SwapExecuted,
    unstake_args::UnstakeArgs, update_market_config_args::UpdateMarketConfigArgs,
    withdraw_collateral_args::WithdrawCollateralArgs,
};

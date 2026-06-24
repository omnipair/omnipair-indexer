use {
    crate::database,
    async_trait::async_trait,
    carbon_core::{
        error::CarbonResult,
        instruction::{DecodedInstruction, InstructionMetadata, NestedInstructions},
        metrics::MetricsCollection,
        processor::Processor,
    },
    carbon_omnipair_decoder::v2::instructions::OmnipairV2Instruction,
    std::sync::Arc,
};

pub struct OmnipairInstructionProcessor;

impl OmnipairInstructionProcessor {
    pub fn new() -> Self {
        Self
    }
}

fn instruction_path(metadata: &InstructionMetadata) -> String {
    metadata
        .absolute_path
        .iter()
        .map(|part| format!("{:06}", part))
        .collect::<Vec<_>>()
        .join(".")
}

#[async_trait]
impl Processor for OmnipairInstructionProcessor {
    type InputType = (
        InstructionMetadata,
        DecodedInstruction<OmnipairV2Instruction>,
        NestedInstructions,
        solana_instruction::Instruction,
    );

    async fn process(
        &mut self,
        (metadata, instruction, _nested_instructions, _raw_instruction): Self::InputType,
        _metrics: Arc<MetricsCollection>,
    ) -> CarbonResult<()> {
        log::info!("Processing V2 instruction: {:?}", instruction.data);

        match instruction.data {
            OmnipairV2Instruction::MarketCreated(event) => {
                database::upsert_v2_market_created_event(
                    &event,
                    &metadata.transaction_metadata.signature.to_string(),
                    metadata.transaction_metadata.slot as i64,
                    metadata.index as i32,
                    &instruction_path(&metadata),
                )
                .await?;
            }
            OmnipairV2Instruction::MarketUpdated(event) => {
                database::upsert_v2_market_updated_event(
                    &event,
                    &metadata.transaction_metadata.signature.to_string(),
                    metadata.transaction_metadata.slot as i64,
                    metadata.index as i32,
                    &instruction_path(&metadata),
                )
                .await?;
            }
            OmnipairV2Instruction::SwapExecuted(event) => {
                database::upsert_v2_swap_executed_event(
                    &event,
                    &metadata.transaction_metadata.signature.to_string(),
                    metadata.transaction_metadata.slot as i64,
                    metadata.index as i32,
                    &instruction_path(&metadata),
                )
                .await?;
            }
            OmnipairV2Instruction::LiquidityAdded(event) => {
                database::upsert_v2_liquidity_added_event(
                    &event,
                    &metadata.transaction_metadata.signature.to_string(),
                    metadata.transaction_metadata.slot as i64,
                    metadata.index as i32,
                    &instruction_path(&metadata),
                )
                .await?;
            }
            OmnipairV2Instruction::LiquidityRemoved(event) => {
                database::upsert_v2_liquidity_removed_event(
                    &event,
                    &metadata.transaction_metadata.signature.to_string(),
                    metadata.transaction_metadata.slot as i64,
                    metadata.index as i32,
                    &instruction_path(&metadata),
                )
                .await?;
            }
            OmnipairV2Instruction::MarketCollateralDeposited(event) => {
                database::record_v2_event(
                    "collateral_deposited",
                    event.market,
                    Some(event.owner),
                    Some(event.asset_mint),
                    &event,
                    &metadata.transaction_metadata.signature.to_string(),
                    metadata.transaction_metadata.slot as i64,
                    metadata.index as i32,
                    &instruction_path(&metadata),
                )
                .await?;
            }
            OmnipairV2Instruction::MarketCollateralWithdrawn(event) => {
                database::record_v2_event(
                    "collateral_withdrawn",
                    event.market,
                    Some(event.owner),
                    Some(event.asset_mint),
                    &event,
                    &metadata.transaction_metadata.signature.to_string(),
                    metadata.transaction_metadata.slot as i64,
                    metadata.index as i32,
                    &instruction_path(&metadata),
                )
                .await?;
            }
            OmnipairV2Instruction::MarketDebtUpdated(event) => {
                database::upsert_v2_market_debt_updated_event(
                    &event,
                    &metadata.transaction_metadata.signature.to_string(),
                    metadata.transaction_metadata.slot as i64,
                    metadata.index as i32,
                    &instruction_path(&metadata),
                )
                .await?;
            }
            OmnipairV2Instruction::YieldRecipientUpdated(event) => {
                database::record_v2_event(
                    "yield_recipient_updated",
                    event.market,
                    Some(event.owner),
                    Some(event.asset_mint),
                    &event,
                    &metadata.transaction_metadata.signature.to_string(),
                    metadata.transaction_metadata.slot as i64,
                    metadata.index as i32,
                    &instruction_path(&metadata),
                )
                .await?;
            }
            OmnipairV2Instruction::YieldClaimed(event) => {
                database::record_v2_event(
                    "yield_claimed",
                    event.market,
                    Some(event.owner),
                    Some(event.asset_mint),
                    &event,
                    &metadata.transaction_metadata.signature.to_string(),
                    metadata.transaction_metadata.slot as i64,
                    metadata.index as i32,
                    &instruction_path(&metadata),
                )
                .await?;
            }
            OmnipairV2Instruction::MarketFeeLiabilityClaimed(event) => {
                database::record_v2_event(
                    "market_fee_liability_claimed",
                    event.market,
                    Some(event.authority),
                    Some(event.asset_mint),
                    &event,
                    &metadata.transaction_metadata.signature.to_string(),
                    metadata.transaction_metadata.slot as i64,
                    metadata.index as i32,
                    &instruction_path(&metadata),
                )
                .await?;
            }
            OmnipairV2Instruction::ProtocolAuctionSettled(event) => {
                database::record_v2_event(
                    "protocol_auction_settled",
                    event.market,
                    Some(event.bidder),
                    Some(event.sold_mint),
                    &event,
                    &metadata.transaction_metadata.signature.to_string(),
                    metadata.transaction_metadata.slot as i64,
                    metadata.index as i32,
                    &instruction_path(&metadata),
                )
                .await?;
                database::record_v2_protocol_auction_event(
                    "protocol_auction_settled",
                    Some(event.market),
                    None,
                    Some(event.lane),
                    &event,
                    &metadata.transaction_metadata.signature.to_string(),
                    metadata.transaction_metadata.slot as i64,
                    metadata.index as i32,
                    &instruction_path(&metadata),
                )
                .await?;
            }
            OmnipairV2Instruction::ProtocolAuctionConfigUpdated(event) => {
                database::record_v2_protocol_auction_event(
                    "protocol_auction_config_updated",
                    None,
                    Some(event.authority),
                    Some(event.lane),
                    &event,
                    &metadata.transaction_metadata.signature.to_string(),
                    metadata.transaction_metadata.slot as i64,
                    metadata.index as i32,
                    &instruction_path(&metadata),
                )
                .await?;
            }
            OmnipairV2Instruction::ProtocolAuctionRecipientsUpdated(event) => {
                database::record_v2_protocol_auction_event(
                    "protocol_auction_recipients_updated",
                    None,
                    Some(event.authority),
                    Some(event.lane),
                    &event,
                    &metadata.transaction_metadata.signature.to_string(),
                    metadata.transaction_metadata.slot as i64,
                    metadata.index as i32,
                    &instruction_path(&metadata),
                )
                .await?;
            }
            OmnipairV2Instruction::ProtocolAuctionSplitUpdated(event) => {
                database::record_v2_protocol_auction_event(
                    "protocol_auction_split_updated",
                    None,
                    Some(event.authority),
                    None,
                    &event,
                    &metadata.transaction_metadata.signature.to_string(),
                    metadata.transaction_metadata.slot as i64,
                    metadata.index as i32,
                    &instruction_path(&metadata),
                )
                .await?;
            }
            OmnipairV2Instruction::HlpOpened(event) => {
                database::record_v2_event(
                    "hlp_opened",
                    event.market,
                    Some(event.owner),
                    Some(event.asset_mint),
                    &event,
                    &metadata.transaction_metadata.signature.to_string(),
                    metadata.transaction_metadata.slot as i64,
                    metadata.index as i32,
                    &instruction_path(&metadata),
                )
                .await?;
            }
            OmnipairV2Instruction::HlpClosed(event) => {
                database::record_v2_event(
                    "hlp_closed",
                    event.market,
                    Some(event.owner),
                    Some(event.asset_mint),
                    &event,
                    &metadata.transaction_metadata.signature.to_string(),
                    metadata.transaction_metadata.slot as i64,
                    metadata.index as i32,
                    &instruction_path(&metadata),
                )
                .await?;
            }
            OmnipairV2Instruction::HlpRebalanced(event) => {
                database::record_v2_event(
                    "hlp_rebalanced",
                    event.market,
                    Some(event.metadata.signer),
                    None,
                    &event,
                    &metadata.transaction_metadata.signature.to_string(),
                    metadata.transaction_metadata.slot as i64,
                    metadata.index as i32,
                    &instruction_path(&metadata),
                )
                .await?;
            }
            OmnipairV2Instruction::PositionLiquidated(event) => {
                database::record_v2_event(
                    "position_liquidated",
                    event.market,
                    Some(event.borrower),
                    Some(event.debt_asset_mint),
                    &event,
                    &metadata.transaction_metadata.signature.to_string(),
                    metadata.transaction_metadata.slot as i64,
                    metadata.index as i32,
                    &instruction_path(&metadata),
                )
                .await?;
            }
            OmnipairV2Instruction::MarketHealthUpdated(event) => {
                database::upsert_v2_market_health_updated_event(
                    &event,
                    &metadata.transaction_metadata.signature.to_string(),
                    metadata.transaction_metadata.slot as i64,
                    metadata.index as i32,
                    &instruction_path(&metadata),
                )
                .await?;
            }
            _ => {
                log::debug!("Unhandled V2 instruction type: {:?}", instruction.data);
            }
        }

        Ok(())
    }
}

impl OmnipairInstructionProcessor {
    async fn process_swap_event(
        &self,
        swap_event: carbon_omnipair_decoder::instructions::swap_event::SwapEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!("SwapEvent processed - Details: {:#?}", swap_event,);

        let tx_signature = metadata.transaction_metadata.signature.to_string();
        let slot = metadata.transaction_metadata.slot as i64;
        let instruction_index = metadata.index as i32;
        let instruction_path = instruction_path(metadata);
        if let Err(e) = database::upsert_swap_event(
            &swap_event,
            &tx_signature,
            slot,
            instruction_index,
            &instruction_path,
        )
        .await
        {
            log::error!("Failed to insert swap event: {}", e);
            return Err(e);
        }

        log::info!(
            "Successfully processed SwapEvent - Pair: {}, User: {}, TxSig: {}",
            swap_event.metadata.pair,
            swap_event.metadata.signer,
            tx_signature
        );

        Ok(())
    }

    async fn process_adjust_collateral_event(
        &self,
        event: carbon_omnipair_decoder::instructions::adjust_collateral_event::AdjustCollateralEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!("AdjustCollateralEvent processed - Details: {:#?}", event,);

        let tx_signature = metadata.transaction_metadata.signature.to_string();
        let slot = metadata.transaction_metadata.slot as i64;

        if let Err(e) = database::upsert_adjust_collateral_event(&event, &tx_signature, slot).await
        {
            log::error!("Failed to insert adjust collateral event: {}", e);
            return Err(e);
        }

        log::info!(
            "Successfully processed AdjustCollateralEvent - Amount0: {}, Amount1: {}, Pair: {}, User: {}, TxSig: {}",
            event.amount0,
            event.amount1,
            event.metadata.pair,
            event.metadata.signer,
            tx_signature
        );

        Ok(())
    }

    async fn process_adjust_debt_event(
        &self,
        event: carbon_omnipair_decoder::instructions::adjust_debt_event::AdjustDebtEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!("AdjustDebtEvent processed - Details: {:#?}", event,);

        let tx_signature = metadata.transaction_metadata.signature.to_string();
        let slot = metadata.transaction_metadata.slot as i64;

        if let Err(e) = database::upsert_adjust_debt_event(&event, &tx_signature, slot).await {
            log::error!("Failed to insert adjust debt event: {}", e);
            return Err(e);
        }

        log::info!(
            "Successfully processed AdjustDebtEvent - Amount0: {}, Amount1: {}, Pair: {}, User: {}, TxSig: {}",
            event.amount0,
            event.amount1,
            event.metadata.pair,
            event.metadata.signer,
            tx_signature
        );

        Ok(())
    }

    async fn process_adjust_liquidity_event(
        &self,
        event: carbon_omnipair_decoder::instructions::adjust_liquidity_event::AdjustLiquidityEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!("AdjustLiquidityEvent processed - Details: {:#?}", event,);

        let tx_signature = metadata.transaction_metadata.signature.to_string();

        log::info!(
            "Successfully processed AdjustLiquidityEvent - Amount0: {}, Amount1: {}, Liquidity: {}, Pair: {}, User: {}, TxSig: {}",
            event.amount0,
            event.amount1,
            event.liquidity,
            event.metadata.pair,
            event.metadata.signer,
            tx_signature
        );

        Ok(())
    }

    async fn process_burn_event(
        &self,
        event: carbon_omnipair_decoder::instructions::burn_event::BurnEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!("BurnEvent processed - Details: {:#?}", event,);

        let tx_signature = metadata.transaction_metadata.signature.to_string();
        let slot = metadata.transaction_metadata.slot as i64;
        let instruction_index = metadata.index as i32;
        let instruction_path = instruction_path(metadata);

        // Save to adjust_liquidity table with event_type = "remove"
        if let Err(e) = database::upsert_burn_event(
            &event,
            &tx_signature,
            slot,
            instruction_index,
            &instruction_path,
        )
        .await
        {
            log::error!("Failed to save burn event to database: {}", e);
            return Err(e);
        }

        log::info!(
            "Successfully processed BurnEvent - Amount0: {}, Amount1: {}, Liquidity: {}, Pair: {}, User: {}, TxSig: {}",
            event.amount0,
            event.amount1,
            event.liquidity,
            event.metadata.pair,
            event.metadata.signer,
            tx_signature
        );

        Ok(())
    }

    async fn process_mint_event(
        &self,
        event: carbon_omnipair_decoder::instructions::mint_event::MintEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!("MintEvent processed - Details: {:#?}", event,);

        let tx_signature = metadata.transaction_metadata.signature.to_string();
        let slot = metadata.transaction_metadata.slot as i64;
        let instruction_index = metadata.index as i32;
        let instruction_path = instruction_path(metadata);

        // Save to adjust_liquidity table with event_type = "add"
        if let Err(e) = database::upsert_mint_event(
            &event,
            &tx_signature,
            slot,
            instruction_index,
            &instruction_path,
        )
        .await
        {
            log::error!("Failed to save mint event to database: {}", e);
            return Err(e);
        }

        log::info!(
            "Successfully processed MintEvent - Amount0: {}, Amount1: {}, Liquidity: {}, Pair: {}, User: {}, TxSig: {}",
            event.amount0,
            event.amount1,
            event.liquidity,
            event.metadata.pair,
            event.metadata.signer,
            tx_signature
        );

        Ok(())
    }

    async fn process_pair_created_event(
        &self,
        event: carbon_omnipair_decoder::instructions::pair_created_event::PairCreatedEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!("PairCreatedEvent processed - Details: {:#?}", event,);

        let tx_signature = metadata.transaction_metadata.signature.to_string();
        let slot = metadata.transaction_metadata.slot as i64;

        if let Err(e) = database::upsert_pair_created_event(&event, &tx_signature, slot).await {
            log::error!("Failed to insert pair created event: {}", e);
            return Err(e);
        }

        // Send callback
        let webhook_url = "https://post-pools-bot-production.up.railway.app/webhook";
        let webhook_payload = serde_json::json!({
            "pair": event.metadata.pair.to_string(),
            "token0": event.token0.to_string(),
            "token1": event.token1.to_string()
        });

        match reqwest::Client::new()
            .post(webhook_url)
            .header("Content-Type", "application/json")
            .json(&webhook_payload)
            .send()
            .await
        {
            Ok(response) => {
                if response.status().is_success() {
                    log::info!(
                        "Successfully sent webhook notification for pair: {}",
                        event.metadata.pair
                    );
                } else {
                    log::warn!(
                        "Webhook request failed with status: {} for pair: {}",
                        response.status(),
                        event.metadata.pair
                    );
                }
            }
            Err(e) => {
                log::error!(
                    "Failed to send webhook notification for pair {}: {}",
                    event.metadata.pair,
                    e
                );
            }
        }

        log::info!(
            "Successfully processed PairCreatedEvent - Token0: {}, Token1: {}, Pair: {}, User: {}, Lp Mint: {}, Rate Model: {}, Swap Fee Bps: {}, Half Life: {}, Fixed Cf Bps: {:?}, Params Hash: {:?}, Version: {}, TxSig: {}",
            event.token0,
            event.token1,
            event.metadata.pair,
            event.metadata.signer,
            event.lp_mint,
            event.rate_model,
            event.swap_fee_bps,
            event.half_life,
            event.fixed_cf_bps,
            event.params_hash,
            event.version,
            tx_signature
        );

        Ok(())
    }

    async fn process_update_pair_event(
        &self,
        event: carbon_omnipair_decoder::instructions::update_pair_event::UpdatePairEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        let tx_signature = metadata.transaction_metadata.signature.to_string();
        let slot = metadata.transaction_metadata.slot as i64;
        let instruction_index = metadata.index as i32;
        let instruction_path = instruction_path(metadata);

        if let Err(e) = database::upsert_update_pair_event(
            &event,
            &tx_signature,
            slot,
            instruction_index,
            &instruction_path,
        )
        .await
        {
            log::error!("Failed to insert update pair event: {}", e);
            return Err(e);
        }

        log::info!(
            "UpdatePairEvent - Pair: {}, Rate0: {}, Rate1: {}, AccruedInterest0: {}, AccruedInterest1: {}, TxSig: {}",
            event.metadata.pair,
            event.rate0,
            event.rate1,
            event.accrued_interest0,
            event.accrued_interest1,
            tx_signature
        );

        Ok(())
    }

    async fn process_user_position_created_event(
        &self,
        event: carbon_omnipair_decoder::instructions::user_position_created_event::UserPositionCreatedEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!("UserPositionCreatedEvent processed - Details: {:#?}", event,);

        let tx_signature = metadata.transaction_metadata.signature.to_string();

        log::info!(
            "Successfully processed UserPositionCreatedEvent - Position: {}, Pair: {}, User: {}, TxSig: {}",
            event.position,
            event.metadata.pair,
            event.metadata.signer,
            tx_signature
        );

        Ok(())
    }

    async fn process_user_position_liquidated_event(
        &self,
        event: carbon_omnipair_decoder::instructions::user_position_liquidated_event::UserPositionLiquidatedEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!(
            "UserPositionLiquidatedEvent processed - Details: {:#?}",
            event,
        );

        let tx_signature = metadata.transaction_metadata.signature.to_string();
        let slot = metadata.transaction_metadata.slot as i64;

        if let Err(e) =
            database::upsert_user_position_liquidated_event(&event, &tx_signature, slot).await
        {
            log::error!("Failed to insert user position liquidated event: {}", e);
            return Err(e);
        }

        log::info!(
            "Successfully processed UserPositionLiquidatedEvent - Position: {}, Liquidator: {}, Collateral0 Liquidated: {}, Collateral1 Liquidated: {}, Debt0 Liquidated: {}, Debt1 Liquidated: {}, Pair: {}, User: {}, TxSig: {}",
            event.position,
            event.liquidator,
            event.collateral0_liquidated,
            event.collateral1_liquidated,
            event.debt0_liquidated,
            event.debt1_liquidated,
            event.metadata.pair,
            event.metadata.signer,
            tx_signature
        );

        Ok(())
    }

    async fn process_user_position_updated_event(
        &self,
        event: carbon_omnipair_decoder::instructions::user_position_updated_event::UserPositionUpdatedEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!("UserPositionUpdatedEvent processed - Details: {:#?}", event,);

        let tx_signature = metadata.transaction_metadata.signature.to_string();
        let slot = metadata.transaction_metadata.slot as i64;

        if let Err(e) =
            database::upsert_user_position_updated_event(&event, &tx_signature, slot).await
        {
            log::error!("Failed to insert user position updated event: {}", e);
            return Err(e);
        }

        log::info!(
            "Successfully processed UserPositionUpdatedEvent - Position: {}, Collateral0: {}, Collateral1: {}, Debt0 Shares: {}, Debt1 Shares: {}, Pair: {}, User: {}, TxSig: {}",
            event.position,
            event.collateral0,
            event.collateral1,
            event.debt0_shares,
            event.debt1_shares,
            event.metadata.pair,
            event.metadata.signer,
            tx_signature
        );

        Ok(())
    }

    async fn process_user_liquidity_position_updated_event(
        &self,
        event: carbon_omnipair_decoder::instructions::user_liquidity_position_updated_event::UserLiquidityPositionUpdatedEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!(
            "UserLiquidityPositionUpdatedEvent processed - Details: {:#?}",
            event,
        );

        let tx_signature = metadata.transaction_metadata.signature.to_string();
        let slot = metadata.transaction_metadata.slot as i64;
        let instruction_index = metadata.index as i32;
        let instruction_path = instruction_path(metadata);
        if let Err(e) = database::upsert_user_liquidity_position_updated_event(
            &event,
            &tx_signature,
            slot,
            instruction_index,
            &instruction_path,
        )
        .await
        {
            log::error!(
                "Failed to insert user liquidity position updated event: {}",
                e
            );
            return Err(e);
        }

        log::info!(
            "Successfully processed UserLiquidityPositionUpdatedEvent - Token0 Amount: {}, Token1 Amount: {}, LP Amount: {}, Token0 Mint: {}, Token1 Mint: {}, LP Mint: {}, Pair: {}, User: {}, TxSig: {}",
            event.token0_amount,
            event.token1_amount,
            event.lp_amount,
            event.token0_mint,
            event.token1_mint,
            event.lp_mint,
            event.metadata.pair,
            event.metadata.signer,
            tx_signature
        );

        Ok(())
    }
}

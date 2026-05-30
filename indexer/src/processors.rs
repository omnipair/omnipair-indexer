use std::sync::Arc;
use async_trait::async_trait;
use carbon_core::{
    error::CarbonResult,
    metrics::MetricsCollection,
    processor::Processor,
    instruction::{DecodedInstruction, InstructionMetadata, NestedInstructions},
};
use omnipair_decoder::{
    events::{
        swap_event::SwapEventEvent as SwapEvent,
        adjust_collateral_event::AdjustCollateralEventEvent as AdjustCollateralEvent,
        adjust_debt_event::AdjustDebtEventEvent as AdjustDebtEvent,
        adjust_liquidity_event::AdjustLiquidityEventEvent as AdjustLiquidityEvent,
        burn_event::BurnEventEvent as BurnEvent,
        mint_event::MintEventEvent as MintEvent,
        pair_created_event::PairCreatedEventEvent as PairCreatedEvent,
        update_pair_event::UpdatePairEventEvent as UpdatePairEvent,
        user_position_created_event::UserPositionCreatedEventEvent as UserPositionCreatedEvent,
        user_position_liquidated_event::UserPositionLiquidatedEventEvent as UserPositionLiquidatedEvent,
        user_position_updated_event::UserPositionUpdatedEventEvent as UserPositionUpdatedEvent,
        user_liquidity_position_updated_event::UserLiquidityPositionUpdatedEventEvent as UserLiquidityPositionUpdatedEvent,
    },
    instructions::CpiEvent,
};
use crate::{database, omnipair_decoder_adapter::OmnipairInstruction};

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
        DecodedInstruction<OmnipairInstruction>,
        NestedInstructions,
        solana_instruction::Instruction,
    );

    async fn process(
        &mut self,
        (metadata, instruction, _nested_instructions, _raw_instruction): Self::InputType,
        _metrics: Arc<MetricsCollection>,
    ) -> CarbonResult<()> {
        log::info!("Processing instruction: {:?}", instruction.data);
        
        match instruction.data {
            OmnipairInstruction::CpiEvent(event) => {
                self.process_cpi_event(event, &metadata).await?;
            }
            _ => {
                log::debug!("Unhandled instruction type: {:?}", instruction.data);
            }
        }

        Ok(())
    }
}

impl OmnipairInstructionProcessor {
    async fn process_cpi_event(
        &self,
        event: CpiEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        match event {
            CpiEvent::SwapEvent(event) => {
                self.process_swap_event(event, metadata).await?;
            }
            CpiEvent::AdjustCollateralEvent(event) => {
                self.process_adjust_collateral_event(event, metadata).await?;
            }
            CpiEvent::AdjustDebtEvent(event) => {
                self.process_adjust_debt_event(event, metadata).await?;
            }
            CpiEvent::AdjustLiquidityEvent(event) => {
                self.process_adjust_liquidity_event(event, metadata).await?;
            }
            CpiEvent::BurnEvent(event) => {
                self.process_burn_event(event, metadata).await?;
            }
            CpiEvent::MintEvent(event) => {
                self.process_mint_event(event, metadata).await?;
            }
            CpiEvent::PairCreatedEvent(event) => {
                self.process_pair_created_event(event, metadata).await?;
            }
            CpiEvent::UpdatePairEvent(event) => {
                self.process_update_pair_event(event, metadata).await?;
            }
            CpiEvent::ClaimProtocolFeesEvent(_event) => {
                log::debug!("ClaimProtocolFeesEvent received - not persisted");
            }
            CpiEvent::FlashloanEvent(_event) => {
                log::debug!("FlashloanEvent received - not persisted");
            }
            CpiEvent::UserPositionCreatedEvent(event) => {
                self.process_user_position_created_event(event, metadata).await?;
            }
            CpiEvent::UserPositionLiquidatedEvent(event) => {
                self.process_user_position_liquidated_event(event, metadata).await?;
            }
            CpiEvent::UserPositionUpdatedEvent(event) => {
                self.process_user_position_updated_event(event, metadata).await?;
            }
            CpiEvent::UserLiquidityPositionUpdatedEvent(event) => {
                self.process_user_liquidity_position_updated_event(event, metadata).await?;
            }
        }

        Ok(())
    }

    async fn process_swap_event(
        &self, 
        swap_event: SwapEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!(
            "SwapEvent processed - Details: {:#?}",
            swap_event,
        );
        
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
        ).await {
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
        event: AdjustCollateralEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!(
            "AdjustCollateralEvent processed - Details: {:#?}",
            event,
        );
        
        let tx_signature = metadata.transaction_metadata.signature.to_string();
        let slot = metadata.transaction_metadata.slot as i64;
        
        if let Err(e) = database::upsert_adjust_collateral_event(&event, &tx_signature, slot).await {
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
        event: AdjustDebtEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!(
            "AdjustDebtEvent processed - Details: {:#?}",
            event,
        );
        
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
        event: AdjustLiquidityEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!(
            "AdjustLiquidityEvent processed - Details: {:#?}",
            event,
        );
        
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
        event: BurnEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!(
            "BurnEvent processed - Details: {:#?}",
            event,
        );
        
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
        ).await {
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
        event: MintEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!(
            "MintEvent processed - Details: {:#?}",
            event,
        );
        
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
        ).await {
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
        event: PairCreatedEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!(
            "PairCreatedEvent processed - Details: {:#?}",
            event,
        );
        
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
                    log::info!("Successfully sent webhook notification for pair: {}", event.metadata.pair);
                } else {
                    log::warn!("Webhook request failed with status: {} for pair: {}", response.status(), event.metadata.pair);
                }
            }
            Err(e) => {
                log::error!("Failed to send webhook notification for pair {}: {}", event.metadata.pair, e);
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
        event: UpdatePairEvent,
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
        ).await {
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
        event: UserPositionCreatedEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!(
            "UserPositionCreatedEvent processed - Details: {:#?}",
            event,
        );
        
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
        event: UserPositionLiquidatedEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!(
            "UserPositionLiquidatedEvent processed - Details: {:#?}",
            event,
        );
        
        let tx_signature = metadata.transaction_metadata.signature.to_string();
        let slot = metadata.transaction_metadata.slot as i64;
        
        if let Err(e) = database::upsert_user_position_liquidated_event(&event, &tx_signature, slot).await {
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
        event: UserPositionUpdatedEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!(
            "UserPositionUpdatedEvent processed - Details: {:#?}",
            event,
        );
        
        let tx_signature = metadata.transaction_metadata.signature.to_string();
        let slot = metadata.transaction_metadata.slot as i64;
        
        if let Err(e) = database::upsert_user_position_updated_event(&event, &tx_signature, slot).await {
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
        event: UserLiquidityPositionUpdatedEvent,
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
        ).await {
            log::error!("Failed to insert user liquidity position updated event: {}", e);
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

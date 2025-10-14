use std::sync::Arc;
use async_trait::async_trait;
use carbon_core::{
    error::CarbonResult,
    metrics::MetricsCollection,
    processor::Processor,
    instruction::{DecodedInstruction, InstructionMetadata, NestedInstructions},
};
use carbon_omnipair_decoder::instructions::OmnipairInstruction;
use crate::{database, websocket_server::WebSocketServerState};

pub struct OmnipairInstructionProcessor {
    websocket_state: Option<WebSocketServerState>,
}

impl OmnipairInstructionProcessor {
    pub fn new() -> Self {
        Self {
            websocket_state: None,
        }
    }

    pub fn with_websocket_state(websocket_state: WebSocketServerState) -> Self {
        Self {
            websocket_state: Some(websocket_state),
        }
    }
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
            OmnipairInstruction::SwapEvent(swap_event) => {
                self.process_swap_event(swap_event, &metadata).await?;
            }
            OmnipairInstruction::AdjustCollateralEvent(event) => {
                self.process_adjust_collateral_event(event, &metadata).await?;
            }
            OmnipairInstruction::AdjustDebtEvent(event) => {
                self.process_adjust_debt_event(event, &metadata).await?;
            }
            OmnipairInstruction::AdjustLiquidityEvent(event) => {
                self.process_adjust_liquidity_event(event, &metadata).await?;
            }
            OmnipairInstruction::BurnEvent(event) => {
                self.process_burn_event(event, &metadata).await?;
            }
            OmnipairInstruction::MintEvent(event) => {
                self.process_mint_event(event, &metadata).await?;
            }
            OmnipairInstruction::PairCreatedEvent(event) => {
                self.process_pair_created_event(event, &metadata).await?;
            }
            OmnipairInstruction::UpdatePairEvent(event) => {
                self.process_update_pair_event(event, &metadata).await?;
            }
            OmnipairInstruction::UserPositionCreatedEvent(event) => {
                self.process_user_position_created_event(event, &metadata).await?;
            }
            OmnipairInstruction::UserPositionLiquidatedEvent(event) => {
                self.process_user_position_liquidated_event(event, &metadata).await?;
            }
            OmnipairInstruction::UserPositionUpdatedEvent(event) => {
                self.process_user_position_updated_event(event, &metadata).await?;
            }
            OmnipairInstruction::LeveragePositionCreatedEvent(event) => {
                self.process_leverage_position_created_event(event, &metadata).await?;
            }
            OmnipairInstruction::LeveragePositionUpdatedEvent(event) => {
                self.process_leverage_position_updated_event(event, &metadata).await?;
            }
            _ => {
                log::debug!("Unhandled instruction type: {:?}", instruction.data);
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
        log::info!(
            "SwapEvent processed - Details: {:#?}",
            swap_event,
        );
        
        let tx_signature = metadata.transaction_metadata.signature.to_string();
        let slot = metadata.transaction_metadata.slot as i64;
        
        if let Err(e) = database::upsert_swap_event(&swap_event, &tx_signature, slot).await {
            log::error!("Failed to insert swap event: {}", e);
            return Err(e);
        }

        // Broadcast to WebSocket clients if WebSocket server is running
        if let Some(ref ws_state) = self.websocket_state {
            ws_state.broadcast_swap_event(&swap_event, &tx_signature, slot);
            log::debug!("Broadcasted SwapEvent to {} WebSocket clients", ws_state.client_count());
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
        log::info!(
            "AdjustCollateralEvent processed - Details: {:#?}",
            event,
        );
        
        let tx_signature = metadata.transaction_metadata.signature.to_string();
        
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
        log::info!(
            "AdjustDebtEvent processed - Details: {:#?}",
            event,
        );
        
        let tx_signature = metadata.transaction_metadata.signature.to_string();
        
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
        event: carbon_omnipair_decoder::instructions::burn_event::BurnEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!(
            "BurnEvent processed - Details: {:#?}",
            event,
        );
        
        let tx_signature = metadata.transaction_metadata.signature.to_string();
        let slot = metadata.transaction_metadata.slot as i64;
        
        // Save to adjust_liquidity table with event_type = "remove"
        if let Err(e) = database::upsert_burn_event(&event, &tx_signature, slot).await {
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
        log::info!(
            "MintEvent processed - Details: {:#?}",
            event,
        );
        
        let tx_signature = metadata.transaction_metadata.signature.to_string();
        let slot = metadata.transaction_metadata.slot as i64;
        
        // Save to adjust_liquidity table with event_type = "add"
        if let Err(e) = database::upsert_mint_event(&event, &tx_signature, slot).await {
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
        log::info!(
            "PairCreatedEvent processed - Details: {:#?}",
            event,
        );
        
        let tx_signature = metadata.transaction_metadata.signature.to_string();
        
        log::info!(
            "Successfully processed PairCreatedEvent - Token0: {}, Token1: {}, Pair: {}, User: {}, TxSig: {}", 
            event.token0,
            event.token1,
            event.metadata.pair, 
            event.metadata.signer, 
            tx_signature
        );
        
        Ok(())
    }

    async fn process_update_pair_event(
        &self,
        event: carbon_omnipair_decoder::instructions::update_pair_event::UpdatePairEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!(
            "UpdatePairEvent processed - Details: {:#?}",
            event,
        );
        
        let tx_signature = metadata.transaction_metadata.signature.to_string();
        
        log::info!(
            "Successfully processed UpdatePairEvent - Price0 EMA: {}, Price1 EMA: {}, Rate0: {}, Rate1: {}, Pair: {}, User: {}, TxSig: {}", 
            event.price0_ema,
            event.price1_ema,
            event.rate0,
            event.rate1,
            event.metadata.pair, 
            event.metadata.signer, 
            tx_signature
        );
        
        Ok(())
    }

    async fn process_user_position_created_event(
        &self,
        event: carbon_omnipair_decoder::instructions::user_position_created_event::UserPositionCreatedEvent,
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
        event: carbon_omnipair_decoder::instructions::user_position_liquidated_event::UserPositionLiquidatedEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!(
            "UserPositionLiquidatedEvent processed - Details: {:#?}",
            event,
        );
        
        let tx_signature = metadata.transaction_metadata.signature.to_string();
        
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
        log::info!(
            "UserPositionUpdatedEvent processed - Details: {:#?}",
            event,
        );
        
        let tx_signature = metadata.transaction_metadata.signature.to_string();
        
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

    async fn process_leverage_position_created_event(
        &self,
        event: carbon_omnipair_decoder::instructions::leverage_position_created_event::LeveragePositionCreatedEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!(
            "LeveragePositionCreatedEvent processed - Details: {:#?}",
            event,
        );
        
        let tx_signature = metadata.transaction_metadata.signature.to_string();
        let slot = metadata.transaction_metadata.slot as i64;
        
        if let Err(e) = database::upsert_leverage_position_created_event(&event, &tx_signature, slot).await {
            log::error!("Failed to insert leverage position created event: {}", e);
            return Err(e);
        }
        
        log::info!(
            "Successfully processed LeveragePositionCreatedEvent - Position: {}, Pair: {}, User: {}, TxSig: {}", 
            event.position,
            event.metadata.pair, 
            event.metadata.signer, 
            tx_signature
        );
        
        Ok(())
    }

    async fn process_leverage_position_updated_event(
        &self,
        event: carbon_omnipair_decoder::instructions::leverage_position_updated_event::LeveragePositionUpdatedEvent,
        metadata: &InstructionMetadata,
    ) -> CarbonResult<()> {
        log::info!(
            "LeveragePositionUpdatedEvent processed - Details: {:#?}",
            event,
        );
        
        let tx_signature = metadata.transaction_metadata.signature.to_string();
        let slot = metadata.transaction_metadata.slot as i64;
        
        if let Err(e) = database::upsert_leverage_position_updated_event(&event, &tx_signature, slot).await {
            log::error!("Failed to insert leverage position updated event: {}", e);
            return Err(e);
        }
        
        log::info!(
            "Successfully processed LeveragePositionUpdatedEvent - Position: {}, Long Token0: {}, Target Leverage: {}bps, Debt Amount: {}, Collateral Position Size: {}, Liquidation Price: {}, Entry Price: {}, Pair: {}, User: {}, TxSig: {}", 
            event.position,
            event.long_token0,
            event.target_leverage_bps,
            event.debt_amount,
            event.collateral_position_size,
            event.liquidation_price_nad,
            event.entry_price_nad,
            event.metadata.pair, 
            event.metadata.signer, 
            tx_signature
        );
        
        Ok(())
    }

    
}

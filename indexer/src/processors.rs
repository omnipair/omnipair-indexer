use std::sync::Arc;
use async_trait::async_trait;
use carbon_core::{
    error::CarbonResult,
    metrics::MetricsCollection,
    processor::Processor,
    instruction::{DecodedInstruction, InstructionMetadata, NestedInstructions},
};
use carbon_omnipair_decoder::instructions::OmnipairInstruction;
use crate::database;

pub struct OmnipairInstructionProcessor;

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
            _ => {
                log::debug!("Unhandled instruction type: {:?}", instruction.data);
            }
        }

        Ok(())
    }
}

impl OmnipairInstructionProcessor {
    pub fn new() -> Self {
        Self
    }

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
        
        if let Err(e) = database::insert_swap_event(&swap_event, &tx_signature, slot).await {
            log::error!("Failed to insert swap event: {}", e);
            return Err(e);
        }
        
        log::info!(
            "Successfully processed SwapEvent - Pair: {}, User: {}, TxSig: {}", 
            swap_event.pair, 
            swap_event.user, 
            tx_signature
        );
        
        Ok(())
    }
}

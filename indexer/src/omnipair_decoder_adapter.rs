pub use omnipair_decoder::instructions::OmnipairInstruction;
use {
    carbon_core::instruction::{DecodedInstruction, InstructionDecoder},
    solana_instruction::AccountMeta,
    solana_pubkey::Pubkey,
    std::{env, sync::LazyLock},
};

pub static PROGRAM_ID: LazyLock<Pubkey> = LazyLock::new(|| {
    let program_id = env::var("OMNIPAIR_PROGRAM_ID")
        .unwrap_or_else(|_| omnipair_decoder::PROGRAM_ID.to_string());
    program_id.parse().expect("Invalid program ID")
});

#[derive(Debug, Clone, Copy, Default)]
pub struct PublishedOmnipairDecoder;

impl<'a> InstructionDecoder<'a> for PublishedOmnipairDecoder {
    type InstructionType = OmnipairInstruction;

    fn decode_instruction(
        &self,
        instruction: &'a solana_instruction::Instruction,
    ) -> Option<DecodedInstruction<Self::InstructionType>> {
        if instruction.program_id != *PROGRAM_ID {
            return None;
        }

        let published_instruction = solana_instruction_v3::Instruction {
            program_id: omnipair_decoder::PROGRAM_ID,
            accounts: instruction
                .accounts
                .iter()
                .map(account_meta_to_published)
                .collect(),
            data: instruction.data.clone(),
        };

        let decoded = <omnipair_decoder::OmnipairDecoder as carbon_core_v012::instruction::InstructionDecoder>::decode_instruction(
            &omnipair_decoder::OmnipairDecoder,
            &published_instruction,
        )?;

        Some(DecodedInstruction {
            program_id: instruction.program_id,
            data: decoded.data,
            accounts: instruction.accounts.clone(),
        })
    }
}

fn account_meta_to_published(account: &AccountMeta) -> solana_instruction_v3::AccountMeta {
    solana_instruction_v3::AccountMeta {
        pubkey: pubkey_to_published(account.pubkey),
        is_signer: account.is_signer,
        is_writable: account.is_writable,
    }
}

fn pubkey_to_published(pubkey: Pubkey) -> solana_pubkey_v3::Pubkey {
    solana_pubkey_v3::Pubkey::from(pubkey.to_bytes())
}

#[cfg(test)]
mod tests {
    use {
        super::*,
        carbon_core_v012::borsh::BorshSerialize,
        omnipair_decoder::{
            events::{
                adjust_collateral_event::AdjustCollateralEventEvent,
                adjust_debt_event::AdjustDebtEventEvent,
                adjust_liquidity_event::AdjustLiquidityEventEvent, burn_event::BurnEventEvent,
                claim_protocol_fees_event::ClaimProtocolFeesEventEvent,
                flashloan_event::FlashloanEventEvent, mint_event::MintEventEvent,
                pair_created_event::PairCreatedEventEvent, swap_event::SwapEventEvent,
                update_pair_event::UpdatePairEventEvent,
                user_liquidity_position_updated_event::UserLiquidityPositionUpdatedEventEvent,
                user_position_created_event::UserPositionCreatedEventEvent,
                user_position_liquidated_event::UserPositionLiquidatedEventEvent,
                user_position_updated_event::UserPositionUpdatedEventEvent,
            },
            instructions::CpiEvent,
            types::{CreateRateModelArgs, EventMetadata},
        },
    };

    const CPI_EVENT_DISCRIMINATOR: [u8; 8] = [228, 69, 165, 46, 81, 203, 154, 29];
    const ADJUST_COLLATERAL_EVENT_DISCRIMINATOR: [u8; 8] = [99, 246, 67, 126, 44, 252, 193, 33];
    const ADJUST_DEBT_EVENT_DISCRIMINATOR: [u8; 8] = [153, 8, 169, 116, 207, 116, 155, 128];
    const ADJUST_LIQUIDITY_EVENT_DISCRIMINATOR: [u8; 8] = [229, 162, 211, 39, 159, 251, 24, 78];
    const BURN_EVENT_DISCRIMINATOR: [u8; 8] = [33, 89, 47, 117, 82, 124, 238, 250];
    const CLAIM_PROTOCOL_FEES_EVENT_DISCRIMINATOR: [u8; 8] =
        [131, 163, 209, 112, 123, 133, 105, 235];
    const FLASHLOAN_EVENT_DISCRIMINATOR: [u8; 8] = [34, 49, 239, 242, 228, 45, 20, 97];
    const MINT_EVENT_DISCRIMINATOR: [u8; 8] = [197, 144, 146, 149, 66, 164, 95, 16];
    const PAIR_CREATED_EVENT_DISCRIMINATOR: [u8; 8] = [118, 0, 50, 196, 55, 255, 121, 43];
    const SWAP_EVENT_DISCRIMINATOR: [u8; 8] = [64, 198, 205, 232, 38, 8, 113, 226];
    const UPDATE_PAIR_EVENT_DISCRIMINATOR: [u8; 8] = [44, 6, 60, 245, 142, 38, 166, 247];
    const USER_LIQUIDITY_POSITION_UPDATED_EVENT_DISCRIMINATOR: [u8; 8] =
        [255, 227, 32, 107, 211, 246, 39, 78];
    const USER_POSITION_CREATED_EVENT_DISCRIMINATOR: [u8; 8] =
        [240, 132, 92, 227, 209, 72, 178, 169];
    const USER_POSITION_LIQUIDATED_EVENT_DISCRIMINATOR: [u8; 8] =
        [220, 137, 217, 3, 242, 190, 238, 216];
    const USER_POSITION_UPDATED_EVENT_DISCRIMINATOR: [u8; 8] = [83, 168, 197, 88, 89, 42, 58, 102];
    const CREATE_RATE_MODEL_DISCRIMINATOR: [u8; 8] = [128, 221, 68, 197, 26, 158, 219, 171];

    fn published_pubkey(seed: u8) -> solana_pubkey_v3::Pubkey {
        solana_pubkey_v3::Pubkey::from([seed; 32])
    }

    fn event_metadata() -> EventMetadata {
        EventMetadata {
            signer: published_pubkey(1),
            pair: published_pubkey(2),
            slot: 123_456,
        }
    }

    fn encode_cpi_event<T: BorshSerialize>(discriminator: [u8; 8], event: &T) -> Vec<u8> {
        let mut data = Vec::from(CPI_EVENT_DISCRIMINATOR);
        data.extend_from_slice(&discriminator);
        event.serialize(&mut data).expect("event serializes");
        data
    }

    fn instruction(data: Vec<u8>) -> solana_instruction::Instruction {
        solana_instruction::Instruction {
            program_id: *PROGRAM_ID,
            accounts: Vec::new(),
            data,
        }
    }

    fn decode(data: Vec<u8>) -> OmnipairInstruction {
        PublishedOmnipairDecoder
            .decode_instruction(&instruction(data))
            .expect("instruction decodes")
            .data
    }

    #[test]
    fn decodes_all_cpi_events_from_published_decoder() {
        let adjust_collateral = AdjustCollateralEventEvent {
            amount0: -10,
            amount1: 20,
            metadata: event_metadata(),
        };
        assert_eq!(
            decode(encode_cpi_event(
                ADJUST_COLLATERAL_EVENT_DISCRIMINATOR,
                &adjust_collateral
            )),
            OmnipairInstruction::CpiEvent(CpiEvent::AdjustCollateralEvent(adjust_collateral))
        );

        let adjust_debt = AdjustDebtEventEvent {
            amount0: 30,
            amount1: -40,
            metadata: event_metadata(),
        };
        assert_eq!(
            decode(encode_cpi_event(
                ADJUST_DEBT_EVENT_DISCRIMINATOR,
                &adjust_debt
            )),
            OmnipairInstruction::CpiEvent(CpiEvent::AdjustDebtEvent(adjust_debt))
        );

        let adjust_liquidity = AdjustLiquidityEventEvent {
            amount0: 50,
            amount1: 60,
            liquidity: 70,
            metadata: event_metadata(),
        };
        assert_eq!(
            decode(encode_cpi_event(
                ADJUST_LIQUIDITY_EVENT_DISCRIMINATOR,
                &adjust_liquidity
            )),
            OmnipairInstruction::CpiEvent(CpiEvent::AdjustLiquidityEvent(adjust_liquidity))
        );

        let burn = BurnEventEvent {
            amount0: 80,
            amount1: 90,
            liquidity: 100,
            metadata: event_metadata(),
        };
        assert_eq!(
            decode(encode_cpi_event(BURN_EVENT_DISCRIMINATOR, &burn)),
            OmnipairInstruction::CpiEvent(CpiEvent::BurnEvent(burn))
        );

        let claim_protocol_fees = ClaimProtocolFeesEventEvent {
            token0: published_pubkey(3),
            token1: published_pubkey(4),
            futarchy_treasury_amount0: 110,
            futarchy_treasury_amount1: 120,
            buybacks_vault_amount0: 130,
            buybacks_vault_amount1: 140,
            team_treasury_amount0: 150,
            team_treasury_amount1: 160,
            metadata: event_metadata(),
        };
        assert_eq!(
            decode(encode_cpi_event(
                CLAIM_PROTOCOL_FEES_EVENT_DISCRIMINATOR,
                &claim_protocol_fees
            )),
            OmnipairInstruction::CpiEvent(CpiEvent::ClaimProtocolFeesEvent(claim_protocol_fees))
        );

        let flashloan = FlashloanEventEvent {
            amount0: 170,
            amount1: 180,
            fee0: 190,
            fee1: 200,
            receiver: published_pubkey(5),
            metadata: event_metadata(),
        };
        assert_eq!(
            decode(encode_cpi_event(FLASHLOAN_EVENT_DISCRIMINATOR, &flashloan)),
            OmnipairInstruction::CpiEvent(CpiEvent::FlashloanEvent(flashloan))
        );

        let mint = MintEventEvent {
            amount0: 210,
            amount1: 220,
            liquidity: 230,
            metadata: event_metadata(),
        };
        assert_eq!(
            decode(encode_cpi_event(MINT_EVENT_DISCRIMINATOR, &mint)),
            OmnipairInstruction::CpiEvent(CpiEvent::MintEvent(mint))
        );

        let pair_created = PairCreatedEventEvent {
            token0: published_pubkey(6),
            token1: published_pubkey(7),
            lp_mint: published_pubkey(8),
            token0_decimals: 6,
            token1_decimals: 9,
            rate_model: published_pubkey(9),
            swap_fee_bps: 25,
            half_life: 86_400,
            fixed_cf_bps: Some(8_500),
            target_util_start_bps: 5_000,
            target_util_end_bps: 9_000,
            rate_half_life_ms: 3_600_000,
            min_rate_bps: 100,
            max_rate_bps: 20_000,
            params_hash: [10; 32],
            version: 2,
            metadata: event_metadata(),
        };
        assert_eq!(
            decode(encode_cpi_event(
                PAIR_CREATED_EVENT_DISCRIMINATOR,
                &pair_created
            )),
            OmnipairInstruction::CpiEvent(CpiEvent::PairCreatedEvent(pair_created))
        );

        let swap = SwapEventEvent {
            reserve0: 240,
            reserve1: 250,
            is_token0_in: true,
            amount_in: 260,
            amount_out: 270,
            amount_in_after_fee: 255,
            lp_fee: 4,
            protocol_fee: 1,
            metadata: event_metadata(),
        };
        assert_eq!(
            decode(encode_cpi_event(SWAP_EVENT_DISCRIMINATOR, &swap)),
            OmnipairInstruction::CpiEvent(CpiEvent::SwapEvent(swap))
        );

        let update_pair = UpdatePairEventEvent {
            price0_ema: 280,
            price1_ema: 290,
            rate0: 300,
            rate1: 310,
            accrued_interest0: 320,
            accrued_interest1: 330,
            lp_interest0: 340,
            lp_interest1: 350,
            protocol_interest0: 360,
            protocol_interest1: 370,
            cash_reserve0: 380,
            cash_reserve1: 390,
            reserve0_after_interest: 400,
            reserve1_after_interest: 410,
            metadata: event_metadata(),
        };
        assert_eq!(
            decode(encode_cpi_event(
                UPDATE_PAIR_EVENT_DISCRIMINATOR,
                &update_pair
            )),
            OmnipairInstruction::CpiEvent(CpiEvent::UpdatePairEvent(update_pair))
        );

        let user_liquidity_position_updated = UserLiquidityPositionUpdatedEventEvent {
            token0_amount: 420,
            token1_amount: 430,
            lp_amount: 440,
            cash_reserve0: 450,
            cash_reserve1: 460,
            token0_mint: published_pubkey(11),
            token1_mint: published_pubkey(12),
            lp_mint: published_pubkey(13),
            metadata: event_metadata(),
        };
        assert_eq!(
            decode(encode_cpi_event(
                USER_LIQUIDITY_POSITION_UPDATED_EVENT_DISCRIMINATOR,
                &user_liquidity_position_updated
            )),
            OmnipairInstruction::CpiEvent(CpiEvent::UserLiquidityPositionUpdatedEvent(
                user_liquidity_position_updated
            ))
        );

        let user_position_created = UserPositionCreatedEventEvent {
            position: published_pubkey(14),
            metadata: event_metadata(),
        };
        assert_eq!(
            decode(encode_cpi_event(
                USER_POSITION_CREATED_EVENT_DISCRIMINATOR,
                &user_position_created
            )),
            OmnipairInstruction::CpiEvent(CpiEvent::UserPositionCreatedEvent(
                user_position_created
            ))
        );

        let user_position_liquidated = UserPositionLiquidatedEventEvent {
            position: published_pubkey(15),
            liquidator: published_pubkey(16),
            collateral0_liquidated: 470,
            collateral1_liquidated: 480,
            debt0_liquidated: 490,
            debt1_liquidated: 500,
            collateral_price: 510,
            shortfall: 520,
            liquidation_bonus_applied: 530,
            k0: 540,
            k1: 550,
            metadata: event_metadata(),
        };
        assert_eq!(
            decode(encode_cpi_event(
                USER_POSITION_LIQUIDATED_EVENT_DISCRIMINATOR,
                &user_position_liquidated
            )),
            OmnipairInstruction::CpiEvent(CpiEvent::UserPositionLiquidatedEvent(
                user_position_liquidated
            ))
        );

        let user_position_updated = UserPositionUpdatedEventEvent {
            position: published_pubkey(17),
            collateral0: 560,
            collateral1: 570,
            debt0_shares: 580,
            debt1_shares: 590,
            collateral0_max_cf_bps: 8_500,
            collateral1_max_cf_bps: 8_000,
            collateral0_liquidation_cf_bps: 9_000,
            collateral1_liquidation_cf_bps: 8_500,
            metadata: event_metadata(),
        };
        assert_eq!(
            decode(encode_cpi_event(
                USER_POSITION_UPDATED_EVENT_DISCRIMINATOR,
                &user_position_updated
            )),
            OmnipairInstruction::CpiEvent(CpiEvent::UserPositionUpdatedEvent(
                user_position_updated
            ))
        );
    }

    #[test]
    fn decodes_new_top_level_instructions_from_published_decoder() {
        let create_rate_model = omnipair_decoder::instructions::CreateRateModel {
            args: CreateRateModelArgs {
                target_util_start_bps: 6_500,
                target_util_end_bps: 8_500,
                half_life_ms: 3_600_000,
                min_rate_bps: 100,
                max_rate_bps: 20_000,
                initial_rate_bps: 500,
            },
        };

        let mut data = Vec::from(CREATE_RATE_MODEL_DISCRIMINATOR);
        create_rate_model
            .serialize(&mut data)
            .expect("instruction serializes");

        assert_eq!(
            decode(data),
            OmnipairInstruction::CreateRateModel(create_rate_model)
        );
    }

    #[test]
    fn rejects_other_programs_before_delegating_to_published_decoder() {
        let mut wrong_program = instruction(Vec::from(CREATE_RATE_MODEL_DISCRIMINATOR));
        wrong_program.program_id = Pubkey::new_unique();

        assert!(
            PublishedOmnipairDecoder
                .decode_instruction(&wrong_program)
                .is_none()
        );
    }
}

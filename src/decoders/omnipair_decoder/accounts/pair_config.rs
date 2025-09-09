
 
use carbon_core::{borsh, CarbonDeserialize};

#[derive(
    CarbonDeserialize, Debug, serde::Deserialize, serde::Serialize, PartialEq, Eq, Clone, Hash,
)] 
 

#[carbon(discriminator = "0x77a70d8188e4974d")] 
pub struct PairConfig {
        pub futarchy_fee_bps: u16,
        pub founder_fee_bps: u16,
        pub nonce: u64,
        pub bump: u8, 
}
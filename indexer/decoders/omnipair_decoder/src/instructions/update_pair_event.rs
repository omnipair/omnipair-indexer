

use carbon_core::{borsh, CarbonDeserialize};


#[derive(CarbonDeserialize, Debug, serde::Serialize, serde::Deserialize, PartialEq, Eq, Clone, Hash)]
#[carbon(discriminator = "0xe445a52e51cb9a1d2c063cf58e26a6f7")]
pub struct UpdatePairEvent{
    pub price0_ema: u64,
    pub price1_ema: u64,
    pub rate0: u64,
    pub rate1: u64,
    pub timestamp: i64,
}

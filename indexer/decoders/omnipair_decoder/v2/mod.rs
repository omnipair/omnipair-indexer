// This V2 decoder code is generated from
// packages/program-interface/src/idl_v2.json.
use std::{env, sync::LazyLock};

pub static PROGRAM_ID: LazyLock<solana_pubkey::Pubkey> = LazyLock::new(|| {
    let program_id_str = env::var("OMNIPAIR_V2_PROGRAM_ID")
        .unwrap_or_else(|_| "oMNi2XGwWxDbEvhS2pWRQ6dtw8GkNBV42hfLZD6WmMF".to_string());
    program_id_str.parse().expect("Invalid V2 program ID")
});

pub struct OmnipairV2Decoder;

pub mod accounts;
pub mod instructions;
pub mod types;

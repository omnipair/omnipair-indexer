//! Omnipair Indexer - A modular indexer for Omnipair protocol events
//! 
//! This crate provides a clean, modular architecture for indexing Omnipair protocol
//! events from Solana blockchain transactions.

pub mod config;
pub mod database;
pub mod datasources;
pub mod health;
pub mod pipeline;
pub mod processors;
pub mod signals;

// Re-export commonly used types for convenience
pub use config::{Args, Config};
pub use database::{init_db_pool, insert_swap_event};
pub use processors::OmnipairInstructionProcessor;
pub use datasources::{create_helius_datasource, GpaBackfillDatasource};
pub use pipeline::{create_pipeline, run_pipeline};
pub use health::run_health_server;
pub use signals::shutdown_signal;

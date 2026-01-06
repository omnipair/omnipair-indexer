//! Omnipair Indexer - A modular indexer for Omnipair protocol events
//!
//! This crate provides a clean, modular architecture for indexing Omnipair
//! protocol events from Solana blockchain transactions.

pub mod config;
pub mod database;
pub mod datasources;
pub mod health;
pub mod pipeline;
pub mod processors;
pub mod signals;
pub mod websocket_server;

// Re-export commonly used types for convenience
pub use {
    config::{Args, Config},
    database::{init_db_pool, upsert_swap_event},
    datasources::{create_helius_datasource, GpaBackfillDatasource},
    health::run_health_server,
    pipeline::{create_pipeline, run_pipeline},
    processors::OmnipairInstructionProcessor,
    signals::{shutdown_signal, shutdown_signal_token},
    websocket_server::{start_websocket_server, WebSocketConfig, WebSocketServerState},
};

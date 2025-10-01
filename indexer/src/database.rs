use carbon_core::error::CarbonResult;
use carbon_omnipair_decoder::instructions::{
    swap_event::SwapEvent,
    leverage_position_created_event::LeveragePositionCreatedEvent,
    leverage_position_updated_event::LeveragePositionUpdatedEvent,
};
use sqlx::PgPool;
use tokio::sync::OnceCell;
use chrono::{DateTime, Utc};

static DB_POOL: OnceCell<PgPool> = OnceCell::const_new();

/// Initialize the database connection pool
pub async fn init_db_pool() -> CarbonResult<()> {
    let database_url = std::env::var("DATABASE_URL")
        .map_err(|_| carbon_core::error::Error::Custom("DATABASE_URL environment variable not set".to_string()))?;
    
    let pool = PgPool::connect(&database_url).await
        .map_err(|e| carbon_core::error::Error::Custom(format!("Failed to connect to database: {}", e)))?;
    
    // Test the connection
    sqlx::query("SELECT 1")
        .fetch_one(&pool)
        .await
        .map_err(|e| carbon_core::error::Error::Custom(format!("Database connection test failed: {}", e)))?;
    
    DB_POOL.set(pool)
        .map_err(|_| carbon_core::error::Error::Custom("Failed to initialize database pool".to_string()))?;
    
    log::info!("Database connection pool initialized successfully");
    Ok(())
}

/// Get the database pool
pub fn get_db_pool() -> CarbonResult<&'static PgPool> {
    DB_POOL.get()
        .ok_or_else(|| carbon_core::error::Error::Custom("Database pool not initialized. Call init_db_pool() first".to_string()))
}

/// Upsert a swap event into the database (handles duplicate tx_sig)
pub async fn upsert_swap_event(
    swap_event: &SwapEvent,
    tx_signature: &str,
    slot: i64,
) -> CarbonResult<()> {
    let pool = get_db_pool()?;
    
    // Calculate fee amounts
    let fee_amount = swap_event.amount_in - swap_event.amount_in_after_fee;
    let fee_paid0 = if swap_event.is_token0_in {
        fee_amount
    } else {
        // Convert token1 fee to token0 equivalent using reserve ratio
        (swap_event.reserve0 as f64 / swap_event.reserve1 as f64 * fee_amount as f64) as u64
    };
    let fee_paid1 = if swap_event.is_token0_in {
        // Convert token0 fee to token1 equivalent using reserve ratio  
        (swap_event.reserve1 as f64 / swap_event.reserve0 as f64 * fee_amount as f64) as u64
    } else {
        fee_amount
    };
    
    let upsert_result = sqlx::query(
        r#"
        INSERT INTO swaps (
            pair, user_address, is_token0_in, amount_in, amount_out, 
            reserve0, reserve1, timestamp, tx_sig, slot, fee_paid0, fee_paid1
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (tx_sig) DO UPDATE SET
            pair = EXCLUDED.pair,
            user_address = EXCLUDED.user_address,
            is_token0_in = EXCLUDED.is_token0_in,
            amount_in = EXCLUDED.amount_in,
            amount_out = EXCLUDED.amount_out,
            reserve0 = EXCLUDED.reserve0,
            reserve1 = EXCLUDED.reserve1,
            timestamp = EXCLUDED.timestamp,
            slot = EXCLUDED.slot,
            fee_paid0 = EXCLUDED.fee_paid0,
            fee_paid1 = EXCLUDED.fee_paid1
        "#
    )
    .bind(swap_event.metadata.pair.to_string())
    .bind(swap_event.metadata.signer.to_string())
    .bind(swap_event.is_token0_in)
    .bind(bigdecimal::BigDecimal::from(swap_event.amount_in))
    .bind(bigdecimal::BigDecimal::from(swap_event.amount_out))
    .bind(bigdecimal::BigDecimal::from(swap_event.reserve0))
    .bind(bigdecimal::BigDecimal::from(swap_event.reserve1))
    .bind(DateTime::<Utc>::from_timestamp(swap_event.metadata.timestamp, 0)
        .ok_or_else(|| carbon_core::error::Error::Custom("Invalid timestamp".to_string()))?)
    .bind(tx_signature)
    .bind(bigdecimal::BigDecimal::from(slot))
    .bind(bigdecimal::BigDecimal::from(fee_paid0))
    .bind(bigdecimal::BigDecimal::from(fee_paid1))
    .execute(pool)
    .await;
    
    if let Err(e) = upsert_result {
        log::error!("Failed to upsert into swaps table: {}", e);
        return Err(carbon_core::error::Error::Custom(format!("Failed to upsert swap: {}", e)));
    }
    
    Ok(())
}

pub async fn upsert_leverage_position_created_event(
    event: &LeveragePositionCreatedEvent,
    tx_signature: &str,
    slot: i64,
) -> CarbonResult<()> {
    let pool = get_db_pool()?;
    
    let upsert_result = sqlx::query(
        r#"
        INSERT INTO leverage_position_created_events (
            position_address, pair_address, user_address, timestamp, tx_signature, slot
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (tx_signature) DO UPDATE SET
            position_address = EXCLUDED.position_address,
            pair_address = EXCLUDED.pair_address,
            user_address = EXCLUDED.user_address,
            timestamp = EXCLUDED.timestamp,
            slot = EXCLUDED.slot
        "#
    )
    .bind(event.position.to_string())
    .bind(event.metadata.pair.to_string())
    .bind(event.metadata.signer.to_string())
    .bind(DateTime::<Utc>::from_timestamp(event.metadata.timestamp, 0)
        .ok_or_else(|| carbon_core::error::Error::Custom("Invalid timestamp".to_string()))?)
    .bind(tx_signature)
    .bind(bigdecimal::BigDecimal::from(slot))
    .execute(pool)
    .await;
    
    if let Err(e) = upsert_result {
        log::error!("Failed to upsert into leverage_position_created_events table: {}", e);
        return Err(carbon_core::error::Error::Custom(format!("Failed to upsert leverage position created event: {}", e)));
    }
    
    Ok(())
}

pub async fn upsert_leverage_position_updated_event(
    event: &LeveragePositionUpdatedEvent,
    tx_signature: &str,
    slot: i64,
) -> CarbonResult<()> {
    let pool = get_db_pool()?;
    
    let upsert_result = sqlx::query(
        r#"
        INSERT INTO leverage_position_updated_events (
            position_address, pair_address, user_address, long_token0, target_leverage_bps,
            debt_delta, debt_amount, collateral_deposited, collateral_delta, 
            collateral_position_size, collateral_leverage_multiplier_bps, applied_cf_bps,
            liquidation_price_nad, entry_price_nad, timestamp, tx_signature, slot
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17)
        ON CONFLICT (tx_signature) DO UPDATE SET
            position_address = EXCLUDED.position_address,
            pair_address = EXCLUDED.pair_address,
            user_address = EXCLUDED.user_address,
            long_token0 = EXCLUDED.long_token0,
            target_leverage_bps = EXCLUDED.target_leverage_bps,
            debt_delta = EXCLUDED.debt_delta,
            debt_amount = EXCLUDED.debt_amount,
            collateral_deposited = EXCLUDED.collateral_deposited,
            collateral_delta = EXCLUDED.collateral_delta,
            collateral_position_size = EXCLUDED.collateral_position_size,
            collateral_leverage_multiplier_bps = EXCLUDED.collateral_leverage_multiplier_bps,
            applied_cf_bps = EXCLUDED.applied_cf_bps,
            liquidation_price_nad = EXCLUDED.liquidation_price_nad,
            entry_price_nad = EXCLUDED.entry_price_nad,
            timestamp = EXCLUDED.timestamp,
            slot = EXCLUDED.slot
        "#
    )
    .bind(event.position.to_string())
    .bind(event.metadata.pair.to_string())
    .bind(event.metadata.signer.to_string())
    .bind(event.long_token0)
    .bind(event.target_leverage_bps as i32)
    .bind(event.debt_delta)
    .bind(bigdecimal::BigDecimal::from(event.debt_amount))
    .bind(bigdecimal::BigDecimal::from(event.collateral_deposited))
    .bind(event.collateral_delta)
    .bind(bigdecimal::BigDecimal::from(event.collateral_position_size))
    .bind(event.collateral_leverage_multiplier_bps as i16)
    .bind(event.applied_cf_bps as i16)
    .bind(bigdecimal::BigDecimal::from(event.liquidation_price_nad))
    .bind(bigdecimal::BigDecimal::from(event.entry_price_nad))
    .bind(DateTime::<Utc>::from_timestamp(event.metadata.timestamp, 0)
        .ok_or_else(|| carbon_core::error::Error::Custom("Invalid timestamp".to_string()))?)
    .bind(tx_signature)
    .bind(bigdecimal::BigDecimal::from(slot))
    .execute(pool)
    .await;
    
    if let Err(e) = upsert_result {
        log::error!("Failed to upsert into leverage_position_updated_events table: {}", e);
        return Err(carbon_core::error::Error::Custom(format!("Failed to upsert leverage position updated event: {}", e)));
    }
    
    Ok(())
}


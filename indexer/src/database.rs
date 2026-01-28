use carbon_core::error::CarbonResult;
use carbon_omnipair_decoder::instructions::{
    swap_event::SwapEvent,
    mint_event::MintEvent,
    burn_event::BurnEvent,
    adjust_collateral_event::AdjustCollateralEvent,
    adjust_debt_event::AdjustDebtEvent,
    user_position_updated_event::UserPositionUpdatedEvent,
    user_position_liquidated_event::UserPositionLiquidatedEvent,
    user_liquidity_position_updated_event::UserLiquidityPositionUpdatedEvent,
    pair_created_event::PairCreatedEvent,
};
use sqlx::PgPool;
use tokio::sync::OnceCell;

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
        ON CONFLICT (tx_sig, timestamp) DO UPDATE SET
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
    .bind(chrono::Utc::now())
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

/// Upsert a mint event into the adjust_liquidity table
pub async fn upsert_mint_event(
    event: &MintEvent,
    tx_signature: &str,
    _slot: i64,
) -> CarbonResult<()> {
    let pool = get_db_pool()?;
    
    let upsert_result = sqlx::query(
        r#"
        INSERT INTO adjust_liquidity (
            pair, user_address, amount0, amount1, liquidity, tx_sig, timestamp, event_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::liquidity_event_type)
        ON CONFLICT (tx_sig, timestamp) DO UPDATE SET
            pair = EXCLUDED.pair,
            user_address = EXCLUDED.user_address,
            amount0 = EXCLUDED.amount0,
            amount1 = EXCLUDED.amount1,
            liquidity = EXCLUDED.liquidity,
            timestamp = EXCLUDED.timestamp,
            event_type = EXCLUDED.event_type
        "#
    )
    .bind(event.metadata.pair.to_string())
    .bind(event.metadata.signer.to_string())
    .bind(bigdecimal::BigDecimal::from(event.amount0))
    .bind(bigdecimal::BigDecimal::from(event.amount1))
    .bind(bigdecimal::BigDecimal::from(event.liquidity))
    .bind(tx_signature)
    .bind(chrono::Utc::now())
    .bind("add") // MintEvent = "add" liquidity
    .execute(pool)
    .await;
    
    if let Err(e) = upsert_result {
        log::error!("Failed to upsert into adjust_liquidity table: {}", e);
        return Err(carbon_core::error::Error::Custom(format!("Failed to upsert mint event: {}", e)));
    }
    
    Ok(())
}

/// Upsert a burn event into the adjust_liquidity table
pub async fn upsert_burn_event(
    event: &BurnEvent,
    tx_signature: &str,
    _slot: i64,
) -> CarbonResult<()> {
    let pool = get_db_pool()?;
    
    let upsert_result = sqlx::query(
        r#"
        INSERT INTO adjust_liquidity (
            pair, user_address, amount0, amount1, liquidity, tx_sig, timestamp, event_type
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::liquidity_event_type)
        ON CONFLICT (tx_sig, timestamp) DO UPDATE SET
            pair = EXCLUDED.pair,
            user_address = EXCLUDED.user_address,
            amount0 = EXCLUDED.amount0,
            amount1 = EXCLUDED.amount1,
            liquidity = EXCLUDED.liquidity,
            timestamp = EXCLUDED.timestamp,
            event_type = EXCLUDED.event_type
        "#
    )
    .bind(event.metadata.pair.to_string())
    .bind(event.metadata.signer.to_string())
    .bind(bigdecimal::BigDecimal::from(event.amount0))
    .bind(bigdecimal::BigDecimal::from(event.amount1))
    .bind(bigdecimal::BigDecimal::from(event.liquidity))
    .bind(tx_signature)
    .bind(chrono::Utc::now())
    .bind("remove") // BurnEvent = "remove" liquidity
    .execute(pool)
    .await;
    
    if let Err(e) = upsert_result {
        log::error!("Failed to upsert into adjust_liquidity table: {}", e);
        return Err(carbon_core::error::Error::Custom(format!("Failed to upsert burn event: {}", e)));
    }
    
    Ok(())
}

/// Upsert an AdjustCollateralEvent into the database
pub async fn upsert_adjust_collateral_event(
    event: &AdjustCollateralEvent,
    tx_signature: &str,
    slot: i64,
) -> CarbonResult<()> {
    let pool = get_db_pool()?;
    
    let upsert_result = sqlx::query(
        r#"
        INSERT INTO adjust_collateral_events (
            pair, signer, amount0, amount1, transaction_signature, slot, event_timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (transaction_signature) DO UPDATE SET
            pair = EXCLUDED.pair,
            signer = EXCLUDED.signer,
            amount0 = EXCLUDED.amount0,
            amount1 = EXCLUDED.amount1,
            slot = EXCLUDED.slot,
            event_timestamp = EXCLUDED.event_timestamp
        "#
    )
    .bind(event.metadata.pair.to_string())
    .bind(event.metadata.signer.to_string())
    .bind(bigdecimal::BigDecimal::from(event.amount0))
    .bind(bigdecimal::BigDecimal::from(event.amount1))
    .bind(tx_signature)
    .bind(bigdecimal::BigDecimal::from(slot))
    .bind(chrono::Utc::now())
    .execute(pool)
    .await;
    
    if let Err(e) = upsert_result {
        log::error!("Failed to upsert into adjust_collateral_events table: {}", e);
        return Err(carbon_core::error::Error::Custom(format!("Failed to upsert adjust collateral event: {}", e)));
    }
    
    Ok(())
}

/// Upsert an AdjustDebtEvent into the database
pub async fn upsert_adjust_debt_event(
    event: &AdjustDebtEvent,
    tx_signature: &str,
    slot: i64,
) -> CarbonResult<()> {
    let pool = get_db_pool()?;
    
    let upsert_result = sqlx::query(
        r#"
        INSERT INTO adjust_debt_events (
            pair, signer, amount0, amount1, transaction_signature, slot, event_timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7)
        ON CONFLICT (transaction_signature) DO UPDATE SET
            pair = EXCLUDED.pair,
            signer = EXCLUDED.signer,
            amount0 = EXCLUDED.amount0,
            amount1 = EXCLUDED.amount1,
            slot = EXCLUDED.slot,
            event_timestamp = EXCLUDED.event_timestamp
        "#
    )
    .bind(event.metadata.pair.to_string())
    .bind(event.metadata.signer.to_string())
    .bind(bigdecimal::BigDecimal::from(event.amount0))
    .bind(bigdecimal::BigDecimal::from(event.amount1))
    .bind(tx_signature)
    .bind(bigdecimal::BigDecimal::from(slot))
    .bind(chrono::Utc::now())
    .execute(pool)
    .await;
    
    if let Err(e) = upsert_result {
        log::error!("Failed to upsert into adjust_debt_events table: {}", e);
        return Err(carbon_core::error::Error::Custom(format!("Failed to upsert adjust debt event: {}", e)));
    }
    
    Ok(())
}

/// Upsert a UserPositionUpdatedEvent into the database
pub async fn upsert_user_position_updated_event(
    event: &UserPositionUpdatedEvent,
    tx_signature: &str,
    slot: i64,
) -> CarbonResult<()> {
    let pool = get_db_pool()?;
    
    // Compute event_timestamp once for reuse
    let event_timestamp = chrono::Utc::now();
    
    let upsert_result = sqlx::query(
        r#"
        INSERT INTO user_position_updated_events (
            pair, signer, position, collateral0, collateral1, debt0_shares, debt1_shares,
            collateral0_applied_min_cf_bps, collateral1_applied_min_cf_bps,
            transaction_signature, slot, event_timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (transaction_signature) DO UPDATE SET
            pair = EXCLUDED.pair,
            signer = EXCLUDED.signer,
            position = EXCLUDED.position,
            collateral0 = EXCLUDED.collateral0,
            collateral1 = EXCLUDED.collateral1,
            debt0_shares = EXCLUDED.debt0_shares,
            debt1_shares = EXCLUDED.debt1_shares,
            collateral0_applied_min_cf_bps = EXCLUDED.collateral0_applied_min_cf_bps,
            collateral1_applied_min_cf_bps = EXCLUDED.collateral1_applied_min_cf_bps,
            slot = EXCLUDED.slot,
            event_timestamp = EXCLUDED.event_timestamp
        "#
    )
    .bind(event.metadata.pair.to_string())
    .bind(event.metadata.signer.to_string())
    .bind(event.position.to_string())
    .bind(bigdecimal::BigDecimal::from(event.collateral0))
    .bind(bigdecimal::BigDecimal::from(event.collateral1))
    .bind(bigdecimal::BigDecimal::from(bigdecimal::num_bigint::BigInt::from(event.debt0_shares)))
    .bind(bigdecimal::BigDecimal::from(bigdecimal::num_bigint::BigInt::from(event.debt1_shares)))
    .bind(event.collateral0_applied_min_cf_bps as i32)
    .bind(event.collateral1_applied_min_cf_bps as i32)
    .bind(tx_signature)
    .bind(bigdecimal::BigDecimal::from(slot))
    .bind(event_timestamp)
    .execute(pool)
    .await;
    
    if let Err(e) = upsert_result {
        log::error!("Failed to upsert into user_position_updated_events table: {}", e);
        return Err(carbon_core::error::Error::Custom(format!("Failed to upsert user position updated event: {}", e)));
    }
    
    // Also upsert into user_borrow_positions table (latest position per pair per signer)
    
    let upsert_latest_result = sqlx::query(
        r#"
        INSERT INTO user_borrow_positions (
            pair, signer, position, collateral0, collateral1, debt0_shares, debt1_shares,
            collateral0_applied_min_cf_bps, collateral1_applied_min_cf_bps,
            slot, event_timestamp, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12)
        ON CONFLICT (pair, signer) DO UPDATE SET
            position = EXCLUDED.position,
            collateral0 = EXCLUDED.collateral0,
            collateral1 = EXCLUDED.collateral1,
            debt0_shares = EXCLUDED.debt0_shares,
            debt1_shares = EXCLUDED.debt1_shares,
            collateral0_applied_min_cf_bps = EXCLUDED.collateral0_applied_min_cf_bps,
            collateral1_applied_min_cf_bps = EXCLUDED.collateral1_applied_min_cf_bps,
            slot = EXCLUDED.slot,
            event_timestamp = EXCLUDED.event_timestamp,
            updated_at = EXCLUDED.updated_at
        "#
    )
    .bind(event.metadata.pair.to_string())
    .bind(event.metadata.signer.to_string())
    .bind(event.position.to_string())
    .bind(bigdecimal::BigDecimal::from(event.collateral0))
    .bind(bigdecimal::BigDecimal::from(event.collateral1))
    .bind(bigdecimal::BigDecimal::from(bigdecimal::num_bigint::BigInt::from(event.debt0_shares)))
    .bind(bigdecimal::BigDecimal::from(bigdecimal::num_bigint::BigInt::from(event.debt1_shares)))
    .bind(event.collateral0_applied_min_cf_bps as i32)
    .bind(event.collateral1_applied_min_cf_bps as i32)
    .bind(bigdecimal::BigDecimal::from(slot))
    .bind(event_timestamp)
    .bind(chrono::Utc::now())
    .execute(pool)
    .await;
    
    if let Err(e) = upsert_latest_result {
        log::error!("Failed to upsert into user_borrow_positions table: {}", e);
        return Err(carbon_core::error::Error::Custom(format!("Failed to upsert user borrow position: {}", e)));
    }
    
    Ok(())
}

/// Upsert a UserPositionLiquidatedEvent into the database
pub async fn upsert_user_position_liquidated_event(
    event: &UserPositionLiquidatedEvent,
    tx_signature: &str,
    slot: i64,
) -> CarbonResult<()> {
    let pool = get_db_pool()?;
    
    let upsert_result = sqlx::query(
        r#"
        INSERT INTO user_position_liquidated_events (
            pair, signer, position, liquidator, collateral0_liquidated, collateral1_liquidated,
            debt0_liquidated, debt1_liquidated, collateral_price, shortfall, liquidation_bonus_applied,
            k0, k1, transaction_signature, slot, event_timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
        ON CONFLICT (transaction_signature) DO UPDATE SET
            pair = EXCLUDED.pair,
            signer = EXCLUDED.signer,
            position = EXCLUDED.position,
            liquidator = EXCLUDED.liquidator,
            collateral0_liquidated = EXCLUDED.collateral0_liquidated,
            collateral1_liquidated = EXCLUDED.collateral1_liquidated,
            debt0_liquidated = EXCLUDED.debt0_liquidated,
            debt1_liquidated = EXCLUDED.debt1_liquidated,
            collateral_price = EXCLUDED.collateral_price,
            shortfall = EXCLUDED.shortfall,
            liquidation_bonus_applied = EXCLUDED.liquidation_bonus_applied,
            k0 = EXCLUDED.k0,
            k1 = EXCLUDED.k1,
            slot = EXCLUDED.slot,
            event_timestamp = EXCLUDED.event_timestamp
        "#
    )
    .bind(event.metadata.pair.to_string())
    .bind(event.metadata.signer.to_string())
    .bind(event.position.to_string())
    .bind(event.liquidator.to_string())
    .bind(bigdecimal::BigDecimal::from(event.collateral0_liquidated))
    .bind(bigdecimal::BigDecimal::from(event.collateral1_liquidated))
    .bind(bigdecimal::BigDecimal::from(event.debt0_liquidated))
    .bind(bigdecimal::BigDecimal::from(event.debt1_liquidated))
    .bind(bigdecimal::BigDecimal::from(event.collateral_price))
    .bind(bigdecimal::BigDecimal::from(bigdecimal::num_bigint::BigInt::from(event.shortfall)))
    .bind(bigdecimal::BigDecimal::from(event.liquidation_bonus_applied))
    .bind(bigdecimal::BigDecimal::from(bigdecimal::num_bigint::BigInt::from(event.k0)))
    .bind(bigdecimal::BigDecimal::from(bigdecimal::num_bigint::BigInt::from(event.k1)))
    .bind(tx_signature)
    .bind(bigdecimal::BigDecimal::from(slot))
    .bind(chrono::Utc::now())
    .execute(pool)
    .await;
    
    if let Err(e) = upsert_result {
        log::error!("Failed to upsert into user_position_liquidated_events table: {}", e);
        return Err(carbon_core::error::Error::Custom(format!("Failed to upsert user position liquidated event: {}", e)));
    }
    
    Ok(())
}

/// Upsert a PairCreatedEvent into the pools table
pub async fn upsert_pair_created_event(
    event: &PairCreatedEvent,
    _tx_signature: &str,
    _slot: i64,
) -> CarbonResult<()> {
    let pool = get_db_pool()?;
    
    let upsert_result = sqlx::query(
        r#"
        INSERT INTO pools (
            pair_address, token0, token1, lp_mint, rate_model, swap_fee_bps, half_life, fixed_cf_bps, params_hash, version
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        ON CONFLICT (pair_address) DO UPDATE SET
            token0 = EXCLUDED.token0,
            token1 = EXCLUDED.token1,
            lp_mint = EXCLUDED.lp_mint,
            rate_model = EXCLUDED.rate_model,
            swap_fee_bps = EXCLUDED.swap_fee_bps,
            half_life = EXCLUDED.half_life,
            fixed_cf_bps = EXCLUDED.fixed_cf_bps,
            params_hash = EXCLUDED.params_hash,
            version = EXCLUDED.version
        "#
    )
    .bind(event.metadata.pair.to_string())
    .bind(event.token0.to_string())
    .bind(event.token1.to_string())
    .bind(event.lp_mint.to_string())
    .bind(event.rate_model.to_string())
    .bind(event.swap_fee_bps as i32)
    .bind(event.half_life as i64)
    .bind(event.fixed_cf_bps.map(|bps| bps as i32))
    .bind(event.params_hash)
    .bind(event.version as i32)
    .execute(pool)
    .await;
    
    if let Err(e) = upsert_result {
        log::error!("Failed to upsert into pools table: {}", e);
        return Err(carbon_core::error::Error::Custom(format!("Failed to upsert pair created event: {}", e)));
    }
    
    Ok(())
}

/// Upsert a UserLiquidityPositionUpdatedEvent into the database
pub async fn upsert_user_liquidity_position_updated_event(
    event: &UserLiquidityPositionUpdatedEvent,
    _tx_signature: &str,
    _slot: i64,
) -> CarbonResult<()> {
    let pool = get_db_pool()?;
    
    // Compute event_timestamp once for reuse
    let event_timestamp = chrono::Utc::now();
    
    // First, upsert into user_lp_position_updated_events table
    let upsert_event_result = sqlx::query(
        r#"
        INSERT INTO user_lp_position_updated_events (
            pair_address, lp_amount, amount0, amount1, signer, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (id, timestamp) DO UPDATE SET
            pair_address = EXCLUDED.pair_address,
            lp_amount = EXCLUDED.lp_amount,
            amount0 = EXCLUDED.amount0,
            amount1 = EXCLUDED.amount1,
            signer = EXCLUDED.signer,
            timestamp = EXCLUDED.timestamp
        "#
    )
    .bind(event.metadata.pair.to_string())
    .bind(bigdecimal::BigDecimal::from(event.lp_amount))
    .bind(bigdecimal::BigDecimal::from(event.token0_amount))
    .bind(bigdecimal::BigDecimal::from(event.token1_amount))
    .bind(event.metadata.signer.to_string())
    .bind(event_timestamp)
    .execute(pool)
    .await;
    
    if let Err(e) = upsert_event_result {
        log::error!("Failed to upsert into user_lp_position_updated_events table: {}", e);
        return Err(carbon_core::error::Error::Custom(format!("Failed to upsert user liquidity position updated event: {}", e)));
    }
    
    // Also upsert into user_liquidity_positions table (latest position per pair per signer)
    // Since there's no unique constraint on (pair, signer), we use UPDATE then INSERT pattern
    let update_result = sqlx::query(
        r#"
        UPDATE user_liquidity_positions
        SET token0_mint = $3,
            token1_mint = $4,
            amount0 = $5,
            amount1 = $6,
            lp_mint = $7,
            lp_amount = $8,
            timestamp = $9
        WHERE pair = $1 AND signer = $2
        "#
    )
    .bind(event.metadata.pair.to_string())
    .bind(event.metadata.signer.to_string())
    .bind(event.token0_mint.to_string())
    .bind(event.token1_mint.to_string())
    .bind(bigdecimal::BigDecimal::from(event.token0_amount))
    .bind(bigdecimal::BigDecimal::from(event.token1_amount))
    .bind(event.lp_mint.to_string())
    .bind(bigdecimal::BigDecimal::from(event.lp_amount))
    .bind(event_timestamp)
    .execute(pool)
    .await;
    
    // If no rows were updated, insert a new record
    if let Ok(update_result) = update_result {
        if update_result.rows_affected() == 0 {
            let insert_result = sqlx::query(
                r#"
                INSERT INTO user_liquidity_positions (
                    signer, pair, token0_mint, token1_mint, amount0, amount1, lp_mint, lp_amount, timestamp
                ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
                "#
            )
            .bind(event.metadata.signer.to_string())
            .bind(event.metadata.pair.to_string())
            .bind(event.token0_mint.to_string())
            .bind(event.token1_mint.to_string())
            .bind(bigdecimal::BigDecimal::from(event.token0_amount))
            .bind(bigdecimal::BigDecimal::from(event.token1_amount))
            .bind(event.lp_mint.to_string())
            .bind(bigdecimal::BigDecimal::from(event.lp_amount))
            .bind(event_timestamp)
            .execute(pool)
            .await;
            
            if let Err(e) = insert_result {
                log::error!("Failed to insert into user_liquidity_positions table: {}", e);
                return Err(carbon_core::error::Error::Custom(format!("Failed to insert user liquidity position: {}", e)));
            }
        }
    } else {
        // If update failed, return the error
        let update_err = update_result.unwrap_err();
        log::error!("Failed to update user_liquidity_positions table: {}", update_err);
        return Err(carbon_core::error::Error::Custom(format!("Failed to update user liquidity position: {}", update_err)));
    }
    
    Ok(())
}


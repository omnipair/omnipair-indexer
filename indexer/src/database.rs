use {
    carbon_core::error::CarbonResult,
    carbon_omnipair_decoder::instructions::{
        adjust_collateral_event::AdjustCollateralEvent, adjust_debt_event::AdjustDebtEvent,
        burn_event::BurnEvent, mint_event::MintEvent, pair_created_event::PairCreatedEvent,
        swap_event::SwapEvent, update_pair_event::UpdatePairEvent,
        user_liquidity_position_updated_event::UserLiquidityPositionUpdatedEvent,
        user_position_liquidated_event::UserPositionLiquidatedEvent,
        user_position_updated_event::UserPositionUpdatedEvent,
    },
    serde::Serialize,
    solana_pubkey::Pubkey,
    sqlx::PgPool,
    tokio::sync::OnceCell,
};

static DB_POOL: OnceCell<PgPool> = OnceCell::const_new();

/// Initialize the database connection pool
pub async fn init_db_pool() -> CarbonResult<()> {
    let database_url = std::env::var("DATABASE_URL").map_err(|_| {
        carbon_core::error::Error::Custom("DATABASE_URL environment variable not set".to_string())
    })?;

    let pool = PgPool::connect(&database_url).await.map_err(|e| {
        carbon_core::error::Error::Custom(format!("Failed to connect to database: {}", e))
    })?;

    // Test the connection
    sqlx::query("SELECT 1")
        .fetch_one(&pool)
        .await
        .map_err(|e| {
            carbon_core::error::Error::Custom(format!("Database connection test failed: {}", e))
        })?;

    DB_POOL.set(pool).map_err(|_| {
        carbon_core::error::Error::Custom("Failed to initialize database pool".to_string())
    })?;

    log::info!("Database connection pool initialized successfully");
    Ok(())
}

/// Get the database pool
pub fn get_db_pool() -> CarbonResult<&'static PgPool> {
    DB_POOL.get().ok_or_else(|| {
        carbon_core::error::Error::Custom(
            "Database pool not initialized. Call init_db_pool() first".to_string(),
        )
    })
}

/// Record any V2 market event into the append-only event ledger.
pub async fn record_v2_event<T: Serialize>(
    event_type: &str,
    market: Pubkey,
    owner: Option<Pubkey>,
    asset_mint: Option<Pubkey>,
    event: &T,
    tx_signature: &str,
    slot: i64,
    instruction_index: i32,
    instruction_path: &str,
) -> CarbonResult<()> {
    let pool = get_db_pool()?;
    let payload = serde_json::to_string(event).map_err(|e| {
        carbon_core::error::Error::Custom(format!("Failed to serialize V2 event payload: {}", e))
    })?;

    let result = sqlx::query(
        r#"
        INSERT INTO v2_market_events (
            event_type, market, owner, asset_mint, tx_sig, slot, instruction_index,
            instruction_path, payload, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
        ON CONFLICT (tx_sig, instruction_path, event_type) DO UPDATE SET
            market = EXCLUDED.market,
            owner = EXCLUDED.owner,
            asset_mint = EXCLUDED.asset_mint,
            slot = EXCLUDED.slot,
            instruction_index = EXCLUDED.instruction_index,
            payload = EXCLUDED.payload,
            timestamp = EXCLUDED.timestamp
        "#,
    )
    .bind(event_type)
    .bind(market.to_string())
    .bind(owner.map(|key| key.to_string()))
    .bind(asset_mint.map(|key| key.to_string()))
    .bind(tx_signature)
    .bind(slot)
    .bind(instruction_index)
    .bind(instruction_path)
    .bind(payload)
    .bind(chrono::Utc::now())
    .execute(pool)
    .await;

    if let Err(e) = result {
        log::error!("Failed to record V2 event {}: {}", event_type, e);
        return Err(carbon_core::error::Error::Custom(format!(
            "Failed to record V2 event: {}",
            e
        )));
    }

    Ok(())
}

pub async fn upsert_v2_market_created_event(
    event: &carbon_omnipair_decoder::v2::instructions::market_created::MarketCreated,
    tx_signature: &str,
    slot: i64,
    instruction_index: i32,
    instruction_path: &str,
) -> CarbonResult<()> {
    let pool = get_db_pool()?;
    let result = sqlx::query(
        r#"
        INSERT INTO v2_markets (
            market_address, base_mint, quote_mint, base_claim_token_mint, quote_claim_token_mint,
            base_hedge_token_mint, quote_hedge_token_mint, base_stake_vault, quote_stake_vault,
            base_collateral_vault, quote_collateral_vault, base_insurance_vault, quote_insurance_vault,
            base_hedge_vault, quote_hedge_vault, operator, manager, buffer_ratio_bps,
            swap_fee_bps, protocol_fee_bps, params_hash, version, reduce_only,
            created_tx_sig, created_slot, updated_at
        ) VALUES (
            $1, $2, $3, $4, $5, $6, $7, $8, $9, $10,
            $11, $12, $13, $14, $15, $16, $17, $18, $19,
            $20, $21, $22, FALSE, $23, $24, $25
        )
        ON CONFLICT (market_address) DO UPDATE SET
            base_mint = EXCLUDED.base_mint,
            quote_mint = EXCLUDED.quote_mint,
            base_claim_token_mint = EXCLUDED.base_claim_token_mint,
            quote_claim_token_mint = EXCLUDED.quote_claim_token_mint,
            base_hedge_token_mint = EXCLUDED.base_hedge_token_mint,
            quote_hedge_token_mint = EXCLUDED.quote_hedge_token_mint,
            base_stake_vault = EXCLUDED.base_stake_vault,
            quote_stake_vault = EXCLUDED.quote_stake_vault,
            base_collateral_vault = EXCLUDED.base_collateral_vault,
            quote_collateral_vault = EXCLUDED.quote_collateral_vault,
            base_insurance_vault = EXCLUDED.base_insurance_vault,
            quote_insurance_vault = EXCLUDED.quote_insurance_vault,
            base_hedge_vault = EXCLUDED.base_hedge_vault,
            quote_hedge_vault = EXCLUDED.quote_hedge_vault,
            operator = EXCLUDED.operator,
            manager = EXCLUDED.manager,
            buffer_ratio_bps = EXCLUDED.buffer_ratio_bps,
            swap_fee_bps = EXCLUDED.swap_fee_bps,
            protocol_fee_bps = EXCLUDED.protocol_fee_bps,
            params_hash = EXCLUDED.params_hash,
            version = EXCLUDED.version,
            created_tx_sig = EXCLUDED.created_tx_sig,
            created_slot = EXCLUDED.created_slot,
            updated_at = EXCLUDED.updated_at
        "#
    )
    .bind(event.market.to_string())
    .bind(event.base_mint.to_string())
    .bind(event.quote_mint.to_string())
    .bind(event.base_claim_token_mint.to_string())
    .bind(event.quote_claim_token_mint.to_string())
    .bind(event.base_hedge_token_mint.to_string())
    .bind(event.quote_hedge_token_mint.to_string())
    .bind(event.base_stake_vault.to_string())
    .bind(event.quote_stake_vault.to_string())
    .bind(event.base_collateral_vault.to_string())
    .bind(event.quote_collateral_vault.to_string())
    .bind(event.base_insurance_vault.to_string())
    .bind(event.quote_insurance_vault.to_string())
    .bind(event.base_hedge_vault.to_string())
    .bind(event.quote_hedge_vault.to_string())
    .bind(event.operator.to_string())
    .bind(event.manager.to_string())
    .bind(event.buffer_ratio_bps as i32)
    .bind(event.swap_fee_bps as i32)
    .bind(event.protocol_fee_bps as i32)
    .bind(event.params_hash.to_vec())
    .bind(event.version as i32)
    .bind(tx_signature)
    .bind(slot)
    .bind(chrono::Utc::now())
    .execute(pool)
    .await;

    if let Err(e) = result {
        log::error!("Failed to upsert V2 market: {}", e);
        return Err(carbon_core::error::Error::Custom(format!(
            "Failed to upsert V2 market: {}",
            e
        )));
    }

    record_v2_event(
        "market_created",
        event.market,
        Some(event.metadata.signer),
        None,
        event,
        tx_signature,
        slot,
        instruction_index,
        instruction_path,
    )
    .await
}

pub async fn upsert_v2_market_updated_event(
    event: &carbon_omnipair_decoder::v2::instructions::market_updated::MarketUpdated,
    tx_signature: &str,
    slot: i64,
    instruction_index: i32,
    instruction_path: &str,
) -> CarbonResult<()> {
    let pool = get_db_pool()?;
    let result = sqlx::query(
        r#"
        UPDATE v2_markets
        SET reduce_only = $2,
            buffer_ratio_bps = $3,
            swap_fee_bps = $4,
            operator_fee_bps = $5,
            protocol_fee_bps = $6,
            updated_at = $7
        WHERE market_address = $1
        "#,
    )
    .bind(event.market.to_string())
    .bind(event.reduce_only)
    .bind(event.buffer_ratio_bps as i32)
    .bind(event.swap_fee_bps as i32)
    .bind(event.operator_fee_bps as i32)
    .bind(event.protocol_fee_bps as i32)
    .bind(chrono::Utc::now())
    .execute(pool)
    .await;

    if let Err(e) = result {
        log::error!("Failed to update V2 market config: {}", e);
        return Err(carbon_core::error::Error::Custom(format!(
            "Failed to update V2 market: {}",
            e
        )));
    }

    record_v2_event(
        "market_updated",
        event.market,
        Some(event.metadata.signer),
        None,
        event,
        tx_signature,
        slot,
        instruction_index,
        instruction_path,
    )
    .await
}

pub async fn upsert_v2_swap_executed_event(
    event: &carbon_omnipair_decoder::v2::instructions::swap_executed::SwapExecuted,
    tx_signature: &str,
    slot: i64,
    instruction_index: i32,
    instruction_path: &str,
) -> CarbonResult<()> {
    let pool = get_db_pool()?;
    let result = sqlx::query(
        r#"
        INSERT INTO v2_swaps (
            market, trader, asset_in_mint, asset_out_mint, reserve_credit,
            amount_in_after_fee, amount_out, fee_credit, tx_sig, slot,
            instruction_index, instruction_path, timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
        ON CONFLICT (tx_sig, instruction_path) DO UPDATE SET
            market = EXCLUDED.market,
            trader = EXCLUDED.trader,
            asset_in_mint = EXCLUDED.asset_in_mint,
            asset_out_mint = EXCLUDED.asset_out_mint,
            reserve_credit = EXCLUDED.reserve_credit,
            amount_in_after_fee = EXCLUDED.amount_in_after_fee,
            amount_out = EXCLUDED.amount_out,
            fee_credit = EXCLUDED.fee_credit,
            slot = EXCLUDED.slot,
            instruction_index = EXCLUDED.instruction_index,
            timestamp = EXCLUDED.timestamp
        "#,
    )
    .bind(event.market.to_string())
    .bind(event.trader.to_string())
    .bind(event.asset_in_mint.to_string())
    .bind(event.asset_out_mint.to_string())
    .bind(bigdecimal::BigDecimal::from(event.reserve_credit))
    .bind(bigdecimal::BigDecimal::from(event.amount_in_after_fee))
    .bind(bigdecimal::BigDecimal::from(event.amount_out))
    .bind(bigdecimal::BigDecimal::from(event.fee_credit))
    .bind(tx_signature)
    .bind(slot)
    .bind(instruction_index)
    .bind(instruction_path)
    .bind(chrono::Utc::now())
    .execute(pool)
    .await;

    if let Err(e) = result {
        log::error!("Failed to upsert V2 swap: {}", e);
        return Err(carbon_core::error::Error::Custom(format!(
            "Failed to upsert V2 swap: {}",
            e
        )));
    }

    record_v2_event(
        "swap_executed",
        event.market,
        Some(event.trader),
        Some(event.asset_in_mint),
        event,
        tx_signature,
        slot,
        instruction_index,
        instruction_path,
    )
    .await
}

/// Upsert a swap event into the database (handles duplicate tx_sig)
pub async fn upsert_swap_event(
    swap_event: &SwapEvent,
    tx_signature: &str,
    slot: i64,
    instruction_index: i32,
    instruction_path: &str,
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
            reserve0, reserve1, timestamp, tx_sig, slot, fee_paid0, fee_paid1,
            lp_fee, protocol_fee, instruction_index, instruction_path
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16)
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
            fee_paid1 = EXCLUDED.fee_paid1,
            lp_fee = EXCLUDED.lp_fee,
            protocol_fee = EXCLUDED.protocol_fee,
            instruction_index = EXCLUDED.instruction_index,
            instruction_path = EXCLUDED.instruction_path
        "#,
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
    .bind(bigdecimal::BigDecimal::from(swap_event.lp_fee))
    .bind(bigdecimal::BigDecimal::from(swap_event.protocol_fee))
    .bind(instruction_index)
    .bind(instruction_path)
    .execute(pool)
    .await;

    if let Err(e) = upsert_result {
        log::error!("Failed to upsert into swaps table: {}", e);
        return Err(carbon_core::error::Error::Custom(format!(
            "Failed to upsert swap: {}",
            e
        )));
    }

    Ok(())
}

/// Upsert a mint event into the adjust_liquidity table
pub async fn upsert_mint_event(
    event: &MintEvent,
    tx_signature: &str,
    _slot: i64,
    instruction_index: i32,
    instruction_path: &str,
) -> CarbonResult<()> {
    let pool = get_db_pool()?;

    let upsert_result = sqlx::query(
        r#"
        INSERT INTO adjust_liquidity (
            pair, user_address, amount0, amount1, liquidity, tx_sig, timestamp, event_type, slot,
            instruction_index, instruction_path
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::liquidity_event_type, $9, $10, $11)
        ON CONFLICT (tx_sig, timestamp) DO UPDATE SET
            pair = EXCLUDED.pair,
            user_address = EXCLUDED.user_address,
            amount0 = EXCLUDED.amount0,
            amount1 = EXCLUDED.amount1,
            liquidity = EXCLUDED.liquidity,
            timestamp = EXCLUDED.timestamp,
            event_type = EXCLUDED.event_type,
            slot = EXCLUDED.slot,
            instruction_index = EXCLUDED.instruction_index,
            instruction_path = EXCLUDED.instruction_path
        "#,
    )
    .bind(event.metadata.pair.to_string())
    .bind(event.metadata.signer.to_string())
    .bind(bigdecimal::BigDecimal::from(event.amount0))
    .bind(bigdecimal::BigDecimal::from(event.amount1))
    .bind(bigdecimal::BigDecimal::from(event.liquidity))
    .bind(tx_signature)
    .bind(chrono::Utc::now())
    .bind("add") // MintEvent = "add" liquidity
    .bind(bigdecimal::BigDecimal::from(event.metadata.slot))
    .bind(instruction_index)
    .bind(instruction_path)
    .execute(pool)
    .await;

    if let Err(e) = upsert_result {
        log::error!("Failed to upsert into adjust_liquidity table: {}", e);
        return Err(carbon_core::error::Error::Custom(format!(
            "Failed to upsert mint event: {}",
            e
        )));
    }

    Ok(())
}

/// Upsert a burn event into the adjust_liquidity table
pub async fn upsert_burn_event(
    event: &BurnEvent,
    tx_signature: &str,
    _slot: i64,
    instruction_index: i32,
    instruction_path: &str,
) -> CarbonResult<()> {
    let pool = get_db_pool()?;

    let upsert_result = sqlx::query(
        r#"
        INSERT INTO adjust_liquidity (
            pair, user_address, amount0, amount1, liquidity, tx_sig, timestamp, event_type, slot,
            instruction_index, instruction_path
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8::liquidity_event_type, $9, $10, $11)
        ON CONFLICT (tx_sig, timestamp) DO UPDATE SET
            pair = EXCLUDED.pair,
            user_address = EXCLUDED.user_address,
            amount0 = EXCLUDED.amount0,
            amount1 = EXCLUDED.amount1,
            liquidity = EXCLUDED.liquidity,
            timestamp = EXCLUDED.timestamp,
            event_type = EXCLUDED.event_type,
            slot = EXCLUDED.slot,
            instruction_index = EXCLUDED.instruction_index,
            instruction_path = EXCLUDED.instruction_path
        "#,
    )
    .bind(event.metadata.pair.to_string())
    .bind(event.metadata.signer.to_string())
    .bind(bigdecimal::BigDecimal::from(event.amount0))
    .bind(bigdecimal::BigDecimal::from(event.amount1))
    .bind(bigdecimal::BigDecimal::from(event.liquidity))
    .bind(tx_signature)
    .bind(chrono::Utc::now())
    .bind("remove") // BurnEvent = "remove" liquidity
    .bind(bigdecimal::BigDecimal::from(event.metadata.slot))
    .bind(instruction_index)
    .bind(instruction_path)
    .execute(pool)
    .await;

    if let Err(e) = upsert_result {
        log::error!("Failed to upsert into adjust_liquidity table: {}", e);
        return Err(carbon_core::error::Error::Custom(format!(
            "Failed to upsert burn event: {}",
            e
        )));
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
        "#,
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
        log::error!(
            "Failed to upsert into adjust_collateral_events table: {}",
            e
        );
        return Err(carbon_core::error::Error::Custom(format!(
            "Failed to upsert adjust collateral event: {}",
            e
        )));
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
        "#,
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
        return Err(carbon_core::error::Error::Custom(format!(
            "Failed to upsert adjust debt event: {}",
            e
        )));
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
            collateral0_liquidation_cf_bps, collateral1_liquidation_cf_bps,
            collateral0_max_cf_bps, collateral1_max_cf_bps,
            transaction_signature, slot, event_timestamp
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (transaction_signature) DO UPDATE SET
            pair = EXCLUDED.pair,
            signer = EXCLUDED.signer,
            position = EXCLUDED.position,
            collateral0 = EXCLUDED.collateral0,
            collateral1 = EXCLUDED.collateral1,
            debt0_shares = EXCLUDED.debt0_shares,
            debt1_shares = EXCLUDED.debt1_shares,
            collateral0_liquidation_cf_bps = EXCLUDED.collateral0_liquidation_cf_bps,
            collateral1_liquidation_cf_bps = EXCLUDED.collateral1_liquidation_cf_bps,
            collateral0_max_cf_bps = EXCLUDED.collateral0_max_cf_bps,
            collateral1_max_cf_bps = EXCLUDED.collateral1_max_cf_bps,
            slot = EXCLUDED.slot,
            event_timestamp = EXCLUDED.event_timestamp
        "#,
    )
    .bind(event.metadata.pair.to_string())
    .bind(event.metadata.signer.to_string())
    .bind(event.position.to_string())
    .bind(bigdecimal::BigDecimal::from(event.collateral0))
    .bind(bigdecimal::BigDecimal::from(event.collateral1))
    .bind(bigdecimal::BigDecimal::from(
        bigdecimal::num_bigint::BigInt::from(event.debt0_shares),
    ))
    .bind(bigdecimal::BigDecimal::from(
        bigdecimal::num_bigint::BigInt::from(event.debt1_shares),
    ))
    .bind(event.collateral0_liquidation_cf_bps as i32)
    .bind(event.collateral1_liquidation_cf_bps as i32)
    .bind(event.collateral0_max_cf_bps as i32)
    .bind(event.collateral1_max_cf_bps as i32)
    .bind(tx_signature)
    .bind(bigdecimal::BigDecimal::from(slot))
    .bind(event_timestamp)
    .execute(pool)
    .await;

    if let Err(e) = upsert_result {
        log::error!(
            "Failed to upsert into user_position_updated_events table: {}",
            e
        );
        return Err(carbon_core::error::Error::Custom(format!(
            "Failed to upsert user position updated event: {}",
            e
        )));
    }

    // Also upsert into user_borrow_positions table (latest position per pair per
    // signer)

    let upsert_latest_result = sqlx::query(
        r#"
        INSERT INTO user_borrow_positions (
            pair, signer, position, collateral0, collateral1, debt0_shares, debt1_shares,
            collateral0_liquidation_cf_bps, collateral1_liquidation_cf_bps,
            collateral0_max_cf_bps, collateral1_max_cf_bps,
            slot, event_timestamp, updated_at
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14)
        ON CONFLICT (pair, signer) DO UPDATE SET
            position = EXCLUDED.position,
            collateral0 = EXCLUDED.collateral0,
            collateral1 = EXCLUDED.collateral1,
            debt0_shares = EXCLUDED.debt0_shares,
            debt1_shares = EXCLUDED.debt1_shares,
            collateral0_liquidation_cf_bps = EXCLUDED.collateral0_liquidation_cf_bps,
            collateral1_liquidation_cf_bps = EXCLUDED.collateral1_liquidation_cf_bps,
            collateral0_max_cf_bps = EXCLUDED.collateral0_max_cf_bps,
            collateral1_max_cf_bps = EXCLUDED.collateral1_max_cf_bps,
            slot = EXCLUDED.slot,
            event_timestamp = EXCLUDED.event_timestamp,
            updated_at = now()
        "#,
    )
    .bind(event.metadata.pair.to_string())
    .bind(event.metadata.signer.to_string())
    .bind(event.position.to_string())
    .bind(bigdecimal::BigDecimal::from(event.collateral0))
    .bind(bigdecimal::BigDecimal::from(event.collateral1))
    .bind(bigdecimal::BigDecimal::from(
        bigdecimal::num_bigint::BigInt::from(event.debt0_shares),
    ))
    .bind(bigdecimal::BigDecimal::from(
        bigdecimal::num_bigint::BigInt::from(event.debt1_shares),
    ))
    .bind(event.collateral0_liquidation_cf_bps as i32)
    .bind(event.collateral1_liquidation_cf_bps as i32)
    .bind(event.collateral0_max_cf_bps as i32)
    .bind(event.collateral1_max_cf_bps as i32)
    .bind(bigdecimal::BigDecimal::from(slot))
    .bind(event_timestamp)
    .bind(chrono::Utc::now())
    .execute(pool)
    .await;

    if let Err(e) = upsert_latest_result {
        log::error!("Failed to upsert into user_borrow_positions table: {}", e);
        return Err(carbon_core::error::Error::Custom(format!(
            "Failed to upsert user borrow position: {}",
            e
        )));
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
        log::error!(
            "Failed to upsert into user_position_liquidated_events table: {}",
            e
        );
        return Err(carbon_core::error::Error::Custom(format!(
            "Failed to upsert user position liquidated event: {}",
            e
        )));
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
            pair_address, token0, token1, lp_mint, rate_model, swap_fee_bps, half_life, fixed_cf_bps, params_hash, version,
            target_util_start_bps, target_util_end_bps, rate_half_life_ms, min_rate_bps, max_rate_bps
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15)
        ON CONFLICT (pair_address) DO UPDATE SET
            token0 = EXCLUDED.token0,
            token1 = EXCLUDED.token1,
            lp_mint = EXCLUDED.lp_mint,
            rate_model = EXCLUDED.rate_model,
            swap_fee_bps = EXCLUDED.swap_fee_bps,
            half_life = EXCLUDED.half_life,
            fixed_cf_bps = EXCLUDED.fixed_cf_bps,
            params_hash = EXCLUDED.params_hash,
            version = EXCLUDED.version,
            target_util_start_bps = EXCLUDED.target_util_start_bps,
            target_util_end_bps = EXCLUDED.target_util_end_bps,
            rate_half_life_ms = EXCLUDED.rate_half_life_ms,
            min_rate_bps = EXCLUDED.min_rate_bps,
            max_rate_bps = EXCLUDED.max_rate_bps
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
    .bind(event.target_util_start_bps as i64)
    .bind(event.target_util_end_bps as i64)
    .bind(event.rate_half_life_ms as i64)
    .bind(event.min_rate_bps as i64)
    .bind(event.max_rate_bps as i64)
    .execute(pool)
    .await;

    if let Err(e) = upsert_result {
        log::error!("Failed to upsert into pools table: {}", e);
        return Err(carbon_core::error::Error::Custom(format!(
            "Failed to upsert pair created event: {}",
            e
        )));
    }

    Ok(())
}

/// Upsert a UserLiquidityPositionUpdatedEvent into the database
pub async fn upsert_user_liquidity_position_updated_event(
    event: &UserLiquidityPositionUpdatedEvent,
    tx_signature: &str,
    _slot: i64,
    instruction_index: i32,
    instruction_path: &str,
) -> CarbonResult<()> {
    let pool = get_db_pool()?;

    // Compute event_timestamp once for reuse
    let event_timestamp = chrono::Utc::now();

    // Insert into user_lp_position_updated_events table (always inserts)
    let insert_event_result = sqlx::query(
        r#"
        INSERT INTO user_lp_position_updated_events (
            pair_address, lp_amount, amount0, amount1, signer, timestamp, slot,
            transaction_signature, instruction_index, instruction_path
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        "#,
    )
    .bind(event.metadata.pair.to_string())
    .bind(bigdecimal::BigDecimal::from(event.lp_amount))
    .bind(bigdecimal::BigDecimal::from(event.token0_amount))
    .bind(bigdecimal::BigDecimal::from(event.token1_amount))
    .bind(event.metadata.signer.to_string())
    .bind(event_timestamp)
    .bind(bigdecimal::BigDecimal::from(event.metadata.slot))
    .bind(tx_signature)
    .bind(instruction_index)
    .bind(instruction_path)
    .execute(pool)
    .await;

    if let Err(e) = insert_event_result {
        log::error!(
            "Failed to insert into user_lp_position_updated_events table: {}",
            e
        );
        return Err(carbon_core::error::Error::Custom(format!(
            "Failed to insert user liquidity position updated event: {}",
            e
        )));
    }

    // Upsert into user_liquidity_positions table (latest position per pair per
    // signer) Uses ON CONFLICT with unique constraint on (pair, signer)
    let upsert_result = sqlx::query(
        r#"
        INSERT INTO user_liquidity_positions (
            pair, signer, token0_mint, token1_mint, amount0, amount1, lp_mint, lp_amount, slot
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (pair, signer) DO UPDATE SET
            token0_mint = EXCLUDED.token0_mint,
            token1_mint = EXCLUDED.token1_mint,
            amount0 = EXCLUDED.amount0,
            amount1 = EXCLUDED.amount1,
            lp_mint = EXCLUDED.lp_mint,
            lp_amount = EXCLUDED.lp_amount,
            updated_at = now(),
            slot = EXCLUDED.slot
        "#,
    )
    .bind(event.metadata.pair.to_string())
    .bind(event.metadata.signer.to_string())
    .bind(event.token0_mint.to_string())
    .bind(event.token1_mint.to_string())
    .bind(bigdecimal::BigDecimal::from(event.token0_amount))
    .bind(bigdecimal::BigDecimal::from(event.token1_amount))
    .bind(event.lp_mint.to_string())
    .bind(bigdecimal::BigDecimal::from(event.lp_amount))
    .bind(bigdecimal::BigDecimal::from(event.metadata.slot))
    .execute(pool)
    .await;

    if let Err(e) = upsert_result {
        log::error!(
            "Failed to upsert into user_liquidity_positions table: {}",
            e
        );
        return Err(carbon_core::error::Error::Custom(format!(
            "Failed to upsert user liquidity position: {}",
            e
        )));
    }

    Ok(())
}

/// Upsert an UpdatePairEvent into the database
pub async fn upsert_update_pair_event(
    event: &UpdatePairEvent,
    tx_signature: &str,
    slot: i64,
    instruction_index: i32,
    instruction_path: &str,
) -> CarbonResult<()> {
    let pool = get_db_pool()?;

    let upsert_result = sqlx::query(
        r#"
        INSERT INTO update_pair_events (
            pair, signer, price0_ema, price1_ema, rate0, rate1,
            accrued_interest0, accrued_interest1,
            lp_interest0, lp_interest1,
            protocol_interest0, protocol_interest1,
            cash_reserve0, cash_reserve1,
            reserve0_after_interest, reserve1_after_interest,
            transaction_signature, slot, timestamp,
            instruction_index, instruction_path
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19, $20, $21)
        ON CONFLICT (transaction_signature, timestamp) DO UPDATE SET
            pair = EXCLUDED.pair,
            signer = EXCLUDED.signer,
            price0_ema = EXCLUDED.price0_ema,
            price1_ema = EXCLUDED.price1_ema,
            rate0 = EXCLUDED.rate0,
            rate1 = EXCLUDED.rate1,
            accrued_interest0 = EXCLUDED.accrued_interest0,
            accrued_interest1 = EXCLUDED.accrued_interest1,
            lp_interest0 = EXCLUDED.lp_interest0,
            lp_interest1 = EXCLUDED.lp_interest1,
            protocol_interest0 = EXCLUDED.protocol_interest0,
            protocol_interest1 = EXCLUDED.protocol_interest1,
            cash_reserve0 = EXCLUDED.cash_reserve0,
            cash_reserve1 = EXCLUDED.cash_reserve1,
            reserve0_after_interest = EXCLUDED.reserve0_after_interest,
            reserve1_after_interest = EXCLUDED.reserve1_after_interest,
            slot = EXCLUDED.slot,
            instruction_index = EXCLUDED.instruction_index,
            instruction_path = EXCLUDED.instruction_path
        "#
    )
    .bind(event.metadata.pair.to_string())
    .bind(event.metadata.signer.to_string())
    .bind(bigdecimal::BigDecimal::from(event.price0_ema))
    .bind(bigdecimal::BigDecimal::from(event.price1_ema))
    .bind(bigdecimal::BigDecimal::from(event.rate0))
    .bind(bigdecimal::BigDecimal::from(event.rate1))
    .bind(bigdecimal::BigDecimal::from(bigdecimal::num_bigint::BigInt::from(event.accrued_interest0)))
    .bind(bigdecimal::BigDecimal::from(bigdecimal::num_bigint::BigInt::from(event.accrued_interest1)))
    .bind(bigdecimal::BigDecimal::from(event.lp_interest0))
    .bind(bigdecimal::BigDecimal::from(event.lp_interest1))
    .bind(bigdecimal::BigDecimal::from(event.protocol_interest0))
    .bind(bigdecimal::BigDecimal::from(event.protocol_interest1))
    .bind(bigdecimal::BigDecimal::from(event.cash_reserve0))
    .bind(bigdecimal::BigDecimal::from(event.cash_reserve1))
    .bind(bigdecimal::BigDecimal::from(event.reserve0_after_interest))
    .bind(bigdecimal::BigDecimal::from(event.reserve1_after_interest))
    .bind(tx_signature)
    .bind(bigdecimal::BigDecimal::from(slot))
    .bind(chrono::Utc::now())
    .bind(instruction_index)
    .bind(instruction_path)
    .execute(pool)
    .await;

    if let Err(e) = upsert_result {
        log::error!("Failed to upsert into update_pair_events table: {}", e);
        return Err(carbon_core::error::Error::Custom(format!(
            "Failed to upsert update pair event: {}",
            e
        )));
    }

    Ok(())
}

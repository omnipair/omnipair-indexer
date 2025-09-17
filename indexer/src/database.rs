use carbon_core::error::CarbonResult;
use carbon_omnipair_decoder::instructions::swap_event::SwapEvent;
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

/// Insert a swap event into the database
pub async fn insert_swap_event(
    swap_event: &SwapEvent,
    tx_signature: &str,
    slot: i64,
) -> CarbonResult<()> {
    let pool = get_db_pool()?;
    
    let insert_result = sqlx::query(
        r#"
        INSERT INTO swaps (
            pair, user_address, is_token0_in, amount_in, amount_out, 
            reserve0, reserve1, timestamp, tx_sig, slot
        ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        "#
    )
    .bind(swap_event.pair.to_string())
    .bind(swap_event.user.to_string())
    .bind(swap_event.is_token0_in)
    .bind(bigdecimal::BigDecimal::from(swap_event.amount_in))
    .bind(bigdecimal::BigDecimal::from(swap_event.amount_out))
    .bind(bigdecimal::BigDecimal::from(swap_event.reserve0))
    .bind(bigdecimal::BigDecimal::from(swap_event.reserve1))
    .bind(bigdecimal::BigDecimal::from(swap_event.timestamp))
    .bind(tx_signature)
    .bind(bigdecimal::BigDecimal::from(slot))
    .execute(pool)
    .await;
    
    if let Err(e) = insert_result {
        log::error!("Failed to insert into swaps table: {}", e);
        return Err(carbon_core::error::Error::Custom(format!("Failed to insert swap: {}", e)));
    }
    
    Ok(())
}


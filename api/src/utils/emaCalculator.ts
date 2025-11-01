/**
 * EMA Price Calculator - TypeScript implementation
 * Based on the Rust compute_ema function from omnipair
 */

// Constants (matching the Rust implementation)
export const NAD = 1_000_000_000; // 1e9 scaling factor
export const NAD_DECIMALS = 9;
export const TAYLOR_TERMS = 5;
export const NATURAL_LOG_OF_TWO_NAD = 693_147_180; // ln(2) scaled by NAD
export const DEFAULT_HALF_LIFE = 10 * 60; // 10 minutes in seconds

// Types
export interface PairState {
    reserve0: number;
    reserve1: number;
    lastPrice0Ema: number;
    lastPrice1Ema: number;
    lastUpdate: number;
    halfLife: number;
}

export interface EmaUpdateResult {
    price0Ema: number;
    price1Ema: number;
    spotPrice0: number;
    spotPrice1: number;
    timestamp: number;
}

/**
 * Taylor series approximation of e^x
 * @param x - The exponent (can be negative)
 * @param scale - Scaling factor (NAD)
 * @param precision - Number of Taylor series terms
 * @returns e^x scaled by the scale factor
 */
export function taylorExp(x: number, scale: number, precision: number): number {
    // For negative x, we calculate exp(-x) and take reciprocal
    const isNegative = x < 0;
    const absX = Math.abs(x);
    
    // Choose a suitable n for range reduction
    const n = 10;
    // Reduce x by n
    const reducedX = Math.floor(absX / n);
    
    // Start with 1 (scaled by `scale`)
    let term = scale;
    // Initialize sum with 1 (scaled by `scale`)
    let sum = scale;

    // Compute Taylor series terms
    for (let i = 1; i <= precision; i++) {
        // Compute the next term (scaled) with overflow protection
        term = Math.floor((term * reducedX) / (i * scale));
        if (term === 0) break; // Prevent underflow
        
        // Add the term to the sum
        sum += term;
    }

    // Start with 1 (scaled by `scale`)
    let result = scale;
    // Raise the result to the power of n
    for (let i = 0; i < n; i++) {
        result = Math.floor((result * sum) / scale);
    }

    // If x was negative, take reciprocal
    if (isNegative) {
        result = Math.floor((scale * scale) / result);
    }

    return result;
}

/**
 * Compute EMA (Exponential Moving Average) price
 * @param lastEma - Previous EMA value (NAD scaled)
 * @param lastUpdate - Unix timestamp of last update (seconds)
 * @param input - New spot price input (NAD scaled)
 * @param halfLife - EMA half-life in seconds
 * @param currentTime - Current unix timestamp (optional, defaults to now)
 * @returns New EMA value (NAD scaled)
 */
export function computeEma(
    lastEma: number,
    lastUpdate: number,
    input: number,
    halfLife: number,
    currentTime: number | null = null
): number {
    // Get current time if not provided
    if (currentTime === null) {
        currentTime = Math.floor(Date.now() / 1000); // Convert to seconds
    }
    
    const dt = currentTime - lastUpdate;
    
    if (dt > 0 && halfLife > 0) {
        // Calculate exp_time in NAD scale
        const expTime = Math.floor((halfLife * NAD) / NATURAL_LOG_OF_TWO_NAD);
        
        // Calculate x in NAD scale
        const x = Math.floor((dt * NAD) / expTime);
        
        // Calculate alpha using Taylor expansion
        const alpha = taylorExp(-x, NAD, TAYLOR_TERMS);
        
        // EMA formula: result = input * (1 - alpha) + lastEma * alpha
        // All scaled by NAD
        const result = Math.floor(
            (input * (NAD - alpha) + lastEma * alpha) / NAD
        );
        
        return result;
    } else {
        return lastEma;
    }
}

/**
 * Calculate spot price from reserves (NAD scaled)
 * @param reserve0 - Reserve of token 0
 * @param reserve1 - Reserve of token 1
 * @param price0 - If true, calculate price0 (token1/token0), else price1 (token0/token1)
 * @returns Spot price (NAD scaled)
 */
export function calculateSpotPrice(
    reserve0: number,
    reserve1: number,
    price0: boolean = true
): number {
    if (price0) {
        // Price of token0 in terms of token1: reserve1/reserve0
        return reserve0 === 0 ? 0 : Math.floor((reserve1 * NAD) / reserve0);
    } else {
        // Price of token1 in terms of token0: reserve0/reserve1
        return reserve1 === 0 ? 0 : Math.floor((reserve0 * NAD) / reserve1);
    }
}

/**
 * Convert NAD scaled value to human readable format
 * @param nadValue - Value scaled by NAD (1e9)
 * @param decimals - Number of decimal places to show
 * @returns Human readable value
 */
export function fromNad(nadValue: number, decimals: number = 6): number {
    return Number((nadValue / NAD).toFixed(decimals));
}

/**
 * Convert human readable value to NAD scaled format
 * @param value - Human readable value
 * @returns NAD scaled value
 */
export function toNad(value: number): number {
    return Math.floor(value * NAD);
}

/**
 * Create EMA calculator with configurable parameters
 */
export class EmaCalculator {
    private halfLife: number;
    
    constructor(halfLife: number = DEFAULT_HALF_LIFE) {
        this.halfLife = halfLife;
    }

    /**
     * Calculate EMA with the configured half-life
     */
    calculate(lastEma: number, lastUpdate: number, input: number, currentTime?: number): number {
        return computeEma(lastEma, lastUpdate, input, this.halfLife, currentTime);
    }

    /**
     * Update half-life parameter
     */
    setHalfLife(halfLife: number): void {
        this.halfLife = halfLife;
    }

    /**
     * Get current half-life
     */
    getHalfLife(): number {
        return this.halfLife;
    }
}

export function calculateEmaFromPoolData(
    reserve0: string | number,
    reserve1: string | number,
    lastPrice0Ema?: string | number,
    lastPrice1Ema?: string | number,
    lastUpdate?: number
): EmaUpdateResult {
    const emaCalculator = new EmaCalculator(DEFAULT_HALF_LIFE);
    // Convert string inputs to numbers
    const r0 = typeof reserve0 === 'string' ? parseFloat(reserve0) : reserve0;
    const r1 = typeof reserve1 === 'string' ? parseFloat(reserve1) : reserve1;
    
    // Use current time if lastUpdate not provided
    const currentTime = Math.floor(Date.now() / 1000);
    const lastUpdateTime = lastUpdate || currentTime;
    
    // Use current spot prices as initial EMA if not provided
    const initialPrice0Ema = lastPrice0Ema ? 
        (typeof lastPrice0Ema === 'string' ? parseFloat(lastPrice0Ema) : lastPrice0Ema) :
        calculateSpotPrice(r0, r1, true);
    
    const initialPrice1Ema = lastPrice1Ema ? 
        (typeof lastPrice1Ema === 'string' ? parseFloat(lastPrice1Ema) : lastPrice1Ema) :
        calculateSpotPrice(r0, r1, false);

    // Calculate current spot prices
    const spotPrice0 = calculateSpotPrice(r0, r1, true);
    const spotPrice1 = calculateSpotPrice(r0, r1, false);

    // Update EMA prices
    const newPrice0Ema = emaCalculator.calculate(
        initialPrice0Ema,
        lastUpdateTime,
        spotPrice0,
        currentTime
    );

    const newPrice1Ema = emaCalculator.calculate(
        initialPrice1Ema,
        lastUpdateTime,
        spotPrice1,
        currentTime
    );

    return {
        price0Ema: newPrice0Ema,
        price1Ema: newPrice1Ema,
        spotPrice0: spotPrice0,
        spotPrice1: spotPrice1,
        timestamp: currentTime
    };
}

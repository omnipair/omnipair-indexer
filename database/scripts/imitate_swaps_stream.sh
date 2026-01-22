#!/bin/bash

# Configuration
INTERVAL=2  # seconds between executions
DURATION=10 # total duration in seconds
DB_USER="omnipair_user"
DB_NAME="omnipair_indexer"

# Calculate number of iterations
ITERATIONS=$((DURATION / INTERVAL))

# Create a unique marker for this test run
TEST_MARKER="TEST_RUN_$(date +%s)"

echo "Starting swaps stream test..."
echo "Test marker: $TEST_MARKER"
echo "Will execute $ITERATIONS times over $DURATION seconds"

# Run the loop for the specified duration
for i in $(seq 1 $ITERATIONS); do
  AMOUNT_IN=$((1000000 + i * 10000))
  AMOUNT_OUT=$((900000 + i * 9000))

  # Alternate between token0 and token1 as input
  if [ $((i % 2)) -eq 0 ]; then
    IS_TOKEN0_IN="true"
    RESERVE0=$((10000000 + AMOUNT_IN))
    RESERVE1=$((10000000 - AMOUNT_OUT))
  else
    IS_TOKEN0_IN="false"
    RESERVE0=$((10000000 - AMOUNT_OUT))
    RESERVE1=$((10000000 + AMOUNT_IN))
  fi

  echo "[$i/$ITERATIONS] Inserting swap (token0_in: $IS_TOKEN0_IN)"

  # Execute SQL with swap parameters - use TEST_MARKER in user_address for easy cleanup
  psql -U $DB_USER -d $DB_NAME -c "
    INSERT INTO swaps (
      pair,
      user_address,
      is_token0_in,
      amount_in,
      amount_out,
      reserve0,
      reserve1,
      timestamp,
      tx_sig,
      slot,
      fee_paid0,
      fee_paid1
    ) VALUES (
      'DvznCGfDdmjbu4YcDrrXAYXWtrrSnubzZqW2VdiBWPxB',
      '$TEST_MARKER',
      $IS_TOKEN0_IN,
      $AMOUNT_IN,
      $AMOUNT_OUT,
      $RESERVE0,
      $RESERVE1,
      NOW(),
      gen_random_uuid()::text,
      123456,
      5000,
      7500
    );
  " >/dev/null 2>&1

  if [ $? -eq 0 ]; then
    echo "  Success: Inserted swap"
  else
    echo "  Error: Failed to insert swap"
  fi

  # Sleep before next iteration (except on last iteration)
  if [ $i -lt $ITERATIONS ]; then
    sleep $INTERVAL
  fi
done

echo ""
echo "Test completed. Cleaning up..."

# Show test swaps before deletion
echo "Test swaps to be deleted:"
psql -U $DB_USER -d $DB_NAME -c "
  SELECT id, user_address, tx_sig, timestamp
  FROM swaps
  WHERE user_address = '$TEST_MARKER'
  ORDER BY id;
"

# Delete all test swaps using the marker
DELETED=$(psql -U $DB_USER -d $DB_NAME -t -c "
  DELETE FROM swaps
  WHERE user_address = '$TEST_MARKER'
  RETURNING id;
" | wc -l | tr -d '[:space:]')

echo ""
echo "Cleanup completed. Deleted $DELETED test swaps with marker: $TEST_MARKER"

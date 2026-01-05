#!/bin/bash

# Configuration
INTERVAL=2  # seconds between executions
DURATION=20 # total duration in seconds
DB_USER="omnipair_user"
DB_NAME="omnipair_indexer"

# Calculate number of iterations
ITERATIONS=$((DURATION / INTERVAL))

echo "Starting position stream test..."
echo "Will execute $ITERATIONS times over $DURATION seconds"

# Array to store position addresses for cleanup
POSITIONS=()

# Run the loop for the specified duration
for i in $(seq 1 $ITERATIONS); do
  POSITION="TestPositionAddress789_$i"
  POSITIONS+=("$POSITION")

  echo "[$i/$ITERATIONS] Inserting position: $POSITION"

  # Execute SQL with position parameter
  psql -U $DB_USER -d $DB_NAME -c "
    INSERT INTO user_position_updated_events (
      pair,
      signer,
      position,
      collateral0,
      collateral1,
      debt0_shares,
      debt1_shares,
      collateral0_applied_min_cf_bps,
      collateral1_applied_min_cf_bps,
      transaction_signature,
      slot,
      event_timestamp
    ) VALUES (
      'DvznCGfDdmjbu4YcDrrXAYXWtrrSnubzZqW2VdiBWPxB',
      'E3WFCvNDkxTsGgg9fKVBrN3r92XYbrXwdMDXzK4jHwqQ',
      '$POSITION',
      '1000000',
      '2000000',
      '500000',
      '600000',
      5000,
      6000,
      'TestTxSig_' || gen_random_uuid()::text,
      '123456',
      NOW()
    );
  " >/dev/null 2>&1

  if [ $? -ne 0 ]; then
    echo "Error: Failed to insert position $POSITION"
  fi

  # Sleep before next iteration (except on last iteration)
  if [ $i -lt $ITERATIONS ]; then
    sleep $INTERVAL
  fi
done

echo ""
echo "Test completed. Cleaning up..."

# Delete all test positions
for position in "${POSITIONS[@]}"; do
  psql -U $DB_USER -d $DB_NAME -c "
    DELETE FROM user_position_updated_events
    WHERE position = '$position';
  " >/dev/null 2>&1
done

echo "Cleanup completed. Deleted ${#POSITIONS[@]} test positions."

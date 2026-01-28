/**
 * Program IDL in camelCase format in order to be used in JS/TS.
 *
 * Note that this is only a type helper and is not the actual IDL. The original
 * IDL can be found at `target/idl/omnipair.json`.
 */
export type Omnipair = {
  "address": "omniSVEL3cY36TYhunvJC6vBXxbJrqrn7JhDrXUTerb",
  "metadata": {
    "name": "omnipair",
    "version": "0.1.0",
    "spec": "0.1.0",
    "description": "Oracless spot and margin money market protocol"
  },
  "instructions": [
    {
      "name": "addCollateral",
      "discriminator": [
        127,
        82,
        121,
        42,
        161,
        176,
        249,
        206
      ],
      "accounts": [
        {
          "name": "pair",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  109,
                  95,
                  112,
                  97,
                  105,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pair.token0",
                "account": "pair"
              },
              {
                "kind": "account",
                "path": "pair.token1",
                "account": "pair"
              },
              {
                "kind": "account",
                "path": "pair.params_hash",
                "account": "pair"
              }
            ]
          }
        },
        {
          "name": "rateModel",
          "writable": true
        },
        {
          "name": "futarchyAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  116,
                  97,
                  114,
                  99,
                  104,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "userPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  109,
                  95,
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "collateralVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "collateralTokenMint"
              }
            ]
          }
        },
        {
          "name": "userCollateralTokenAccount",
          "writable": true
        },
        {
          "name": "collateralTokenMint"
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "adjustCollateralArgs"
            }
          }
        }
      ]
    },
    {
      "name": "addLiquidity",
      "discriminator": [
        181,
        157,
        89,
        67,
        143,
        182,
        52,
        72
      ],
      "accounts": [
        {
          "name": "pair",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  109,
                  95,
                  112,
                  97,
                  105,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pair.token0",
                "account": "pair"
              },
              {
                "kind": "account",
                "path": "pair.token1",
                "account": "pair"
              },
              {
                "kind": "account",
                "path": "pair.params_hash",
                "account": "pair"
              }
            ]
          }
        },
        {
          "name": "rateModel",
          "writable": true
        },
        {
          "name": "futarchyAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  116,
                  97,
                  114,
                  99,
                  104,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "reserve0Vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "pair.token0",
                "account": "pair"
              }
            ]
          }
        },
        {
          "name": "reserve1Vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "pair.token1",
                "account": "pair"
              }
            ]
          }
        },
        {
          "name": "userToken0Account",
          "writable": true
        },
        {
          "name": "userToken1Account",
          "writable": true
        },
        {
          "name": "token0Mint"
        },
        {
          "name": "token1Mint"
        },
        {
          "name": "lpMint",
          "writable": true
        },
        {
          "name": "userLpTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "user"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "lpMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "addLiquidityArgs"
            }
          }
        }
      ]
    },
    {
      "name": "borrow",
      "discriminator": [
        228,
        253,
        131,
        202,
        207,
        116,
        89,
        18
      ],
      "accounts": [
        {
          "name": "pair",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  109,
                  95,
                  112,
                  97,
                  105,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pair.token0",
                "account": "pair"
              },
              {
                "kind": "account",
                "path": "pair.token1",
                "account": "pair"
              },
              {
                "kind": "account",
                "path": "pair.params_hash",
                "account": "pair"
              }
            ]
          }
        },
        {
          "name": "userPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  109,
                  95,
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "rateModel",
          "writable": true
        },
        {
          "name": "futarchyAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  116,
                  97,
                  114,
                  99,
                  104,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "reserveVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "reserveTokenMint"
              }
            ]
          }
        },
        {
          "name": "userReserveTokenAccount",
          "writable": true
        },
        {
          "name": "reserveTokenMint"
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "adjustDebtArgs"
            }
          }
        }
      ]
    },
    {
      "name": "claimProtocolFees",
      "discriminator": [
        34,
        142,
        219,
        112,
        109,
        54,
        133,
        23
      ],
      "accounts": [
        {
          "name": "caller",
          "docs": [
            "Anyone can call this instruction"
          ],
          "writable": true,
          "signer": true
        },
        {
          "name": "pair",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  109,
                  95,
                  112,
                  97,
                  105,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pair.token0",
                "account": "pair"
              },
              {
                "kind": "account",
                "path": "pair.token1",
                "account": "pair"
              },
              {
                "kind": "account",
                "path": "pair.params_hash",
                "account": "pair"
              }
            ]
          }
        },
        {
          "name": "rateModel",
          "writable": true
        },
        {
          "name": "futarchyAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  116,
                  97,
                  114,
                  99,
                  104,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "reserve0Vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "pair.token0",
                "account": "pair"
              }
            ]
          }
        },
        {
          "name": "reserve1Vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "pair.token1",
                "account": "pair"
              }
            ]
          }
        },
        {
          "name": "authorityToken0Account",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "futarchyAuthority"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "token0Mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "authorityToken1Account",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "futarchyAuthority"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "token1Mint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "token0Mint"
        },
        {
          "name": "token1Mint"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": []
    },
    {
      "name": "distributeTokens",
      "discriminator": [
        105,
        69,
        130,
        52,
        196,
        28,
        176,
        120
      ],
      "accounts": [
        {
          "name": "futarchyAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  116,
                  97,
                  114,
                  99,
                  104,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "sourceMint"
        },
        {
          "name": "sourceTokenAccount",
          "writable": true
        },
        {
          "name": "futarchyTreasuryTokenAccount",
          "writable": true
        },
        {
          "name": "buybacksVaultTokenAccount",
          "writable": true
        },
        {
          "name": "teamTreasuryTokenAccount",
          "writable": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "distributeTokensArgs"
            }
          }
        }
      ]
    },
    {
      "name": "flashloan",
      "discriminator": [
        105,
        33,
        1,
        3,
        42,
        158,
        246,
        67
      ],
      "accounts": [
        {
          "name": "pair",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  109,
                  95,
                  112,
                  97,
                  105,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pair.token0",
                "account": "pair"
              },
              {
                "kind": "account",
                "path": "pair.token1",
                "account": "pair"
              },
              {
                "kind": "account",
                "path": "pair.params_hash",
                "account": "pair"
              }
            ]
          }
        },
        {
          "name": "rateModel",
          "writable": true
        },
        {
          "name": "futarchyAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  116,
                  97,
                  114,
                  99,
                  104,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "reserve0Vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "pair.token0",
                "account": "pair"
              }
            ]
          }
        },
        {
          "name": "reserve1Vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "pair.token1",
                "account": "pair"
              }
            ]
          }
        },
        {
          "name": "token0Mint"
        },
        {
          "name": "token1Mint"
        },
        {
          "name": "receiverToken0Account",
          "writable": true
        },
        {
          "name": "receiverToken1Account",
          "writable": true
        },
        {
          "name": "receiverProgram",
          "docs": [
            "This program will be invoked via CPI"
          ]
        },
        {
          "name": "user",
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "flashloanArgs"
            }
          }
        }
      ]
    },
    {
      "name": "initFutarchyAuthority",
      "discriminator": [
        133,
        110,
        154,
        29,
        240,
        206,
        71,
        100
      ],
      "accounts": [
        {
          "name": "deployer",
          "writable": true,
          "signer": true,
          "address": "8tF4uYMBXqGhCUGRZL3AmPqRzbX8JJ1TpYnY3uJKN4kt"
        },
        {
          "name": "futarchyAuthority",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  116,
                  97,
                  114,
                  99,
                  104,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "initFutarchyAuthorityArgs"
            }
          }
        }
      ]
    },
    {
      "name": "initialize",
      "discriminator": [
        175,
        175,
        109,
        31,
        13,
        152,
        155,
        237
      ],
      "accounts": [
        {
          "name": "deployer",
          "writable": true,
          "signer": true
        },
        {
          "name": "token0Mint"
        },
        {
          "name": "token1Mint"
        },
        {
          "name": "pair",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  109,
                  95,
                  112,
                  97,
                  105,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "token0Mint"
              },
              {
                "kind": "account",
                "path": "token1Mint"
              },
              {
                "kind": "arg",
                "path": "args.params_hash"
              }
            ]
          }
        },
        {
          "name": "futarchyAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  116,
                  97,
                  114,
                  99,
                  104,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "rateModel",
          "writable": true,
          "signer": true
        },
        {
          "name": "lpMint",
          "writable": true
        },
        {
          "name": "lpTokenMetadata",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  109,
                  101,
                  116,
                  97,
                  100,
                  97,
                  116,
                  97
                ]
              },
              {
                "kind": "const",
                "value": [
                  11,
                  112,
                  101,
                  177,
                  227,
                  209,
                  124,
                  69,
                  56,
                  157,
                  82,
                  127,
                  107,
                  4,
                  195,
                  205,
                  88,
                  184,
                  108,
                  115,
                  26,
                  160,
                  253,
                  181,
                  73,
                  182,
                  209,
                  188,
                  3,
                  248,
                  41,
                  70
                ]
              },
              {
                "kind": "account",
                "path": "lpMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                11,
                112,
                101,
                177,
                227,
                209,
                124,
                69,
                56,
                157,
                82,
                127,
                107,
                4,
                195,
                205,
                88,
                184,
                108,
                115,
                26,
                160,
                253,
                181,
                73,
                182,
                209,
                188,
                3,
                248,
                41,
                70
              ]
            }
          }
        },
        {
          "name": "deployerLpTokenAccount",
          "writable": true
        },
        {
          "name": "reserve0Vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "token0Mint"
              }
            ]
          }
        },
        {
          "name": "reserve1Vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "token1Mint"
              }
            ]
          }
        },
        {
          "name": "collateral0Vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "token0Mint"
              }
            ]
          }
        },
        {
          "name": "collateral1Vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "token1Mint"
              }
            ]
          }
        },
        {
          "name": "deployerToken0Account",
          "writable": true
        },
        {
          "name": "deployerToken1Account",
          "writable": true
        },
        {
          "name": "authorityWsolAccount",
          "writable": true
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "tokenMetadataProgram",
          "address": "metaqbxxUerdq28cj1RbAWkYQm3ybzjb6a8bt518x1s"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "rent",
          "address": "SysvarRent111111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "initializeAndBootstrapArgs"
            }
          }
        }
      ]
    },
    {
      "name": "liquidate",
      "discriminator": [
        223,
        179,
        226,
        125,
        48,
        46,
        39,
        74
      ],
      "accounts": [
        {
          "name": "pair",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  109,
                  95,
                  112,
                  97,
                  105,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pair.token0",
                "account": "pair"
              },
              {
                "kind": "account",
                "path": "pair.token1",
                "account": "pair"
              },
              {
                "kind": "account",
                "path": "pair.params_hash",
                "account": "pair"
              }
            ]
          }
        },
        {
          "name": "userPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  109,
                  95,
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "positionOwner"
              }
            ]
          }
        },
        {
          "name": "rateModel",
          "writable": true
        },
        {
          "name": "futarchyAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  116,
                  97,
                  114,
                  99,
                  104,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "collateralVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "collateralTokenMint"
              }
            ]
          }
        },
        {
          "name": "callerTokenAccount",
          "writable": true
        },
        {
          "name": "collateralTokenMint"
        },
        {
          "name": "reserveVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "collateralTokenMint"
              }
            ]
          }
        },
        {
          "name": "positionOwner"
        },
        {
          "name": "payer",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": []
    },
    {
      "name": "removeCollateral",
      "discriminator": [
        86,
        222,
        130,
        86,
        92,
        20,
        72,
        65
      ],
      "accounts": [
        {
          "name": "pair",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  109,
                  95,
                  112,
                  97,
                  105,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pair.token0",
                "account": "pair"
              },
              {
                "kind": "account",
                "path": "pair.token1",
                "account": "pair"
              },
              {
                "kind": "account",
                "path": "pair.params_hash",
                "account": "pair"
              }
            ]
          }
        },
        {
          "name": "userPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  109,
                  95,
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "rateModel",
          "writable": true
        },
        {
          "name": "futarchyAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  116,
                  97,
                  114,
                  99,
                  104,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "collateralVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  99,
                  111,
                  108,
                  108,
                  97,
                  116,
                  101,
                  114,
                  97,
                  108,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "collateralTokenMint"
              }
            ]
          }
        },
        {
          "name": "userCollateralTokenAccount",
          "writable": true
        },
        {
          "name": "collateralTokenMint"
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "adjustCollateralArgs"
            }
          }
        }
      ]
    },
    {
      "name": "removeLiquidity",
      "discriminator": [
        80,
        85,
        209,
        72,
        24,
        206,
        177,
        108
      ],
      "accounts": [
        {
          "name": "pair",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  109,
                  95,
                  112,
                  97,
                  105,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pair.token0",
                "account": "pair"
              },
              {
                "kind": "account",
                "path": "pair.token1",
                "account": "pair"
              },
              {
                "kind": "account",
                "path": "pair.params_hash",
                "account": "pair"
              }
            ]
          }
        },
        {
          "name": "rateModel",
          "writable": true
        },
        {
          "name": "futarchyAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  116,
                  97,
                  114,
                  99,
                  104,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "reserve0Vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "pair.token0",
                "account": "pair"
              }
            ]
          }
        },
        {
          "name": "reserve1Vault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "pair.token1",
                "account": "pair"
              }
            ]
          }
        },
        {
          "name": "userToken0Account",
          "writable": true
        },
        {
          "name": "userToken1Account",
          "writable": true
        },
        {
          "name": "token0Mint"
        },
        {
          "name": "token1Mint"
        },
        {
          "name": "lpMint",
          "writable": true
        },
        {
          "name": "userLpTokenAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "user"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "lpMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "removeLiquidityArgs"
            }
          }
        }
      ]
    },
    {
      "name": "repay",
      "discriminator": [
        234,
        103,
        67,
        82,
        208,
        234,
        219,
        166
      ],
      "accounts": [
        {
          "name": "pair",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  109,
                  95,
                  112,
                  97,
                  105,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pair.token0",
                "account": "pair"
              },
              {
                "kind": "account",
                "path": "pair.token1",
                "account": "pair"
              },
              {
                "kind": "account",
                "path": "pair.params_hash",
                "account": "pair"
              }
            ]
          }
        },
        {
          "name": "userPosition",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  109,
                  95,
                  112,
                  111,
                  115,
                  105,
                  116,
                  105,
                  111,
                  110
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "user"
              }
            ]
          }
        },
        {
          "name": "rateModel",
          "writable": true
        },
        {
          "name": "futarchyAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  116,
                  97,
                  114,
                  99,
                  104,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "reserveVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "reserveTokenMint"
              }
            ]
          }
        },
        {
          "name": "userReserveTokenAccount",
          "writable": true
        },
        {
          "name": "reserveTokenMint"
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "adjustDebtArgs"
            }
          }
        }
      ]
    },
    {
      "name": "swap",
      "discriminator": [
        248,
        198,
        158,
        145,
        225,
        117,
        135,
        200
      ],
      "accounts": [
        {
          "name": "pair",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  103,
                  97,
                  109,
                  109,
                  95,
                  112,
                  97,
                  105,
                  114
                ]
              },
              {
                "kind": "account",
                "path": "pair.token0",
                "account": "pair"
              },
              {
                "kind": "account",
                "path": "pair.token1",
                "account": "pair"
              },
              {
                "kind": "account",
                "path": "pair.params_hash",
                "account": "pair"
              }
            ]
          }
        },
        {
          "name": "rateModel",
          "writable": true
        },
        {
          "name": "futarchyAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  116,
                  97,
                  114,
                  99,
                  104,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "tokenInVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "tokenInMint"
              }
            ]
          }
        },
        {
          "name": "tokenOutVault",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  114,
                  101,
                  115,
                  101,
                  114,
                  118,
                  101,
                  95,
                  118,
                  97,
                  117,
                  108,
                  116
                ]
              },
              {
                "kind": "account",
                "path": "pair"
              },
              {
                "kind": "account",
                "path": "tokenOutMint"
              }
            ]
          }
        },
        {
          "name": "userTokenInAccount",
          "writable": true
        },
        {
          "name": "userTokenOutAccount",
          "writable": true
        },
        {
          "name": "tokenInMint"
        },
        {
          "name": "tokenOutMint"
        },
        {
          "name": "authorityTokenInAccount",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "account",
                "path": "futarchyAuthority"
              },
              {
                "kind": "const",
                "value": [
                  6,
                  221,
                  246,
                  225,
                  215,
                  101,
                  161,
                  147,
                  217,
                  203,
                  225,
                  70,
                  206,
                  235,
                  121,
                  172,
                  28,
                  180,
                  133,
                  237,
                  95,
                  91,
                  55,
                  145,
                  58,
                  140,
                  245,
                  133,
                  126,
                  255,
                  0,
                  169
                ]
              },
              {
                "kind": "account",
                "path": "tokenInMint"
              }
            ],
            "program": {
              "kind": "const",
              "value": [
                140,
                151,
                37,
                143,
                78,
                36,
                137,
                241,
                187,
                61,
                16,
                41,
                20,
                142,
                13,
                131,
                11,
                90,
                19,
                153,
                218,
                255,
                16,
                132,
                4,
                142,
                123,
                216,
                219,
                233,
                248,
                89
              ]
            }
          }
        },
        {
          "name": "user",
          "writable": true,
          "signer": true
        },
        {
          "name": "tokenProgram",
          "address": "TokenkegQfeZyiNwAJbNbGKPFXCWuBvf9Ss623VQ5DA"
        },
        {
          "name": "token2022Program",
          "address": "TokenzQdBNbLqP5VEhdkAS6EPFLC1PHnBqCXEpPxuEb"
        },
        {
          "name": "associatedTokenProgram",
          "address": "ATokenGPvbdGVxr1b2hvZbsiqW5xWH25efTNsLJA8knL"
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        },
        {
          "name": "eventAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  95,
                  95,
                  101,
                  118,
                  101,
                  110,
                  116,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "program"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "swapArgs"
            }
          }
        }
      ]
    },
    {
      "name": "updateFutarchyAuthority",
      "discriminator": [
        15,
        196,
        157,
        217,
        113,
        226,
        89,
        25
      ],
      "accounts": [
        {
          "name": "authoritySigner",
          "writable": true,
          "signer": true
        },
        {
          "name": "futarchyAuthority",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  116,
                  97,
                  114,
                  99,
                  104,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "updateFutarchyAuthorityArgs"
            }
          }
        }
      ]
    },
    {
      "name": "updateProtocolRevenue",
      "discriminator": [
        176,
        139,
        131,
        197,
        40,
        225,
        125,
        200
      ],
      "accounts": [
        {
          "name": "authoritySigner",
          "writable": true,
          "signer": true
        },
        {
          "name": "futarchyAuthority",
          "writable": true,
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  116,
                  97,
                  114,
                  99,
                  104,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        },
        {
          "name": "systemProgram",
          "address": "11111111111111111111111111111111"
        }
      ],
      "args": [
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "updateProtocolRevenueArgs"
            }
          }
        }
      ]
    },
    {
      "name": "viewPairData",
      "docs": [
        "View instructions for client data access (Logs + RPC simulation to parse returned logs for values)",
        "This approach allows for \"view\" functionality of on-chain calculations (similar to Solidity view functions)",
        "i.e. time-dependent calculations"
      ],
      "discriminator": [
        30,
        231,
        169,
        73,
        19,
        161,
        44,
        252
      ],
      "accounts": [
        {
          "name": "pair"
        },
        {
          "name": "rateModel"
        },
        {
          "name": "futarchyAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  116,
                  97,
                  114,
                  99,
                  104,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "getter",
          "type": {
            "defined": {
              "name": "pairViewKind"
            }
          }
        },
        {
          "name": "args",
          "type": {
            "defined": {
              "name": "emitValueArgs"
            }
          }
        }
      ]
    },
    {
      "name": "viewUserPositionData",
      "discriminator": [
        203,
        218,
        173,
        213,
        43,
        31,
        211,
        152
      ],
      "accounts": [
        {
          "name": "pair"
        },
        {
          "name": "userPosition"
        },
        {
          "name": "rateModel"
        },
        {
          "name": "futarchyAuthority",
          "pda": {
            "seeds": [
              {
                "kind": "const",
                "value": [
                  102,
                  117,
                  116,
                  97,
                  114,
                  99,
                  104,
                  121,
                  95,
                  97,
                  117,
                  116,
                  104,
                  111,
                  114,
                  105,
                  116,
                  121
                ]
              }
            ]
          }
        }
      ],
      "args": [
        {
          "name": "getter",
          "type": {
            "defined": {
              "name": "userPositionViewKind"
            }
          }
        }
      ]
    }
  ],
  "accounts": [
    {
      "name": "futarchyAuthority",
      "discriminator": [
        175,
        247,
        160,
        182,
        140,
        128,
        211,
        226
      ]
    },
    {
      "name": "pair",
      "discriminator": [
        85,
        72,
        49,
        176,
        182,
        228,
        141,
        82
      ]
    },
    {
      "name": "rateModel",
      "discriminator": [
        94,
        3,
        203,
        219,
        107,
        137,
        4,
        162
      ]
    },
    {
      "name": "userPosition",
      "discriminator": [
        251,
        248,
        209,
        245,
        83,
        234,
        17,
        27
      ]
    }
  ],
  "events": [
    {
      "name": "adjustCollateralEvent",
      "discriminator": [
        99,
        246,
        67,
        126,
        44,
        252,
        193,
        33
      ]
    },
    {
      "name": "adjustDebtEvent",
      "discriminator": [
        153,
        8,
        169,
        116,
        207,
        116,
        155,
        128
      ]
    },
    {
      "name": "adjustLiquidityEvent",
      "discriminator": [
        229,
        162,
        211,
        39,
        159,
        251,
        24,
        78
      ]
    },
    {
      "name": "burnEvent",
      "discriminator": [
        33,
        89,
        47,
        117,
        82,
        124,
        238,
        250
      ]
    },
    {
      "name": "flashloanEvent",
      "discriminator": [
        34,
        49,
        239,
        242,
        228,
        45,
        20,
        97
      ]
    },
    {
      "name": "mintEvent",
      "discriminator": [
        197,
        144,
        146,
        149,
        66,
        164,
        95,
        16
      ]
    },
    {
      "name": "pairCreatedEvent",
      "discriminator": [
        118,
        0,
        50,
        196,
        55,
        255,
        121,
        43
      ]
    },
    {
      "name": "swapEvent",
      "discriminator": [
        64,
        198,
        205,
        232,
        38,
        8,
        113,
        226
      ]
    },
    {
      "name": "updatePairEvent",
      "discriminator": [
        44,
        6,
        60,
        245,
        142,
        38,
        166,
        247
      ]
    },
    {
      "name": "userLiquidityPositionUpdatedEvent",
      "discriminator": [
        255,
        227,
        32,
        107,
        211,
        246,
        39,
        78
      ]
    },
    {
      "name": "userPositionCreatedEvent",
      "discriminator": [
        240,
        132,
        92,
        227,
        209,
        72,
        178,
        169
      ]
    },
    {
      "name": "userPositionLiquidatedEvent",
      "discriminator": [
        220,
        137,
        217,
        3,
        242,
        190,
        238,
        216
      ]
    },
    {
      "name": "userPositionUpdatedEvent",
      "discriminator": [
        83,
        168,
        197,
        88,
        89,
        42,
        58,
        102
      ]
    }
  ],
  "errors": [
    {
      "code": 6000,
      "name": "invalidDeployer",
      "msg": "Invalid deployer"
    },
    {
      "code": 6001,
      "name": "argumentMissing",
      "msg": "Argument missing"
    },
    {
      "code": 6002,
      "name": "invalidSwapFeeBps",
      "msg": "Invalid swap fee bps"
    },
    {
      "code": 6003,
      "name": "invalidInterestFeeBps",
      "msg": "Invalid interest fee bps"
    },
    {
      "code": 6004,
      "name": "invalidHalfLife",
      "msg": "Invalid half life"
    },
    {
      "code": 6005,
      "name": "invalidFutarchyAuthority",
      "msg": "Invalid futarchy authority"
    },
    {
      "code": 6006,
      "name": "invalidArgument",
      "msg": "Invalid argument"
    },
    {
      "code": 6007,
      "name": "amountZero",
      "msg": "Amount cannot be zero"
    },
    {
      "code": 6008,
      "name": "insufficientAmount0In",
      "msg": "Insufficient amount0 in"
    },
    {
      "code": 6009,
      "name": "insufficientAmount1In",
      "msg": "Insufficient amount1 in"
    },
    {
      "code": 6010,
      "name": "borrowingPowerExceeded",
      "msg": "Borrowing power exceeded"
    },
    {
      "code": 6011,
      "name": "invalidTokenAccount",
      "msg": "Invalid token account"
    },
    {
      "code": 6012,
      "name": "invalidTokenProgram",
      "msg": "Invalid token program"
    },
    {
      "code": 6013,
      "name": "borrowExceedsReserve",
      "msg": "Borrow exceeds reserve"
    },
    {
      "code": 6014,
      "name": "insufficientAmount0",
      "msg": "Insufficient amount0"
    },
    {
      "code": 6015,
      "name": "insufficientAmount1",
      "msg": "Insufficient amount1"
    },
    {
      "code": 6016,
      "name": "insufficientOutputAmount",
      "msg": "Insufficient output amount"
    },
    {
      "code": 6017,
      "name": "slippageExceeded",
      "msg": "Output amount below minimum requested (slippage exceeded)"
    },
    {
      "code": 6018,
      "name": "insufficientLiquidity",
      "msg": "Insufficient liquidity"
    },
    {
      "code": 6019,
      "name": "insufficientCashReserve0",
      "msg": "Insufficient cash reserve0"
    },
    {
      "code": 6020,
      "name": "insufficientCashReserve1",
      "msg": "Insufficient cash reserve1"
    },
    {
      "code": 6021,
      "name": "overflow",
      "msg": "Arithmetic overflow"
    },
    {
      "code": 6022,
      "name": "undercollateralized",
      "msg": "undercollateralized"
    },
    {
      "code": 6023,
      "name": "insufficientBalanceForCollateral",
      "msg": "Insufficient balance for collateral"
    },
    {
      "code": 6024,
      "name": "insufficientAmount",
      "msg": "Insufficient amount"
    },
    {
      "code": 6025,
      "name": "insufficientBalance",
      "msg": "User balance insufficient to cover requested amount"
    },
    {
      "code": 6026,
      "name": "insufficientDebt",
      "msg": "Insufficient debt"
    },
    {
      "code": 6027,
      "name": "userPositionNotInitialized",
      "msg": "User position not initialized"
    },
    {
      "code": 6028,
      "name": "zeroDebtAmount",
      "msg": "Zero debt amount"
    },
    {
      "code": 6029,
      "name": "notUndercollateralized",
      "msg": "Not undercollateralized"
    },
    {
      "code": 6030,
      "name": "brokenInvariant",
      "msg": "Broken invariant"
    },
    {
      "code": 6031,
      "name": "invariantOverflow",
      "msg": "Math overflow during invariant calculation"
    },
    {
      "code": 6032,
      "name": "feeMathOverflow",
      "msg": "Math overflow during fee calculation."
    },
    {
      "code": 6033,
      "name": "outputAmountOverflow",
      "msg": "Math overflow during output amount calculation."
    },
    {
      "code": 6034,
      "name": "reserveOverflow",
      "msg": "Math overflow during reserve calculation."
    },
    {
      "code": 6035,
      "name": "reserveUnderflow",
      "msg": "Math underflow during reserve calculation."
    },
    {
      "code": 6036,
      "name": "cashReserveUnderflow",
      "msg": "Math underflow during cash reserve calculation."
    },
    {
      "code": 6037,
      "name": "denominatorOverflow",
      "msg": "Math overflow during denominator calculation."
    },
    {
      "code": 6038,
      "name": "liquidityMathOverflow",
      "msg": "Math overflow during liquidity calculation"
    },
    {
      "code": 6039,
      "name": "liquiditySqrtOverflow",
      "msg": "Math overflow during liquidity square root calculation"
    },
    {
      "code": 6040,
      "name": "liquidityUnderflow",
      "msg": "Math underflow during liquidity calculation"
    },
    {
      "code": 6041,
      "name": "liquidityConversionOverflow",
      "msg": "Math overflow during liquidity conversion"
    },
    {
      "code": 6042,
      "name": "supplyOverflow",
      "msg": "Math overflow during supply calculation"
    },
    {
      "code": 6043,
      "name": "supplyUnderflow",
      "msg": "Math underflow during supply calculation"
    },
    {
      "code": 6044,
      "name": "debtMathOverflow",
      "msg": "Math overflow during debt calculation"
    },
    {
      "code": 6045,
      "name": "debtShareMathOverflow",
      "msg": "Math overflow during debt share calculation"
    },
    {
      "code": 6046,
      "name": "debtShareDivisionOverflow",
      "msg": "Math overflow during debt share division"
    },
    {
      "code": 6047,
      "name": "debtUtilizationOverflow",
      "msg": "Math overflow during debt utilization calculation"
    },
    {
      "code": 6048,
      "name": "invalidMint",
      "msg": "Invalid mint"
    },
    {
      "code": 6049,
      "name": "invalidMintLen",
      "msg": "Invalid mint length"
    },
    {
      "code": 6050,
      "name": "invalidDistribution",
      "msg": "Invalid distribution - percentages must sum to 100%"
    },
    {
      "code": 6051,
      "name": "invalidLpMintKey",
      "msg": "Invalid LP mint key"
    },
    {
      "code": 6052,
      "name": "invalidLpName",
      "msg": "Invalid LP name"
    },
    {
      "code": 6053,
      "name": "invalidLpSymbol",
      "msg": "Invalid LP symbol"
    },
    {
      "code": 6054,
      "name": "invalidLpUri",
      "msg": "Invalid LP URI"
    },
    {
      "code": 6055,
      "name": "accountNotEmpty",
      "msg": "Account not empty"
    },
    {
      "code": 6056,
      "name": "invalidMintAuthority",
      "msg": "Invalid mint authority"
    },
    {
      "code": 6057,
      "name": "frozenLpMint",
      "msg": "Frozen LP mint"
    },
    {
      "code": 6058,
      "name": "nonZeroSupply",
      "msg": "Non-zero supply"
    },
    {
      "code": 6059,
      "name": "wrongLpDecimals",
      "msg": "Wrong LP decimals"
    },
    {
      "code": 6060,
      "name": "invalidVaultSameAccount",
      "msg": "Invalid vault - token_in_vault and token_out_vault must be different"
    },
    {
      "code": 6061,
      "name": "invalidVault",
      "msg": "Invalid vault"
    },
    {
      "code": 6062,
      "name": "invalidParamsHash",
      "msg": "Invalid params hash - hash does not match computed parameters"
    },
    {
      "code": 6063,
      "name": "invalidVersion",
      "msg": "Invalid version"
    },
    {
      "code": 6064,
      "name": "invalidTokenOrder",
      "msg": "Invalid token order"
    },
    {
      "code": 6065,
      "name": "invalidRateModel",
      "msg": "Invalid rate model - rate_model does not match pair.rate_model"
    },
    {
      "code": 6066,
      "name": "invalidPair",
      "msg": "Invalid pair - pair does not match user_position.pair"
    },
    {
      "code": 6067,
      "name": "invalidUtilBounds",
      "msg": "Invalid utilization bounds - must satisfy: MIN <= start < end <= MAX"
    }
  ],
  "types": [
    {
      "name": "addLiquidityArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount0In",
            "type": "u64"
          },
          {
            "name": "amount1In",
            "type": "u64"
          },
          {
            "name": "minLiquidityOut",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "adjustCollateralArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "adjustCollateralEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount0",
            "type": "i64"
          },
          {
            "name": "amount1",
            "type": "i64"
          },
          {
            "name": "metadata",
            "type": {
              "defined": {
                "name": "eventMetadata"
              }
            }
          }
        ]
      }
    },
    {
      "name": "adjustDebtArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "adjustDebtEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount0",
            "type": "i64"
          },
          {
            "name": "amount1",
            "type": "i64"
          },
          {
            "name": "metadata",
            "type": {
              "defined": {
                "name": "eventMetadata"
              }
            }
          }
        ]
      }
    },
    {
      "name": "adjustLiquidityEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount0",
            "type": "u64"
          },
          {
            "name": "amount1",
            "type": "u64"
          },
          {
            "name": "liquidity",
            "type": "u64"
          },
          {
            "name": "metadata",
            "type": {
              "defined": {
                "name": "eventMetadata"
              }
            }
          }
        ]
      }
    },
    {
      "name": "burnEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount0",
            "type": "u64"
          },
          {
            "name": "amount1",
            "type": "u64"
          },
          {
            "name": "liquidity",
            "type": "u64"
          },
          {
            "name": "metadata",
            "type": {
              "defined": {
                "name": "eventMetadata"
              }
            }
          }
        ]
      }
    },
    {
      "name": "distributeTokensArgs",
      "type": {
        "kind": "struct",
        "fields": []
      }
    },
    {
      "name": "emitValueArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "debtAmount",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "collateralAmount",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "collateralToken",
            "type": {
              "option": "pubkey"
            }
          }
        ]
      }
    },
    {
      "name": "eventMetadata",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "signer",
            "type": "pubkey"
          },
          {
            "name": "pair",
            "type": "pubkey"
          },
          {
            "name": "slot",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "flashloanArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount0",
            "type": "u64"
          },
          {
            "name": "amount1",
            "type": "u64"
          },
          {
            "name": "data",
            "type": "bytes"
          }
        ]
      }
    },
    {
      "name": "flashloanEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount0",
            "type": "u64"
          },
          {
            "name": "amount1",
            "type": "u64"
          },
          {
            "name": "fee0",
            "type": "u64"
          },
          {
            "name": "fee1",
            "type": "u64"
          },
          {
            "name": "receiver",
            "type": "pubkey"
          },
          {
            "name": "metadata",
            "type": {
              "defined": {
                "name": "eventMetadata"
              }
            }
          }
        ]
      }
    },
    {
      "name": "futarchyAuthority",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "recipients",
            "type": {
              "defined": {
                "name": "revenueRecipients"
              }
            }
          },
          {
            "name": "revenueShare",
            "type": {
              "defined": {
                "name": "revenueShare"
              }
            }
          },
          {
            "name": "revenueDistribution",
            "type": {
              "defined": {
                "name": "revenueDistribution"
              }
            }
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "initFutarchyAuthorityArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "authority",
            "type": "pubkey"
          },
          {
            "name": "swapBps",
            "type": "u16"
          },
          {
            "name": "interestBps",
            "type": "u16"
          },
          {
            "name": "futarchyTreasury",
            "type": "pubkey"
          },
          {
            "name": "futarchyTreasuryBps",
            "type": "u16"
          },
          {
            "name": "buybacksVault",
            "type": "pubkey"
          },
          {
            "name": "buybacksVaultBps",
            "type": "u16"
          },
          {
            "name": "teamTreasury",
            "type": "pubkey"
          },
          {
            "name": "teamTreasuryBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "initializeAndBootstrapArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "swapFeeBps",
            "type": "u16"
          },
          {
            "name": "halfLife",
            "type": "u64"
          },
          {
            "name": "fixedCfBps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "targetUtilStartBps",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "targetUtilEndBps",
            "type": {
              "option": "u64"
            }
          },
          {
            "name": "paramsHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "amount0In",
            "type": "u64"
          },
          {
            "name": "amount1In",
            "type": "u64"
          },
          {
            "name": "minLiquidityOut",
            "type": "u64"
          },
          {
            "name": "lpName",
            "type": "string"
          },
          {
            "name": "lpSymbol",
            "type": "string"
          },
          {
            "name": "lpUri",
            "type": "string"
          }
        ]
      }
    },
    {
      "name": "lastPriceEma",
      "docs": [
        "Tracks exponential moving averages (EMAs) for the last observed price.",
        "- `symmetric`: standard two-way EMA (exponential price growth and decay)",
        "- `directional`: one-way bottom-up asymmetric EMA (exponential price growth, but snaps instantly on price drops)"
      ],
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "symmetric",
            "type": "u64"
          },
          {
            "name": "directional",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "mintEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amount0",
            "type": "u64"
          },
          {
            "name": "amount1",
            "type": "u64"
          },
          {
            "name": "liquidity",
            "type": "u64"
          },
          {
            "name": "metadata",
            "type": {
              "defined": {
                "name": "eventMetadata"
              }
            }
          }
        ]
      }
    },
    {
      "name": "pair",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "token0",
            "type": "pubkey"
          },
          {
            "name": "token1",
            "type": "pubkey"
          },
          {
            "name": "lpMint",
            "type": "pubkey"
          },
          {
            "name": "rateModel",
            "type": "pubkey"
          },
          {
            "name": "swapFeeBps",
            "type": "u16"
          },
          {
            "name": "halfLife",
            "type": "u64"
          },
          {
            "name": "fixedCfBps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "reserve0",
            "type": "u64"
          },
          {
            "name": "reserve1",
            "type": "u64"
          },
          {
            "name": "cashReserve0",
            "type": "u64"
          },
          {
            "name": "cashReserve1",
            "type": "u64"
          },
          {
            "name": "lastPrice0Ema",
            "type": {
              "defined": {
                "name": "lastPriceEma"
              }
            }
          },
          {
            "name": "lastPrice1Ema",
            "type": {
              "defined": {
                "name": "lastPriceEma"
              }
            }
          },
          {
            "name": "lastUpdate",
            "type": "u64"
          },
          {
            "name": "lastRate0",
            "type": "u64"
          },
          {
            "name": "lastRate1",
            "type": "u64"
          },
          {
            "name": "totalDebt0",
            "type": "u64"
          },
          {
            "name": "totalDebt1",
            "type": "u64"
          },
          {
            "name": "totalDebt0Shares",
            "type": "u128"
          },
          {
            "name": "totalDebt1Shares",
            "type": "u128"
          },
          {
            "name": "totalSupply",
            "type": "u64"
          },
          {
            "name": "totalCollateral0",
            "type": "u64"
          },
          {
            "name": "totalCollateral1",
            "type": "u64"
          },
          {
            "name": "token0Decimals",
            "type": "u8"
          },
          {
            "name": "token1Decimals",
            "type": "u8"
          },
          {
            "name": "paramsHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "bump",
            "type": "u8"
          },
          {
            "name": "vaultBumps",
            "type": {
              "defined": {
                "name": "vaultBumps"
              }
            }
          }
        ]
      }
    },
    {
      "name": "pairCreatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "token0",
            "type": "pubkey"
          },
          {
            "name": "token1",
            "type": "pubkey"
          },
          {
            "name": "lpMint",
            "type": "pubkey"
          },
          {
            "name": "token0Decimals",
            "type": "u8"
          },
          {
            "name": "token1Decimals",
            "type": "u8"
          },
          {
            "name": "rateModel",
            "type": "pubkey"
          },
          {
            "name": "swapFeeBps",
            "type": "u16"
          },
          {
            "name": "halfLife",
            "type": "u64"
          },
          {
            "name": "fixedCfBps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "paramsHash",
            "type": {
              "array": [
                "u8",
                32
              ]
            }
          },
          {
            "name": "version",
            "type": "u8"
          },
          {
            "name": "metadata",
            "type": {
              "defined": {
                "name": "eventMetadata"
              }
            }
          }
        ]
      }
    },
    {
      "name": "pairViewKind",
      "docs": [
        "Enum for the different getters that can be emitted",
        "This is used to eliminate off-chain calculations / simulation"
      ],
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "emaPrice0Nad"
          },
          {
            "name": "emaPrice1Nad"
          },
          {
            "name": "spotPrice0Nad"
          },
          {
            "name": "spotPrice1Nad"
          },
          {
            "name": "k"
          },
          {
            "name": "getRates"
          },
          {
            "name": "getBorrowLimitAndCfBpsForCollateral"
          }
        ]
      }
    },
    {
      "name": "rateModel",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "expRate",
            "docs": [
              "exp_rate: NAD/millisecond (k_real = exp_rate / NAD)"
            ],
            "type": "u64"
          },
          {
            "name": "targetUtilStart",
            "docs": [
              "utilization band edges (NAD-scaled: 0..NAD)"
            ],
            "type": "u64"
          },
          {
            "name": "targetUtilEnd",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "removeLiquidityArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "liquidityIn",
            "type": "u64"
          },
          {
            "name": "minAmount0Out",
            "type": "u64"
          },
          {
            "name": "minAmount1Out",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "revenueDistribution",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "futarchyTreasuryBps",
            "type": "u16"
          },
          {
            "name": "buybacksVaultBps",
            "type": "u16"
          },
          {
            "name": "teamTreasuryBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "revenueRecipients",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "futarchyTreasury",
            "type": "pubkey"
          },
          {
            "name": "buybacksVault",
            "type": "pubkey"
          },
          {
            "name": "teamTreasury",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "revenueShare",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "swapBps",
            "type": "u16"
          },
          {
            "name": "interestBps",
            "type": "u16"
          }
        ]
      }
    },
    {
      "name": "swapArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "amountIn",
            "type": "u64"
          },
          {
            "name": "minAmountOut",
            "type": "u64"
          }
        ]
      }
    },
    {
      "name": "swapEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "reserve0",
            "type": "u64"
          },
          {
            "name": "reserve1",
            "type": "u64"
          },
          {
            "name": "isToken0In",
            "type": "bool"
          },
          {
            "name": "amountIn",
            "type": "u64"
          },
          {
            "name": "amountOut",
            "type": "u64"
          },
          {
            "name": "amountInAfterFee",
            "type": "u64"
          },
          {
            "name": "metadata",
            "type": {
              "defined": {
                "name": "eventMetadata"
              }
            }
          }
        ]
      }
    },
    {
      "name": "updateFutarchyAuthorityArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "newAuthority",
            "type": "pubkey"
          }
        ]
      }
    },
    {
      "name": "updatePairEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "price0Ema",
            "type": "u64"
          },
          {
            "name": "price1Ema",
            "type": "u64"
          },
          {
            "name": "rate0",
            "type": "u64"
          },
          {
            "name": "rate1",
            "type": "u64"
          },
          {
            "name": "accruedInterest0",
            "type": "u128"
          },
          {
            "name": "accruedInterest1",
            "type": "u128"
          },
          {
            "name": "cashReserve0",
            "type": "u64"
          },
          {
            "name": "cashReserve1",
            "type": "u64"
          },
          {
            "name": "reserve0AfterInterest",
            "type": "u64"
          },
          {
            "name": "reserve1AfterInterest",
            "type": "u64"
          },
          {
            "name": "metadata",
            "type": {
              "defined": {
                "name": "eventMetadata"
              }
            }
          }
        ]
      }
    },
    {
      "name": "updateProtocolRevenueArgs",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "swapBps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "interestBps",
            "type": {
              "option": "u16"
            }
          },
          {
            "name": "revenueDistribution",
            "type": {
              "option": {
                "defined": {
                  "name": "revenueDistribution"
                }
              }
            }
          }
        ]
      }
    },
    {
      "name": "userLiquidityPositionUpdatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "token0Amount",
            "type": "u64"
          },
          {
            "name": "token1Amount",
            "type": "u64"
          },
          {
            "name": "lpAmount",
            "type": "u64"
          },
          {
            "name": "token0Mint",
            "type": "pubkey"
          },
          {
            "name": "token1Mint",
            "type": "pubkey"
          },
          {
            "name": "lpMint",
            "type": "pubkey"
          },
          {
            "name": "metadata",
            "type": {
              "defined": {
                "name": "eventMetadata"
              }
            }
          }
        ]
      }
    },
    {
      "name": "userPosition",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "owner",
            "type": "pubkey"
          },
          {
            "name": "pair",
            "type": "pubkey"
          },
          {
            "name": "collateral0AppliedMinCfBps",
            "type": "u16"
          },
          {
            "name": "collateral1AppliedMinCfBps",
            "type": "u16"
          },
          {
            "name": "collateral0",
            "type": "u64"
          },
          {
            "name": "collateral1",
            "type": "u64"
          },
          {
            "name": "debt0Shares",
            "type": "u128"
          },
          {
            "name": "debt1Shares",
            "type": "u128"
          },
          {
            "name": "bump",
            "type": "u8"
          }
        ]
      }
    },
    {
      "name": "userPositionCreatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "metadata",
            "type": {
              "defined": {
                "name": "eventMetadata"
              }
            }
          }
        ]
      }
    },
    {
      "name": "userPositionLiquidatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "liquidator",
            "type": "pubkey"
          },
          {
            "name": "collateral0Liquidated",
            "type": "u64"
          },
          {
            "name": "collateral1Liquidated",
            "type": "u64"
          },
          {
            "name": "debt0Liquidated",
            "type": "u64"
          },
          {
            "name": "debt1Liquidated",
            "type": "u64"
          },
          {
            "name": "collateralPrice",
            "type": "u64"
          },
          {
            "name": "shortfall",
            "type": "u128"
          },
          {
            "name": "liquidationBonusApplied",
            "type": "u64"
          },
          {
            "name": "k0",
            "type": "u128"
          },
          {
            "name": "k1",
            "type": "u128"
          },
          {
            "name": "metadata",
            "type": {
              "defined": {
                "name": "eventMetadata"
              }
            }
          }
        ]
      }
    },
    {
      "name": "userPositionUpdatedEvent",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "position",
            "type": "pubkey"
          },
          {
            "name": "collateral0",
            "type": "u64"
          },
          {
            "name": "collateral1",
            "type": "u64"
          },
          {
            "name": "debt0Shares",
            "type": "u128"
          },
          {
            "name": "debt1Shares",
            "type": "u128"
          },
          {
            "name": "collateral0AppliedMinCfBps",
            "type": "u16"
          },
          {
            "name": "collateral1AppliedMinCfBps",
            "type": "u16"
          },
          {
            "name": "metadata",
            "type": {
              "defined": {
                "name": "eventMetadata"
              }
            }
          }
        ]
      }
    },
    {
      "name": "userPositionViewKind",
      "type": {
        "kind": "enum",
        "variants": [
          {
            "name": "userBorrowingPower"
          },
          {
            "name": "userAppliedCollateralFactorBps"
          },
          {
            "name": "userLiquidationCollateralFactorBps"
          },
          {
            "name": "userDebtUtilizationBps"
          },
          {
            "name": "userLiquidationPrice"
          },
          {
            "name": "userDebtWithInterest"
          },
          {
            "name": "userIsLiquidatable"
          }
        ]
      }
    },
    {
      "name": "vaultBumps",
      "type": {
        "kind": "struct",
        "fields": [
          {
            "name": "reserve0",
            "type": "u8"
          },
          {
            "name": "reserve1",
            "type": "u8"
          },
          {
            "name": "collateral0",
            "type": "u8"
          },
          {
            "name": "collateral1",
            "type": "u8"
          }
        ]
      }
    }
  ],
  "constants": [
    {
      "name": "bpsDenominator",
      "type": "u16",
      "value": "10000"
    },
    {
      "name": "closeFactorBps",
      "type": "u16",
      "value": "5000"
    },
    {
      "name": "collateralVaultSeedPrefix",
      "type": "bytes",
      "value": "[99, 111, 108, 108, 97, 116, 101, 114, 97, 108, 95, 118, 97, 117, 108, 116]"
    },
    {
      "name": "directionalEmaHalfLifeMs",
      "type": "u64",
      "value": "3000"
    },
    {
      "name": "flashloanFeeBps",
      "type": "u16",
      "value": "5"
    },
    {
      "name": "futarchyAuthoritySeedPrefix",
      "type": "bytes",
      "value": "[102, 117, 116, 97, 114, 99, 104, 121, 95, 97, 117, 116, 104, 111, 114, 105, 116, 121]"
    },
    {
      "name": "liquidationIncentiveBps",
      "type": "u16",
      "value": "50"
    },
    {
      "name": "liquidationPenaltyBps",
      "type": "u16",
      "value": "300"
    },
    {
      "name": "liquidityWithdrawalFeeBps",
      "type": "u16",
      "value": "100"
    },
    {
      "name": "ltvBufferBps",
      "type": "u16",
      "value": "500"
    },
    {
      "name": "maxCollateralFactorBps",
      "type": "u16",
      "value": "8500"
    },
    {
      "name": "metadataSeedPrefix",
      "type": "bytes",
      "value": "[109, 101, 116, 97, 100, 97, 116, 97]"
    },
    {
      "name": "nad",
      "docs": [
        "NAD: Nine-decimal fixed point unit (1e9 scaling), similar to WAD (1e18) by Maker."
      ],
      "type": "u64",
      "value": "1000000000"
    },
    {
      "name": "nadDecimals",
      "type": "u8",
      "value": "9"
    },
    {
      "name": "pairCreationFeeLamports",
      "type": "u64",
      "value": "200000000"
    },
    {
      "name": "pairSeedPrefix",
      "type": "bytes",
      "value": "[103, 97, 109, 109, 95, 112, 97, 105, 114]"
    },
    {
      "name": "positionSeedPrefix",
      "type": "bytes",
      "value": "[103, 97, 109, 109, 95, 112, 111, 115, 105, 116, 105, 111, 110]"
    },
    {
      "name": "reserveVaultSeedPrefix",
      "type": "bytes",
      "value": "[114, 101, 115, 101, 114, 118, 101, 95, 118, 97, 117, 108, 116]"
    },
    {
      "name": "targetMsPerSlot",
      "docs": [
        "The nominal slot duration in milliseconds."
      ],
      "type": "u64",
      "value": "400"
    },
    {
      "name": "version",
      "type": "u8",
      "value": "1"
    }
  ]
};

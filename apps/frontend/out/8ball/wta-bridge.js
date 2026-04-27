/**
 * WTA Game Bridge — injected into 8-ball game iframe.
 * Intercepts game events and relays them to the parent window via postMessage.
 * Parent window connects these to the WebSocket game room.
 */
(function () {
  "use strict";

  const WTA_BRIDGE = {
    initialized: false,
    matchId: null,
    userId: null,
    playerNumber: null, // 1 or 2
    score: 0,
    opponentScore: 0,
    lifelines: [],
    lifelinesUsed: [],
    activeEffects: [],
  };

  // ── Initialize bridge from parent ──
  window.addEventListener("message", function (event) {
    const data = event.data;
    if (!data || !data.wtaBridge) return;

    switch (data.type) {
      case "init":
        WTA_BRIDGE.matchId = data.matchId;
        WTA_BRIDGE.userId = data.userId;
        WTA_BRIDGE.playerNumber = data.playerNumber;
        WTA_BRIDGE.lifelines = data.lifelines || [];
        WTA_BRIDGE.initialized = true;
        console.log("[WTA Bridge] Initialized for match:", data.matchId);
        break;

      case "opponent_shot":
        _replayOpponentShot(data.shotData);
        break;

      case "score_update":
        WTA_BRIDGE.score = data.myScore;
        WTA_BRIDGE.opponentScore = data.opponentScore;
        _updateScoreDisplay();
        break;

      case "lifeline_effect":
        _applyLifelineEffect(data.effect);
        break;

      case "turn_change":
        _handleTurnChange(data.currentTurn, data.isMyTurn);
        break;

      case "game_over":
        _handleGameOver(data);
        break;
    }
  });

  // ── Intercept game events ──
  // Override the Phaser game's shot execution to capture shot data
  let _originalShot = null;

  function _hookIntoGame() {
    if (typeof playState === "undefined" || !playState.gameInfo) {
      setTimeout(_hookIntoGame, 500);
      return;
    }

    const gi = playState.gameInfo;

    // Monitor ball pots
    const _checkInterval = setInterval(function () {
      if (!WTA_BRIDGE.initialized) return;

      // Check for potted balls
      if (gi.ballsPotted > 0 && gi.shotComplete) {
        for (let i = 1; i < gi.ballArray.length; i++) {
          const ball = gi.ballArray[i];
          if (!ball.active && !ball._wtaReported) {
            ball._wtaReported = true;
            const points = ball.id === 8 ? 25 : 10;
            WTA_BRIDGE.score += points;
            _sendToParent({
              type: "ball_potted",
              ballId: ball.id,
              points: points,
              totalScore: WTA_BRIDGE.score,
            });
          }
        }
      }

      // Check for game over
      if (gi.gameOver && !gi._wtaGameOverReported) {
        gi._wtaGameOverReported = true;
        _sendToParent({
          type: "game_over",
          winner: gi.winner,
          score: WTA_BRIDGE.score,
          playerNumber: WTA_BRIDGE.playerNumber,
        });
      }
    }, 200);

    // Monitor shots for relay
    const _shotInterval = setInterval(function () {
      if (!WTA_BRIDGE.initialized) return;
      if (!gi.shotRunning || gi._wtaLastShotReported) return;

      const cueBall = gi.ballArray[0];
      if (cueBall.velocity && cueBall.velocity.magnitude > 0 && !gi._wtaLastShotReported) {
        gi._wtaLastShotReported = true;
        _sendToParent({
          type: "shot_made",
          shotData: {
            velocityX: cueBall.velocity.x,
            velocityY: cueBall.velocity.y,
            spin: cueBall.screw || 0,
            english: cueBall.english || 0,
            power: gi.power || 0,
            angle: gi.cueCanvas ? gi.cueCanvas.angle : 0,
          },
        });

        // Reset after shot completes
        setTimeout(function () {
          gi._wtaLastShotReported = false;
        }, 2000);
      }
    }, 50);

    // Monitor turn changes
    let lastTurn = gi.turn;
    setInterval(function () {
      if (gi.turn !== lastTurn) {
        lastTurn = gi.turn;
        _sendToParent({
          type: "turn_end",
          currentTurn: gi.turn,
        });
      }
    }, 100);

    console.log("[WTA Bridge] Hooked into game engine");
  }

  function _replayOpponentShot(shotData) {
    if (!shotData) return;
    // Forward shot data for opponent replay
    // The game handles AI shots similarly — we trigger the same mechanism
    if (typeof playState !== "undefined" && playState.gameInfo) {
      const gi = playState.gameInfo;
      if (gi.ballArray && gi.ballArray[0]) {
        gi.ballArray[0].velocity = {
          x: shotData.velocityX,
          y: shotData.velocityY,
          magnitude: Math.sqrt(
            shotData.velocityX * shotData.velocityX +
              shotData.velocityY * shotData.velocityY
          ),
        };
        gi.ballArray[0].screw = shotData.spin || 0;
        gi.ballArray[0].english = shotData.english || 0;
        gi.shotRunning = true;
      }
    }
  }

  function _applyLifelineEffect(effect) {
    if (!effect) return;
    WTA_BRIDGE.activeEffects.push(effect);

    // Apply visual effects
    switch (effect.visualEffect) {
      case "hide_guide_both":
        if (typeof projectInfo !== "undefined") {
          projectInfo.guideOn = 0;
          setTimeout(function () {
            projectInfo.guideOn = 1;
          }, 15000);
        }
        break;

      case "double_points_glow":
        // Visual indicator handled by parent overlay
        break;

      case "pressure_timer":
        // Timer overlay handled by parent
        break;

      case "backfire_flash":
        // Flash effect handled by parent overlay
        break;
    }
  }

  function _handleTurnChange(currentTurn, isMyTurn) {
    // Update game state based on turn
    _updateScoreDisplay();
  }

  function _handleGameOver(data) {
    // Game is over — parent handles score submission UI
  }

  function _updateScoreDisplay() {
    _sendToParent({
      type: "score_sync",
      myScore: WTA_BRIDGE.score,
      opponentScore: WTA_BRIDGE.opponentScore,
    });
  }

  function _sendToParent(message) {
    if (window.parent !== window) {
      window.parent.postMessage(
        { wtaBridge: true, ...message },
        "*"
      );
    }
  }

  // Start hooking when game loads
  if (document.readyState === "complete") {
    setTimeout(_hookIntoGame, 1000);
  } else {
    window.addEventListener("load", function () {
      setTimeout(_hookIntoGame, 1000);
    });
  }

  // Expose bridge for debugging
  window.WTA_BRIDGE = WTA_BRIDGE;
})();

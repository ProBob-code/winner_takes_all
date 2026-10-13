/**
 * Reports a finished 8-ball game to the page hosting it, so the player can be
 * awarded WTA Coins.
 *
 * WHY THIS IS SEPARATE FROM wta-bridge.js
 * That file was written for a different job — relaying shots between two
 * players in an online match — and was never loaded by the game. This does one
 * thing: notice the game is over, work out who won, and post it to the parent
 * frame. Nothing else.
 *
 * HOW IT KNOWS ANYTHING
 * The game is a minified Phaser build with no events to subscribe to, so this
 * polls the two globals it exposes:
 *
 *   projectInfo.mode      1 = player vs AI, 2 = two players on one device
 *   projectInfo.aiRating  the AI's difficulty, 1 upwards
 *   playState.gameInfo    the live game state, carrying .gameOver and .winner
 *
 * In AI mode the human is always "p1" and the AI is "p2", so a win is
 * `winner === "p1"`. In two-player mode both sides are human and sharing a
 * device, so the result is reported but worth the same either way — see the
 * API's awardsForOnlineGame for why.
 *
 * Polling rather than hooking: patching a minified build's functions breaks
 * silently the next time the vendor file is replaced, where a poll that finds
 * nothing simply reports nothing.
 */
(function () {
  "use strict";

  // Nothing to report to when the game is opened directly rather than hosted.
  if (window.parent === window) return;

  var startedAt = Date.now();
  var reported = false;
  var lastShotNum = 0;
  var shots = 0;

  function state() {
    try {
      return window.playState && window.playState.gameInfo ? window.playState.gameInfo : null;
    } catch (err) {
      return null;
    }
  }

  function mode() {
    try {
      return window.projectInfo && window.projectInfo.mode === 1 ? 1 : 2;
    } catch (err) {
      return 2;
    }
  }

  function aiRating() {
    try {
      return window.projectInfo && window.projectInfo.aiRating
        ? Number(window.projectInfo.aiRating)
        : 1;
    } catch (err) {
      return 1;
    }
  }

  function send(message) {
    try {
      window.parent.postMessage(
        Object.assign({ wtaCoins: true }, message),
        window.location.origin
      );
    } catch (err) {
      /* the host is gone; nothing to do about it */
    }
  }

  /**
   * Count shots, so the host can tell a played game from a script that
   * declared victory. shotNum is the game's own counter and only goes up.
   */
  function countShots(gi) {
    if (typeof gi.shotNum !== "number") return;
    if (gi.shotNum > lastShotNum) {
      shots += gi.shotNum - lastShotNum;
      lastShotNum = gi.shotNum;
    } else if (gi.shotNum < lastShotNum) {
      // A new rack restarted the counter; keep the running total.
      lastShotNum = gi.shotNum;
    }
  }

  var poll = setInterval(function () {
    var gi = state();
    if (!gi) return;

    countShots(gi);

    // A practice table has no opponent and no result worth paying for.
    if (gi.mode === "practice" || gi.trial === 1) return;

    if (!gi.gameOver || reported) return;

    reported = true;
    clearInterval(poll);

    var m = mode();
    send({
      type: "game_over",
      mode: m,
      aiRating: aiRating(),
      // In AI mode the human is p1. In two-player mode "won" is reported for
      // p1 as a convention; the award is the same either way.
      won: gi.winner === "p1",
      winner: gi.winner || null,
      seconds: Math.round((Date.now() - startedAt) / 1000),
      shots: shots
    });
  }, 400);

  // Let the host know the game is up, so it can show the coin strip.
  function announce() {
    send({ type: "ready", mode: mode() });
  }

  if (document.readyState === "complete") {
    setTimeout(announce, 800);
  } else {
    window.addEventListener("load", function () {
      setTimeout(announce, 800);
    });
  }
})();

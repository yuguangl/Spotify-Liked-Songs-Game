/* ============================================================
   Spotify Song Guesser — Main Application Logic
   ============================================================ */

// ── Configuration ────────────────────────────────────────────
var CLIENT_ID     = "ddf1c6e913bc4aa1ad89ae8853b20641";
var SCOPES        = "user-library-read user-top-read user-read-recently-played";
var TOTAL_ROUNDS  = 10;
var TIMER_SECONDS = 15;
var HINT_DELAY_MS = 7000;
var MAX_TRACKS    = 200; // max liked songs to fetch (change this to get more/fewer)

// ── Application state ─────────────────────────────────────────
var state = {
  accessToken:   "",
  tracks:        [],
  usedIndices:   {},
  currentTrack:  null,
  timerInterval: null,
  timeLeft:      TIMER_SECONDS,
  score:         0,
  streak:        0,
  bestStreak:    0,
  round:         0,
  correctCount:  0,
  roundActive:   false,
  audio:         null
};

// ── DOM helpers ───────────────────────────────────────────────

function $(id) { return document.getElementById(id); }

function showScreen(id) {
  var screens = document.querySelectorAll(".screen");
  for (var i = 0; i < screens.length; i++) screens[i].classList.remove("active");
  $(id).classList.add("active");
}

function showError(id, message) {
  var el = $(id);
  el.textContent = message;
  el.style.display = "block";
}

function escapeHtml(str) {
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function setLoadingMessage(msg) {
  var el = $("loadingMsg");
  if (el) el.textContent = msg;
}

// ── PKCE auth helpers ─────────────────────────────────────────

function getRedirectUri() {
  return window.location.href.split("?")[0].split("#")[0];
}

function generateCodeVerifier() {
  var array = new Uint8Array(64);
  window.crypto.getRandomValues(array);
  return btoa(String.fromCharCode.apply(null, array))
    .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
}

function generateCodeChallenge(verifier) {
  var data = new TextEncoder().encode(verifier);
  return window.crypto.subtle.digest("SHA-256", data).then(function(hash) {
    return btoa(String.fromCharCode.apply(null, new Uint8Array(hash)))
      .replace(/\+/g, "-").replace(/\//g, "_").replace(/=/g, "");
  });
}

// ── Auth flow ─────────────────────────────────────────────────

function connectToSpotify() {
  var verifier = generateCodeVerifier();
  sessionStorage.setItem("pkce_verifier", verifier);

  generateCodeChallenge(verifier).then(function(challenge) {
    var url = "https://accounts.spotify.com/authorize"
      + "?client_id="             + encodeURIComponent(CLIENT_ID)
      + "&response_type=code"
      + "&redirect_uri="          + encodeURIComponent(getRedirectUri())
      + "&scope="                 + encodeURIComponent(SCOPES)
      + "&code_challenge_method=S256"
      + "&code_challenge="        + encodeURIComponent(challenge)
      + "&show_dialog=true";
    window.location.href = url;
  });
}

function handleAuthCallback() {
  var params = new URLSearchParams(window.location.search);
  var code   = params.get("code");
  var error  = params.get("error");

  if (error) { showError("setupError", "Spotify auth cancelled: " + error); return; }
  if (!code) return;

  window.history.replaceState({}, document.title, window.location.pathname);

  var verifier = sessionStorage.getItem("pkce_verifier");
  if (!verifier) { showError("setupError", "Auth error: verifier missing. Please try again."); return; }

  showScreen("screenLoading");
  setLoadingMessage("Authenticating...");

  fetch("https://accounts.spotify.com/api/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type:    "authorization_code",
      code:          code,
      redirect_uri:  getRedirectUri(),
      client_id:     CLIENT_ID,
      code_verifier: verifier
    })
  })
  .then(function(res) { return res.json(); })
  .then(function(data) {
    if (data.access_token) {
      state.accessToken = data.access_token;
      sessionStorage.removeItem("pkce_verifier");
      loadAllTracks();
    } else {
      showScreen("screenSetup");
      showError("setupError", "Auth failed: " + (data.error_description || data.error || "unknown"));
    }
  })
  .catch(function(err) {
    showScreen("screenSetup");
    showError("setupError", "Auth error: " + err.message);
  });
}

// ── Spotify API ───────────────────────────────────────────────

function spotifyGet(url) {
  return fetch(url, { headers: { Authorization: "Bearer " + state.accessToken } })
    .then(function(res) {
      if (!res.ok) throw new Error("Spotify API error " + res.status);
      return res.json();
    });
}

// Fetch liked songs, top tracks, and recently played — combine and dedupe
function loadAllTracks() {
  setLoadingMessage("Loading your library...");

  var seen   = {};
  var tracks = [];

  function addTrack(track) {
    if (track && track.uri && track.preview_url && !seen[track.uri]) {
      seen[track.uri] = true;
      tracks.push(track);
    }
  }

  // 1. Liked songs (paginated up to MAX_TRACKS)
  function fetchLiked(url, done) {
    spotifyGet(url)
      .then(function(data) {
        (data.items || []).forEach(function(item) { addTrack(item.track); });
        if (data.next && tracks.length < MAX_TRACKS) {
          fetchLiked(data.next, done);
        } else {
          done();
        }
      })
      .catch(function() { done(); }); // if it fails, move on
  }

  // 2. Top tracks (up to 100 — two pages of 50)
  function fetchTopTracks(done) {
    var urls = [
      "https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=long_term",
      "https://api.spotify.com/v1/me/top/tracks?limit=50&time_range=medium_term"
    ];
    var pending = urls.length;
    urls.forEach(function(url) {
      spotifyGet(url)
        .then(function(data) {
          (data.items || []).forEach(function(track) { addTrack(track); });
        })
        .catch(function() {})
        .then(function() { if (--pending === 0) done(); });
    });
  }

  // 3. Recently played (up to 50)
  function fetchRecentTracks(done) {
    spotifyGet("https://api.spotify.com/v1/me/player/recently-played?limit=50")
      .then(function(data) {
        (data.items || []).forEach(function(item) { addTrack(item.track); });
      })
      .catch(function() {})
      .then(done);
  }

  // Run all three in sequence, then start the game
  fetchLiked("https://api.spotify.com/v1/me/tracks?limit=50", function() {
    setLoadingMessage("Loading top tracks...");
    fetchTopTracks(function() {
      setLoadingMessage("Loading recent plays...");
      fetchRecentTracks(function() {
        setLoadingMessage("Starting game...");
        onTracksLoaded(tracks);
      });
    });
  });
}

function onTracksLoaded(tracks) {
  if (tracks.length < 3) {
    showScreen("screenSetup");
    showError("setupError",
      "Not enough songs with audio previews found (" + tracks.length + " found). " +
      "This is a Spotify regional limitation — previews are unavailable in some countries. " +
      "Try switching your Spotify region or VPN to the US."
    );
    return;
  }
  state.tracks = shuffle(tracks);
  startGame();
}

// ── Audio ─────────────────────────────────────────────────────

function playPreview(url) {
  stopAudio();
  if (!url) return;
  state.audio = new Audio(url);
  state.audio.volume = 0.7;
  state.audio.play().catch(function() {});
}

function stopAudio() {
  if (state.audio) { state.audio.pause(); state.audio = null; }
}

// ── Game lifecycle ────────────────────────────────────────────

function startGame() {
  state.score        = 0;
  state.streak       = 0;
  state.bestStreak   = 0;
  state.round        = 0;
  state.correctCount = 0;
  state.usedIndices  = {};

  updateScoreDisplay();
  showScreen("screenGame");
  nextRound();
}

function nextRound() {
  if (state.round >= TOTAL_ROUNDS) { endGame(); return; }

  state.round++;
  state.roundActive = true;

  var idx = pickUnusedTrackIndex();
  state.currentTrack = state.tracks[idx];

  resetRoundUI();
  playPreview(state.currentTrack.preview_url);
  startTimer();

  setTimeout(function() {
    if (state.roundActive) showHint();
  }, HINT_DELAY_MS);

  $("guessInput").focus();
}

function endGame() {
  stopAudio();
  $("statTotal").textContent   = TOTAL_ROUNDS;
  $("statCorrect").textContent = state.correctCount;
  $("statStreak").textContent  = state.bestStreak;
  showScreen("screenStats");
}

function restartGame() { state.usedIndices = {}; startGame(); }

function logout() {
  stopAudio();
  state.accessToken = "";
  showScreen("screenSetup");
}

// ── Round helpers ─────────────────────────────────────────────

function pickUnusedTrackIndex() {
  var idx, attempts = 0;
  do {
    idx = Math.floor(Math.random() * state.tracks.length);
    attempts++;
  } while (state.usedIndices[idx] && attempts < 300);
  state.usedIndices[idx] = true;
  return idx;
}

function resetRoundUI() {
  var track = state.currentTrack;

  $("roundNum").textContent      = state.round;
  $("guessInput").value          = "";
  $("guessInput").disabled       = false;
  $("guessInput").className      = "guess-input";
  $("resultBox").className       = "result-box";
  $("resultBox").innerHTML       = "";
  $("trackReveal").style.display = "none";
  $("nextBtn").style.display     = "none";
  $("skipBtn").style.display     = "";
  $("hintBox").style.display     = "none";
  $("guessArea").style.display   = "flex";
  $("visualizer").classList.remove("revealed");
  $("bars").style.display        = "flex";

  var artUrl = track.album && track.album.images && track.album.images[0]
    ? track.album.images[0].url : "";
  $("albumArt").src = artUrl;
}

// ── Timer ─────────────────────────────────────────────────────

function startTimer() {
  clearInterval(state.timerInterval);
  state.timeLeft = TIMER_SECONDS;
  updateTimerUI();

  state.timerInterval = setInterval(function() {
    state.timeLeft--;
    updateTimerUI();
    if (state.timeLeft <= 0) { clearInterval(state.timerInterval); timeExpired(); }
  }, 1000);
}

function updateTimerUI() {
  var fill = $("timerFill");
  fill.style.width = ((state.timeLeft / TIMER_SECONDS) * 100) + "%";
  $("timerText").textContent = state.timeLeft + "s";
  fill.className = "timer-fill";
  if      (state.timeLeft <= 5) fill.classList.add("danger");
  else if (state.timeLeft <= 8) fill.classList.add("warning");
}

// ── Hint ──────────────────────────────────────────────────────

function showHint() {
  var hint = state.currentTrack.name.split(" ").map(function(word) {
    return word.charAt(0).toUpperCase() + "_".repeat(Math.max(0, word.length - 1));
  }).join("  ");
  $("hintChars").textContent = hint;
  $("hintBox").style.display = "block";
}

// ── Guessing ──────────────────────────────────────────────────

function submitGuess() {
  if (!state.roundActive) return;
  var guess = $("guessInput").value.trim();
  if (!guess) return;
  if (isCorrectGuess(guess, state.currentTrack.name)) {
    onCorrectGuess();
  } else {
    onWrongGuess();
  }
}

function onCorrectGuess() {
  clearInterval(state.timerInterval);
  state.roundActive = false;
  state.score += Math.max(10, state.timeLeft * 10);
  state.streak++;
  state.correctCount++;
  if (state.streak > state.bestStreak) state.bestStreak = state.streak;
  updateScoreDisplay();
  showCorrectResult();
}

function onWrongGuess() {
  var input = $("guessInput");
  input.classList.add("wrong");
  setTimeout(function() { input.classList.remove("wrong"); }, 600);
  $("guessInput").value = "";
}

function timeExpired() {
  if (!state.roundActive) return;
  state.roundActive = false;
  state.streak = 0;
  updateScoreDisplay();
  showTimeoutResult();
}

function skipSong() {
  clearInterval(state.timerInterval);
  state.roundActive = false;
  state.streak = 0;
  updateScoreDisplay();
  showTimeoutResult();
}

// ── Guess validation ──────────────────────────────────────────

function isCorrectGuess(guess, title) {
  var g = normalizeTitle(guess);
  var t = normalizeTitle(title);
  if (g === t) return true;
  if (g.length >= 3 && t.indexOf(g) !== -1) return true;
  if (levenshtein(g, t) <= Math.floor(t.length * 0.2)) return true;
  return false;
}

function normalizeTitle(str) {
  return str.toLowerCase()
    .replace(/\(.*?\)/g, "").replace(/\[.*?\]/g, "")
    .replace(/feat\..*$/gi, "").replace(/ft\..*$/gi, "")
    .replace(/[^a-z0-9\s]/g, "").trim();
}

function levenshtein(a, b) {
  var dp = [];
  for (var i = 0; i <= a.length; i++) {
    dp[i] = [];
    for (var j = 0; j <= b.length; j++) dp[i][j] = i === 0 ? j : j === 0 ? i : 0;
  }
  for (var i = 1; i <= a.length; i++)
    for (var j = 1; j <= b.length; j++)
      dp[i][j] = a[i-1] === b[j-1] ? dp[i-1][j-1] : 1 + Math.min(dp[i-1][j], dp[i][j-1], dp[i-1][j-1]);
  return dp[a.length][b.length];
}

// ── Result displays ───────────────────────────────────────────

function showCorrectResult() {
  stopAudio();
  revealArt();

  var pts     = Math.max(10, state.timeLeft * 10);
  var artists = state.currentTrack.artists.map(function(a) { return a.name; }).join(", ");
  var box     = $("resultBox");

  box.className = "result-box show-correct";
  box.innerHTML =
    "<div class='result-label' style='color:var(--green)'>Correct</div>" +
    "<div class='result-title' style='color:var(--green)'>" + escapeHtml(state.currentTrack.name) + "</div>" +
    "<div class='result-artist'>" + escapeHtml(artists) + "</div>" +
    "<div class='result-points'>+" + pts + " pts</div>";

  $("guessInput").disabled   = true;
  $("guessInput").className  = "guess-input correct";
  $("skipBtn").style.display = "none";
  $("nextBtn").style.display = "block";
  launchConfetti();
}

function showTimeoutResult() {
  stopAudio();
  revealArt();

  $("guessInput").disabled       = true;
  $("guessArea").style.display   = "none";
  $("hintBox").style.display     = "none";
  $("skipBtn").style.display     = "none";
  $("revealName").textContent    = state.currentTrack.name;
  $("revealArtist").textContent  = state.currentTrack.artists.map(function(a) { return a.name; }).join(", ");
  $("trackReveal").style.display = "block";

  var box = $("resultBox");
  box.className = "result-box show-timeout";
  box.innerHTML =
    "<div class='result-label' style='color:var(--red)'>Time's up</div>" +
    "<div style='font-size:0.82rem;color:var(--muted)'>The answer was:</div>";

  $("nextBtn").style.display = "block";
}

function revealArt() {
  $("visualizer").classList.add("revealed");
  $("bars").style.display = "none";
}

function updateScoreDisplay() {
  $("scoreVal").textContent  = state.score;
  $("streakVal").textContent = state.streak;
}

// ── Confetti ──────────────────────────────────────────────────

function launchConfetti() {
  var wrap   = $("confettiWrap");
  var colors = ["#1db954", "#ffd700", "#ff6b6b", "#74b9ff", "#a29bfe", "#fd79a8"];
  wrap.innerHTML = "";
  for (var i = 0; i < 60; i++) {
    (function() {
      var el = document.createElement("div");
      el.className               = "confetti-piece";
      el.style.left              = Math.random() * 100 + "%";
      el.style.background        = colors[Math.floor(Math.random() * colors.length)];
      el.style.animationDuration = (0.8 + Math.random() * 1.2) + "s";
      el.style.animationDelay    = (Math.random() * 0.5) + "s";
      wrap.appendChild(el);
      el.addEventListener("animationend", function() { el.remove(); });
    })();
  }
}

// ── Utility ───────────────────────────────────────────────────

function shuffle(arr) {
  var a = arr.slice();
  for (var i = a.length - 1; i > 0; i--) {
    var j = Math.floor(Math.random() * (i + 1));
    var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
  }
  return a;
}

// ── Event listeners ───────────────────────────────────────────

$("connectBtn").addEventListener("click",   connectToSpotify);
$("guessBtn").addEventListener("click",     submitGuess);
$("skipBtn").addEventListener("click",      skipSong);
$("nextBtn").addEventListener("click",      nextRound);
$("playAgainBtn").addEventListener("click", restartGame);
$("logoutBtn").addEventListener("click",    logout);

$("guessInput").addEventListener("keydown", function(e) {
  if (e.key === "Enter") submitGuess();
});

// ── Boot ──────────────────────────────────────────────────────
handleAuthCallback();

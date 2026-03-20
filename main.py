import json
import spotipy
from spotipy.oauth2 import SpotifyOAuth

CLIENT_ID     = "your_client_id_here"       
CLIENT_SECRET = "your_client_secret_here"   
REDIRECT_URI  = "http://127.0.0.1:8888/callback"

SCOPES = "user-read-private user-read-email"
# ──────────────────────────────────────────────────────────────────────────────


def get_current_user_profile():
    """Authenticate and return the current user's profile data."""
    auth_manager = SpotifyOAuth(
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        redirect_uri=REDIRECT_URI,
        scope=SCOPES,
        open_browser=True,   
    )
    sp = spotipy.Spotify(auth_manager=auth_manager)

    user = sp.current_user()
    return user


def display_profile(user: dict):
    """Print a nicely formatted summary of the user profile."""
    print("=" * 45)
    print("       SPOTIFY USER PROFILE")
    print("=" * 45)
    print(f"  Display Name  : {user.get('display_name', 'N/A')}")
    print(f"  User ID       : {user.get('id', 'N/A')}")

    images = user.get("images", [])
    if images:
        print(f"  Profile Image : {images[0].get('url', 'N/A')}")
    else:
        print("  Profile Image : (none)")

    print("=" * 45)
    print("\nFull raw response (JSON):")
    print(json.dumps(user, indent=2))


profile = get_current_user_profile()
display_profile(profile)

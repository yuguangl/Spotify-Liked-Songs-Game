import json
import spotipy
from spotipy.oauth2 import SpotifyOAuth

CLIENT_ID     = ""
CLIENT_SECRET = ""
REDIRECT_URI  = "http://127.0.0.1:8888/callback"

SCOPES = "user-read-private user-read-email user-library-read"

def get_spotify_client():
    """Authenticate and return a Spotify client."""
    auth_manager = SpotifyOAuth(
        client_id=CLIENT_ID,
        client_secret=CLIENT_SECRET,
        redirect_uri=REDIRECT_URI,
        scope=SCOPES,
        open_browser=True,
    )
    return spotipy.Spotify(auth_manager=auth_manager)


def get_all_liked_songs(sp):
    """Fetch all liked/saved tracks for the current user."""
    liked_songs = []
    limit = 50
    offset = 0

    print("Fetching liked songs", end="", flush=True)

    while True:
        results = sp.current_user_saved_tracks(limit=limit, offset=offset)
        items = results.get("items", [])
        if not items:
            break
        liked_songs.extend(items)
        offset += len(items)
        print(".", end="", flush=True)

        if len(items) < limit:
            break

    print(f" done! ({len(liked_songs)} songs)\n")
    return liked_songs


def display_liked_songs(liked_songs):
    """Print a formatted list of all liked songs."""
    print("=" * 60)
    print(f"   LIKED SONGS ({len(liked_songs)} total)")
    print("=" * 60)

    for i, item in enumerate(liked_songs, start=1):
        track = item["track"]
        name    = track.get("name", "Unknown")
        artists = ", ".join(a["name"] for a in track.get("artists", []))
        album   = track.get("album", {}).get("name", "Unknown")
        added   = item.get("added_at", "")[:10]

        #print(f"{i:>4}. {name}")
        #print(f"       Artist : {artists}")
        #print(f"       Album  : {album}")
        #print(f"       Added  : {added}")
        #print()
def save_liked_songs_to_json(liked_songs, filename="liked_songs.json"):
    """Save the raw liked songs data to a JSON file."""
    with open(filename, "w", encoding="utf-8") as f:
        json.dump(liked_songs, f, indent=2, ensure_ascii=False)
    print(f"Raw data saved to '{filename}'")


sp = get_spotify_client()
user = sp.current_user()
print(f"\nAuthenticated as: {user.get('display_name', user.get('id'))}\n")

liked_songs = get_all_liked_songs(sp)
display_liked_songs(liked_songs)
save_liked_songs_to_json(liked_songs)

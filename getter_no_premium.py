import requests

ACCESS_TOKEN = "your_access_token_here"

headers = {"Authorization": f"Bearer {ACCESS_TOKEN}"}

for time_range in ["short_term", "medium_term", "long_term"]:
    res = requests.get(
        f"https://api.spotify.com/v1/me/top/tracks?limit=10&time_range={time_range}",
        headers=headers
    )
    data = res.json()
    print(f"\n--- {time_range} ---")
    for i, track in enumerate(data["items"], 1):
        artists = ", ".join(a["name"] for a in track["artists"])
        print(f"{i}. {track['name']} — {artists}")

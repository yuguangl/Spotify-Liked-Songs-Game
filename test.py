import requests

access_token = "YOUR_ACCESS_TOKEN"

url = "https://api.spotify.com/v1/me"
headers = {
    "Authorization": f"Bearer {access_token}"
}

response = requests.get(url, headers=headers)

if response.status_code == 200:
    user_data = response.json()
    print("Display Name:", user_data["display_name"])
    print("User ID:", user_data["id"])
    print("Followers:", user_data["followers"]["total"])
else:
    print("Error:", response.status_code, response.text)

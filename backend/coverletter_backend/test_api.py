import requests
import json

url = "http://localhost:8001/api/download/docx?job_name=test"
headers = {"Content-Type": "application/json"}
data = {"motivation": "안녕하세요 테스트입니다."}

try:
    response = requests.post(url, headers=headers, json=data)
    print(f"Status Code: {response.status_code}")
    if response.status_code != 200:
        print(f"Response: {response.text}")
    else:
        print("Success!")
except Exception as e:
    print(f"Error: {e}")

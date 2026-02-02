import socket
import time
import threading
import random
import json

PORT = 8080
HOST = '127.0.0.1'

def json_to_string(data):
  s = ""
  for key, value in data.items():
    s += f"${key}:${value};"
  return s

def send():
  s = socket.socket(socket.AF_INET, socket.SOCK_STREAM) # TCP
  try:
    s.connect((HOST, PORT))
    print(f"Connect to ${HOST}")

    while True:
      busnum = random.randint(1,10)
      x = random.randint(0,100)
      y = random.randint(0,100)
      data = {
        "vehicle": f"b${busnum}",
        "position": f"${x}, ${y}",
        "timestamp": time.time()
      }
      s.sendall(json_to_string(data).encode("utf-8"))
      time.sleep(1)
      
  except():
    print(f"Error sending to ${HOST}")

  finally:
    s.close()

if __name__ == "__main__":
  send()
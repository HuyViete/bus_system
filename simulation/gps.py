import socket
import time
import threading
import random

PORT = 8080
HOST = '127.0.0.1'

def send():
  s = socket.socket(socket.AF_INET, socket.SOCK_STREAM) # TCP
  try:
    s.connect((HOST, PORT))
    print(f"Connect to ${HOST}")

    while True:
      busnum = random.randint(1,10)
      x = random.randint(0,100)
      data = f"b${busnum}x${x}"
      s.sendall(data.encode("utf-8"))
      time.sleep(1)
      
  except():
    print(f"Error sending to ${HOST}")

  finally:
    s.close()

if __name__ == "__main__":
  send()
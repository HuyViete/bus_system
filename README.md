***STATISTICS***
**I. Vehicles**
- 2,100 buses running concurently
- JSON data size: less than 500 Bytes / message
- A message every 3 seconds to keep the system responsive
-> Peak Load: 2100 / 3 = **700 message / second** (2.520.000 message / day)
-> Peak Load: 700 * 500 Bytes = **350 KB / second** (1.260 MB / day)

**II. Users**
- 250,000 users daily (14 hours / day)
- 80% users use the app during peak hours (assume 4 hours)
-> Peak Load: 250,000 * 0.8 / 4 = 50,000 users / hour = ~ **14 users / second**
-> 14 * 10 = **140 message / second**

-> Total: 700 + 140 = **840 message / second**
-> So the system must be able to handle at least **1000 requests / second**

***ARCHITECTURE***
- Bus (edge): C++
- Server: NodeJS (Express / Fastify + Kafka + MongoDB)
- Website: Nodejs (Express + ReactJs + TailwindCss)
- Simulation: Python

***GPS DATA***
- 150 routes
- ~ 10000 points / route
- Thanks to OpenStreetMap API, we can fetch GPS data of **86 routes** to CSV file (~3MB)

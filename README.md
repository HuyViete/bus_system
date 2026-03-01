STATISTICS
**I. Vehicles**
- 2,100 buses running concurently
- JSON data size: less than 500 Bytes / message
- A message every 3 seconds to keep the system responsive
-> Peak Load: 2100 / 3 = **700 message / second** (2.520.000 message / day)
-> Peak Load: 700 * 500 Bytes = **350 KB / second** (1.260 MB / day)

**II. Users**
- 250,000 users daily

ARCHITECTURE
- Bus (edge): C++
- Server: NodeJS (Express / Fastify + Kafka + MongoDB)
- Website: Nodejs (Express + ReactJs + TailwindCss)
- Simulation: Python
1. **Bus (edge)**
- The Bus edge component runs on each bus, collecting sensor data (GPS, temperature, passenger count, etc.) and storing it locally in SQLite before syncing to the central server.
- Using C++ for efficiency and compact.

2. **Server**
- Receive useful information from buses, process, and store to big database (MongoDB and more).
- Using Java for efficiency and compact since Kafka and Spark run on Java natively.

3. **Website (app?)**
- Display and look information from servers.
- The backend will use Nodejs
- The frontend will use ReactJs + TailwindCss

4. **Simulation (only for experiment and simulation)**
- Having python file simulate the sensors and gps.
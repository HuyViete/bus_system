cd Bus && g++ -o bus bus.cpp receiver.cpp sender.cpp database.cpp -L. -lsqlite3 -lws2_32
./bus
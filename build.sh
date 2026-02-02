cd Bus && g++ -o bus main.cpp receiver.cpp database.cpp -L. -lsqlite3 -lws2_32
./bus
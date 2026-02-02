#include <iostream>
#include "receiver.h"
#include "sender.h"

int main() {
    Receiver receiver;
    receiver.startServer(8080);

    Sender sender;
    sender.start();

    return 0;
}
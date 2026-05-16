#ifndef BUS_STATS_H
#define BUS_STATS_H

#include <atomic>

struct BusErrorCounters {
    std::atomic<int> senderConnectFailures{0};
    std::atomic<int> receiverConnectFailures{0};
    std::atomic<int> senderSendFailures{0};
    std::atomic<int> receiverRecvFailures{0};
};

struct BusErrorSnapshot {
    int senderConnectFailures;
    int receiverConnectFailures;
    int senderSendFailures;
    int receiverRecvFailures;

    bool hasAny() const {
        return senderConnectFailures > 0
            || receiverConnectFailures > 0
            || senderSendFailures > 0
            || receiverRecvFailures > 0;
    }
};

inline BusErrorCounters gBusErrorCounters{};

inline BusErrorSnapshot snapshotBusErrors() {
    return {
        gBusErrorCounters.senderConnectFailures.load(std::memory_order_relaxed),
        gBusErrorCounters.receiverConnectFailures.load(std::memory_order_relaxed),
        gBusErrorCounters.senderSendFailures.load(std::memory_order_relaxed),
        gBusErrorCounters.receiverRecvFailures.load(std::memory_order_relaxed),
    };
}

inline BusErrorSnapshot diffBusErrors(const BusErrorSnapshot& before,
                                      const BusErrorSnapshot& after) {
    return {
        after.senderConnectFailures - before.senderConnectFailures,
        after.receiverConnectFailures - before.receiverConnectFailures,
        after.senderSendFailures - before.senderSendFailures,
        after.receiverRecvFailures - before.receiverRecvFailures,
    };
}

#endif // BUS_STATS_H

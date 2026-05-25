#ifndef SPEED_SIM_H
#define SPEED_SIM_H

#include <cstdlib>
#include <cmath>
#include <string>
#include <vector>

enum class DrivingState {
    CRUISING,
    ACCELERATING,
    DECELERATING,
    STOPPED_AT_STATION,
    HARD_BRAKING,
    SPEEDING,
};

struct StopZone {
    int    stopIndex;
    double lat;
    double lon;
    double radiusM;
};

struct SpeedSimConfig {
    double cruiseMinKmh     = 15.0;
    double cruiseMaxKmh     = 45.0;
    double accelRateKmhS    = 3.0;
    double decelRateKmhS    = 4.0;
    double hardBrakeDropMin = 25.0;
    double hardBrakeDropMax = 40.0;
    double speedingMinKmh   = 82.0;
    double speedingMaxKmh   = 100.0;
    double dwellMinSec      = 5.0;
    double dwellMaxSec      = 15.0;
    double hardBrakeChance  = 0.003;
    double speedingChance   = 0.005;
    double approachRadiusM  = 50.0;
    double stopRadiusM      = 20.0;
    double bypassChance     = 0.75;
};

class SpeedSimulator {
public:
    SpeedSimulator() : state_(DrivingState::CRUISING), speed_(25.0),
                       targetSpeed_(30.0), dwellRemaining_(0),
                       ticksSinceEvent_(0), heading_(0.0),
                       lastAttemptedStop_(-1) {}

    void setStops(const std::vector<StopZone>& stops) { stops_ = stops; }
    void setConfig(const SpeedSimConfig& cfg) { cfg_ = cfg; }

    struct TickResult {
        double      speed;
        double      heading;
        DrivingState state;
        std::vector<std::string> anomalies;
        std::string stopEvent;
        int         stopEventId   = -1;
        double      dwellSeconds  = 0;
    };

    TickResult tick(double lat, double lon, double nextLat, double nextLon, double dt) {
        TickResult result;
        result.anomalies = {};
        result.stopEvent = "";
        result.stopEventId = -1;
        result.dwellSeconds = 0;

        heading_ = computeBearing(lat, lon, nextLat, nextLon);
        ++ticksSinceEvent_;

        int nearStop = findNearestStop(lat, lon);
        double nearDist = (nearStop >= 0)
            ? haversineM(lat, lon, stops_[nearStop].lat, stops_[nearStop].lon)
            : 9999.0;

        // Roll bypass chance on entering a new stop's vicinity to prevent getting stuck
        if (nearStop >= 0 && nearStop != lastAttemptedStop_) {
            lastAttemptedStop_ = nearStop;
            if (randChance(cfg_.bypassChance)) {
                lastDepartedStop_ = nearStop; // Treat as departed to bypass this stop
            }
        }

        switch (state_) {
        case DrivingState::STOPPED_AT_STATION:
            dwellRemaining_ -= dt;
            if (dwellRemaining_ <= 0) {
                result.stopEvent = "departure";
                result.stopEventId = (nearStop >= 0) ? stops_[nearStop].stopIndex : lastStopId_;
                result.dwellSeconds = dwellTotal_;
                state_ = DrivingState::ACCELERATING;
                targetSpeed_ = randRange(cfg_.cruiseMinKmh, cfg_.cruiseMaxKmh);
                lastStopId_ = -1;
            }
            speed_ = 0.0;
            break;

        case DrivingState::HARD_BRAKING:
            speed_ = std::max(0.0, speed_ - randRange(cfg_.hardBrakeDropMin, cfg_.hardBrakeDropMax));
            if (speed_ <= 2.0) {
                speed_ = 0.0;
                state_ = DrivingState::ACCELERATING;
                targetSpeed_ = randRange(cfg_.cruiseMinKmh, cfg_.cruiseMaxKmh);
            }
            result.anomalies.push_back("hard_brake");
            break;

        case DrivingState::SPEEDING:
            if (ticksSinceEvent_ > 3 + (std::rand() % 5)) {
                state_ = DrivingState::DECELERATING;
                targetSpeed_ = randRange(cfg_.cruiseMinKmh, cfg_.cruiseMaxKmh);
            }
            speed_ += randRange(-1.0, 2.0);
            speed_ = std::max(cfg_.speedingMinKmh, std::min(cfg_.speedingMaxKmh, speed_));
            result.anomalies.push_back("speeding");
            break;

        case DrivingState::ACCELERATING:
            speed_ += cfg_.accelRateKmhS * dt;
            if (speed_ >= targetSpeed_) {
                speed_ = targetSpeed_;
                state_ = DrivingState::CRUISING;
            }
            break;

        case DrivingState::DECELERATING:
            speed_ -= cfg_.decelRateKmhS * dt;
            if (speed_ <= targetSpeed_) {
                speed_ = std::max(0.0, targetSpeed_);
                state_ = DrivingState::CRUISING;
            }
            break;

        case DrivingState::CRUISING:
        default:
            speed_ += randRange(-1.5, 1.5);
            speed_ = std::max(cfg_.cruiseMinKmh, std::min(cfg_.cruiseMaxKmh, speed_));
            break;
        }

        if (state_ != DrivingState::STOPPED_AT_STATION &&
            state_ != DrivingState::HARD_BRAKING &&
            state_ != DrivingState::SPEEDING) {

            if (nearStop >= 0 && nearDist < cfg_.stopRadiusM && nearStop != lastDepartedStop_) {
                double dwell = randRange(cfg_.dwellMinSec, cfg_.dwellMaxSec);
                dwellRemaining_ = dwell;
                dwellTotal_ = dwell;
                lastStopId_ = stops_[nearStop].stopIndex;
                lastDepartedStop_ = nearStop;
                state_ = DrivingState::STOPPED_AT_STATION;
                speed_ = 0.0;
                result.stopEvent = "arrival";
                result.stopEventId = stops_[nearStop].stopIndex;
            }
            else if (nearStop >= 0 && nearDist < cfg_.approachRadiusM &&
                     nearStop != lastDepartedStop_ &&
                     state_ != DrivingState::DECELERATING) {
                state_ = DrivingState::DECELERATING;
                targetSpeed_ = 5.0;
            }
            else if (randChance(cfg_.hardBrakeChance) && speed_ > 20.0) {
                state_ = DrivingState::HARD_BRAKING;
                ticksSinceEvent_ = 0;
            }
            else if (randChance(cfg_.speedingChance) && state_ == DrivingState::CRUISING) {
                state_ = DrivingState::SPEEDING;
                speed_ = randRange(cfg_.speedingMinKmh, cfg_.speedingMaxKmh);
                ticksSinceEvent_ = 0;
            }
        }

        speed_ = std::max(0.0, speed_);
        result.speed = speed_;
        result.heading = heading_;
        result.state = state_;
        return result;
    }

    void resetDepartedStop() { 
        lastDepartedStop_ = -1; 
        lastAttemptedStop_ = -1;
    }

private:
    DrivingState state_;
    double speed_;
    double targetSpeed_;
    double dwellRemaining_;
    double dwellTotal_    = 0;
    int    ticksSinceEvent_;
    double heading_;
    int    lastStopId_     = -1;
    int    lastDepartedStop_ = -1;
    int    lastAttemptedStop_ = -1;

    std::vector<StopZone> stops_;
    SpeedSimConfig cfg_;

    static double randRange(double lo, double hi) {
        return lo + (double)(std::rand()) / RAND_MAX * (hi - lo);
    }

    static bool randChance(double p) {
        return ((double)std::rand() / RAND_MAX) < p;
    }

    static double haversineM(double lat1, double lon1, double lat2, double lon2) {
        constexpr double R = 6'371'000.0;
        constexpr double TO_RAD = 3.14159265358979323846 / 180.0;
        double dLat = (lat2 - lat1) * TO_RAD;
        double dLon = (lon2 - lon1) * TO_RAD;
        double a = std::sin(dLat / 2.0) * std::sin(dLat / 2.0)
                 + std::cos(lat1 * TO_RAD) * std::cos(lat2 * TO_RAD)
                 * std::sin(dLon / 2.0) * std::sin(dLon / 2.0);
        return R * 2.0 * std::asin(std::sqrt(a));
    }

    static double computeBearing(double lat1, double lon1, double lat2, double lon2) {
        constexpr double TO_RAD = 3.14159265358979323846 / 180.0;
        constexpr double TO_DEG = 180.0 / 3.14159265358979323846;
        double dLon = (lon2 - lon1) * TO_RAD;
        double y = std::sin(dLon) * std::cos(lat2 * TO_RAD);
        double x = std::cos(lat1 * TO_RAD) * std::sin(lat2 * TO_RAD)
                 - std::sin(lat1 * TO_RAD) * std::cos(lat2 * TO_RAD) * std::cos(dLon);
        double brng = std::atan2(y, x) * TO_DEG;
        return std::fmod(brng + 360.0, 360.0);
    }

    int findNearestStop(double lat, double lon) {
        if (stops_.empty()) return -1;
        int best = -1;
        double bestDist = 1e18;
        for (int i = 0; i < (int)stops_.size(); ++i) {
            double d = haversineM(lat, lon, stops_[i].lat, stops_[i].lon);
            if (d < bestDist) { bestDist = d; best = i; }
        }
        return (bestDist < cfg_.approachRadiusM * 2) ? best : -1;
    }
};

#endif // SPEED_SIM_H

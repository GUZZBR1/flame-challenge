#include "combustion_solver.hpp"

#include <algorithm>
#include <cmath>

namespace ff {

namespace {
// adiabatic flame temperature envelope for hydrocarbon diffusion flames
constexpr double T_FLAME_MAX = 2300.0; // K
constexpr double T_COOL_FLAME = 800.0; // K — cool flames sit ~500–800 K
} // namespace

double DropletFlame::nextRandom() {
    rng_ ^= rng_ << 13;
    rng_ ^= rng_ >> 17;
    rng_ ^= rng_ << 5;
    return (rng_ & 0xFFFFFF) / double(0x1000000);
}

void DropletFlame::configure(const Config& cfg) {
    c_ = cfg;
    rng_ = cfg.seed ? cfg.seed : 1u;
    s_ = State{};
    s_.dropletDMm = cfg.dropletD0Mm;
    s_.regime = Regime::Ignition;
    coolPhaseT_ = 0;
    // stochastic ignition delay ~ tens of ms, seeded
    s_.tSec = -0.02 - nextRandom() * 0.08;
}

double DropletFlame::burnRateK() const {
    // K grows with O₂ above LOC; reference ~0.5–0.8 mm²/s for heptane at 1 atm
    const double press = MaterialRisk::ignitionPressure(c_.material, c_.o2Pct);
    const double pScale = c_.pressureKpa / 101.0;
    return (0.45 + 0.55 * press) * std::min(pScale, 1.5);
}

void DropletFlame::transition(Regime r) {
    s_.regime = r;
    if (r == Regime::CoolFlame) coolPhaseT_ = 0;
}

void DropletFlame::step(double dtSec) {
    s_.tSec += dtSec;
    if (s_.tSec < 0) return; // still in ignition delay

    switch (s_.regime) {
    case Regime::Ignition:
        if (MaterialRisk::ignitionPressure(c_.material, c_.o2Pct) <= 0)
            transition(Regime::Extinction);
        else
            transition(Regime::HotFlame);
        break;

    case Regime::HotFlame: {
        const double K = burnRateK(); // mm²/s
        const double d2 = s_.dropletDMm * s_.dropletDMm - K * dtSec;
        s_.dropletDMm = d2 > 0 ? std::sqrt(d2) : 0;
        s_.burnFraction = 1.0 - (d2 > 0 ? d2 : 0) / (c_.dropletD0Mm * c_.dropletD0Mm);

        // spherical flame standoff: r_f/r_d ∝ oxidizer flux margin
        const double margin = std::max(0.0, c_.o2Pct - c_.material.locPct);
        const double standoff = 3.0 + 0.9 * margin; // ~3..22 typical µg ratios
        s_.flameRMm = 0.5 * s_.dropletDMm * standoff;

        const double press = MaterialRisk::ignitionPressure(c_.material, c_.o2Pct);
        s_.flameTempK = c_.ambientK + (T_FLAME_MAX - c_.ambientK) * press;
        s_.heatReleaseW = K * 40.0 * press; // scaled, W

        // extinction checks
        const bool lowO2 = c_.o2Pct < c_.material.locPct - 0.5;
        const bool fuelOut = s_.dropletDMm <= 0.02;
        if (lowO2 || fuelOut) {
            if (c_.material.coolFlameCapable && !fuelOut &&
                nextRandom() < 0.8) {
                // FLEX: hot flame out → cool-flame chemistry continues
                transition(Regime::CoolFlame);
            } else {
                transition(Regime::Extinguished);
            }
        }
        break;
    }

    case Regime::CoolFlame: {
        coolPhaseT_ += dtSec;
        // low heat release, flame collapses onto the droplet
        s_.flameRMm = std::max(0.0, s_.flameRMm - dtSec * s_.dropletDMm);
        s_.flameTempK = c_.ambientK + (T_COOL_FLAME - c_.ambientK) * 0.5;
        s_.heatReleaseW *= std::max(0.0, 1.0 - dtSec * 0.4);
        const double d2 = s_.dropletDMm * s_.dropletDMm - 0.05 * burnRateK() * dtSec;
        s_.dropletDMm = d2 > 0 ? std::sqrt(d2) : 0;
        // cool flames either fade or flash back to hot combustion
        if (coolPhaseT_ > 8.0 + nextRandom() * 6.0) {
            transition(Regime::Extinguished);
        } else if (c_.o2Pct > c_.material.locPct && nextRandom() < dtSec * 0.05) {
            transition(Regime::HotFlame);
        }
        break;
    }

    case Regime::Extinction:
        transition(Regime::Extinguished);
        break;

    case Regime::Extinguished:
        s_.flameTempK = std::max(c_.ambientK, s_.flameTempK - 60 * dtSec);
        s_.heatReleaseW = 0;
        break;
    }
}

} // namespace ff

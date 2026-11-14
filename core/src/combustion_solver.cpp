#include "combustion_solver.hpp"

#include <algorithm>
#include <cmath>

namespace ff {

namespace {
// adiabatic flame temperature envelope for hydrocarbon diffusion flames
constexpr double T_FLAME_MAX = 2300.0; // K
constexpr double T_COOL_FLAME = 800.0; // K — cool flames sit ~500–800 K
// stochastic cool→hot flashback rate, 1/s — FLEX cool flames can reignite
// within seconds once the atmosphere is restored above the LOC
constexpr double COOL_REIGNITION_RATE = 0.5;
} // namespace

double DropletFlame::nextRandom() {
    rng_ ^= rng_ << 13;
    rng_ ^= rng_ >> 17;
    rng_ ^= rng_ << 5;
    return (rng_ & 0xFFFFFF) / double(0x1000000);
}

void DropletFlame::configure(const Config& cfg) {
    c_ = cfg;
    // a non-positive diameter is a degenerate "no fuel" experiment — the
    // droplet starts at burnFraction 1.0 and extinguishes on the first step;
    // callers should never pass this, but clamping keeps the state sane
    c_.dropletD0Mm = std::max(0.0, cfg.dropletD0Mm);
    rng_ = cfg.seed ? cfg.seed : 1u;
    s_ = State{};
    s_.dropletDMm = c_.dropletD0Mm;
    s_.regime = Regime::Ignition;
    coolPhaseT_ = 0;
    // stochastic ignition delay ~ tens of ms, seeded
    s_.tSec = -0.02 - nextRandom() * 0.08;
}

void DropletFlame::updateAtmosphere(double o2Pct, double pressureKpa) {
    c_.o2Pct = std::clamp(o2Pct, 0.0, 100.0);
    c_.pressureKpa = std::max(0.0, pressureKpa);
}

// remaining droplet mass ∝ d³ (constant-density sphere), so the consumed
// fraction is 1 − (d/d0)³ — not the d² ratio the d²-law tracks
double DropletFlame::burnedFraction() const {
    if (c_.dropletD0Mm <= 0) return 1.0;
    const double r = std::clamp(s_.dropletDMm / c_.dropletD0Mm, 0.0, 1.0);
    return 1.0 - r * r * r;
}

double DropletFlame::burnRateK() const {
    const double pScale = std::min(c_.pressureKpa / 101.0, 1.5);
    // PSI-fitted rate wins: K(o2) = k0 + slope·o2 from measured kavg
    // (fit_risk_model.py). The pressure envelope applies on top.
    if (c_.material.burnRateK0Mm2s > 0.0 ||
        c_.material.burnRateKO2Mm2sPct > 0.0) {
        const double k = c_.material.burnRateK0Mm2s +
                         c_.material.burnRateKO2Mm2sPct * c_.o2Pct;
        return std::max(0.05, k) * pScale;
    }
    // K grows with O₂ above LOC; reference ~0.5–0.8 mm²/s for heptane at 1 atm
    const double press = MaterialRisk::ignitionPressure(c_.material, c_.o2Pct);
    return (0.45 + 0.55 * press) * pScale;
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
        s_.burnFraction = burnedFraction();

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
        // FLEX extinction is bounded on BOTH sides of the diameter axis:
        //  - radiative regime: a large droplet feeds a large flame whose
        //    radiative loss outruns heat feedback — the hot flame dies
        //    while most fuel remains (extinctionDHotMm);
        //  - terminal diameter: the hot flame dies when the droplet
        //    shrinks to the measured extinction size (extinctionDMinMm).
        // Cool-flame chemistry may take over from either boundary.
        const bool radiative = c_.material.extinctionDHotMm > 0.0 &&
                               s_.dropletDMm >= c_.material.extinctionDHotMm;
        const bool terminal = s_.dropletDMm <=
                              std::max(0.02, c_.material.extinctionDMinMm);
        if (lowO2 || fuelOut || radiative || terminal) {
            if (c_.material.coolFlameCapable && !fuelOut && !terminal &&
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
        s_.burnFraction = burnedFraction();
        // fuel exhaustion ends cool burning just like hot burning — a cool
        // flame cannot outlive its droplet; extinctionDMinMm is the
        // measured terminal diameter (cool flames die with fuel left);
        // otherwise it fades on a timer or flashes back to hot combustion
        // if O₂ is restored above the LOC
        const double coolFloor = std::max(0.02, c_.material.extinctionDMinMm);
        if (s_.dropletDMm <= coolFloor) {
            s_.flameRMm = 0;
            s_.heatReleaseW = 0;
            transition(Regime::Extinguished);
        } else if (coolPhaseT_ > 8.0 + nextRandom() * 6.0) {
            s_.heatReleaseW = 0;
            transition(Regime::Extinguished);
        } else if (c_.o2Pct > c_.material.locPct &&
                   nextRandom() < dtSec * COOL_REIGNITION_RATE) {
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

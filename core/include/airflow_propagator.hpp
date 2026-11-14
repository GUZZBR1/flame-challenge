#pragma once

#include "material_risk.hpp"

namespace ff {

/**
 * SAFFIRE/SoFIE-type flame spread over a solid fuel slab (reduced order).
 *
 * Three extinction regimes from the SoFIE campaign are reproduced:
 *  - oxygen-limit extinction at higher forced flow,
 *  - radiative extinction in the quiescent/low-flow regime,
 *  - blow-off/stretch extinction when opposed flow is strong enough that
 *    the shared ventilation curve drops under 0.5.
 * Spread rate scales with the margin above the material LOC, the shared
 * flowAnchors ventilation curve and pressure (~sqrt(p)).
 */
class SolidSpread {
  public:
    enum class Regime : int { Preheat = 0, Spreading = 1, Cooling = 2, Out = 3 };

    struct Config {
        double slabLengthCm = 30.0;
        double o2Pct = 21.0;
        double flowCms = 0.0;       // forced opposed flow, cm/s
        double pressureKpa = 101.0;
        bool partialGravity = false; // lunar/Martian correction
        Material material;
    };

    struct State {
        double tSec = 0;
        double frontPosCm = 0;      // pyrolysis front position along slab
        double spreadRateCms = 0;   // instantaneous, cm/s
        double burnLengthCm = 0;    // charred length behind the front
        double intensity = 0;       // 0..1 — maps to flame size in UI
        Regime regime = Regime::Preheat;
    };

    void configure(const Config& cfg);
    void step(double dtSec);
    const State& state() const { return s_; }

    /**
     * Update cabin atmosphere mid-run (O₂ level / opposed flow / pressure).
     * Preserves front position and regime — extinction and spread-rate
     * checks respond on the next step.
     */
    void updateAtmosphere(double o2Pct, double flowCms, double pressureKpa);

  private:
    Config c_;
    State s_;

    /** nominal spread rate at the current atmosphere, cm/s */
    double nominalRate() const;
    bool quiescentExtinct() const;
    bool oxygenLimitExtinct() const;
    bool blowOffExtinct() const;
};

} // namespace ff

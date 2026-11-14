#pragma once

#include "material_risk.hpp"

namespace ff {

/**
 * FLEX-type droplet combustion in microgravity (reduced order).
 *
 * Models:
 *  - d²-law: droplet diameter squared shrinks linearly in time,
 *    d²(t) = d0² − K·t, with K modulated by O₂ availability.
 *  - spherical diffusion flame standoff ratio r_f/r_d driven by the
 *    oxidizer-to-fuel flux ratio.
 *  - two-stage chemistry: fuels flagged coolFlameCapable enter a
 *    low-temperature "cool flame" regime after hot-flame extinction —
 *    near-invisible, low heat release, real re-ignition hazard.
 *  - extinction when the flame-zone O₂ drops below the material LOC.
 */
class DropletFlame {
  public:
    enum class Regime : int {
        Ignition = 0,
        HotFlame = 1,
        CoolFlame = 2,
        Extinction = 3,
        Extinguished = 4,
    };

    struct Config {
        double dropletD0Mm = 1.0;   // initial droplet diameter, mm
        double o2Pct = 21.0;        // ambient O₂, %
        double pressureKpa = 101.0;
        double ambientK = 298.0;
        Material material;
        unsigned int seed = 1u;
    };

    struct State {
        double tSec = 0;
        double dropletDMm = 0;
        double flameRMm = 0;        // spherical flame radius
        double flameTempK = 0;
        double heatReleaseW = 0;
        Regime regime = Regime::Ignition;
        double burnFraction = 0;    // 0..1 of initial fuel mass
    };

    void configure(const Config& cfg);
    void step(double dtSec);
    const State& state() const { return s_; }

    /** burning-rate constant, mm²/s — exposed for validation vs PSI data */
    double burnRateK() const;

  private:
    Config c_;
    State s_;
    double coolPhaseT_ = 0;
    unsigned int rng_ = 1u;

    double nextRandom();           // xorshift32, deterministic
    void transition(Regime r);
};

} // namespace ff

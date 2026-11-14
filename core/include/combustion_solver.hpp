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
 *  - radiative extinction: droplets at/above the measured
 *    extinctionDHotMm lose the hot flame (FLEX large-droplet regime);
 *    all combustion dies at the measured terminal extinctionDMinMm.
 *  - extinction when the flame-zone O₂ drops below the material LOC.
 *  - burning rate K(o2) = k0 + slope·o2 fitted per fuel from measured
 *    PSI kavg (burnRateK0Mm2s / burnRateKO2Mm2sPct); falls back to the
 *    ignition-pressure-derived rate when no fit exists.
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

    /**
     * Update the surrounding atmosphere mid-run (cabin airflow restored,
     * O₂ depleted by a neighbouring fire, ...). Preserves fuel, regime and
     * elapsed state — unlike configure(), which starts a fresh experiment.
     * Makes cool-flame re-ignition reachable: raising O₂ back above the
     * material LOC allows the stochastic flashback to hot combustion.
     */
    void updateAtmosphere(double o2Pct, double pressureKpa);

    /** burning-rate constant, mm²/s — exposed for validation vs PSI data */
    double burnRateK() const;

  private:
    Config c_;
    State s_;
    double coolPhaseT_ = 0;
    unsigned int rng_ = 1u;

    double nextRandom();           // xorshift32, deterministic
    void transition(Regime r);
    /** consumed fuel mass fraction 0..1 — spherical droplet mass ∝ d³ */
    double burnedFraction() const;
};

} // namespace ff
